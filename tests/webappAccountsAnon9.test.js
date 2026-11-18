"use strict";

/**
 * webapp/js/accounts.js 匿名方法 9 單元測試（G7.4）。
 * 實際對應：saveAccountsList 中的 then 回呼（原 L187-196），重構後抽為 handleWhitelistSaveResult。
 */

const assert = require("assert");
const accountsModule = require("../webapp/js/accounts.js");
const depsFactory = require("./helpers/accountsCoursesDeps.js");
const createDeps = depsFactory.createAccountsDeps;
const flush = depsFactory.flush;

console.log("開始執行 webapp/js/accounts.js 匿名方法 9 測試...\n");

function setup(result, useReject) {
  const ctx = createDeps();
  ctx.state.settings.accounts = [
    { email: "a@example.com", name: "管理員", role: "admin", roleName: "系統管理員", enabled: true },
    { email: "b@example.com", name: "業務", role: "staff", roleName: "業務人員", enabled: false }
  ];
  ctx.setResponder(function () {
    return useReject ? Promise.reject(result) : Promise.resolve(result);
  });
  const controller = accountsModule.createAccountsModule(ctx.deps);
  controller.toggleAccount("a@example.com");
  return ctx;
}

async function run() {
  let ctx = setup({ ok: true });
  assert.strictEqual(ctx.state.settings.saving, true, "送出後應先進入儲存中");
  assert.strictEqual(ctx.state.settings.accounts[0].enabled, false, "切換應更新本機狀態");
  await flush();
  assert.strictEqual(ctx.state.settings.saving, false);
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "授權白名單已更新！", kind: "ok" }]);
  assert.strictEqual(ctx.calls.apiCalls[0].action, "saveWhitelist");
  console.log("1. 成功更新白名單 ✓\n");

  ctx = setup({ ok: false, message: "後端拒絕更新" });
  await flush();
  assert.strictEqual(ctx.state.settings.saving, false);
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "後端拒絕更新", kind: "err" }]);
  console.log("2. 失敗並顯示後端錯誤訊息 ✓\n");

  ctx = setup({ ok: false });
  await flush();
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "白名單更新失敗", kind: "err" }]);
  console.log("3. 失敗且無訊息時使用預設文字 ✓\n");

  ctx = setup(null);
  await flush();
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "白名單更新失敗", kind: "err" }]);
  console.log("4. 空回應視為失敗 ✓\n");

  ctx = setup(new Error("連線中斷"), true);
  await flush();
  assert.strictEqual(ctx.state.settings.saving, false);
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "連線中斷", kind: "err" }]);
  console.log("5. 例外路徑結束儲存中並顯示錯誤 ✓\n");

  console.log("✓ webapp/js/accounts.js 匿名方法 9 測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
