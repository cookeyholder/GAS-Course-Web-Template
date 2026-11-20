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
  const args = checkCoverage.buildC8Args();
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
  assert(joined.includes(qualityConfig.PATHS.coverageDir), "報告目錄應與品質設定一致");
  assert(
    joined.includes("scripts/run-tests.js") || joined.includes(path.join("scripts", "run-tests.js")),
    "應執行 scripts/run-tests.js 作為測試入口"
  );
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
  assert(
    String(spawnCalled.cmd).includes("c8") || (spawnCalled.args || []).join(" ").includes("c8"),
    "應透過 c8 執行量測"
  );
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

console.log("4. 驗證非 collect-only 時量測成功後執行門檻檢查...");
{
  let thresholdCalled = false;
  const code = checkCoverage.runCoverageCheck({
    argv: [],
    spawnSync: function () {
      return { status: 0 };
    },
    checkThresholds: function () {
      thresholdCalled = true;
      return 7;
    },
    log: function () {}
  });
  assert.strictEqual(code, 7, "應回傳門檻檢查結果");
  assert.strictEqual(thresholdCalled, true, "非 collect-only 時應執行門檻檢查");
  console.log("   ✓ 門檻檢查呼叫驗證通過！\n");
}

console.log("5. 驗證全域覆蓋率低於門檻時檢查失敗...");
{
  assert.strictEqual(typeof checkCoverage.evaluateCoverageThresholds, "function", "應提供 evaluateCoverageThresholds");
  const result = checkCoverage.evaluateCoverageThresholds({
    summary: {
      total: {
        lines: { pct: 29.0 },
        statements: { pct: 31.0 },
        functions: { pct: 61.0 },
        branches: { pct: 41.0 }
      }
    },
    baseline: {
      coverage: {
        totals: {
          lines: { pct: 27.37 },
          statements: { pct: 27.37 },
          functions: { pct: 58.82 },
          branches: { pct: 37.87 }
        }
      }
    },
    thresholds: { lines: 30, statements: 30, functions: 60, branches: 40 }
  });
  assert.strictEqual(result.ok, false, "低於門檻應失敗");
  assert(
    result.failures.some(function (f) {
      return f.metric === "lines";
    }),
    "應指出 lines 未達標"
  );
  console.log("   ✓ 門檻不足失敗驗證通過！\n");
}

console.log("6. 驗證覆蓋率低於基準線（回退）時檢查失敗...");
{
  const result = checkCoverage.evaluateCoverageThresholds({
    summary: {
      total: {
        lines: { pct: 31.0 },
        statements: { pct: 31.0 },
        functions: { pct: 61.0 },
        branches: { pct: 39.0 }
      }
    },
    baseline: {
      coverage: {
        totals: {
          lines: { pct: 27.37 },
          statements: { pct: 27.37 },
          functions: { pct: 58.82 },
          branches: { pct: 40.0 }
        }
      }
    },
    thresholds: { lines: 30, statements: 30, functions: 60, branches: 37 }
  });
  assert.strictEqual(result.ok, false, "回退應失敗");
  assert(
    result.failures.some(function (f) {
      return f.metric === "branches" && /基準線|回退/.test(f.reason);
    }),
    "應指出 branches 低於基準線"
  );
  console.log("   ✓ 基準線回退失敗驗證通過！\n");
}

console.log("7. 驗證覆蓋率達標且未回退時檢查成功...");
{
  const result = checkCoverage.evaluateCoverageThresholds({
    summary: {
      total: {
        lines: { pct: 30.0 },
        statements: { pct: 30.1 },
        functions: { pct: 60.0 },
        branches: { pct: 40.5 }
      }
    },
    baseline: {
      coverage: {
        totals: {
          lines: { pct: 27.37 },
          statements: { pct: 27.37 },
          functions: { pct: 58.82 },
          branches: { pct: 37.87 }
        }
      }
    },
    thresholds: { lines: 30, statements: 30, functions: 60, branches: 40 }
  });
  assert.strictEqual(result.ok, true, "達標且未回退應成功");
  assert.strictEqual(result.failures.length, 0, "不應有失敗項目");
  console.log("   ✓ 達標成功驗證通過！\n");
}

console.log("✓ 覆蓋率量測腳本測試全數通過！\n");
