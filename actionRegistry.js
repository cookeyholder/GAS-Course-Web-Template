/**
 * @file actionRegistry.js
 * @description Web API action 單一登錄來源（task 4.5）
 *
 * 由同一份登錄產生公開／寫入／全域鎖 action 清單、RBAC 角色權限矩陣，
 * 並供前端 mock 驗證 handler 完整性，避免多處清單漂移。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.actionRegistry = api;
    root.MEA = root.MEA || {};
    root.MEA.actionRegistry = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * gasRuntime 單一來源解析（task 5.3）：GAS 全域優先，Node 由 require 取得。
   * actionRegistry 在 GAS 依檔名順序先於 gasRuntime 載入，故採延遲解析；
   * 隔離環境無 gasRuntime 時退回同值常數，維持雙環境載入相容。
   */
  function resolveRoleCodes_() {
    const runtime =
      typeof globalThis !== "undefined" && globalThis.gasRuntime
        ? globalThis.gasRuntime
        : typeof require === "function"
          ? require("./gasRuntime.js")
          : null;
    return (
      (runtime && runtime.ROLE_CODES) || {
        ADMIN: "admin",
        STAFF: "staff",
        VIEWER: "viewer"
      }
    );
  }

  /** 所有角色的代碼（由 gasRuntime.ROLE_CODES 衍生，單一來源） */
  const ROLE_CODES = resolveRoleCodes_();
  const ALL_ROLES = [ROLE_CODES.ADMIN, ROLE_CODES.STAFF, ROLE_CODES.VIEWER];

  /**
   * action 登錄表。
   * - public：免登入即可呼叫
   * - write：寫入型 action（需 CSRF 驗證）
   * - locked：需全域 Script Lock 保護
   * - roles：允許呼叫的角色代碼（public action 不需填寫）
   * - logCategory／logLabel／logDetailKey／logEnabled：操作日誌宣告式中繼資料
   * - doGet：明確允許以 GET 呼叫（public 不會自動放行）
   * - backfillIdentity：成功地登入後補寫日誌身分（僅限公開且寫入日誌的登入動作）
   */
  const ACTIONS = {
    ping: {
      public: true,
      doGet: true,
      logCategory: "query",
      logLabel: "心跳檢查",
      logDetailKey: "none",
      logEnabled: false
    },
    getPublicConfig: {
      public: true,
      doGet: true,
      logCategory: "query",
      logLabel: "取得公開設定",
      logDetailKey: "none",
      logEnabled: false
    },
    login: {
      public: true,
      backfillIdentity: true,
      logCategory: "auth",
      logLabel: "登入",
      logDetailKey: "auth",
      logEnabled: true
    },
    loginWithActiveUser: {
      public: true,
      backfillIdentity: true,
      logCategory: "auth",
      logLabel: "使用現存帳號登入",
      logDetailKey: "auth",
      logEnabled: true
    },
    getSession: {
      roles: ALL_ROLES,
      logCategory: "auth",
      logLabel: "取得工作階段",
      logDetailKey: "auth",
      logEnabled: true
    },
    logout: {
      write: true,
      roles: ALL_ROLES,
      logCategory: "auth",
      logLabel: "登出",
      logDetailKey: "auth",
      logEnabled: true
    },
    importCourseCodes: {
      write: true,
      locked: true,
      roles: ["admin", "staff"],
      logCategory: "write",
      logLabel: "匯入課程代碼",
      logDetailKey: "importCourseCodes",
      logEnabled: true
    },
    getCourseIndex: {
      roles: ALL_ROLES,
      logCategory: "query",
      logLabel: "查詢課程代碼",
      logDetailKey: "query",
      logEnabled: true
    },
    getCourseIndexStats: {
      roles: ALL_ROLES,
      logCategory: "query",
      logLabel: "查詢課程統計",
      logDetailKey: "query",
      logEnabled: true
    },
    getSystemSettings: {
      roles: ALL_ROLES,
      logCategory: "query",
      logLabel: "查詢系統設定",
      logDetailKey: "query",
      logEnabled: true
    },
    saveSystemSettings: {
      write: true,
      locked: true,
      roles: ["admin"],
      logCategory: "write",
      logLabel: "儲存系統設定",
      logDetailKey: "systemSettings",
      logEnabled: true
    },
    getAccounts: {
      roles: ["admin"],
      logCategory: "query",
      logLabel: "查詢授權成員",
      logDetailKey: "query",
      logEnabled: true
    },
    saveWhitelist: {
      write: true,
      locked: true,
      roles: ["admin"],
      logCategory: "write",
      logLabel: "儲存授權名單",
      logDetailKey: "whitelist",
      logEnabled: true
    },
    getActivityLog: {
      roles: ["admin"],
      logCategory: "query",
      logLabel: "查詢操作日誌",
      logDetailKey: "none",
      logEnabled: false
    }
  };

  /** 快取由登錄表產生的清單，避免每次呼叫重新建立陣列 */
  const CACHED_LISTS = {};

  /**
   * 取得符合條件的 action 名稱清單。
   *
   * @param {string} key - 登錄屬性名稱
   * @returns {Array<string>} action 名稱陣列
   */
  function filterActionsByFlag_(key) {
    if (!CACHED_LISTS[key]) {
      CACHED_LISTS[key] = Object.keys(ACTIONS).filter(function (name) {
        return ACTIONS[name][key] === true;
      });
    }
    return CACHED_LISTS[key].slice();
  }

  /**
   * 列出所有已登錄的 action。
   *
   * @returns {Array<string>} action 名稱陣列
   */
  function listActions() {
    if (!CACHED_LISTS.all) CACHED_LISTS.all = Object.keys(ACTIONS);
    return CACHED_LISTS.all.slice();
  }

  /**
   * 列出免登入的公開 action。
   *
   * @returns {Array<string>} action 名稱陣列
   */
  function listPublicActions() {
    return filterActionsByFlag_("public");
  }

  /**
   * 列出寫入型 action。
   *
   * @returns {Array<string>} action 名稱陣列
   */
  function listWriteActions() {
    return filterActionsByFlag_("write");
  }

  /**
   * 列出需要全域 Script Lock 的 action。
   *
   * @returns {Array<string>} action 名稱陣列
   */
  function listLockedActions() {
    return filterActionsByFlag_("locked");
  }

  /**
   * 列出明確允許以 GET 呼叫的 action（由 doGet: true 衍生，public 不自動放行）。
   *
   * @returns {Array<string>} action 名稱陣列
   */
  function listDoGetAllowedActions() {
    return filterActionsByFlag_("doGet");
  }

  /**
   * 列出不寫入操作日誌的 action（由 logEnabled === false 衍生）。
   *
   * @returns {Array<string>} action 名稱陣列
   */
  function listLogExcludedActions() {
    if (!CACHED_LISTS.logExcluded) {
      CACHED_LISTS.logExcluded = Object.keys(ACTIONS).filter(function (name) {
        return ACTIONS[name].logEnabled === false;
      });
    }
    return CACHED_LISTS.logExcluded.slice();
  }

  /**
   * 列出成功登入後需補寫日誌身分的 action（由 backfillIdentity: true 衍生）。
   * 該旗標僅能標記於公開且寫入日誌的 action，由 actionRegistry.test.js 驗證此約束。
   *
   * @returns {Array<string>} action 名稱陣列
   */
  function listIdentityBackfillActions() {
    return filterActionsByFlag_("backfillIdentity");
  }

  /**
   * 判斷 action 是否已登錄。
   *
   * @param {string} name - action 名稱
   * @returns {boolean} 是否已登錄
   */
  function hasAction(name) {
    return Object.prototype.hasOwnProperty.call(ACTIONS, name);
  }

  /**
   * 註冊 action 實際處理函式，使路由派發與清單共用同一份登錄資料。
   *
   * @param {string} name - action 名稱
   * @param {Function} handler - 處理函式
   * @returns {boolean} 是否註冊成功
   */
  function setHandler(name, handler) {
    if (!hasAction(name) || typeof handler !== "function") return false;
    ACTIONS[name].handler = handler;
    return true;
  }

  /**
   * 取得 action 已註冊的處理函式。
   *
   * @param {string} name - action 名稱
   * @returns {Function|null} 處理函式或 null
   */
  function getHandler(name) {
    return hasAction(name) ? ACTIONS[name].handler : null;
  }

  /**
   * 取得 action 的日誌中繼資料（供統一攔截器建立摘要與詳情）。
   *
   * @param {string} name - action 名稱
   * @returns {Object|null} `{ category, label, detailKey, enabled }` 或 null
   */
  function getActionMeta(name) {
    if (!hasAction(name)) return null;
    if (!CACHED_LISTS.actionMeta) CACHED_LISTS.actionMeta = {};
    if (!CACHED_LISTS.actionMeta[name]) {
      const entry = ACTIONS[name];
      CACHED_LISTS.actionMeta[name] = {
        category: entry.logCategory || "query",
        label: entry.logLabel || name,
        detailKey: entry.logDetailKey || "default",
        enabled: entry.logEnabled !== false
      };
    }
    return Object.assign({}, CACHED_LISTS.actionMeta[name]);
  }

  /**
   * 判斷 action 是否為公開 action。
   *
   * @param {string} name - action 名稱
   * @returns {boolean} 是否公開
   */
  function isPublicAction(name) {
    return hasAction(name) && ACTIONS[name].public === true;
  }

  /**
   * 判斷角色是否可呼叫指定 action（task 5.3：角色判定單一入口）。
   *
   * @param {string} role - 角色代碼
   * @param {string} action - action 名稱
   * @returns {boolean} 是否允許
   */
  function isActionAllowed(role, action) {
    if (!hasAction(action)) return false;
    const entry = ACTIONS[action];
    if (entry.public === true) return true;
    return Array.isArray(entry.roles) && entry.roles.indexOf(role) !== -1;
  }

  /**
   * 由登錄表產生角色權限矩陣。
   * 所有角色皆明確列舉允許的 action，移除萬用字元，使權限邊界可稽核，
   * 且前端取得的 perms 與後端驗證結果一致。
   *
   * @returns {Object} 角色權限矩陣
   */
  function buildRolePermissions() {
    const permissions = {};
    ALL_ROLES.forEach(function (role) {
      permissions[role] = listActions().filter(function (name) {
        // 管理員列舉所有已登錄 action（含公開動作與 getActivityLog）；
        // 其餘角色僅列舉自身被授權的受保護動作。
        return isActionAllowed(role, name) && (role === ROLE_CODES.ADMIN || !isPublicAction(name));
      });
    });
    return permissions;
  }

  return {
    ACTIONS: ACTIONS,
    ROLES: ALL_ROLES,
    listActions: listActions,
    listPublicActions: listPublicActions,
    listWriteActions: listWriteActions,
    listLockedActions: listLockedActions,
    listDoGetAllowedActions: listDoGetAllowedActions,
    listLogExcludedActions: listLogExcludedActions,
    listIdentityBackfillActions: listIdentityBackfillActions,
    hasAction: hasAction,
    setHandler: setHandler,
    getHandler: getHandler,
    getActionMeta: getActionMeta,
    isPublicAction: isPublicAction,
    isActionAllowed: isActionAllowed,
    ROLE_CODES: ROLE_CODES,
    buildRolePermissions: buildRolePermissions
  };
});
