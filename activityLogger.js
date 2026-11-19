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
 * 將值截斷至安全長度；非字串值維持原樣。
 *
 * @param {*} value - 原始值
 * @returns {*} 截斷後的值
 */
function truncateField_(value) {
  if (typeof value !== "string") return value;
  return value.length > MAX_FIELD_LENGTH ? value.slice(0, MAX_FIELD_LENGTH) : value;
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
  if (Array.isArray(record)) {
    return record.slice(0, ACTIVITY_LOG_FIELDS.length).map(truncateField_);
  }
  const source = record || {};
  return ACTIVITY_LOG_FIELDS.map(function (field) {
    if (SENSITIVE_RECORD_KEYS.indexOf(field) !== -1) return "";
    const value = source[field];
    const safeValue = value === null || value === undefined ? "" : value;
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
    return true;
  } catch (error) {
    console.error("寫入操作日誌失敗：", error && error.message ? error.message : error);
    return false;
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    ACTIVITY_LOG_FIELDS: ACTIVITY_LOG_FIELDS,
    MAX_FIELD_LENGTH: MAX_FIELD_LENGTH,
    SENSITIVE_RECORD_KEYS: SENSITIVE_RECORD_KEYS,
    appendActivityLog: appendActivityLog_,
    appendActivityLog_: appendActivityLog_,
    buildActivityLogRow: buildActivityLogRow_
  };
}
