"use strict";

/**
 * webapp/js/app.js applyInitialAuth / applyAccountSwitch 單元測試（G5.5）。
 */

const assert = require("assert");
const appModule = require("../webapp/js/app.js");
const createDeps = require("./helpers/appControllerDeps.js").createDeps;

console.log("開始執行 webapp/js/app.js 初始授權測試...\n");

function run() {
  const none = createDeps();
  none.deps.window.INITIAL_AUTH = null;
  const noneApp = appModule.createAppController(none.deps);
  assert.strictEqual(noneApp.applyInitialAuth(), false);
  assert.strictEqual(none.calls.historyReplace, null);
  console.log("1. 無初始授權資料時回傳 false ✓\n");

  const success = createDeps();
  success.deps.window.INITIAL_AUTH = { ok: true, user: { name: "A" } };
  const successApp = appModule.createAppController(success.deps);
  assert.strictEqual(successApp.applyInitialAuth(), true);
  assert.strictEqual(success.calls.historyReplace.url, "https://x.test/app");
  assert.strictEqual(success.calls.applyLoginSuccess.length, 1);
  assert.strictEqual(success.calls.applyLoginSuccess[0].user.name, "A");
  assert.strictEqual(success.deps.window.INITIAL_AUTH == null, true);
  console.log("2. 登入成功時清理網址並套用結果 ✓\n");

  const withToken = createDeps();
  withToken.deps.window.INITIAL_AUTH = { ok: false, message: "登入失敗" };
  withToken.MEA.api.getToken = function () {
    return "tok";
  };
  const withTokenApp = appModule.createAppController(withToken.deps);
  assert.strictEqual(withTokenApp.applyInitialAuth(), true);
  assert.strictEqual(withToken.calls.restore, 1);
  assert.strictEqual(withToken.state.loginError, "登入失敗");
  assert.strictEqual(withToken.state.view, "loading");
  console.log("3. 失敗但已有 token 時還原工作階段 ✓\n");

  const noToken = createDeps();
  noToken.deps.window.INITIAL_AUTH = { ok: false, message: "拒絕" };
  noToken.MEA.api.getToken = function () {
    return "";
  };
  const noTokenApp = appModule.createAppController(noToken.deps);
  assert.strictEqual(noTokenApp.applyInitialAuth(), true);
  assert.strictEqual(noToken.state.view, "login");
  assert.strictEqual(noToken.state.loginBusy, false);
  assert.strictEqual(noToken.state.loginError, "拒絕");

  const defaultMessage = createDeps();
  defaultMessage.deps.window.INITIAL_AUTH = { ok: false };
  defaultMessage.MEA.api.getToken = function () {
    return "";
  };
  const defaultApp = appModule.createAppController(defaultMessage.deps);
  assert.strictEqual(defaultApp.applyInitialAuth(), true);
  assert.strictEqual(defaultMessage.state.loginError, "Google 登入失敗，請重新嘗試");
  console.log("4. 失敗且無 token 時導向登入並顯示訊息 ✓\n");

  const switchCtx = createDeps();
  const switchApp = appModule.createAppController(switchCtx.deps);
  assert.strictEqual(switchApp.applyAccountSwitch(), false);

  switchCtx.MEA.config.switchAccount = true;
  assert.strictEqual(switchApp.applyAccountSwitch(), true);
  assert.deepStrictEqual(switchCtx.calls.setToken, [""]);
  assert.deepStrictEqual(switchCtx.calls.setCsrfToken, [""]);
  assert.strictEqual(switchCtx.calls.loginActiveUser, 1);
  assert.strictEqual(switchCtx.calls.historyReplace.url, "https://x.test/app");
  console.log("5. 切換帳號時清除憑證並重新登入 ✓\n");

  console.log("✓ webapp/js/app.js 初始授權測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
