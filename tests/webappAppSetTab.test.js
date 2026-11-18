"use strict";

/**
 * webapp/js/app.js setTab 單元測試（G5.4）。
 */

const assert = require("assert");
const appModule = require("../webapp/js/app.js");
const createDeps = require("./helpers/appControllerDeps.js").createDeps;

console.log("開始執行 webapp/js/app.js setTab 測試...\n");

function run() {
  const ctx = createDeps();
  const app = appModule.createAppController(ctx.deps);

  app.setTab("overview");
  assert.strictEqual(ctx.state.tab, "overview");
  assert.strictEqual(ctx.calls.fetchList, 0);
  assert.strictEqual(ctx.calls.loadSettingsAndAccounts, 0);

  app.setTab("import");
  assert.strictEqual(ctx.calls.fetchList, 0);
  assert.strictEqual(ctx.calls.loadSettingsAndAccounts, 0);

  app.setTab("courses");
  assert.strictEqual(ctx.calls.fetchList, 1);

  app.setTab("settings");
  assert.strictEqual(ctx.calls.loadSettingsAndAccounts, 1);
  console.log("1. 分頁狀態與按需載入正確 ✓\n");

  app.setTab("courses");
  app.setTab("settings");
  assert.strictEqual(ctx.calls.fetchList, 2);
  assert.strictEqual(ctx.calls.loadSettingsAndAccounts, 2);
  console.log("2. 重複切換分頁可再次觸發載入 ✓\n");

  const missing = createDeps();
  missing.MEA.courses = null;
  missing.MEA.accounts = {};
  const missingApp = appModule.createAppController(missing.deps);
  assert.doesNotThrow(function () {
    missingApp.setTab("courses");
    missingApp.setTab("settings");
  });
  console.log("3. 缺少載入模組時不拋錯 ✓\n");

  console.log("✓ webapp/js/app.js setTab 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
