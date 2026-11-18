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
  assert(html.indexOf("MEA.setTab('import')") !== -1);
  assert(html.indexOf("MEA.setTab('courses')") !== -1);
  assert(html.indexOf("MEA.setTab('settings')") !== -1);
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

  console.log("✓ webapp/js/ui.js renderOverviewView 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
