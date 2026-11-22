"use strict";

/**
 * webapp/js/ui.js::renderOverviewView 單元測試（G7.15）。
 * 驗證登入機制判定、指標卡片、網域限制、使用者資訊與快速導覽入口。
 */

const assert = require("assert");
const uiModule = require("../webapp/js/ui.js");
const createDeps = require("./helpers/importsUiDeps.js").createUiDeps;

console.log("開始執行 webapp/js/ui.js renderOverviewView 測試...\n");

function run() {
  assert.strictEqual(typeof uiModule.createUiModule, "function", "應匯出 UI 模組工廠");
  console.log("1. 可測試工廠匯出 ✓\n");

  const base = createDeps();
  let html = base.ui.renderOverviewView();
  assert(html.indexOf("系統概覽儀表板") !== -1);
  assert(html.indexOf("114 - 1") !== -1);
  assert(html.indexOf("未設定 Client ID") !== -1);
  assert(html.indexOf("未限制登入網域") !== -1);
  assert(html.indexOf(">0</div>") !== -1);
  assert(html.indexOf('data-tab="import"') !== -1);
  assert(html.indexOf('data-tab="courses"') !== -1);
  assert(html.indexOf('data-tab="settings"') !== -1);
  console.log("2. 預設值、登入機制與三個快速入口 ✓\n");

  const filled = createDeps();
  filled.state.publicConfig = {
    schoolYear: "115",
    semester: "2",
    allowedDomain: "school.edu.tw",
    clientId: "id.apps.googleusercontent.com"
  };
  filled.state.user = { email: "teacher@school.edu.tw", role: "viewer" };
  filled.state.courses = { total: 12345 };
  html = filled.ui.renderOverviewView();
  assert(html.indexOf("115 - 2") !== -1);
  assert(html.indexOf("teacher@school.edu.tw") !== -1);
  assert(html.indexOf("角色權限：") !== -1);
  assert(html.indexOf("viewer") !== -1);
  assert(html.indexOf("Google Identity Services") !== -1);
  assert(html.indexOf("限制網域：@school.edu.tw") !== -1);
  assert(html.indexOf("12,345") !== -1);
  assert.strictEqual(filled.ui.getLoginMode(filled.state.publicConfig, filled.MEA.auth), "Google Identity Services");
  console.log("3. 自訂學期、網域限制與數字格式化 ✓\n");

  const hosted = createDeps();
  hosted.MEA.auth.isGasHosted = function () {
    return true;
  };
  html = hosted.ui.renderOverviewView();
  assert(html.indexOf("GAS ActiveUser / AccountChooser") !== -1);
  assert.strictEqual(hosted.ui.getLoginMode({}, hosted.MEA.auth), "GAS ActiveUser / AccountChooser");
  console.log("4. GAS ActiveUser 登入機制字串 ✓\n");

  const escaped = createDeps();
  escaped.state.publicConfig = { allowedDomain: "<script>", schoolYear: "<114>" };
  escaped.state.user = { name: "<管理者>", roleName: "<系統管理員>" };
  html = escaped.ui.renderOverviewView();
  assert(html.indexOf("&lt;script&gt;") !== -1);
  assert(html.indexOf("&lt;114&gt;") !== -1);
  assert(html.indexOf("&lt;管理者&gt;") !== -1);
  assert(html.indexOf("&lt;系統管理員&gt;") !== -1);
  console.log("5. 使用者與設定值應跳脫 HTML ✓\n");

  console.log("6. renderNavbar 應依管理員旗標與角色過濾頁籤...\n");
  {
    const ctx = createDeps();
    ctx.config.tabs = [
      { id: "overview", name: "概覽", icon: "📊" },
      { id: "courses", name: "課程", icon: "📚" },
      { id: "activityLog", name: "操作日誌", icon: "📜", adminOnly: true }
    ];

    ctx.state.user = { role: "viewer" };
    let html = ctx.ui.renderNavbar();
    assert(html.indexOf("概覽") !== -1);
    assert(html.indexOf("課程") !== -1);
    assert(html.indexOf("操作日誌") === -1, "非管理員不應看到操作日誌頁籤");

    ctx.state.user = { role: "admin" };
    html = ctx.ui.renderNavbar();
    assert(html.indexOf("操作日誌") !== -1, "管理員應看到操作日誌頁籤");
    assert(html.indexOf('data-tab="activityLog"') !== -1);

    ctx.state.user = null;
    html = ctx.ui.renderNavbar();
    assert(html.indexOf("操作日誌") === -1, "未登入者不應看到管理員頁籤");

    ctx.state.user = { role: "staff" };
    assert.strictEqual(ctx.ui.isTabAllowed(ctx.config.tabs[2], ctx.state.user), false);
    assert.strictEqual(ctx.ui.isTabAllowed(ctx.config.tabs[0], ctx.state.user), true);
    console.log("   ✓ 角色可見性驗證通過！\n");
  }

  console.log("7. 說明手冊網址與快速入口按鈕驗證...\n");
  {
    const ctx = createDeps();
    assert.strictEqual(typeof ctx.ui.getUserGuideUrl, "function", "應提供 getUserGuideUrl 函式");
    assert.strictEqual(typeof ctx.ui.openUserGuide, "function", "應提供 openUserGuide 函式");

    // 預設環境
    assert.strictEqual(ctx.ui.getUserGuideUrl(), "?page=docs%2Fuser-guide.html");

    // 模擬已設定 GAS_WEBAPP_URL 環境
    ctx.win.GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycb/exec";
    assert.strictEqual(
      ctx.ui.getUserGuideUrl(),
      "https://script.google.com/macros/s/AKfycb/exec?page=docs%2Fuser-guide.html"
    );

    // 概覽畫面應包含說明手冊按鈕
    const html = ctx.ui.renderOverviewView();
    assert(html.indexOf('data-ui-action="open-user-guide"') !== -1, "概覽應包含 open-user-guide 動作按鈕");
    assert(html.indexOf("說明手冊") !== -1, "概覽應包含說明手冊文案");

    // openUserGuide 呼叫
    let openedUrl = null;
    let openedTarget = null;
    ctx.elements.modalHost = ctx.doc.createElement("div");
    ctx.win.open = function (url, target) {
      openedUrl = url;
      openedTarget = target;
      return {};
    };
    ctx.created.length = 0;
    ctx.ui.openUserGuide();
    const actionBtn = ctx.created.find(function (el) {
      return String(el.tagName).toLowerCase() === "button" && el.textContent === "在新分頁開啟完整手冊";
    });
    assert(actionBtn, "應建立在新分頁開啟完整手冊按鈕");
    if (typeof actionBtn.onclick === "function") {
      actionBtn.onclick();
    }
    assert.strictEqual(openedUrl, "https://script.google.com/macros/s/AKfycb/exec?page=docs%2Fuser-guide.html");
    assert.strictEqual(openedTarget, "_blank");

    // 模擬 location.href 為 /macros/s/exec
    delete ctx.win.GAS_WEBAPP_URL;
    ctx.win.location = { href: "https://script.google.com/macros/s/xyz/exec?p=1#ref" };
    assert.strictEqual(
      ctx.ui.getUserGuideUrl(),
      "https://script.google.com/macros/s/xyz/exec?page=docs%2Fuser-guide.html"
    );

    // 模擬 location.href 為 googleusercontent.com/userCodeAppPanel（應被忽略）
    ctx.win.location = { href: "https://xyz.googleusercontent.com/userCodeAppPanel" };
    assert.strictEqual(ctx.ui.getUserGuideUrl(), "?page=docs%2Fuser-guide.html");

    // 模擬由 publicConfig.webAppUrl 注入
    ctx.state.publicConfig = { webAppUrl: "https://script.google.com/macros/s/cfg/exec" };
    assert.strictEqual(
      ctx.ui.getUserGuideUrl(),
      "https://script.google.com/macros/s/cfg/exec?page=docs%2Fuser-guide.html"
    );

    // 測試 openUserGuide 的關閉按鈕
    const closeBtn = ctx.created.find(function (el) {
      return String(el.tagName).toLowerCase() === "button" && el.textContent === "關閉";
    });
    assert(closeBtn, "應建立關閉按鈕");
    if (typeof closeBtn.onclick === "function") {
      assert.doesNotThrow(function () {
        closeBtn.onclick();
      });
    }

    console.log("   ✓ 說明手冊網址與動作按鈕驗證通過！\n");
  }

  console.log("✓ webapp/js/ui.js renderOverviewView 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
