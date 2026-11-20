"use strict";

/**
 * @file activityLogger.js
 * @description 操作日誌寫入模組。
 *
 * 負責將攔截器產生的日誌紀錄附加至操作日誌工作表。
 * 寫入失敗僅記錄錯誤，不影響原本 Web API 的回應。
 */

const GAS_RUNTIME =
  typeof globalThis !== "undefined" && globalThis.gasRuntime
    ? globalThis.gasRuntime
    : typeof require === "function"
      ? require("./gasRuntime.js")
      : null;

/** 日誌欄位順序，與 gasRuntime.ACTIVITY_LOG_HEADERS 一一對應（單一來源見 gasRuntime） */
const ACTIVITY_LOG_FIELDS = GAS_RUNTIME.ACTIVITY_LOG_FIELDS;

/** 超過此資料列數即觸發清理，清理後保留目標列數（不含標題列） */
const MAX_ACTIVITY_LOG_ROWS = 20000;
const TARGET_ACTIVITY_LOG_ROWS = 15000;

/** 單一欄位寫入上限（字元數），避免惡意超長內容撐爆工作表 */
const MAX_FIELD_LENGTH = 500;

/** 需要截斷的字串欄位（詳情 JSON 由產生器控制，不在此限制） */
const TRUNCATED_FIELDS = [
  "timestamp",
  "requestId",
  "category",
  "action",
  "result",
  "email",
  "name",
  "role",
  "summary",
  "errorCode"
];

/** 解析工作表名稱，優先使用 gasRuntime 單一來源。 */
function resolveSheetName_() {
  if (GAS_RUNTIME && typeof GAS_RUNTIME.resolveDependency_ === "function") {
    return GAS_RUNTIME.resolveDependency_("SHEET_ACTIVITY_LOG", "./gasRuntime.js", "操作日誌");
  }
  return "操作日誌";
}

/**
 * 解析試算表物件：明確傳入 > SpreadsheetApp > null。
 *
 * @param {*} ss - 明確指定的試算表物件
 * @returns {*} 試算表實例或 null
 */
function resolveSpreadsheet_(ss) {
  return GAS_RUNTIME.getActiveSpreadsheetSafe_({ spreadsheet: ss });
}

/**
 * 將值截斷至安全長度；物件與陣列折疊為佔位文字，避免巢狀敏感資料外洩。
 *
 * @param {*} value - 原始值
 * @returns {*} 截斷後的值
 */
function truncateField_(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") {
    return value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH) : value;
  }
  if (typeof value === "object") {
    return Array.isArray(value) ? "[陣列，共 " + value.length + " 項]" : "[物件]";
  }
  return value;
}

/** 詳情欄降級失敗時使用的最小合法 JSON（單一來源見 gasRuntime） */
const MINIMAL_DETAIL_JSON = GAS_RUNTIME.MINIMAL_ACTIVITY_DETAIL_JSON;

/**
 * 解析共用的詳情降級函式（GAS 全域命名空間優先，Node 再 require）。
 *
 * @returns {Function|null} 降級函式或 null
 */
function resolveDetailTruncator_() {
  if (
    typeof globalThis !== "undefined" &&
    globalThis.activityLogBuilders &&
    typeof globalThis.activityLogBuilders.truncateDetailToLimit === "function"
  ) {
    return globalThis.activityLogBuilders.truncateDetailToLimit;
  }
  if (typeof require === "function") {
    try {
      const builders = require("./activityLogBuilders.js");
      if (builders && typeof builders.truncateDetailToLimit === "function") {
        return builders.truncateDetailToLimit;
      }
    } catch (error) {
      // 無法載入時改走最小合法 JSON 防線
    }
  }
  return null;
}

/**
 * 詳情欄最後防線：呼叫共用降級函式，嚴禁直接 slice 造成不可解析 JSON。
 *
 * @param {*} value - 原始詳情值
 * @returns {string} 可解析且長度合規的 JSON 字串
 */
function normalizeDetailField_(value) {
  if (value === null || value === undefined || value === "") return "";
  const raw = String(value);
  const truncator = resolveDetailTruncator_();
  if (truncator) return truncator(raw);
  if (raw.length > MAX_FIELD_LENGTH) return MINIMAL_DETAIL_JSON;
  try {
    JSON.parse(raw);
    return raw;
  } catch (error) {
    return MINIMAL_DETAIL_JSON;
  }
}

/**
 * 將日誌紀錄轉換為試算表列。
 * 接受完整 12 欄物件；缺少欄位時補上空字串。
 * 僅讀取 ACTIVITY_LOG_FIELDS 白名單欄位，故未列名的敏感資料不會寫入。
 *
 * @param {Object|Array} record - 日誌紀錄
 * @returns {Array} 12 欄資料列
 */
function buildActivityLogRow_(record) {
  const detailIndex = ACTIVITY_LOG_FIELDS.indexOf("detail");
  if (Array.isArray(record)) {
    return record.slice(0, ACTIVITY_LOG_FIELDS.length).map(function (value, index) {
      const safeValue = value === null || value === undefined ? "" : value;
      return index === detailIndex ? normalizeDetailField_(safeValue) : truncateField_(safeValue);
    });
  }
  const source = record || {};
  return ACTIVITY_LOG_FIELDS.map(function (field, index) {
    const value = source[field];
    const safeValue = value === null || value === undefined ? "" : value;
    if (index === detailIndex) return normalizeDetailField_(safeValue);
    return TRUNCATED_FIELDS.indexOf(field) !== -1 ? truncateField_(safeValue) : safeValue;
  });
}

/**
 * 附加一列操作日誌。
 *
 * @param {Object|Array} record - 日誌紀錄
 * @param {*} [ss] - 明確指定的試算表物件
 * @param {Object} [deps] - 保留的相依參數（當前寫入路徑直接使用試算表）
 * @returns {boolean} 是否成功寫入
 */
function appendActivityLog_(record, ss, deps) {
  try {
    const spreadsheet = resolveSpreadsheet_(ss);
    if (!spreadsheet || typeof spreadsheet.getSheetByName !== "function") return false;
    const sheet = spreadsheet.getSheetByName(resolveSheetName_());
    if (!sheet || typeof sheet.appendRow !== "function") return false;
    sheet.appendRow(buildActivityLogRow_(record));
    return true;
  } catch (error) {
    console.error("寫入操作日誌失敗：", error && error.message ? error.message : error);
    return false;
  }
}

/**
 * 清理過舊的操作日誌，保留最新的 TARGET_ACTIVITY_LOG_ROWS 筆資料。
 * 供每日離峰觸發器呼叫；可注入 spreadsheet 以便 Node 測試。
 *
 * @param {Object} [options] - 選項
 * @param {*} [options.spreadsheet] - 明確指定的試算表
 * @returns {Object} `{ ok, before, after, deleted }`
 */
function cleanupActivityLogRows(options) {
  const opts = options || {};
  try {
    const spreadsheet = resolveSpreadsheet_(opts.spreadsheet);
    if (!spreadsheet || typeof spreadsheet.getSheetByName !== "function") {
      return { ok: false, before: 0, after: 0, deleted: 0 };
    }
    const sheet = spreadsheet.getSheetByName(resolveSheetName_());
    if (!sheet || typeof sheet.getLastRow !== "function") {
      return { ok: false, before: 0, after: 0, deleted: 0 };
    }
    const lastRow = Math.max(0, Number(sheet.getLastRow()) || 0);
    const dataRows = Math.max(0, lastRow - 1);
    if (dataRows <= MAX_ACTIVITY_LOG_ROWS) {
      return { ok: true, before: dataRows, after: dataRows, deleted: 0 };
    }
    if (typeof sheet.deleteRows !== "function") {
      return { ok: false, before: dataRows, after: dataRows, deleted: 0 };
    }
    const deleted = dataRows - TARGET_ACTIVITY_LOG_ROWS;
    sheet.deleteRows(2, deleted);
    return {
      ok: true,
      before: dataRows,
      after: TARGET_ACTIVITY_LOG_ROWS,
      deleted: deleted
    };
  } catch (error) {
    console.error("清理操作日誌失敗：", error && error.message ? error.message : error);
    return { ok: false, before: 0, after: 0, deleted: 0 };
  }
}

/**
 * 確保每日 03:00（Asia/Taipei）的操作日誌清理觸發器存在。
 * 先比對既有觸發器的處理函式名稱，避免重複安裝。
 *
 * @param {Object} [options] - 選項
 * @param {*} [options.scriptApp] - 明確指定的 ScriptApp（供 Node 測試注入）
 * @returns {Object} `{ ok, created, reason }`
 */
function ensureActivityLogCleanupTrigger_(options) {
  const opts = options || {};
  const scriptApp = opts.scriptApp || (typeof ScriptApp !== "undefined" ? ScriptApp : null);
  if (!scriptApp || typeof scriptApp.newTrigger !== "function") {
    return { ok: false, created: false, reason: "unavailable" };
  }
  const handlerName = "cleanupActivityLogRows";
  if (typeof scriptApp.getProjectTriggers === "function") {
    const triggers = scriptApp.getProjectTriggers() || [];
    const exists = triggers.some(function (trigger) {
      if (!trigger) return false;
      if (typeof trigger.getHandlerFunction === "function") {
        return trigger.getHandlerFunction() === handlerName;
      }
      return trigger.handlerFunction === handlerName;
    });
    if (exists) return { ok: true, created: false, reason: "exists" };
  }
  try {
    scriptApp.newTrigger(handlerName).timeBased().atHour(3).everyDays(1).create();
    return { ok: true, created: true, reason: "created" };
  } catch (error) {
    console.error("建立操作日誌清理觸發器失敗：", error && error.message ? error.message : error);
    return { ok: false, created: false, reason: "error" };
  }
}

const ACTIVITY_LOGGER_API = {
  ACTIVITY_LOG_FIELDS: ACTIVITY_LOG_FIELDS,
  MAX_ACTIVITY_LOG_ROWS: MAX_ACTIVITY_LOG_ROWS,
  TARGET_ACTIVITY_LOG_ROWS: TARGET_ACTIVITY_LOG_ROWS,
  MAX_FIELD_LENGTH: MAX_FIELD_LENGTH,
  appendActivityLog: appendActivityLog_,
  appendActivityLog_: appendActivityLog_,
  buildActivityLogRow: buildActivityLogRow_,
  cleanupActivityLogRows: cleanupActivityLogRows,
  ensureActivityLogCleanupTrigger: ensureActivityLogCleanupTrigger_,
  ensureActivityLogCleanupTrigger_: ensureActivityLogCleanupTrigger_
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ACTIVITY_LOGGER_API;
}
if (typeof globalThis !== "undefined") {
  globalThis.activityLogger = ACTIVITY_LOGGER_API;
  globalThis.MEA = globalThis.MEA || {};
  globalThis.MEA.activityLogger = ACTIVITY_LOGGER_API;
}
