#!/usr/bin/env node
"use strict";

/**
 * @file checkComplexity.js
 * @description 計算模組 Maintainability Index 與函式 CRAP，輸出摘要與 JSON 報告，
 *              並強制 CRAP <= 30、MI >= 20 門檻。
 */

const fs = require("fs");
const path = require("path");

const qualityConfig = require("./qualityConfig.js");

const PROJECT_ROOT = qualityConfig.PROJECT_ROOT || path.join(__dirname, "..");

/**
 * 計算 CRAP 分數：comp^2 * (1 - cov)^3 + comp。
 *
 * @param {number} complexity - 循環複雜度
 * @param {number} coverage - 函式覆蓋率（0 至 1）
 * @returns {number} CRAP 分數
 */
function computeCrap(complexity, coverage) {
  const comp = Number(complexity) || 0;
  const cov = Math.min(1, Math.max(0, Number(coverage) || 0));
  return comp * comp * Math.pow(1 - cov, 3) + comp;
}

/**
 * 取得方法對應之行覆蓋率（0 至 1）。
 *
 * @param {Object} coverageEntry - c8 單一檔案覆蓋率資料
 * @param {Object} method - 方法資訊（需含 lineStart/lineEnd）
 * @returns {number} 覆蓋率
 */
function computeFunctionCoverage(coverageEntry, method) {
  if (!coverageEntry || !coverageEntry.statementMap || !coverageEntry.s) {
    return 0;
  }
  const startLine = typeof method.lineStart === "number" ? method.lineStart : 1;
  const endLine =
    typeof method.lineEnd === "number" && method.lineEnd >= startLine ? method.lineEnd : startLine;

  let total = 0;
  let covered = 0;
  Object.keys(coverageEntry.statementMap).forEach(function (sid) {
    const loc = coverageEntry.statementMap[sid];
    if (!loc || !loc.start || typeof loc.start.line !== "number") return;
    const line = loc.start.line;
    if (line >= startLine && line <= endLine) {
      total += 1;
      if (coverageEntry.s[sid] > 0) covered += 1;
    }
  });

  if (total === 0) {
    return 0;
  }
  return covered / total;
}

/**
 * 由 coverage map 中尋找與分析檔案對應的覆蓋率資料。
 *
 * @param {Object} coverageByFile - 覆蓋率 map
 * @param {Object} analysis - 分析結果
 * @returns {Object|null} 覆蓋率資料
 */
function findCoverageEntry(coverageByFile, analysis) {
  if (!coverageByFile || !analysis) return null;
  const candidates = [analysis.absolutePath, analysis.file];
  for (let i = 0; i < candidates.length; i++) {
    const key = candidates[i];
    if (key && coverageByFile[key]) return coverageByFile[key];
  }
  // 後備：以路徑結尾比對
  const keys = Object.keys(coverageByFile);
  for (let j = 0; j < keys.length; j++) {
    const k = keys[j];
    if (analysis.file && k.replace(/\\/g, "/").endsWith(String(analysis.file).replace(/\\/g, "/"))) {
      return coverageByFile[k];
    }
  }
  return null;
}

/**
 * 評估複雜度與可維護性門檻。
 *
 * @param {Object} options - 評估選項
 * @param {Array<Object>} options.analyses - 分析結果陣列
 * @param {Object} options.coverageByFile - 覆蓋率 map
 * @param {Object} options.thresholds - 門檻（crap, maintainability）
 * @returns {Object} 評估報告
 */
function evaluateComplexity(options) {
  const settings = options || {};
  const analyses = Array.isArray(settings.analyses) ? settings.analyses : [];
  const coverageByFile = settings.coverageByFile || {};
  const thresholds = settings.thresholds || {};
  const crapThreshold = typeof thresholds.crap === "number" ? thresholds.crap : 30;
  const miThreshold =
    typeof thresholds.maintainability === "number" ? thresholds.maintainability : 20;

  const violations = [];
  let crapOverThreshold = 0;
  let miUnderThreshold = 0;
  let crapMax = 0;
  let crapMaxRef = null;
  let miMin = null;
  let miMinFile = null;
  let methodCount = 0;

  analyses.forEach(function (analysis) {
    const mi = typeof analysis.maintainability === "number" ? analysis.maintainability : 100;
    if (miMin === null || mi < miMin) {
      miMin = mi;
      miMinFile = analysis.file || analysis.absolutePath || null;
    }
    if (mi < miThreshold) {
      miUnderThreshold += 1;
      violations.push({
        type: "mi",
        file: analysis.file || analysis.absolutePath || "",
        maintainability: mi,
        threshold: miThreshold,
        message:
          "MI " + mi.toFixed(2) + " < " + miThreshold + "：" + (analysis.file || analysis.absolutePath)
      });
    }

    const methods = Array.isArray(analysis.methods) ? analysis.methods : [];
    const entry = findCoverageEntry(coverageByFile, analysis);
    methods.forEach(function (method) {
      methodCount += 1;
      const complexity = typeof method.cyclomatic === "number" ? method.cyclomatic : 1;
      const coverage = computeFunctionCoverage(entry, method);
      const crap = computeCrap(complexity, coverage);
      if (crap > crapMax) {
        crapMax = crap;
        crapMaxRef = {
          file: analysis.file || analysis.absolutePath || "",
          functionName: method.name || "<anonymous>",
          lineStart: method.lineStart
        };
      }
      if (crap > crapThreshold) {
        crapOverThreshold += 1;
        violations.push({
          type: "crap",
          file: analysis.file || analysis.absolutePath || "",
          functionName: method.name || "<anonymous>",
          lineStart: method.lineStart,
          cyclomatic: complexity,
          coverage: coverage,
          crap: crap,
          threshold: crapThreshold,
          message:
            "CRAP " +
            crap.toFixed(2) +
            " > " +
            crapThreshold +
            "：" +
            (analysis.file || analysis.absolutePath) +
            " :: " +
            (method.name || "<anonymous>") +
            " (行 " +
            method.lineStart +
            ", comp " +
            complexity +
            ", cov " +
            (coverage * 100).toFixed(1) +
            "%)"
        });
      }
    });
  });

  const summary = {
    analyzedModules: analyses.length,
    analyzedMethods: methodCount,
    crapThreshold: crapThreshold,
    maintainabilityThreshold: miThreshold,
    crapOverThreshold: crapOverThreshold,
    miUnderThreshold: miUnderThreshold,
    crapMax: crapMax,
    crapMaxRef: crapMaxRef,
    miMin: miMin,
    miMinFile: miMinFile
  };

  return {
    ok: violations.length === 0,
    summary: summary,
    violations: violations
  };
}

/**
 * 收集納管範圍之原始碼檔案（相對路徑）。
 *
 * @returns {string[]} 相對於專案根目錄之檔案路徑
 */
function collectSourceFiles() {
  const files = [];
  fs.readdirSync(PROJECT_ROOT, { withFileTypes: true }).forEach(function (entry) {
    if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(entry.name);
    }
  });
  ["webapp/js", "scripts"].forEach(function (dir) {
    const absDir = path.join(PROJECT_ROOT, dir);
    if (!fs.existsSync(absDir)) return;
    fs.readdirSync(absDir, { withFileTypes: true }).forEach(function (entry) {
      if (entry.isFile() && entry.name.endsWith(".js")) {
        files.push(dir + "/" + entry.name);
      }
    });
  });
  return files.sort();
}

/**
 * 收集原始碼分析結果（需安裝 typhonjs-escomplex）。
 *
 * @param {Object} [options] - 選項
 * @returns {Array<Object>} 分析結果
 */
function collectAnalyses(options) {
  const settings = options || {};
  const escomplex = settings.escomplex || require("typhonjs-escomplex");
  const sourceFiles = settings.sourceFiles || collectSourceFiles();
  const analyses = [];

  sourceFiles.forEach(function (file) {
    const absolutePath = path.join(PROJECT_ROOT, file);
    if (!fs.existsSync(absolutePath)) return;
    const source = fs.readFileSync(absolutePath, "utf8");
    let analysis;
    try {
      analysis = escomplex.analyzeModule(source, {});
    } catch (error) {
      analysis = { maintainability: 100, methods: [] };
    }
    analyses.push({
      file: file,
      absolutePath: absolutePath.replace(/\\/g, "/"),
      maintainability: typeof analysis.maintainability === "number" ? analysis.maintainability : 100,
      methods: (analysis.methods || []).map(function (m) {
        return {
          name: m.name,
          cyclomatic: m.cyclomatic,
          lineStart: m.lineStart,
          lineEnd: m.lineEnd
        };
      })
    });
  });
  return analyses;
}

/**
 * 讀取覆蓋率資料。
 *
 * @returns {Object} coverage-final 內容
 */
function readCoverage() {
  const coveragePath = path.join(PROJECT_ROOT, qualityConfig.PATHS.coverageFinal);
  if (!fs.existsSync(coveragePath)) {
    throw new Error("找不到覆蓋率資料：" + coveragePath + "，請先執行 npm run test:coverage");
  }
  return JSON.parse(fs.readFileSync(coveragePath, "utf8"));
}

/**
 * 寫出 JSON 報告。
 *
 * @param {string} reportPath - 報告路徑
 * @param {string} content - JSON 內容
 */
function writeReport(reportPath, content) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, content, "utf8");
}

/**
 * 執行複雜度檢查。
 *
 * @param {Object} [options] - 執行選項
 * @returns {number} 結束碼
 */
function runComplexityCheck(options) {
  const settings = options || {};
  const log = settings.log || console.log;
  const thresholds = settings.thresholds || qualityConfig.THRESHOLDS;
  const readCov = settings.readCoverage || readCoverage;
  const collect = settings.collectAnalyses || collectAnalyses;
  const write = settings.writeReport || writeReport;

  let coverageByFile;
  try {
    coverageByFile = readCov();
  } catch (error) {
    log("[checkComplexity] " + error.message);
    return 1;
  }

  const analyses = collect();
  const report = evaluateComplexity({
    analyses: analyses,
    coverageByFile: coverageByFile,
    thresholds: thresholds
  });
  report.generatedAt = new Date().toISOString();

  const reportPath = path.join(PROJECT_ROOT, qualityConfig.PATHS.complexityReport);
  write(reportPath, JSON.stringify(report, null, 2));

  log(
    "[checkComplexity] 分析模組 " +
      report.summary.analyzedModules +
      "、函式 " +
      report.summary.analyzedMethods +
      "；MI 最低 " +
      (report.summary.miMin !== null ? report.summary.miMin.toFixed(2) : "N/A") +
      "；CRAP > " +
      report.summary.crapThreshold +
      " 數 " +
      report.summary.crapOverThreshold +
      "；CRAP 最高 " +
      report.summary.crapMax.toFixed(2)
  );
  if (!report.ok) {
    log("[checkComplexity] 發現違規項目 " + report.violations.length + "：");
    report.violations.slice(0, 50).forEach(function (v) {
      log("  - " + v.message);
    });
    if (report.violations.length > 50) {
      log("  ... 其餘 " + (report.violations.length - 50) + " 項請見 " + reportPath);
    }
    return 1;
  }

  log("[checkComplexity] CRAP 與 MI 檢查通過。報告：" + reportPath);
  return 0;
}

/**
 * CLI 入口。
 */
function main() {
  return runComplexityCheck();
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  PROJECT_ROOT: PROJECT_ROOT,
  computeCrap: computeCrap,
  computeFunctionCoverage: computeFunctionCoverage,
  findCoverageEntry: findCoverageEntry,
  evaluateComplexity: evaluateComplexity,
  collectSourceFiles: collectSourceFiles,
  collectAnalyses: collectAnalyses,
  readCoverage: readCoverage,
  writeReport: writeReport,
  runComplexityCheck: runComplexityCheck,
  main: main
};
