"use strict";

/**
 * databaseInitializerBootstrap.test.js
 * 直接驗證 bootstrapAdminIfNeeded 的開通、不重複開通與 Email 正規化行為。
 */

const assert = require("assert");
const db = require("../databaseInitializer.js");
const ROLE_CODES = require("../gasRuntime.js").ROLE_CODES;

function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (key) {
    prev[key] = Object.prototype.hasOwnProperty.call(globalThis, key) ? globalThis[key] : undefined;
    if (temp[key] === undefined) delete globalThis[key];
    else globalThis[key] = temp[key];
  });
  try {
    return fn();
  } finally {
    Object.keys(temp).forEach(function (key) {
      if (prev[key] === undefined) delete globalThis[key];
      else globalThis[key] = prev[key];
    });
  }
}

function inMemory(fn) {
  return withGlobals({ SpreadsheetApp: undefined }, fn);
}

function resetMemoryWhitelist() {
  inMemory(function () {
    db.saveWhitelist([]);
  });
}

function run() {
  console.log("開始執行 bootstrapAdminIfNeeded 測試...\n");
  resetMemoryWhitelist();
  try {
    console.log("1. 空白名單應開通首位管理員並正規化 Email...");
    const first = inMemory(function () {
      return db.bootstrapAdminIfNeeded("  Admin@Example.COM ", "  管理員 ");
    });
    assert.strictEqual(first, true);
    const accounts = inMemory(function () {
      return db.readWhitelist();
    });
    assert.deepStrictEqual(accounts, [
      {
        email: "admin@example.com",
        name: "管理員",
        role: ROLE_CODES.ADMIN,
        roleName: db.ROLE_DEFINITIONS.admin,
        enabled: true
      }
    ]);
    console.log("   ✓ 首位管理員開通與正規化驗證通過！\n");

    console.log("2. 名單非空時不應重複開通...");
    const second = inMemory(function () {
      return db.bootstrapAdminIfNeeded("other@example.com", "第二人");
    });
    assert.strictEqual(second, false);
    const unchanged = inMemory(function () {
      return db.readWhitelist();
    });
    assert.strictEqual(unchanged.length, 1, "名單非空時不應新增成員");
    assert.strictEqual(unchanged[0].email, "admin@example.com");
    console.log("   ✓ 不重複開通驗證通過！\n");

    console.log("3. 空白 Email 不應開通...");
    resetMemoryWhitelist();
    const blank = inMemory(function () {
      return db.bootstrapAdminIfNeeded("   ", "空白 Email");
    });
    assert.strictEqual(blank, false);
    const empty = inMemory(function () {
      return db.readWhitelist();
    });
    assert.deepStrictEqual(empty, []);
    console.log("   ✓ 空白 Email 防護驗證通過！\n");

    console.log("4. parseConfigBoolean 向後相容轉發驗證...");
    assert.strictEqual(db.parseConfigBoolean("true"), true);
    assert.strictEqual(db.parseConfigBoolean("1"), true);
    assert.strictEqual(db.parseConfigBoolean("false"), false);
    assert.strictEqual(db.parseConfigBoolean(null), false);
    console.log("   ✓ parseConfigBoolean 向後相容轉發驗證通過！\n");
  } finally {
    resetMemoryWhitelist();
  }
}

if (require.main === module) {
  try {
    run();
    console.log("✓ 全部測試通過！");
  } catch (error) {
    console.error("✗ 測試失敗：", error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

module.exports = { run };
