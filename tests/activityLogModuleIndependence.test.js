"use strict";

/**
 * activityLogModuleIndependence.test.js（task 2.3）
 * 以獨立 Node 處理程序分別載入詳情產生器與動作登錄表，
 * 驗證兩者皆無循環相依且可單獨 require。
 */

const assert = require("assert");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
console.log("開始執行 activityLogModuleIndependence 測試...\n");

function requireInFreshProcess(target) {
  const script =
    "const mod = require(" +
    JSON.stringify(path.join(root, target)) +
    ");" +
    "if (!mod || typeof mod !== 'object') throw new Error('模組匯出異常');" +
    "process.stdout.write(Object.keys(mod).sort().join(','));";
  return execFileSync(process.execPath, ["-e", script], { cwd: root, encoding: "utf8" });
}

console.log("1. 單獨載入 activityLogBuilders.js 應成功...");
{
  const output = requireInFreshProcess("activityLogBuilders.js");
  ["captureBefore", "describe", "getBuilder", "projectPayload", "truncateDetailToLimit"].forEach(function (name) {
    assert(output.split(",").indexOf(name) !== -1, "應匯出 " + name);
  });
  console.log("   ✓ 詳情產生器獨立載入驗證通過！\n");
}

console.log("2. 單獨載入 actionRegistry.js 應成功...");
{
  const output = requireInFreshProcess("actionRegistry.js");
  ["getActionMeta", "listActions", "setHandler", "buildRolePermissions"].forEach(function (name) {
    assert(output.split(",").indexOf(name) !== -1, "應匯出 " + name);
  });
  console.log("   ✓ 動作登錄表獨立載入驗證通過！\n");
}

console.log("✓ activityLogModuleIndependence.test.js 測試全數通過！\n");
