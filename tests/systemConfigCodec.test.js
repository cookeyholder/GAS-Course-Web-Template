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
assert.strictEqual(codec.systemConfigCodec, codec, "應掛載自體屬性 systemConfigCodec");
assert.strictEqual(typeof codec.normalizeSystemSettingValue, "function", "應匯出 normalizeSystemSettingValue");
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
assert.strictEqual(emptySettings.semester, "1");
assert.strictEqual(emptySettings.systemName, "Google Apps Script 應用程式範本");
assert.strictEqual(emptySettings.restrictWhitelist, false);
assert.strictEqual(emptySettings.allowedLoginDomain, "");
assert.strictEqual(emptySettings["學年度"], undefined, "未傳入中文鍵時，實體鍵為 undefined");

const populatedWithDefaults = codec.normalizeSystemSettings(Object.assign({}, codec.DEFAULT_SETTINGS));
assert.strictEqual(populatedWithDefaults["學年度"], "114");
assert.strictEqual(populatedWithDefaults.schoolYear, "114");
assert.strictEqual(populatedWithDefaults["系統名稱"], "Google Apps Script 應用程式範本");
assert.strictEqual(populatedWithDefaults.systemName, "Google Apps Script 應用程式範本");

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
assert.strictEqual(customSettings["Google 登入允許網域"], "@school.edu");
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

// ----------------------------------------------------------------------------
// 6. 白名單帳號物件純正規化 (normalizeWhitelistAccount)
// ----------------------------------------------------------------------------
console.log("6. 白名單帳號物件純正規化...");
const validAdmin = codec.normalizeWhitelistAccount({
  email: "  ADMIN@Example.COM ",
  name: "管理員小明",
  role: "admin",
  enabled: true
});
assert.deepStrictEqual(validAdmin, {
  email: "admin@example.com",
  name: "管理員小明",
  role: "admin",
  roleName: "系統管理員",
  enabled: true
});

// 中文角色名稱對照與預設 enabled
const staffAccount = codec.normalizeWhitelistAccount({
  email: "Staff@School.edu.tw",
  name: "王組長",
  role: "業務人員"
});
assert.strictEqual(staffAccount.email, "staff@school.edu.tw");
assert.strictEqual(staffAccount.role, "staff");
assert.strictEqual(staffAccount.roleName, "業務人員");
assert.strictEqual(staffAccount.enabled, true, "未指定 enabled 應預設為 true");

// 支援寬容啟動字串（如 "TRUE"、"yes"、"是"、"啟用"）
const enabledAccount = codec.normalizeWhitelistAccount({
  email: "enable@test.com",
  enabled: "TRUE"
});
assert.strictEqual(enabledAccount.enabled, true, "字串 TRUE 應解析為 true");

// 停用狀態解析（字串 false, 否, 數字 0）
const disabled1 = codec.normalizeWhitelistAccount({
  email: "user1@test.com",
  enabled: false
});
assert.strictEqual(disabled1.enabled, false);

const disabled2 = codec.normalizeWhitelistAccount({
  email: "user2@test.com",
  enabled: "false"
});
assert.strictEqual(disabled2.enabled, false);

const disabled3 = codec.normalizeWhitelistAccount({
  email: "user3@test.com",
  enabled: 0
});
assert.strictEqual(disabled3.enabled, false);

// 無效帳號回傳 null
assert.strictEqual(codec.normalizeWhitelistAccount(null), null);
assert.strictEqual(codec.normalizeWhitelistAccount({}), null);
assert.strictEqual(codec.normalizeWhitelistAccount({ email: "   " }), null);
console.log("   ✓ 白名單帳號正規化驗證通過！\n");

// ----------------------------------------------------------------------------
// 7. 解析 D:G 二維白名單矩陣 (parseWhitelistRows)
// ----------------------------------------------------------------------------
console.log("7. 解析 D:G 二維白名單矩陣...");
const whitelistSheetMatrix = [
  ["Email", "姓名/職稱", "角色", "啟用狀態"], // 表頭應略過
  ["admin@school.edu", "校長", "系統管理員", "是"],
  ["", "", "", ""], // 空行應略過
  ["staff@school.edu", "主任", "業務人員", "是"],
  ["viewer@school.edu", "工友", "檢視人員", "否"]
];
const parsedWhitelist = codec.parseWhitelistRows(whitelistSheetMatrix);
assert.strictEqual(parsedWhitelist.length, 3);
assert.deepStrictEqual(parsedWhitelist[0], {
  email: "admin@school.edu",
  name: "校長",
  role: "admin",
  roleName: "系統管理員",
  enabled: true
});
assert.deepStrictEqual(parsedWhitelist[1], {
  email: "staff@school.edu",
  name: "主任",
  role: "staff",
  roleName: "業務人員",
  enabled: true
});
assert.deepStrictEqual(parsedWhitelist[2], {
  email: "viewer@school.edu",
  name: "工友",
  role: "viewer",
  roleName: "檢視人員",
  enabled: false
});

// 無表頭二維矩陣解析
const noHeaderMatrix = [["direct@test.com", "訪客", "viewer", "true"]];
const parsedNoHeaderWhitelist = codec.parseWhitelistRows(noHeaderMatrix);
assert.strictEqual(parsedNoHeaderWhitelist.length, 1);
assert.strictEqual(parsedNoHeaderWhitelist[0].email, "direct@test.com");
assert.strictEqual(parsedNoHeaderWhitelist[0].enabled, true);
console.log("   ✓ D:G 白名單矩陣解析驗證通過！\n");

// ----------------------------------------------------------------------------
// 8. 序列化白名單帳號陣列為 D:G 寫入矩陣 (serializeWhitelistRows)
// ----------------------------------------------------------------------------
console.log("8. 序列化白名單為 D:G 寫入矩陣...");
const accountsToSerialize = [
  { email: "userA@edu.tw", name: "張老師", role: "admin", enabled: true },
  { email: "userB@edu.tw", name: "李老師", role: "staff", enabled: false },
  null, // 無效元素應被過濾
  { email: "  " } // 無 email 應被過濾
];
const serializedRows = codec.serializeWhitelistRows(accountsToSerialize);
assert.strictEqual(serializedRows.length, 2);
assert.deepStrictEqual(serializedRows[0], ["usera@edu.tw", "張老師", "系統管理員", "是"]);
assert.deepStrictEqual(serializedRows[1], ["userb@edu.tw", "李老師", "業務人員", "否"]);
console.log("   ✓ 白名單序列化驗證通過！\n");

// ----------------------------------------------------------------------------
// 9. 極端邊界條件、大小寫變體與防反轉專屬測試 (Task 1.3)
// ----------------------------------------------------------------------------
console.log("9. 極端邊界條件、大小寫變體與防反轉專屬測試...");

// 9.1 null / undefined / 空陣列容錯
const defaultNullParsed = codec.parseSystemSettingsRows(null);
assert.strictEqual(defaultNullParsed.systemName, "Google Apps Script 應用程式範本");
assert.strictEqual(defaultNullParsed.schoolYear, "114");

const emptyMerged = codec.mergeSystemSettingsRows(null, null, { targetRowCount: 5 });
assert.strictEqual(emptyMerged.length, 5);
assert.deepStrictEqual(emptyMerged[0], ["", ""]);

assert.deepStrictEqual(codec.parseWhitelistRows(null), []);
assert.deepStrictEqual(codec.parseWhitelistRows([]), []);
assert.deepStrictEqual(codec.serializeWhitelistRows(null), []);
assert.deepStrictEqual(codec.serializeWhitelistRows([]), []);

// 9.2 多元表頭辨識與非表頭首列保護
const altHeaders = [
  ["設定名稱", "數值"],
  ["自訂鍵A", "值A"]
];
assert.strictEqual(codec.parseSystemSettingsRows(altHeaders)["自訂鍵A"], "值A");

const nonHeaderRows = [
  ["正常設定鍵", "正常值"],
  ["學年度", "115"]
];
const nonHeaderParsed = codec.parseSystemSettingsRows(nonHeaderRows);
assert.strictEqual(nonHeaderParsed["正常設定鍵"], "正常值");
assert.strictEqual(nonHeaderParsed.schoolYear, "115");

const altWhitelistHeaders = [
  ["使用者 Email", "姓名", "角色", "狀態"],
  ["teacher@school.edu", "陳老師", "業務人員", "是"]
];
assert.strictEqual(codec.parseWhitelistRows(altWhitelistHeaders).length, 1);
assert.strictEqual(codec.parseWhitelistRows(altWhitelistHeaders)[0].email, "teacher@school.edu");

// 9.3 角色與網域大小寫變體
assert.strictEqual(codec.normalizeRole("ADMIN"), "admin");
assert.strictEqual(codec.normalizeRole("StAfF"), "staff");
assert.strictEqual(codec.normalizeRole("ViEwEr"), "viewer");
assert.strictEqual(codec.normalizeRole("UNKNOWN_ROLE"), "unknown_role");
assert.strictEqual(codec.getRoleDisplayName("UNKNOWN_ROLE"), "檢視人員");
assert.strictEqual(codec.normalizeAllowedDomain("  @UPPER.CASE.ORG  "), "upper.case.org");

// 9.4 白名單 enabled 防反轉嚴格驗證（字串 "false", "0", 數字 0, "否", "停用"）
const testFalsyInputs = ["false", "FALSE", 0, "0", "否", "停用", false];
testFalsyInputs.forEach((input) => {
  const acc = codec.normalizeWhitelistAccount({
    email: "test@domain.com",
    enabled: input
  });
  assert.strictEqual(acc.enabled, false, `輸入 ${JSON.stringify(input)} 時 enabled 絕不能被誤轉為 true！`);
});

// 9.5 中間含空行與 undefined 之雜亂矩陣過濾並補齊
const messyMatrix = [
  ["設定項目", "數值"],
  ["", ""],
  [null, undefined],
  [],
  ["學年度", "116"],
  ["  ", "   "],
  ["學期", "2"]
];
const cleanMerged = codec.mergeSystemSettingsRows(messyMatrix, {}, { targetRowCount: 10 });
assert.strictEqual(cleanMerged[0][0], "設定項目");
assert.strictEqual(cleanMerged[1][0], "學年度");
assert.strictEqual(cleanMerged[1][1], "116");
assert.strictEqual(cleanMerged[2][0], "學期");
assert.strictEqual(cleanMerged[2][1], "2");
assert.strictEqual(cleanMerged.length, 10, "中間雜亂空列過濾後，依然正確補齊至 10 列");
console.log("   ✓ 極端邊界條件與防反轉驗證通過！\n");

console.log("=== systemConfigCodec 全部單元測試 (Task 1.1 ~ 1.3) 通過！ ===");
