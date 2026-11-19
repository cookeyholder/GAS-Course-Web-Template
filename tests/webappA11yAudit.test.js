"use strict";

/**
 * 前端無障礙稽核測試（task 4.1）。
 * 以 jsdom + axe-core 驗證所有畫面夾具在淺色／深色主題下皆無 WCAG 2.1 AA 結構違規。
 */

const assert = require("assert");
const harness = require("./helpers/a11yHarness.js");
const checkA11y = require("../scripts/checkA11y.js");

console.log("開始執行前端無障礙稽核測試...\n");

const fixtures = harness.collectFixtures();

console.log("1. 夾具應涵蓋所有主要畫面與關鍵狀態，且淺色／深色各一份...");
assert(fixtures.length >= 18, "應至少有 9 種夾具 × 2 種主題");
["light", "dark"].forEach(function (theme) {
  assert(
    fixtures.some(function (fixture) {
      return fixture.theme === theme;
    }),
    "應包含 " + theme + " 主題夾具"
  );
});
["login", "login-error", "loading", "overview", "import", "courses", "settings", "forbidden", "modal"].forEach(
  function (name) {
    assert(
      fixtures.some(function (fixture) {
        return fixture.name === name;
      }),
      "應包含 " + name + " 夾具"
    );
  }
);
console.log("   ✓ 共 " + fixtures.length + " 個夾具驗證通過！\n");

console.log("2. 明確停用 color-contrast（由 CSS 對比檢查互補）...");
assert.strictEqual(checkA11y.RULES["color-contrast"].enabled, false);
console.log("   ✓ color-contrast 停用設定驗證通過！\n");

console.log("3. 所有夾具在淺色／深色主題下皆無 axe 違規...");
checkA11y
  .runAudit(fixtures)
  .then(function (failures) {
    assert.deepStrictEqual(failures, [], "所有夾具皆不應有無障礙違規");
    console.log("   ✓ " + fixtures.length + " 個夾具皆通過 WCAG 2.1 AA 稽核！\n");
    console.log("✓ 前端無障礙稽核測試全數通過！\n");
  })
  .catch(function (error) {
    console.error("✗ 無障礙稽核失敗：" + error.message);
    process.exitCode = 1;
  });
