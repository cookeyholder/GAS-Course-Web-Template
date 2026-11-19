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

/** 日誌欄位順序，必須與 databaseInitializer.ACTIVITY_LOG_HEADERS 一致 */
const ACTIVITY_LOG_FIELDS = [
  "timestamp",
  "requestId",
  "category",
  "action",
  "result",
  "email",
  "name",
  "role",
  "summary",
  "detail",
  "durationMs",
  "errorCode"
];

/** CacheService 鍵前綴（與其他快取資料區隔） */
const ACTIVITY_LOG_CACHE_PREFIX = "gas_tmpl_activitylog_";

/** 寫入次數與抽樣列數的快取鍵 */
const WRITE_COUNT_CACHE_KEY = ACTIVITY_LOG_CACHE_PREFIX + "write_count";
const SAMPLED_LAST_ROW_CACHE_KEY = ACTIVITY_LOG_CACHE_PREFIX + "last_row";

/** 每累計多少筆寫入才取樣一次 getLastRow()，降低試算表 API 呼叫 */
const LAST_ROW_SAMPLE_INTERVAL = 100;

/** 超過此資料列數即觸發清理，清理後保留目標列數（不含標題列） */
const MAX_ACTIVITY_LOG_ROWS = 20000;
const TARGET_ACTIVITY_LOG_ROWS = 15000;

/** Node 測試環境的記憶體快取備援（不實作 TTL，過期行為由注入的 fake cache 驗證） */
const ACTIVITY_LOG_MEMORY_STORE = {};
const ACTIVITY_LOG_MEMORY_CACHE = {
  get: function (key) {
    return ACTIVITY_LOG_MEMORY_STORE[key] || null;
  },
  put: function (key, value) {
    ACTIVITY_LOG_MEMORY_STORE[key] = String(value);
  }
};

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

/** 即使出現在紀錄物件中也不得寫入的敏感欄位 */
const SENSITIVE_RECORD_KEYS = [
  "token",
  "csrfToken",
  "idToken",
  "credential",
  "rows",
  "rawRows",
  "payload",
  "response",
  "resultPayload"
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
  if (GAS_RUNTIME && typeof GAS_RUNTIME.getActiveSpreadsheetSafe_ === "function") {
    return GAS_RUNTIME.getActiveSpreadsheetSafe_({ spreadsheet: ss });
  }
  if (ss) return ss;
  if (
    typeof SpreadsheetApp !== "undefined" &&
    SpreadsheetApp &&
    typeof SpreadsheetApp.getActiveSpreadsheet === "function"
  ) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
  return null;
}

/**
 * 取得寫入計數快取；GAS 用 CacheService，Node 測試可用 deps.cache 注入。
 *
 * @param {Object} [deps] - 相依注入
 * @returns {Object} 具 get/put 方法的快取物件
 */
function getActivityLogCache_(deps) {
  if (deps && deps.cache && typeof deps.cache.get === "function" && typeof deps.cache.put === "function") {
    return deps.cache;
  }
  if (typeof CacheService !== "undefined" && CacheService.getScriptCache) {
    return CacheService.getScriptCache();
  }
  return ACTIVITY_LOG_MEMORY_CACHE;
}

/**
 * 累計寫入次數，並每 100 次取樣一次工作表列數。
 *
 * @param {Object} sheet - 操作日誌工作表
 * @param {Object} [deps] - 相依注入
 * @returns {number} 目前計數
 */
function bumpWriteCount_(sheet, deps) {
  const cache = getActivityLogCache_(deps);
  let count = 0;
  try {
    count = parseInt(cache.get(WRITE_COUNT_CACHE_KEY), 10) || 0;
  } catch (error) {
    count = 0;
  }
  count += 1;
  try {
    cache.put(WRITE_COUNT_CACHE_KEY, String(count));
  } catch (error) {
    // 快取失敗不影響日誌寫入
  }
  if (count % LAST_ROW_SAMPLE_INTERVAL === 0 && typeof sheet.getLastRow === "function") {
    try {
      cache.put(SAMPLED_LAST_ROW_CACHE_KEY, String(sheet.getLastRow()));
    } catch (error) {
      // 取樣失敗不影響日誌寫入
    }
  }
  return count;
}

/**
 * 將值截斷至安全長度；非字串值維持原樣。
 *
 * @param {*} value - 原始值
 * @returns {*} 截斷後的值
 */
function truncateField_(value) {
  if (typeof value !== "string") return value;
  return value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH) : value;
}

/** 詳情欄降級失敗時使用的最小合法 JSON */
const MINIMAL_DETAIL_JSON = '{"版本":1,"動作":"","指標":{},"截斷":true}';

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
 * 僅讀取白名單欄位，故敏感欄位（token、原始 rows、回傳內容）不會寫入。
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
    if (SENSITIVE_RECORD_KEYS.indexOf(field) !== -1) return "";
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
 * @param {Object} [deps] - 皆可注入的相依（已預留供快取與清理使用）
 * @returns {boolean} 是否成功寫入
 */
function appendActivityLog_(record, ss, deps) {
  const options = deps || {};
  try {
    const spreadsheet = resolveSpreadsheet_(ss);
    if (!spreadsheet || typeof spreadsheet.getSheetByName !== "function") return false;
    const sheet = spreadsheet.getSheetByName(resolveSheetName_());
    if (!sheet || typeof sheet.appendRow !== "function") return false;
    sheet.appendRow(buildActivityLogRow_(record));
    bumpWriteCount_(sheet, options);
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
 * @param {Object} [options.cache] - 明確指定的快取（供取樣值更新）
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
    try {
      getActivityLogCache_(opts).put(SAMPLED_LAST_ROW_CACHE_KEY, String(lastRow - deleted));
    } catch (error) {
      // 快取更新失敗不影響清理結果
    }
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
  ACTIVITY_LOG_CACHE_PREFIX: ACTIVITY_LOG_CACHE_PREFIX,
  WRITE_COUNT_CACHE_KEY: WRITE_COUNT_CACHE_KEY,
  LAST_ROW_SAMPLE_INTERVAL: LAST_ROW_SAMPLE_INTERVAL,
  MAX_ACTIVITY_LOG_ROWS: MAX_ACTIVITY_LOG_ROWS,
  TARGET_ACTIVITY_LOG_ROWS: TARGET_ACTIVITY_LOG_ROWS,
  MAX_FIELD_LENGTH: MAX_FIELD_LENGTH,
  SENSITIVE_RECORD_KEYS: SENSITIVE_RECORD_KEYS,
  getActivityLogCache: getActivityLogCache_,
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
