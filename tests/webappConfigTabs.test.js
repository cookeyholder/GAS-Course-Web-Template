"use strict";

/**
 * webappConfigTabs.test.js（task 5.1）
 * 驗證操作日誌頁籤定義存在、具備僅管理員可見旗標，且不影響既有頁籤。
 */

const assert = require("assert");
const configModule = require("../webapp/js/config.js");

console.log("開始執行 webappConfigTabs 測試...\n");

function baseEnv() {
  return {
    search: "",
    protocol: "http:",
    hostname: "localhost",
    href: "http://localhost/index.html",
    gasWebappUrl: ""
  };
}

console.log("1. 操作日誌頁籤應存在於頁籤清單...");
{
  const tabs = configModule.buildFrontendConfig(baseEnv()).tabs;
  const activityTab = tabs.find(function (tab) {
    return tab.id === "activityLog";
  });
  assert(activityTab, "應包含 id 為 activityLog 的頁籤");
  assert.strictEqual(activityTab.name, "操作日誌");
  assert(typeof activityTab.icon === "string" && activityTab.icon.length > 0);
  assert(typeof activityTab.desc === "string" && activityTab.desc.length > 0);
  console.log("   ✓ 頁籤存在驗證通過！\n");
}

console.log("2. 操作日誌頁籤應標記僅管理員可見...");
{
  const tabs = configModule.buildFrontendConfig(baseEnv()).tabs;
  const activityTab = tabs.find(function (tab) {
    return tab.id === "activityLog";
  });
  assert.strictEqual(activityTab.adminOnly, true, "adminOnly 旗標應為 true");
  console.log("   ✓ 管理員旗標驗證通過！\n");
}

console.log("3. 既有頁籤不得標記為管理員專屬...");
{
  const tabs = configModule.buildFrontendConfig(baseEnv()).tabs;
  ["overview", "import", "courses", "settings"].forEach(function (id) {
    const tab = tabs.find(function (item) {
      return item.id === id;
    });
    assert(tab, "既有頁籤 " + id + " 應存在");
    assert.notStrictEqual(tab.adminOnly, true, id + " 不得為管理員專屬");
  });
  console.log("   ✓ 既有頁籤驗證通過！\n");
}

console.log("✓ webappConfigTabs.test.js 測試全數通過！\n");
