"use strict";

/**
 * actionRegistryFallback.test.js
 * 驗證隔離環境的 gasRuntime 缺少 ROLE_CODES 時，角色代碼正確退回同值常數。
 */

const assert = require("assert");

function run() {
  console.log("1. gasRuntime 缺少 ROLE_CODES 時應退回同值常數...");
  const registryPath = require.resolve("../actionRegistry.js");
  const hadGasRuntime = Object.prototype.hasOwnProperty.call(globalThis, "gasRuntime");
  const savedGasRuntime = globalThis.gasRuntime;
  const savedCache = require.cache[registryPath];

  try {
    // 模擬隔離環境：gasRuntime 存在但無 ROLE_CODES，迫使 resolveRoleCodes_ 走 fallback。
    globalThis.gasRuntime = {};
    delete require.cache[registryPath];
    const isolated = require("../actionRegistry.js");

    assert.strictEqual(isolated.listActions().length > 0, true, "fallback 仍應產生完整 action 清單");
    const adminPerms = isolated.buildRolePermissions().admin;
    assert.strictEqual(adminPerms.indexOf("*"), -1, "管理員權限不得包含 *");
    assert.deepStrictEqual(adminPerms, isolated.listActions(), "管理員權限應列舉所有 action");
    assert.strictEqual(
      isolated.isActionAllowed("admin", "getActivityLog"),
      true,
      "fallback 管理員 role code 應為 admin"
    );
    assert.strictEqual(
      isolated.isActionAllowed("staff", "importCourseCodes"),
      true,
      "fallback 業務 role code 應為 staff"
    );
    assert.strictEqual(
      isolated.isActionAllowed("viewer", "getActivityLog"),
      false,
      "fallback 檢視 role code 應為 viewer"
    );
    console.log("   ✓ fallback 角色代碼驗證通過！\n");
  } finally {
    delete require.cache[registryPath];
    if (savedCache) require.cache[registryPath] = savedCache;
    if (hadGasRuntime) {
      globalThis.gasRuntime = savedGasRuntime;
    } else {
      delete globalThis.gasRuntime;
    }
  }
}

if (require.main === module) {
  try {
    run();
    console.log("✓ 全部測試通過！");
  } catch (error) {
    console.error("✗ 測試失敗：", error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

module.exports = { run };
