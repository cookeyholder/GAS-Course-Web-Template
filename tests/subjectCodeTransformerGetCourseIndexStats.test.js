"use strict";

/**
 * getCourseIndexStats 輕量統計測試（task 2.2）
 * 驗證只讀取最後一列索引、不下載整份工作表，以及各種缺表情境。
 */

const assert = require("assert");
const transformer = require("../subjectCodeTransformer.js");

console.log("開始執行 getCourseIndexStats 測試...\n");

console.log("1. 應以 getLastRow 取得筆數且不讀取整份工作表...");
{
  let dataRangeCalls = 0;
  const sheet = {
    getLastRow: function () {
      return 1201;
    },
    getDataRange: function () {
      dataRangeCalls += 1;
      return {
        getValues: function () {
          return [];
        }
      };
    }
  };
  const ss = {
    getSheetByName: function (name) {
      assert.strictEqual(name, transformer.NORMALIZED_COURSE_SHEET_NAME);
      return sheet;
    }
  };
  assert.deepStrictEqual(transformer.getCourseIndexStats(ss), { ok: true, total: 1200 });
  assert.strictEqual(dataRangeCalls, 0, "不得呼叫 getDataRange");
  console.log("   ✓ 輕量統計驗證通過！\n");
}

console.log("2. 只有表頭或空表時應回傳 0...");
{
  const makeSsWithLastRow = function (lastRow) {
    return {
      getSheetByName: function () {
        return {
          getLastRow: function () {
            return lastRow;
          }
        };
      }
    };
  };
  assert.deepStrictEqual(transformer.getCourseIndexStats(makeSsWithLastRow(1)), { ok: true, total: 0 });
  assert.deepStrictEqual(transformer.getCourseIndexStats(makeSsWithLastRow(0)), { ok: true, total: 0 });
  assert.deepStrictEqual(transformer.getCourseIndexStats(makeSsWithLastRow("12")), { ok: true, total: 11 });
  console.log("   ✓ 空表與字串列號驗證通過！\n");
}

console.log("3. 缺少 getLastRow 時應降級為資料列數...");
{
  const values = [transformer.NORMALIZED_COURSE_HEADERS, ["114"], ["114"]];
  const ss = {
    getSheetByName: function () {
      return {
        getDataRange: function () {
          return {
            getValues: function () {
              return values;
            }
          };
        }
      };
    }
  };
  assert.deepStrictEqual(transformer.getCourseIndexStats(ss), { ok: true, total: 2 });
  console.log("   ✓ 降級路徑驗證通過！\n");

  const headerOnlySs = {
    getSheetByName: function () {
      return {
        getDataRange: function () {
          return {
            getValues: function () {
              return [transformer.NORMALIZED_COURSE_HEADERS];
            }
          };
        }
      };
    }
  };
  assert.deepStrictEqual(transformer.getCourseIndexStats(headerOnlySs), { ok: true, total: 0 });
  console.log("   ✓ 只有表頭的降級路徑驗證通過！\n");
}

console.log("4. 沒有試算表或工作表時應回傳 0...");
{
  assert.deepStrictEqual(transformer.getCourseIndexStats(null), { ok: true, total: 0 });
  assert.deepStrictEqual(
    transformer.getCourseIndexStats({
      getSheetByName: function () {
        return null;
      }
    }),
    {
      ok: true,
      total: 0
    }
  );
  console.log("   ✓ 缺表驗證通過！\n");
}

console.log("✓ getCourseIndexStats 測試全數通過！\n");
