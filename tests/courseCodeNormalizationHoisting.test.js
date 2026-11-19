"use strict";

/**
 * expandCourseRow 常數因子最佳化測試（task 2.3）
 * 驗證與學期無關的 7 個欄位每列只讀取一次，且前後端展開結果完全一致。
 */

const assert = require("assert");
const backend = require("../subjectCodeTransformer.js");
const frontend = require("../webapp/js/courseData.js");

const SHARED_FIELD_INDEXES = [0, 2, 6, 7, 9, 11, 15];

/**
 * 建立六個學期皆有開課的 39 欄資料列，並計算指定欄位的讀取次數。
 *
 * @returns {Object} 含讀取計數的資料列
 */
function createInstrumentedRow() {
  const row = new Array(39).fill("");
  row[0] = "305101A";
  row[2] = "程式設計實習";
  row[6] = "23";
  row[7] = "305";
  row[9] = "1";
  row[10] = "0";
  row[11] = "3";
  row[15] = "1";
  row[16] = "114";
  row[17] = "115";
  row[18] = "116";
  for (let i = 19; i < 31; i++) row[i] = 3;

  const reads = {};
  SHARED_FIELD_INDEXES.forEach(function (index) {
    const value = row[index];
    reads[index] = 0;
    Object.defineProperty(row, index, {
      configurable: true,
      enumerable: true,
      get: function () {
        reads[index] += 1;
        return value;
      }
    });
  });
  return { row: row, reads: reads };
}

console.log("開始執行 expandCourseRow 常數因子最佳化測試...\n");

console.log("1. 後端六學期展開時，共用欄位每列只讀取一次...");
{
  const fixture = createInstrumentedRow();
  const result = backend.expandCourseRow(fixture.row);
  assert.strictEqual(result.length, 6, "六學期皆開課應展開為六筆");
  SHARED_FIELD_INDEXES.forEach(function (index) {
    assert.strictEqual(fixture.reads[index], 1, "欄位 " + index + " 應只讀取一次");
  });
  console.log("   ✓ 後端讀取次數驗證通過！\n");
}

console.log("2. 前端六學期展開時，共用欄位每列只讀取一次...");
{
  const fixture = createInstrumentedRow();
  const result = frontend.expandCourseRow(fixture.row);
  assert.strictEqual(result.length, 6, "六學期皆開課應展開為六筆");
  SHARED_FIELD_INDEXES.forEach(function (index) {
    assert.strictEqual(fixture.reads[index], 1, "欄位 " + index + " 應只讀取一次");
  });
  console.log("   ✓ 前端讀取次數驗證通過！\n");
}

console.log("3. 前後端展開結果應完全一致...");
{
  const backendFixture = createInstrumentedRow();
  const frontendFixture = createInstrumentedRow();
  assert.deepStrictEqual(frontend.expandCourseRow(frontendFixture.row), backend.expandCourseRow(backendFixture.row));
  console.log("   ✓ 前後端同構驗證通過！\n");
}

console.log("✓ expandCourseRow 常數因子最佳化測試全數通過！\n");
