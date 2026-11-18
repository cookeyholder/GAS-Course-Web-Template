"use strict";

/**
 * CRAP 與 Maintainability Index 檢查腳本測試（G1.5）
 * 以 TDD 驗證複雜度計算、門檻判定與報告結構（不依賴實際安裝 typhonjs-escomplex）。
 */

const assert = require("assert");
const path = require("path");

const checkComplexity = require("../scripts/checkComplexity.js");
const qualityConfig = require("../scripts/qualityConfig.js");

console.log("開始執行 CRAP/MI 檢查腳本測試...\n");

console.log("1. 驗證 CRAP 計算公式...");
{
  assert.strictEqual(typeof checkComplexity.computeCrap, "function", "應提供 computeCrap");
  assert.strictEqual(checkComplexity.computeCrap(1, 1), 1, "低複雜度且全覆蓋時 CRAP 應為 1");
  assert.strictEqual(checkComplexity.computeCrap(10, 0), 110, "無覆蓋時 CRAP 應為 comp^2 + comp");
  const partial = checkComplexity.computeCrap(5, 0.5);
  assert(Math.abs(partial - 8.125) < 0.0001, "部分覆蓋時應依公式計算，實際: " + partial);
  console.log("   ✓ CRAP 計算公式驗證通過！\n");
}

console.log("2. 驗證可由分析結果與覆蓋率評估 CRAP/MI 門檻...");
{
  assert.strictEqual(typeof checkComplexity.evaluateComplexity, "function", "應提供 evaluateComplexity");
  const report = checkComplexity.evaluateComplexity({
    analyses: [
      {
        file: "a.js",
        maintainability: 25,
        methods: [
          { name: "okFn", cyclomatic: 5, lineStart: 1, lineEnd: 10 },
          { name: "badFn", cyclomatic: 20, lineStart: 20, lineEnd: 40 }
        ]
      },
      {
        file: "b.js",
        maintainability: 18,
        methods: [{ name: "tiny", cyclomatic: 1, lineStart: 1, lineEnd: 2 }]
      }
    ],
    coverageByFile: {
      "a.js": {
        statementMap: {
          0: { start: { line: 1 }, end: { line: 10 } },
          1: { start: { line: 20 }, end: { line: 40 } }
        },
        s: { 0: 1, 1: 0 },
        fnMap: {},
        f: {}
      },
      "b.js": {
        statementMap: { 0: { start: { line: 1 }, end: { line: 2 } } },
        s: { 0: 1 },
        fnMap: {},
        f: {}
      }
    },
    thresholds: { crap: 30, maintainability: 20 }
  });

  assert.strictEqual(report.ok, false, "存在違規時應失敗");
  assert(report.summary && typeof report.summary === "object", "應提供摘要");
  assert.strictEqual(report.summary.miUnderThreshold, 1, "應統計 MI 違規數");
  assert(report.summary.crapOverThreshold >= 1, "應統計 CRAP 違規數");
  assert(Array.isArray(report.violations) && report.violations.length >= 2, "應列出違規項目");
  assert(
    report.violations.some(function (v) {
      return v.type === "mi" && v.file === "b.js";
    }),
    "應可定位 MI 違規模組"
  );
  assert(
    report.violations.some(function (v) {
      return v.type === "crap" && v.file === "a.js" && v.functionName === "badFn";
    }),
    "應可定位 CRAP 違規函式"
  );
  console.log("   ✓ 複雜度門檻評估驗證通過！\n");
}

console.log("3. 驗證全部符合門檻時檢查成功...");
{
  const report = checkComplexity.evaluateComplexity({
    analyses: [
      {
        file: "ok.js",
        maintainability: 80,
        methods: [{ name: "ok", cyclomatic: 3, lineStart: 1, lineEnd: 5 }]
      }
    ],
    coverageByFile: {
      "ok.js": {
        statementMap: { 0: { start: { line: 1 }, end: { line: 5 } } },
        s: { 0: 3 },
        fnMap: {},
        f: {}
      }
    },
    thresholds: { crap: 30, maintainability: 20 }
  });
  assert.strictEqual(report.ok, true, "符合門檻應成功");
  assert.strictEqual(report.violations.length, 0, "不應有違規");
  assert.strictEqual(report.summary.crapOverThreshold, 0);
  assert.strictEqual(report.summary.miUnderThreshold, 0);
  console.log("   ✓ 全數達標成功驗證通過！\n");
}

console.log("4. 驗證 runComplexityCheck 會輸出 JSON 報告並依結果回傳結束碼...");
{
  assert.strictEqual(typeof checkComplexity.runComplexityCheck, "function", "應提供 runComplexityCheck");
  const writes = [];
  const logs = [];
  const code = checkComplexity.runComplexityCheck({
    readCoverage: function () {
      return {
        "/abs/a.js": {
          statementMap: { 0: { start: { line: 1 }, end: { line: 2 } } },
          s: { 0: 0 },
          fnMap: {},
          f: {}
        }
      };
    },
    collectAnalyses: function () {
      return [
        {
          file: "a.js",
          absolutePath: "/abs/a.js",
          maintainability: 90,
          methods: [{ name: "bad", cyclomatic: 20, lineStart: 1, lineEnd: 2 }]
        }
      ];
    },
    writeReport: function (reportPath, content) {
      writes.push({ reportPath: reportPath, content: content });
    },
    log: function (msg) {
      logs.push(String(msg));
    }
  });
  assert.strictEqual(code, 1, "有違規時應回傳非零");
  assert.strictEqual(writes.length, 1, "應寫出 JSON 報告");
  assert(
    writes[0].reportPath.endsWith(qualityConfig.PATHS.complexityReport.replace(/^reports\//, "")) ||
      writes[0].reportPath.indexOf("complexity") !== -1,
    "報告路徑應與品質設定一致"
  );
  const parsed = JSON.parse(writes[0].content);
  assert(parsed.summary && parsed.violations, "報告應包含 summary 與 violations");
  assert(logs.join("\n").indexOf("CRAP") !== -1 || logs.join("\n").indexOf("違規") !== -1, "摘要應可定位違規");
  console.log("   ✓ 報告輸出與失敗狀態驗證通過！\n");
}

console.log("5. 驗證無違規時成功並寫出報告...");
{
  const writes = [];
  const code = checkComplexity.runComplexityCheck({
    readCoverage: function () {
      return {
        "/abs/a.js": {
          statementMap: { 0: { start: { line: 1 }, end: { line: 2 } } },
          s: { 0: 1 },
          fnMap: {},
          f: {}
        }
      };
    },
    collectAnalyses: function () {
      return [
        {
          file: "a.js",
          absolutePath: "/abs/a.js",
          maintainability: 90,
          methods: [{ name: "ok", cyclomatic: 1, lineStart: 1, lineEnd: 2 }]
        }
      ];
    },
    writeReport: function (reportPath, content) {
      writes.push({ reportPath: reportPath, content: content });
    },
    log: function () {}
  });
  assert.strictEqual(code, 0, "無違規時應回傳 0");
  assert.strictEqual(writes.length, 1, "仍應寫出 JSON 報告");
  const parsed = JSON.parse(writes[0].content);
  assert.strictEqual(parsed.ok, true);
  console.log("   ✓ 成功狀態驗證通過！\n");
}

console.log("✓ CRAP/MI 檢查腳本測試全數通過！\n");
