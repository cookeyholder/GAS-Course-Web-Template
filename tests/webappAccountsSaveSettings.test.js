"use strict";

/**
 * webapp/js/accounts.js saveSettings 單元測試（G7.5）。
 * 驗證表單讀取、API payload 組裝、儲存中狀態與例外處理。
 */

const assert = require("assert");
const accountsModule = require("../webapp/js/accounts.js");
const depsFactory = require("./helpers/accountsCoursesDeps.js");
const createDeps = depsFactory.createAccountsDeps;
const flush = depsFactory.flush;

console.log("開始執行 webapp/js/accounts.js saveSettings 測試...\n");

function createController(ctx) {
  return accountsModule.createAccountsModule(ctx.deps);
}

async function run() {
  assert.strictEqual(typeof accountsModule.createAccountsModule, "function", "應匯出模組工廠");
  console.log("1. 模組工廠可匯入 ✓\n");

  let ctx = createDeps();
  Object.assign(ctx.elements, {
    cfgSystemName: { value: "  學校系統  " },
    cfgSchoolYear: { value: " 114 " },
    cfgSemester: { value: " 1 " },
    cfgClientId: { value: " client-id " },
    cfgClientSecret: { value: " secret " },
    cfgAllowedDomain: { value: "@KSVS.KH.edu.tw " },
    cfgRestrictWhitelist: { checked: true }
  });
  let prevented = 0;
  createController(ctx).saveSettings({
    preventDefault: function () {
      prevented++;
    }
  });
  assert.strictEqual(prevented, 1, "應呼叫 preventDefault");
  assert.strictEqual(ctx.calls.apiCalls.length, 1);
  const call = ctx.calls.apiCalls[0];
  assert.strictEqual(call.action, "saveSystemSettings");
  assert.deepStrictEqual(call.payload, {
    settings: {
      systemName: "學校系統",
      schoolYear: "114",
      semester: "1",
      clientId: "client-id",
      clientSecret: "secret",
      allowedLoginDomain: "ksvs.kh.edu.tw",
      restrictWhitelist: "true"
    }
  });
  await flush();
  assert.strictEqual(ctx.state.settings.saving, false);
  console.log("2. 表單值正規化與完整 payload ✓\n");

  ctx = createDeps();
  Object.assign(ctx.elements, {
    cfgSystemName: { value: "A" },
    cfgRestrictWhitelist: { checked: false }
  });
  createController(ctx).saveSettings(null);
  assert.strictEqual(ctx.calls.apiCalls[0].payload.settings.restrictWhitelist, "false");
  assert.strictEqual(ctx.calls.apiCalls[0].payload.settings.schoolYear, "", "缺少元素時應為空字串");
  assert.strictEqual(ctx.calls.apiCalls[0].payload.settings.allowedLoginDomain, "");
  await flush();
  console.log("3. 缺少部分表單元素時不中斷 ✓\n");

  ctx = createDeps();
  Object.assign(ctx.elements, {
    cfgSystemName: { value: "A" },
    cfgAllowedDomain: { value: "Example.EDU.TW" },
    cfgRestrictWhitelist: { checked: false }
  });
  createController(ctx).saveSettings();
  assert.strictEqual(
    ctx.calls.apiCalls[0].payload.settings.allowedLoginDomain,
    "example.edu.tw",
    "無 @ 前綴亦應轉小寫"
  );
  await flush();
  console.log("4. 允許網域小寫化 ✓\n");

  ctx = createDeps();
  Object.assign(ctx.elements, { cfgSystemName: { value: "A" } });
  ctx.setResponder(function () {
    return Promise.reject(new Error("伺服器忙碌"));
  });
  createController(ctx).saveSettings();
  assert.strictEqual(ctx.state.settings.saving, true);
  await flush();
  assert.strictEqual(ctx.state.settings.saving, false);
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "伺服器忙碌", kind: "err" }]);
  console.log("5. 例外路徑結束儲存中並顯示錯誤 ✓\n");

  console.log("✓ webapp/js/accounts.js saveSettings 測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
