const test = require("node:test");
const assert = require("node:assert/strict");

const { sanitizeFormulaValue, sanitizeRowMatrix } = require("../utilities.js");

test("sanitizeFormulaValue - 公式注入防衛正則純函式驗證", async (t) => {
  await t.test("非字串與空值保持原樣", () => {
    assert.strictEqual(sanitizeFormulaValue(null), null);
    assert.strictEqual(sanitizeFormulaValue(undefined), undefined);
    assert.strictEqual(sanitizeFormulaValue(123), 123);
    assert.strictEqual(sanitizeFormulaValue(true), true);
    assert.strictEqual(sanitizeFormulaValue(""), "");
  });

  await t.test("普通文字不受影響", () => {
    assert.strictEqual(sanitizeFormulaValue("國語文"), "國語文");
    assert.strictEqual(sanitizeFormulaValue("Math 101"), "Math 101");
    assert.strictEqual(sanitizeFormulaValue("112學年度"), "112學年度");
  });

  await t.test("公式開頭符號自動加上單引號跳脫", () => {
    assert.strictEqual(sanitizeFormulaValue("=SUM(A1:A10)"), "'=SUM(A1:A10)");
    assert.strictEqual(sanitizeFormulaValue("+12345"), "'+12345");
    assert.strictEqual(sanitizeFormulaValue("-54321"), "'-54321");
    assert.strictEqual(sanitizeFormulaValue("@cmd"), "'@cmd");
    assert.strictEqual(sanitizeFormulaValue("\tTabIndent"), "'\tTabIndent");
    assert.strictEqual(sanitizeFormulaValue("\rReturn"), "'\rReturn");
  });

  await t.test("二維陣列批次跳脫 sanitizeRowMatrix", () => {
    const rawMatrix = [
      ["國語文", "=cmd|' /C calc'!A0", 100],
      ["@admin", "普通科", "-10"]
    ];
    const safeMatrix = sanitizeRowMatrix(rawMatrix);
    assert.deepStrictEqual(safeMatrix, [
      ["國語文", "'=cmd|' /C calc'!A0", 100],
      ["'@admin", "普通科", "'-10"]
    ]);
    assert.strictEqual(safeMatrix[0][1], "'=cmd|' /C calc'!A0");
    assert.strictEqual(safeMatrix[1][0], "'@admin");
    assert.strictEqual(safeMatrix[1][2], "'-10");
  });
});
