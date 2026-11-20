"use strict";

/**
 * activityLogBuildersBranchCoverage.test.js（task 2.1）
 * 驗證詳情產生器的快照讀取改採呼叫端注入的提供者：
 * - 注入提供者優先於全域同名函式；
 * - 提供者讀取失敗時不拋錯，詳情仍降級為版本化最小合法 JSON；
 * - 本模組不再 require databaseInitializer 或 gasRuntime。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const builders = require(path.join(root, "activityLogBuilders.js"));

console.log("開始執行 activityLogBuildersBranchCoverage 測試...\n");

console.log("1. 模組原始碼不得再 require databaseInitializer 或 gasRuntime...");
{
  const source = fs.readFileSync(path.join(root, "activityLogBuilders.js"), "utf8");
  assert.strictEqual(source.indexOf('require("./databaseInitializer.js")'), -1, "不應 require databaseInitializer");
  assert.strictEqual(source.indexOf('require("./gasRuntime.js")'), -1, "不應 require gasRuntime");
  assert.strictEqual(source.indexOf("resolveDbFn_"), -1, "不應保留舊的 resolveDbFn_");
  console.log("   ✓ 相依移除驗證通過！\n");
}

console.log("2. 注入的提供者應優先於全域同名函式...");
{
  const previous = globalThis.readSystemSettings;
  globalThis.readSystemSettings = function () {
    return { schoolYear: "全域舊值" };
  };
  try {
    const snapshot = builders.captureBefore(
      "systemSettings",
      {},
      {
        readSystemSettings: function () {
          return { schoolYear: "注入值" };
        }
      }
    );
    assert.deepStrictEqual(snapshot, { schoolYear: "注入值" });
  } finally {
    if (previous === undefined) delete globalThis.readSystemSettings;
    else globalThis.readSystemSettings = previous;
  }
  console.log("   ✓ 注入優先驗證通過！\n");
}

console.log("3. 白名單提供者讀取失敗時應回退 null 且不拋錯...");
{
  const previous = globalThis.readWhitelist;
  delete globalThis.readWhitelist;
  try {
    const snapshot = builders.captureBefore(
      "whitelist",
      {},
      {
        readWhitelist: function () {
          throw new Error("讀取失敗");
        }
      }
    );
    assert.strictEqual(snapshot, null, "失敗應回退 null");
    const detail = builders.describe(
      "whitelist",
      snapshot,
      { action: "saveWhitelist", accounts: [{ email: "a@example.com" }] },
      { ok: true, count: 1 }
    );
    assert.strictEqual(detail.版本, 1);
    const serialized = builders.truncateDetailToLimit(JSON.stringify(detail));
    assert.deepStrictEqual(JSON.parse(serialized), detail, "降級詳情仍須為合法 JSON");
  } finally {
    if (previous !== undefined) globalThis.readWhitelist = previous;
  }
  console.log("   ✓ 失敗降級驗證通過！\n");
}

console.log("4. 未提供任何提供者時應安全回退 null...");
{
  const previousRead = globalThis.readSystemSettings;
  delete globalThis.readSystemSettings;
  try {
    assert.strictEqual(builders.captureBefore("systemSettings", {}), null);
  } finally {
    if (previousRead !== undefined) globalThis.readSystemSettings = previousRead;
  }
  console.log("   ✓ 無提供者回退驗證通過！\n");
}

console.log("✓ activityLogBuildersBranchCoverage.test.js 測試全數通過！\n");
