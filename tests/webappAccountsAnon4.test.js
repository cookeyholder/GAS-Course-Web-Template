"use strict";

/**
 * webapp/js/accounts.js 匿名方法 4 單元測試（G7.3）。
 * 實際對應：saveSettings 中的 then 回呼（原 L65-86），重構後抽為 handleSettingsSaveResult。
 */

const assert = require("assert");
const accountsModule = require("../webapp/js/accounts.js");
const depsFactory = require("./helpers/accountsCoursesDeps.js");
const createDeps = depsFactory.createAccountsDeps;
const flush = depsFactory.flush;

console.log("開始執行 webapp/js/accounts.js 匿名方法 4 測試...\n");

function setup(result, publicConfig) {
  const ctx = createDeps();
  ctx.state.publicConfig = publicConfig === undefined ? { systemName: "舊系統", extra: "保留欄位" } : publicConfig;
  Object.assign(ctx.elements, {
    cfgSystemName: { value: "新系統" },
    cfgSchoolYear: { value: "115" },
    cfgSemester: { value: "2" },
    cfgClientId: { value: " client.apps " },
    cfgClientSecret: { value: " sec " },
    cfgAllowedDomain: { value: " @KSVS.KH.EDU.TW " },
    cfgRestrictWhitelist: { checked: true }
  });
  ctx.setResponder(function () {
    return Promise.resolve(result);
  });
  const controller = accountsModule.createAccountsModule(ctx.deps);
  controller.saveSettings();
  return ctx;
}

async function run() {
  let ctx = setup({ ok: true });
  assert.strictEqual(ctx.state.settings.saving, true, "送出後應先進入儲存中");
  await flush();
  assert.strictEqual(ctx.state.settings.saving, false, "成功後應結束儲存中");
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "系統參數已成功儲存！", kind: "ok" }]);
  assert.strictEqual(ctx.state.publicConfig.systemName, "新系統");
  assert.strictEqual(ctx.state.publicConfig.schoolYear, "115");
  assert.strictEqual(ctx.state.publicConfig.semester, "2");
  assert.strictEqual(ctx.state.publicConfig.clientId, "client.apps");
  assert.strictEqual(ctx.state.publicConfig.allowedDomain, "ksvs.kh.edu.tw");
  assert.strictEqual(ctx.state.publicConfig.hasClientSecret, true);
  assert.strictEqual(ctx.state.publicConfig.extra, "保留欄位", "應保留原有公眾設定欄位");
  console.log("1. 成功儲存並更新公眾設定 ✓\n");

  ctx = setup({ ok: true }, null);
  await flush();
  assert.strictEqual(ctx.calls.toast[0].message, "系統參數已成功儲存！");
  assert.strictEqual(ctx.state.publicConfig, null, "無公眾設定時不應建立新物件");
  console.log("2. 成功儲存但無公眾設定 ✓\n");

  ctx = setup({ ok: false, message: "自訂錯誤訊息" });
  await flush();
  assert.strictEqual(ctx.state.settings.saving, false);
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "自訂錯誤訊息", kind: "err" }]);
  assert.strictEqual(ctx.state.publicConfig.systemName, "舊系統", "失敗時不應更新公眾設定");
  console.log("3. 失敗並顯示後端錯誤訊息 ✓\n");

  ctx = setup({ ok: false });
  await flush();
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "儲存失敗", kind: "err" }]);
  console.log("4. 失敗且無錯誤訊息時使用預設文字 ✓\n");

  ctx = setup(null);
  await flush();
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "儲存失敗", kind: "err" }]);
  console.log("5. 空回應視為失敗 ✓\n");

  console.log("✓ webapp/js/accounts.js 匿名方法 4 測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
