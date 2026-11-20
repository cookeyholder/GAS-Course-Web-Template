/**
 * @file gasRuntime.js
 * @description GAS / Node.js 雙環境共用的相依解析與安全試算表取得（task 4.3）
 *
 * 統一提供三項能力：
 * - resolveDependency_：module.exports → globalThis → fallback（未提供 fallback 時 fail-fast）
 * - getActiveSpreadsheetSafe_：options.spreadsheet → SpreadsheetApp → null
 * - injectGlobals_：僅注入白名單匯出，避免 Object.assign 全域污染
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.gasRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** 系統設定與授權工作表名稱（前後端共用單一來源） */
  const SHEET_SYSTEM_CONFIG = "系統設定與授權";

  /** 1NF 正規化課程代碼工作表名稱（前後端共用單一來源） */
  const SHEET_COURSE_INDEX = "正規化課程代碼";

  /** 舊版工作表名稱，僅供初始化時一次性更名遷移使用 */
  const LEGACY_SHEET_COURSE_INDEX = "正規化課程索引";

  /** 系統使用說明工作表名稱（前後端共用單一來源） */
  const SHEET_SYSTEM_INSTRUCTIONS = "系統使用說明";

  /** 操作日誌工作表名稱（前後端共用單一來源） */
  const SHEET_ACTIVITY_LOG = "操作日誌";

  /** Web API 版本號退回值：無建置注入（如 Node 測試）時使用，對外維持 1.1.0 */
  const FALLBACK_WEB_API_VERSION = "1.1.0";

  /**
   * 解析 Web API 版本號（task 5.1）：優先使用 build-webapp.js 由 package.json
   * 產生並隨 push 上傳的 version.generated.js 所掛載的全域值，退回固定值。
   *
   * 採 getter 延遲讀取，以相容 GAS 檔案載入順序（version.generated.js 在 gasRuntime.js 之後）。
   *
   * @returns {string} Web API 版本號
   */
  function resolveWebApiVersion_() {
    const injected = typeof globalThis !== "undefined" ? globalThis.__PACKAGE_VERSION__ : undefined;
    return typeof injected === "string" && injected.trim() !== "" ? injected.trim() : FALLBACK_WEB_API_VERSION;
  }

  /**
   * 操作日誌 12 欄 schema（task 5.2）：英文欄位順序與中文表頭一一對應。
   * 此為唯一來源；寫入端（databaseInitializer／activityLogger）與查詢端
   * （activityLogQuery）皆由此衍生，避免重複陣列與索引硬編碼。
   */
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

  /** 操作日誌 12 欄中文表頭，順序須與 ACTIVITY_LOG_FIELDS 一致 */
  const ACTIVITY_LOG_HEADERS = [
    "時間戳記",
    "請求識別碼",
    "事件類別",
    "動作名稱",
    "結果",
    "操作者 email",
    "操作者姓名",
    "角色",
    "摘要",
    "詳情 JSON",
    "耗時（毫秒）",
    "錯誤代碼"
  ];

  /** 欄位名稱至零基索引的對應（由 ACTIVITY_LOG_FIELDS 衍生，消除 cells[0..11] 硬編碼） */
  const ACTIVITY_LOG_FIELD_INDEX = ACTIVITY_LOG_FIELDS.reduce(function (index, field, position) {
    index[field] = position;
    return index;
  }, {});

  /** 詳情序列化失敗或降級時使用的最小合法 JSON */
  const MINIMAL_ACTIVITY_DETAIL_JSON = '{"版本":1,"動作":"","指標":{},"截斷":true}';

  /** 詳情序列化後的字元上限 */
  const ACTIVITY_DETAIL_MAX_LENGTH = 500;

  /** 授權角色代碼（task 5.3：所有角色判定共用單一來源） */
  const ROLE_CODES = {
    ADMIN: "admin",
    STAFF: "staff",
    VIEWER: "viewer"
  };

  /** 授權角色定義（所有後端角色顯示名稱共用單一來源） */
  const ROLE_DEFINITIONS = {
    [ROLE_CODES.ADMIN]: "系統管理員",
    [ROLE_CODES.STAFF]: "業務人員",
    [ROLE_CODES.VIEWER]: "檢視人員"
  };

  /**
   * 判斷物件是否自有指定屬性。
   *
   * @param {*} value - 待檢查物件
   * @param {string} key - 屬性名稱
   * @returns {boolean} 是否為自有屬性
   */
  function hasOwn(value, key) {
    return value !== null && value !== undefined && Object.prototype.hasOwnProperty.call(value, key);
  }

  /**
   * 取得目前環境的 gasRuntime（Node.js 首次載入時自動 require）。
   *
   * @returns {Object} gasRuntime API
   */
  function getRuntime_() {
    if (typeof globalThis !== "undefined" && globalThis.gasRuntime) return globalThis.gasRuntime;
    if (typeof require === "function") return require("./gasRuntime.js");
    throw new Error("找不到 gasRuntime 共用模組");
  }

  /**
   * 唯一的相依解析入口，順序為：overrides（呼叫端 module.exports）→ globalThis → 模組 module.exports → fallback。
   *
   * overrides 由呼叫端傳入自身的 module.exports（例如 webApi），保留以
   * `api[key] = stub` 注入測試替身的接縫；值為 null／undefined 視為未提供。
   * globalThis 涵蓋 GAS 全域命名空間與 Node 白名單注入，兩者皆優先於
   * 明確指定 modulePath 時的模組匯出（向後相容既有注入行為）。
   * 模組載入失敗不得被空 catch 靜默吞沒：若無其他來源可解析，
   * 即 fail-fast 並拋出含匯出名稱與模組路徑的錯誤。
   *
   * requireModule 供「解析整個模組本體」使用：活動日誌等模組的全域與
   * module.exports 即為 API 本體，並無與模組同名的具名匯出；此模式下
   * require 成功即回傳整包模組，重現既有 resolveActivityLogModule_ 語意。
   *
   * @param {string} name - 相依匯出名稱
   * @param {string} [modulePath] - Node.js require 路徑
   * @param {*} [fallback] - 選用備援值
   * @param {Object} [overrides] - 呼叫端 module.exports（測試注入接縫）
   * @param {boolean} [requireModule] - 是否解析整包模組本體
   * @returns {*} 解析後的相依
   */
  function resolveDependency_(name, modulePath, fallback, overrides, requireModule) {
    // 1. 呼叫端注入的 module.exports 最優先（測試接縫）。
    if (overrides && hasOwn(overrides, name) && overrides[name] !== null && overrides[name] !== undefined) {
      return overrides[name];
    }

    // 2. globalThis（GAS 全域命名空間或 Node 白名單注入）。
    if (typeof globalThis !== "undefined" && hasOwn(globalThis, name)) return globalThis[name];

    // 3. 明確指定模組路徑時，取用其 module.exports；載入失敗僅記錄，
    //    讓 fallback 仍有機會解析，最後才 fail-fast。
    let loadError = null;
    if (typeof require === "function" && modulePath) {
      let moduleExports;
      try {
        moduleExports = require(modulePath);
      } catch (error) {
        loadError = error;
      }
      if (moduleExports) {
        if (requireModule) return moduleExports;
        if (hasOwn(moduleExports, name)) return moduleExports[name];
      }
    }

    // 4. 明確提供的備援值。
    if (arguments.length >= 3) return fallback;

    // 5. 全數失敗：fail-fast，載入失敗時一併帶出模組名稱。
    if (loadError) {
      throw new Error("找不到相依匯出：" + name + "（無法載入 " + modulePath + "：" + loadError.message + "）");
    }
    throw new Error("找不到相依匯出：" + name);
  }

  /**
   * 安全取得試算表：明確傳入 > SpreadsheetApp > null。
   *
   * @param {Object} [options] - 選項
   * @param {*} [options.spreadsheet] - 明確指定的試算表
   * @returns {*} 試算表實例或 null
   */
  function getActiveSpreadsheetSafe_(options) {
    const opts = options || {};
    if (opts.spreadsheet) return opts.spreadsheet;
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
   * 白名單注入全域（僅 Node.js 測試環境需要）。
   * 任一要求的匯出不存在即 fail-fast，避免拼字錯誤被靜默忽略。
   * 僅在全域不存在時寫入，避免覆寫測試預先設定的同名 sentinel。
   *
   * @param {string} modulePath - Node.js require 路徑
   * @param {Array<string>} whitelist - 允許注入的匯出名稱
   * @returns {Object} 實際注入的名稱與值
   */
  function injectGlobals_(modulePath, whitelist) {
    if (typeof require !== "function") return {};
    const moduleExports = require(modulePath);
    const names = Array.isArray(whitelist) ? whitelist : [];
    const injected = {};
    names.forEach(function (name) {
      if (!hasOwn(moduleExports, name)) {
        throw new Error("相依模組 " + modulePath + " 未匯出 " + name);
      }
      if (typeof globalThis !== "undefined" && !hasOwn(globalThis, name)) {
        globalThis[name] = moduleExports[name];
        injected[name] = moduleExports[name];
      }
    });
    return injected;
  }

  return {
    SHEET_SYSTEM_CONFIG: SHEET_SYSTEM_CONFIG,
    SHEET_COURSE_INDEX: SHEET_COURSE_INDEX,
    LEGACY_SHEET_COURSE_INDEX: LEGACY_SHEET_COURSE_INDEX,
    SHEET_SYSTEM_INSTRUCTIONS: SHEET_SYSTEM_INSTRUCTIONS,
    SHEET_ACTIVITY_LOG: SHEET_ACTIVITY_LOG,
    get WEB_API_VERSION() {
      return resolveWebApiVersion_();
    },
    ACTIVITY_LOG_FIELDS: ACTIVITY_LOG_FIELDS,
    ACTIVITY_LOG_HEADERS: ACTIVITY_LOG_HEADERS,
    ACTIVITY_LOG_FIELD_INDEX: ACTIVITY_LOG_FIELD_INDEX,
    MINIMAL_ACTIVITY_DETAIL_JSON: MINIMAL_ACTIVITY_DETAIL_JSON,
    ACTIVITY_DETAIL_MAX_LENGTH: ACTIVITY_DETAIL_MAX_LENGTH,
    ROLE_CODES: ROLE_CODES,
    ROLE_DEFINITIONS: ROLE_DEFINITIONS,
    hasOwn: hasOwn,
    getRuntime_: getRuntime_,
    resolveDependency_: resolveDependency_,
    getActiveSpreadsheetSafe_: getActiveSpreadsheetSafe_,
    injectGlobals_: injectGlobals_
  };
});
