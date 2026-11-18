"use strict";

/**
 * 品質設定與基準檔測試（G1.2）
 * 驗證品質量測設定可被腳本讀取，且 2026-11-18 基準資訊可追溯。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const qualityConfig = require("../scripts/qualityConfig.js");

console.log("開始執行品質設定與基準檔測試...\n");

console.log("1. 驗證納管範圍與排除規則...");
{
  assert(qualityConfig.SCOPE, "應匯出 SCOPE");
  assert.deepStrictEqual(
    qualityConfig.SCOPE.include,
    ["*.js", "webapp/js/*.js", "scripts/*.js"],
    "納管範圍 include 應符合全量候選"
  );
  assert(
    qualityConfig.SCOPE.exclude.includes("tests/**") &&
      qualityConfig.SCOPE.exclude.includes("coverage/**") &&
      qualityConfig.SCOPE.exclude.includes("node_modules/**"),
    "排除規則應包含 tests/coverage/node_modules"
  );
  console.log("   ✓ 納管範圍與排除規則驗證通過！\n");
}

console.log("2. 驗證門檻與報告路徑設定...");
{
  const t = qualityConfig.THRESHOLDS;
  assert.strictEqual(t.global.lines, 30, "全域 Lines 初始門檻應為 30");
  assert.strictEqual(t.global.statements, 30, "全域 Statements 初始門檻應為 30");
  assert.strictEqual(t.global.functions, 60, "全域 Functions 初始門檻應為 60");
  assert.strictEqual(t.global.branches, 40, "全域 Branches 初始門檻應為 40");
  assert.strictEqual(t.changed.lines, 80, "變更覆蓋率 Lines 門檻應為 80");
  assert.strictEqual(t.changed.branches, 70, "變更覆蓋率 Branches 門檻應為 70");
  assert.strictEqual(t.crap, 30, "CRAP 門檻應為 30");
  assert.strictEqual(t.maintainability, 20, "MI 門檻應為 20");

  assert.strictEqual(qualityConfig.PATHS.coverageSummary, "coverage/coverage-summary.json");
  assert.strictEqual(qualityConfig.PATHS.coverageFinal, "coverage/coverage-final.json");
  assert.strictEqual(qualityConfig.PATHS.complexityReport, "reports/quality/complexity.json");
  assert.strictEqual(qualityConfig.PATHS.qualityBaseline, "scripts/quality-baseline.json");
  console.log("   ✓ 門檻與報告路徑設定驗證通過！\n");
}

console.log("3. 驗證 2026-11-18 基準線可讀取且可追溯...");
{
  assert.strictEqual(typeof qualityConfig.loadBaseline, "function", "應提供 loadBaseline");
  const baselinePath = path.join(__dirname, "..", qualityConfig.PATHS.qualityBaseline);
  assert(fs.existsSync(baselinePath), "基準線檔案應存在：" + baselinePath);

  const baseline = qualityConfig.loadBaseline();
  assert.strictEqual(baseline.measuredAt, "2026-11-18", "基準量測日期應為 2026-11-18");
  assert.strictEqual(baseline.scope.files, 20, "基準納管檔案數應為 20");
  assert.strictEqual(baseline.scope.methods, 247, "基準函式/方法數應為 247");

  assert.deepStrictEqual(baseline.coverage.totals.lines, { total: 5586, covered: 1529, pct: 27.37 });
  assert.deepStrictEqual(baseline.coverage.totals.statements, { total: 5586, covered: 1529, pct: 27.37 });
  assert.deepStrictEqual(baseline.coverage.totals.functions, { total: 85, covered: 50, pct: 58.82 });
  assert.deepStrictEqual(baseline.coverage.totals.branches, { total: 330, covered: 125, pct: 37.87 });

  assert.strictEqual(baseline.maintainability.miMin, 69.134);
  assert.strictEqual(baseline.maintainability.miMinFile, "webapp/js/config.js");
  assert.strictEqual(baseline.maintainability.miUnder20Count, 0);

  assert.strictEqual(baseline.crap.crapMax, 1482.0);
  assert.strictEqual(
    baseline.crap.crapMaxFunction,
    "subjectCodeTransformer.js::getNormalizedCourses"
  );
  assert.strictEqual(baseline.crap.crapOver30Count, 56);
  console.log("   ✓ 基準線資訊驗證通過！\n");
}

console.log("✓ 品質設定與基準檔測試全數通過！\n");
