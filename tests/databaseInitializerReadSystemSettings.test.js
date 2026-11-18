"use strict";

/**
 * readSystemSettings 單元測試（G3.5）
 * 驗證系統設定讀取之記憶體/試算表模式、預設值、便利鍵映射與正規化行為。
 */

const assert = require("assert");
const db = require("../databaseInitializer.js");

console.log("開始執行 readSystemSettings 測試...\n");

function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (k) {
    prev[k] = Object.prototype.hasOwnProperty.call(global, k) ? global[k] : undefined;
    if (temp[k] === undefined) delete global[k];
    else global[k] = temp[k];
  });
  try {
    return fn();
  } finally {
    Object.keys(temp).forEach(function (k) {
      if (prev[k] === undefined) delete global[k];
      else global[k] = prev[k];
    });
  }
}

function snapshotMemoryConfig() {
  return withGlobals({ SpreadsheetApp: undefined }, function () {
    const settings = db.readSystemSettings();
    return {
      "學年度": settings["學年度"],
      "學期": settings["學期"],
      "系統名稱": settings["系統名稱"],
      "OAuth Client ID": settings["OAuth Client ID"],
      "OAuth Client Secret": settings["OAuth Client Secret"],
      "登入白名單限制啟用": settings["登入白名單限制啟用"],
      "Google 登入允許網域": settings["Google 登入允許網域"]
    };
  });
}

function restoreMemoryConfig(snapshot) {
  withGlobals({ SpreadsheetApp: undefined }, function () {
    db.saveSystemSettings(snapshot);
  });
}

console.log("1. 記憶體模式（無 ss、無 SpreadsheetApp）應回傳預設值與便利鍵...");
{
  const before = snapshotMemoryConfig();
  try {
    withGlobals({ SpreadsheetApp: undefined }, function () {
      db.saveSystemSettings({
        學年度: "",
        學期: "",
        系統名稱: "",
        "OAuth Client ID": "",
        "OAuth Client Secret": "",
        登入白名單限制啟用: "false",
        "Google 登入允許網域": ""
      });
      const r = db.readSystemSettings();
      assert.strictEqual(r["學年度"], "");
      assert.strictEqual(r.schoolYear, "114");
      assert.strictEqual(r["學期"], "");
      assert.strictEqual(r.semester, "1");
      assert.strictEqual(r["系統名稱"], "");
      assert.strictEqual(r.systemName, "Google Apps Script 應用程式範本");
      assert.strictEqual(r["OAuth Client ID"], "");
      assert.strictEqual(r.clientId, "");
      assert.strictEqual(r["OAuth Client Secret"], "");
      assert.strictEqual(r.clientSecret, "");
      assert.strictEqual(r["登入白名單限制啟用"], "false");
      assert.strictEqual(r.restrictWhitelist, false);
      assert.strictEqual(r["Google 登入允許網域"], "");
      assert.strictEqual(r.allowedLoginDomain, "");
    });
    console.log("   ✓ 記憶體模式預設值驗證通過！\n");
  } finally {
    restoreMemoryConfig(before);
  }
}

console.log("2. 記憶體模式應正規化網域與布林並映射便利鍵...");
{
  const before = snapshotMemoryConfig();
  try {
    withGlobals({ SpreadsheetApp: undefined }, function () {
      db.saveSystemSettings({
        學年度: "113",
        學期: "2",
        系統名稱: "自訂系統",
        "OAuth Client ID": "cid-x",
        "OAuth Client Secret": "sec-x",
        登入白名單限制啟用: "是",
        "Google 登入允許網域": "  @Example.COM  "
      });
      const r = db.readSystemSettings();
      assert.strictEqual(r.schoolYear, "113");
      assert.strictEqual(r.semester, "2");
      assert.strictEqual(r.systemName, "自訂系統");
      assert.strictEqual(r.clientId, "cid-x");
      assert.strictEqual(r.clientSecret, "sec-x");
      assert.strictEqual(r.restrictWhitelist, true);
      assert.strictEqual(r.allowedLoginDomain, "example.com");
    });
    console.log("   ✓ 記憶體模式正規化與映射驗證通過！\n");
  } finally {
    restoreMemoryConfig(before);
  }
}

console.log("3. 無 ss 時應使用 SpreadsheetApp.getActiveSpreadsheet...");
{
  const sheet = {
    getLastRow: function () { return 1; },
    getRange: function () { return { getValues: function () { return [["設定項目", "設定數值"]]; } }; }
  };
  const ss = {
    getSheetByName: function (name) {
      assert.strictEqual(name, db.SHEET_SYSTEM_CONFIG);
      return sheet;
    }
  };
  const r = withGlobals({ SpreadsheetApp: { getActiveSpreadsheet: function () { return ss; } } }, function () {
    return db.readSystemSettings();
  });
  assert.strictEqual(r.schoolYear, "114");
  assert.strictEqual(r.restrictWhitelist, false);
  console.log("   ✓ SpreadsheetApp fallback 驗證通過！\n");
}

console.log("4. 試算表存在但找不到設定工作表時應回傳空物件...");
{
  const ss = { getSheetByName: function () { return null; } };
  assert.deepStrictEqual(db.readSystemSettings(ss), {});
  console.log("   ✓ 缺少設定工作表驗證通過！\n");
}

console.log("5. 試算表模式應讀取鍵值、略過空鍵、修剪值並套用便利鍵/預設/正規化...");
{
  const values = [
    ["設定項目", "設定數值"],
    ["學年度", "115"],
    ["學期", " 2 "],
    ["", "忽略"],
    ["系統名稱", "  測試系統  "],
    ["OAuth Client ID", "  cid  "],
    ["OAuth Client Secret", null],
    ["登入白名單限制啟用", "1"],
    ["Google 登入允許網域", " @School.EDU "],
    ["自訂鍵", "  自訂值  "]
  ];
  const sheet = {
    getLastRow: function () { return values.length; },
    getRange: function (r, c, numRows, numCols) {
      assert.strictEqual(r, 1);
      assert.strictEqual(c, 1);
      assert.strictEqual(numRows, values.length);
      assert.strictEqual(numCols, 2);
      return { getValues: function () { return values; } };
    }
  };
  const ss = { getSheetByName: function () { return sheet; } };
  const r = db.readSystemSettings(ss);
  assert.strictEqual(r["學年度"], "115");
  assert.strictEqual(r.schoolYear, "115");
  assert.strictEqual(r["學期"], "2");
  assert.strictEqual(r.semester, "2");
  assert.strictEqual(r["系統名稱"], "測試系統");
  assert.strictEqual(r.systemName, "測試系統");
  assert.strictEqual(r["OAuth Client ID"], "cid");
  assert.strictEqual(r.clientId, "cid");
  assert.strictEqual(r["OAuth Client Secret"], "");
  assert.strictEqual(r.clientSecret, "");
  assert.strictEqual(r["登入白名單限制啟用"], "1");
  assert.strictEqual(r.restrictWhitelist, true);
  assert.strictEqual(r["Google 登入允許網域"], "@School.EDU");
  assert.strictEqual(r.allowedLoginDomain, "school.edu");
  assert.strictEqual(r["自訂鍵"], "自訂值");
  assert.strictEqual(typeof r[""], "undefined");
  console.log("   ✓ 試算表讀取與正規化驗證通過！\n");
}

console.log("6. 試算表模式缺少欄位時應回填預設便利值...");
{
  const values = [
    ["設定項目", "設定數值"],
    ["學年度", "116"]
  ];
  const sheet = {
    getLastRow: function () { return values.length; },
    getRange: function () { return { getValues: function () { return values; } }; }
  };
  const ss = { getSheetByName: function () { return sheet; } };
  const r = db.readSystemSettings(ss);
  assert.strictEqual(r.schoolYear, "116");
  assert.strictEqual(r.semester, "1");
  assert.strictEqual(r.systemName, "Google Apps Script 應用程式範本");
  assert.strictEqual(r.clientId, "");
  assert.strictEqual(r.clientSecret, "");
  assert.strictEqual(r.allowedLoginDomain, "");
  assert.strictEqual(r.restrictWhitelist, false);
  console.log("   ✓ 缺欄預設值驗證通過！\n");
}

console.log("7. 試算表 lastRow 小於 2 時應安全處理...");
{
  const values = [["設定項目", "設定數值"], ["", ""]];
  const sheet = {
    getLastRow: function () { return 1; },
    getRange: function (r, c, numRows) {
      assert.strictEqual(numRows, 2);
      return { getValues: function () { return values; } };
    }
  };
  const ss = { getSheetByName: function () { return sheet; } };
  const r = db.readSystemSettings(ss);
  assert.strictEqual(r.schoolYear, "114");
  assert.strictEqual(r.restrictWhitelist, false);
  console.log("   ✓ 最小列數安全處理驗證通過！\n");
}

console.log("✓ readSystemSettings 測試全數通過！\n");
