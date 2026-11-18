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

/**
 * 預設門檻檢查（G1.4 實作前暫為通過/骨架）。
 *
 * @returns {number} 結束碼
 */
function defaultCheckThresholds() {
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
  defaultCheckThresholds: defaultCheckThresholds,
  main: main
};
