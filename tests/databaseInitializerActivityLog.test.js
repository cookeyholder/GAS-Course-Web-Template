"use strict";

/**
 * databaseInitializerActivityLog.test.js（task 1.2）
 * 驗證操作日誌工作表建立、12 欄表頭、凍結標題列、詳情純文字格式，
 * 以及既有工作表不受影響。
 */

const assert = require("assert");
const db = require("../databaseInitializer.js");

function makeSheet() {
  const ops = [];
  let frozenRows = 0;
  let maxCols = 1;
  const sheet = {
    ops: ops,
    getMaxColumns: function () {
      return maxCols;
    },
    insertColumnsAfter: function (at, howMany) {
      ops.push(["insertColumnsAfter", at, howMany]);
      maxCols += howMany;
    },
    setFrozenRows: function (n) {
      frozenRows = n;
      ops.push(["setFrozenRows", n]);
    },
    getFrozenRows: function () {
      return frozenRows;
    },
    getRange: function (r, c, numRows, numCols) {
      const range = {
        setValues: function (v) {
          ops.push(["setValues", r, c, numRows, numCols, JSON.parse(JSON.stringify(v))]);
          return range;
        },
        setFontWeight: function (v) {
          ops.push(["setFontWeight", r, c, numRows, numCols, v]);
          return range;
        },
        setBackground: function (v) {
          ops.push(["setBackground", r, c, numRows, numCols, v]);
          return range;
        },
        setFontSize: function (v) {
          ops.push(["setFontSize", r, c, numRows, numCols, v]);
          return range;
        },
        setNumberFormat: function (v) {
          ops.push(["setNumberFormat", r, c, numRows, numCols, v]);
          return range;
        }
      };
      return range;
    }
  };
  return sheet;
}

function makeSpreadsheet(initialSheets) {
  const store = Object.assign({}, initialSheets || {});
  const inserted = [];
  return {
    getSheetByName: function (name) {
      return store[name] || null;
    },
    insertSheet: function (name) {
      inserted.push(name);
      const sheet = makeSheet();
      store[name] = sheet;
      return sheet;
    },
    _store: store,
    _inserted: inserted
  };
}

console.log("開始執行 databaseInitializerActivityLog 測試...\n");

console.log("1. 全新試算表應建立 12 欄操作日誌工作表...");
{
  const ss = makeSpreadsheet({});
  const result = db.initializeDatabaseSheets({ spreadsheet: ss });
  assert.strictEqual(result.ok, true);
  assert(result.createdSheets.indexOf(db.SHEET_ACTIVITY_LOG) !== -1, "應建立操作日誌工作表");
  assert(ss._inserted.indexOf(db.SHEET_ACTIVITY_LOG) !== -1, "insertSheet 應包含操作日誌");

  const activity = ss._store[db.SHEET_ACTIVITY_LOG];
  assert(activity, "應取得操作日誌工作表");
  assert.strictEqual(activity.getFrozenRows(), 1, "應凍結標題列");

  const headerWrite = activity.ops.find(function (o) {
    return o[0] === "setValues" && o[1] === 1 && o[2] === 1 && o[4] === db.ACTIVITY_LOG_HEADERS.length;
  });
  assert(headerWrite, "應寫入表頭");
  assert.strictEqual(db.ACTIVITY_LOG_HEADERS.length, 12, "表頭應為 12 欄");
  assert.deepStrictEqual(headerWrite[5][0], db.ACTIVITY_LOG_HEADERS, "表頭內容應正確");

  const formatCalls = activity.ops.filter(function (o) {
    return o[0] === "setNumberFormat" && o[5] === "@";
  });
  assert.strictEqual(formatCalls.length, 2, "應對第 1 欄與第 10 欄各套用一次純文字格式");
  const formattedColumns = formatCalls.map(function (o) {
    return o[2];
  });
  assert(formattedColumns.indexOf(1) !== -1, "純文字格式應套用第 1 欄（時間戳記）");
  assert(formattedColumns.indexOf(10) !== -1, "純文字格式應套用第 10 欄（詳情 JSON）");
  formatCalls.forEach(function (o) {
    assert(o[3] > 1000, "格式化範圍應放大（> 1000 列），實得 " + o[3]);
  });
  console.log("   ✓ 建立與格式驗證通過！\n");
}

console.log("2. 既有工作表應不受影響...");
{
  const existing = makeSheet();
  existing.ops.push(["pre-existing"]);
  const opsBefore = existing.ops.length;
  const ss = makeSpreadsheet({ 既有工作表: existing });
  db.initializeDatabaseSheets({ spreadsheet: ss });
  assert.strictEqual(existing.ops.length, opsBefore, "既有工作表不應被寫入");
  assert.strictEqual(ss._store["既有工作表"], existing, "既有工作表物件不應被取代");
  console.log("   ✓ 既有工作表不受影響驗證通過！\n");
}

console.log("3. 重複初始化應保持冪等且不覆寫既有日誌...");
{
  const activity = makeSheet();
  activity.ops.push(["pre-existing-log-row"]);
  const ss = makeSpreadsheet({ [db.SHEET_ACTIVITY_LOG]: activity });
  const result = db.initializeDatabaseSheets({ spreadsheet: ss });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(ss._inserted.indexOf(db.SHEET_ACTIVITY_LOG), -1, "不應重複建立操作日誌工作表");
  assert.strictEqual(result.createdSheets.indexOf(db.SHEET_ACTIVITY_LOG), -1, "不應列入建立清單");
  assert.deepStrictEqual(activity.ops[0], ["pre-existing-log-row"], "既有日誌資料不應被覆寫");
  assert.strictEqual(
    activity.ops.filter(function (o) {
      return o[0] === "setValues";
    }).length,
    0,
    "既有工作表不應被寫入資料"
  );
  console.log("   ✓ 冪等性驗證通過！\n");
}

console.log("4. 既有操作日誌工作表亦應補上第 1 欄與第 10 欄純文字格式...");
{
  const activity = makeSheet();
  activity.ops.push(["pre-existing-log-row"]);
  const ss = makeSpreadsheet({ [db.SHEET_ACTIVITY_LOG]: activity });
  db.initializeDatabaseSheets({ spreadsheet: ss });

  const formatCalls = activity.ops.filter(function (o) {
    return o[0] === "setNumberFormat" && o[5] === "@";
  });
  assert.strictEqual(formatCalls.length, 2, "既有工作表應對第 1 欄與第 10 欄各套用一次純文字格式");
  const formattedColumns = formatCalls.map(function (o) {
    return o[2];
  });
  assert(formattedColumns.indexOf(1) !== -1, "純文字格式應套用第 1 欄（時間戳記）");
  assert(formattedColumns.indexOf(10) !== -1, "純文字格式應套用第 10 欄（詳情 JSON）");
  assert.deepStrictEqual(activity.ops[0], ["pre-existing-log-row"], "既有資料不應被覆寫");
  console.log("   ✓ 既有工作表格式補強驗證通過！\n");
}

console.log("✓ databaseInitializerActivityLog.test.js 測試全數通過！\n");
