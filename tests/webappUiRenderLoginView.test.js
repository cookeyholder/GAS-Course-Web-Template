"use strict";

/**
 * webapp/js/ui.js::renderLoginView 單元測試（G7.14）。
 * 驗證 Mock、GAS 託管、GIS、未設定 Client ID、錯誤提示與主題/風格控制項。
 */

const assert = require("assert");
const uiModule = require("../webapp/js/ui.js");
const createDeps = require("./helpers/importsUiDeps.js").createUiDeps;

console.log("開始執行 webapp/js/ui.js renderLoginView 測試...\n");

function run() {
  assert.strictEqual(typeof uiModule.createUiModule, "function", "應匯出 UI 模組工廠");
  assert.strictEqual(typeof uiModule.renderStyleOptions, "function", "應匯出風格選單函式");
  console.log("1. 可測試工廠與拆分函式匯出 ✓\n");

  const mock = createDeps();
  mock.config.mock = true;
  mock.doc.documentElement.dataset.style = "paper";
  mock.doc.documentElement.dataset.theme = "dark";
  mock.state.loginBusy = true;
  let html = mock.ui.renderLoginView();
  assert(html.indexOf("目前為本機 Mock 模式") !== -1);
  assert(html.indexOf("🧪 本地測試身分登入 (Mock Mode)") !== -1);
  assert(html.indexOf('onclick="MEA.auth.loginMock()"') !== -1);
  assert(html.indexOf('id="loginThemeToggle"') !== -1);
  assert(html.indexOf("◑ 淺色") !== -1);
  assert(html.indexOf('<option value="paper" selected>') !== -1);
  assert(html.indexOf('<option value="modern-slate">') !== -1);
  assert(html.indexOf('onchange="MEA.ui.applyStyle(this.value)"') !== -1);

  mock.state.loginBusy = false;
  mock.doc.documentElement.dataset.theme = "light";
  html = mock.ui.renderLoginView();
  assert(html.indexOf("◐ 深色") !== -1);
  assert(html.indexOf(" disabled") === -1);
  console.log("2. Mock 模式提示、按鈕、風格與主題控制項 ✓\n");

  const gas = createDeps();
  gas.MEA.auth.isGasHosted = function () {
    return true;
  };
  gas.state.publicConfig = { activeEmail: "  teacher@example.edu.tw  " };
  html = gas.ui.renderLoginView();
  assert(html.indexOf("目前瀏覽器 Google 帳號：<strong>teacher@example.edu.tw</strong>") !== -1);
  assert(html.indexOf("Mock Mode") === -1);

  gas.state.publicConfig = {};
  html = gas.ui.renderLoginView();
  assert(html.indexOf("將透過 Google 帳戶選擇器以目前瀏覽器 Google 帳號登入。") !== -1);
  console.log("3. GAS 託管帳號提示與空 Email 分支 ✓\n");

  const gis = createDeps();
  gis.state.publicConfig = { clientId: "client.apps.googleusercontent.com" };
  html = gis.ui.renderLoginView();
  assert(html.indexOf("使用 Google Identity Services 憑證進行登入驗證。") !== -1);

  const noClient = createDeps();
  html = noClient.ui.renderLoginView();
  assert(html.indexOf("尚未設定 OAuth Client ID") !== -1);

  const noAuth = createDeps();
  noAuth.MEA.auth = null;
  assert.doesNotThrow(function () {
    noAuth.ui.renderLoginView();
  });
  console.log("4. GIS、未設定憑證與無 auth 物件容錯 ✓\n");

  const error = createDeps();
  error.state.loginError = "<登入失敗>";
  error.state.publicConfig = { systemName: "<測試系統>" };
  html = error.ui.renderLoginView();
  assert(html.indexOf("&lt;登入失敗&gt;") !== -1);
  assert(html.indexOf('<h2 class="login-title">&lt;測試系統&gt;</h2>') !== -1);
  console.log("5. 登入錯誤與系統名稱應跳脫 HTML ✓\n");

  console.log("✓ webapp/js/ui.js renderLoginView 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
