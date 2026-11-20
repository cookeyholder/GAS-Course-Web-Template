"use strict";

/**
 * 方向性 ratchet 比較測試（task 8.3）
 * 驗證覆蓋率與 MI 採「越高越佳」、CRAP 最高值與超標數採「越低越佳」，
 * 且 checkCoverage.js 與 checkComplexity.js 皆讀取同一份基準線比較邏輯。
 */

const assert = require("assert");

const qualityConfig = require("../scripts/qualityConfig.js");
const checkCoverage = require("../scripts/checkCoverage.js");
const checkComplexity = require("../scripts/checkComplexity.js");

console.log("開始執行方向性 ratchet 比較測試...\n");

/**
 * 建立單一方法的分析結果，方便控制 CRAP 與 MI。
 *
 * @param {string} file - 檔案名稱
 * @param {number} maintainability - MI 值
 * @param {Array<Object>} methods - 方法陣列
 * @returns {Object} 分析結果
 */
function makeAnalysis(file, maintainability, methods) {
  return {
    file: file,
    absolutePath: "/abs/" + file,
    maintainability: maintainability,
    methods: methods
  };
}

/**
 * 建立全數未覆蓋的 coverage map（CRAP = comp^2 + comp）。
 *
 * @param {Array<Object>} methods - 方法陣列
 * @returns {Object} coverage map
 */
function makeUncoveredCoverage(methods) {
  const statementMap = {};
  const s = {};
  methods.forEach(function (method, index) {
    statementMap[index] = { start: { line: method.lineStart }, end: { line: method.lineEnd } };
    s[index] = 0;
  });
  return { statementMap: statementMap, s: s, fnMap: {}, f: {} };
}

function run() {
  console.log("1. 驗證覆蓋率採越高越佳的方向...");
  {
    const regressed = qualityConfig.compareWithBaseline({
      actual: { lines: 90 },
      baseline: { lines: 95 }
    });
    assert.strictEqual(regressed.ok, false, "覆蓋率低於基準應視為回退");
    assert.strictEqual(regressed.regressions[0].metric, "lines");
    assert.strictEqual(regressed.regressions[0].direction, "higher-is-better");

    const improved = qualityConfig.compareWithBaseline({
      actual: { lines: 96 },
      baseline: { lines: 95 }
    });
    assert.strictEqual(improved.ok, true, "覆蓋率高於基準不應視為回退");
    console.log("   ✓ 覆蓋率方向驗證通過！\n");
  }

  console.log("2. 驗證 CRAP 最高值與超標數採越低越佳的方向...");
  {
    const regressed = qualityConfig.compareWithBaseline({
      actual: { crapMax: 32, crapOver30Count: 1 },
      baseline: { crapMax: 30, crapOver30Count: 0 }
    });
    assert.strictEqual(regressed.ok, false, "CRAP 惡化應視為回退");
    assert.strictEqual(regressed.regressions.length, 2);
    assert.strictEqual(regressed.regressions[0].direction, "lower-is-better");

    const improved = qualityConfig.compareWithBaseline({
      actual: { crapMax: 28, crapOver30Count: 0 },
      baseline: { crapMax: 30, crapOver30Count: 2 }
    });
    assert.strictEqual(improved.ok, true, "CRAP 改善不應視為回退");
    console.log("   ✓ CRAP 方向驗證通過！\n");
  }

  console.log("3. 驗證缺少指標與自訂方向對照...");
  {
    const empty = qualityConfig.compareWithBaseline();
    assert.strictEqual(empty.ok, true, "無可比對指標時不應視為回退");

    const partial = qualityConfig.compareWithBaseline({
      actual: { lines: 90, miMin: 80 },
      baseline: { lines: 95 }
    });
    assert.strictEqual(partial.regressions.length, 1, "缺少基準的指標應略過");

    // 以「實際值高於基準」搭配 lower-is-better 才能證明自訂方向真正被採用。
    const custom = qualityConfig.compareWithBaseline({
      actual: { customMetric: 15 },
      baseline: { customMetric: 10 },
      directions: { customMetric: "lower-is-better" }
    });
    assert.strictEqual(custom.ok, false, "自訂 lower-is-better 方向應標記回退");
    assert.strictEqual(custom.regressions[0].direction, "lower-is-better");

    const withoutDirections = qualityConfig.compareWithBaseline({
      actual: { customMetric: 15 },
      baseline: { customMetric: 10 }
    });
    assert.strictEqual(withoutDirections.ok, true, "未知指標鍵應略過");
    console.log("   ✓ 缺少指標與自訂方向驗證通過！\n");
  }

  console.log("4. 驗證 checkCoverage.js 回傳結構化 ratchet 比較結果...");
  {
    const summary = {
      total: {
        lines: { pct: 94.0 },
        statements: { pct: 96.0 },
        functions: { pct: 94.0 },
        branches: { pct: 85.0 }
      }
    };
    const baseline = {
      coverage: {
        totals: {
          lines: { pct: 95.0 },
          statements: { pct: 96.0 },
          functions: { pct: 92.0 },
          branches: { pct: 83.0 }
        }
      }
    };
    const thresholds = { lines: 30, statements: 30, functions: 60, branches: 40 };
    const result = checkCoverage.evaluateCoverageThresholds({
      summary: summary,
      baseline: baseline,
      thresholds: thresholds
    });
    assert.strictEqual(result.ok, false, "覆蓋率回退時整體檢查應失敗");
    assert.strictEqual(result.ratchet.ok, false, "ratchet 比較應標記回退");
    assert.strictEqual(result.ratchet.regressions[0].metric, "lines");
    assert.strictEqual(result.failures[0].direction, "higher-is-better");

    const improved = checkCoverage.evaluateCoverageThresholds({
      summary: {
        total: {
          lines: { pct: 96.0 },
          statements: { pct: 96.0 },
          functions: { pct: 94.0 },
          branches: { pct: 85.0 }
        }
      },
      baseline: baseline,
      thresholds: thresholds
    });
    assert.strictEqual(improved.ok, true, "全面提升時整體檢查應成功");
    assert.strictEqual(improved.ratchet.ok, true);
    console.log("   ✓ checkCoverage ratchet 結構驗證通過！\n");
  }

  console.log("5. 驗證 checkComplexity.js 套用 CRAP 與 MI 的方向性 ratchet...");
  {
    const methods = [{ name: "work", cyclomatic: 3, lineStart: 1, lineEnd: 5 }];
    const report = checkComplexity.evaluateComplexity({
      analyses: [makeAnalysis("a.js", 70, methods)],
      coverageByFile: { "a.js": makeUncoveredCoverage(methods) },
      thresholds: { crap: 30, maintainability: 20 },
      baseline: {
        crap: { crapMax: 10, crapOver30Count: 0 },
        maintainability: { miMin: 80 }
      }
    });
    assert.strictEqual(report.ok, false, "CRAP 與 MI 皆回退時應失敗");
    const ratchetViolations = report.violations.filter(function (v) {
      return v.type === "ratchet";
    });
    assert.strictEqual(ratchetViolations.length, 2, "應列出兩項 ratchet 回退");
    assert.strictEqual(report.summary.ratchetOk, false);
    assert.strictEqual(report.summary.ratchetRegressionCount, 2);

    const improved = checkComplexity.evaluateComplexity({
      analyses: [makeAnalysis("a.js", 85, methods)],
      coverageByFile: { "a.js": makeUncoveredCoverage(methods) },
      thresholds: { crap: 30, maintainability: 20 },
      baseline: {
        crap: { crapMax: 20, crapOver30Count: 0 },
        maintainability: { miMin: 80 }
      }
    });
    assert.strictEqual(improved.ok, true, "CRAP 未超基準且 MI 提升時應成功");
    assert.strictEqual(improved.ratchet.ok, true);
    console.log("   ✓ checkComplexity ratchet 驗證通過！\n");
  }

  console.log("6. 驗證 runComplexityCheck 讀取基準線且失敗時回報...");
  {
    const writes = [];
    const methods = [{ name: "work", cyclomatic: 6, lineStart: 1, lineEnd: 5 }];
    const code = checkComplexity.runComplexityCheck({
      readCoverage: function () {
        return { "/abs/a.js": makeUncoveredCoverage(methods) };
      },
      collectAnalyses: function () {
        return [makeAnalysis("a.js", 85, methods)];
      },
      loadBaseline: function () {
        return {
          measuredAt: "2026-11-20",
          crap: { crapMax: 10, crapOver30Count: 0 },
          maintainability: { miMin: 80 }
        };
      },
      writeReport: function (reportPath, content) {
        writes.push({ reportPath: reportPath, content: content });
      },
      log: function () {}
    });
    assert.strictEqual(code, 1, "CRAP 超標且 ratchet 回退時應回傳失敗");
    const parsed = JSON.parse(writes[0].content);
    assert.strictEqual(parsed.baseline.measuredAt, "2026-11-20", "報告應記錄基準量測時間");
    assert.strictEqual(parsed.ratchet.ok, false);

    const failedLoad = checkComplexity.runComplexityCheck({
      readCoverage: function () {
        return {};
      },
      loadBaseline: function () {
        throw new Error("基準檔不存在");
      },
      log: function () {},
      writeReport: function () {}
    });
    assert.strictEqual(failedLoad, 1, "基準線讀取失敗時應回傳失敗");
    console.log("   ✓ 基準線讀取與失敗處理驗證通過！\n");
  }

  console.log("7. 驗證無效數值、等於基準與非法方向...");
  {
    const invalid = qualityConfig.compareWithBaseline({
      actual: { lines: NaN, statements: Infinity, functions: "90", branches: null },
      baseline: { lines: 95, statements: 96, functions: 92, branches: 84 }
    });
    assert.strictEqual(invalid.ok, true, "非有限數值應略過，不得因 typeof 為 number 而誤判");
    assert.strictEqual(invalid.regressions.length, 0);

    const negativeInfinity = qualityConfig.compareWithBaseline({
      actual: { crapMax: -Infinity },
      baseline: { crapMax: 30 }
    });
    assert.strictEqual(negativeInfinity.ok, true, "-Infinity 應略過");

    const metrics = Object.keys(qualityConfig.RATCHET_DIRECTIONS);
    const makeValues = function (value) {
      const result = {};
      metrics.forEach(function (metric) {
        result[metric] = value;
      });
      return result;
    };
    const equal = qualityConfig.compareWithBaseline({ actual: makeValues(50), baseline: makeValues(50) });
    assert.strictEqual(equal.ok, true, "等於基準時不應視為回退");
    assert.strictEqual(equal.regressions.length, 0);

    const badDirection = qualityConfig.compareWithBaseline({
      actual: { lines: 90 },
      baseline: { lines: 95 },
      directions: { lines: "sideways" }
    });
    assert.strictEqual(badDirection.ok, true, "非法方向應略過，不得誤用 higher-is-better 比較");
    assert.strictEqual(badDirection.regressions.length, 0);
    console.log("   ✓ 無效數值與邊界驗證通過！\n");
  }

  console.log("8. 驗證基準線必要欄位檢查...");
  {
    const valid = {
      coverage: {
        totals: {
          lines: { pct: 96 },
          statements: { pct: 96 },
          functions: { pct: 94 },
          branches: { pct: 85 }
        }
      },
      crap: { crapMax: 30, crapOver30Count: 0 },
      maintainability: { miMin: 83.666 }
    };
    assert.strictEqual(qualityConfig.validateBaseline(valid), valid, "完整基準應通過驗證");
    assert.strictEqual(qualityConfig.REQUIRED_BASELINE_PATHS.length, 7, "應檢查七個 ratchet 必要數值");

    assert.throws(
      function () {
        qualityConfig.validateBaseline({});
      },
      /coverage\.totals\.lines\.pct/,
      "缺少整個區塊時應丟出錯誤"
    );

    const missing = JSON.parse(JSON.stringify(valid));
    delete missing.crap.crapMax;
    assert.throws(
      function () {
        qualityConfig.validateBaseline(missing);
      },
      /crap\.crapMax/,
      "缺少 CRAP 欄位應丟出錯誤，避免 ratchet 被靜默關閉"
    );

    const notFinite = JSON.parse(JSON.stringify(valid));
    notFinite.maintainability.miMin = NaN;
    assert.throws(
      function () {
        qualityConfig.validateBaseline(notFinite);
      },
      /miMin/,
      "非有限數值應丟出錯誤"
    );
    console.log("   ✓ 基準線必要欄位檢查通過！\n");
  }

  console.log("✓ 方向性 ratchet 比較測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
