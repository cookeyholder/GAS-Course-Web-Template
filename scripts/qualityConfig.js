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
 * 讀取基準線快照。
 *
 * @returns {Object} 基準線資料
 */
function loadBaseline() {
  const baselinePath = path.join(PROJECT_ROOT, PATHS.qualityBaseline);
  return JSON.parse(fs.readFileSync(baselinePath, "utf8"));
}

module.exports = {
  PROJECT_ROOT: PROJECT_ROOT,
  SCOPE: SCOPE,
  PATHS: PATHS,
  THRESHOLDS: THRESHOLDS,
  loadBaseline: loadBaseline
};
