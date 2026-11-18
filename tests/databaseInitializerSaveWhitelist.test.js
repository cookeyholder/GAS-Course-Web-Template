"use strict";

/**
 * saveWhitelist 單元測試（G3.4）
 * 驗證授權白名單儲存之記憶體/試算表模式、正規化、清除與寫入行為。
 */

const assert = require("assert");
const db = require("../databaseInitializer.js");

console.log("開始執行 saveWhitelist 測試...\n");

function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (k) {
    prev[k] = Object.prototype.hasOwnProperty.call(global, k) ? global[k] : undefined;
    if (temp[k] === undefined) delete global[k];
    else global[k] = temp[k];
  });
  try {
    return fn();
  } finally {
    Object.keys(temp).forEach(function (k) {
      if (prev[k] === undefined) delete global[k];
      else global[k] = prev[k];
    });
  }
}

function resetMemoryWhitelist() {
  withGlobals({ SpreadsheetApp: undefined }, function () {
    db.saveWhitelist([]);
  });
}

console.log("1. 記憶體模式應儲存並正規化白名單，略過空 email...");
{
  resetMemoryWhitelist();
  try {
    const result = withGlobals({ SpreadsheetApp: undefined }, function () {
      return db.saveWhitelist([
        { email: "  ADMIN@Example.com ", name: " 管理員 ", role: "admin", enabled: true },
        { email: "", name: "忽略", role: "staff", enabled: true },
        { email: "user@example.com", name: "使用者", role: "unknown", enabled: false },
        null,
        { email: "default@example.com" }
      ]);
    });
    assert.deepStrictEqual(result, { ok: true, count: 3 });
    const stored = withGlobals({ SpreadsheetApp: undefined }, function () {
      return db.readWhitelist();
    });
    assert.deepStrictEqual(stored, [
      { email: "admin@example.com", name: "管理員", role: "admin", roleName: "系統管理員", enabled: true },
      { email: "user@example.com", name: "使用者", role: "unknown", roleName: "檢視人員", enabled: false },
      { email: "default@example.com", name: "", role: "viewer", roleName: "檢視人員", enabled: true }
    ]);
    console.log("   ✓ 記憶體模式儲存與正規化驗證通過！\n");
  } finally {
    resetMemoryWhitelist();
  }
}

console.log("2. 記憶體模式非陣列輸入應視為空清單...");
{
  resetMemoryWhitelist();
  try {
    withGlobals({ SpreadsheetApp: undefined }, function () {
      db.saveWhitelist([{ email: "a@example.com", name: "A", role: "staff", enabled: true }]);
      assert.deepStrictEqual(db.saveWhitelist(null), { ok: true, count: 0 });
      assert.deepStrictEqual(db.saveWhitelist(undefined), { ok: true, count: 0 });
      assert.deepStrictEqual(db.saveWhitelist("x"), { ok: true, count: 0 });
      assert.deepStrictEqual(db.readWhitelist(), []);
    });
    console.log("   ✓ 非陣列輸入驗證通過！\n");
  } finally {
    resetMemoryWhitelist();
  }
}

function makeSheet(state) {
  state = state || {};
  let lastRow = typeof state.lastRow === "number" ? state.lastRow : 1;
  let maxRows = typeof state.maxRows === "number" ? state.maxRows : lastRow;
  const ops = [];
  const cleared = [];
  const written = [];
  return {
    ops: ops,
    cleared: cleared,
    written: written,
    getLastRow: function () {
      return lastRow;
    },
    getMaxRows: function () {
      return maxRows;
    },
    getRange: function (r, c, numRows, numCols) {
      return {
        clearContent: function () {
          ops.push(["clearContent", r, c, numRows, numCols]);
          cleared.push({ r: r, c: c, numRows: numRows, numCols: numCols });
          return this;
        },
        setValues: function (values) {
          ops.push(["setValues", r, c, numRows, numCols, JSON.parse(JSON.stringify(values))]);
          written.push({ r: r, c: c, numRows: numRows, numCols: numCols, values: JSON.parse(JSON.stringify(values)) });
          return this;
        }
      };
    },
    _setLastRow: function (n) {
      lastRow = n;
    }
  };
}

console.log("3. 試算表模式無 ss 時應使用 SpreadsheetApp.getActiveSpreadsheet...");
{
  const sheet = makeSheet({ lastRow: 3, maxRows: 10 });
  const ss = {
    getSheetByName: function (name) {
      assert.strictEqual(name, db.SHEET_SYSTEM_CONFIG);
      return sheet;
    }
  };
  const SpreadsheetApp = {
    getActiveSpreadsheet: function () {
      return ss;
    }
  };
  const result = withGlobals({ SpreadsheetApp: SpreadsheetApp }, function () {
    return db.saveWhitelist([{ email: "A@B.com", name: "甲", role: "staff", enabled: true }]);
  });
  assert.deepStrictEqual(result, { ok: true, count: 1 });
  assert.strictEqual(sheet.written.length, 1);
  assert.deepStrictEqual(sheet.written[0].values, [["a@b.com", "甲", "業務人員", "是"]]);
  console.log("   ✓ SpreadsheetApp fallback 驗證通過！\n");
}

console.log("4. 試算表模式找不到設定工作表時應拋出錯誤...");
{
  const ss = {
    getSheetByName: function () {
      return null;
    }
  };
  assert.throws(function () {
    db.saveWhitelist([{ email: "a@b.com" }], ss);
  }, /找不到工作表/);
  console.log("   ✓ 缺少工作表錯誤驗證通過！\n");
}

console.log("5. 試算表模式應清除既有資料並寫入正規化列...");
{
  const sheet = makeSheet({ lastRow: 5, maxRows: 10 });
  const ss = {
    getSheetByName: function () {
      return sheet;
    }
  };
  const result = db.saveWhitelist(
    [
      { email: " Admin@Example.com ", name: " 管理員 ", role: "admin", enabled: true },
      { email: "", name: "略過", role: "viewer", enabled: true },
      { email: "u@example.com", name: "使用者", role: "viewer", enabled: false },
      { email: "d@example.com" }
    ],
    ss
  );
  assert.deepStrictEqual(result, { ok: true, count: 3 });
  assert.strictEqual(sheet.cleared.length, 1);
  assert.deepStrictEqual(sheet.cleared[0], { r: 2, c: 4, numRows: 5, numCols: 4 });
  assert.strictEqual(sheet.written.length, 1);
  assert.deepStrictEqual(sheet.written[0], {
    r: 2,
    c: 4,
    numRows: 3,
    numCols: 4,
    values: [
      ["admin@example.com", "管理員", "系統管理員", "是"],
      ["u@example.com", "使用者", "檢視人員", "否"],
      ["d@example.com", "", "檢視人員", "是"]
    ]
  });
  console.log("   ✓ 清除與寫入驗證通過！\n");
}

console.log("6. 試算表模式空清單應僅清除資料且不寫入...");
{
  const sheet = makeSheet({ lastRow: 2, maxRows: 5 });
  const ss = {
    getSheetByName: function () {
      return sheet;
    }
  };
  const result = db.saveWhitelist([], ss);
  assert.deepStrictEqual(result, { ok: true, count: 0 });
  assert.strictEqual(sheet.cleared.length, 1);
  assert.deepStrictEqual(sheet.cleared[0], { r: 2, c: 4, numRows: 2, numCols: 4 });
  assert.strictEqual(sheet.written.length, 0);
  console.log("   ✓ 空清單驗證通過！\n");
}

console.log("✓ saveWhitelist 測試全數通過！\n");
