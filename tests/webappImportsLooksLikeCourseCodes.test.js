"use strict";

/**
 * webapp/js/imports.js::looksLikeCourseCodes 單元測試（G7.11）。
 * 驗證前三列標頭辨識、空白修剪、非字串值與邊界行為。
 */

const assert = require("assert");
const importsModule = require("../webapp/js/imports.js");
const createDeps = require("./helpers/importsUiDeps.js").createImportsDeps;

console.log("開始執行 webapp/js/imports.js looksLikeCourseCodes 測試...\n");

function run() {
  assert.strictEqual(typeof importsModule.looksLikeCourseCodes, "function", "應匯出純函式");
  console.log("1. 應匯出可測試純函式 ✓\n");

  const keywords = ["課程代碼", "科目屬性", "科目名稱"];
  keywords.forEach(function (keyword) {
    assert.strictEqual(importsModule.looksLikeCourseCodes([[keyword]]), true, keyword + " 應辨識為課綱標頭");
  });
  console.log("2. 三種課綱標頭皆應回傳 true ✓\n");

  assert.strictEqual(importsModule.looksLikeCourseCodes([[], ["其他", "  課程代碼  "]]), true);
  assert.strictEqual(importsModule.looksLikeCourseCodes([["x"], null, ["科目名稱"]]), true);
  assert.strictEqual(importsModule.looksLikeCourseCodes([["x"], ["課程代碼"]]), true);
  console.log("3. 前三列與陣列列皆應參與辨識 ✓\n");

  assert.strictEqual(importsModule.looksLikeCourseCodes([]), false);
  assert.strictEqual(importsModule.looksLikeCourseCodes(null), false);
  assert.strictEqual(importsModule.looksLikeCourseCodes([[1, 2, 3], ["一般科目"]]), false);
  assert.strictEqual(importsModule.looksLikeCourseCodes([["x"], ["y"], ["z"], ["課程代碼"]]), false);
  assert.strictEqual(importsModule.looksLikeCourseCodes([["課程 代碼"]]), false);
  console.log("4. 無標頭、第四列標頭與非精確值應回傳 false ✓\n");

  const ctx = createDeps();
  assert.strictEqual(ctx.imports.looksLikeCourseCodes([["科目屬性"]]), true);
  assert.strictEqual(ctx.imports.looksLikeCourseCodes([[]]), false);
  console.log("5. 模組實例內部函式行為一致 ✓\n");

  console.log("✓ webapp/js/imports.js looksLikeCourseCodes 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
