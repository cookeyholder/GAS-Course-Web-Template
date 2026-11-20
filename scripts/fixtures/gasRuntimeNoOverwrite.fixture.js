"use strict";

/**
 * gasRuntimeNoOverwrite.fixture.js（task 1.2）
 *
 * 紅燈 fixture：先定義與後端匯出同名的全域函式，再載入 webApi.js，
 * 證明目前 gasRuntime.injectGlobals_ 會無條件覆寫既有全域。
 *
 * 此檔刻意不以 `.test.js` 結尾且置於 `scripts/fixtures/`，
 * 故 `scripts/run-tests.js`（只探索 `tests/**\/*.test.js`）不會執行它，
 * 1.2 完成至 3.3 完成期間 `npm test` 保持全綠。
 * 3.3 完成後將本案例搬入 `tests/gasRuntime.test.js` 並反轉為「不覆寫」綠燈斷言。
 */

const assert = require("assert");
const path = require("path");

const root = path.resolve(__dirname, "../..");
const sentinel = function () {
  return "SENTINEL";
};

globalThis.normalizeRole = sentinel;
assert.strictEqual(globalThis.normalizeRole, sentinel, "載入 webApi.js 前，同名全域應為測試 sentinel");

require(path.join(root, "webApi.js"));

const expectedFromBackend = require(path.join(root, "databaseInitializer.js")).normalizeRole;
assert.notStrictEqual(
  globalThis.normalizeRole,
  sentinel,
  "重構前的缺陷：injectGlobals_ 應覆寫同名全域，使 sentinel 被替換"
);
assert.strictEqual(
  globalThis.normalizeRole,
  expectedFromBackend,
  "覆寫後的全域值應來自 databaseInitializer.normalizeRole"
);

console.log("已確認缺陷：injectGlobals_ 目前會覆寫同名的既有全域函式。");
console.log("3.3 完成後，本案例應搬入 tests/gasRuntime.test.js 並反轉為「不覆寫」綠燈斷言。\n");
