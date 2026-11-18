/**
 * @file databaseInitializer.js
 * @description Google Apps Script 資料庫工作表初始化與設定管理模組
 *
 * 負責自動建立與格式化純資料工作表：
 * 1. 系統設定與授權 (SHEET_SYSTEM_CONFIG)
 * 2. 正規化課程索引 (SHEET_COURSE_INDEX)
 * 3. 系統使用說明 (SHEET_SYSTEM_INSTRUCTIONS)
 */

// ============================================================================
// 工作表名稱常數
// ============================================================================

/** 系統設定與授權工作表名稱 */
const SHEET_SYSTEM_CONFIG = "系統設定與授權";

/** 1NF 正規化課程索引工作表名稱 */
const SHEET_COURSE_INDEX = "正規化課程索引";

/** 系統使用說明工作表名稱 */
const SHEET_SYSTEM_INSTRUCTIONS = "系統使用說明";

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

/** 授權角色定義 */
const ROLE_DEFINITIONS = {
  admin: "系統管理員",
  staff: "業務人員",
  viewer: "檢視人員"
};

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

/** 角色名稱轉代碼對照 */
function normalizeRole(role) {
  const r = String(role || "")
    .trim()
    .toLowerCase();
  if (r === "系統管理員" || r === "admin") return "admin";
  if (r === "業務人員" || r === "staff") return "staff";
  if (r === "檢視人員" || r === "viewer") return "viewer";
  return r || "viewer";
}

/** 代碼轉角色名稱對照 */
function getRoleDisplayName(role) {
  const r = normalizeRole(role);
  return ROLE_DEFINITIONS[r] || "檢視人員";
}

// ============================================================================
// 工作表初始化主函式
// ============================================================================

function resolveDbSpreadsheet_(options) {
  const opts = options || {};
  return (
    opts.spreadsheet ||
    (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
      ? SpreadsheetApp.getActiveSpreadsheet()
      : null)
  );
}

function getNormalizedCourseHeaders_() {
  if (typeof NORMALIZED_COURSE_HEADERS !== "undefined") return NORMALIZED_COURSE_HEADERS;
  if (typeof globalThis !== "undefined" && globalThis.NORMALIZED_COURSE_HEADERS) {
    return globalThis.NORMALIZED_COURSE_HEADERS;
  }
  if (typeof require !== "undefined") {
    try {
      return require("./subjectCodeTransformer.js").NORMALIZED_COURSE_HEADERS;
    } catch (e) {
      // ignore
    }
  }
  return [];
}

function createSystemConfigSheet_(ss) {
  const configSheet = ss.insertSheet(SHEET_SYSTEM_CONFIG);
  configSheet.getRange(1, 1, DEFAULT_SYSTEM_PARAMS.length, 2).setValues(DEFAULT_SYSTEM_PARAMS);
  configSheet.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#e2e8f0");
  configSheet.getRange(1, 4, 1, WHITELIST_HEADERS.length).setValues([WHITELIST_HEADERS]);
  configSheet.getRange(1, 4, 1, WHITELIST_HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
  configSheet.setFrozenRows(1);
  return configSheet;
}

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

function repairSystemConfigBlockB_(configSheet) {
  if (configSheet.getMaxColumns() < 8) {
    configSheet.insertColumnsAfter(configSheet.getMaxColumns(), 8 - configSheet.getMaxColumns());
  }
  if (configSheet.getRange(1, 4).getValue() !== WHITELIST_HEADERS[0]) {
    configSheet.getRange(1, 4, 1, WHITELIST_HEADERS.length).setValues([WHITELIST_HEADERS]);
    configSheet.getRange(1, 4, 1, WHITELIST_HEADERS.length).setFontWeight("bold").setBackground("#e2e8f0");
  }
}

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

function ensureCourseIndexSheet_(ss, createdSheets) {
  if (ss.getSheetByName(SHEET_COURSE_INDEX)) return;
  createCourseIndexSheet_(ss);
  createdSheets.push(SHEET_COURSE_INDEX);
}

function getSystemInstructionRows_() {
  return [
    ["=== Google Apps Script 應用程式範本使用說明 ==="],
    [""],
    ["一、功能架構："],
    ["1. 系統設定與授權：包含系統運作基本參數（學年度、學期、OAuth Client ID）與使用者權限白名單。"],
    [
      "2. 正規化課程索引：儲存自教育部課程計畫平臺下載之 108 課綱課程代碼，全數經 1NF 正規化後展開之 14 欄標準課程資料。"
    ],
    ["3. Google Identity Services (GIS) 登入：支援 Google One Tap、Google 登入按鈕與 Google Workspace 網域登入。"],
    [""],
    ["二、OAuth 2.0 Client ID 設定步驟："],
    ["1. 前往 Google Cloud Console (https://console.cloud.google.com/) 建立或選取專案。"],
    ["2. 進入「API 和服務」->「憑證」，建立「OAuth 用戶端 ID」，應用程式類型選擇「網頁應用程式」。"],
    ["3. 於「已授權的 JavaScript 來源」填入 Web App 網址（例如：https://script.google.com）。"],
    ["4. 將取得的 Client ID 填入「系統設定與授權」工作表之 B5 儲存格（或於 Web App 設定介面輸入並儲存）。"],
    [""],
    ["三、角色權限（RBAC）："],
    ["- admin（系統管理員）：完整讀寫系統參數、管理使用者名單與課程代碼匯入。"],
    ["- staff（業務人員）：可匯入課程代碼並檢視課程索引。"],
    ["- viewer（檢視人員）：僅能檢視課程代碼與公開設定。"]
  ];
}

function ensureInstructionsSheet_(ss, createdSheets) {
  if (ss.getSheetByName(SHEET_SYSTEM_INSTRUCTIONS)) return;
  const instructSheet = ss.insertSheet(SHEET_SYSTEM_INSTRUCTIONS);
  const instructions = getSystemInstructionRows_();
  instructSheet.getRange(1, 1, instructions.length, 1).setValues(instructions);
  instructSheet.getRange(1, 1).setFontWeight("bold").setFontSize(14);
  createdSheets.push(SHEET_SYSTEM_INSTRUCTIONS);
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

  return {
    ok: true,
    sheets: [SHEET_SYSTEM_CONFIG, SHEET_COURSE_INDEX, SHEET_SYSTEM_INSTRUCTIONS],
    createdSheets: createdSheets
  };
}

// ============================================================================
// 系統設定讀寫
// ============================================================================

/**
 * 將系統設定布林旗標正規化為布林值。
 *
 * @param {*} value - 設定值
 * @returns {boolean} 是否啟用
 */
function parseConfigBoolean(value) {
  const normalized = String(value === null || value === undefined ? "" : value)
    .trim()
    .toLowerCase();
  return (
    normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "是" || normalized === "啟用"
  );
}

function normalizeAllowedLoginDomain_(value) {
  return String(value || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function applySystemSettingConvenienceFields_(config) {
  const target = config || {};
  target.schoolYear = target["學年度"] || "114";
  target.semester = target["學期"] || "1";
  target.systemName = target["系統名稱"] || "Google Apps Script 應用程式範本";
  target.clientId = target["OAuth Client ID"] || "";
  target.clientSecret = target["OAuth Client Secret"] || "";
  target.allowedLoginDomain = normalizeAllowedLoginDomain_(target["Google 登入允許網域"]);
  target.restrictWhitelist = parseConfigBoolean(target["登入白名單限制啟用"]);
  return target;
}

function readSystemSettingsFromMemory_() {
  return applySystemSettingConvenienceFields_(Object.assign({}, MEMORY_SYSTEM_CONFIG));
}

function readSystemSettingsRows_(sheet) {
  const lastRow = Math.max(sheet.getLastRow(), 2);
  return sheet.getRange(1, 1, lastRow, 2).getValues();
}

function buildSystemSettingsConfigFromRows_(values) {
  const config = {};
  const rows = values || [];
  for (let i = 1; i < rows.length; i++) {
    const key = String((rows[i] && rows[i][0]) || "").trim();
    if (!key) continue;
    const raw = rows[i] ? rows[i][1] : "";
    config[key] = raw === null || raw === undefined ? "" : String(raw).trim();
  }
  return config;
}

function readSystemSettingsFromSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_SYSTEM_CONFIG);
  if (!sheet) return {};
  const config = buildSystemSettingsConfigFromRows_(readSystemSettingsRows_(sheet));
  return applySystemSettingConvenienceFields_(config);
}

/**
 * 讀取「系統設定與授權」區塊 A 之設定項目
 *
 * @param {Spreadsheet} [ss] - 試算表物件
 * @returns {Object} 鍵值對設定物件
 */
function readSystemSettings(ss) {
  const targetSs = resolveDbSpreadsheet_({ spreadsheet: ss });
  if (!targetSs) return readSystemSettingsFromMemory_();
  return readSystemSettingsFromSheet_(targetSs);
}

/**
 * 儲存系統設定
 *
 * @param {Object} settings - 欲更新的設定物件
 * @param {Spreadsheet} [ss] - 試算表物件
 * @returns {Object} `{ ok: true }`
 */
const SYSTEM_SETTING_KEY_MAP = {
  schoolYear: "學年度",
  semester: "學期",
  systemName: "系統名稱",
  clientId: "OAuth Client ID",
  clientSecret: "OAuth Client Secret",
  restrictWhitelist: "登入白名單限制啟用",
  allowedLoginDomain: "Google 登入允許網域",
  學年度: "學年度",
  學期: "學期",
  系統名稱: "系統名稱",
  "OAuth Client ID": "OAuth Client ID",
  "OAuth Client Secret": "OAuth Client Secret",
  登入白名單限制啟用: "登入白名單限制啟用",
  "Google 登入允許網域": "Google 登入允許網域"
};

function normalizeSystemSettingValue_(targetKey, value) {
  if (targetKey === "登入白名單限制啟用") {
    return parseConfigBoolean(value) ? "true" : "false";
  }
  if (targetKey === "Google 登入允許網域") {
    return String(value || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
  }
  return String(value === null || value === undefined ? "" : value);
}

function buildSystemSettingUpdates_(settings) {
  const updates = {};
  const source = settings || {};
  for (const k in source) {
    const targetKey = SYSTEM_SETTING_KEY_MAP[k] || k;
    updates[targetKey] = normalizeSystemSettingValue_(targetKey, source[k]);
  }
  return updates;
}

function saveSystemSettingsToMemory_(updates) {
  for (const key in updates) {
    MEMORY_SYSTEM_CONFIG[key] = updates[key];
  }
  return { ok: true };
}

function getSystemConfigSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_SYSTEM_CONFIG);
  if (!sheet) throw new Error("找不到工作表：" + SHEET_SYSTEM_CONFIG);
  return sheet;
}

function applySystemSettingUpdatesToRows_(values, updates) {
  for (let i = 0; i < values.length; i++) {
    const key = String(values[i][0] || "").trim();
    if (key && typeof updates[key] !== "undefined") {
      values[i][1] = updates[key];
      delete updates[key];
    }
  }
  return values;
}

function appendRemainingSystemSettings_(sheet, updates) {
  const toAppend = [];
  for (const key in updates) {
    toAppend.push([key, updates[key]]);
  }
  if (toAppend.length === 0) return;
  const nextRow = sheet.getLastRow() + 1;
  const safeAppend = typeof sanitizeRowMatrix === "function" ? sanitizeRowMatrix(toAppend) : toAppend;
  sheet.getRange(nextRow, 1, safeAppend.length, 2).setValues(safeAppend);
}

function saveSystemSettingsToSheet_(ss, updates) {
  const sheet = getSystemConfigSheet_(ss);
  const range = sheet.getRange("A2:B30");
  const values = applySystemSettingUpdatesToRows_(range.getValues(), updates);
  const safeValues = typeof sanitizeRowMatrix === "function" ? sanitizeRowMatrix(values) : values;
  range.setValues(safeValues);
  appendRemainingSystemSettings_(sheet, updates);
  return { ok: true };
}

function saveSystemSettings(settings, ss) {
  const targetSs =
    ss ||
    (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
      ? SpreadsheetApp.getActiveSpreadsheet()
      : null);
  const updates = buildSystemSettingUpdates_(settings);
  if (!targetSs) return saveSystemSettingsToMemory_(updates);
  return saveSystemSettingsToSheet_(targetSs, updates);
}

// ============================================================================
// 授權白名單讀寫
// ============================================================================

function parseWhitelistEnabledFlag_(value) {
  return (
    value === true ||
    String(value || "").toLowerCase() === "true" ||
    String(value || "").trim() === "是"
  );
}

function normalizeWhitelistAccountRow_(row) {
  const email = String((row && row[0]) || "")
    .trim()
    .toLowerCase();
  if (!email) return null;
  return {
    email: email,
    name: String((row && row[1]) || "").trim(),
    role: normalizeRole(row && row[2]),
    roleName: getRoleDisplayName(row && row[2]),
    enabled: parseWhitelistEnabledFlag_(row && row[3])
  };
}

function mapWhitelistRows_(values) {
  const accounts = [];
  const rows = values || [];
  for (let i = 0; i < rows.length; i++) {
    const account = normalizeWhitelistAccountRow_(rows[i]);
    if (account) accounts.push(account);
  }
  return accounts;
}

function getWhitelistSheet_(ss) {
  return ss.getSheetByName(SHEET_SYSTEM_CONFIG);
}

function readWhitelistRowsFromSheet_(sheet) {
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  return sheet.getRange(2, 4, lastRow - 1, 4).getValues();
}

/**
 * 讀取授權白名單清單（區塊 B，D2:G）
 *
 * @param {Spreadsheet} [ss] - 試算表物件
 * @returns {Array<Object>} 白名單帳號陣列
 */
function readWhitelist(ss) {
  const targetSs = resolveDbSpreadsheet_({ spreadsheet: ss });
  if (!targetSs) return MEMORY_WHITELIST.slice();
  const values = readWhitelistRowsFromSheet_(getWhitelistSheet_(targetSs));
  return mapWhitelistRows_(values);
}

function normalizeWhitelistInputEmail_(item) {
  return String((item && item.email) || "")
    .trim()
    .toLowerCase();
}

function normalizeWhitelistMemoryAccount_(item) {
  const email = normalizeWhitelistInputEmail_(item);
  if (!email) return null;
  return {
    email: email,
    name: String((item && item.name) || "").trim(),
    role: normalizeRole(item && item.role),
    roleName: getRoleDisplayName(item && item.role),
    enabled: (item && item.enabled) !== false
  };
}

function saveWhitelistToMemory_(list) {
  MEMORY_WHITELIST.length = 0;
  for (let i = 0; i < list.length; i++) {
    const account = normalizeWhitelistMemoryAccount_(list[i]);
    if (account) MEMORY_WHITELIST.push(account);
  }
  return { ok: true, count: MEMORY_WHITELIST.length };
}

function normalizeWhitelistSheetRow_(item) {
  const email = normalizeWhitelistInputEmail_(item);
  if (!email) return null;
  return [
    email,
    String((item && item.name) || "").trim(),
    getRoleDisplayName(item && item.role),
    item && item.enabled === false ? "否" : "是"
  ];
}

function buildWhitelistSheetRows_(list) {
  const rows = [];
  for (let i = 0; i < list.length; i++) {
    const row = normalizeWhitelistSheetRow_(list[i]);
    if (row) rows.push(row);
  }
  return rows;
}

function getRequiredSystemConfigSheet_(ss) {
  const sheet = ss.getSheetByName(SHEET_SYSTEM_CONFIG);
  if (!sheet) throw new Error("找不到工作表：" + SHEET_SYSTEM_CONFIG);
  return sheet;
}

function clearWhitelistSheetRange_(sheet) {
  const currentLastRow = Math.max(sheet.getLastRow(), 2);
  sheet.getRange(2, 4, currentLastRow, 4).clearContent();
}

function writeWhitelistSheetRows_(sheet, rows) {
  if (rows.length === 0) return;
  const safeRows = typeof sanitizeRowMatrix === "function" ? sanitizeRowMatrix(rows) : rows;
  sheet.getRange(2, 4, safeRows.length, 4).setValues(safeRows);
}

function saveWhitelistToSheet_(ss, list) {
  const sheet = getRequiredSystemConfigSheet_(ss);
  const rows = buildWhitelistSheetRows_(list);
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
 * 取得指定 Email 之角色權限
 *
 * @param {string} email - 使用者 Email
 * @param {Spreadsheet} [ss] - 試算表物件
 * @returns {Object} `{ role, name, enabled, found }`
 */
function getAccountRole(email, ss) {
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase();
  const accounts = readWhitelist(ss);

  for (let i = 0; i < accounts.length; i++) {
    if (accounts[i].email === cleanEmail) {
      return {
        role: accounts[i].role,
        roleName: accounts[i].roleName,
        name: accounts[i].name,
        enabled: accounts[i].enabled,
        found: true
      };
    }
  }

  return {
    role: "viewer",
    roleName: "檢視人員",
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
  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase();
  if (!cleanEmail) return false;

  const accounts = readWhitelist(ss);
  if (accounts.length === 0) {
    saveWhitelist(
      [
        {
          email: cleanEmail,
          name: name || cleanEmail,
          role: "admin",
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
    SHEET_SYSTEM_INSTRUCTIONS: SHEET_SYSTEM_INSTRUCTIONS,
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
    getAccountRole: getAccountRole,
    bootstrapAdminIfNeeded: bootstrapAdminIfNeeded
  };
}
