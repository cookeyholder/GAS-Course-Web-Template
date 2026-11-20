"use strict";

/**
 * webApi.js 防御分支覆蓋測試（批次 C 品質閘門補足）。
 *
 * 重構後 webApi.js 以 facade 轉發至拆分模組，並對鎖定選項、角色顯示名稱
 * 解析等加入安全降級分支。既有測試多在完整相依環境執行，本檔補足
 * 「選項缺席」「角色為空」「角色顯示名稱解析不可用」三條防御路徑，
 * 確認皆安全降級且不影響回傳結構。
 */

const assert = require("assert");
const webApi = require("../webApi.js");

console.log("開始執行 webApi.js 防御分支覆蓋測試...\n");

console.log("1. withScriptLock 在未傳 options 時應直接執行臨界區...\n");
{
  let called = 0;
  const result = webApi.withScriptLock(undefined, function (lockState) {
    called += 1;
    assert.strictEqual(lockState.hasLock, false);
    return "done";
  });
  assert.strictEqual(called, 1);
  assert.strictEqual(result, "done");
  console.log("   ✓ 選項缺席分支驗證通過！\n");
}

console.log("2. 記錄身分時空角色應降級為空顯示名稱...\n");
{
  const context = { action: "ping" };
  webApi.recordWebApiIdentity(context, { ok: true, session: { role: "", email: "a@example.com" } }, null);
  assert.strictEqual(context.role, "");
  assert.strictEqual(context.email, "a@example.com");
  console.log("   ✓ 空角色分支驗證通過！\n");
}

console.log("3. 角色顯示名稱解析不可用時應退回角色代碼字串...\n");
{
  const previous = globalThis.getRoleDisplayName;
  try {
    globalThis.getRoleDisplayName = null;
    const context = { action: "ping" };
    webApi.recordWebApiIdentity(context, { ok: true, session: { role: "staff" } }, null);
    assert.strictEqual(context.role, "staff");
  } finally {
    if (previous === undefined) delete globalThis.getRoleDisplayName;
    else globalThis.getRoleDisplayName = previous;
  }
  console.log("   ✓ 角色解析不可用分支驗證通過！\n");
}

console.log("✓ webApiDefensiveBranches.test.js 測試全數通過！\n");
