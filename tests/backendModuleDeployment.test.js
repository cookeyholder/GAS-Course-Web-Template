"use strict";

/**
 * backendModuleDeployment.test.js（task 4.4）
 *
 * 驗證拆分後的新後端模組可隨 clasp push 部署至 GAS：
 * - .claspignore 未排除根目錄 *.js（含 activityLogQuery.js／activityLogInterceptor.js），
 *   且排除規則僅限 Node 工具鏈專用模組與語言報告構件
 * - 兩模組同時支援 Node module.exports 與 GAS globalThis 掛載
 * - GAS 全域環境（無 require、module）下仍可掛載並取得 API
 * - webApi facade 解析邏輯可從 globalThis 取得兩模組（不到處 require）
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

console.log("開始執行後端模組部署相容測試...\n");

const ROOT = path.join(__dirname, "..");

console.log("1. .claspignore 應允許根 *.js 上傳且不排除新模組...\n");
{
  const ignore = fs.readFileSync(path.join(ROOT, ".claspignore"), "utf8");
  const lines = ignore
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(function (line) {
      return line && line.charAt(0) !== "#";
    });
  assert(lines.indexOf("!*.js") !== -1, "應以 !*.js 允許根目錄 JS 上傳");
  // 僅允許排除 Node 工具鏈專用模組與語言報告構件，後端根目錄 JS 仍須全部上傳。
  const allowedExclusions = ["quality-core/", "scripts/opencc*.js", "artifacts/"];
  const exclusions = lines.filter(function (line) {
    return line.charAt(0) !== "!" && line !== "**";
  });
  assert.deepStrictEqual(
    exclusions.slice().sort(),
    allowedExclusions.slice().sort(),
    "排除規則應僅限 Node 工具鏈與報告構件：\n" + exclusions.join("\n")
  );
  ["activityLogQuery.js", "activityLogInterceptor.js"].forEach(function (name) {
    assert(fs.existsSync(path.join(ROOT, name)), name + " 應存在於根目錄");
  });
  console.log("   ✓ .claspignore 部署規則驗證通過！\n");
}

console.log("2. Node 環境應由 module.exports 匯出兩模組 API...\n");
{
  const query = require("../activityLogQuery.js");
  const interceptor = require("../activityLogInterceptor.js");
  assert.strictEqual(typeof query.createActivityLogQuery, "function");
  assert.strictEqual(typeof interceptor.createActivityLogInterceptor, "function");
  console.log("   ✓ Node 匯出驗證通過！\n");
}

console.log("3. GAS 全域環境（無 require/module）應掛載兩模組 API...\n");
{
  ["activityLogQuery.js", "activityLogInterceptor.js"].forEach(function (name) {
    const source = fs.readFileSync(path.join(ROOT, name), "utf8");
    const gasSandbox = { console: console };
    gasSandbox.globalThis = gasSandbox;
    vm.createContext(gasSandbox);
    vm.runInContext(source, gasSandbox, { filename: name });
    const key = name === "activityLogQuery.js" ? "activityLogQuery" : "activityLogInterceptor";
    assert(gasSandbox.globalThis[key], name + " 應掛載 globalThis." + key);
    assert(gasSandbox.globalThis.MEA[key], name + " 應掛載 globalThis.MEA." + key);
    const factoryName = name === "activityLogQuery.js" ? "createActivityLogQuery" : "createActivityLogInterceptor";
    assert.strictEqual(typeof gasSandbox.globalThis[key][factoryName], "function");
  });
  console.log("   ✓ GAS 全域掛載驗證通過！\n");
}

console.log("4. webApi 解析邏輯應優先取用 globalThis 模組...\n");
{
  const webApiSource = fs.readFileSync(path.join(ROOT, "webApi.js"), "utf8");
  assert(
    /globalThis\.activityLogQuery\s*\n?\s*\?\s*globalThis\.activityLogQuery/.test(webApiSource),
    "webApi 應從 globalThis.activityLogQuery 解析模組"
  );
  assert(
    /globalThis\.activityLogInterceptor\s*\n?\s*\?\s*globalThis\.activityLogInterceptor/.test(webApiSource),
    "webApi 應從 globalThis.activityLogInterceptor 解析模組"
  );
  // require 僅為 Node 環境備援，必須在 globalThis 檢查之後（GAS 優先）。
  ["activityLogQuery.js", "activityLogInterceptor.js"].forEach(function (name) {
    const globalIdx = webApiSource.indexOf("globalThis." + name.replace(".js", ""));
    const requireIdx = webApiSource.indexOf('require("./' + name + '")');
    assert(globalIdx !== -1 && requireIdx !== -1, name + " 應同時有 globalThis 與 require 解析路徑");
    assert(globalIdx < requireIdx, name + " 應優先取用 globalThis，require 僅作 Node 備援");
  });
  console.log("   ✓ facade 解析驗證通過！\n");
}

console.log("✓ backendModuleDeployment.test.js 測試全數通過！\n");
