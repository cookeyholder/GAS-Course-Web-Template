"use strict";

/**
 * webapp/js/auth.js::buildAccountChooserUrl 單元測試（G6.7）。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");

console.log("開始執行 webapp/js/auth.js buildAccountChooserUrl 測試...\n");

function run() {
  assert.strictEqual(typeof authModule.buildAccountChooserUrl, "function", "應匯出純函式");
  assert.strictEqual(authModule.constants.GOOGLE_ACCOUNT_CHOOSER_URL, "https://accounts.google.com/AccountChooser");
  console.log("1. 匯出與常數檢查 ✓\n");

  const cases = [
    { webAppUrl: "", allowedDomain: "", expected: "" },
    { webAppUrl: "   ", allowedDomain: "example.edu.tw", expected: "" },
    { webAppUrl: null, allowedDomain: "", expected: "" },
    {
      webAppUrl: "https://gas.test/app",
      allowedDomain: "",
      expected: "https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fgas.test%2Fapp%3Fswitch%3D1"
    },
    {
      webAppUrl: " https://gas.test/app ",
      allowedDomain: " @example.edu.tw ",
      expected:
        "https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fgas.test%2Fapp%3Fswitch%3D1&hd=example.edu.tw"
    },
    {
      webAppUrl: "https://gas.test/app?a=1",
      allowedDomain: "example.edu.tw",
      expected:
        "https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fgas.test%2Fapp%3Fa%3D1%26switch%3D1&hd=example.edu.tw"
    }
  ];
  cases.forEach(function (item) {
    assert.strictEqual(authModule.buildAccountChooserUrl(item.webAppUrl, item.allowedDomain), item.expected);
  });
  console.log("2. 各種網址與網域組合輸出符合預期 ✓\n");

  const encoded = authModule.buildAccountChooserUrl("https://gas.test/a b?x=1&y=2", "");
  assert(encoded.indexOf("continue=https%3A%2F%2Fgas.test%2Fa%20b%3Fx%3D1%26y%3D2") !== -1);
  assert.strictEqual(encoded.indexOf("&hd="), -1);
  console.log("3. 特殊字元正確跳脫且不產生空網域參數 ✓\n");

  assert.strictEqual(
    authModule.buildChooserContinueUrl("https://gas.test/app#section"),
    "https://gas.test/app#section?switch=1"
  );
  assert.strictEqual(authModule.normalizeAllowedDomain(undefined), "");
  assert.strictEqual(authModule.normalizeAllowedDomain("@@school.edu"), "@school.edu");
  console.log("4. 繼續網址與網域輔助函式邊界案例 ✓\n");

  console.log("✓ webapp/js/auth.js buildAccountChooserUrl 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
