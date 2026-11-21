/**
 * @file systemConfigCodec.test.js
 * @description 系統設定與白名單純編解碼器單元測試（100% 零 Mock 純運算測試）
 */
"use strict";

const assert = require("assert");
const codec = require("../systemConfigCodec.js");

console.log("開始執行 systemConfigCodec 單元測試...\n");

// ----------------------------------------------------------------------------
// 1. 模組骨架與基本函式匯出
// ----------------------------------------------------------------------------
console.log("1. 模組骨架與基本函式匯出驗證...");
assert.strictEqual(typeof codec, "object", "應匯出物件");
assert.strictEqual(typeof codec.normalizeSystemSettings, "function", "應匯出 normalizeSystemSettings");
assert.strictEqual(typeof codec.parseSystemSettingsRows, "function", "應匯出 parseSystemSettingsRows");
assert.strictEqual(typeof codec.mergeSystemSettingsRows, "function", "應匯出 mergeSystemSettingsRows");
assert.strictEqual(typeof codec.normalizeWhitelistAccount, "function", "應匯出 normalizeWhitelistAccount");
assert.strictEqual(typeof codec.parseWhitelistRows, "function", "應匯出 parseWhitelistRows");
assert.strictEqual(typeof codec.serializeWhitelistRows, "function", "應匯出 serializeWhitelistRows");
console.log("   ✓ 模組匯出驗證通過！\n");

// ----------------------------------------------------------------------------
// 2. 布林值嚴格解析與網域正規化
// ----------------------------------------------------------------------------
console.log("2. 布林值嚴格解析與網域正規化...");
assert.strictEqual(codec.parseConfigBoolean(true), true);
assert.strictEqual(codec.parseConfigBoolean("true"), true);
assert.strictEqual(codec.parseConfigBoolean("TRUE"), true);
assert.strictEqual(codec.parseConfigBoolean("1"), true);
assert.strictEqual(codec.parseConfigBoolean(1), true);
assert.strictEqual(codec.parseConfigBoolean("yes"), true);
assert.strictEqual(codec.parseConfigBoolean("是"), true);
assert.strictEqual(codec.parseConfigBoolean("啟用"), true);

assert.strictEqual(codec.parseConfigBoolean(false), false);
assert.strictEqual(codec.parseConfigBoolean("false"), false);
assert.strictEqual(codec.parseConfigBoolean("FALSE"), false);
assert.strictEqual(codec.parseConfigBoolean("0"), false);
assert.strictEqual(codec.parseConfigBoolean(0), false);
assert.strictEqual(codec.parseConfigBoolean("否"), false);
assert.strictEqual(codec.parseConfigBoolean("停用"), false);
assert.strictEqual(codec.parseConfigBoolean(null), false);
assert.strictEqual(codec.parseConfigBoolean(undefined), false);
assert.strictEqual(codec.parseConfigBoolean(""), false);

assert.strictEqual(codec.normalizeAllowedDomain("@example.com"), "example.com");
assert.strictEqual(codec.normalizeAllowedDomain("  @EXAMPLE.COM  "), "example.com");
assert.strictEqual(codec.normalizeAllowedDomain("school.edu.tw"), "school.edu.tw");
assert.strictEqual(codec.normalizeAllowedDomain(null), "");
console.log("   ✓ 布林值與網域正規化驗證通過！\n");

// ----------------------------------------------------------------------------
// 3. 系統設定純正規化與雙軌鍵值
// ----------------------------------------------------------------------------
console.log("3. 系統設定雙軌鍵值與預設值補齊...");
const emptySettings = codec.normalizeSystemSettings({});
assert.strictEqual(emptySettings.schoolYear, "114");
assert.strictEqual(emptySettings["學年度"], "114");
assert.strictEqual(emptySettings.semester, "1");
assert.strictEqual(emptySettings["學期"], "1");
assert.strictEqual(emptySettings.systemName, "Google Apps Script 應用程式範本");
assert.strictEqual(emptySettings["系統名稱"], "Google Apps Script 應用程式範本");
assert.strictEqual(emptySettings.restrictWhitelist, true);
assert.strictEqual(emptySettings["登入白名單限制啟用"], "true");

const customSettings = codec.normalizeSystemSettings({
  學年度: "115",
  學期: "2",
  系統名稱: "自訂管理系統",
  "OAuth Client ID": "client-123",
  "OAuth Client Secret": "secret-456",
  "Google 登入允許網域": "@school.edu",
  登入白名單限制啟用: "false",
  未知自訂欄位: "自訂數值"
});
assert.strictEqual(customSettings.schoolYear, "115");
assert.strictEqual(customSettings["學年度"], "115");
assert.strictEqual(customSettings.semester, "2");
assert.strictEqual(customSettings["學期"], "2");
assert.strictEqual(customSettings.clientId, "client-123");
assert.strictEqual(customSettings["OAuth Client ID"], "client-123");
assert.strictEqual(customSettings.clientSecret, "secret-456");
assert.strictEqual(customSettings["OAuth Client Secret"], "secret-456");
assert.strictEqual(customSettings.allowedLoginDomain, "school.edu");
assert.strictEqual(customSettings["Google 登入允許網域"], "school.edu");
assert.strictEqual(customSettings.restrictWhitelist, false);
assert.strictEqual(customSettings["登入白名單限制啟用"], "false");
assert.strictEqual(customSettings["未知自訂欄位"], "自訂數值", "自訂未知鍵名必須保留");
console.log("   ✓ 雙軌鍵值與預設值補齊驗證通過！\n");

// ----------------------------------------------------------------------------
// 4. 解析 A:B 二維矩陣（自動辨識首列表頭與空行過濾）
// ----------------------------------------------------------------------------
console.log("4. 解析 A:B 二維矩陣...");
const matrixWithHeader = [
  ["設定項目", "設定數值"],
  ["系統名稱", "測試系統 A"],
  ["學年度", "113"],
  ["", ""], // 空行應忽略
  ["自訂鍵", "自訂值"]
];
const parsedFromHeader = codec.parseSystemSettingsRows(matrixWithHeader);
assert.strictEqual(parsedFromHeader.systemName, "測試系統 A");
assert.strictEqual(parsedFromHeader.schoolYear, "113");
assert.strictEqual(parsedFromHeader["自訂鍵"], "自訂值");
assert.strictEqual(parsedFromHeader.semester, "1", "未定義項取預設");

// 無表頭二維矩陣
const matrixWithoutHeader = [
  ["系統名稱", "無表頭系統"],
  ["學年度", "112"]
];
const parsedNoHeader = codec.parseSystemSettingsRows(matrixWithoutHeader);
assert.strictEqual(parsedNoHeader.systemName, "無表頭系統");
assert.strictEqual(parsedNoHeader.schoolYear, "112");
console.log("   ✓ 二維矩陣解析驗證通過！\n");

// ----------------------------------------------------------------------------
// 5. 不可變合併運算與幽靈列空白填補
// ----------------------------------------------------------------------------
console.log("5. 不可變合併運算與防幽靈殘留列空白填補...");
const existingRows = [
  ["系統名稱", "舊系統名稱"],
  ["學年度", "113"],
  ["學期", "1"],
  ["", ""] // 既有空白槽位
];
const updates = {
  schoolYear: "114", // 駝峰鍵更新既有項
  allowedLoginDomain: "@newdomain.com", // 駝峰鍵新增差集項
  未知自訂項: "新自訂值" // 中文自訂鍵
};

// 複製一份 updates 用於檢查是否被變異
const updatesSnapshot = JSON.parse(JSON.stringify(updates));
const existingSnapshot = JSON.parse(JSON.stringify(existingRows));

const mergedRows = codec.mergeSystemSettingsRows(existingRows, updates, { targetRowCount: 29 });

// 驗證不可變性：輸入物件完全未被 delete 或修改
assert.deepStrictEqual(updates, updatesSnapshot, "updates 物件絕對不可被 delete 變異！");
assert.deepStrictEqual(existingRows, existingSnapshot, "existingRows 陣列絕對不可被就地修改！");

// 驗證合併內容
assert.strictEqual(mergedRows[0][0], "系統名稱");
assert.strictEqual(mergedRows[0][1], "舊系統名稱", "未更動項保留原值");

assert.strictEqual(mergedRows[1][0], "學年度");
assert.strictEqual(mergedRows[1][1], "114", "既有項正確更新值");

// 驗證差集追加
const mergedDict = {};
mergedRows.forEach((r) => {
  if (r[0]) mergedDict[r[0]] = r[1];
});
assert.strictEqual(mergedDict["Google 登入允許網域"], "newdomain.com", "駝峰鍵轉中文並正規化");
assert.strictEqual(mergedDict["未知自訂項"], "新自訂值");

// 驗證長度補齊至 29 列（杜絕 Ghost Rows 殘留）
assert.strictEqual(mergedRows.length, 29, "應補齊至 29 列防幽靈殘留");
assert.strictEqual(mergedRows[28][0], "");
assert.strictEqual(mergedRows[28][1], "");

// 若有效項目超過目標長度，應動態延伸而非截斷
const hugeUpdates = {};
for (let i = 0; i < 35; i++) {
  hugeUpdates["自訂鍵_" + i] = "值_" + i;
}
const hugeMerged = codec.mergeSystemSettingsRows([], hugeUpdates, { targetRowCount: 29 });
assert.strictEqual(hugeMerged.length, 35, "超過 29 項時動態延展");
console.log("   ✓ 不可變合併與空白填補驗證通過！\n");

console.log("=== systemConfigCodec Task 1.1 單元測試全數通過！ ===");
