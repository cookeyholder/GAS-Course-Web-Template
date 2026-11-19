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

  /** 所有角色的代碼（與 gasRuntime.ROLE_DEFINITIONS 一致） */
  const ALL_ROLES = ["admin", "staff", "viewer"];

  /**
   * action 登錄表。
   * - public：免登入即可呼叫
   * - write：寫入型 action（需 CSRF 驗證）
   * - locked：需全域 Script Lock 保護
   * - roles：允許呼叫的角色代碼（public action 不需填寫）
   */
  const ACTIONS = {
    ping: { public: true },
    getPublicConfig: { public: true },
    login: { public: true },
    loginWithActiveUser: { public: true },
    getSession: { roles: ALL_ROLES },
    logout: { write: true, roles: ALL_ROLES },
    importCourseCodes: { write: true, locked: true, roles: ["admin", "staff"] },
    getCourseIndex: { roles: ALL_ROLES },
    getCourseIndexStats: { roles: ALL_ROLES },
    getSystemSettings: { roles: ALL_ROLES },
    saveSystemSettings: { write: true, locked: true, roles: ["admin"] },
    getAccounts: { roles: ["admin"] },
    saveWhitelist: { write: true, locked: true, roles: ["admin"] }
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
   * 判斷 action 是否已登錄。
   *
   * @param {string} name - action 名稱
   * @returns {boolean} 是否已登錄
   */
  function hasAction(name) {
    return Object.prototype.hasOwnProperty.call(ACTIONS, name);
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
   * 判斷角色是否可呼叫指定 action。
   *
   * @param {string} role - 角色代碼
   * @param {string} name - action 名稱
   * @returns {boolean} 是否允許
   */
  function isRoleAllowed(role, name) {
    if (!hasAction(name)) return false;
    const entry = ACTIONS[name];
    if (entry.public === true) return true;
    return Array.isArray(entry.roles) && entry.roles.indexOf(role) !== -1;
  }

  /**
   * 由登錄表產生角色權限矩陣。
   * admin 維持單一通配規則，其餘角色明確列舉受保護 action。
   *
   * @returns {Object} 角色權限矩陣
   */
  function buildRolePermissions() {
    const permissions = { admin: ["*"] };
    ALL_ROLES.forEach(function (role) {
      if (role === "admin") return;
      permissions[role] = listActions().filter(function (name) {
        return !isPublicAction(name) && isRoleAllowed(role, name);
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
    hasAction: hasAction,
    isPublicAction: isPublicAction,
    isRoleAllowed: isRoleAllowed,
    buildRolePermissions: buildRolePermissions
  };
});
