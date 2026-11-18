"use strict";

/**
 * @fileoverview 自動探索並依序執行 `tests/**\/*.test.js` 的測試執行器。
 *
 * 以獨立子行程執行每個測試檔，避免前端 window 模擬與後端全域命名空間互相污染；
 * 後續新增的測試會自動納入 `npm test`。
 */

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const PROJECT_ROOT = path.join(__dirname, "..");
const TESTS_DIR = path.join(PROJECT_ROOT, "tests");
const TEST_SUFFIX = ".test.js";
const EXCLUDED_DIRECTORIES = ["helpers"];

/**
 * 遞迴探索測試檔。
 *
 * @param {string} [directory] - 起始目錄，預設為 `tests/`
 * @returns {Array<string>} 排序後的測試檔絕對路徑
 */
function discoverTestFiles(directory) {
  const root = directory || TESTS_DIR;
  if (!fs.existsSync(root)) {
    return [];
  }

  const files = [];
  fs.readdirSync(root, { withFileTypes: true }).forEach(function (entry) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRECTORIES.indexOf(entry.name) === -1) {
        files.push.apply(files, discoverTestFiles(fullPath));
      }
      return;
    }
    if (entry.isFile() && entry.name.endsWith(TEST_SUFFIX)) {
      files.push(fullPath);
    }
  });

  return files.sort();
}

/**
 * 依序以子行程執行測試檔，遇第一個失敗即中止。
 *
 * @param {Array<string>} files - 測試檔路徑
 * @param {Object} [options] - 測試選項
 * @param {Function} [options.spawnSync] - 子行程執行器（供測試注入）
 * @param {Function} [options.log] - 輸出函式（供測試注入）
 * @returns {number} 成功為 0，失敗為子行程結束碼
 */
function runTests(files, options) {
  const settings = options || {};
  const spawnSync = settings.spawnSync || childProcess.spawnSync;
  const log = settings.log || console.log;
  const list = Array.isArray(files) ? files : discoverTestFiles();

  for (let i = 0; i < list.length; i++) {
    const file = list[i];
    log("\n▶ " + path.relative(PROJECT_ROOT, file));
    const result = spawnSync(process.execPath, [file], {
      cwd: PROJECT_ROOT,
      stdio: "inherit"
    });
    if (!result || result.status !== 0) {
      const status = result && typeof result.status === "number" ? result.status : 1;
      log("✗ 測試失敗：" + path.relative(PROJECT_ROOT, file));
      return status === 0 ? 1 : status;
    }
  }

  log("\n✓ 全部 " + list.length + " 個測試檔均通過！");
  return 0;
}

/**
 * 命令列入口，支援 `--list` 僅列出測試檔。
 *
 * @param {Array<string>} [argv] - 命令列參數
 * @returns {number} 結束碼
 */
function main(argv) {
  const args = Array.isArray(argv) ? argv : process.argv.slice(2);
  const files = discoverTestFiles();
  if (args.indexOf("--list") !== -1) {
    files.forEach(function (file) {
      console.log(path.relative(PROJECT_ROOT, file));
    });
    return 0;
  }
  return runTests(files);
}

if (require.main === module) {
  process.exitCode = main();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PROJECT_ROOT: PROJECT_ROOT,
    TESTS_DIR: TESTS_DIR,
    discoverTestFiles: discoverTestFiles,
    runTests: runTests,
    main: main
  };
}
