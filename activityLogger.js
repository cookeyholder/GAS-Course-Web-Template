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

/** 寫入失敗時使用的安全寬限值（日誌失敗不得中斷請求） */
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
 * 將日誌紀錄轉換為試算表列。
 * 接受完整 12 欄物件；缺少欄位時補上空字串。
 *
 * @param {Object|Array} record - 日誌紀錄
 * @returns {Array} 12 欄資料列
 */
function buildActivityLogRow_(record) {
  if (Array.isArray(record)) return record.slice(0, ACTIVITY_LOG_FIELDS.length);
  const source = record || {};
  return ACTIVITY_LOG_FIELDS.map(function (field) {
    const value = source[field];
    return value === null || value === undefined ? "" : value;
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
    appendActivityLog: appendActivityLog_,
    appendActivityLog_: appendActivityLog_,
    buildActivityLogRow: buildActivityLogRow_
  };
}
