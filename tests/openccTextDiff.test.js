"use strict";

/**
 * @file openccTextDiff.test.js
 * @description 文字差異比對純函式契約測試，驗證最小替換單元、UTF-16 座標
 *              與逾限退化路徑。所有簡體範例皆以 Unicode 跳脫表示。
 */

const assert = require("assert");
const textDiff = require("../quality-core/openccTextDiff.js");

const SIMPLIFIED_PROJECT = "\u9879\u76ee";
const TRADITIONAL_PROJECT = "\u9805\u76ee";
const SIMPLIFIED_ONLY = "\u4ec5";
const TRADITIONAL_ONLY = "\u50c5";

/**
 * 將替換區塊轉為易於比對的純陣列。
 *
 * @param {Array<Object>} hunks - 替換區塊
 * @returns {Array<Array>} 簡化陣列
 */
function simplify(hunks) {
  return hunks.map(function (hunk) {
    return [hunk.start, hunk.end, hunk.original, hunk.suggestion];
  });
}

console.log("開始執行文字差異比對契約測試...\n");

console.log("1. 相同輸入與共同前後綴...");
{
  assert.strictEqual(textDiff.MAX_LCS_CELLS, 200000);
  assert.deepStrictEqual(textDiff.diffTextUnits("same", "same"), []);
  assert.deepStrictEqual(textDiff.fallbackHunks("same", "same"), []);
  assert.strictEqual(textDiff.commonPrefixLength("abcxyz", "abcpqr"), 3);
  assert.strictEqual(textDiff.commonPrefixLength("abc", "xyz"), 0);
  assert.strictEqual(textDiff.commonSuffixLength("xyzabc", "pqrabc"), 3);
  assert.strictEqual(textDiff.commonSuffixLength("abc", "xyz"), 0);
  console.log("   ✓ 相同輸入與前後綴驗證通過！\n");
}

console.log("2. 多重替換回傳各自的最小區塊...");
{
  const original = "abcXYZdefUVWghi";
  const converted = "abc123def456ghi";
  const hunks = textDiff.diffTextUnits(original, converted);
  assert.deepStrictEqual(simplify(hunks), [
    [3, 6, "XYZ", "123"],
    [9, 12, "UVW", "456"]
  ]);

  const direct = textDiff.backtrackHunks(original, converted, textDiff.buildLcsTable(original, converted));
  assert.deepStrictEqual(simplify(direct), simplify(hunks));
  console.log("   ✓ 多重替換與直接回填驗證通過！\n");
}

console.log("3. 新增與刪除各自形成正確座標...");
{
  assert.deepStrictEqual(simplify(textDiff.diffTextUnits("abc", "aXbc")), [[1, 1, "", "X"]]);
  assert.deepStrictEqual(simplify(textDiff.diffTextUnits("aXbc", "abc")), [[1, 2, "X", ""]]);
  assert.deepStrictEqual(simplify(textDiff.diffTextUnits("", "abc")), [[0, 0, "", "abc"]]);
  assert.deepStrictEqual(simplify(textDiff.diffTextUnits("abc", "")), [[0, 3, "abc", ""]]);
  console.log("   ✓ 新增與刪除座標驗證通過！\n");
}

console.log("4. 座標以 UTF-16 程式碼單元計算...");
{
  const emoji = "\ud83d\ude00";
  const original = "a" + emoji + SIMPLIFIED_PROJECT + "z";
  const converted = "a" + emoji + TRADITIONAL_PROJECT + "z";
  assert.strictEqual(emoji.length, 2);
  assert.deepStrictEqual(simplify(textDiff.diffTextUnits(original, converted)), [
    [3, 4, SIMPLIFIED_PROJECT.charAt(0), TRADITIONAL_PROJECT.charAt(0)]
  ]);

  const surrogateOriginal = emoji + SIMPLIFIED_ONLY;
  const surrogateConverted = emoji + TRADITIONAL_ONLY;
  assert.deepStrictEqual(simplify(textDiff.diffTextUnits(surrogateOriginal, surrogateConverted)), [
    [2, 3, SIMPLIFIED_ONLY, TRADITIONAL_ONLY]
  ]);
  console.log("   ✓ UTF-16 座標驗證通過！\n");
}

console.log("5. 逾限時退化為前後綴單一區塊...");
{
  const prefix = "A".repeat(500);
  const middle = "M".repeat(20);
  const suffix = "B".repeat(500);
  const original = prefix + SIMPLIFIED_PROJECT + middle + SIMPLIFIED_ONLY + suffix;
  const converted = prefix + TRADITIONAL_PROJECT + middle + TRADITIONAL_ONLY + suffix;
  assert.ok((original.length + 1) * (converted.length + 1) > textDiff.MAX_LCS_CELLS);

  const hunks = textDiff.diffTextUnits(original, converted);
  assert.strictEqual(hunks.length, 1);
  assert.strictEqual(hunks[0].start, 500);
  assert.strictEqual(hunks[0].end, 500 + middle.length + 3);
  assert.strictEqual(hunks[0].original, SIMPLIFIED_PROJECT + middle + SIMPLIFIED_ONLY);
  assert.strictEqual(hunks[0].suggestion, TRADITIONAL_PROJECT + middle + TRADITIONAL_ONLY);
  assert.deepStrictEqual(simplify(textDiff.fallbackHunks("prefixXYZsuffix", "prefix123suffix")), [
    [6, 9, "XYZ", "123"]
  ]);
  console.log("   ✓ 逾限退化與前後綴區塊驗證通過！\n");
}

console.log("✓ 文字差異比對契約測試全數通過！\n");
