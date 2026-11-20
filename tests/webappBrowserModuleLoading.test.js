"use strict";

/**
 * webappBrowserModuleLoading.test.js（task 6.4）
 * 以 vm 模擬瀏覽器全域環境載入前端模組，覆蓋「無 require、由 MEA 全域取得共用模組」的分支。
 * 與 Node 測試環境互補，確保同一份原始碼在 GAS HtmlService 內可正確註冊工廠。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const PROJECT_ROOT = path.join(__dirname, "..");
const MODULE_NAMES = ["api.js", "auth.js", "accounts.js", "imports.js", "courses.js", "activityLog.js"];

async function run() {
  console.log("1. 建立瀏覽器全域環境...");
  const MEA = (globalThis.MEA = globalThis.MEA || {});
  MEA.factories = MEA.factories || {};
  MEA.safeErrors = require("../webapp/js/errorMessages.js");
  MEA.moduleHelpers = require("../webapp/js/moduleHelpers.js");
  MEA.config = MEA.config || { roleNames: { admin: "系統管理員", viewer: "檢視人員" } };
  globalThis.gasRuntime = require("../gasRuntime.js");
  globalThis.window = globalThis;
  assert.strictEqual(typeof globalThis.require, "undefined", "瀏覽器環境不應存在 require");
  console.log("   ✓ 全域環境建立通過！\n");

  console.log("2. 以瀏覽器環境載入六個模組並註冊工廠...");
  MODULE_NAMES.forEach(function (name) {
    const file = path.join(PROJECT_ROOT, "webapp", "js", name);
    const source = fs.readFileSync(file, "utf8");
    // 以原始檔案路徑執行，讓 V8 coverage 歸併至同一份原始碼。
    vm.runInThisContext(source, { filename: file });
  });
  assert.strictEqual(typeof MEA.api.call, "function", "api.js 應建立瀏覽器版 API 客戶端");
  ["auth", "accounts", "imports", "courses", "activityLog"].forEach(function (name) {
    assert.strictEqual(typeof MEA.factories[name], "function", name + " 應註冊工廠");
  });
  console.log("   ✓ 模組載入與工廠註冊通過！\n");

  console.log("3. 瀏覽器分支取得的模組轉接層應可正常轉譯錯誤訊息...");
  {
    const message = MEA.moduleHelpers.resolveSafeErrors().resolveSafeMessage({ message: "安全文案" }, "備援");
    assert.strictEqual(message, "安全文案");
    console.log("   ✓ 轉接層驗證通過！\n");
  }

  console.log("✓ 前端模組瀏覽器載入測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
