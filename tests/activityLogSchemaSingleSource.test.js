"use strict";

/**
 * activityLogSchemaSingleSource.test.js（task 5.2）
 *
 * 驗證操作日誌 schema 集中於 gasRuntime：12 欄欄位／表頭／索引一一對應，
 * 寫入端（databaseInitializer／activityLogger）與查詢端（activityLogQuery）
 * 不再重複定義欄位陣列或硬編碼 cells[0..11]。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const gasRuntime = require(path.join(root, "gasRuntime.js"));

function readSource(name) {
  return fs.readFileSync(path.join(root, name), "utf8");
}

console.log("開始執行操作日誌 schema 單一來源測試...\n");

console.log("1. gasRuntime 的 12 欄定義應完整且一致...\n");
{
  const fields = gasRuntime.ACTIVITY_LOG_FIELDS;
  const headers = gasRuntime.ACTIVITY_LOG_HEADERS;
  const index = gasRuntime.ACTIVITY_LOG_FIELD_INDEX;
  assert.strictEqual(fields.length, 12, "英文欄位應為 12 欄");
  assert.strictEqual(headers.length, 12, "中文表頭應為 12 欄");
  assert.strictEqual(gasRuntime.ACTIVITY_DETAIL_MAX_LENGTH, 500);
  assert.deepStrictEqual(JSON.parse(gasRuntime.MINIMAL_ACTIVITY_DETAIL_JSON), {
    版本: 1,
    動作: "",
    指標: {},
    截斷: true
  });
  fields.forEach(function (field, position) {
    assert.strictEqual(index[field], position, field + " 索引應為 " + position);
  });
  assert.strictEqual(index.timestamp, 0);
  assert.strictEqual(index.errorCode, 11);
  console.log("   ✓ schema 一致性驗證通過！\n");
}

console.log("2. 寫入端應由 gasRuntime 取得欄位定義，無重複陣列...\n");
{
  const initSource = readSource("databaseInitializer.js");
  const loggerSource = readSource("activityLogger.js");
  assert(initSource.indexOf("GAS_RUNTIME.ACTIVITY_LOG_HEADERS") !== -1, "初始化端應使用 gasRuntime 表頭");
  assert(loggerSource.indexOf("GAS_RUNTIME.ACTIVITY_LOG_FIELDS") !== -1, "寫入端應使用 gasRuntime 欄位");
  assert.strictEqual(initSource.indexOf('"時間戳記"'), -1, "初始化端不應重複定義中文表頭");
  assert.strictEqual(loggerSource.indexOf('"durationMs"'), -1, "寫入端不應重複定義 12 欄英文陣列");
  console.log("   ✓ 寫入端單一來源驗證通過！\n");
}

console.log("3. 查詢端應消除 cells[0..11] 硬編碼並由注入取得索引...\n");
{
  const querySource = readSource("activityLogQuery.js");
  assert(querySource.indexOf("fieldIndex[field]") !== -1, "查詢端應使用注入的欄位索引");
  assert.strictEqual(/cells\[[0-9]+\]/.test(querySource), false, "查詢端不應硬編碼 cells 索引");
  assert(querySource.indexOf("deps.fieldIndex") !== -1, "查詢端應宣告 fieldIndex 相依");
  console.log("   ✓ 查詢端索引注入驗證通過！\n");
}

console.log("4. 詳情常數應集中於 gasRuntime，產生器與攔截器不再重複定義...\n");
{
  const buildersSource = readSource("activityLogBuilders.js");
  const interceptorSource = readSource("activityLogInterceptor.js");
  assert(buildersSource.indexOf("GAS_RUNTIME.ACTIVITY_DETAIL_MAX_LENGTH") !== -1);
  assert(buildersSource.indexOf("GAS_RUNTIME.MINIMAL_ACTIVITY_DETAIL_JSON") !== -1);
  assert(interceptorSource.indexOf("GAS_RUNTIME.ACTIVITY_DETAIL_MAX_LENGTH") !== -1);
  assert(interceptorSource.indexOf("GAS_RUNTIME.MINIMAL_ACTIVITY_DETAIL_JSON") !== -1);
  assert.strictEqual(buildersSource.indexOf('require("./gasRuntime.js")'), -1, "產生器不得 require gasRuntime（解環）");
  console.log("   ✓ 詳情常數集中化驗證通過！\n");
}

console.log("✓ activityLogSchemaSingleSource.test.js 測試全數通過！\n");
