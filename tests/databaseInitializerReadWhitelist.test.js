"use strict";

/**
 * readWhitelist 單元測試（G3.3）
 * 驗證授權白名單讀取之記憶體/試算表來源、空值處理與欄位正規化行為。
 */

const assert = require("assert");
const db = require("../databaseInitializer.js");

console.log("開始執行 readWhitelist 測試...\n");

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

console.log("1. 無試算表時應回傳記憶體白名單副本...");
{
  resetMemoryWhitelist();
  try {
    withGlobals({ SpreadsheetApp: undefined }, function () {
      db.saveWhitelist([
        { email: "A@Example.com", name: " 管理員 ", role: "admin", enabled: true },
        { email: "b@example.com", name: "檢視", role: "viewer", enabled: false }
      ]);
      const r1 = db.readWhitelist();
      const r2 = db.readWhitelist();
      assert.strictEqual(r1.length, 2);
      assert.strictEqual(r1[0].email, "a@example.com");
      assert.notStrictEqual(r1, r2, "應回傳副本");
      r1.push({ email: "x@example.com" });
      assert.strictEqual(db.readWhitelist().length, 2, "修改副本不應影響來源");
    });
    console.log("   ✓ 記憶體白名單副本驗證通過！\n");
  } finally {
    resetMemoryWhitelist();
  }
}

console.log("2. 無 ss 時應使用 SpreadsheetApp.getActiveSpreadsheet...");
{
  const sheet = {
    getLastRow: function () {
      return 1;
    }
  };
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
  const r = withGlobals({ SpreadsheetApp: SpreadsheetApp }, function () {
    return db.readWhitelist();
  });
  assert.deepStrictEqual(r, []);
  console.log("   ✓ SpreadsheetApp fallback 驗證通過！\n");
}

console.log("3. 找不到設定工作表時應回傳空陣列...");
{
  const ss = {
    getSheetByName: function () {
      return null;
    }
  };
  assert.deepStrictEqual(db.readWhitelist(ss), []);
  console.log("   ✓ 缺少工作表驗證通過！\n");
}

console.log("4. lastRow < 2 時應回傳空陣列...");
{
  const sheet0 = {
    getLastRow: function () {
      return 0;
    },
    getRange: function () {
      throw new Error("should not read");
    }
  };
  const sheet1 = {
    getLastRow: function () {
      return 1;
    },
    getRange: function () {
      throw new Error("should not read");
    }
  };
  assert.deepStrictEqual(
    db.readWhitelist({
      getSheetByName: function () {
        return sheet0;
      }
    }),
    []
  );
  assert.deepStrictEqual(
    db.readWhitelist({
      getSheetByName: function () {
        return sheet1;
      }
    }),
    []
  );
  console.log("   ✓ 無資料列驗證通過！\n");
}

console.log("5. 應解析白名單資料、略過空 email 並正規化欄位...");
{
  const values = [
    ["  ADMIN@Example.com ", " 管理員 ", "系統管理員", true],
    ["", "忽略", "viewer", "是"],
    ["staff@example.com", "  ", "staff", "TRUE"],
    ["viewer@example.com", "檢視", "unknown", "否"],
    ["v2@example.com", "V2", "viewer", "false"],
    ["v3@example.com", "V3", "viewer", " 是 "]
  ];
  const sheet = {
    getLastRow: function () {
      return values.length + 1;
    },
    getRange: function (r, c, numRows, numCols) {
      assert.strictEqual(r, 2);
      assert.strictEqual(c, 4);
      assert.strictEqual(numRows, values.length);
      assert.strictEqual(numCols, 4);
      return {
        getValues: function () {
          return values;
        }
      };
    }
  };
  const ss = {
    getSheetByName: function () {
      return sheet;
    }
  };
  const result = db.readWhitelist(ss);
  assert.deepStrictEqual(result, [
    { email: "admin@example.com", name: "管理員", role: "admin", roleName: "系統管理員", enabled: true },
    { email: "staff@example.com", name: "", role: "staff", roleName: "業務人員", enabled: true },
    { email: "viewer@example.com", name: "檢視", role: "unknown", roleName: "檢視人員", enabled: false },
    { email: "v2@example.com", name: "V2", role: "viewer", roleName: "檢視人員", enabled: false },
    { email: "v3@example.com", name: "V3", role: "viewer", roleName: "檢視人員", enabled: true }
  ]);
  console.log("   ✓ 資料解析與正規化驗證通過！\n");
}

console.log("6. options/欄位缺值時應使用預設值...");
{
  const values = [
    [null, null, null, null],
    ["u@example.com", null, null, ""]
  ];
  const sheet = {
    getLastRow: function () {
      return 3;
    },
    getRange: function () {
      return {
        getValues: function () {
          return values;
        }
      };
    }
  };
  const ss = {
    getSheetByName: function () {
      return sheet;
    }
  };
  const result = db.readWhitelist(ss);
  assert.deepStrictEqual(result, [
    { email: "u@example.com", name: "", role: "viewer", roleName: "檢視人員", enabled: false }
  ]);
  console.log("   ✓ 缺值預設值驗證通過！\n");
}

console.log("✓ readWhitelist 測試全數通過！\n");
