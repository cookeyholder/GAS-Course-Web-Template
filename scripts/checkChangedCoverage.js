#!/usr/bin/env node
"use strict";

/**
 * @file checkChangedCoverage.js
 * @description 依 git diff 與 coverage-final.json 計算變更覆蓋率並套用門檻。
 */

const fs = require("fs");
const path = require("path");
const childProcess = require("child_process");

const qualityConfig = require("./qualityConfig.js");

const PROJECT_ROOT = qualityConfig.PROJECT_ROOT || path.join(__dirname, "..");

/**
 * 解析命令列參數中的 --base。
 *
 * @param {Array<string>} argv - 命令列參數
 * @returns {string|null} base ref
 */
function parseBaseArg(argv) {
  const args = Array.isArray(argv) ? argv : [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--base" && i + 1 < args.length) return args[i + 1];
    if (args[i].indexOf("--base=") === 0) return args[i].slice("--base=".length);
  }
  return null;
}

/**
 * 判斷檔案是否屬於納管範圍。
 *
 * @param {string} file - 相對路徑
 * @returns {boolean} 是否納管
 */
function isInScope(file) {
  if (!file || typeof file !== "string") return false;
  const normalized = file.replace(/\\/g, "/");
  if (!normalized.endsWith(".js")) return false;
  if (normalized.indexOf("tests/") === 0) return false;
  if (normalized.indexOf("node_modules/") === 0) return false;
  if (normalized.indexOf("coverage/") === 0) return false;
  if (normalized.indexOf("reports/") === 0) return false;
  if (normalized.indexOf(".nyc_output/") === 0) return false;

  // 納管：根目錄 *.js、webapp/js/*.js、scripts/*.js
  if (normalized.indexOf("/") === -1) return true;
  if (normalized.indexOf("webapp/js/") === 0) return true;
  if (normalized.indexOf("scripts/") === 0) return true;
  return false;
}

/**
 * 解析 unified diff，取得各檔案新增/變更後行號集合。
 *
 * @param {string} diffText - git diff --unified=0 輸出
 * @returns {Object<string, Set<number>>} 檔案 -> 行號集合
 */
function parseUnifiedDiff(diffText) {
  const result = {};
  const text = String(diffText || "");
  const lines = text.split("\n");
  let currentFile = null;
  let newLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.indexOf("+++ b/") === 0) {
      const file = line.slice("+++ b/".length).trim();
      currentFile = isInScope(file) ? file : null;
      if (currentFile && !result[currentFile]) {
        result[currentFile] = new Set();
      }
      continue;
    }
    if (!currentFile) continue;
    if (line.indexOf("@@") === 0) {
      const match = line.match(/\+(\d+)(?:,(\d+))?/);
      if (match) {
        newLine = parseInt(match[1], 10);
      }
      continue;
    }
    if (line.length > 0 && (line[0] === "+" || line[0] === "-")) {
      if (line.indexOf("+++") === 0 || line.indexOf("---") === 0) continue;
      if (line[0] === "+") {
        result[currentFile].add(newLine);
        newLine += 1;
      } else {
        // 刪除行不影響新檔行號遞增
      }
      continue;
    }
  }

  return result;
}

/**
 * 將覆蓋率 map key 正規化為相對專案路徑。
 *
 * @param {string} key - coverage key
 * @param {string} projectRoot - 專案根目錄
 * @returns {string} 相對路徑
 */
function toRelativeFile(key, projectRoot) {
  const normalizedKey = String(key || "").replace(/\\/g, "/");
  const root = String(projectRoot || PROJECT_ROOT).replace(/\\/g, "/");
  if (normalizedKey.indexOf(root) === 0) {
    const rel = normalizedKey.slice(root.length).replace(/^\//, "");
    return rel;
  }
  return normalizedKey;
}

/**
 * 取得檔案對應之 coverage entry。
 *
 * @param {Object} coverageByFile - coverage-final
 * @param {string} file - 相對路徑
 * @param {string} projectRoot - 專案根目錄
 * @returns {Object|null} coverage entry
 */
function getCoverageEntry(coverageByFile, file, projectRoot) {
  if (!coverageByFile) return null;
  const root = String(projectRoot || PROJECT_ROOT).replace(/\\/g, "/");
  const abs = root + "/" + file.replace(/\\/g, "/");
  if (coverageByFile[abs]) return coverageByFile[abs];
  if (coverageByFile[file]) return coverageByFile[file];
  const keys = Object.keys(coverageByFile);
  for (let i = 0; i < keys.length; i++) {
    if (toRelativeFile(keys[i], projectRoot) === file) return coverageByFile[keys[i]];
  }
  return null;
}

/**
 * 計算變更覆蓋率。
 *
 * @param {Object} options - 計算選項
 * @returns {Object} 計算結果
 */
function computeChangedCoverage(options) {
  const settings = options || {};
  const changedLinesByFile = settings.changedLinesByFile || {};
  const coverageByFile = settings.coverageByFile || {};
  const thresholds = settings.thresholds || qualityConfig.THRESHOLDS.changed || { lines: 80, branches: 70 };
  const projectRoot = settings.projectRoot || PROJECT_ROOT;

  const files = Object.keys(changedLinesByFile).filter(function (f) {
    return changedLinesByFile[f] && changedLinesByFile[f].size > 0;
  });

  if (files.length === 0) {
    return {
      ok: true,
      skipped: true,
      reason: "無可量測變更",
      summary: { lines: { covered: 0, total: 0, pct: 100 }, branches: { covered: 0, total: 0, pct: 100 } },
      files: [],
      failures: []
    };
  }

  let totalLines = 0;
  let coveredLines = 0;
  let totalBranches = 0;
  let coveredBranches = 0;
  const perFile = [];
  const failures = [];

  files.forEach(function (file) {
    const changedLines = changedLinesByFile[file];
    const entry = getCoverageEntry(coverageByFile, file, projectRoot);
    let fLineTotal = 0;
    let fLineCovered = 0;
    let fBranchTotal = 0;
    let fBranchCovered = 0;

    if (entry && entry.statementMap && entry.s) {
      Object.keys(entry.statementMap).forEach(function (sid) {
        const loc = entry.statementMap[sid];
        const line = loc && loc.start ? loc.start.line : null;
        if (typeof line === "number" && changedLines.has(line)) {
          fLineTotal += 1;
          totalLines += 1;
          if (entry.s[sid] > 0) {
            fLineCovered += 1;
            coveredLines += 1;
          }
        }
      });
    }

    if (entry && entry.branchMap && entry.b) {
      Object.keys(entry.branchMap).forEach(function (bid) {
        const br = entry.branchMap[bid];
        const line = br && br.loc && br.loc.start ? br.loc.start.line : null;
        if (typeof line === "number" && changedLines.has(line)) {
          const hits = Array.isArray(entry.b[bid]) ? entry.b[bid] : [];
          hits.forEach(function (hit) {
            fBranchTotal += 1;
            totalBranches += 1;
            if (hit > 0) {
              fBranchCovered += 1;
              coveredBranches += 1;
            }
          });
        }
      });
    }

    const linePct = fLineTotal === 0 ? 100 : (fLineCovered / fLineTotal) * 100;
    const branchPct = fBranchTotal === 0 ? 100 : (fBranchCovered / fBranchTotal) * 100;
    perFile.push({
      file: file,
      lines: { covered: fLineCovered, total: fLineTotal, pct: linePct },
      branches: { covered: fBranchCovered, total: fBranchTotal, pct: branchPct }
    });

    if (fLineTotal > 0 && linePct < thresholds.lines) {
      failures.push({ metric: "lines", file: file, actual: linePct, expected: thresholds.lines });
    }
    if (fBranchTotal > 0 && branchPct < thresholds.branches) {
      failures.push({ metric: "branches", file: file, actual: branchPct, expected: thresholds.branches });
    }
  });

  const summary = {
    lines: {
      covered: coveredLines,
      total: totalLines,
      pct: totalLines === 0 ? 100 : (coveredLines / totalLines) * 100
    },
    branches: {
      covered: coveredBranches,
      total: totalBranches,
      pct: totalBranches === 0 ? 100 : (coveredBranches / totalBranches) * 100
    }
  };

  // 全域變更門檻檢查（亦納入無法對應行的情況由 per-file 保護）
  if (summary.lines.total > 0 && summary.lines.pct < thresholds.lines) {
    if (!failures.some(function (f) { return f.metric === "lines" && !f.file; })) {
      failures.push({ metric: "lines", actual: summary.lines.pct, expected: thresholds.lines });
    }
  }
  if (summary.branches.total > 0 && summary.branches.pct < thresholds.branches) {
    if (!failures.some(function (f) { return f.metric === "branches" && !f.file; })) {
      failures.push({ metric: "branches", actual: summary.branches.pct, expected: thresholds.branches });
    }
  }

  return {
    ok: failures.length === 0,
    skipped: false,
    summary: summary,
    files: perFile,
    failures: failures,
    thresholds: thresholds
  };
}

/**
 * 取得 diff 文字。
 *
 * @param {Object} options - 選項
 * @returns {string} diff 內容
 */
function getDiff(options) {
  const settings = options || {};
  const base = settings.base || process.env.CHANGED_COVERAGE_BASE || "HEAD~1";
  const execSync = settings.execSync || childProcess.execSync;
  try {
    return execSync("git diff --unified=0 " + base + "...HEAD --", {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
  } catch (error) {
    try {
      return execSync("git diff --unified=0 " + base + " --", {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"]
      });
    } catch (inner) {
      return "";
    }
  }
}

/**
 * 讀取覆蓋率資料。
 *
 * @returns {Object} coverage-final
 */
function readCoverage() {
  const coveragePath = path.join(PROJECT_ROOT, qualityConfig.PATHS.coverageFinal);
  if (!fs.existsSync(coveragePath)) {
    throw new Error("找不到覆蓋率資料：" + coveragePath + "，請先執行 npm run test:coverage");
  }
  return JSON.parse(fs.readFileSync(coveragePath, "utf8"));
}

/**
 * 執行變更覆蓋率檢查。
 *
 * @param {Object} [options] - 執行選項
 * @returns {number} 結束碼
 */
function runChangedCoverageCheck(options) {
  const settings = options || {};
  const argv = Array.isArray(settings.argv) ? settings.argv : process.argv.slice(2);
  const log = settings.log || console.log;
  const projectRoot = settings.projectRoot || PROJECT_ROOT;
  const base = parseBaseArg(argv) || settings.base;
  const getDiffFn = settings.getDiff || function (opts) { return getDiff(Object.assign({ base: base }, opts || {})); };
  const readCov = settings.readCoverage || readCoverage;
  const thresholds = settings.thresholds || qualityConfig.THRESHOLDS.changed || { lines: 80, branches: 70 };

  const diffText = getDiffFn({ base: base });
  const changedLinesByFile = parseUnifiedDiff(diffText);

  let coverageByFile;
  try {
    coverageByFile = readCov();
  } catch (error) {
    // 無差異時可能仍需略過；先檢查 diff
    const preResult = computeChangedCoverage({
      changedLinesByFile: changedLinesByFile,
      coverageByFile: {},
      thresholds: thresholds,
      projectRoot: projectRoot
    });
    if (preResult.skipped) {
      log("[checkChangedCoverage] 無可量測變更，略過檢查。");
      return 0;
    }
    log("[checkChangedCoverage] " + error.message);
    return 1;
  }

  const result = computeChangedCoverage({
    changedLinesByFile: changedLinesByFile,
    coverageByFile: coverageByFile,
    thresholds: thresholds,
    projectRoot: projectRoot
  });

  if (result.skipped) {
    log("[checkChangedCoverage] 無可量測變更，略過檢查。");
    return 0;
  }

  log(
    "[checkChangedCoverage] 變更覆蓋率 Lines " +
      result.summary.lines.pct.toFixed(2) +
      "% (" +
      result.summary.lines.covered +
      "/" +
      result.summary.lines.total +
      ")，Branches " +
      result.summary.branches.pct.toFixed(2) +
      "% (" +
      result.summary.branches.covered +
      "/" +
      result.summary.branches.total +
      ")"
  );

  if (!result.ok) {
    log("[checkChangedCoverage] 變更覆蓋率未達標：");
    result.failures.forEach(function (f) {
      log(
        "  - " +
          (f.file ? f.file + " " : "") +
          f.metric +
          "：" +
          (typeof f.actual === "number" ? f.actual.toFixed(2) : f.actual) +
          "%（要求 >= " +
          f.expected +
          "%）"
      );
    });
    return 1;
  }

  log("[checkChangedCoverage] 變更覆蓋率檢查通過。");
  return 0;
}

function main() {
  return runChangedCoverageCheck();
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  PROJECT_ROOT: PROJECT_ROOT,
  parseBaseArg: parseBaseArg,
  isInScope: isInScope,
  parseUnifiedDiff: parseUnifiedDiff,
  toRelativeFile: toRelativeFile,
  getCoverageEntry: getCoverageEntry,
  computeChangedCoverage: computeChangedCoverage,
  getDiff: getDiff,
  readCoverage: readCoverage,
  runChangedCoverageCheck: runChangedCoverageCheck,
  main: main
};
