"use strict";

/**
 * 新增授權帳號角色選項測試。
 * 驗證下拉選項由 gasRuntime 角色定義產生，避免前端另寫一份角色清單。
 */

const assert = require("assert");
const gasRuntime = require("../gasRuntime.js");
const accountsModule = require("../webapp/js/accounts.js");
const helper = require("./helpers/accountsCoursesDeps.js");

console.log("開始執行新增授權帳號角色選項測試...\n");

const ctx = helper.createAccountsDeps();
const accounts = accountsModule.createAccountsModule(ctx.deps);
accounts.addAccountPrompt();

assert(ctx.calls.modal, "應開啟新增授權帳號視窗");
const options = Array.from(ctx.calls.modal.html.matchAll(/<option value="([^"]+)">([^<]+)<\/option>/g)).map(
  function (match) {
    return { role: match[1], label: match[2] };
  }
);

assert.deepStrictEqual(
  options,
  Object.keys(gasRuntime.ROLE_DEFINITIONS).map(function (role) {
    return { role: role, label: gasRuntime.ROLE_DEFINITIONS[role] + " (" + role + ")" };
  })
);
console.log("✓ 角色選項單一來源測試全數通過！\n");

console.log("補充設定缺值與自訂轉義函式的容錯...");
{
  const fallbackCtx = helper.createAccountsDeps();
  const fallbackAccounts = accountsModule.createAccountsModule(fallbackCtx.deps);
  fallbackCtx.MEA.config = null;
  fallbackCtx.MEA.ui.escapeHtml = undefined;
  fallbackAccounts.addAccountPrompt();
  assert(fallbackCtx.calls.modal, "設定缺值時仍應開啟視窗");
  assert(
    /<select id="newAccountRole" class="select">\s*<\/select>/.test(fallbackCtx.calls.modal.html),
    "角色設定缺值時不應產生選項"
  );
  console.log("   ✓ 角色設定缺值容錯通過！\n");
}

console.log("補充未儲存狀態的帳號列渲染...");
{
  const renderCtx = helper.createAccountsDeps();
  const renderAccounts = accountsModule.createAccountsModule(renderCtx.deps);
  renderCtx.state.settings.accounts = [
    { email: "user@example.edu.tw", name: "甲", role: "viewer", roleName: "檢視人員", enabled: true }
  ];
  renderCtx.state.settings.saving = false;
  const html = renderAccounts.renderView();
  assert(html.indexOf("user@example.edu.tw") !== -1, "未儲存狀態仍應渲染帳號列");
  console.log("   ✓ 帳號列渲染通過！\n");
}
console.log("✓ 新增授權帳號角色選項測試全數通過！\n");
