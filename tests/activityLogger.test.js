"use strict";

/**
 * activityLogger.test.js（task 3.1 起）
 * 驗證操作日誌寫入、失敗不阻斷、字串截斷、快取抽樣與容量清理行為。
 */

const assert = require("assert");
const logger = require("../activityLogger.js");

console.log("開始執行 activityLogger 測試...\n");

function makeSheet() {
  const rows = [];
  return {
    rows: rows,
    appendRow: function (row) {
      rows.push(row.slice());
    }
  };
}

function makeSpreadsheet(sheet) {
  return {
    getSheetByName: function (name) {
      return name === "操作日誌" ? sheet : null;
    }
  };
}

function sampleRecord(overrides) {
  return Object.assign(
    {
      timestamp: "2026-11-19 12:00:00",
      requestId: "req-001",
      category: "write",
      action: "saveSystemSettings",
      result: "success",
      email: "admin@example.com",
      name: "管理員",
      role: "系統管理員",
      summary: "儲存系統設定",
      detail: "{}",
      durationMs: 12,
      errorCode: ""
    },
    overrides || {}
  );
}

console.log("1. 成功寫入應附加完整 12 欄...");
{
  const sheet = makeSheet();
  const ss = makeSpreadsheet(sheet);
  const ok = logger.appendActivityLog_(sampleRecord(), ss);
  assert.strictEqual(ok, true);
  assert.strictEqual(sheet.rows.length, 1);
  assert.strictEqual(sheet.rows[0].length, 12);
  assert.strictEqual(sheet.rows[0][0], "2026-11-19 12:00:00");
  assert.strictEqual(sheet.rows[0][3], "saveSystemSettings");
  console.log("   ✓ 成功寫入驗證通過！\n");
}

console.log("2. 寫入失敗應記錄錯誤且不拋出...");
{
  const originalError = console.error;
  const errors = [];
  console.error = function () {
    errors.push(Array.prototype.slice.call(arguments));
  };
  try {
    const sheet = {
      appendRow: function () {
        throw new Error("模擬寫入失敗");
      }
    };
    const ok = logger.appendActivityLog_(sampleRecord(), makeSpreadsheet(sheet));
    assert.strictEqual(ok, false);
    assert(errors.length > 0, "應記錄錯誤");
  } finally {
    console.error = originalError;
  }
  console.log("   ✓ 失敗不阻斷驗證通過！\n");
}

console.log("3. 缺少工作表或試算表時應安靜回報失敗...");
{
  assert.strictEqual(logger.appendActivityLog_(sampleRecord(), null), false);
  assert.strictEqual(logger.appendActivityLog_(sampleRecord(), { getSheetByName: () => null }), false);
  console.log("   ✓ 缺漏情境驗證通過！\n");
}

console.log("4. 超長字串欄位應截斷至 500 字元...");
{
  const sheet = makeSheet();
  logger.appendActivityLog_(
    sampleRecord({
      email: "a".repeat(620),
      name: "n".repeat(510),
      summary: "s".repeat(700),
      action: "x".repeat(600)
    }),
    makeSpreadsheet(sheet)
  );
  const row = sheet.rows[0];
  assert.strictEqual(row[3].length, logger.MAX_FIELD_LENGTH);
  assert.strictEqual(row[3], "x".repeat(logger.MAX_FIELD_LENGTH));
  assert.strictEqual(row[5].length, logger.MAX_FIELD_LENGTH);
  assert.strictEqual(row[6].length, logger.MAX_FIELD_LENGTH);
  assert.strictEqual(row[8].length, logger.MAX_FIELD_LENGTH);
  console.log("   ✓ 字串截斷驗證通過！\n");
}

console.log("5. 敏感欄位與原始資料不得寫入...");
{
  const sheet = makeSheet();
  const ok = logger.appendActivityLog_(
    sampleRecord({
      token: "SECRET-TOKEN",
      csrfToken: "SECRET-CSRF",
      idToken: "SECRET-ID-TOKEN",
      credential: "SECRET-CREDENTIAL",
      rows: [["RAW-ROW"]],
      payload: { secret: "SECRET-PAYLOAD" },
      resultPayload: "RESPONSE-CONTENT"
    }),
    makeSpreadsheet(sheet)
  );
  assert.strictEqual(ok, true);
  const text = sheet.rows[0].join("|");
  [
    "SECRET-TOKEN",
    "SECRET-CSRF",
    "SECRET-ID-TOKEN",
    "SECRET-CREDENTIAL",
    "RAW-ROW",
    "SECRET-PAYLOAD",
    "RESPONSE-CONTENT"
  ].forEach(function (needle) {
    assert.strictEqual(text.indexOf(needle), -1, "不得寫入 " + needle);
  });
  console.log("   ✓ 敏感欄位排除驗證通過！\n");
}

console.log("6. 陣列形式的紀錄亦應套用截斷...");
{
  const row = Array(12).fill("");
  row[8] = "z".repeat(530);
  const result = logger.buildActivityLogRow(row);
  assert.strictEqual(result[8].length, logger.MAX_FIELD_LENGTH);
  console.log("   ✓ 陣列紀錄截斷驗證通過！\n");
}

console.log("✓ activityLogger.test.js 測試全數通過！\n");
