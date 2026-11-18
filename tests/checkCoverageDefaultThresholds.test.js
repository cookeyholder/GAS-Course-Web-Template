"use strict";

/**
 * scripts/checkCoverage.js::defaultCheckThresholds 單元測試（G8.6）。
 * 以注入方式驗證檔案讀取、例外處理與門檻比對分支。
 */

const assert = require("assert");
const checkCoverage = require("../scripts/checkCoverage.js");

console.log("開始執行 checkCoverage.js defaultCheckThresholds 測試...\n");

function createFs(contents) {
  return {
    existsSync: function () {
      return contents !== null;
    },
    readFileSync: function () {
      if (contents instanceof Error) {
        throw contents;
      }
      return contents;
    }
  };
}

function createConfig(pct) {
  return {
    PATHS: { coverageSummary: "coverage/coverage-summary.json" },
    THRESHOLDS: { global: { lines: 30, statements: 30, functions: 60, branches: 40 } },
    loadBaseline: function () {
      return { coverage: { totals: { lines: { pct: pct } } } };
    }
  };
}

function createSummary(pct) {
  const metric = { total: 100, covered: pct, skipped: 0, pct: pct };
  return {
    total: {
      lines: metric,
      statements: metric,
      functions: metric,
      branches: metric
    }
  };
}

function run() {
  assert.strictEqual(typeof checkCoverage.defaultCheckThresholds, "function");
  console.log("1. 應匯出 defaultCheckThresholds ✓\n");

  let logs = [];
  let code = checkCoverage.defaultCheckThresholds({
    fs: createFs(null),
    path: require("path"),
    projectRoot: "/tmp/project",
    qualityConfig: createConfig(0),
    log: function (message) {
      logs.push(message);
    }
  });
  assert.strictEqual(code, 1);
  assert(logs.some(function (m) {
    return m.indexOf("找不到覆蓋率摘要檔") !== -1;
  }));
  console.log("2. 缺少摘要檔時回傳失敗 ✓\n");

  logs = [];
  code = checkCoverage.defaultCheckThresholds({
    fs: createFs(new Error("損毀")),
    path: require("path"),
    projectRoot: "/tmp/project",
    qualityConfig: createConfig(0),
    log: function (message) {
      logs.push(message);
    }
  });
  assert.strictEqual(code, 1);
  assert(logs.some(function (m) {
    return m.indexOf("無法讀取覆蓋率摘要") !== -1;
  }));
  console.log("3. 摘要檔解析失敗時回傳失敗 ✓\n");

  logs = [];
  code = checkCoverage.defaultCheckThresholds({
    fs: createFs(JSON.stringify(createSummary(90))),
    path: require("path"),
    projectRoot: "/tmp/project",
    summaryPath: "/custom/summary.json",
    qualityConfig: createConfig(95),
    log: function (message) {
      logs.push(message);
    }
  });
  assert.strictEqual(code, 1);
  assert(logs.some(function (m) {
    return m.indexOf("低於基準線（回退）") !== -1;
  }));
  console.log("4. 低於基準線時回傳失敗並說明原因 ✓\n");

  logs = [];
  code = checkCoverage.defaultCheckThresholds({
    fs: createFs(JSON.stringify(createSummary(10))),
    path: require("path"),
    projectRoot: "/tmp/project",
    qualityConfig: createConfig(0),
    log: function (message) {
      logs.push(message);
    }
  });
  assert.strictEqual(code, 1);
  assert(logs.some(function (m) {
    return m.indexOf("低於門檻") !== -1;
  }));
  console.log("5. 低於門檻時回傳失敗並說明原因 ✓\n");

  logs = [];
  code = checkCoverage.defaultCheckThresholds({
    fs: createFs(JSON.stringify(createSummary(95))),
    path: require("path"),
    projectRoot: "/tmp/project",
    qualityConfig: createConfig(30),
    log: function (message) {
      logs.push(message);
    }
  });
  assert.strictEqual(code, 0);
  assert(logs.some(function (m) {
    return m.indexOf("覆蓋率檢查通過") !== -1;
  }));
  console.log("6. 符合門檻與基準線時回傳成功 ✓\n");

  console.log("✓ checkCoverage.js defaultCheckThresholds 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
