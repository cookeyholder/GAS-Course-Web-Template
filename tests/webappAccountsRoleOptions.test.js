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
