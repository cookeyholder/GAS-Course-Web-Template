"use strict";

/**
 * webapp/js/app.js render/syncDocumentTitle 單元測試（G5.3）。
 */

const assert = require("assert");
const appModule = require("../webapp/js/app.js");
const createDeps = require("./helpers/appControllerDeps.js").createDeps;

console.log("開始執行 webapp/js/app.js render 測試...\n");

function run() {
  assert.strictEqual(typeof appModule.createAppController, "function", "應匯出 createAppController");
  console.log("1. 應匯出可測試的控制器建構函式 ✓\n");

  const ctx = createDeps();
  const app = appModule.createAppController(ctx.deps);

  ctx.state.view = "loading";
  app.render();
  assert(ctx.elements.app.innerHTML.indexOf("正在初始化系統連線與設定") !== -1);

  ctx.state.view = "login";
  ctx.calls.timeouts = [];
  app.render();
  assert(ctx.elements.app.innerHTML.indexOf("login-view") !== -1);
  assert.strictEqual(ctx.calls.timeouts.length, 1);
  assert.strictEqual(ctx.calls.renderGoogleButton, 1);
  console.log("2. loading/login 狀態輸出與延遲掛載按鈕 ✓\n");

  ctx.state.view = "app";
  ctx.state.tab = "overview";
  app.render();
  assert(ctx.elements.app.innerHTML.indexOf("overview-view") !== -1);
  assert(ctx.elements.app.innerHTML.indexOf("<header></header>") !== -1);
  assert(ctx.elements.app.innerHTML.indexOf("<nav></nav>") !== -1);

  ctx.state.tab = "import";
  app.render();
  assert(ctx.elements.app.innerHTML.indexOf("import-view") !== -1);

  ctx.state.tab = "courses";
  ctx.MEA.courses.renderView = function () {
    return '<div id="courses-view"></div>';
  };
  app.render();
  assert(ctx.elements.app.innerHTML.indexOf("courses-view") !== -1);

  ctx.state.tab = "settings";
  ctx.MEA.accounts.renderView = function () {
    return '<div id="settings-view"></div>';
  };
  app.render();
  assert(ctx.elements.app.innerHTML.indexOf("settings-view") !== -1);
  console.log("3. 各頁籤主體與外殼組合輸出 ✓\n");

  ctx.state.tab = "unknown-tab";
  app.render();
  assert(ctx.elements.app.innerHTML.indexOf("overview-view") !== -1, "未知頁籤應退回概覽畫面");
  console.log("3.1 未知頁籤退回概覽 ✓\n");

  const missing = createDeps();
  missing.deps.document.getElementById = function () {
    return null;
  };
  const missingApp = appModule.createAppController(missing.deps);
  assert.doesNotThrow(function () {
    missingApp.render();
  });

  const titled = createDeps();
  const titledApp = appModule.createAppController(titled.deps);
  titled.state.view = "loading";
  titled.state.publicConfig = { systemName: "系統A" };
  titled.deps.document.title = "舊標題";
  titledApp.render();
  assert.strictEqual(titled.deps.document.title, "系統A");
  console.log("4. 缺少掛載點與標題同步容錯 ✓\n");

  console.log("✓ webapp/js/app.js render 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
