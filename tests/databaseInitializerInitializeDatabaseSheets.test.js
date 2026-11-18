"use strict";

/**
 * initializeDatabaseSheets 單元測試（G3.2）
 * 驗證後端工作表初始化/修補流程與冪等性行為。
 */

const assert = require("assert");
const db = require("../databaseInitializer.js");
const transformer = require("../subjectCodeTransformer.js");

console.log("開始執行 initializeDatabaseSheets 測試...\n");

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

function createRangeRecorder() {
  const calls = [];
  function makeRange(label, initialValues) {
    let values = initialValues ? initialValues.map(function (r) { return Array.isArray(r) ? r.slice() : r; }) : null;
    const range = {
      setValues: function (v) { calls.push({ type: "setValues", label: label, values: JSON.parse(JSON.stringify(v)) }); values = JSON.parse(JSON.stringify(v)); return range; },
      setFontWeight: function (v) { calls.push({ type: "setFontWeight", label: label, value: v }); return range; },
      setBackground: function (v) { calls.push({ type: "setBackground", label: label, value: v }); return range; },
      setFontSize: function (v) { calls.push({ type: "setFontSize", label: label, value: v }); return range; },
      getValue: function () { calls.push({ type: "getValue", label: label }); return values; },
      getValues: function () { calls.push({ type: "getValues", label: label }); return values ? JSON.parse(JSON.stringify(values)) : values; }
    };
    return range;
  }
  return { calls: calls, makeRange: makeRange };
}

function makeConfigSheet(state) {
  state = state || {};
  let lastRow = typeof state.lastRow === "number" ? state.lastRow : 8;
  let maxCols = typeof state.maxCols === "number" ? state.maxCols : 8;
  const cells = state.cells || {};
  const ops = [];
  const sheet = {
    ops: ops,
    setFrozenRows: function (n) { ops.push(["setFrozenRows", n]); },
    insertColumnsAfter: function (at, howMany) { ops.push(["insertColumnsAfter", at, howMany]); maxCols += howMany; },
    getMaxColumns: function () { return maxCols; },
    getLastRow: function () { return lastRow; },
    getRange: function (r, c, numRows, numCols) {
      // 區塊 A/B 表頭檢查 getValue()
      if (numRows === undefined && numCols === undefined) {
        return {
          getValue: function () { ops.push(["getValue", r, c]); return cells[r + "," + c]; }
        };
      }

      // readSystemSettings 讀取與初始化寫入可能命中同一範圍 (1,1,lastRow,2)
      if (r === 1 && c === 1 && numRows === lastRow && numCols === 2) {
        const range = {
          getValues: function () {
            ops.push(["getValues", r, c, numRows, numCols]);
            const values = [];
            for (let i = 1; i <= lastRow; i++) {
              values.push([
                cells[i + ",1"] !== undefined ? cells[i + ",1"] : "",
                cells[i + ",2"] !== undefined ? cells[i + ",2"] : ""
              ]);
            }
            return values;
          },
          setValues: function (v) {
            ops.push(["setValues", r, c, numRows, numCols, JSON.parse(JSON.stringify(v))]);
            for (let i = 0; i < (v || []).length; i++) {
              for (let j = 0; j < (v[i] || []).length; j++) {
                cells[(r + i) + "," + (c + j)] = v[i][j];
              }
            }
            lastRow = Math.max(lastRow, r + (v ? v.length : 0) - 1);
            return range;
          },
          setFontWeight: function (v) { ops.push(["setFontWeight", r, c, numRows, numCols, v]); return range; },
          setBackground: function (v) { ops.push(["setBackground", r, c, numRows, numCols, v]); return range; }
        };
        return range;
      }

      // 一般寫入/格式化 range
      const range = {
        setValues: function (v) {
          ops.push(["setValues", r, c, numRows, numCols, JSON.parse(JSON.stringify(v))]);
          for (let i = 0; i < (v || []).length; i++) {
            for (let j = 0; j < (v[i] || []).length; j++) {
              cells[(r + i) + "," + (c + j)] = v[i][j];
            }
          }
          if (c === 1 && numCols === 2) {
            lastRow = Math.max(lastRow, r + (v ? v.length : 0) - 1);
          }
          return range;
        },
        setFontWeight: function (v) { ops.push(["setFontWeight", r, c, numRows, numCols, v]); return range; },
        setBackground: function (v) { ops.push(["setBackground", r, c, numRows, numCols, v]); return range; },
        setFontSize: function (v) { ops.push(["setFontSize", r, c, numRows, numCols, v]); return range; }
      };
      return range;
    },
    _setCell: function (r, c, v) { cells[r + "," + c] = v; },
    _setLastRow: function (n) { lastRow = n; },
    _cells: cells
  };
  return sheet;
}

function makeGenericSheet(options) {
  options = options || {};
  let maxCols = typeof options.maxCols === "number" ? options.maxCols : 1;
  const ops = [];
  const sheet = {
    ops: ops,
    insertColumnsAfter: function (at, howMany) { ops.push(["insertColumnsAfter", at, howMany]); maxCols += howMany; },
    getMaxColumns: function () { return maxCols; },
    setFrozenRows: function (n) { ops.push(["setFrozenRows", n]); },
    getRange: function (r, c, numRows, numCols) {
      return {
        setValues: function (v) { ops.push(["setValues", r, c, numRows, numCols, JSON.parse(JSON.stringify(v))]); return this; },
        setFontWeight: function (v) { ops.push(["setFontWeight", r, c, numRows, numCols, v]); return this; },
        setBackground: function (v) { ops.push(["setBackground", r, c, numRows, numCols, v]); return this; },
        setFontSize: function (v) { ops.push(["setFontSize", r, c, numRows, numCols, v]); return this; }
      };
    }
  };
  return sheet;
}

function makeSpreadsheet(sheets) {
  const store = Object.assign({}, sheets || {});
  const inserted = [];
  const ss = {
    getSheetByName: function (name) { return store[name] || null; },
    insertSheet: function (name) { inserted.push(name); if (!store[name]) store[name] = makeGenericSheet(); return store[name]; },
    _store: store,
    _inserted: inserted
  };
  return ss;
}

console.log("1. 缺少有效試算表物件時應拋出錯誤...");
{
  assert.throws(function () {
    withGlobals({ SpreadsheetApp: undefined, NORMALIZED_COURSE_HEADERS: transformer.NORMALIZED_COURSE_HEADERS }, function () {
      db.initializeDatabaseSheets();
    });
  }, /找不到有效的試算表物件/);
  console.log("   ✓ 缺少試算表錯誤驗證通過！\n");
}

console.log("2. 全部工作表不存在時應建立三張工作表並回傳建立清單...");
{
  const created = { config: null, course: null, instruct: null };
  const ss = makeSpreadsheet({});
  ss.insertSheet = function (name) {
    ss._inserted.push(name);
    if (name === db.SHEET_SYSTEM_CONFIG) {
      const s = makeConfigSheet({ lastRow: 1, maxCols: 8, cells: {} });
      // 讓後續 readSystemSettings(ss) 讀到預設參數（插入後會 setValues 寫入 cells，但 read 讀 getRange(1,1,lastRow,2)）
      // 我們在 getRange setValues 時會更新 cells，readSystemSettings 會在同次流程中被呼叫；為簡化，預先填入預設參數
      db.DEFAULT_SYSTEM_PARAMS.forEach(function (row, i) { s._setCell(i + 1, 1, row[0]); s._setCell(i + 1, 2, row[1]); });
      s._setLastRow(db.DEFAULT_SYSTEM_PARAMS.length);
      created.config = s; ss._store[name] = s; return s;
    }
    if (name === db.SHEET_COURSE_INDEX) {
      const s = makeGenericSheet({ maxCols: 1 });
      created.course = s; ss._store[name] = s; return s;
    }
    if (name === db.SHEET_SYSTEM_INSTRUCTIONS) {
      const s = makeGenericSheet({ maxCols: 1 });
      created.instruct = s; ss._store[name] = s; return s;
    }
    const s = makeGenericSheet(); ss._store[name] = s; return s;
  };
  const result = withGlobals({ SpreadsheetApp: undefined, NORMALIZED_COURSE_HEADERS: transformer.NORMALIZED_COURSE_HEADERS }, function () {
    return db.initializeDatabaseSheets({ spreadsheet: ss });
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.sheets, [db.SHEET_SYSTEM_CONFIG, db.SHEET_COURSE_INDEX, db.SHEET_SYSTEM_INSTRUCTIONS]);
  assert.deepStrictEqual(result.createdSheets, [db.SHEET_SYSTEM_CONFIG, db.SHEET_COURSE_INDEX, db.SHEET_SYSTEM_INSTRUCTIONS]);
  assert(created.config && created.course && created.instruct, "應建立三張工作表");
  // config 初始化：寫入預設參數、表頭與凍結
  assert(created.config.ops.some(function (o) { return o[0] === "setValues" && o[1] === 1 && o[2] === 1 && o[3] === db.DEFAULT_SYSTEM_PARAMS.length; }), "應寫入系統參數區塊");
  assert(created.config.ops.some(function (o) { return o[0] === "setValues" && o[1] === 1 && o[2] === 4; }), "應寫入白名單表頭");
  assert(created.config.ops.some(function (o) { return o[0] === "setFrozenRows" && o[1] === 1; }), "應凍結首列");
  // course 初始化：應依表頭數調整欄位、寫入表頭並凍結
  assert(created.course.ops.some(function (o) { return o[0] === "insertColumnsAfter" && o[2] === transformer.NORMALIZED_COURSE_HEADERS.length - 1; }), "應補齊課程索引欄數");
  assert(created.course.ops.some(function (o) { return o[0] === "setValues" && o[1] === 1 && o[2] === 1 && o[3] === 1 && o[4] === transformer.NORMALIZED_COURSE_HEADERS.length; }), "應寫入課程索引表頭");
  assert(created.course.ops.some(function (o) { return o[0] === "setFrozenRows" && o[1] === 1; }), "課程索引應凍結首列");
  // instructions 初始化
  assert(created.instruct.ops.some(function (o) { return o[0] === "setValues" && o[1] === 1 && o[2] === 1 && o[4] === 1; }), "應寫入使用說明內容");
  assert(created.instruct.ops.some(function (o) { return o[0] === "setFontSize" && o[5] === 14; }), "應設定說明標題字級");
  console.log("   ✓ 全新初始化驗證通過！\n");
}

console.log("3. 工作表皆已存在且結構完整時應具冪等性且不建立新工作表...");
{
  const cells = { "1,1": db.DEFAULT_SYSTEM_PARAMS[0][0], "1,4": db.WHITELIST_HEADERS[0] };
  db.DEFAULT_SYSTEM_PARAMS.forEach(function (row, i) { cells[(i + 1) + ",1"] = row[0]; cells[(i + 1) + ",2"] = row[1]; });
  const config = makeConfigSheet({ lastRow: db.DEFAULT_SYSTEM_PARAMS.length, maxCols: 8, cells: cells });
  const course = makeGenericSheet({ maxCols: transformer.NORMALIZED_COURSE_HEADERS.length });
  const instruct = makeGenericSheet({ maxCols: 1 });
  const ss = makeSpreadsheet({
    [db.SHEET_SYSTEM_CONFIG]: config,
    [db.SHEET_COURSE_INDEX]: course,
    [db.SHEET_SYSTEM_INSTRUCTIONS]: instruct
  });
  const result = withGlobals({ SpreadsheetApp: undefined, NORMALIZED_COURSE_HEADERS: transformer.NORMALIZED_COURSE_HEADERS }, function () {
    return db.initializeDatabaseSheets({ spreadsheet: ss, silent: true });
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.createdSheets, []);
  assert.deepStrictEqual(ss._inserted, []);
  // 不應重建課程/說明內容
  assert.strictEqual(course.ops.filter(function (o) { return o[0] === "setValues"; }).length, 0, "既有課程索引不應重寫");
  assert.strictEqual(instruct.ops.filter(function (o) { return o[0] === "setValues"; }).length, 0, "既有說明不應重寫");
  console.log("   ✓ 冪等性驗證通過！\n");
}

console.log("4. 既有設定工作表結構缺漏時應補齊表頭、參數與欄位...");
{
  // 缺少 A1 表頭、缺少部分參數、欄數不足、缺少 D1 表頭
  const cells = { "1,1": "錯誤表頭", "1,4": "錯誤", "2,1": "學年度", "2,2": "114" };
  const config = makeConfigSheet({ lastRow: 2, maxCols: 4, cells: cells });
  const course = makeGenericSheet({ maxCols: transformer.NORMALIZED_COURSE_HEADERS.length });
  const instruct = makeGenericSheet({ maxCols: 1 });
  const ss = makeSpreadsheet({
    [db.SHEET_SYSTEM_CONFIG]: config,
    [db.SHEET_COURSE_INDEX]: course,
    [db.SHEET_SYSTEM_INSTRUCTIONS]: instruct
  });
  const result = withGlobals({ SpreadsheetApp: undefined, NORMALIZED_COURSE_HEADERS: transformer.NORMALIZED_COURSE_HEADERS }, function () {
    return db.initializeDatabaseSheets({ spreadsheet: ss });
  });
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.createdSheets, []);
  // 補齊 A 表頭
  assert(config.ops.some(function (o) { return o[0] === "setValues" && o[1] === 1 && o[2] === 1 && o[3] === 1 && JSON.stringify(o[5]) === JSON.stringify([db.DEFAULT_SYSTEM_PARAMS[0]]); }), "應修補區塊 A 表頭");
  // 補齊缺漏參數（學年度已存在，其餘應附加）
  const appendedParams = config.ops.filter(function (o) { return o[0] === "setValues" && o[2] === 1 && o[4] === 2 && o[3] > 1; });
  assert(appendedParams.length === 1, "應一次附加缺漏參數");
  const appendedKeys = appendedParams[0][5].map(function (r) { return r[0]; });
  assert(appendedKeys.indexOf("學年度") === -1, "既有參數不應重複附加");
  assert(appendedKeys.indexOf("學期") !== -1 && appendedKeys.indexOf("Google 登入允許網域") !== -1, "應附加缺漏參數");
  // 補齊欄數與 B 表頭
  assert(config.ops.some(function (o) { return o[0] === "insertColumnsAfter"; }), "欄數不足時應補欄");
  assert(config.ops.some(function (o) { return o[0] === "setValues" && o[1] === 1 && o[2] === 4 && JSON.stringify(o[5]) === JSON.stringify([db.WHITELIST_HEADERS]); }), "應修補白名單表頭");
  console.log("   ✓ 結構缺漏修補驗證通過！\n");
}

console.log("5. 應優先使用 options.spreadsheet，否則使用 SpreadsheetApp.getActiveSpreadsheet...");
{
  const ssFromOption = makeSpreadsheet({});
  // prefill config for creation flow simplicity
  ssFromOption.insertSheet = function (name) {
    ssFromOption._inserted.push(name);
    if (name === db.SHEET_SYSTEM_CONFIG) {
      const s = makeConfigSheet({ lastRow: 1, maxCols: 8, cells: {} });
      db.DEFAULT_SYSTEM_PARAMS.forEach(function (row, i) { s._setCell(i + 1, 1, row[0]); s._setCell(i + 1, 2, row[1]); });
      s._setLastRow(db.DEFAULT_SYSTEM_PARAMS.length);
      ssFromOption._store[name] = s; return s;
    }
    const s = makeGenericSheet({ maxCols: 1 }); ssFromOption._store[name] = s; return s;
  };
  const ssFromApp = makeSpreadsheet({});
  const SpreadsheetApp = { getActiveSpreadsheet: function () { return ssFromApp; } };
  withGlobals({ SpreadsheetApp: SpreadsheetApp, NORMALIZED_COURSE_HEADERS: transformer.NORMALIZED_COURSE_HEADERS }, function () {
    db.initializeDatabaseSheets({ spreadsheet: ssFromOption });
  });
  assert(ssFromOption._inserted.length > 0, "應使用 options.spreadsheet");
  assert.deepStrictEqual(ssFromApp._inserted, [], "指定 spreadsheet 時不應使用 SpreadsheetApp");

  const ss2 = makeSpreadsheet({});
  ss2.insertSheet = function (name) {
    ss2._inserted.push(name);
    if (name === db.SHEET_SYSTEM_CONFIG) {
      const s = makeConfigSheet({ lastRow: 1, maxCols: 8, cells: {} });
      db.DEFAULT_SYSTEM_PARAMS.forEach(function (row, i) { s._setCell(i + 1, 1, row[0]); s._setCell(i + 1, 2, row[1]); });
      s._setLastRow(db.DEFAULT_SYSTEM_PARAMS.length);
      ss2._store[name] = s; return s;
    }
    const s = makeGenericSheet({ maxCols: 1 }); ss2._store[name] = s; return s;
  };
  withGlobals({ SpreadsheetApp: { getActiveSpreadsheet: function () { return ss2; } }, NORMALIZED_COURSE_HEADERS: transformer.NORMALIZED_COURSE_HEADERS }, function () {
    db.initializeDatabaseSheets();
  });
  assert(ss2._inserted.length > 0, "未指定時應使用 SpreadsheetApp.getActiveSpreadsheet");
  console.log("   ✓ 試算表來源解析驗證通過！\n");
}

console.log("✓ initializeDatabaseSheets 測試全數通過！\n");
