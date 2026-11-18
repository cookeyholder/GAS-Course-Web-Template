"use strict";

/**
 * importNormalizedCourseCodes 單元測試（G4.2）
 * 驗證課程代碼匯入之資料來源解析、正規化分支、工作表準備與分批寫入行為。
 */

const assert = require("assert");
const transformer = require("../subjectCodeTransformer.js");

console.log("開始執行 importNormalizedCourseCodes 測試...\n");

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

function makeRange(label, ops) {
  const range = {
    _label: label,
    setValues: function (v) { ops.push({ type: "setValues", label: label, values: JSON.parse(JSON.stringify(v)) }); return range; },
    setFontWeight: function (v) { ops.push({ type: "setFontWeight", label: label, value: v }); return range; },
    setNumberFormat: function (v) { ops.push({ type: "setNumberFormat", label: label, value: v }); return range; },
    setFontSize: function (v) { ops.push({ type: "setFontSize", label: label, value: v }); return range; }
  };
  return range;
}

function makeSheet(config) {
  config = config || {};
  let maxCols = typeof config.maxCols === "number" ? config.maxCols : transformer.NORMALIZED_COURSE_HEADERS.length;
  let maxRows = typeof config.maxRows === "number" ? config.maxRows : 1;
  let frozenRows = typeof config.frozenRows === "number" ? config.frozenRows : 0;
  const ops = [];
  const sheet = {
    ops: ops,
    clearContents: function () { ops.push({ type: "clearContents" }); },
    getMaxColumns: function () { return maxCols; },
    insertColumnsAfter: function (at, howMany) { ops.push({ type: "insertColumnsAfter", at: at, howMany: howMany }); maxCols += howMany; },
    getMaxRows: function () { return maxRows; },
    getFrozenRows: function () { return frozenRows; },
    setFrozenRows: function (n) { ops.push({ type: "setFrozenRows", value: n }); frozenRows = n; },
    getRange: function (r, c, numRows, numCols) {
      const label = [r, c, numRows, numCols].join(",");
      ops.push({ type: "getRange", label: label });
      return makeRange(label, ops);
    },
    _setMaxRows: function (n) { maxRows = n; },
    _setFrozenRows: function (n) { frozenRows = n; }
  };
  return sheet;
}

function makeSpreadsheet(sheetMap) {
  const store = Object.assign({}, sheetMap || {});
  const inserted = [];
  return {
    store: store,
    inserted: inserted,
    getSheetByName: function (name) { return store[name] || null; },
    insertSheet: function (name) {
      inserted.push(name);
      if (!store[name]) store[name] = makeSheet();
      return store[name];
    }
  };
}

const H = transformer.NORMALIZED_COURSE_HEADERS;

console.log("1. 缺少有效試算表物件時應拋出錯誤...");
{
  assert.throws(function () {
    withGlobals({ SpreadsheetApp: undefined, safeApplySheetFontSize: function () {} }, function () {
      transformer.importNormalizedCourseCodes([], {});
    });
  }, /找不到有效的試算表物件/);
  console.log("   ✓ 缺少試算表錯誤驗證通過！\n");
}

console.log("2. 無 spreadsheet 時應使用 SpreadsheetApp.getActiveSpreadsheet 並建立不存在之工作表...");
{
  const ss = makeSpreadsheet({});
  const SpreadsheetApp = { getActiveSpreadsheet: function () { return ss; } };
  let fontArgs = null;
  const result = withGlobals({
    SpreadsheetApp: SpreadsheetApp,
    safeApplySheetFontSize: function (range, size) { fontArgs = { range: range, size: size }; }
  }, function () {
    return transformer.importNormalizedCourseCodes([], { preNormalized: true });
  });
  assert.deepStrictEqual(result, {
    ok: true,
    rows: 0,
    stats: { sourceRows: 0, excludedRows: 0, keptCourseRows: 0, expandedRows: 0, returnedRows: 0 }
  });
  assert.deepStrictEqual(ss.inserted, [transformer.NORMALIZED_COURSE_SHEET_NAME]);
  assert(fontArgs && fontArgs.size === 11, "應套用字級 11");
  console.log("   ✓ SpreadsheetApp fallback 與建表驗證通過！\n");
}

console.log("3. preNormalized 模式應直接使用資料、移除表頭列並略過 normalizeCourseCodes...");
{
  const ss = makeSpreadsheet({ [transformer.NORMALIZED_COURSE_SHEET_NAME]: makeSheet({ maxRows: 5, frozenRows: 0 }) });
  const sheet = ss.store[transformer.NORMALIZED_COURSE_SHEET_NAME];
  const rows = [
    H.slice(),
    ["114", "1", "1", "114", "C1", "科目1", "群", "科", "類", "式", "屬", "必", "2", "2"],
    ["114", "2", "1", "114", "C2", "科目2", "群", "科", "類", "式", "屬", "選", "1", "1"]
  ];
  const result = withGlobals({ SpreadsheetApp: undefined, safeApplySheetFontSize: function () {}, normalizeCourseCodes: function () { throw new Error("should not call"); } }, function () {
    return transformer.importNormalizedCourseCodes(rows, { spreadsheet: ss, preNormalized: true });
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.rows, 2);
  assert.deepStrictEqual(result.stats, { sourceRows: 2, excludedRows: 0, keptCourseRows: 2, expandedRows: 2, returnedRows: 2 });
  // 寫入資料列（不含表頭）
  const dataWrites = sheet.ops.filter(function (o) { return o.type === "setValues" && o.label.indexOf("2,1,") === 0; });
  assert.strictEqual(dataWrites.length, 1);
  assert.deepStrictEqual(dataWrites[0].values, [
    ["114", "1", "1", "114", "C1", "科目1", "群", "科", "類", "式", "屬", "必", "2", "2"],
    ["114", "2", "1", "114", "C2", "科目2", "群", "科", "類", "式", "屬", "選", "1", "1"]
  ]);
  console.log("   ✓ preNormalized 分支與表頭移除驗證通過！\n");
}

console.log("4. preNormalized 模式第一列非表頭時不應移除，且 rawData 非陣列視為空...");
{
  const ss = makeSpreadsheet({ [transformer.NORMALIZED_COURSE_SHEET_NAME]: makeSheet() });
  const sheet = ss.store[transformer.NORMALIZED_COURSE_SHEET_NAME];
  const rows = [["114", "1", "1", "114", "C1", "科目1", "群", "科", "類", "式", "屬", "必", "2", "2"]];
  const r1 = withGlobals({ SpreadsheetApp: undefined, safeApplySheetFontSize: function () {} }, function () {
    return transformer.importNormalizedCourseCodes(rows, { spreadsheet: ss, preNormalized: true });
  });
  assert.strictEqual(r1.rows, 1);
  const r2 = withGlobals({ SpreadsheetApp: undefined, safeApplySheetFontSize: function () {} }, function () {
    return transformer.importNormalizedCourseCodes(null, { spreadsheet: ss, preNormalized: true });
  });
  assert.strictEqual(r2.rows, 0);
  assert.deepStrictEqual(r2.stats.sourceRows, 0);
  console.log("   ✓ 非表頭與非陣列輸入驗證通過！\n");
}

console.log("5. 非 preNormalized 模式應呼叫 normalizeCourseCodes 並使用其結果...");
{
  const ss = makeSpreadsheet({ [transformer.NORMALIZED_COURSE_SHEET_NAME]: makeSheet() });
  const normalized = {
    rows: [["114", "1", "1", "114", "N1", "正規化", "群", "科", "類", "式", "屬", "必", "3", "3"]],
    stats: { sourceRows: 2, excludedRows: 0, keptCourseRows: 1, expandedRows: 1, returnedRows: 1 }
  };
  let called = null;
  const result = withGlobals({
    SpreadsheetApp: undefined,
    safeApplySheetFontSize: function () {},
    normalizeCourseCodes: function (rawData, options) { called = { rawData: rawData, options: options }; return normalized; }
  }, function () {
    return transformer.importNormalizedCourseCodes([{ any: 1 }], { spreadsheet: ss });
  });
  assert.deepStrictEqual(called.options, { withStats: true });
  assert.strictEqual(result.rows, 1);
  assert.deepStrictEqual(result.stats, normalized.stats);
  console.log("   ✓ normalizeCourseCodes 呼叫與結果驗證通過！\n");
}

console.log("6. reset 預設為 true 應清除內容，reset 為 false 不應清除...");
{
  const ss1 = makeSpreadsheet({ [transformer.NORMALIZED_COURSE_SHEET_NAME]: makeSheet() });
  const sheet1 = ss1.store[transformer.NORMALIZED_COURSE_SHEET_NAME];
  withGlobals({ SpreadsheetApp: undefined, safeApplySheetFontSize: function () {} }, function () {
    transformer.importNormalizedCourseCodes([], { spreadsheet: ss1, preNormalized: true });
  });
  assert(sheet1.ops.some(function (o) { return o.type === "clearContents"; }), "預設應 clearContents");

  const ss2 = makeSpreadsheet({ [transformer.NORMALIZED_COURSE_SHEET_NAME]: makeSheet() });
  const sheet2 = ss2.store[transformer.NORMALIZED_COURSE_SHEET_NAME];
  withGlobals({ SpreadsheetApp: undefined, safeApplySheetFontSize: function () {} }, function () {
    transformer.importNormalizedCourseCodes([], { spreadsheet: ss2, preNormalized: true, reset: false });
  });
  assert(!sheet2.ops.some(function (o) { return o.type === "clearContents"; }), "reset=false 不應 clearContents");
  console.log("   ✓ reset 行為驗證通過！\n");
}

console.log("7. 欄數不足時應補欄，並寫入表頭/格式/凍結列...");
{
  const sheet = makeSheet({ maxCols: 3, maxRows: 2, frozenRows: 0 });
  const ss = makeSpreadsheet({ [transformer.NORMALIZED_COURSE_SHEET_NAME]: sheet });
  let fontCall = null;
  withGlobals({ SpreadsheetApp: undefined, safeApplySheetFontSize: function (range, size) { fontCall = { label: range._label, size: size }; } }, function () {
    transformer.importNormalizedCourseCodes([], { spreadsheet: ss, preNormalized: true });
  });
  const insert = sheet.ops.find(function (o) { return o.type === "insertColumnsAfter"; });
  assert.deepStrictEqual(insert, { type: "insertColumnsAfter", at: 3, howMany: H.length - 3 });
  const headerWrite = sheet.ops.find(function (o) { return o.type === "setValues" && o.label === "1,1,1," + H.length; });
  assert.deepStrictEqual(headerWrite.values, [H]);
  const bold = sheet.ops.find(function (o) { return o.type === "setFontWeight" && o.label === "1,1,1," + H.length; });
  assert.strictEqual(bold.value, "bold");
  const fmt = sheet.ops.find(function (o) { return o.type === "setNumberFormat" && o.label === "1,1,2," + H.length; });
  assert.strictEqual(fmt.value, "@");
  assert.deepStrictEqual(fontCall, { label: "1,1,2," + H.length, size: 11 });
  assert(sheet.ops.some(function (o) { return o.type === "setFrozenRows" && o.value === 1; }));
  console.log("   ✓ 欄位補齊與格式化驗證通過！\n");
}

console.log("8. 欄數足夠且已凍結列時不應補欄或重設凍結...");
{
  const sheet = makeSheet({ maxCols: H.length, maxRows: 10, frozenRows: 1 });
  const ss = makeSpreadsheet({ [transformer.NORMALIZED_COURSE_SHEET_NAME]: sheet });
  withGlobals({ SpreadsheetApp: undefined, safeApplySheetFontSize: function () {} }, function () {
    transformer.importNormalizedCourseCodes([], { spreadsheet: ss, preNormalized: true });
  });
  assert(!sheet.ops.some(function (o) { return o.type === "insertColumnsAfter"; }));
  assert(!sheet.ops.some(function (o) { return o.type === "setFrozenRows"; }));
  console.log("   ✓ 無需補欄/凍結驗證通過！\n");
}

console.log("9. 資料列應分批寫入（依 COURSE_INDEX_WRITE_CHUNK_SIZE）...");
{
  const chunkSize = 5000;
  const total = chunkSize + 2;
  const rows = [];
  for (let i = 0; i < total; i++) rows.push([String(i)]);
  const sheet = makeSheet({ maxRows: 1, frozenRows: 0 });
  const ss = makeSpreadsheet({ [transformer.NORMALIZED_COURSE_SHEET_NAME]: sheet });
  const result = withGlobals({ SpreadsheetApp: undefined, safeApplySheetFontSize: function () {} }, function () {
    return transformer.importNormalizedCourseCodes(rows, { spreadsheet: ss, preNormalized: true });
  });
  assert.strictEqual(result.rows, total);
  const dataWrites = sheet.ops.filter(function (o) { return o.type === "setValues" && o.label.indexOf("1,1,1,") !== 0; });
  assert.strictEqual(dataWrites.length, 2);
  assert.strictEqual(dataWrites[0].label, "2,1," + chunkSize + "," + H.length);
  assert.strictEqual(dataWrites[0].values.length, chunkSize);
  assert.strictEqual(dataWrites[1].label, (2 + chunkSize) + ",1,2," + H.length);
  assert.strictEqual(dataWrites[1].values.length, 2);
  console.log("   ✓ 分批寫入驗證通過！\n");
}

console.log("✓ importNormalizedCourseCodes 測試全數通過！\n");
