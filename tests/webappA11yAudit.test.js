"use strict";

/**
 * 前端無障礙稽核測試（task 4.1）。
 * 以 jsdom + axe-core 驗證所有畫面夾具在淺色／深色主題下皆無 WCAG 2.1 AA 結構違規，
 * 並覆蓋稽核腳本的違規輸出與命令列入口。
 */

const assert = require("assert");
const harness = require("./helpers/a11yHarness.js");
const checkA11y = require("../scripts/checkA11y.js");

console.log("開始執行前端無障礙稽核測試...\n");

const fixtures = harness.collectFixtures();

/**
 * 以暫時替換 createFrontend 的方式產生一個必定違規的夾具。
 *
 * @returns {Object} 違規夾具
 */
function createViolatingFixture() {
  const original = harness.createFrontend;
  harness.createFrontend = function (dom) {
    const doc = dom.window.document;
    return {
      app: {
        render: function () {
          doc.getElementById("app").innerHTML = '<img src="x.png" />';
        }
      },
      MEA: { accounts: {} }
    };
  };
  return {
    restore: function () {
      harness.createFrontend = original;
    }
  };
}

async function run() {
  console.log("1. 夾具應涵蓋所有主要畫面與關鍵狀態，且淺色／深色各一份...");
  assert(fixtures.length >= 26, "應至少涵蓋既有畫面與操作日誌夾具 × 2 種主題");
  ["light", "dark"].forEach(function (theme) {
    assert(
      fixtures.some(function (fixture) {
        return fixture.theme === theme;
      }),
      "應包含 " + theme + " 主題夾具"
    );
  });
  [
    "login",
    "login-error",
    "loading",
    "overview",
    "import",
    "courses",
    "settings",
    "forbidden",
    "modal",
    "activity-log",
    "activity-log-expanded",
    "activity-log-empty",
    "activity-log-guard"
  ].forEach(function (name) {
    assert(
      fixtures.some(function (fixture) {
        return fixture.name === name;
      }),
      "應包含 " + name + " 夾具"
    );
  });
  console.log("   ✓ 共 " + fixtures.length + " 個夾具驗證通過！\n");

  console.log("1.1 操作日誌夾具渲染後應含日誌表格標頭（非空字串）...");
  const auditDom = harness.createA11yDocument("light");
  const logFixture = fixtures.find(function (fixture) {
    return fixture.name === "activity-log" && fixture.theme === "light";
  });
  assert(logFixture, "應存在操作日誌淺色夾具");
  const logDoc = checkA11y.renderFixture(logFixture, auditDom);
  const logHtml = logDoc.getElementById("app").innerHTML;
  assert(logHtml.indexOf('<th scope="col">時間</th>') !== -1, "應渲染日誌表格標頭");
  assert(logHtml.indexOf("操作日誌") !== -1, "應渲染操作日誌標題");
  console.log("   ✓ 操作日誌夾具渲染內容驗證通過！\n");

  console.log("2. 明確停用 color-contrast（由 CSS 對比檢查互補）...");
  assert.strictEqual(checkA11y.RULES["color-contrast"].enabled, false);
  console.log("   ✓ color-contrast 停用設定驗證通過！\n");

  console.log("3. 所有夾具在淺色／深色主題下皆無 axe 違規...");
  const failures = await checkA11y.runAudit(fixtures);
  assert.deepStrictEqual(failures, [], "所有夾具皆不應有無障礙違規");
  console.log("   ✓ " + fixtures.length + " 個夾具皆通過 WCAG 2.1 AA 稽核！\n");

  console.log("4. 違規時應輸出規則、嚴重度與節點...");
  const violating = createViolatingFixture();
  try {
    const badFailures = await checkA11y.runAudit([{ name: "bad", theme: "light", state: {} }]);
    assert(badFailures.length > 0, "缺少 alt 的圖片應產生違規");
    assert(badFailures[0].fixture === "bad");
    assert(badFailures[0].theme === "light");
    assert(badFailures[0].rule === "image-alt");
    assert(typeof badFailures[0].impact === "string" && badFailures[0].impact.length > 0);
    assert(badFailures[0].nodes.length > 0);
  } finally {
    violating.restore();
  }
  console.log("   ✓ 違規明細驗證通過！\n");

  console.log("5. 命令列入口應正確回報成功與失敗...");
  const originalCollect = harness.collectFixtures;
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  const errors = [];
  console.log = function (message) {
    logs.push(message);
  };
  console.error = function (message) {
    errors.push(message);
  };
  try {
    harness.collectFixtures = function () {
      return [];
    };
    assert.strictEqual(await checkA11y.main(), 0, "無違規時應回傳 0");
    assert(
      logs.some(function (line) {
        return line.indexOf("checkA11y") !== -1;
      })
    );

    const violatingAgain = createViolatingFixture();
    harness.collectFixtures = function () {
      return [{ name: "bad", theme: "dark", state: {} }];
    };
    assert.strictEqual(await checkA11y.main(), 1, "有違規時應回傳 1");
    assert(
      errors.some(function (line) {
        return line.indexOf("image-alt") !== -1;
      })
    );
    violatingAgain.restore();
  } finally {
    harness.collectFixtures = originalCollect;
    console.log = originalLog;
    console.error = originalError;
  }
  console.log("   ✓ 命令列入口驗證通過！\n");

  console.log("✓ 前端無障礙稽核測試全數通過！\n");
}

run().catch(function (error) {
  console.error("✗ 無障礙稽核失敗：" + error.message);
  process.exitCode = 1;
});
