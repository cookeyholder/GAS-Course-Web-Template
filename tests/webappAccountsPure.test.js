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

  await t.test("validateNewAccountInput - 陣列內含 null 或 email 為空之物件時安全容錯", () => {
    const mixedAccounts = [null, { email: null }, { email: "other@example.com" }];
    const res = validateNewAccountInput({ email: "newuser@example.com" }, mixedAccounts);
    assert.strictEqual(res.valid, true);
  });

  await t.test("validateNewAccountInput - 有效 Email 通過", () => {
    const res = validateNewAccountInput({ email: "newuser@example.com" }, sampleAccounts);
    assert.strictEqual(res.valid, true);
  });

  await t.test("appendAccountToList - 不可變新增與極限防衛", () => {
    assert.deepStrictEqual(appendAccountToList(null, null), []);
    assert.deepStrictEqual(appendAccountToList(sampleAccounts, null), sampleAccounts);

    const newAcc = { email: "new@example.com", name: "新用戶", role: "viewer", enabled: true };
    const result = appendAccountToList(sampleAccounts, newAcc);
    assert.strictEqual(result.length, 3);
    assert.strictEqual(sampleAccounts.length, 2, "原陣列長度不應改變");
    assert.strictEqual(result[2].email, "new@example.com");
  });

  await t.test("removeAccountFromList - 不可變刪除（大小寫容錯與非陣列/null 容錯）", () => {
    assert.deepStrictEqual(removeAccountFromList(null, "admin@example.com"), []);
    assert.deepStrictEqual(removeAccountFromList(sampleAccounts, null), sampleAccounts);

    const withNull = [{ email: "staff@example.com" }, null];
    const filtered = removeAccountFromList(withNull, "staff@example.com");
    assert.deepStrictEqual(filtered, []);

    const result = removeAccountFromList(sampleAccounts, "ADMIN@EXAMPLE.COM");
    assert.strictEqual(result.length, 1);
    assert.strictEqual(sampleAccounts.length, 2, "原陣列長度不應改變");
    assert.strictEqual(result[0].email, "staff@example.com");
  });

  await t.test("toggleAccountInList - 不可變切換啟用狀態（非陣列與 null 容錯）", () => {
    assert.deepStrictEqual(toggleAccountInList(null, "staff@example.com"), []);
    assert.deepStrictEqual(toggleAccountInList(sampleAccounts, null), sampleAccounts);

    const withNull = [{ email: "staff@example.com", enabled: false }, null];
    const toggledNull = toggleAccountInList(withNull, "staff@example.com");
    assert.strictEqual(toggledNull[0].enabled, true);
    assert.strictEqual(toggledNull[1], null);

    const result = toggleAccountInList(sampleAccounts, "staff@example.com");
    assert.strictEqual(result.length, 2);
    assert.strictEqual(sampleAccounts[1].enabled, false, "原物件不應受就地變更");
    assert.strictEqual(result[1].enabled, true);

    const toggledAgain = toggleAccountInList(result, "staff@example.com");
    assert.strictEqual(toggledAgain[1].enabled, false);
  });
});
