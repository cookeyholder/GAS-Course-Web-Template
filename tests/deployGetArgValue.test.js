"use strict";

/**
 * scripts/deploy.js 的 getArgValue 單元測試（G8.3）
 * 驗證長短旗標、等號形式、缺失值與回退等人為邊界行為。
 */

const assert = require("assert");
const childProcess = require("child_process");

const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = function () {
  throw new Error("測試中不得執行真實子行程");
};
const deploy = require("../scripts/deploy.js");
childProcess.spawnSync = originalSpawnSync;

const ID_NAMES = ["--deployment-id", "-i"];
const DESCRIPTION_NAMES = ["--description", "-d"];

console.log("開始執行 scripts/deploy.js::getArgValue 測試...\n");

console.log("1. 長旗標與短旗標皆應取得下一項的值...");
{
  assert.strictEqual(deploy.getArgValue(["--deployment-id", "DEP-1"], ID_NAMES), "DEP-1");
  assert.strictEqual(deploy.getArgValue(["-i", "DEP-2"], ID_NAMES), "DEP-2");
  assert.strictEqual(deploy.getArgValue(["--description", "版本說明"], DESCRIPTION_NAMES), "版本說明");
  assert.strictEqual(deploy.getArgValue(["-d", "說明"], DESCRIPTION_NAMES), "說明");
  console.log("   ✓ 長短旗標驗證通過！\n");
}

console.log("2. 等號形式應取得旗標後方的字串...");
{
  assert.strictEqual(deploy.getArgValue(["--deployment-id=DEP-3"], ID_NAMES), "DEP-3");
  assert.strictEqual(deploy.getArgValue(["-i=DEP-4"], ID_NAMES), "DEP-4");
  assert.strictEqual(deploy.getArgValue(["--description=版本=說明"], DESCRIPTION_NAMES), "版本=說明");
  assert.strictEqual(deploy.getArgValue(["--deployment-id="], ID_NAMES), "");
  console.log("   ✓ 等號形式驗證通過！\n");
}

console.log("3. 旗標後無值時應回傳空字串...");
{
  assert.strictEqual(deploy.getArgValue(["--deployment-id"], ID_NAMES), "");
  assert.strictEqual(deploy.getArgValue(["-i"], ID_NAMES), "");
  assert.strictEqual(deploy.getArgValue(["-d"], DESCRIPTION_NAMES), "");
  console.log("   ✓ 缺失值驗證通過！\n");
}

console.log("4. 後續參數為另一旗標時，應維持原行為當作值回傳...");
{
  assert.strictEqual(deploy.getArgValue(["--deployment-id", "--no-push"], ID_NAMES), "--no-push");
  assert.strictEqual(deploy.getArgValue(["-d", "-i"], DESCRIPTION_NAMES), "-i");
  console.log("   ✓ 舊有契約驗證通過！\n");
}

console.log("5. 無比對、空陣列與非陣列輸入應回傳空字串...");
{
  assert.strictEqual(deploy.getArgValue(["--no-push", "value"], ID_NAMES), "");
  assert.strictEqual(deploy.getArgValue([], ID_NAMES), "");
  assert.strictEqual(deploy.getArgValue(null, ID_NAMES), "");
  assert.strictEqual(deploy.getArgValue(["-i", "X"], []), "");
  assert.strictEqual(deploy.getArgValue(["-i", "X"], null), "");
  console.log("   ✓ 空值輸入驗證通過！\n");
}

console.log("6. 同名旗標重複出現時應取最先符合者...");
{
  assert.strictEqual(deploy.getArgValue(["-i", "FIRST", "-i", "SECOND"], ID_NAMES), "FIRST");
  assert.strictEqual(deploy.getArgValue(["--deployment-id=INLINE", "-i", "OTHER"], ID_NAMES), "INLINE");
  console.log("   ✓ 重複參數驗證通過！\n");
}

console.log("7. 部分相符的參數名稱不應誤判...");
{
  assert.strictEqual(deploy.getArgValue(["-idx", "WRONG"], ID_NAMES), "");
  assert.strictEqual(deploy.getArgValue(["--deployment-id-extra", "WRONG"], ID_NAMES), "");
  assert.strictEqual(deploy.getArgValue(["prefix-i", "WRONG"], ID_NAMES), "");
  console.log("   ✓ 名稱邊界驗證通過！\n");
}

console.log("8. 不同名稱集合應各自比對，不互相干擾...");
{
  const argv = ["-i", "DEP-9", "-d", "第九版"];
  assert.strictEqual(deploy.getArgValue(argv, ID_NAMES), "DEP-9");
  assert.strictEqual(deploy.getArgValue(argv, DESCRIPTION_NAMES), "第九版");
  console.log("   ✓ 名稱集合驗證通過！\n");
}

console.log("✓ scripts/deploy.js::getArgValue 測試全數通過！\n");
