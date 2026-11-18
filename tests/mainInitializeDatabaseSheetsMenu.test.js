"use strict";

/**
 * initializeDatabaseSheetsMenu 單元測試（G3.8）
 * 驗證選單初始化流程之確認、成功與失敗提示行為。
 */

const assert = require("assert");
const main = require("../main.js");

console.log("開始執行 initializeDatabaseSheetsMenu 測試...\n");

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

function makeUi(response) {
  const alerts = [];
  const ui = {
    Button: { YES: "YES", NO: "NO" },
    ButtonSet: { YES_NO: "YES_NO", OK: "OK" },
    alert: function (title, message, buttonSet) {
      alerts.push({ title: title, message: message, buttonSet: buttonSet });
      return response;
    }
  };
  return { ui: ui, alerts: alerts };
}

console.log("1. 使用者取消確認時不應執行初始化...");
{
  const { ui, alerts } = makeUi("NO");
  let initCalled = 0;
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  withGlobals(
    {
      SpreadsheetApp: SpreadsheetApp,
      initializeDatabaseSheets: function () {
        initCalled++;
        return { ok: true, sheets: [] };
      }
    },
    function () {
      main.initializeDatabaseSheetsMenu();
    }
  );
  assert.strictEqual(initCalled, 0);
  assert.strictEqual(alerts.length, 1);
  assert.strictEqual(alerts[0].title, "系統初始化確認");
  assert.strictEqual(alerts[0].buttonSet, "YES_NO");
  assert(alerts[0].message.indexOf("安全冪等性") !== -1);
  console.log("   ✓ 取消流程驗證通過！\n");
}

console.log("2. 使用者確認後初始化成功應顯示完成訊息與工作表清單...");
{
  const { ui, alerts } = makeUi("YES");
  let initArg = null;
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  withGlobals(
    {
      SpreadsheetApp: SpreadsheetApp,
      initializeDatabaseSheets: function (opts) {
        initArg = opts;
        return { ok: true, sheets: ["A", "B", "C"] };
      }
    },
    function () {
      main.initializeDatabaseSheetsMenu();
    }
  );
  assert.deepStrictEqual(initArg, { silent: true });
  assert.strictEqual(alerts.length, 2);
  assert.strictEqual(alerts[1].title, "初始化完成");
  assert.strictEqual(alerts[1].buttonSet, "OK");
  assert(alerts[1].message.indexOf("A、B、C") !== -1);
  console.log("   ✓ 成功流程驗證通過！\n");
}

console.log("3. 初始化結果缺少 sheets 時應安全顯示空清單...");
{
  const { ui, alerts } = makeUi("YES");
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  withGlobals(
    {
      SpreadsheetApp: SpreadsheetApp,
      initializeDatabaseSheets: function () {
        return { ok: true };
      }
    },
    function () {
      main.initializeDatabaseSheetsMenu();
    }
  );
  assert.strictEqual(alerts[1].title, "初始化完成");
  assert(alerts[1].message.indexOf("已檢查／建立工作表：\n") !== -1);
  // 結尾不應出現 undefined
  assert(alerts[1].message.indexOf("undefined") === -1);
  console.log("   ✓ 缺少 sheets 安全顯示驗證通過！\n");
}

console.log("4. 初始化拋出 Error 時應顯示失敗訊息...");
{
  const { ui, alerts } = makeUi("YES");
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  withGlobals(
    {
      SpreadsheetApp: SpreadsheetApp,
      initializeDatabaseSheets: function () {
        throw new Error("db fail");
      }
    },
    function () {
      main.initializeDatabaseSheetsMenu();
    }
  );
  assert.strictEqual(alerts.length, 2);
  assert.strictEqual(alerts[1].title, "初始化失敗");
  assert.strictEqual(alerts[1].buttonSet, "OK");
  assert(alerts[1].message.indexOf("執行失敗：db fail") !== -1);
  console.log("   ✓ Error 失敗訊息驗證通過！\n");
}

console.log("5. 初始化拋出非 Error 值時應顯示失敗訊息...");
{
  const { ui, alerts } = makeUi("YES");
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  withGlobals(
    {
      SpreadsheetApp: SpreadsheetApp,
      initializeDatabaseSheets: function () {
        throw "string-error";
      }
    },
    function () {
      main.initializeDatabaseSheetsMenu();
    }
  );
  assert.strictEqual(alerts[1].title, "初始化失敗");
  assert(alerts[1].message.indexOf("執行失敗：string-error") !== -1);
  console.log("   ✓ 非 Error 失敗訊息驗證通過！\n");
}

console.log("✓ initializeDatabaseSheetsMenu 測試全數通過！\n");
