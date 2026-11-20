"use strict";

/**
 * gasRuntime.js 單元測試（task 4.3）。
 * 驗證單一相依解析、安全試算表取得、白名單注入與 fail-fast 行為。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const runtime = require("../gasRuntime.js");

function run() {
  console.log("1. resolveDependency_ 應優先 module.exports...");
  const backend = require("../subjectCodeTransformer.js");
  assert.strictEqual(
    runtime.resolveDependency_("NORMALIZED_COURSE_HEADERS", "./subjectCodeTransformer.js"),
    backend.NORMALIZED_COURSE_HEADERS
  );
  console.log("   ✓ module.exports 解析驗證通過！\n");

  console.log("2. resolveDependency_ 應次優先 globalThis...");
  const fakeName = "gasRuntimeTestGlobalOnly";
  globalThis[fakeName] = { marker: "from-global" };
  try {
    assert.deepStrictEqual(runtime.resolveDependency_(fakeName, "./not-exist.js"), { marker: "from-global" });
  } finally {
    delete globalThis[fakeName];
  }
  console.log("   ✓ globalThis 解析驗證通過！\n");

  console.log("3. 無 fallback 時應 fail-fast，有 fallback 時回傳備援...");
  assert.throws(function () {
    runtime.resolveDependency_("gasRuntimeMissingDependency", "./not-exist.js");
  }, /找不到相依匯出/);
  assert.strictEqual(
    runtime.resolveDependency_("gasRuntimeMissingDependency", "./not-exist.js", "fallback"),
    "fallback"
  );
  console.log("   ✓ fail-fast 與備援驗證通過！\n");

  console.log("4. getActiveSpreadsheetSafe_ 應遵循明確傳入 > SpreadsheetApp > null...");
  const explicit = { id: "explicit" };
  assert.strictEqual(runtime.getActiveSpreadsheetSafe_({ spreadsheet: explicit }), explicit);
  assert.strictEqual(runtime.getActiveSpreadsheetSafe_(), null);
  console.log("   ✓ 試算表取得驗證通過！\n");

  console.log("5. injectGlobals_ 應只注入白名單且缺漏時 fail-fast...");
  const injected = runtime.injectGlobals_("./utilities.js", ["sanitizeRowMatrix"]);
  assert.strictEqual(globalThis.sanitizeRowMatrix, injected.sanitizeRowMatrix);
  assert.strictEqual(typeof globalThis.sanitizeRowMatrix, "function");
  assert.deepStrictEqual(Object.keys(injected), ["sanitizeRowMatrix"]);
  assert.throws(function () {
    runtime.injectGlobals_("./utilities.js", ["notExportedName"]);
  }, /未匯出/);
  console.log("   ✓ 白名單注入驗證通過！\n");

  console.log("6. GAS 全域環境應可取得相同的 gasRuntime API...");
  const source = fs.readFileSync(path.join(__dirname, "..", "gasRuntime.js"), "utf8");
  const gasSandbox = { console: console };
  vm.createContext(gasSandbox);
  vm.runInContext(source, gasSandbox, { filename: "gasRuntime.js" });
  assert(gasSandbox.gasRuntime, "GAS 應掛載全域 gasRuntime");
  assert.strictEqual(typeof gasSandbox.gasRuntime.resolveDependency_, "function");
  assert.strictEqual(typeof gasSandbox.gasRuntime.getActiveSpreadsheetSafe_, "function");
  console.log("   ✓ GAS 環境驗證通過！\n");

  console.log("7. 同名全域與 overrides 並存時應以 overrides（module.exports）為準...");
  {
    const fakeName = "gasRuntimeTestOverridePrecedence";
    globalThis[fakeName] = { marker: "from-global" };
    const overrides = {};
    overrides[fakeName] = { marker: "from-overrides" };
    try {
      assert.deepStrictEqual(
        runtime.resolveDependency_(fakeName, null, "fallback", overrides),
        { marker: "from-overrides" },
        "overrides 應優先於 globalThis"
      );
      // 值為 null 時應視為未提供，退回 globalThis（沿用 appendActivityLog facade 語意）。
      overrides[fakeName] = null;
      assert.deepStrictEqual(
        runtime.resolveDependency_(fakeName, null, "fallback", overrides),
        { marker: "from-global" },
        "overrides 為 null 時應退回 globalThis"
      );
    } finally {
      delete globalThis[fakeName];
    }
    console.log("   ✓ overrides 優先順序驗證通過！\n");
  }

  console.log("8. subjectCodeTransformer 應維持轉發單一解析入口...");
  {
    const source = fs.readFileSync(path.join(__dirname, "..", "subjectCodeTransformer.js"), "utf8");
    assert(source.indexOf("GAS_RUNTIME.resolveDependency_(") !== -1, "應呼叫單一解析入口");
    assert.strictEqual(source.indexOf("function resolveDependency_"), -1, "不得自訂解析實作");
    // 回歸：單一入口仍可解析模組既有匯出（task 1 既有行為）。
    const backend = require("../subjectCodeTransformer.js");
    assert.strictEqual(
      runtime.resolveDependency_("NORMALIZED_COURSE_HEADERS", "./subjectCodeTransformer.js"),
      backend.NORMALIZED_COURSE_HEADERS
    );
    console.log("   ✓ subjectCodeTransformer 單一入口回歸驗證通過！\n");
  }

  console.log("✓ gasRuntime.js 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
