/**
 * @file systemConfigCodec.js
 * @description 系統設定與授權白名單純編解碼器模組（Pure System Data Codec）
 *
 * 負責「試算表二維儲存格矩陣（A:B 與 D:G）」與「領域物件」之間的雙向解析、
 * 格式正規化與不可變合併運算。
 *
 * 設計原則（Functional Core）：
 * 1. 100% 純函式，無任何外部狀態或 Google Apps Script / DOM 平台相依。
 * 2. 絕對不可變性（Zero Mutation）：絕不修改或刪除傳入參數與陣列。
 * 3. 雙棲相容：支援 Node.js module.exports 與 Google Apps Script 全域環境。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  if (root) {
    root.systemConfigCodec = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** 授權角色代碼 */
  const ROLE_CODES = {
    ADMIN: "admin",
    STAFF: "staff",
    VIEWER: "viewer"
  };

  /** 授權角色中文名稱 */
  const ROLE_DEFINITIONS = {
    [ROLE_CODES.ADMIN]: "系統管理員",
    [ROLE_CODES.STAFF]: "業務人員",
    [ROLE_CODES.VIEWER]: "檢視人員"
  };

  /** 系統設定鍵名映射對照（中英雙向對稱） */
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

  /** 預設系統設定值 */
  const DEFAULT_SETTINGS = {
    學年度: "114",
    學期: "1",
    系統名稱: "Google Apps Script 應用程式範本",
    "OAuth Client ID": "",
    "OAuth Client Secret": "",
    "Google 登入允許網域": "",
    登入白名單限制啟用: "false"
  };

  /**
   * 字串轉小寫並去除前後空白。
   *
   * @param {*} value - 待處理值
   * @returns {string} 處理後字串
   */
  function normalizeLowerTrim(value) {
    return String(value === null || value === undefined ? "" : value)
      .trim()
      .toLowerCase();
  }

  /**
   * 布林值或字串旗標嚴格解析為布林值。
   *
   * @param {*} value - 待解析值
   * @returns {boolean} 是否為 true
   */
  function parseConfigBoolean(value) {
    if (value === true) return true;
    if (value === false || value === null || value === undefined) return false;
    const normalized = normalizeLowerTrim(value);
    return (
      normalized === "true" ||
      normalized === "1" ||
      normalized === "yes" ||
      normalized === "是" ||
      normalized === "啟用"
    );
  }

  /**
   * 網域字串正規化（小寫、去前後空白與前綴 @）。
   *
   * @param {*} value - 網域值
   * @returns {string} 正規化後網域
   */
  function normalizeAllowedDomain(value) {
    return String(value === null || value === undefined ? "" : value)
      .trim()
      .replace(/^@/, "")
      .toLowerCase();
  }

  /**
   * 角色代碼或顯示名稱正規化為標準角色代碼。
   *
   * @param {*} value - 角色字串
   * @returns {string} 標準角色代碼 (admin | staff | viewer)
   */
  function normalizeRole(value) {
    const raw = String(value === null || value === undefined ? "" : value).trim();
    if (!raw) return ROLE_CODES.VIEWER;
    const lower = raw.toLowerCase();
    if (lower === ROLE_CODES.ADMIN || raw === "系統管理員") return ROLE_CODES.ADMIN;
    if (lower === ROLE_CODES.STAFF || raw === "業務人員" || raw === "一般管理員") return ROLE_CODES.STAFF;
    if (lower === ROLE_CODES.VIEWER || raw === "檢視人員" || raw === "訪客") return ROLE_CODES.VIEWER;
    return lower || ROLE_CODES.VIEWER;
  }

  /**
   * 依角色代碼取得繁體中文顯示名稱。
   *
   * @param {string} role - 角色代碼
   * @returns {string} 角色顯示名稱
   */
  function getRoleDisplayName(role) {
    const normalized = normalizeRole(role);
    return ROLE_DEFINITIONS[normalized] || ROLE_DEFINITIONS[ROLE_CODES.VIEWER];
  }

  /**
   * 系統設定值型態正規化。
   *
   * @param {string} targetKey - 目標中文鍵名
   * @param {*} value - 原始值
   * @returns {string} 儲存字串
   */
  function normalizeSystemSettingValue(targetKey, value) {
    if (targetKey === "登入白名單限制啟用") {
      return parseConfigBoolean(value) ? "true" : "false";
    }
    if (targetKey === "Google 登入允許網域") {
      return normalizeAllowedDomain(value);
    }
    return String(value === null || value === undefined ? "" : value);
  }

  /**
   * 純物件系統設定正規化：補齊預設值並掛載雙軌鍵（中文原始鍵 + 駝峰快捷鍵）。
   * 同時支援試算表儲存格與記憶體 fallback 字典。
   *
   * @param {Object} [dict] - 原始鍵值物件
   * @returns {Object} 雙軌鍵值標準設定物件
   */
  function normalizeSystemSettings(dict) {
    const input = dict && typeof dict === "object" ? dict : {};
    const result = {};

    // 複製所有傳入鍵（反映試算表格子實際儲存之值，含自訂未知鍵）
    Object.keys(input).forEach(function (k) {
      const v = input[k];
      result[k] = v === null || v === undefined ? "" : String(v).trim();
    });

    // 掛載駝峰快捷鍵（雙軌鍵值相容，便捷鍵具預設 fallback 與型態正規化）
    result.schoolYear = result["學年度"] || DEFAULT_SETTINGS["學年度"];
    result.semester = result["學期"] || DEFAULT_SETTINGS["學期"];
    result.systemName = result["系統名稱"] || DEFAULT_SETTINGS["系統名稱"];
    result.clientId = result["OAuth Client ID"] || "";
    result.clientSecret = result["OAuth Client Secret"] || "";
    result.allowedLoginDomain = normalizeAllowedDomain(result["Google 登入允許網域"]);
    result.restrictWhitelist = parseConfigBoolean(result["登入白名單限制啟用"]);

    return result;
  }

  /**
   * 判定二維列矩陣的首列是否為表頭（「設定項目」或「設定名稱」）。
   *
   * @param {Array<*>} row - 列資料
   * @returns {boolean} 是否為表頭
   */
  function isSystemSettingsHeaderRow(row) {
    if (!Array.isArray(row) || row.length === 0) return false;
    const firstCell = String(row[0] || "").trim();
    return firstCell === "設定項目" || firstCell === "設定名稱" || firstCell === "項目";
  }

  /**
   * 解析 A:B 二維矩陣為標準系統設定物件（不修改原陣列）。
   *
   * @param {Array<Array<*>>} [rawRows] - 試算表二維列陣列
   * @returns {Object} 雙軌鍵值標準設定物件
   */
  function parseSystemSettingsRows(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const dict = {};
    const startIndex = rows.length > 0 && isSystemSettingsHeaderRow(rows[0]) ? 1 : 0;

    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length === 0) continue;
      const key = String(row[0] || "").trim();
      if (!key) continue;
      const rawVal = row[1];
      dict[key] = rawVal === null || rawVal === undefined ? "" : String(rawVal).trim();
    }

    return normalizeSystemSettings(dict);
  }

  /**
   * 將更新值不可變合併至既有二維列陣列中，產生全新二維矩陣。
   *
   * 1. 絕不修改或刪除傳入的 existingRows 或 updates 物件屬性（消除 delete 變異副作用）。
   * 2. 既有列存在者更新其值；不存在者於末端追加差集列。
   * 3. 支援以 options.targetRowCount（預設 29）自動補齊空字串對，消除尾端殘留列（Ghost Rows）。
   *
   * @param {Array<Array<*>>} [existingRows] - 既有二維陣列
   * @param {Object} [updates] - 欲更新的鍵值對（支援駝峰與中文鍵名）
   * @param {Object} [options] - 選項（如 targetRowCount）
   * @returns {Array<Array<string>>} 合併後的全新二維陣列
   */
  function mergeSystemSettingsRows(existingRows, updates, options) {
    const raw = Array.isArray(existingRows) ? existingRows : [];
    const inputUpdates = updates && typeof updates === "object" ? updates : {};
    const opts = options || {};
    const targetRowCount =
      typeof opts.targetRowCount === "number" && opts.targetRowCount > 0 ? opts.targetRowCount : 29;

    // 將 updates 轉為標準中文目標鍵名與標準化字串（不可變映射）
    const normalizedUpdates = {};
    Object.keys(inputUpdates).forEach(function (k) {
      const targetKey = SYSTEM_SETTING_KEY_MAP[k] || k;
      normalizedUpdates[targetKey] = normalizeSystemSettingValue(targetKey, inputUpdates[k]);
    });

    const mergedRows = [];
    const seenKeys = {};

    // 第一階段：過濾與合併既有列（保留表頭或既有項目）
    raw.forEach(function (row) {
      if (!Array.isArray(row)) return;
      const key = String(row[0] || "").trim();
      if (!key) return; // 略過中間或尾端純空白列，後續統一由 padding 填補

      seenKeys[key] = true;
      if (typeof normalizedUpdates[key] !== "undefined") {
        mergedRows.push([key, normalizedUpdates[key]]);
      } else {
        const originalVal = row[1] === null || row[1] === undefined ? "" : String(row[1]);
        mergedRows.push([key, originalVal]);
      }
    });

    // 第二階段：差集追加（在既有列中未出現之新設定項目）
    Object.keys(normalizedUpdates).forEach(function (key) {
      if (!seenKeys[key]) {
        seenKeys[key] = true;
        mergedRows.push([key, normalizedUpdates[key]]);
      }
    });

    // 第三階段：防幽靈殘留列空白填補（Padding to targetRowCount）
    const finalRowCount = Math.max(mergedRows.length, targetRowCount);
    while (mergedRows.length < finalRowCount) {
      mergedRows.push(["", ""]);
    }

    return mergedRows;
  }

  /**
   * 帳號物件純正規化。
   *
   * @param {Object} [item] - 原始帳號物件
   * @returns {Object|null} 標準帳號物件或 null
   */
  function normalizeWhitelistAccount(item) {
    if (!item || typeof item !== "object") return null;
    const email = normalizeLowerTrim(item.email);
    if (!email) return null;

    const rawEnabled = item.enabled;
    const enabled =
      rawEnabled === true ||
      rawEnabled === "true" ||
      rawEnabled === "是" ||
      rawEnabled === 1 ||
      rawEnabled === "1" ||
      rawEnabled === "啟用" ||
      (rawEnabled === undefined ? true : false);

    const role = normalizeRole(item.role);
    const roleName = getRoleDisplayName(role);

    return {
      email: email,
      name: String(item.name || "").trim(),
      role: role,
      roleName: roleName,
      enabled: enabled
    };
  }

  /**
   * 判定 D:G 二維列是否為表頭（首欄包含「email」或「帳號」）。
   *
   * @param {Array<*>} row - 列資料
   * @returns {boolean} 是否為表頭
   */
  function isWhitelistHeaderRow(row) {
    if (!Array.isArray(row) || row.length === 0) return false;
    const firstCell = normalizeLowerTrim(row[0]);
    return firstCell === "email" || firstCell === "使用者 email" || firstCell === "帳號";
  }

  /**
   * 解析 D:G 二維列矩陣為標準帳號物件陣列。
   *
   * @param {Array<Array<*>>} [rawRows] - 試算表 D:G 二維列矩陣
   * @returns {Array<Object>} 帳號物件陣列
   */
  function parseWhitelistRows(rawRows) {
    const rows = Array.isArray(rawRows) ? rawRows : [];
    const accounts = [];
    const startIndex = rows.length > 0 && isWhitelistHeaderRow(rows[0]) ? 1 : 0;

    for (let i = startIndex; i < rows.length; i++) {
      const row = rows[i];
      if (!Array.isArray(row) || row.length === 0) continue;
      const email = normalizeLowerTrim(row[0]);
      if (!email) continue;

      const enabledFlag = parseConfigBoolean(row[3]);
      const role = normalizeRole(row[2]);
      accounts.push({
        email: email,
        name: String(row[1] || "").trim(),
        role: role,
        roleName: getRoleDisplayName(role),
        enabled: enabledFlag
      });
    }

    return accounts;
  }

  /**
   * 將帳號物件陣列序列化為 D:G 二維寫入矩陣。
   *
   * @param {Array<Object>} [accounts] - 帳號物件陣列
   * @returns {Array<Array<string>>} D:G 寫入矩陣
   */
  function serializeWhitelistRows(accounts) {
    const list = Array.isArray(accounts) ? accounts : [];
    const rows = [];

    list.forEach(function (item) {
      const normalized = normalizeWhitelistAccount(item);
      if (!normalized) return;
      rows.push([normalized.email, normalized.name, normalized.roleName, normalized.enabled ? "是" : "否"]);
    });

    return rows;
  }

  return {
    ROLE_CODES: ROLE_CODES,
    ROLE_DEFINITIONS: ROLE_DEFINITIONS,
    SYSTEM_SETTING_KEY_MAP: SYSTEM_SETTING_KEY_MAP,
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    parseConfigBoolean: parseConfigBoolean,
    normalizeAllowedDomain: normalizeAllowedDomain,
    normalizeRole: normalizeRole,
    getRoleDisplayName: getRoleDisplayName,
    normalizeSystemSettings: normalizeSystemSettings,
    parseSystemSettingsRows: parseSystemSettingsRows,
    mergeSystemSettingsRows: mergeSystemSettingsRows,
    normalizeWhitelistAccount: normalizeWhitelistAccount,
    parseWhitelistRows: parseWhitelistRows,
    serializeWhitelistRows: serializeWhitelistRows
  };
});
