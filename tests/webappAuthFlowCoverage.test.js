"use strict";

/**
 * webapp/js/auth.js 與 app.js 啟動／登入流程整合測試（G6.8）。
 * 涵蓋工作階段還原、INITIAL_AUTH、switch=1、GAS/GIS/模擬模式分流與登出行為。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");
const appModule = require("../webapp/js/app.js");
const authHelper = require("./helpers/authDeps.js");
const appHelper = require("./helpers/appControllerDeps.js");
const createDeps = authHelper.createDeps;
const flush = authHelper.flush;

console.log("開始執行 webapp/js/auth.js 啟動與登入流程測試...\n");

function run() {
  let logoutCtx;
  let credentialCtx;
  let activeCtx;
  let mockLoginCtx;
  const initial = appHelper.createDeps();
  initial.deps.window.INITIAL_AUTH = {
    ok: true,
    token: "initial-token",
    email: "initial@example.test",
    role: "admin"
  };
  const initialApp = appModule.createAppController(initial.deps);
  assert.strictEqual(initialApp.applyInitialAuth(), true);
  assert.strictEqual(initial.calls.applyLoginSuccess.length, 1);
  assert.strictEqual(initial.calls.applyLoginSuccess[0].token, "initial-token");
  assert.strictEqual(initial.calls.historyReplace.url, "https://x.test/app");
  assert.strictEqual(initial.deps.window.INITIAL_AUTH, undefined);
  assert.strictEqual(initial.calls.restore, 0);
  console.log("1. INITIAL_AUTH 成功資料交由 applyLoginSuccess 處理 ✓\n");

  const initialFail = appHelper.createDeps();
  initialFail.deps.window.INITIAL_AUTH = { ok: false, message: "Google 登入失敗" };
  initialFail.deps.MEA.api.getToken = function () {
    return "existing-token";
  };
  const failApp = appModule.createAppController(initialFail.deps);
  assert.strictEqual(failApp.applyInitialAuth(), true);
  assert.strictEqual(initialFail.calls.restore, 1);
  assert.strictEqual(initialFail.state.loginError, "Google 登入失敗");
  console.log("2. INITIAL_AUTH 失敗但仍有權杖時走還原流程 ✓\n");

  const initialNoToken = appHelper.createDeps();
  initialNoToken.deps.window.INITIAL_AUTH = { ok: false, message: "憑證無效" };
  const noTokenApp = appModule.createAppController(initialNoToken.deps);
  assert.strictEqual(noTokenApp.applyInitialAuth(), true);
  assert.strictEqual(initialNoToken.state.view, "login");
  assert.strictEqual(initialNoToken.state.loginBusy, false);
  assert.strictEqual(initialNoToken.state.loginError, "憑證無效");
  assert.strictEqual(initialNoToken.calls.restore, 0);
  console.log("3. INITIAL_AUTH 失敗且無權杖時回到登入畫面 ✓\n");

  const switchCtx = appHelper.createDeps();
  switchCtx.MEA.config.switchAccount = true;
  const switchApp = appModule.createAppController(switchCtx.deps);
  assert.strictEqual(switchApp.applyAccountSwitch(), true);
  assert.deepStrictEqual(switchCtx.calls.setToken, [""]);
  assert.deepStrictEqual(switchCtx.calls.setCsrfToken, [""]);
  assert.strictEqual(switchCtx.calls.loginActiveUser, 1);
  assert(switchCtx.calls.historyReplace.url.indexOf("?") === -1);
  console.log("4. switch=1 清除憑證並重新以目前帳號登入 ✓\n");

  const boot = appHelper.createDeps();
  const bootApp = appModule.createAppController(boot.deps);
  return bootApp
    .init()
    .then(function () {
      assert.strictEqual(boot.calls.restore, 1);
      assert.strictEqual(boot.state.publicConfig.systemName, "SYS");
      assert.strictEqual(boot.calls.apiCalls[0].action, "getPublicConfig");
      console.log("5. 一般啟動取得公開設定後還原工作階段 ✓\n");

      const failedConfig = appHelper.createDeps();
      failedConfig.deps.MEA.api.call = function () {
        return Promise.reject(new Error("取得設定失敗"));
      };
      const failedApp = appModule.createAppController(failedConfig.deps);
      return failedApp.init();
    })
    .then(function () {
      console.log("6. 公開設定取得失敗仍續行還原流程 ✓\n");

      const mockCtx = createDeps({ config: { mock: true } });
      mockCtx.apiResponses.getSession = { ok: true, name: "模擬還原", role: "admin" };
      const mockAuth = authModule.createAuthController(mockCtx.deps);
      assert.strictEqual(mockAuth.isGasHosted(), false);
      mockAuth.restore();
      return flush();
    })
    .then(function () {
      console.log("7. 模擬模式還原成功且判定為非 GAS 環境 ✓\n");

      const gasCtx = createDeps({ google: { script: { run: {} } } });
      const gasAuth = authModule.createAuthController(gasCtx.deps);
      assert.strictEqual(gasAuth.isGasHosted(), true);
      gasAuth.renderGoogleButton();
      assert(gasCtx.elements.googleLoginButton.innerHTML.indexOf("google-redirect-btn") !== -1);
      console.log("8. GAS 環境分流至重導向按鈕 ✓\n");

      const gisId = {
        initialize: function () {},
        renderButton: function () {}
      };
      const gisCtx = createDeps({ google: { accounts: { id: gisId } } });
      gisCtx.state.publicConfig = { clientId: "client-gis" };
      const gisAuth = authModule.createAuthController(gisCtx.deps);
      assert.strictEqual(gisAuth.isGasHosted(), false);
      return gisAuth.loadGis().then(function (id) {
        assert.strictEqual(id, gisId);
        console.log("9. GIS 環境可直接取得用戶端實例 ✓\n");
      });
    })
    .then(function () {
      const listeners = {};
      const existing = {
        addEventListener: function (event, handler) {
          listeners[event] = handler;
        }
      };
      const scriptCtx = createDeps();
      scriptCtx.deps.document.querySelector = function () {
        return existing;
      };
      const scriptAuth = authModule.createAuthController(scriptCtx.deps);
      const pending = scriptAuth.loadGis();
      const existingId = { initialize: function () {} };
      scriptCtx.hostWindow.google = { accounts: { id: existingId } };
      listeners.load();
      return pending.then(function (id) {
        assert.strictEqual(id, existingId);
        console.log("10. 既有 GIS 指令碼載入完成後解析依賴 ✓\n");
      });
    })
    .then(function () {
      const createdCtx = createDeps();
      const createdAuth = authModule.createAuthController(createdCtx.deps);
      const pending = createdAuth.loadGis();
      const script = createdCtx.calls.appendedScripts[0];
      assert.strictEqual(script.src, authModule.constants.GIS_SRC);
      const createdId = { renderButton: function () {} };
      createdCtx.hostWindow.google = { accounts: { id: createdId } };
      script.onload();
      return pending
        .then(function (id) {
          assert.strictEqual(id, createdId);
          console.log("11. 新建 GIS 指令碼載入完成後解析依賴 ✓\n");

          const errorCtx = createDeps();
          const errorAuth = authModule.createAuthController(errorCtx.deps);
          const errorPending = errorAuth.loadGis();
          errorCtx.calls.appendedScripts[0].onerror();
          return errorPending.then(
            function () {
              throw new Error("載入失敗應拒絕 Promise");
            },
            function (error) {
              assert.strictEqual(error.message, "Google 登入服務載入失敗，請檢查網路連線");
            }
          );
        })
        .then(function () {
          console.log("12. GIS 指令碼載入失敗拒絕並附繁體中文訊息 ✓\n");
        });
    })
    .then(function () {
      logoutCtx = createDeps({ config: { mock: true } });
      logoutCtx.calls.currentToken = "logout-token";
      logoutCtx.calls.currentCsrfToken = "logout-csrf";
      logoutCtx.state.view = "app";
      logoutCtx.state.user = { email: "bye@example.test" };
      const logoutAuth = authModule.createAuthController(logoutCtx.deps);
      logoutAuth.logout();
      return flush();
    })
    .then(function () {
      assert.deepStrictEqual(logoutCtx.calls.apiCalls[0].action, "logout");
      assert.deepStrictEqual(logoutCtx.calls.setToken.slice(-1), [""]);
      assert.deepStrictEqual(logoutCtx.calls.setCsrfToken.slice(-1), [""]);
      assert.strictEqual(logoutCtx.state.view, "login");
      assert.strictEqual(logoutCtx.state.user, null);
      assert.strictEqual(logoutCtx.state.loginBusy, false);
      assert.strictEqual(logoutCtx.calls.timeouts[0].ms, 50);
      logoutCtx.calls.timeouts[0].fn();
      console.log("13. 登出清除憑證、重置狀態並排程重繪 ✓\n");

      credentialCtx = createDeps();
      credentialCtx.apiResponses.login = {
        ok: true,
        token: "credential-token",
        email: "gis@example.test",
        role: "viewer"
      };
      const credentialAuth = authModule.createAuthController(credentialCtx.deps);
      credentialAuth.handleCredential({});
      assert.strictEqual(credentialCtx.state.loginError, "未取得 Google 登入憑證，請重試");
      credentialAuth.handleCredential({ credential: "cred-1" });
      return flush();
    })
    .then(function () {
      assert.strictEqual(credentialCtx.state.view, "app");
      assert.deepStrictEqual(credentialCtx.calls.setToken, ["credential-token"]);
      assert.strictEqual(credentialCtx.calls.apiCalls[0].payload.credential, "cred-1");
      console.log("14. GIS 憑證回呼與登入結果套用 ✓\n");

      activeCtx = createDeps();
      activeCtx.apiResponses.loginWithActiveUser = {
        ok: true,
        token: "active-token",
        email: "active@example.test"
      };
      const activeAuth = authModule.createAuthController(activeCtx.deps);
      activeAuth.loginActiveUser();
      return flush();
    })
    .then(function () {
      assert.strictEqual(activeCtx.calls.apiCalls[0].action, "loginWithActiveUser");
      assert.strictEqual(activeCtx.state.user.email, "active@example.test");
      mockLoginCtx = createDeps({ config: { mock: true } });
      mockLoginCtx.apiResponses.login = { ok: true, token: "mock-login" };
      const mockLoginAuth = authModule.createAuthController(mockLoginCtx.deps);
      mockLoginAuth.loginMock();
      return flush();
    })
    .then(function () {
      assert.deepStrictEqual(mockLoginCtx.calls.apiCalls[0].payload, { mock: true });
      assert.deepStrictEqual(mockLoginCtx.calls.setToken, ["mock-login"]);
      console.log("15. 目前帳號登入與模擬登入流程 ✓\n");
      console.log("✓ webapp/js/auth.js 啟動與登入流程測試全數通過！\n");
    });
}

try {
  Promise.resolve(run()).catch(function (error) {
    console.error(error);
    process.exit(1);
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}
