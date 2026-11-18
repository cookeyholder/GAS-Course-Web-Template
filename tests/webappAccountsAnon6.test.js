"use strict";

/**
 * webapp/js/accounts.js 匿名方法 6 單元測試（G7.2）。
 * 實際對應：addAccountPrompt 中「新增」按鈕的 onClick 回呼（原 L119-153）。
 * 重構後抽為 handleAddAccountClick，由 addAccountPrompt 掛載至 actions[1].onClick。
 */

const assert = require("assert");
const accountsModule = require("../webapp/js/accounts.js");
const depsFactory = require("./helpers/accountsCoursesDeps.js");
const createDeps = depsFactory.createAccountsDeps;
const flush = depsFactory.flush;

console.log("開始執行 webapp/js/accounts.js 匿名方法 6 測試...\n");

function setup(accounts) {
  const ctx = createDeps();
  ctx.state.settings.accounts = accounts || [];
  const controller = accountsModule.createAccountsModule(ctx.deps);
  controller.addAccountPrompt();
  assert(ctx.calls.modal, "應開啟新增帳號對話框");
  assert.strictEqual(ctx.calls.modal.actions.length, 2, "應有取消與新增兩個按鈕");
  assert.strictEqual(ctx.calls.modal.actions[0].onClick, ctx.MEA.ui.closeModal, "取消按鈕應直接使用關閉對話框");
  return { ctx: ctx, onClick: ctx.calls.modal.actions[1].onClick };
}

async function run() {
  let fixture = setup([]);
  fixture.ctx.elements.newAccountEmail = { value: "   " };
  fixture.ctx.elements.newAccountName = { value: "王小明" };
  fixture.onClick();
  assert.deepStrictEqual(fixture.ctx.calls.toast, [{ message: "請填寫有效的 Email", kind: "warn" }]);
  assert.strictEqual(fixture.ctx.calls.apiCalls.length, 0, "無效 Email 不應送出請求");
  assert.strictEqual(fixture.ctx.calls.closeModal, 0, "無效 Email 不應關閉對話框");
  console.log("1. 空白 Email 驗證 ✓\n");

  fixture = setup([]);
  fixture.ctx.elements.newAccountEmail = { value: "abc.example.com" };
  fixture.onClick();
  assert.strictEqual(fixture.ctx.calls.toast[0].message, "請填寫有效的 Email");
  assert.strictEqual(fixture.ctx.calls.apiCalls.length, 0);
  console.log("2. 缺少 @ 的 Email 驗證 ✓\n");

  fixture = setup([{ email: "a@example.com", name: "既有帳號", role: "viewer", enabled: true }]);
  fixture.ctx.elements.newAccountEmail = { value: "A@Example.com " };
  fixture.ctx.elements.newAccountName = { value: "新帳號" };
  fixture.onClick();
  assert.deepStrictEqual(fixture.ctx.calls.toast, [{ message: "此 Email 已在白名單中", kind: "warn" }]);
  assert.strictEqual(fixture.ctx.calls.apiCalls.length, 0, "重複 Email 不應送出請求");
  console.log("3. 重複 Email 驗證（大小寫與空白正規化）✓\n");

  fixture = setup([]);
  fixture.ctx.elements.newAccountEmail = { value: "  NEW@Example.COM  " };
  fixture.onClick();
  assert.strictEqual(fixture.ctx.calls.apiCalls.length, 1);
  assert.strictEqual(fixture.ctx.calls.apiCalls[0].action, "saveWhitelist");
  const added = fixture.ctx.calls.apiCalls[0].payload.accounts[0];
  assert.strictEqual(added.email, "new@example.com", "Email 應轉小寫並去除空白");
  assert.strictEqual(added.name, "new@example.com", "姓名空白時應回退為 Email");
  assert.strictEqual(added.role, "viewer", "缺少角色下拉時應預設 viewer");
  assert.strictEqual(added.roleName, "檢視人員");
  assert.strictEqual(added.enabled, true);
  assert.strictEqual(fixture.ctx.calls.closeModal, 1, "成功新增後應關閉對話框");
  assert.strictEqual(fixture.ctx.state.settings.saving, true);
  assert.strictEqual(fixture.ctx.state.settings.accounts.length, 1);
  await flush();
  assert(
    fixture.ctx.calls.toast.some(function (item) {
      return item.message === "授權白名單已更新！" && item.kind === "ok";
    })
  );
  console.log("4. 有效新增（含欄位正規化與預設值）✓\n");

  fixture = setup([]);
  fixture.ctx.elements.newAccountEmail = { value: "staff@example.com" };
  fixture.ctx.elements.newAccountName = { value: "  業務人員  " };
  fixture.ctx.elements.newAccountRole = { value: "staff" };
  fixture.onClick();
  const staffAdded = fixture.ctx.calls.apiCalls[0].payload.accounts[0];
  assert.strictEqual(staffAdded.name, "業務人員");
  assert.strictEqual(staffAdded.role, "staff");
  assert.strictEqual(staffAdded.roleName, "業務人員");
  console.log("5. 指定姓名與角色的新增 ✓\n");

  fixture = setup([]);
  fixture.ctx.elements.newAccountEmail = { value: "custom@example.com" };
  fixture.ctx.elements.newAccountRole = { value: "auditor" };
  fixture.onClick();
  assert.strictEqual(
    fixture.ctx.calls.apiCalls[0].payload.accounts[0].roleName,
    "auditor",
    "未知角色應回退為角色識別碼"
  );
  console.log("6. 未知角色名稱回退 ✓\n");

  console.log("✓ webapp/js/accounts.js 匿名方法 6 測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
