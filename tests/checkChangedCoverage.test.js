"use strict";

/**
 * 變更覆蓋率檢查腳本測試（G1.6）
 * 以 TDD 驗證 diff 解析、變更覆蓋率計算、門檻判定與 --base/略過行為。
 */

const assert = require("assert");

const checkChangedCoverage = require("../scripts/checkChangedCoverage.js");
const qualityConfig = require("../scripts/qualityConfig.js");

console.log("開始執行變更覆蓋率檢查腳本測試...\n");

console.log("1. 驗證可解析 unified diff 取得變更行...");
{
  assert.strictEqual(typeof checkChangedCoverage.parseUnifiedDiff, "function", "應提供 parseUnifiedDiff");
  const diff = [
    "diff --git a/scripts/foo.js b/scripts/foo.js",
    "index 111..222 100644",
    "--- a/scripts/foo.js",
    "+++ b/scripts/foo.js",
    "@@ -10,0 +11,3 @@",
    "+const a = 1;",
    "+const b = 2;",
    "+return a + b;",
    "diff --git a/tests/foo.test.js b/tests/foo.test.js",
    "--- a/tests/foo.test.js",
    "+++ b/tests/foo.test.js",
    "@@ -1,0 +1,1 @@",
    "+test"
  ].join("\n");
  const changed = checkChangedCoverage.parseUnifiedDiff(diff);
  assert(changed && typeof changed === "object", "應回傳變更行 map");
  assert(changed["scripts/foo.js"], "應包含 scripts/foo.js");
  const lines = Array.from(changed["scripts/foo.js"]).sort(function (a, b) {
    return a - b;
  });
  assert.deepStrictEqual(lines, [11, 12, 13], "應擷取新增行號");
  assert.strictEqual(changed["tests/foo.test.js"], undefined, "應忽略非納管範圍檔案（tests）");
  console.log("   ✓ unified diff 解析驗證通過！\n");
}

console.log("2. 驗證變更覆蓋率達標時檢查成功...");
{
  assert.strictEqual(typeof checkChangedCoverage.computeChangedCoverage, "function", "應提供 computeChangedCoverage");
  const changedLinesByFile = { "scripts/foo.js": new Set([11, 12]) };
  const coverageFinal = {
    "/proj/scripts/foo.js": {
      path: "/proj/scripts/foo.js",
      statementMap: {
        0: { start: { line: 11, column: 0 }, end: { line: 11, column: 10 } },
        1: { start: { line: 12, column: 0 }, end: { line: 12, column: 10 } }
      },
      fnMap: {},
      branchMap: {
        0: { loc: { start: { line: 11, column: 0 }, end: { line: 11, column: 10 } }, locations: [{}, {}] }
      },
      s: { 0: 1, 1: 1 },
      f: {},
      b: { 0: [1, 1] }
    }
  };
  const result = checkChangedCoverage.computeChangedCoverage({
    changedLinesByFile: changedLinesByFile,
    coverageByFile: coverageFinal,
    thresholds: { lines: 80, branches: 70 },
    projectRoot: "/proj"
  });
  assert.strictEqual(result.ok, true, "達標應成功");
  assert.strictEqual(result.skipped, false, "有可量測變更時不應略過");
  assert(result.summary && result.summary.lines.pct >= 80, "變更行覆蓋率應達標");
  assert(result.summary.branches.pct >= 70, "變更分支覆蓋率應達標");
  console.log("   ✓ 變更覆蓋率達標驗證通過！\n");
}

console.log("3. 驗證變更覆蓋率不足時檢查失敗並指出未達標檔案...");
{
  const changedLinesByFile = { "webapp/js/bar.js": new Set([5, 6]) };
  const coverageFinal = {
    "/proj/webapp/js/bar.js": {
      path: "/proj/webapp/js/bar.js",
      statementMap: {
        0: { start: { line: 5, column: 0 }, end: { line: 5, column: 10 } },
        1: { start: { line: 6, column: 0 }, end: { line: 6, column: 10 } }
      },
      fnMap: {},
      branchMap: {
        0: { loc: { start: { line: 6, column: 0 }, end: { line: 6, column: 10 } }, locations: [{}, {}] }
      },
      s: { 0: 1, 1: 0 },
      f: {},
      b: { 0: [1, 0] }
    }
  };
  const result = checkChangedCoverage.computeChangedCoverage({
    changedLinesByFile: changedLinesByFile,
    coverageByFile: coverageFinal,
    thresholds: { lines: 80, branches: 70 },
    projectRoot: "/proj"
  });
  assert.strictEqual(result.ok, false, "未達標應失敗");
  assert(Array.isArray(result.failures) && result.failures.length > 0, "應提供失敗資訊");
  assert(
    result.failures.some(function (f) {
      return /bar\.js/.test(String(f.file || f.message || ""));
    }) ||
      result.failures.some(function (f) {
        return /lines|branches/.test(String(f.metric || f.message || ""));
      }),
    "應指出未達標檔案或指標"
  );
  console.log("   ✓ 變更覆蓋率不足失敗驗證通過！\n");
}

console.log("4. 驗證無可量測變更時明確成功/略過...");
{
  const result = checkChangedCoverage.computeChangedCoverage({
    changedLinesByFile: {},
    coverageByFile: {},
    thresholds: { lines: 80, branches: 70 },
    projectRoot: "/proj"
  });
  assert.strictEqual(result.ok, true, "無可量測變更時應成功");
  assert.strictEqual(result.skipped, true, "應標示為略過/無可量測變更");
  console.log("   ✓ 無可量測變更略過驗證通過！\n");
}

console.log("5. 驗證 runChangedCoverageCheck 支援 --base 並依結果回傳結束碼...");
{
  assert.strictEqual(typeof checkChangedCoverage.runChangedCoverageCheck, "function", "應提供 runChangedCoverageCheck");
  let receivedBase = null;
  const code = checkChangedCoverage.runChangedCoverageCheck({
    argv: ["--base", "origin/main"],
    getDiff: function (opts) {
      receivedBase = opts && opts.base;
      return [
        "diff --git a/scripts/x.js b/scripts/x.js",
        "--- a/scripts/x.js",
        "+++ b/scripts/x.js",
        "@@ -0,0 +1,1 @@",
        "+x"
      ].join("\n");
    },
    readCoverage: function () {
      return {
        "/proj/scripts/x.js": {
          statementMap: { 0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } } },
          fnMap: {},
          branchMap: {},
          s: { 0: 1 },
          f: {},
          b: {}
        }
      };
    },
    projectRoot: "/proj",
    log: function () {}
  });
  assert.strictEqual(receivedBase, "origin/main", "應將 --base 傳遞給 diff 取得流程");
  assert.strictEqual(code, 0, "達標時應回傳 0");
  console.log("   ✓ --base 與成功狀態驗證通過！\n");
}

console.log("6. 驗證變更覆蓋率不足時 runChangedCoverageCheck 回傳失敗...");
{
  const code = checkChangedCoverage.runChangedCoverageCheck({
    argv: [],
    getDiff: function () {
      return [
        "diff --git a/scripts/y.js b/scripts/y.js",
        "--- a/scripts/y.js",
        "+++ b/scripts/y.js",
        "@@ -0,0 +1,2 @@",
        "+a",
        "+b"
      ].join("\n");
    },
    readCoverage: function () {
      return {
        "/proj/scripts/y.js": {
          statementMap: {
            0: { start: { line: 1, column: 0 }, end: { line: 1, column: 1 } },
            1: { start: { line: 2, column: 0 }, end: { line: 2, column: 1 } }
          },
          fnMap: {},
          branchMap: {},
          s: { 0: 0, 1: 0 },
          f: {},
          b: {}
        }
      };
    },
    projectRoot: "/proj",
    log: function () {}
  });
  assert.strictEqual(code, 1, "未達標時應回傳非零");
  console.log("   ✓ 失敗狀態驗證通過！\n");
}

console.log("7. 驗證 getDiff 拆分後的三點比較、兩點回退與完全失敗...");
{
  const calls = [];
  const diff = checkChangedCoverage.getDiff({
    base: "main",
    execSync: function (args) {
      calls.push(args);
      if (calls.length === 1) throw new Error("三點比較失敗");
      return "兩點比較 diff";
    }
  });
  assert.strictEqual(diff, "兩點比較 diff");
  assert.deepStrictEqual(calls, ["git diff --unified=0 main...HEAD --", "git diff --unified=0 main --"]);
  console.log("   ✓ 兩點回退驗證通過！\n");
}
{
  const diff = checkChangedCoverage.getDiff({
    base: "main",
    execSync: function (args) {
      assert.strictEqual(args, "git diff --unified=0 main...HEAD --");
      return "三點比較 diff";
    }
  });
  assert.strictEqual(diff, "三點比較 diff");
  console.log("   ✓ 三點比較驗證通過！\n");
}
{
  const diff = checkChangedCoverage.getDiff({
    base: "main",
    execSync: function () {
      throw new Error("所有比較皆失敗");
    }
  });
  assert.strictEqual(diff, "");
  console.log("   ✓ 完全失敗回退驗證通過！\n");
}

console.log("✓ 變更覆蓋率檢查腳本測試全數通過！\n");
