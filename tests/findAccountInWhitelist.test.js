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

  await t.test("databaseInitializer 委派之 normalizeRole 與 getRoleDisplayName", () => {
    assert.strictEqual(db.normalizeRole("系統管理員"), "admin");
    assert.strictEqual(db.normalizeRole("admin"), "admin");
    assert.strictEqual(db.normalizeRole("unknown_role"), "unknown_role");
    assert.strictEqual(db.getRoleDisplayName("admin"), "系統管理員");
    assert.strictEqual(db.getRoleDisplayName("staff"), "業務人員");
    assert.strictEqual(db.getRoleDisplayName("viewer"), "檢視人員");
  });

  await t.test("databaseInitializer 轉發匯出之 findAccountInWhitelist 與 getAccountRole", () => {
    assert.strictEqual(typeof db.findAccountInWhitelist, "function");
    const found = db.findAccountInWhitelist(accounts, "ADMIN@example.com");
    assert.ok(found);
    assert.strictEqual(found.email, "admin@example.com");

    // 測試未命中情況
    const roleInfo = db.getAccountRole("notfound@example.com");
    assert.strictEqual(roleInfo.found, false);
    assert.strictEqual(roleInfo.role, "viewer");

    // 測試命中情況（覆蓋 getAccountRole 第 509-516 行）
    db.saveWhitelist([
      {
        email: "hit@example.com",
        name: "命中用戶",
        role: "staff",
        enabled: true
      }
    ]);
    const hitRole = db.getAccountRole("HIT@example.com");
    assert.strictEqual(hitRole.found, true);
    assert.strictEqual(hitRole.role, "staff");
    assert.strictEqual(hitRole.name, "命中用戶");
    assert.strictEqual(hitRole.enabled, true);
  });
});
