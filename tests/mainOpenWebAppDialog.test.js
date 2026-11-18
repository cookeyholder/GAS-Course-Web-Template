"use strict";

/**
 * openWebAppDialog 單元測試（G3.7）
 * 驗證 Web App 開啟對話框之網址解析、HTML 建構與錯誤處理行為。
 */

const assert = require("assert");
const main = require("../main.js");

console.log("開始執行 openWebAppDialog 測試...\n");

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

function makeUiRecorder() {
  const calls = { modal: [], alert: [] };
  const ui = {
    ButtonSet: { OK: "OK" },
    showModalDialog: function (html, title) {
      calls.modal.push({ html: html, title: title });
    },
    alert: function (title, message, buttonSet) {
      calls.alert.push({ title: title, message: message, buttonSet: buttonSet });
    }
  };
  return { ui: ui, calls: calls };
}

function makeHtmlServiceRecorder() {
  const calls = [];
  const HtmlService = {
    createHtmlOutput: function (content) {
      const out = {
        _content: content,
        _width: null,
        _height: null,
        setWidth: function (w) {
          out._width = w;
          return out;
        },
        setHeight: function (h) {
          out._height = h;
          return out;
        }
      };
      calls.push(out);
      return out;
    }
  };
  return { HtmlService: HtmlService, calls: calls };
}

console.log("1. 取得有效 Web App URL 時應顯示開啟連結並彈出對話框...");
{
  const { ui, calls } = makeUiRecorder();
  const { HtmlService, calls: htmlCalls } = makeHtmlServiceRecorder();
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  const ScriptApp = {
    getService: function () {
      return {
        getUrl: function () {
          return "https://script.google.com/macros/s/abc/exec";
        }
      };
    }
  };

  withGlobals({ SpreadsheetApp: SpreadsheetApp, ScriptApp: ScriptApp, HtmlService: HtmlService }, function () {
    main.openWebAppDialog();
  });

  assert.strictEqual(calls.alert.length, 0);
  assert.strictEqual(calls.modal.length, 1);
  assert.strictEqual(calls.modal[0].title, "開啟 Web App");
  assert.strictEqual(htmlCalls.length, 1);
  assert.strictEqual(htmlCalls[0]._width, 460);
  assert.strictEqual(htmlCalls[0]._height, 240);
  const content = htmlCalls[0]._content;
  assert(content.indexOf("Google Apps Script 應用程式 Web App") !== -1);
  assert(content.indexOf('href="https://script.google.com/macros/s/abc/exec"') !== -1);
  assert(content.indexOf('target="_blank"') !== -1);
  assert(content.indexOf(">開啟 Web App 網頁</a>") !== -1);
  assert(content.indexOf("尚未部署 Web App") === -1);
  assert(content.indexOf("完整網址：<br>https://script.google.com/macros/s/abc/exec") !== -1);
  console.log("   ✓ 有效 URL 對話框驗證通過！\n");
}

console.log("2. ScriptApp 未定義或無法取得 URL 時應顯示未部署提示...");
{
  const fallback = "尚未部署 Web App，請先使用 clasp deploy 或於 Apps Script 編輯器發布網頁應用程式";
  const { ui, calls } = makeUiRecorder();
  const { HtmlService, calls: htmlCalls } = makeHtmlServiceRecorder();
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };

  withGlobals({ SpreadsheetApp: SpreadsheetApp, ScriptApp: undefined, HtmlService: HtmlService }, function () {
    main.openWebAppDialog();
  });

  assert.strictEqual(calls.alert.length, 0);
  assert.strictEqual(calls.modal.length, 1);
  const content = htmlCalls[0]._content;
  assert(content.indexOf(fallback) !== -1);
  assert(content.indexOf("<a href=") === -1);
  assert(content.indexOf("background:#fef2f2") !== -1);
  console.log("   ✓ 未部署提示驗證通過！\n");
}

console.log("3. ScriptApp.getUrl 回傳空字串時應顯示未部署提示...");
{
  const { ui, calls } = makeUiRecorder();
  const { HtmlService, calls: htmlCalls } = makeHtmlServiceRecorder();
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  const ScriptApp = {
    getService: function () {
      return {
        getUrl: function () {
          return "";
        }
      };
    }
  };

  withGlobals({ SpreadsheetApp: SpreadsheetApp, ScriptApp: ScriptApp, HtmlService: HtmlService }, function () {
    main.openWebAppDialog();
  });

  assert.strictEqual(calls.alert.length, 0);
  assert.strictEqual(calls.modal.length, 1);
  assert(htmlCalls[0]._content.indexOf("尚未部署 Web App") !== -1);
  console.log("   ✓ 空 URL 提示驗證通過！\n");
}

console.log("4. ScriptApp 無 getService 時應顯示未部署提示...");
{
  const { ui, calls } = makeUiRecorder();
  const { HtmlService, calls: htmlCalls } = makeHtmlServiceRecorder();
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  const ScriptApp = {};

  withGlobals({ SpreadsheetApp: SpreadsheetApp, ScriptApp: ScriptApp, HtmlService: HtmlService }, function () {
    main.openWebAppDialog();
  });

  assert.strictEqual(calls.modal.length, 1);
  assert(htmlCalls[0]._content.indexOf("尚未部署 Web App") !== -1);
  console.log("   ✓ 無 getService 提示驗證通過！\n");
}

console.log("5. 建構或顯示對話框拋出例外時應顯示失敗警示...");
{
  const { ui, calls } = makeUiRecorder();
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  const ScriptApp = {
    getService: function () {
      return {
        getUrl: function () {
          return "https://example.com";
        }
      };
    }
  };
  const HtmlService = {
    createHtmlOutput: function () {
      throw new Error("boom");
    }
  };

  withGlobals({ SpreadsheetApp: SpreadsheetApp, ScriptApp: ScriptApp, HtmlService: HtmlService }, function () {
    main.openWebAppDialog();
  });

  assert.strictEqual(calls.modal.length, 0);
  assert.strictEqual(calls.alert.length, 1);
  assert.strictEqual(calls.alert[0].title, "開啟失敗");
  assert(calls.alert[0].message.indexOf("無法取得 Web App 連結：boom") !== -1);
  assert.strictEqual(calls.alert[0].buttonSet, "OK");
  console.log("   ✓ 例外警示驗證通過！\n");
}

console.log("6. getUrl 拋出例外時應顯示失敗警示...");
{
  const { ui, calls } = makeUiRecorder();
  const SpreadsheetApp = {
    getUi: function () {
      return ui;
    }
  };
  const ScriptApp = {
    getService: function () {
      return {
        getUrl: function () {
          throw new Error("url fail");
        }
      };
    }
  };
  const { HtmlService } = makeHtmlServiceRecorder();

  withGlobals({ SpreadsheetApp: SpreadsheetApp, ScriptApp: ScriptApp, HtmlService: HtmlService }, function () {
    main.openWebAppDialog();
  });

  assert.strictEqual(calls.modal.length, 0);
  assert.strictEqual(calls.alert.length, 1);
  assert(calls.alert[0].message.indexOf("無法取得 Web App 連結：url fail") !== -1);
  console.log("   ✓ getUrl 例外驗證通過！\n");
}

console.log("✓ openWebAppDialog 測試全數通過！\n");
