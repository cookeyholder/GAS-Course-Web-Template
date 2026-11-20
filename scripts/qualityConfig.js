"use strict";

/**
 * @file qualityConfig.js
 * @description 品質量測與門檻檢查共用設定：納管範圍、覆蓋率/CRAP/MI/變更覆蓋率門檻、
 *              基準線、報告路徑與排除規則。
 */

const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");

/**
 * 納管原始碼範圍（c8 與複雜度分析共用概念）。
 *
 * `scripts/captureGoldenLogSnapshot.js` 為重構驗證用的純手動擷取工具，
 * 由開發者以 CLI 明確執行、永不隨程式載入，故不納入單元測試覆蓋率分母。
 * 此排除亦與 task 1.3「重構前量測基線」的口徑一致：該基線建立於此工具
 * 腳本之前，其 94.8% 數值並未計入本檔（還原後 11741/(12500−115)=94.80%）。
 * 排除後可使現行量測與基準線 apples-to-apples 比較，而非放寬門檻。
 */
const SCOPE = {
  include: ["*.js", "webapp/js/*.js", "scripts/*.js"],
  exclude: [
    "tests/**",
    "node_modules/**",
    "coverage/**",
    "reports/**",
    ".nyc_output/**",
    "scripts/captureGoldenLogSnapshot.js"
  ],
  sourcePatterns: ["*.js", "webapp/js/*.js", "scripts/*.js"]
};

/** 報告與中介產物路徑（相對於專案根目錄） */
const PATHS = {
  coverageDir: "coverage",
  coverageSummary: "coverage/coverage-summary.json",
  coverageFinal: "coverage/coverage-final.json",
  lcov: "coverage/lcov.info",
  reportsDir: "reports",
  complexityReport: "reports/quality/complexity.json",
  qualityBaseline: "scripts/quality-baseline.json"
};

/**
 * 品質門檻。
 * - global：全域覆蓋率初始可執行門檻（同時不得低於基準線，採 ratchet 不回退）。
 * - changed：變更覆蓋率門檻（相對比較基準）。
 * - crap / maintainability：硬門檻。
 */
const THRESHOLDS = {
  global: {
    lines: 30,
    statements: 30,
    functions: 60,
    branches: 40
  },
  changed: {
    lines: 80,
    branches: 70
  },
  crap: 30,
  maintainability: 20
};

/**
 * 方向性 ratchet 的指標方向對照。
 * - higher-is-better：實際值不得低於基準值（覆蓋率四維度與 MI 最低值）。
 * - lower-is-better：實際值不得高於基準值（CRAP 最高值與超標數）。
 */
const RATCHET_DIRECTIONS = Object.freeze({
  lines: "higher-is-better",
  statements: "higher-is-better",
  functions: "higher-is-better",
  branches: "higher-is-better",
  miMin: "higher-is-better",
  crapMax: "lower-is-better",
  crapOver30Count: "lower-is-better"
});

/**
 * ratchet 比較所需的基準欄位路徑；缺任一欄位即視為基準無效。
 */
const REQUIRED_BASELINE_PATHS = Object.freeze([
  ["coverage", "totals", "lines", "pct"],
  ["coverage", "totals", "statements", "pct"],
  ["coverage", "totals", "functions", "pct"],
  ["coverage", "totals", "branches", "pct"],
  ["crap", "crapMax"],
  ["crap", "crapOver30Count"],
  ["maintainability", "miMin"]
]);

/**
 * 驗證基準線的必要欄位皆為有限數字，避免欄位被誤刪時 ratchet 被靜默關閉。
 *
 * @param {Object} baseline - 基準線資料
 * @returns {Object} 通過驗證的基準線資料
 * @throws {Error} 必要欄位缺失或非有限數字時
 */
function validateBaseline(baseline) {
  const source = baseline || {};
  REQUIRED_BASELINE_PATHS.forEach(function (parts) {
    let value = source;
    for (let i = 0; i < parts.length; i += 1) {
      value = value === null || value === undefined ? undefined : value[parts[i]];
    }
    if (!Number.isFinite(value)) {
      throw new Error("基準線缺少必要數值欄位：" + parts.join("."));
    }
  });
  return source;
}

/**
 * 讀取基準線快照並驗證必要欄位。
 *
 * @returns {Object} 基準線資料
 * @throws {Error} 檔案讀取失敗或必要欄位缺失時
 */
function loadBaseline() {
  const baselinePath = path.join(PROJECT_ROOT, PATHS.qualityBaseline);
  return validateBaseline(JSON.parse(fs.readFileSync(baselinePath, "utf8")));
}

/**
 * 以方向性 ratchet 比較實際量測值與基準值。
 * 僅比較雙方皆為有限數值且方向合法的指標；缺少或無效的指標視為無可比對，不視為回退。
 *
 * @param {Object} options - 比較選項
 * @param {Object} [options.actual] - 實際量測值（鍵為指標名稱）
 * @param {Object} [options.baseline] - 基準值（鍵為指標名稱）
 * @param {Object} [options.directions] - 方向對照，預設 RATCHET_DIRECTIONS
 * @returns {{ok: boolean, regressions: Array<{metric: string, actual: number, baseline: number, direction: string, reason: string}>}}
 */
function compareWithBaseline(options) {
  const settings = options || {};
  const actual = settings.actual || {};
  const baseline = settings.baseline || {};
  const directions = settings.directions || RATCHET_DIRECTIONS;
  const regressions = [];

  Object.keys(directions).forEach(function (metric) {
    const actualValue = actual[metric];
    const baselineValue = baseline[metric];
    if (!Number.isFinite(actualValue) || !Number.isFinite(baselineValue)) return;

    const direction = directions[metric];
    if (direction !== "higher-is-better" && direction !== "lower-is-better") return;

    const regressed = direction === "lower-is-better" ? actualValue > baselineValue : actualValue < baselineValue;
    if (regressed) {
      regressions.push({
        metric: metric,
        actual: actualValue,
        baseline: baselineValue,
        direction: direction,
        reason:
          direction === "lower-is-better" ? "高於基準值（方向性 ratchet 回退）" : "低於基準值（方向性 ratchet 回退）"
      });
    }
  });

  return {
    ok: regressions.length === 0,
    regressions: regressions
  };
}

module.exports = {
  PROJECT_ROOT: PROJECT_ROOT,
  SCOPE: SCOPE,
  PATHS: PATHS,
  THRESHOLDS: THRESHOLDS,
  RATCHET_DIRECTIONS: RATCHET_DIRECTIONS,
  REQUIRED_BASELINE_PATHS: REQUIRED_BASELINE_PATHS,
  validateBaseline: validateBaseline,
  loadBaseline: loadBaseline,
  compareWithBaseline: compareWithBaseline
};
