#!/usr/bin/env node
"use strict";

/**
 * @file checkCoverage.js
 * @description 以 c8 執行測試覆蓋率量測，並（於後續任務）進行門檻與基準線檢查。
 */

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const qualityConfig = require("./qualityConfig.js");

const PROJECT_ROOT = qualityConfig.PROJECT_ROOT || path.join(__dirname, "..");

/**
 * 解析本機 c8 CLI 路徑；若不存在則回傳 null。
 *
 * @returns {string|null} c8 CLI 路徑
 */
function resolveLocalC8() {
  try {
    return require.resolve("c8/bin/c8.js", { paths: [PROJECT_ROOT] });
  } catch (error) {
    return null;
  }
}

/**
 * 組裝 c8 量測參數。
 *
 * @param {Object} [options] - 選項
 * @param {boolean} [options.collectOnly] - 僅量測不檢查門檻
 * @returns {Array<string>} c8 參數
 */
function buildC8Args(options) {
  const settings = options || {};
  const args = ["--all"];

  (qualityConfig.SCOPE.include || []).forEach(function (pattern) {
    args.push("--include", pattern);
  });
  (qualityConfig.SCOPE.exclude || []).forEach(function (pattern) {
    args.push("--exclude", pattern);
  });

  ["text", "lcov", "json", "json-summary"].forEach(function (reporter) {
    args.push("--reporter=" + reporter);
  });

  args.push("--report-dir", qualityConfig.PATHS.coverageDir || "coverage");
  args.push(process.execPath, path.join("scripts", "run-tests.js"));
  return args;
}

/**
 * 執行覆蓋率量測與（非 collect-only 時）門檻檢查。
 *
 * @param {Object} [options] - 執行選項
 * @param {Array<string>} [options.argv] - 命令列參數
 * @param {Function} [options.spawnSync] - 子行程執行器
 * @param {Function} [options.checkThresholds] - 門檻檢查函式
 * @param {Function} [options.log] - 輸出函式
 * @returns {number} 結束碼
 */
function runCoverageCheck(options) {
  const settings = options || {};
  const argv = Array.isArray(settings.argv) ? settings.argv : process.argv.slice(2);
  const spawnSync = settings.spawnSync || childProcess.spawnSync;
  const log = settings.log || console.log;
  const collectOnly = argv.indexOf("--collect-only") !== -1;

  const c8Args = buildC8Args({ collectOnly: collectOnly });
  const localC8 = resolveLocalC8();
  let cmd;
  let cmdArgs;

  if (localC8) {
    cmd = process.execPath;
    cmdArgs = [localC8].concat(c8Args);
  } else {
    cmd = "c8";
    cmdArgs = c8Args;
  }

  log("[checkCoverage] 執行覆蓋率量測" + (collectOnly ? "（僅收集）" : "") + "...");
  const result = spawnSync(cmd, cmdArgs, {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: process.env
  });

  const status = result && typeof result.status === "number" ? result.status : 1;
  if (status !== 0) {
    return status;
  }

  if (collectOnly) {
    return 0;
  }

  const checkThresholds = settings.checkThresholds || defaultCheckThresholds;
  return checkThresholds({ log: log });
}

const METRICS = ["lines", "statements", "functions", "branches"];

/**
 * 依門檻與基準線評估覆蓋率摘要。
 *
 * @param {Object} options - 評估選項
 * @param {Object} options.summary - c8 coverage-summary 物件（含 total）
 * @param {Object} options.baseline - 基準線物件（含 coverage.totals）
 * @param {Object} options.thresholds - 門檻物件
 * @returns {{ok: boolean, failures: Array<{metric: string, actual: number, expected: number, reason: string}>}}
 */
function evaluateCoverageThresholds(options) {
  const settings = options || {};
  const summary = settings.summary || {};
  const total = summary.total || {};
  const baseline = settings.baseline || {};
  const baselineTotals = (baseline.coverage && baseline.coverage.totals) || {};
  const thresholds = settings.thresholds || {};
  const failures = [];

  METRICS.forEach(function (metric) {
    const actual = total[metric] && typeof total[metric].pct === "number" ? total[metric].pct : 0;
    const minThreshold = typeof thresholds[metric] === "number" ? thresholds[metric] : 0;
    const baselinePct =
      baselineTotals[metric] && typeof baselineTotals[metric].pct === "number"
        ? baselineTotals[metric].pct
        : 0;
    const required = Math.max(minThreshold, baselinePct);

    if (actual < required) {
      if (actual < minThreshold) {
        failures.push({
          metric: metric,
          actual: actual,
          expected: minThreshold,
          reason: "低於門檻"
        });
      } else {
        failures.push({
          metric: metric,
          actual: actual,
          expected: baselinePct,
          reason: "低於基準線（回退）"
        });
      }
    }
  });

  return {
    ok: failures.length === 0,
    failures: failures
  };
}

/**
 * 預設門檻檢查：讀取覆蓋率摘要與基準線並比對門檻/不回退政策。
 *
 * @param {Object} [options] - 執行選項
 * @param {Function} [options.log] - 輸出函式
 * @returns {number} 結束碼
 */
function defaultCheckThresholds(options) {
  const settings = options || {};
  const log = settings.log || console.log;
  const fsApi = settings.fs || fs;
  const pathApi = settings.path || path;
  const root = settings.projectRoot || PROJECT_ROOT;
  const configApi = settings.qualityConfig || qualityConfig;
  const summaryPath =
    settings.summaryPath || pathApi.join(root, configApi.PATHS.coverageSummary);

  if (!fsApi.existsSync(summaryPath)) {
    log("[checkCoverage] 找不到覆蓋率摘要檔：" + summaryPath);
    return 1;
  }

  let summary;
  try {
    summary = JSON.parse(fsApi.readFileSync(summaryPath, "utf8"));
  } catch (error) {
    log("[checkCoverage] 無法讀取覆蓋率摘要：" + error.message);
    return 1;
  }

  const baseline = configApi.loadBaseline();
  const thresholds = configApi.THRESHOLDS.global || {};
  const result = evaluateCoverageThresholds({
    summary: summary,
    baseline: baseline,
    thresholds: thresholds
  });

  if (!result.ok) {
    log("[checkCoverage] 覆蓋率檢查未通過：");
    result.failures.forEach(function (failure) {
      log(
        "  - " +
          failure.metric +
          "：" +
          failure.actual +
          "%（要求 >= " +
          failure.expected +
          "%，" +
          failure.reason +
          "）"
      );
    });
    return 1;
  }

  log("[checkCoverage] 覆蓋率檢查通過（符合門檻且未低於基準線）。");
  return 0;
}

/**
 * CLI 入口。
 *
 * @param {Array<string>} [argv] - 命令列參數
 * @returns {number} 結束碼
 */
function main(argv) {
  return runCoverageCheck({ argv: argv || process.argv.slice(2) });
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  PROJECT_ROOT: PROJECT_ROOT,
  resolveLocalC8: resolveLocalC8,
  buildC8Args: buildC8Args,
  runCoverageCheck: runCoverageCheck,
  evaluateCoverageThresholds: evaluateCoverageThresholds,
  defaultCheckThresholds: defaultCheckThresholds,
  main: main
};
