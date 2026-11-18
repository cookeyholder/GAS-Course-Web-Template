"use strict";

/**
 * webapp/js/auth.js::renderGoogleButton 單元測試（G6.6）。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");
const helper = require("./helpers/authDeps.js");
const createDeps = helper.createDeps;
const flush = helper.flush;

console.log("開始執行 webapp/js/auth.js renderGoogleButton 測試...\n");

function run() {
  let failCtx;
  assert.strictEqual(authModule.detectGasHosting({ mock: true }, { script: { run: {} } }), false);
  assert.strictEqual(authModule.detectGasHosting({}, null), false);
  assert.strictEqual(authModule.detectGasHosting({}, {}), false);
  assert.strictEqual(authModule.detectGasHosting({}, { script: {} }), false);
  assert.strictEqual(authModule.detectGasHosting({}, { script: { run: {} } }), true);
  const idleHtml = authModule.buildGasHostedLoginButtonHtml(false);
  assert(idleHtml.indexOf("MEA.auth.switchGoogleAccount()") !== -1);
  assert(idleHtml.indexOf(" disabled") === -1);
  assert(authModule.buildGasHostedLoginButtonHtml(true).indexOf(" disabled") !== -1);
  console.log("1. GAS 環境判定與登入按鈕樣板純函式 ✓\n");

  const emptyHost = { innerHTML: "原文" };
  const doc = {
    getElementById: function () {
      return emptyHost;
    }
  };
  assert.strictEqual(authModule.prepareGoogleButton({ mock: true, document: doc }), null);
  const noHost = { getElementById: function () { return null; } };
  assert.strictEqual(authModule.prepareGoogleButton({ document: noHost }), null);
  const gasPrepared = authModule.prepareGoogleButton({
    document: doc,
    gasHosted: true,
    loginBusy: true
  });
  assert(gasPrepared.html.indexOf(" disabled") !== -1);
  assert.strictEqual(gasPrepared.clientId, "");
  const hint = authModule.prepareGoogleButton({ document: doc, publicConfig: {} });
  assert.strictEqual(hint.html, authModule.constants.CLIENT_ID_HINT_HTML);
  const gis = authModule.prepareGoogleButton({
    document: doc,
    publicConfig: { clientId: " client-a " }
  });
  assert.strictEqual(gis.html, "");
  assert.strictEqual(gis.clientId, "client-a");
  console.log("2. 按鈕 Prepare 分流純函式 ✓\n");

  const initOptions = authModule.buildGisInitializeOptions("client-a", function () {});
  assert.strictEqual(initOptions.client_id, "client-a");
  assert.strictEqual(initOptions.auto_select, false);
  assert.strictEqual(initOptions.cancel_on_tap_outside, true);
  assert.strictEqual(initOptions.ux_mode, "popup");
  assert.strictEqual(authModule.buildGisRenderOptions("dark").theme, "filled_black");
  assert.strictEqual(authModule.buildGisRenderOptions("light").theme, "outline");
  assert.strictEqual(authModule.buildGisRenderOptions("light").locale, "zh_TW");
  console.log("3. GIS 初始化與繪製參數純函式 ✓\n");

  const mockCtx = createDeps({ config: { mock: true } });
  mockCtx.elements.googleLoginButton.innerHTML = "保持原樣";
  const mockAuth = authModule.createAuthController(mockCtx.deps);
  mockAuth.renderGoogleButton();
  assert.strictEqual(mockCtx.elements.googleLoginButton.innerHTML, "保持原樣");
  console.log("4. 模擬模式不繪製按鈕 ✓\n");

  const missingCtx = createDeps();
  missingCtx.deps.document.getElementById = function () {
    return null;
  };
  authModule.createAuthController(missingCtx.deps).renderGoogleButton();
  console.log("5. 缺少按鈕掛載點時安全返回 ✓\n");

  const gasCtx = createDeps({ google: { script: { run: {} } } });
  const gasAuth = authModule.createAuthController(gasCtx.deps);
  gasAuth.renderGoogleButton();
  assert(gasCtx.elements.googleLoginButton.innerHTML.indexOf("google-redirect-btn") !== -1);
  assert(gasCtx.elements.googleLoginButton.innerHTML.indexOf(" disabled") === -1);
  gasCtx.state.loginBusy = true;
  gasAuth.renderGoogleButton();
  assert(gasCtx.elements.googleLoginButton.innerHTML.indexOf(" disabled") !== -1);
  console.log("6. GAS 模式繪製導向按鈕並反映忙碌狀態 ✓\n");

  const hintCtx = createDeps();
  authModule.createAuthController(hintCtx.deps).renderGoogleButton();
  assert(hintCtx.elements.googleLoginButton.innerHTML.indexOf("尚未設定 OAuth Client ID") !== -1);
  console.log("7. 本機缺少 Client ID 顯示提示 ✓\n");

  const initialized = [];
  const rendered = [];
  const gisId = {
    initialize: function (options) {
      initialized.push(options);
    },
    renderButton: function (host, options) {
      rendered.push({ host: host, options: options });
    }
  };
  const gisCtx = createDeps({ google: { accounts: { id: gisId } } });
  gisCtx.state.publicConfig = { clientId: "client-a" };
  gisCtx.calls.currentTheme = "dark";
  const gisAuth = authModule.createAuthController(gisCtx.deps);
  gisAuth.renderGoogleButton();
  return flush()
    .then(function () {
      assert.strictEqual(initialized.length, 1);
      assert.strictEqual(initialized[0].client_id, "client-a");
      assert.strictEqual(rendered.length, 1);
      assert.strictEqual(rendered[0].options.theme, "filled_black");
      assert.strictEqual(rendered[0].host, gisCtx.elements.googleLoginButton);
      gisAuth.renderGoogleButton();
      return flush();
    })
    .then(function () {
      assert.strictEqual(initialized.length, 1, "同一 Client ID 不得重複初始化");
      gisCtx.state.publicConfig = { clientId: "client-b" };
      gisCtx.calls.currentTheme = "light";
      gisAuth.renderGoogleButton();
      return flush();
    })
    .then(function () {
      assert.strictEqual(initialized.length, 2);
      assert.strictEqual(initialized[1].client_id, "client-b");
      assert.strictEqual(rendered[2].options.theme, "outline");
      console.log("8. GIS 模式初始化一次並依主題繪製按鈕 ✓\n");

      const handlers = {};
      const existing = {
        addEventListener: function (event, handler) {
          handlers[event] = handler;
        }
      };
      failCtx = createDeps();
      failCtx.state.publicConfig = { clientId: "client-c" };
      failCtx.deps.document.querySelector = function () {
        return existing;
      };
      const failAuth = authModule.createAuthController(failCtx.deps);
      failAuth.renderGoogleButton();
      handlers.error();
      return flush();
    })
    .then(function () {
      assert.strictEqual(failCtx.state.loginError, "Google 登入服務載入失敗");
      console.log("9. 既有指令碼載入失敗時顯示錯誤訊息分支 ✓\n");
      console.log("✓ webapp/js/auth.js renderGoogleButton 測試全數通過！\n");
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
