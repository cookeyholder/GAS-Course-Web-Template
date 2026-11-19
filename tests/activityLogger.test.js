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

console.log("7. 寫入路徑不得掃描工作表列數或使用列數快取...");
{
  const store = {};
  const cache = {
    get: function (key) {
      return store[key] || null;
    },
    put: function (key, value) {
      store[key] = String(value);
    }
  };
  let lastRowCalls = 0;
  const sheet = Object.assign(makeSheet(), {
    getLastRow: function () {
      lastRowCalls += 1;
      return 5000;
    }
  });
  const ss = makeSpreadsheet(sheet);
  for (let i = 0; i < 150; i += 1) {
    logger.appendActivityLog_(sampleRecord(), ss, { cache: cache });
  }
  assert.strictEqual(lastRowCalls, 0, "寫入路徑不得呼叫 getLastRow");
  assert.strictEqual(Object.keys(store).length, 0, "寫入路徑不得寫入列數快取");
  console.log("   ✓ 寫入路徑不掃描列數驗證通過！\n");
}

console.log("8. 未達上限時不清理...");
{
  const calls = [];
  const sheet = {
    getLastRow: function () {
      return logger.MAX_ACTIVITY_LOG_ROWS + 1;
    },
    deleteRows: function (start, count) {
      calls.push([start, count]);
    }
  };
  const ss = makeSpreadsheet(sheet);
  const result = logger.cleanupActivityLogRows({ spreadsheet: ss });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.deleted, 0);
  assert.deepStrictEqual(calls, []);
  console.log("   ✓ 未達上限驗證通過！\n");
}

console.log("9. 超過上限時刪除最舊資料至保留 15,000 筆...");
{
  const calls = [];
  const lastRow = logger.MAX_ACTIVITY_LOG_ROWS + 51;
  const sheet = {
    getLastRow: function () {
      return lastRow;
    },
    deleteRows: function (start, count) {
      calls.push([start, count]);
    }
  };
  const result = logger.cleanupActivityLogRows({ spreadsheet: makeSpreadsheet(sheet) });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.before, logger.MAX_ACTIVITY_LOG_ROWS + 50);
  assert.strictEqual(result.after, logger.TARGET_ACTIVITY_LOG_ROWS);
  assert.strictEqual(result.deleted, 5050);
  assert.deepStrictEqual(calls, [[2, 5050]]);
  console.log("   ✓ 超量清理驗證通過！\n");
}

console.log("10. 清理失敗應回報失敗而非拋出...");
{
  const originalError = console.error;
  console.error = function () {};
  try {
    const result = logger.cleanupActivityLogRows({
      spreadsheet: {
        getSheetByName: function () {
          return {
            getLastRow: function () {
              throw new Error("模擬讀取失敗");
            }
          };
        }
      }
    });
    assert.strictEqual(result.ok, false);
  } finally {
    console.error = originalError;
  }
  console.log("   ✓ 清理失敗處理驗證通過！\n");
}

console.log("11. 詳情欄最後防線應降級為可解析 JSON，不得直接 slice...");
{
  const detailIndex = logger.ACTIVITY_LOG_FIELDS.indexOf("detail");
  assert.strictEqual(detailIndex, 9, "詳情應為第 10 欄");

  // 超長且不可解析的內容：直接 slice 會得到不可解析的 JSON
  const brokenRow = logger.buildActivityLogRow({ detail: "x".repeat(900) });
  const broken = brokenRow[detailIndex];
  assert.strictEqual(typeof broken, "string");
  assert.strictEqual(JSON.parse(broken).截斷, true, "應回退至最小合法 JSON 並標註截斷");

  // 超長但可解析的詳情：應呼叫共用降級函式，而非粗暴截斷
  const oversized = JSON.stringify({
    版本: 1,
    動作: "getActivityLog",
    指標: { 篩選: "c".repeat(900) },
    變動: []
  });
  const degradedRow = logger.buildActivityLogRow({ detail: oversized });
  const degraded = degradedRow[detailIndex];
  assert(degraded.length <= logger.MAX_FIELD_LENGTH, "降級後長度應 ≤ " + logger.MAX_FIELD_LENGTH);
  const parsed = JSON.parse(degraded, null);
  assert.strictEqual(parsed.指標.篩選, "已省略", "應由共用降級函式處理字串型指標");
  assert.notStrictEqual(degraded, oversized.slice(0, logger.MAX_FIELD_LENGTH), "不得直接 slice");

  // 正常詳情應原樣保留
  const normal = JSON.stringify({ 版本: 1, 動作: "login", 指標: {} });
  assert.strictEqual(logger.buildActivityLogRow({ detail: normal })[detailIndex], normal);
  console.log("   ✓ 詳情最後防線驗證通過！\n");
}

console.log("✓ activityLogger.test.js 測試全數通過！\n");
