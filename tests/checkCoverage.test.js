"use strict";

/**
 * 覆蓋率量測腳本測試（G1.3）
 * 以 TDD 驗證 c8 參數組裝與 --collect-only 行為（不依賴實際安裝 c8）。
 */

const assert = require("assert");
const path = require("path");

const checkCoverage = require("../scripts/checkCoverage.js");
const qualityConfig = require("../scripts/qualityConfig.js");

console.log("開始執行覆蓋率量測腳本測試...\n");

console.log("1. 驗證可由品質設定組裝 c8 量測參數...");
{
  assert.strictEqual(typeof checkCoverage.buildC8Args, "function", "應提供 buildC8Args");
  const args = checkCoverage.buildC8Args({ collectOnly: true });
  assert(Array.isArray(args), "buildC8Args 應回傳陣列");

  const joined = args.join(" ");
  assert(joined.includes("--all"), "應包含 --all 以納入全量範圍");
  assert(joined.includes("--include"), "應包含 include 範圍");
  assert(joined.includes("*.js"), "應包含根目錄 js 納管範圍");
  assert(joined.includes("webapp/js/*.js"), "應包含 webapp/js 納管範圍");
  assert(joined.includes("scripts/*.js"), "應包含 scripts 納管範圍");
  assert(joined.includes("--exclude"), "應包含 exclude 規則");
  assert(joined.includes("tests/**"), "應排除 tests");
  assert(joined.includes("coverage/**"), "應排除 coverage");
  assert(joined.includes("node_modules/**"), "應排除 node_modules");
  assert(joined.includes("--reporter=text"), "應產出 text 報告");
  assert(joined.includes("--reporter=lcov"), "應產出 lcov 報告");
  assert(joined.includes("--reporter=json"), "應產出 json 報告");
  assert(joined.includes("--reporter=json-summary"), "應產出 json-summary 報告");
  assert(joined.includes("--report-dir"), "應指定報告目錄");
  assert(joined.includes(qualityConfig.PATHS.coverageDir), "報告目錄應對齊品質設定");
  assert(joined.includes("scripts/run-tests.js") || joined.includes(path.join("scripts", "run-tests.js")), "應執行 scripts/run-tests.js 作為測試入口");
  console.log("   ✓ c8 量測參數組裝驗證通過！\n");
}

console.log("2. 驗證 --collect-only 僅執行量測不進行門檻檢查...");
{
  assert.strictEqual(typeof checkCoverage.runCoverageCheck, "function", "應提供 runCoverageCheck");
  let spawnCalled = null;
  let thresholdCalled = false;
  const code = checkCoverage.runCoverageCheck({
    argv: ["--collect-only"],
    spawnSync: function (cmd, cmdArgs, opts) {
      spawnCalled = { cmd: cmd, args: cmdArgs, opts: opts };
      return { status: 0 };
    },
    checkThresholds: function () {
      thresholdCalled = true;
      return 1;
    },
    log: function () {}
  });
  assert.strictEqual(code, 0, "量測成功且 collect-only 時應回傳 0");
  assert(spawnCalled, "應呼叫子行程執行 c8");
  assert(String(spawnCalled.cmd).includes("c8") || (spawnCalled.args || []).join(" ").includes("c8"), "應透過 c8 執行量測");
  assert.strictEqual(thresholdCalled, false, "collect-only 模式不應執行門檻檢查");
  console.log("   ✓ --collect-only 行為驗證通過！\n");
}

console.log("3. 驗證量測失敗時回傳非零且不檢查門檻...");
{
  let thresholdCalled = false;
  const code = checkCoverage.runCoverageCheck({
    argv: ["--collect-only"],
    spawnSync: function () {
      return { status: 2 };
    },
    checkThresholds: function () {
      thresholdCalled = true;
      return 0;
    },
    log: function () {}
  });
  assert.strictEqual(code, 2, "應回傳 c8/量測失敗結束碼");
  assert.strictEqual(thresholdCalled, false, "量測失敗時不應檢查門檻");
  console.log("   ✓ 量測失敗處理驗證通過！\n");
}

console.log("✓ 覆蓋率量測腳本測試全數通過！\n");
