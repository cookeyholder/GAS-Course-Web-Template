"use strict";

/**
 * 品質設定與基準檔測試（G1.2）
 * 驗證品質量測設定可被腳本讀取，2026-11-18 基準資訊可追溯，
 * 且 quality-core 純函式核心已納入覆蓋率與複雜度量測。
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
    ["*.js", "webapp/js/*.js", "scripts/*.js", "quality-core/*.js"],
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
  assert.strictEqual(t.global.lines, 60, "全域 Lines 初始門檻應為 60");
  assert.strictEqual(t.global.statements, 30, "全域 Statements 初始門檻應為 30");
  assert.strictEqual(t.global.functions, 60, "全域 Functions 初始門檻應為 60");
  assert.strictEqual(t.global.branches, 60, "全域 Branches 初始門檻應為 60");
  assert.strictEqual(t.changed.lines, 80, "變更覆蓋率 Lines 門檻應為 80");
  assert.strictEqual(t.changed.branches, 80, "變更覆蓋率 Branches 門檻應為 80");
  assert.strictEqual(t.crap, 25, "CRAP 門檻應為 25");
  assert.strictEqual(t.maintainability, 50, "MI 門檻應為 50");

  assert.strictEqual(qualityConfig.PATHS.coverageSummary, "coverage/coverage-summary.json");
  assert.strictEqual(qualityConfig.PATHS.coverageFinal, "coverage/coverage-final.json");
  assert.strictEqual(qualityConfig.PATHS.complexityReport, "reports/quality/complexity.json");
  assert.strictEqual(qualityConfig.PATHS.qualityBaseline, "scripts/quality-baseline.json");
  console.log("   ✓ 門檻與報告路徑設定驗證通過！\n");
}

console.log("3. 驗證新基準線可讀取且自我一致...");
{
  assert.strictEqual(typeof qualityConfig.loadBaseline, "function", "應提供 loadBaseline");
  const root = path.join(__dirname, "..");
  const baselinePath = path.join(root, qualityConfig.PATHS.qualityBaseline);
  assert(fs.existsSync(baselinePath), "基準線檔案應存在：" + baselinePath);

  const baseline = qualityConfig.loadBaseline();
  assert.strictEqual(baseline.measuredAt, "2026-11-20", "基準量測日期應為實際量測日");
  assert(baseline.environment && baseline.environment.node, "基準應記錄量測環境的 Node 版本");
  assert(baseline.scope.include && baseline.scope.exclude, "基準應記錄納管與排除範圍");
  assert(baseline.scope.files > 0 && baseline.scope.methods > 0, "基準應記錄納管檔案與函式數");
  assert(baseline.ratchet && baseline.ratchet.source, "基準應記錄方向性 ratchet 的既有值來源");

  ["lines", "statements", "functions", "branches"].forEach(function (metric) {
    const entry = baseline.coverage.totals[metric];
    assert(entry && typeof entry.pct === "number", metric + " 應記錄覆蓋率百分比");
    // c8 的 pct 採無條件捨去至小數兩位（非四捨五入）。
    const expectedPct = Math.floor((entry.covered / entry.total) * 10000) / 100;
    assert.strictEqual(entry.pct, expectedPct, metric + " 覆蓋率應與 covered/total 自洽");
  });

  assert(baseline.maintainability.miMinFile, "基準應記錄 MI 最低值所屬檔案");
  assert(baseline.crap.crapMaxFunction, "基準應記錄 CRAP 最高值所屬函式");
  assert.strictEqual(typeof baseline.crap.crapOver30Count, "number");

  // 新基準不得違反以 task 1.3 重構前既有值為來源的方向性 ratchet。
  const before = { lines: 94.8, statements: 94.8, functions: 92.15, branches: 83.79 };
  ["lines", "statements", "functions", "branches"].forEach(function (metric) {
    assert(baseline.coverage.totals[metric].pct >= before[metric], metric + " 新基準不得低於重構前既有值");
  });
  assert(baseline.maintainability.miMin >= 83.666, "MI 新基準不得低於重構前既有值");
  assert(baseline.crap.crapMax <= 30, "CRAP 最高值新基準不得高於重構前既有值");
  assert(baseline.crap.crapOver30Count <= 0, "CRAP 超標數新基準不得高於重構前既有值");
  console.log("   ✓ 新基準線自我一致性與方向性 ratchet 驗證通過！\n");
}

console.log("4. 驗證 2026-11-18 過期快照仍可供歷史比較...");
{
  const historyPath = path.join(__dirname, "..", "scripts/quality-baseline.2026-11-18.json");
  assert(fs.existsSync(historyPath), "過期快照歷史檔應存在：" + historyPath);
  const history = JSON.parse(fs.readFileSync(historyPath, "utf8"));
  assert.strictEqual(history.measuredAt, "2026-11-18");
  assert.strictEqual(history.scope.files, 20);
  assert.strictEqual(history.scope.methods, 247);
  assert.strictEqual(history.coverage.totals.lines.pct, 27.37);
  assert.strictEqual(history.crap.crapMax, 1482.0);
  assert.strictEqual(history.crap.crapOver30Count, 56);
  assert.strictEqual(history.maintainability.miMin, 69.134);
  console.log("   ✓ 過期快照歷史比較驗證通過！\n");
}

console.log("5. 驗證品質核心模組已納入覆蓋率與複雜度量測...\n");
{
  const baseline = qualityConfig.loadBaseline();
  const coreModules = [
    "openccStableId.js",
    "openccTextDiff.js",
    "openccCandidates.js",
    "openccProtectedTerms.js",
    "openccLanguageAnalysis.js",
    "openccContractDrift.js"
  ];

  assert.deepStrictEqual(baseline.scope.include, qualityConfig.SCOPE.include, "基準納管範圍應與設定一致");
  assert(baseline.scope.files >= 49, "基準納管檔案數應反映加入核心後的重新量測");
  assert(baseline.scope.methods >= 1104, "基準納管函式數應反映加入核心後的重新量測");

  const checkChangedCoverage = require("../scripts/checkChangedCoverage.js");
  coreModules.forEach(function (name) {
    assert(checkChangedCoverage.isInScope("quality-core/" + name), "覆蓋率量測範圍應含品質核心模組：" + name);
  });

  const checkComplexity = require("../scripts/checkComplexity.js");
  const sources = checkComplexity.collectSourceFiles();
  coreModules.forEach(function (name) {
    assert(sources.includes("quality-core/" + name), "複雜度來源應含品質核心模組：" + name);
  });
  const analyses = checkComplexity.collectAnalyses({
    sourceFiles: coreModules.map(function (name) {
      return "quality-core/" + name;
    })
  });
  assert.strictEqual(analyses.length, coreModules.length, "六個品質核心模組皆應通過複雜度分析");
  analyses.forEach(function (analysis) {
    assert(analysis.methods.length > 0, "品質核心模組應含可量測函式：" + analysis.file);
  });
  console.log("   ✓ 六個品質核心模組已出現在覆蓋率與複雜度量測驗證通過！\n");
}

console.log("✓ 品質設定與基準檔測試全數通過！\n");
