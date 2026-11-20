"use strict";

/**
 * webapp/js/ui.js::renderHeader 單元測試（G7.17）。
 * 驗證系統名稱、使用者資訊、角色標籤、風格選單與主題按鈕輸出。
 */

const assert = require("assert");
const uiModule = require("../webapp/js/ui.js");
const createDeps = require("./helpers/importsUiDeps.js").createUiDeps;

console.log("開始執行 webapp/js/ui.js renderHeader 測試...\n");

function run() {
  assert.strictEqual(typeof uiModule.renderStyleOptions, "function", "應匯出風格選單函式");
  console.log("1. 共用風格選單函式匯出 ✓\n");

  const base = createDeps();
  let html = base.ui.renderHeader();
  assert(html.indexOf('<header class="app-header">') !== -1);
  assert(html.indexOf("測試系統") !== -1);
  assert(html.indexOf("Web App Template v1.1.0") !== -1);
  assert(html.indexOf('<span class="pill muted">未授權</span>') !== -1);
  assert(html.indexOf('<option value="modern-slate" selected>') !== -1);
  assert(html.indexOf("◐ 深色模式") !== -1);
  assert(html.indexOf('data-ui-action="apply-style"') !== -1);
  assert(html.indexOf('data-ui-action="toggle-theme"') !== -1);
  assert(html.indexOf('data-ui-action="logout"') !== -1);
  console.log("2. 預設標題、角色、風格與按鈕事件 ✓\n");

  const filled = createDeps();
  filled.state.publicConfig = { systemName: "<我的系統>" };
  filled.state.user = { name: "王小明", email: "staff@example.edu.tw", role: "admin" };
  filled.doc.documentElement.dataset.style = "paper";
  filled.doc.documentElement.dataset.theme = "dark";
  html = filled.ui.renderHeader();
  assert(html.indexOf("&lt;我的系統&gt;") !== -1);
  assert(html.indexOf("王小明") !== -1);
  assert(html.indexOf('<span class="pill accent">系統管理員</span>') !== -1);
  assert(html.indexOf('<option value="paper" selected>') !== -1);
  assert(html.indexOf('<option value="modern-slate">') !== -1);
  assert(html.indexOf("◑ 淺色模式") !== -1);
  console.log("3. 自訂標題、管理員標籤與深色模式按鈕 ✓\n");

  const emailOnly = createDeps();
  emailOnly.state.user = { email: "viewer@example.edu.tw", role: "viewer" };
  html = emailOnly.ui.renderHeader();
  assert(html.indexOf("viewer@example.edu.tw") !== -1);
  assert(html.indexOf('<span class="pill muted">檢視人員</span>') !== -1);
  assert.strictEqual(html.indexOf("王小明"), -1);

  const escaped = createDeps();
  escaped.state.user = { name: "<管理者>", roleName: "<特權>" };
  html = escaped.ui.renderHeader();
  assert(html.indexOf("&lt;管理者&gt;") !== -1);
  assert(html.indexOf("&lt;特權&gt;") !== -1);
  console.log("4. Email 備援與 HTML 跳脫 ✓\n");

  console.log("✓ webapp/js/ui.js renderHeader 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
