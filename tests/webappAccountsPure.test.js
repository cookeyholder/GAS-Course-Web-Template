const test = require("node:test");
const assert = require("node:assert/strict");

const accountsModule = require("../webapp/js/accounts.js");

test("webapp/js/accounts.js 純驗證與陣列操作純函式零 DOM 驗證", async (t) => {
  const { validateNewAccountInput, appendAccountToList, removeAccountFromList, toggleAccountInList } = accountsModule;

  const sampleAccounts = [
    { email: "admin@example.com", name: "管理員", role: "admin", enabled: true },
    { email: "staff@example.com", name: "業務", role: "staff", enabled: false }
  ];

  await t.test("validateNewAccountInput - 無效 Email 判定", () => {
    assert.strictEqual(validateNewAccountInput(null).valid, false);
    assert.strictEqual(validateNewAccountInput({ email: "" }).valid, false);
    assert.strictEqual(validateNewAccountInput({ email: "invalid-email" }).valid, false);
    assert.strictEqual(validateNewAccountInput({ email: "invalid-email" }).errorKey, "invalid_email");
  });

  await t.test("validateNewAccountInput - 重複 Email 判定（大小寫與前後空白不敏感）", () => {
    const res = validateNewAccountInput({ email: "  Admin@EXAMPLE.com  " }, sampleAccounts);
    assert.strictEqual(res.valid, false);
    assert.strictEqual(res.errorKey, "duplicate_email");
  });

  await t.test("validateNewAccountInput - 有效 Email 通過", () => {
    const res = validateNewAccountInput({ email: "newuser@example.com" }, sampleAccounts);
    assert.strictEqual(res.valid, true);
  });

  await t.test("appendAccountToList - 不可變新增", () => {
    const newAcc = { email: "new@example.com", name: "新用戶", role: "viewer", enabled: true };
    const result = appendAccountToList(sampleAccounts, newAcc);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(sampleAccounts.length, 2, "原陣列長度不應改變");
    assert.strictEqual(result[2].email, "new@example.com");
  });

  await t.test("removeAccountFromList - 不可變刪除（大小寫容錯）", () => {
    const result = removeAccountFromList(sampleAccounts, "ADMIN@EXAMPLE.COM");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(sampleAccounts.length, 2, "原陣列長度不應改變");
    assert.strictEqual(result[0].email, "staff@example.com");
  });

  await t.test("toggleAccountInList - 不可變切換啟用狀態", () => {
    const result = toggleAccountInList(sampleAccounts, "staff@example.com");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(sampleAccounts[1].enabled, false, "原物件不應受就地變更");
    assert.strictEqual(result[1].enabled, true);

    const toggledAgain = toggleAccountInList(result, "staff@example.com");
    assert.strictEqual(toggledAgain[1].enabled, false);
  });
});
