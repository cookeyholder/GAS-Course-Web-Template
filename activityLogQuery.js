"use strict";

/**
 * @file activityLogQuery.js
 * @description 操作日誌查詢模組（task 4.1）
 *
 * 封裝日期驗證、工作表掃描、排序、分頁與暫存 `_rowIndex` 移除邏輯。
 * 所有對外相依（webApiError、角色顯示名稱、工作表名稱、試算表取得）皆由
 * 呼叫端注入，使本模組可單獨載入與測試，且對 GAS 全域命名空間無依賴。
 *
 * GAS 環境下掛載為全域 `activityLogQuery`，Node.js 下由 module.exports 匯出。
 */

/** 操作日誌查詢預設值與上限 */
const ACTIVITY_LOG_DEFAULT_DAYS = 7;
const ACTIVITY_LOG_PAGE_SIZE_DEFAULT = 50;
const ACTIVITY_LOG_PAGE_SIZE_MAX = 500;
/** 單次查詢最多往前掃描的資料列數；超過上限回傳 truncated: true */
const ACTIVITY_LOG_MAX_SCAN_ROWS = 5000;
/** 每批往前讀取的列數 */
const ACTIVITY_LOG_SCAN_BATCH_SIZE = 500;

/**
 * 以 Asia/Taipei 時區格式化日期；GAS 使用 Utilities，Node 測試採固定 +8 偏移。
 *
 * @param {Date} date - 日期物件
 * @returns {string} yyyy-MM-dd
 */
function formatTaipeiDate(date) {
  if (typeof Utilities !== "undefined" && Utilities.formatDate) {
    return Utilities.formatDate(date, "Asia/Taipei", "yyyy-MM-dd");
  }
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * 將操作日誌時間戳記正規化為 `yyyy-MM-dd HH:mm:ss` 字串。
 * 試算表可能把日期字串隱含轉為 `Date` 物件，讀取端須先正規化才能正確比較與排序。
 *
 * @param {*} value - 原始時間戳記儲存格值
 * @returns {string} 正規化後的時間戳記字串；非日期值一律轉字串
 */
function normalizeActivityLogTimestamp(value) {
  if (!(value instanceof Date)) {
    return String(value === null || value === undefined ? "" : value);
  }
  const time = value.getTime();
  if (!isFinite(time)) return "";
  if (typeof Utilities !== "undefined" && Utilities.formatDate) {
    return Utilities.formatDate(value, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
  }
  // Node 測試環境無 Utilities：以固定 +8 小時偏移格式化，不依賴機器時區
  const taipei = new Date(time + 8 * 60 * 60 * 1000);
  return taipei.toISOString().replace("T", " ").slice(0, 19);
}

/**
 * 驗證日期字串是否為真實存在的 yyyy-MM-dd 日期。
 * 以 UTC 解析後比對回原字串，避免 2026-13-40 等溢位日期被接受。
 *
 * @param {string} dateStr - 日期字串
 * @returns {boolean} 是否為有效日期
 */
function isValidActivityLogDate(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const parsed = new Date(dateStr + "T00:00:00Z");
  if (isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== dateStr) return false;
  const year = parseInt(dateStr.slice(0, 4), 10);
  return year >= 1970 && year <= 2100;
}

/**
 * 建立查詢模組實例，注入對外相依。
 *
 * @param {Object} deps - 相依
 * @param {Function} deps.webApiError - 產生錯誤回應的函式
 * @param {string} deps.adminRoleName - 系統管理員顯示名稱
 * @param {string} deps.sheetName - 操作日誌工作表名稱
 * @param {Function} deps.getSpreadsheet - 取得試算表的函式
 * @param {Object} deps.fieldIndex - 欄位名稱至零基索引對應（由 gasRuntime 單一來源注入）
 * @returns {Object} 查詢 API
 */
function createActivityLogQuery(deps) {
  const config = deps || {};
  const webApiError = config.webApiError;
  const adminRoleName = config.adminRoleName || "";
  const sheetName = config.sheetName || "";
  const getSpreadsheet = config.getSpreadsheet;
  const fieldIndex = config.fieldIndex || {};

  /**
   * 解析操作日誌查詢的時間區間，預設最近 7 天（含端點）。
   * 使用者提供的日期若格式或實際日期無效、或起訖顛倒，回傳明確錯誤，不回退預設值。
   *
   * @param {Object} payload - 請求 payload
   * @returns {Object} `{ startDate, endDate, start, end }` 或 webApiError 物件
   */
  function resolveActivityLogDateRange(payload) {
    const source = payload || {};
    const now = new Date();
    const rawEnd = source.endDate === undefined || source.endDate === null ? "" : String(source.endDate).trim();
    const rawStart = source.startDate === undefined || source.startDate === null ? "" : String(source.startDate).trim();

    let endDate;
    if (rawEnd === "") {
      endDate = formatTaipeiDate(now);
    } else {
      const candidate = rawEnd.slice(0, 10);
      if (!isValidActivityLogDate(candidate)) {
        return webApiError("invalid_date_range", "日期格式不正確或日期區間無效");
      }
      endDate = candidate;
    }

    let startDate;
    if (rawStart === "") {
      startDate = formatTaipeiDate(new Date(now.getTime() - (ACTIVITY_LOG_DEFAULT_DAYS - 1) * 24 * 60 * 60 * 1000));
    } else {
      const candidate = rawStart.slice(0, 10);
      if (!isValidActivityLogDate(candidate)) {
        return webApiError("invalid_date_range", "日期格式不正確或日期區間無效");
      }
      startDate = candidate;
    }

    if (startDate > endDate) {
      return webApiError("invalid_date_range", "日期格式不正確或日期區間無效");
    }

    return {
      startDate: startDate,
      endDate: endDate,
      start: startDate + " 00:00:00",
      end: endDate + " 23:59:59"
    };
  }

  function buildEmptyActivityLogResult(range, page, pageSize) {
    return {
      ok: true,
      rows: [],
      total: 0,
      page: page,
      pageSize: pageSize,
      startDate: range.startDate,
      endDate: range.endDate
    };
  }

  function normalizeActivityLogDuration(rawDuration) {
    if (rawDuration === "" || rawDuration === null || rawDuration === undefined) return null;
    const parsedDuration = Number(rawDuration);
    return isFinite(parsedDuration) ? parsedDuration : null;
  }

  function cellAt(cells, field) {
    return cells[fieldIndex[field]];
  }

  function buildActivityLogRowItem(cells, rowIndex) {
    return {
      _rowIndex: rowIndex,
      timestamp: normalizeActivityLogTimestamp(cellAt(cells, "timestamp")),
      requestId: String(cellAt(cells, "requestId") || ""),
      category: String(cellAt(cells, "category") || ""),
      action: String(cellAt(cells, "action") || ""),
      result: String(cellAt(cells, "result") || ""),
      email: String(cellAt(cells, "email") || ""),
      name: String(cellAt(cells, "name") || ""),
      role: String(cellAt(cells, "role") || ""),
      summary: String(cellAt(cells, "summary") || ""),
      detail: String(cellAt(cells, "detail") || ""),
      durationMs: normalizeActivityLogDuration(cellAt(cells, "durationMs")),
      errorCode: String(cellAt(cells, "errorCode") || "")
    };
  }

  function matchActivityLogRow(item, range, filters, state) {
    if (item.timestamp < range.start) {
      state.crossedRangeStart = true;
      return false;
    }
    if (item.timestamp > range.end) return false;
    if (filters.categoryFilter && item.category.toLowerCase() !== filters.categoryFilter) return false;
    if (filters.emailFilter && item.email.toLowerCase().indexOf(filters.emailFilter) === -1) return false;
    return true;
  }

  function collectActivityLogMatches(sheet, lastRow, range, filters) {
    const dataRowCount = lastRow - 1;
    const maxScanRows = Math.min(dataRowCount, ACTIVITY_LOG_MAX_SCAN_ROWS);
    const state = {
      scannedRows: 0,
      cursor: lastRow,
      crossedRangeStart: false,
      readAfterCross: false,
      matched: []
    };

    while (state.cursor >= 2 && state.scannedRows < maxScanRows && !(state.crossedRangeStart && state.readAfterCross)) {
      const batchSize = Math.min(ACTIVITY_LOG_SCAN_BATCH_SIZE, state.cursor - 1, maxScanRows - state.scannedRows);
      const batchStart = state.cursor - batchSize + 1;
      const values = sheet.getRange(batchStart, 1, batchSize, 12).getValues() || [];
      state.scannedRows += batchSize;
      state.cursor = batchStart - 1;
      if (state.crossedRangeStart) state.readAfterCross = true;

      for (let i = values.length - 1; i >= 0; i -= 1) {
        const cells = Array.isArray(values[i]) ? values[i] : [];
        const item = buildActivityLogRowItem(cells, batchStart + i);
        if (matchActivityLogRow(item, range, filters, state)) {
          state.matched.push(item);
        }
      }
    }

    return { matched: state.matched, scannedRows: state.scannedRows, dataRowCount: dataRowCount };
  }

  /**
   * 受保護 action：getActivityLog（僅管理員）。
   * 回傳依時間遞減排序的分頁日誌，單次最多 500 筆。
   */
  function handleGetActivityLog(payload, session, ss) {
    if (!session || session.role !== "admin") {
      return webApiError("forbidden", "僅" + adminRoleName + "可查閱操作日誌");
    }
    const source = payload || {};
    const range = resolveActivityLogDateRange(source);
    if (range && range.ok === false) return range;
    const page = Math.max(1, parseInt(source.page, 10) || 1);
    const pageSize = Math.min(
      ACTIVITY_LOG_PAGE_SIZE_MAX,
      Math.max(1, parseInt(source.pageSize, 10) || ACTIVITY_LOG_PAGE_SIZE_DEFAULT)
    );
    const emptyResult = buildEmptyActivityLogResult(range, page, pageSize);
    const targetSs = ss || getSpreadsheet();
    const sheet = targetSs && typeof targetSs.getSheetByName === "function" ? targetSs.getSheetByName(sheetName) : null;
    if (!sheet || typeof sheet.getLastRow !== "function" || typeof sheet.getRange !== "function") {
      return emptyResult;
    }
    const lastRow = Math.max(0, Number(sheet.getLastRow()) || 0);
    if (lastRow < 2) return emptyResult;

    const filters = {
      emailFilter: String(source.email || "")
        .trim()
        .toLowerCase(),
      categoryFilter: String(source.category || "")
        .trim()
        .toLowerCase()
    };
    const collected = collectActivityLogMatches(sheet, lastRow, range, filters);
    const matched = collected.matched;

    matched.sort(function (a, b) {
      if (a.timestamp < b.timestamp) return 1;
      if (a.timestamp > b.timestamp) return -1;
      // 同時間戳記維持原始列順序（較早列在前），與既有穩定排序行為一致
      return a._rowIndex - b._rowIndex;
    });
    const rows = matched.slice((page - 1) * pageSize, page * pageSize).map(function (row) {
      const copy = Object.assign({}, row);
      delete copy._rowIndex;
      return copy;
    });

    const truncated =
      collected.scannedRows >= ACTIVITY_LOG_MAX_SCAN_ROWS && collected.dataRowCount > ACTIVITY_LOG_MAX_SCAN_ROWS;
    const result = {
      ok: true,
      rows: rows,
      total: matched.length,
      page: page,
      pageSize: pageSize,
      startDate: range.startDate,
      endDate: range.endDate
    };
    if (truncated) result.truncated = true;
    return result;
  }

  return {
    handleGetActivityLog: handleGetActivityLog,
    resolveActivityLogDateRange: resolveActivityLogDateRange,
    formatTaipeiDate: formatTaipeiDate,
    normalizeActivityLogTimestamp: normalizeActivityLogTimestamp
  };
}

const ACTIVITY_LOG_QUERY_API = {
  createActivityLogQuery: createActivityLogQuery,
  formatTaipeiDate: formatTaipeiDate,
  normalizeActivityLogTimestamp: normalizeActivityLogTimestamp,
  ACTIVITY_LOG_DEFAULT_DAYS: ACTIVITY_LOG_DEFAULT_DAYS,
  ACTIVITY_LOG_PAGE_SIZE_DEFAULT: ACTIVITY_LOG_PAGE_SIZE_DEFAULT,
  ACTIVITY_LOG_PAGE_SIZE_MAX: ACTIVITY_LOG_PAGE_SIZE_MAX,
  ACTIVITY_LOG_MAX_SCAN_ROWS: ACTIVITY_LOG_MAX_SCAN_ROWS,
  ACTIVITY_LOG_SCAN_BATCH_SIZE: ACTIVITY_LOG_SCAN_BATCH_SIZE
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ACTIVITY_LOG_QUERY_API;
}
if (typeof globalThis !== "undefined") {
  globalThis.activityLogQuery = ACTIVITY_LOG_QUERY_API;
  globalThis.MEA = globalThis.MEA || {};
  globalThis.MEA.activityLogQuery = ACTIVITY_LOG_QUERY_API;
}
