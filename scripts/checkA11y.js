"use strict";

/**
 * @file checkA11y.js
 * @description 以 jsdom 承載前端畫面夾具並執行 axe-core 無障礙稽核。
 *
 * jsdom 不計算設定樣式，故明確停用 color-contrast；該規則由
 * scripts/checkContrast.js 以 CSS 解析方式互補把關。
 */

const harness = require("../tests/helpers/a11yHarness.js");

const RULES = {
  "color-contrast": { enabled: false }
};

const RUN_OPTIONS = {
  runOnly: {
    type: "tag",
    values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]
  },
  rules: RULES
};

/**
 * 在既有 JSDOM 實例渲染單一夾具。
 *
 * @param {Object} fixture - 夾具定義
 * @param {Object} dom - 共用的 JSDOM 實例
 * @returns {Object} document 物件
 */
function renderFixture(fixture, dom) {
  const doc = harness.resetDocument(dom, fixture.theme);
  const context = harness.createFrontend(dom, fixture.state);
  context.app.render();
  if (fixture.setup === "addAccountPrompt" && typeof context.MEA.accounts.addAccountPrompt === "function") {
    context.MEA.accounts.addAccountPrompt();
  }
  return doc;
}

/**
 * 對所有夾具執行 axe 稽核。
 *
 * @param {Array<Object>} [fixtures] - 夾具清單，預設為全部
 * @returns {Promise<Array<Object>>} 違規清單
 */
async function runAudit(fixtures) {
  const list = Array.isArray(fixtures) ? fixtures : harness.collectFixtures();
  const dom = harness.createA11yDocument("light");
  const previousWindow = global.window;
  const previousDocument = global.document;
  global.window = dom.window;
  global.document = dom.window.document;
  const axe = require("axe-core");
  const failures = [];

  try {
    for (let i = 0; i < list.length; i++) {
      const fixture = list[i];
      const document = renderFixture(fixture, dom);
      const results = await axe.run(document, RUN_OPTIONS);
      results.violations.forEach(function (violation) {
        failures.push({
          fixture: fixture.name,
          theme: fixture.theme,
          rule: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map(function (node) {
            return node.target.join(" ");
          })
        });
      });
    }
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
    dom.window.close();
  }

  return failures;
}

/**
 * 命令列入口：輸出違規明細並設定結束碼。
 *
 * @returns {number} 結束碼
 */
async function main() {
  const failures = await runAudit();
  if (failures.length === 0) {
    console.log("[checkA11y] 所有畫面與狀態皆通過 WCAG 2.1 AA 結構稽核（color-contrast 由 check:contrast 把關）。");
    return 0;
  }
  console.error("[checkA11y] 發現 " + failures.length + " 項無障礙違規：");
  failures.forEach(function (failure) {
    console.error(
      "  - " +
        failure.fixture +
        "/" +
        failure.theme +
        " [" +
        failure.impact +
        "] " +
        failure.rule +
        " → " +
        failure.nodes.join(", ")
    );
  });
  return 1;
}

if (require.main === module) {
  main()
    .then(function (code) {
      process.exitCode = code;
    })
    .catch(function (error) {
      console.error("[checkA11y] 稽核執行失敗：" + error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  RULES: RULES,
  RUN_OPTIONS: RUN_OPTIONS,
  renderFixture: renderFixture,
  runAudit: runAudit,
  main: main
};
