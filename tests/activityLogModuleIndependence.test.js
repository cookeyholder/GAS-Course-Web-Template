"use strict";

/**
 * activityLogModuleIndependence.test.js（task 2.3）
 * 在全新 Node 行程中載入 databaseInitializer → activityLogger → activityLogBuilders
 * 完整鏈，驗證相依方向正確；並以人為注入的逆向邊反向證明檢查非假驗證，
 * 同時驗證快照提供者失敗時詳情仍降級為合法 JSON。
 */

const assert = require("assert");
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const helper = path.join(__dirname, "helpers", "checkLogChainDependency.js");
console.log("開始執行 activityLogModuleIndependence 測試...\n");

console.log("1. 全新行程載入完整鏈，相依方向應正確...");
{
  const result = spawnSync(process.execPath, [helper, root], { cwd: root, encoding: "utf8" });
  assert.strictEqual(result.status, 0, "完整鏈應無逆向相依：" + (result.stderr || ""));
  assert(result.stdout.indexOf("相依方向正確") !== -1, "應輸出相依方向正確");
  console.log("   ✓ 完整鏈相依方向驗證通過！\n");
}

console.log("2. 人為注入逆向邊時檢查必須失敗（反向證明非假驗證）...");
{
  const result = spawnSync(process.execPath, [helper, root, "--inject-cycle"], { cwd: root, encoding: "utf8" });
  assert.notStrictEqual(result.status, 0, "注入逆向邊時檢查必須失敗");
  assert(result.stderr.indexOf("逆向相依") !== -1, "應明確指出逆向相依");
  console.log("   ✓ 人造逆向邊反向驗證通過！\n");
}

console.log("3. 快照提供者讀取失敗時詳情應降級為合法 JSON...");
{
  const script =
    "const b = require(" +
    JSON.stringify(path.join(root, "activityLogBuilders.js")) +
    ");" +
    "const before = b.captureBefore('systemSettings', {}, { readSystemSettings: function () { throw new Error('boom'); } });" +
    "if (before !== null) throw new Error('失敗應回退 null');" +
    "const detail = b.describe('systemSettings', before, { action: 'saveSystemSettings', settings: { schoolYear: '115' } }, { ok: true });" +
    "const text = b.truncateDetailToLimit(JSON.stringify(detail));" +
    "const parsed = JSON.parse(text);" +
    "if (parsed.版本 !== 1 || !Array.isArray(parsed.變動)) throw new Error('降級詳情結構異常');" +
    "process.stdout.write('OK');";
  const output = execFileSync(process.execPath, ["-e", script], { cwd: root, encoding: "utf8" });
  assert.strictEqual(output, "OK");
  console.log("   ✓ 提供者失敗降級驗證通過！\n");
}

console.log("4. 動作登錄表仍可獨立載入...");
{
  const script =
    "const mod = require(" +
    JSON.stringify(path.join(root, "actionRegistry.js")) +
    ");" +
    "process.stdout.write(['getActionMeta', 'listActions', 'setHandler', 'buildRolePermissions'].every(function (n) { return typeof mod[n] === 'function'; }) ? 'OK' : 'MISSING');";
  const output = execFileSync(process.execPath, ["-e", script], { cwd: root, encoding: "utf8" });
  assert.strictEqual(output, "OK");
  console.log("   ✓ 動作登錄表獨立載入驗證通過！\n");
}

console.log("✓ activityLogModuleIndependence.test.js 測試全數通過！\n");
