/**
 * @file databaseInitializer.js
 * @description Google Apps Script 資料庫工作表初始化與設定管理模組
 *
 * 負責自動建立與格式化純資料工作表：
 * 1. 系統設定與授權 (SHEET_SYSTEM_CONFIG)
 * 2. 正規化課程代碼 (SHEET_COURSE_INDEX)
 * 3. 系統使用說明 (SHEET_SYSTEM_INSTRUCTIONS)
 */

const GAS_RUNTIME =
  typeof globalThis !== "undefined" && globalThis.gasRuntime
    ? globalThis.gasRuntime
    : typeof require === "function"
      ? require("./gasRuntime.js")
      : null;

// ============================================================================
// 工作表名稱常數
// ============================================================================

/** 工作表名稱統一由 gasRuntime 提供（單一來源） */
const SHEET_SYSTEM_CONFIG = GAS_RUNTIME.SHEET_SYSTEM_CONFIG;
const SHEET_COURSE_INDEX = GAS_RUNTIME.SHEET_COURSE_INDEX;
const LEGACY_SHEET_COURSE_INDEX = GAS_RUNTIME.LEGACY_SHEET_COURSE_INDEX;
const SHEET_SYSTEM_INSTRUCTIONS = GAS_RUNTIME.SHEET_SYSTEM_INSTRUCTIONS;
const SHEET_ACTIVITY_LOG = GAS_RUNTIME.SHEET_ACTIVITY_LOG;

/** 操作日誌工作表 12 欄表頭（順序為日誌寫入依據；單一來源見 gasRuntime） */
const ACTIVITY_LOG_HEADERS = GAS_RUNTIME.ACTIVITY_LOG_HEADERS;

// ============================================================================
// 預設參數與欄位定義
// ============================================================================

/** 預設系統參數（區塊 A，A1:B8） */
const DEFAULT_SYSTEM_PARAMS = [
  ["設定項目", "設定數值"],
  ["學年度", "114"],
  ["學期", "1"],
  ["系統名稱", "Google Apps Script 應用程式範本"],
  ["OAuth Client ID", ""],
  ["OAuth Client Secret", ""],
  ["登入白名單限制啟用", "false"],
  ["Google 登入允許網域", ""]
];

/** 授權白名單表頭（區塊 B，D1:G1） */
const WHITELIST_HEADERS = ["Email", "姓名/職稱", "角色", "啟用狀態"];

/** 授權角色定義與代碼統一由 gasRuntime 提供（單一來源） */
const ROLE_DEFINITIONS = GAS_RUNTIME.ROLE_DEFINITIONS;
const ROLE_CODES = GAS_RUNTIME.ROLE_CODES;

/** Node.js 單元測試用記憶體備援資料庫 */
const MEMORY_SYSTEM_CONFIG = {
  學年度: "114",
  學期: "1",
  系統名稱: "Google Apps Script 應用程式範本",
  "OAuth Client ID": "",
  "OAuth Client Secret": "",
  登入白名單限制啟用: "false",
  "Google 登入允許網域": ""
};
const MEMORY_WHITELIST = [];

/**
 * 將輸入值轉為小寫並去除前後空白（Email 與角色正規化共用）。
 *
 * @param {*} value - 原始值
 * @returns {string} 正規化後的字串
 */
function normalizeLowerTrim_(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

/** 角色名稱轉代碼對照（委派至 systemConfigCodec） */
function normalizeRole(role) {
  return getSystemConfigCodec_().normalizeRole(role);
}

/** 代碼轉角色名稱對照（委派至 systemConfigCodec） */
function getRoleDisplayName(role) {
  return getSystemConfigCodec_().getRoleDisplayName(role);
}

// ============================================================================
// 工作表初始化主函式
// ============================================================================

/**
 * 解析試算表實體，委派至 gasRuntime 安全解析（options.spreadsheet > SpreadsheetApp > null）。
 *
 * @private
 * @param {Object} [options] - 選項設定
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet|null} 試算表實體
 */
function resolveDbSpreadsheet_(options) {
  if (GAS_RUNTIME) return GAS_RUNTIME.getActiveSpreadsheetSafe_(options);
  const opts = options || {};
  return opts.spreadsheet || null;
}

/**
 * 取得 108 課綱 1NF 正規化 14 欄標準表頭陣列。
 *
 * @private
 * @returns {Array<string>} 14 欄表頭名稱陣列
 */
function getNormalizedCourseHeaders_() {
  if (GAS_RUNTIME) {
    return GAS_RUNTIME.resolveDependency_("NORMALIZED_COURSE_HEADERS", "./subjectCodeTransformer.js", []);
  }
  return [];
}

/**
 * 建立「系統設定與授權」工作表並寫入預設參數與白名單表頭。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} 建立後之工作表
 */
function createSystemConfigSheet_(ss) {
  const configSheet = ss.insertSheet(SHEET_SYSTEM_CONFIG);
  configSheet.getRange(1, 1, DEFAULT_SYSTEM_PARAMS.length, 2).setValues(DEFAULT_SYSTEM_PARAMS);
  configSheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#e2e8f0");
  configSheet.getRange(1, 4, 1, WHITELIST_HEADERS.length).setValues([WHITELIST_HEADERS]);
  configSheet.getRange(1, 4, 1, WHITELIST_HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
  configSheet.setFrozenRows(1);
  return configSheet;
}

/**
 * 檢核並修復「系統設定與授權」區塊 A（A:B 設定項目）：補齊缺漏之表頭與新設定項目。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @param {GoogleAppsScript.Spreadsheet.Sheet} configSheet - 工作表實體
 * @returns {void}
 */
function repairSystemConfigBlockA_(ss, configSheet) {
  if (configSheet.getRange(1, 1).getValue() !== DEFAULT_SYSTEM_PARAMS[0][0]) {
    configSheet.getRange(1, 1, 1, 2).setValues([DEFAULT_SYSTEM_PARAMS[0]]);
    configSheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#e2e8f0");
  }
  const existingParams = readSystemSettings(ss);
  const lastRow = configSheet.getLastRow();
  const toAppend = [];
  for (let i = 1; i < DEFAULT_SYSTEM_PARAMS.length; i++) {
    const key = DEFAULT_SYSTEM_PARAMS[i][0];
    if (typeof existingParams[key] === "undefined") {
      toAppend.push(DEFAULT_SYSTEM_PARAMS[i]);
    }
  }
  if (toAppend.length > 0) {
    configSheet.getRange(lastRow + 1, 1, toAppend.length, 2).setValues(toAppend);
  }
}

/**
 * 檢核並修復「系統設定與授權」區塊 B（D:G 授權白名單）：確保至少有 8 欄並補齊表頭。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Sheet} configSheet - 工作表實體
 * @returns {void}
 */
function repairSystemConfigBlockB_(configSheet) {
  if (configSheet.getMaxColumns() < 8) {
    configSheet.insertColumnsAfter(configSheet.getMaxColumns(), 8 - configSheet.getMaxColumns());
  }
  if (configSheet.getRange(1, 4).getValue() !== WHITELIST_HEADERS[0]) {
    configSheet.getRange(1, 4, 1, WHITELIST_HEADERS.length).setValues([WHITELIST_HEADERS]);
    configSheet.getRange(1, 4, 1, WHITELIST_HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
  }
}

/**
 * 確保「系統設定與授權」工作表存在並修復欄位缺漏。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @param {Array<string>} createdSheets - 追蹤新建工作表之陣列
 * @returns {void}
 */
function ensureSystemConfigSheet_(ss, createdSheets) {
  let configSheet = ss.getSheetByName(SHEET_SYSTEM_CONFIG);
  if (!configSheet) {
    createSystemConfigSheet_(ss);
    createdSheets.push(SHEET_SYSTEM_CONFIG);
    return;
  }
  repairSystemConfigBlockA_(ss, configSheet);
  repairSystemConfigBlockB_(configSheet);
}

/**
 * 建立「正規化課程代碼」工作表並寫入 14 欄表頭。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} 工作表實體
 */
function createCourseIndexSheet_(ss) {
  const courseSheet = ss.insertSheet(SHEET_COURSE_INDEX);
  const headers = getNormalizedCourseHeaders_();
  if (courseSheet.getMaxColumns() < headers.length) {
    courseSheet.insertColumnsAfter(courseSheet.getMaxColumns(), headers.length - courseSheet.getMaxColumns());
  }
  courseSheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  courseSheet.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e2e8f0");
  courseSheet.setFrozenRows(1);
  return courseSheet;
}

/**
 * 確保「正規化課程代碼」工作表存在；若為舊版名稱則自動更名遷移。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @param {Array<string>} createdSheets - 追蹤新建工作表之陣列
 * @returns {void}
 */
function ensureCourseIndexSheet_(ss, createdSheets) {
  if (ss.getSheetByName(SHEET_COURSE_INDEX)) return;
  const legacySheet = ss.getSheetByName(LEGACY_SHEET_COURSE_INDEX);
  if (legacySheet) {
    legacySheet.setName(SHEET_COURSE_INDEX);
    return;
  }
  createCourseIndexSheet_(ss);
  createdSheets.push(SHEET_COURSE_INDEX);
}

/**
 * 取得「系統使用說明」工作表內容文字二維陣列。純函式，無副作用。
 *
 * @private
 * @returns {Array<Array<string>>} 說明列陣列
 */
function getSystemInstructionRows_() {
  return [
    ["=== Google Apps Script 應用程式範本使用說明 ==="],
    [""],
    ["一、功能架構："],
    ["1. 系統設定與授權：包含系統運作基本參數（學年度、學期、OAuth Client ID）與使用者權限白名單。"],
    [
      "2. 正規化課程代碼：儲存自教育部課程計畫平臺下載之 108 課綱課程代碼，全數經 1NF 正規化後展開之 14 欄標準課程資料。"
    ],
    ["3. Google Identity Services (GIS) 登入：支援 Google One Tap、Google 登入按鈕與 Google Workspace 網域登入。"],
    [
      "4. 操作日誌：記錄各項 Web API 動作的時間、操作者、結果與變動明細，僅系統管理員可查閱；每日離峰時段自動清理過舊資料。"
    ],
    [""],
    ["二、OAuth 2.0 Client ID 設定步驟："],
    ["1. 前往 Google Cloud Console (https://console.cloud.google.com/) 建立或選取專案。"],
    ["2. 進入「API 和服務」->「憑證」，建立「OAuth 用戶端 ID」，應用程式類型選擇「網頁應用程式」。"],
    ["3. 於「已授權的 JavaScript 來源」填入 Web App 網址（例如：https://script.google.com）。"],
    ["4. 將取得的 Client ID 填入「系統設定與授權」工作表之 B5 儲存格（或於 Web App 設定介面輸入並儲存）。"],
    [""],
    ["三、角色權限（RBAC）："],
    ["- admin（系統管理員）：完整讀寫系統參數、管理使用者名單與課程代碼匯入。"],
    ["- staff（業務人員）：可匯入並檢視課程代碼。"],
    ["- viewer（檢視人員）：僅能檢視課程代碼與公開設定。"]
  ];
}

/**
 * 確保「系統使用說明」工作表存在並寫入說明文字。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @param {Array<string>} createdSheets - 追蹤新建工作表之陣列
 * @returns {void}
 */
function ensureInstructionsSheet_(ss, createdSheets) {
  if (ss.getSheetByName(SHEET_SYSTEM_INSTRUCTIONS)) return;
  const instructSheet = ss.insertSheet(SHEET_SYSTEM_INSTRUCTIONS);
  const instructions = getSystemInstructionRows_();
  instructSheet.getRange(1, 1, instructions.length, 1).setValues(instructions);
  instructSheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  createdSheets.push(SHEET_SYSTEM_INSTRUCTIONS);
}

/** 純文字格式期望覆蓋的資料列數；實際會再依工作表列數上限收斂，避免超出格線 */
const ACTIVITY_LOG_TEXT_FORMAT_ROWS = 5000;

/**
 * 計算可安全套用純文字格式的資料列數（自第 2 列起）。
 * 工作表提供 `getMaxRows` 時以「上限 - 1（保留標題列）」收斂；
 * 否則（例如部分測試替身）採用期望值。
 *
 * @param {Object} sheet - 操作日誌工作表
 * @returns {number} 可套用格式的資料列數
 */
function resolveActivityLogFormatRowCount_(sheet) {
  if (sheet && typeof sheet.getMaxRows === "function") {
    const maxRows = Number(sheet.getMaxRows());
    if (isFinite(maxRows) && maxRows > 1) {
      return Math.min(ACTIVITY_LOG_TEXT_FORMAT_ROWS, maxRows - 1);
    }
    if (isFinite(maxRows) && maxRows <= 1) return 0;
  }
  return ACTIVITY_LOG_TEXT_FORMAT_ROWS;
}

/**
 * 對操作日誌第 1 欄（時間戳記）與第 10 欄（詳情 JSON）套用純文字格式 `@`。
 * 僅調整格式、不讀寫任何資料，具冪等性；避免 `appendRow` 將日期字串轉為
 * `Date` 物件，或將 JSON 內容誤判為公式、數字。
 *
 * @param {Object} sheet - 操作日誌工作表
 * @returns {void}
 */
function applyActivityLogTextFormat_(sheet) {
  if (!sheet || typeof sheet.getRange !== "function") return;
  const rowCount = resolveActivityLogFormatRowCount_(sheet);
  if (rowCount <= 0) return;
  [1, 10].forEach(function (column) {
    const range = sheet.getRange(2, column, rowCount, 1);
    if (range && typeof range.setNumberFormat === "function") {
      range.setNumberFormat("@");
    }
  });
}

/**
 * 建立「操作日誌」工作表並設定 12 欄表頭與純文字儲存格格式。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} 工作表實體
 */
function createActivityLogSheet_(ss) {
  const sheet = ss.insertSheet(SHEET_ACTIVITY_LOG);
  const headerRange = sheet.getRange(1, 1, 1, ACTIVITY_LOG_HEADERS.length);
  headerRange.setValues([ACTIVITY_LOG_HEADERS]);
  headerRange.setFontWeight("bold").setBackground("#e2e8f0");
  sheet.setFrozenRows(1);
  // 時間戳記（第 1 欄）與詳情（第 10 欄）預先套用純文字格式
  applyActivityLogTextFormat_(sheet);
  return sheet;
}

/**
 * 確保「操作日誌」工作表存在；若已存在則檢查並套用純文字格式。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @param {Array<string>} createdSheets - 追蹤新建工作表之陣列
 * @returns {void}
 */
function ensureActivityLogSheet_(ss, createdSheets) {
  const existing = ss.getSheetByName(SHEET_ACTIVITY_LOG);
  if (existing) {
    // 既有工作表亦補上純文字格式；僅調整格式、不覆寫既有資料，維持冪等
    applyActivityLogTextFormat_(existing);
    return;
  }
  createActivityLogSheet_(ss);
  createdSheets.push(SHEET_ACTIVITY_LOG);
}

/**
 * 完整初始化／檢查所有後端工作表
 *
 * 具備安全冪等性：若工作表已存在，不會覆蓋既有設定與資料，僅補齊缺漏之結構與格式。
 *
 * @param {Object} [options] - 選項
 * @param {Spreadsheet} [options.spreadsheet] - 指定試算表（預設為目前試算表）
 * @param {boolean} [options.silent=false] - 是否靜默執行
 * @returns {Object} `{ ok: true, sheets: Array<string> }`
 */
function initializeDatabaseSheets(options) {
  const ss = resolveDbSpreadsheet_(options);
  if (!ss) {
    throw new Error("找不到有效的試算表物件");
  }

  const createdSheets = [];
  ensureSystemConfigSheet_(ss, createdSheets);
  ensureCourseIndexSheet_(ss, createdSheets);
  ensureInstructionsSheet_(ss, createdSheets);
  ensureActivityLogSheet_(ss, createdSheets);

  // 安裝每日清理觸發器；無 ScriptApp 時（例如 Node 測試）安全略過
  const ensureTrigger = GAS_RUNTIME.resolveDependency_("ensureActivityLogCleanupTrigger_", "./activityLogger.js", null);
  let cleanupTrigger = { ok: false, created: false, reason: "unavailable" };
  if (typeof ensureTrigger === "function") {
    try {
      cleanupTrigger = ensureTrigger({ scriptApp: options && options.scriptApp }) || cleanupTrigger;
    } catch (error) {
      console.error("安裝操作日誌清理觸發器失敗：", error && error.message ? error.message : error);
    }
  }

  return {
    ok: true,
    sheets: [SHEET_SYSTEM_CONFIG, SHEET_COURSE_INDEX, SHEET_SYSTEM_INSTRUCTIONS, SHEET_ACTIVITY_LOG],
    createdSheets: createdSheets,
    cleanupTrigger: cleanupTrigger
  };
}

// ============================================================================
// 系統設定讀寫
// ============================================================================

/**
 * 將系統設定布林旗標正規化為布林值（向後相容轉發至 systemConfigCodec）。
 *
 * @param {*} value - 設定值
 * @returns {boolean} 是否啟用
 */
function parseConfigBoolean(value) {
  return getSystemConfigCodec_().parseConfigBoolean(value);
}

/**
 * 取得純編解碼器模組（systemConfigCodec）。
 *
 * @private
 * @returns {Object} systemConfigCodec 模組物件
 */
function getSystemConfigCodec_() {
  return GAS_RUNTIME.resolveDependency_("systemConfigCodec", "./systemConfigCodec.js", null, null, true);
}

/**
 * 自記憶體快取讀取系統設定（Node 測試備援模式）。
 *
 * @private
 * @returns {Object} 雙軌鍵值標準設定物件
 */
function readSystemSettingsFromMemory_() {
  return getSystemConfigCodec_().normalizeSystemSettings(MEMORY_SYSTEM_CONFIG);
}

/**
 * 自「系統設定與授權」工作表讀取區塊 A（A:B）原始列陣列。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表實體
 * @returns {Array<Array<*>>} 原始二維列矩陣
 */
function readSystemSettingsRows_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  return sheet.getRange(1, 1, lastRow, 2).getValues();
}

/**
 * 自試算表實體讀取並解析系統設定。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @returns {Object} 雙軌鍵值標準設定物件
 */
function readSystemSettingsFromSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_SYSTEM_CONFIG);
  if (!sheet) return {};
  const rows = readSystemSettingsRows_(sheet);
  return getSystemConfigCodec_().parseSystemSettingsRows(rows);
}

/**
 * 讀取「系統設定與授權」區塊 A 之設定項目。
 * 若無試算表實體則自動退回記憶體儲存（In-Memory Fallback）。
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [ss] - 試算表物件
 * @returns {Object} 鍵值對設定物件（含中文原始鍵與駝峰便捷鍵）
 */
function readSystemSettings(ss) {
  const targetSs = resolveDbSpreadsheet_({ spreadsheet: ss });
  if (!targetSs) return readSystemSettingsFromMemory_();
  return readSystemSettingsFromSheet_(targetSs);
}

/**
 * 將系統設定更新寫入記憶體備援物件。
 *
 * @private
 * @param {Object} updates - 更新鍵值對
 * @returns {{ ok: true }}
 */
function saveSystemSettingsToMemory_(updates) {
  const codec = getSystemConfigCodec_();
  for (const k in updates) {
    const targetKey = codec.SYSTEM_SETTING_KEY_MAP[k] || k;
    MEMORY_SYSTEM_CONFIG[targetKey] = codec.normalizeSystemSettingValue(targetKey, updates[k]);
  }
  return { ok: true };
}

/**
 * 取得「系統設定與授權」工作表；若不存在則拋出例外。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @returns {GoogleAppsScript.Spreadsheet.Sheet} 工作表實體
 */
function getSystemConfigSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_SYSTEM_CONFIG);
  if (!sheet) throw new Error("找不到工作表：" + SHEET_SYSTEM_CONFIG);
  return sheet;
}

/**
 * 將系統設定更新合併並寫入「系統設定與授權」工作表 A:B 欄位。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @param {Object} updates - 更新鍵值對
 * @returns {{ ok: true }}
 */
function saveSystemSettingsToSheet_(ss, updates) {
  const sheet = getSystemConfigSheet_(ss);
  const lastRow = Math.max(sheet.getLastRow(), 30);
  const totalRows = lastRow - 1;
  const range = totalRows === 29 ? sheet.getRange("A2:B30") : sheet.getRange(2, 1, totalRows, 2);
  const codec = getSystemConfigCodec_();
  const existingValues = range.getValues();
  const mergedValues = codec.mergeSystemSettingsRows(existingValues, updates, { targetRowCount: totalRows });
  if (mergedValues.length > totalRows) {
    const baseRows = mergedValues.slice(0, totalRows);
    const extraRows = mergedValues.slice(totalRows);
    range.setValues(baseRows);
    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, extraRows.length, 2).setValues(extraRows);
  } else {
    range.setValues(mergedValues);
  }
  return { ok: true };
}

/**
 * 儲存系統設定。支援試算表儲存與無試算表時之記憶體備援。
 *
 * @param {Object} settings - 欲更新的設定物件（支援中英文鍵名）
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [ss] - 試算表物件
 * @returns {{ ok: true }} 儲存結果
 */
function saveSystemSettings(settings, ss) {
  const targetSs = GAS_RUNTIME.getActiveSpreadsheetSafe_({ spreadsheet: ss });
  const updates = Object.assign({}, settings);
  if (!targetSs) return saveSystemSettingsToMemory_(updates);
  return saveSystemSettingsToSheet_(targetSs, updates);
}

// ============================================================================
// 授權白名單讀寫
// ============================================================================

/**
 * 取得「系統設定與授權」工作表（供白名單區塊使用）。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @returns {GoogleAppsScript.Spreadsheet.Sheet|null} 工作表實體
 */
function getWhitelistSheet_(ss) {
  return ss.getSheetByName(SHEET_SYSTEM_CONFIG);
}

/**
 * 自工作表讀取 D2:G 白名單原始二維列矩陣。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表實體
 * @returns {Array<Array<*>>} 原始二維列陣列
 */
function readWhitelistRowsFromSheet_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 4, lastRow - 1, 4).getValues();
}

/**
 * 讀取授權白名單清單（區塊 B，D2:G）。
 *
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [ss] - 試算表物件
 * @returns {Array<Object>} 白名單帳號物件陣列
 */
function readWhitelist(ss) {
  const targetSs = resolveDbSpreadsheet_({ spreadsheet: ss });
  if (!targetSs) return MEMORY_WHITELIST.slice();
  const values = readWhitelistRowsFromSheet_(getWhitelistSheet_(targetSs));
  return getSystemConfigCodec_().parseWhitelistRows(values);
}

/**
 * 儲存授權白名單至記憶體備援陣列。
 *
 * @private
 * @param {Array<Object>} list - 帳號陣列
 * @returns {{ ok: true, count: number }} 儲存結果
 */
function saveWhitelistToMemory_(list) {
  MEMORY_WHITELIST.length = 0;
  const codec = getSystemConfigCodec_();
  for (let i = 0; i < list.length; i++) {
    const account = codec.normalizeWhitelistAccount(list[i]);
    if (account) MEMORY_WHITELIST.push(account);
  }
  return { ok: true, count: MEMORY_WHITELIST.length };
}

/**
 * 清除工作表既有之 D2:G 白名單內容。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表實體
 * @returns {void}
 */
function clearWhitelistSheetRange_(sheet) {
  const currentLastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 4, currentLastRow, 4).clearContent();
}

/**
 * 寫入白名單列至工作表，並執行公式跳脫防護（Formula Immunization）。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 工作表實體
 * @param {Array<Array<string>>} rows - 欲寫入之矩陣
 * @returns {void}
 */
function writeWhitelistSheetRows_(sheet, rows) {
  if (rows.length === 0) return;
  const safeRows = typeof sanitizeRowMatrix === "function" ? sanitizeRowMatrix(rows) : rows;
  sheet.getRange(2, 4, safeRows.length, 4).setValues(safeRows);
}

/**
 * 將帳號清單序列化並寫入工作表 D:G 欄位。
 *
 * @private
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @param {Array<Object>} list - 帳號清單
 * @returns {{ ok: true, count: number }}
 */
function saveWhitelistToSheet_(ss, list) {
  const sheet = getSystemConfigSheet_(ss);
  const rows = getSystemConfigCodec_().serializeWhitelistRows(list);
  clearWhitelistSheetRange_(sheet);
  writeWhitelistSheetRows_(sheet, rows);
  return { ok: true, count: rows.length };
}

/**
 * 儲存授權白名單清單
 *
 * @param {Array<Object>} accounts - 白名單帳號陣列
 * @param {Spreadsheet} [ss] - 試算表物件
 * @returns {Object} `{ ok: true, count }`
 */
function saveWhitelist(accounts, ss) {
  const targetSs = resolveDbSpreadsheet_({ spreadsheet: ss });
  const list = Array.isArray(accounts) ? accounts : [];
  if (!targetSs) return saveWhitelistToMemory_(list);
  return saveWhitelistToSheet_(targetSs, list);
}

/**
 * 於白名單清單中查詢指定 Email（委派至 systemConfigCodec）
 *
 * @param {Array<Object>} accounts - 帳號陣列
 * @param {string} email - 使用者 Email
 * @returns {Object|null}
 */
function findAccountInWhitelist(accounts, email) {
  return getSystemConfigCodec_().findAccountInWhitelist(accounts, email);
}

/**
 * 取得指定 Email 之角色權限
 *
 * @param {string} email - 使用者 Email
 * @param {Spreadsheet} [ss] - 試算表物件
 * @returns {Object} `{ role, name, enabled, found }`
 */
function getAccountRole(email, ss) {
  const cleanEmail = normalizeLowerTrim_(email);
  const accounts = readWhitelist(ss);
  const matched = findAccountInWhitelist(accounts, cleanEmail);

  if (matched) {
    return {
      role: matched.role,
      roleName: matched.roleName,
      name: matched.name,
      enabled: matched.enabled,
      found: true
    };
  }

  return {
    role: ROLE_CODES.VIEWER,
    roleName: ROLE_DEFINITIONS[ROLE_CODES.VIEWER],
    name: cleanEmail,
    enabled: true,
    found: false
  };
}

/**
 * 若白名單為空，自動將首位登入者初始化為管理員
 *
 * @param {string} email - 使用者 Email
 * @param {string} name - 使用者姓名
 * @param {Spreadsheet} [ss] - 試算表物件
 * @returns {boolean} 是否觸發管理員開通
 */
function bootstrapAdminIfNeeded(email, name, ss) {
  const cleanEmail = normalizeLowerTrim_(email);
  if (!cleanEmail) return false;

  const accounts = readWhitelist(ss);
  if (accounts.length === 0) {
    saveWhitelist(
      [
        {
          email: cleanEmail,
          name: name || cleanEmail,
          role: ROLE_CODES.ADMIN,
          enabled: true
        }
      ],
      ss
    );
    return true;
  }
  return false;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SHEET_SYSTEM_CONFIG: SHEET_SYSTEM_CONFIG,
    SHEET_COURSE_INDEX: SHEET_COURSE_INDEX,
    LEGACY_SHEET_COURSE_INDEX: LEGACY_SHEET_COURSE_INDEX,
    SHEET_SYSTEM_INSTRUCTIONS: SHEET_SYSTEM_INSTRUCTIONS,
    SHEET_ACTIVITY_LOG: SHEET_ACTIVITY_LOG,
    ACTIVITY_LOG_HEADERS: ACTIVITY_LOG_HEADERS,
    DEFAULT_SYSTEM_PARAMS: DEFAULT_SYSTEM_PARAMS,
    WHITELIST_HEADERS: WHITELIST_HEADERS,
    ROLE_DEFINITIONS: ROLE_DEFINITIONS,
    parseConfigBoolean: parseConfigBoolean,
    normalizeRole: normalizeRole,
    getRoleDisplayName: getRoleDisplayName,
    initializeDatabaseSheets: initializeDatabaseSheets,
    readSystemSettings: readSystemSettings,
    saveSystemSettings: saveSystemSettings,
    readWhitelist: readWhitelist,
    saveWhitelist: saveWhitelist,
    findAccountInWhitelist: findAccountInWhitelist,
    getAccountRole: getAccountRole,
    bootstrapAdminIfNeeded: bootstrapAdminIfNeeded
  };
}
