"use strict";

/**
 * safeUiAlert 單元測試（G3.6）
 * 驗證無 UI 環境防護、警告收集與 SpreadsheetApp UI 提示行為。
 */

const assert = require("assert");
const utils = require("../utilities.js");

console.log("開始執行 safeUiAlert 測試...\n");

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

function withConsoleWarn(stub, fn) {
  const had = Object.prototype.hasOwnProperty.call(console, "warn");
  const prev = console.warn;
  console.warn = stub;
  try {
    return fn();
  } finally {
    if (had) console.warn = prev;
    else delete console.warn;
  }
}

console.log("1. options.warnings 為陣列時應收集訊息並回傳 false（不呼叫 UI）...");
{
  const warnings = [];
  let uiCalled = false;
  const SpreadsheetApp = {
    getUi: function () {
      uiCalled = true;
      return {
        alert: function () {
          uiCalled = true;
        }
      };
    }
  };
  const result = withGlobals({ SpreadsheetApp: SpreadsheetApp }, function () {
    return utils.safeUiAlert("測試訊息", { warnings: warnings });
  });
  assert.strictEqual(result, false);
  assert.deepStrictEqual(warnings, ["測試訊息"]);
  assert.strictEqual(uiCalled, false, "有 warnings 陣列時不應呼叫 UI");
  console.log("   ✓ warnings 收集驗證通過！\n");
}

console.log("2. message 為 null/undefined 時應正規化為空字串...");
{
  const warnings = [];
  utils.safeUiAlert(null, { warnings: warnings });
  utils.safeUiAlert(undefined, { warnings: warnings });
  assert.deepStrictEqual(warnings, ["", ""]);
  console.log("   ✓ 訊息正規化驗證通過！\n");
}

console.log("3. SpreadsheetApp UI 可用時應顯示警示並回傳 true...");
{
  let alerted = null;
  const SpreadsheetApp = {
    getUi: function () {
      return {
        alert: function (msg) {
          alerted = msg;
        }
      };
    }
  };
  const warns = [];
  const result = withConsoleWarn(
    function (msg) {
      warns.push(msg);
    },
    function () {
      return withGlobals({ SpreadsheetApp: SpreadsheetApp }, function () {
        return utils.safeUiAlert("完成", {});
      });
    }
  );
  assert.strictEqual(result, true);
  assert.strictEqual(alerted, "完成");
  assert.deepStrictEqual(warns, []);
  console.log("   ✓ UI 顯示驗證通過！\n");
}

console.log("4. SpreadsheetApp.getUi 拋出例外時應回退為 console.warn 並回傳 false...");
{
  const SpreadsheetApp = {
    getUi: function () {
      throw new Error("no ui");
    }
  };
  const warns = [];
  const result = withConsoleWarn(
    function (msg) {
      warns.push(msg);
    },
    function () {
      return withGlobals({ SpreadsheetApp: SpreadsheetApp }, function () {
        return utils.safeUiAlert("失敗", null);
      });
    }
  );
  assert.strictEqual(result, false);
  assert.deepStrictEqual(warns, ["[safeUiAlert] 失敗"]);
  console.log("   ✓ getUi 例外回退驗證通過！\n");
}

console.log("5. ui.alert 拋出例外時應回退為 console.warn 並回傳 false...");
{
  const SpreadsheetApp = {
    getUi: function () {
      return {
        alert: function () {
          throw new Error("alert fail");
        }
      };
    }
  };
  const warns = [];
  const result = withConsoleWarn(
    function (msg) {
      warns.push(msg);
    },
    function () {
      return withGlobals({ SpreadsheetApp: SpreadsheetApp }, function () {
        return utils.safeUiAlert("警告");
      });
    }
  );
  assert.strictEqual(result, false);
  assert.deepStrictEqual(warns, ["[safeUiAlert] 警告"]);
  console.log("   ✓ alert 例外回退驗證通過！\n");
}

console.log("6. SpreadsheetApp 無 getUi 或未定義時應回退為 console.warn...");
{
  const warns = [];
  const r1 = withConsoleWarn(
    function (msg) {
      warns.push(msg);
    },
    function () {
      return withGlobals({ SpreadsheetApp: {} }, function () {
        return utils.safeUiAlert("A");
      });
    }
  );
  const r2 = withConsoleWarn(
    function (msg) {
      warns.push(msg);
    },
    function () {
      return withGlobals({ SpreadsheetApp: undefined }, function () {
        return utils.safeUiAlert("B");
      });
    }
  );
  assert.strictEqual(r1, false);
  assert.strictEqual(r2, false);
  assert.deepStrictEqual(warns, ["[safeUiAlert] A", "[safeUiAlert] B"]);
  console.log("   ✓ 無 UI 環境回退驗證通過！\n");
}

console.log("7. console.warn 不可用時仍應安全回傳 false...");
{
  const SpreadsheetApp = {};
  const result = withGlobals({ SpreadsheetApp: SpreadsheetApp, console: undefined }, function () {
    return utils.safeUiAlert("C");
  });
  assert.strictEqual(result, false);
  console.log("   ✓ 無 console 安全回退驗證通過！\n");
}

console.log("✓ safeUiAlert 測試全數通過！\n");
