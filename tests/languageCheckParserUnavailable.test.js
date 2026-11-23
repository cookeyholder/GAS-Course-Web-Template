"use strict";

/**
 * 解析器相依缺失之降級契約測試（PR #19 審查意見）。
 *
 * `@babel/parser` 僅供契約字面值清冊使用；硬閘門必須可正常執行，
 * 報告模式須降級保留其他證據，漂移檢查則須輸出可診斷的 PARSER_UNAVAILABLE。
 * 以隔離子行程攔截 require，避免污染測試主行程的模組快取。
 */

const assert = require("assert");
const path = require("path");
const spawnSync = require("child_process").spawnSync;

const PROJECT_ROOT = path.join(__dirname, "..");

/** 攔截解析器載入的共通前導程式碼。 */
const PATCH = [
  'const Module = require("module");',
  "const original = Module._load;",
  "global.__parserRequests = 0;",
  "Module._load = function (request) {",
  '  if (request === "@babel/parser") {',
  "    global.__parserRequests += 1;",
  '    const error = new Error("Cannot find module @babel/parser");',
  '    error.code = "MODULE_NOT_FOUND";',
  "    throw error;",
  "  }",
  "  return original.apply(this, arguments);",
  "};"
].join("\n");

/**
 * 在隔離子行程執行片段。
 *
 * @param {string} snippet - 待執行程式碼
 * @returns {{status: number, stdout: string, stderr: string}} 執行結果
 */
function runIsolated(snippet) {
  return spawnSync(process.execPath, ["-e", PATCH + "\n" + snippet], {
    cwd: PROJECT_ROOT,
    encoding: "utf8"
  });
}

console.log("開始執行解析器缺失降級契約測試...\n");

{
  const result = runIsolated(
    [
      'const languageCheck = require("./scripts/languageCheck.js");',
      'process.stdout.write("HARD_GATE=" + String(languageCheck.main([])));',
      'process.stdout.write(" PARSER_REQUESTS=" + String(global.__parserRequests));'
    ].join("\n")
  );
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes("HARD_GATE=0"), result.stdout);
  assert.ok(result.stdout.includes("PARSER_REQUESTS=0"), result.stdout);
  console.log("   ✓ 硬閘門不載入解析器且可正常執行");
}

{
  const result = runIsolated(
    [
      'const languageCheck = require("./scripts/languageCheck.js");',
      "const data = languageCheck.buildReportData({ root: process.cwd() });",
      "process.stdout.write(JSON.stringify(data.meta.literalDrift));",
      'process.stdout.write(" PARSER_REQUESTS=" + String(global.__parserRequests));'
    ].join("\n")
  );
  assert.strictEqual(result.status, 0, result.stderr);
  const lastLine = result.stdout.trim().split("\n").pop();
  assert.ok(lastLine.includes("PARSER_REQUESTS=0"), lastLine);
  const drift = JSON.parse(lastLine.split(" PARSER_REQUESTS=")[0]);
  assert.strictEqual(drift.drifted, false);
  assert.deepStrictEqual(drift.added, []);
  assert.deepStrictEqual(drift.removed, []);
  console.log("   ✓ 報告模式不載入解析器且保留其他證據");
}

{
  const result = runIsolated(
    [
      'const generator = require("./scripts/generateOpenccS2twpContractLiterals.js");',
      'process.exitCode = generator.main(["--check"], {',
      "  error: function (message) { console.error(message); },",
      "  log: function () {}",
      "});",
      'console.error("PARSER_REQUESTS=" + String(global.__parserRequests));'
    ].join("\n")
  );
  assert.strictEqual(result.status, 1, result.stderr);
  assert.ok(result.stderr.includes("PARSER_REQUESTS=1"), result.stderr);
  assert.ok(result.stderr.includes("PARSER_UNAVAILABLE"), result.stderr);
  assert.ok(result.stderr.includes("MODULE_NOT_FOUND"), result.stderr);
  assert.ok(result.stderr.includes("@babel/parser"), result.stderr);
  console.log("   ✓ 漂移檢查輸出可診斷的 PARSER_UNAVAILABLE");
}

console.log("✓ 解析器缺失降級契約測試全數通過！\n");
