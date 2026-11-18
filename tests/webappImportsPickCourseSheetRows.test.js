"use strict";

/**
 * webapp/js/imports.js::pickCourseSheetRows 單元測試（G7.12）。
 * 驗證課程工作表優先、退回首個有資料工作表、讀取順序與空活頁簿行為。
 */

const assert = require("assert");
const importsModule = require("../webapp/js/imports.js");
const helpers = require("./helpers/importsUiDeps.js");
const createDeps = helpers.createImportsDeps;
const makeXlsx = helpers.makeXlsx;

console.log("開始執行 webapp/js/imports.js pickCourseSheetRows 測試...\n");

function run() {
  assert.strictEqual(typeof importsModule.pickCourseSheetRows, "function", "應匯出純函式");
  console.log("1. 應匯出可測試挑選函式 ✓\n");

  const names = ["一般資料", "課綱寬表"];
  const readOrder = [];
  const picked = importsModule.pickCourseSheetRows(
    { SheetNames: names },
    function (name) {
      readOrder.push(name);
      return name === "課綱寬表" ? [["科目名稱", "課程代碼"]] : [["其他"]];
    }
  );
  assert.deepStrictEqual(picked, { sheetName: "課綱寬表", rows: [["科目名稱", "課程代碼"]] });
  assert.deepStrictEqual(readOrder, ["一般資料", "課綱寬表"]);
  console.log("2. 應優先回傳具課綱標頭的工作表 ✓\n");

  const fallbackOrder = [];
  const fallback = importsModule.pickCourseSheetRows(
    { SheetNames: ["A", "B"] },
    function (name) {
      fallbackOrder.push(name);
      return [[name]];
    }
  );
  assert.deepStrictEqual(fallback, { sheetName: "A", rows: [["A"]] });
  assert.deepStrictEqual(fallbackOrder, ["A", "B", "A"]);
  console.log("3. 無課綱標頭時應退回首個有資料工作表 ✓\n");

  const emptyOrder = [];
  const empty = importsModule.pickCourseSheetRows(
    { SheetNames: ["A", "B"] },
    function (name) {
      emptyOrder.push(name);
      return [];
    }
  );
  assert.deepStrictEqual(empty, { sheetName: "", rows: [] });
  assert.deepStrictEqual(emptyOrder, ["A", "B", "A", "B"]);

  const noNamesOrder = [];
  const noNames = importsModule.pickCourseSheetRows({}, function (name) {
    noNamesOrder.push(name);
    return [["x"]];
  });
  assert.deepStrictEqual(noNames, { sheetName: "", rows: [] });
  assert.deepStrictEqual(noNamesOrder, []);
  console.log("4. 全空工作表與無工作表名稱應回傳空結果 ✓\n");

  const ctx = createDeps();
  ctx.win.XLSX = makeXlsx({
    "一般資料": { rows: [["其他"]] },
    "課綱寬表": { rows: [["課程代碼"]] }
  });
  const workbook = ctx.win.XLSX.read();
  assert.deepStrictEqual(ctx.imports.pickCourseSheetRows(workbook).sheetName, "課綱寬表");
  assert.deepStrictEqual(ctx.imports.rowsOfSheet(workbook, "不存在"), []);
  assert.strictEqual(ctx.imports.rowsOfSheet(workbook, "一般資料")[0][0], "其他");
  console.log("5. 模組實例搭配 SheetJS 讀取行為一致 ✓\n");

  console.log("✓ webapp/js/imports.js pickCourseSheetRows 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
