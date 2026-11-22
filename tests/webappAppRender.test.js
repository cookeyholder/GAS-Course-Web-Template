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
  assert(ctx.elements.app.innerHTML.indexOf('class="app-footer"') !== -1, "畫面應包含頁尾元素");
  assert(ctx.elements.app.innerHTML.indexOf('role="contentinfo"') !== -1, "頁尾應具備 contentinfo 角色");
  assert(ctx.elements.app.innerHTML.indexOf("說明手冊") !== -1, "頁尾應包含說明手冊連結");
  assert(
    ctx.elements.app.innerHTML.indexOf('aria-label="說明手冊（另開新分頁）"') !== -1,
    "說明手冊連結應具備精確無障礙標籤"
  );
  assert(ctx.elements.app.innerHTML.indexOf('target="_blank"') !== -1, "說明手冊連結應為另開新分頁");
  assert(ctx.elements.app.innerHTML.indexOf('rel="noopener noreferrer"') !== -1, "外部連結應有安全 rel 屬性");

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

  console.log("5. renderFooterHtml 防禦性分支覆蓋測試...\n");
  assert(typeof appModule.renderFooterHtml === "function");
  // 1. null MEA
  const f1 = appModule.renderFooterHtml(null);
  assert(f1.indexOf("GAS-Course-Web-Template") !== -1);
  assert(f1.indexOf("docs/user-guide.html") !== -1);

  // 2. 空物件 MEA
  const f2 = appModule.renderFooterHtml({});
  assert(f2.indexOf("GAS-Course-Web-Template") !== -1);

  // 3. 自訂 appName 但無 version
  const f3 = appModule.renderFooterHtml({ config: { appName: "校務系統", version: "" } });
  assert(f3.indexOf("校務系統") !== -1);
  assert(f3.indexOf(" v") === -1);

  // 4. 無 ui 物件（使用內建 local escape 與預設 guideUrl）
  const f4 = appModule.renderFooterHtml({ config: { appName: "<自訂系統>", version: "1.0" } });
  assert(f4.indexOf("&lt;自訂系統&gt; v1.0") !== -1);

  // 5. 透過 controller 實例呼叫 renderFooterHtml
  assert(typeof app.renderFooterHtml === "function");
  assert(app.renderFooterHtml().indexOf("app-footer") !== -1);
  console.log("   ✓ renderFooterHtml 防禦性分支全數覆蓋！\n");

  console.log("✓ webapp/js/app.js render 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
