"use strict";

/**
 * actionRegistry.test.js（task 4.5）
 * 驗證公開／寫入／鎖定清單、RBAC 矩陣、路由守門與 mock handler 皆由單一登錄來源產生。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const registry = require("../actionRegistry.js");
const api = require("../webApi.js");
const mock = require("../webapp/js/mock.js");

function run() {
  console.log("1. 後端清單應由 ACTION_REGISTRY 產生...");
  assert.deepStrictEqual(api.WEB_API_PUBLIC_ACTIONS, registry.listPublicActions());
  assert.deepStrictEqual(api.WEB_API_WRITE_ACTIONS, registry.listWriteActions());
  assert.deepStrictEqual(api.WEB_API_LOCKED_ACTIONS, registry.listLockedActions());
  assert.strictEqual(api.WEB_API_LOCKED_ACTIONS.indexOf("login"), -1);
  assert.strictEqual(api.WEB_API_LOCKED_ACTIONS.indexOf("loginWithActiveUser"), -1);
  console.log("   ✓ 清單一致性驗證通過！\n");

  console.log("2. RBAC 權限矩陣應由 ACTION_REGISTRY 產生...");
  assert.deepStrictEqual(api.ROLE_PERMISSIONS, registry.buildRolePermissions());
  ["getSession", "logout", "getCourseIndex", "getCourseIndexStats", "getSystemSettings"].forEach(function (action) {
    assert.strictEqual(registry.isRoleAllowed("viewer", action), true);
  });
  assert.strictEqual(registry.isRoleAllowed("viewer", "importCourseCodes"), false);
  assert.strictEqual(registry.isRoleAllowed("staff", "importCourseCodes"), true);
  assert.strictEqual(registry.isRoleAllowed("viewer", "saveSystemSettings"), false);
  assert.strictEqual(registry.isRoleAllowed("admin", "saveWhitelist"), true);
  assert.strictEqual(registry.isRoleAllowed("viewer", "not_registered"), false);
  assert.strictEqual(registry.isRoleAllowed("admin", "getActivityLog"), true);
  assert.strictEqual(registry.isRoleAllowed("staff", "getActivityLog"), false);
  assert.strictEqual(registry.isRoleAllowed("viewer", "getActivityLog"), false);
  console.log("   ✓ RBAC 驗證通過！\n");

  console.log("2.1 管理員權限應明確列舉所有 action 且不含萬用字元...");
  const adminPerms = registry.buildRolePermissions().admin;
  assert.strictEqual(adminPerms.indexOf("*"), -1, "管理員權限不得包含 *");
  assert.deepStrictEqual(adminPerms, registry.listActions(), "管理員權限應列舉所有已登錄 action");
  assert(adminPerms.indexOf("getActivityLog") !== -1, "管理員權限應含 getActivityLog");
  registry.listActions().forEach(function (action) {
    assert.strictEqual(api.hasPermission("admin", action), true, "管理員應可執行：" + action);
  });
  console.log("   ✓ 管理員明確列舉驗證通過！\n");

  console.log("3. 路由應拒絕未登錄的 action...");
  const result = api.routeWebApiAction("not_registered", {}, null);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, "unknown_action");
  console.log("   ✓ 路由守門驗證通過！\n");

  console.log("4. 後端應為所有登錄 action 註冊 handler...");
  const missingHandlers = registry.listActions().filter(function (name) {
    return typeof registry.getHandler(name) !== "function";
  });
  assert.deepStrictEqual(missingHandlers, []);
  console.log("   ✓ handler 完整性驗證通過！\n");

  console.log("5. handler 註冊應拒絕無效輸入...");
  assert.strictEqual(
    registry.setHandler("not_registered", function () {}),
    false
  );
  assert.strictEqual(registry.setHandler("ping", null), false);
  assert.strictEqual(registry.getHandler("not_registered"), null);
  console.log("   ✓ handler 輸入驗證通過！\n");

  console.log("6. 路由應呼叫登錄表中的 handler...");
  const originalHandler = registry.getHandler("getPublicConfig");
  const routed = api.routeWebApiAction("ping", {}, null);
  assert.strictEqual(routed.ok, true);
  registry.setHandler("getPublicConfig", function () {
    return { ok: true, fromRegistry: true };
  });
  try {
    assert.deepStrictEqual(api.routeWebApiAction("getPublicConfig", {}, null), {
      ok: true,
      fromRegistry: true
    });
  } finally {
    registry.setHandler("getPublicConfig", originalHandler);
  }
  console.log("   ✓ 登錄表路由驗證通過！\n");

  console.log("7. mock handler 應完整覆蓋所有已登錄 action...");
  const mockSource = fs.readFileSync(path.join(__dirname, "..", "webapp", "js", "mock.js"), "utf8");
  const handlerBlock = mockSource.match(/const actionHandlers = \{([\s\S]*?)\n    \};/);
  assert(handlerBlock, "找不到 mock actionHandlers 定義");
  const handlerKeys = Array.from(handlerBlock[1].matchAll(/^\s{6}([A-Za-z0-9_]+):/gm))
    .map(function (m) {
      return m[1];
    })
    .sort();
  assert.deepStrictEqual(handlerKeys, registry.listActions().slice().sort());
  console.log("   ✓ mock handler 完整性驗證通過！\n");

  console.log("8. 日誌中繼資料應完整且心跳動作被排除...");
  registry.listActions().forEach(function (name) {
    const meta = registry.getActionMeta(name);
    assert(meta, name + " 應有日誌中繼資料");
    assert(["write", "query", "auth"].indexOf(meta.category) !== -1, name + " 類別應有效");
    assert.strictEqual(typeof meta.label, "string", name + " 標籤應為字串");
    assert.strictEqual(typeof meta.detailKey, "string", name + " 詳情鍵應為字串");
    assert.strictEqual(typeof meta.enabled, "boolean", name + " 啟用旗標應為布林值");
  });
  assert.strictEqual(registry.getActionMeta("ping").enabled, false);
  assert.strictEqual(registry.getActionMeta("getPublicConfig").enabled, false);
  assert.strictEqual(registry.getActionMeta("importCourseCodes").enabled, true);
  assert.strictEqual(registry.getActionMeta("not_registered"), null);
  console.log("   ✓ 日誌中繼資料驗證通過！\n");

  console.log("9. mock 應依登錄表拒絕未登錄 action...");
  const mockApi = mock.createMockApi({
    actionRegistry: registry,
    setTimeoutFn: function (fn) {
      fn();
    }
  });
  mockApi
    .handle("not_registered", {})
    .then(function (res) {
      assert.strictEqual(res.error, "unknown_mock_action");
      assert.strictEqual(typeof registry.getHandler("getActivityLog"), "function");
      assert.strictEqual(registry.getActionMeta("getActivityLog").enabled, false);
      console.log("   ✓ mock 守門驗證通過！\n");
      console.log("✓ actionRegistry.test.js 測試全數通過！\n");
    })
    .catch(function (error) {
      console.error(error);
      process.exit(1);
    });
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
