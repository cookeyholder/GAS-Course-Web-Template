"use strict";

/**
 * authFailureHandling.test.js（task 4.7）
 * 驗證 API 拒絕時有明確回饋，且允許網域大小寫與後端正規化一致。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");
const helper = require("./helpers/authDeps.js");
const flush = helper.flush;

(async function run() {
  console.log("開始執行 auth 失敗回饋與網域大小寫測試...\n");

  console.log("1. 允許網域應正規化為小寫...");
  assert.strictEqual(authModule.normalizeAllowedDomain(" @Example.EDU.TW "), "example.edu.tw");
  const url = authModule.buildAccountChooserUrl("https://script.google.com/macros/s/id/exec", "Example.EDU.TW");
  assert(url.indexOf("&hd=example.edu.tw") !== -1, "hd 參數應為小寫網域");
  console.log("   ✓ 網域大小寫驗證通過！\n");

  console.log("2. loginMock 拒絕時應設定 loginError 並顯示 Toast...");
  const loginCtx = helper.createDeps({ config: { mock: true } });
  loginCtx.deps.MEA.api.call = function () {
    return Promise.reject(new Error("登入服務暫時無法連線"));
  };
  const loginAuth = authModule.createAuthController(loginCtx.deps);
  loginAuth.loginMock();
  await flush();
  assert.strictEqual(loginCtx.state.loginError, authModule.constants.DEFAULT_LOGIN_ERROR);
  assert.strictEqual(loginCtx.state.loginBusy, false);
  assert.deepStrictEqual(loginCtx.calls.toasts, [{ message: authModule.constants.DEFAULT_LOGIN_ERROR, level: "err" }]);
  console.log("   ✓ loginMock 失敗回饋驗證通過！\n");

  console.log("3. restore 拒絕時應明確提示而非靜默失敗...");
  const restoreCtx = helper.createDeps({ config: { mock: true } });
  restoreCtx.deps.MEA.api.call = function () {
    return Promise.reject(new Error("工作階段讀取失敗"));
  };
  const restoreAuth = authModule.createAuthController(restoreCtx.deps);
  restoreAuth.restore();
  await flush();
  assert.strictEqual(restoreCtx.state.loginError, authModule.constants.DEFAULT_LOGIN_ERROR);
  assert.strictEqual(restoreCtx.state.view, "loading");
  assert.deepStrictEqual(restoreCtx.calls.toasts, [
    { message: authModule.constants.DEFAULT_LOGIN_ERROR, level: "err" }
  ]);
  console.log("   ✓ restore 失敗回饋驗證通過！\n");

  console.log("✓ auth 失敗回饋與網域大小寫測試全數通過！\n");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
