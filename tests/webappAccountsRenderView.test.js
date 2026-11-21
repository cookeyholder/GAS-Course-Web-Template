"use strict";

/**
 * webapp/js/accounts.js renderView 單元測試（G7.1）。
 * 驗證拆分後各情境輸出與原有行為一致。
 */

const assert = require("assert");
const accountsModule = require("../webapp/js/accounts.js");
const createDeps = require("./helpers/accountsCoursesDeps.js").createAccountsDeps;

console.log("開始執行 webapp/js/accounts.js renderView 測試...\n");

function run() {
  assert.strictEqual(typeof accountsModule.createAccountsModule, "function", "應匯出 createAccountsModule");
  console.log("1. 應匯出可測試的模組工廠 ✓\n");

  const ctx = createDeps();
  const accounts = accountsModule.createAccountsModule(ctx.deps);

  ctx.state.user = { role: "viewer", roleName: "檢視人員" };
  let html = accounts.renderView();
  assert(html.indexOf("權限不足") !== -1);
  assert(html.indexOf("檢視人員") !== -1);
  assert(html.indexOf("系統核心參數") === -1);
  console.log("2. 非管理員僅顯示權限不足面板 ✓\n");

  ctx.state.user = { role: "admin", roleName: "系統管理員" };
  ctx.state.settings = { data: {}, accounts: [], saving: false };
  html = accounts.renderView();
  assert(html.indexOf("系統設定與授權 (RBAC)") !== -1);
  assert(html.indexOf("目前尚未設定任何授權帳號。") !== -1);
  assert(html.indexOf('id="cfgSystemName"') !== -1);
  assert(html.indexOf('value="114"') !== -1, "學年度應有預設值 114");
  assert(html.indexOf('value="1"') !== -1, "學期應有預設值 1");
  assert(html.indexOf('data-account-action="reload"') !== -1);
  assert(html.indexOf('data-account-action="add"') !== -1);
  assert(html.indexOf(">儲存系統設定<") !== -1);
  assert(html.indexOf(" disabled") === -1);
  console.log("3. 管理員空清單與表單預設值 ✓\n");

  ctx.state.settings = {
    data: {
      systemName: "系統 <A>",
      schoolYear: "114",
      semester: "2",
      clientId: "id-123",
      clientSecret: "secret",
      allowedLoginDomain: "example.edu.tw",
      restrictWhitelist: true
    },
    accounts: [
      { email: "a@example.com", name: "管理員", role: "admin", roleName: "系統管理員", enabled: true },
      { email: "b@example.com", name: "業務", role: "staff", roleName: "業務人員", enabled: false }
    ],
    saving: true
  };
  html = accounts.renderView();
  assert(html.indexOf('value="系統 <A>"') !== -1);
  assert(html.indexOf('id="cfgAllowedDomain"') !== -1);
  assert(html.indexOf('value="example.edu.tw"') !== -1);
  assert(html.indexOf('id="cfgRestrictWhitelist" checked') !== -1);
  assert(html.indexOf('class="btn primary" disabled') !== -1);
  assert(html.indexOf("儲存中...") !== -1);
  assert(html.indexOf('class="pill accent"') !== -1);
  assert(html.indexOf('class="pill muted"') !== -1);
  assert(html.indexOf("badge-ok") !== -1);
  assert(html.indexOf("badge-err") !== -1);
  assert(html.indexOf("已啟用") !== -1);
  assert(html.indexOf("已停用") !== -1);
  assert(html.indexOf(">停用<") !== -1);
  assert(html.indexOf(">啟用<") !== -1);
  assert(html.indexOf('data-account-action="toggle" data-email="a@example.com"') !== -1);
  assert(html.indexOf('data-account-action="remove" data-email="b@example.com"') !== -1);
  assert(html.indexOf("刪除") !== -1);
  console.log("4. 完整資料、狀態標籤與事件掛載 ✓\n");

  ctx.state.settings = {
    data: { "Google 登入允許網域": "fallback.edu.tw" },
    accounts: [],
    saving: false
  };
  html = accounts.renderView();
  assert(html.indexOf('value="fallback.edu.tw"') !== -1, "應支援舊版中文欄位名稱回退");
  console.log("5. 舊版中文欄位名稱回退 ✓\n");

  console.log("6. Email 特殊字元應跳脫後寫入 data-email...");
  {
    const escapeCtx = createDeps();
    escapeCtx.MEA.ui.escapeHtml = require("../webapp/js/ui.js").escapeHtml;
    escapeCtx.state.user = { role: "admin" };
    escapeCtx.state.settings = {
      data: {},
      accounts: [{ email: "a'b\"c@example.com", name: "測試", role: "staff", enabled: true }],
      saving: false
    };
    const escapedHtml = accountsModule.createAccountsModule(escapeCtx.deps).renderView();
    assert(escapedHtml.indexOf("onclick=") === -1, "不應使用 inline 事件");
    assert(
      escapedHtml.indexOf('data-email="a&#39;b&quot;c@example.com"') !== -1,
      "Email 應跳脫單雙引號後寫入 data-email"
    );
    console.log("   ✓ Email 跳脫驗證通過！\n");
  }

  console.log("7. 角色篩選下拉選單與過濾功能...");
  {
    const filterCtx = createDeps();
    filterCtx.state.user = { role: "admin" };
    filterCtx.state.settings = {
      data: {},
      roleFilter: "staff",
      accounts: [
        { email: "admin@example.com", name: "管理員", role: "admin", roleName: "系統管理員", enabled: true },
        { email: "staff@example.com", name: "業務", role: "staff", roleName: "業務人員", enabled: true }
      ],
      saving: false
    };
    const filterHtml = accountsModule.createAccountsModule(filterCtx.deps).renderView();
    assert(filterHtml.indexOf('id="accountRoleFilter"') !== -1, "應存在角色篩選下拉選單");
    assert(filterHtml.indexOf('data-account-action="filter-role"') !== -1, "應綁定 filter-role 動作");
    assert(filterHtml.indexOf('value="staff" selected') !== -1, "業務人員選項應為選取狀態");
    assert(filterHtml.indexOf("staff@example.com") !== -1, "應包含業務人員資料列");
    assert(filterHtml.indexOf("admin@example.com") === -1, "管理員資料列應被篩選排除");
    console.log("   ✓ 角色篩選功能驗證通過！\n");
  }

  console.log("✓ webapp/js/accounts.js renderView 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
