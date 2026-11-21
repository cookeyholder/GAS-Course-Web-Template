const test = require("node:test");
const assert = require("node:assert/strict");

const systemConfigCodec = require("../systemConfigCodec.js");
const db = require("../databaseInitializer.js");

test("findAccountInWhitelist - 純查表函式驗證", async (t) => {
  const accounts = [
    { email: "admin@example.com", name: "管理員", role: "admin", roleName: "系統管理員", enabled: true },
    { email: "staff@example.com", name: "業務", role: "staff", roleName: "業務人員", enabled: false }
  ];

  await t.test("輸入非陣列、null、undefined 或空陣列時安全回傳 null", () => {
    assert.strictEqual(systemConfigCodec.findAccountInWhitelist(null, "admin@example.com"), null);
    assert.strictEqual(systemConfigCodec.findAccountInWhitelist(undefined, "admin@example.com"), null);
    assert.strictEqual(systemConfigCodec.findAccountInWhitelist([], "admin@example.com"), null);
    assert.strictEqual(systemConfigCodec.findAccountInWhitelist("not an array", "admin@example.com"), null);
  });

  await t.test("Email 為 null、undefined、空字串或非字串時安全回傳 null", () => {
    assert.strictEqual(systemConfigCodec.findAccountInWhitelist(accounts, null), null);
    assert.strictEqual(systemConfigCodec.findAccountInWhitelist(accounts, undefined), null);
    assert.strictEqual(systemConfigCodec.findAccountInWhitelist(accounts, ""), null);
    assert.strictEqual(systemConfigCodec.findAccountInWhitelist(accounts, "   "), null);
  });

  await t.test("精確匹配與大小寫、前後空白容錯", () => {
    const found = systemConfigCodec.findAccountInWhitelist(accounts, "  Admin@Example.COM  ");
    assert.ok(found);
    assert.strictEqual(found.email, "admin@example.com");
    assert.strictEqual(found.role, "admin");

    const foundStaff = systemConfigCodec.findAccountInWhitelist(accounts, "STAFF@EXAMPLE.COM");
    assert.ok(foundStaff);
    assert.strictEqual(foundStaff.email, "staff@example.com");
    assert.strictEqual(foundStaff.enabled, false);
  });

  await t.test("查無帳號時回傳 null", () => {
    assert.strictEqual(systemConfigCodec.findAccountInWhitelist(accounts, "nobody@example.com"), null);
  });

  await t.test("databaseInitializer 轉發匯出之 findAccountInWhitelist 與 getAccountRole", () => {
    assert.strictEqual(typeof db.findAccountInWhitelist, "function");
    const found = db.findAccountInWhitelist(accounts, "ADMIN@example.com");
    assert.ok(found);
    assert.strictEqual(found.email, "admin@example.com");

    const roleInfo = db.getAccountRole("notfound@example.com");
    assert.strictEqual(roleInfo.found, false);
    assert.strictEqual(roleInfo.role, "viewer");
  });
});
