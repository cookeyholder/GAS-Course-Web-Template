"use strict";

/**
 * webApiActivityLogBranchCoverage.test.js（task 6.3）
 * 補足 webApi.js 操作日誌查詢的降級、邊界與 GAS Utilities 分支覆蓋率。
 */

const assert = require("assert");
const api = require("../webApi.js");

function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (key) {
    prev[key] = Object.prototype.hasOwnProperty.call(global, key) ? global[key] : undefined;
    global[key] = temp[key];
  });
  try {
    return fn();
  } finally {
    Object.keys(temp).forEach(function (key) {
      if (prev[key] === undefined) delete global[key];
      else global[key] = prev[key];
    });
  }
}

/** 建立回傳指定列與值的假工作表。 */
function makeSheet(getLastRowValue, values) {
  return {
    getLastRow: function () {
      return getLastRowValue;
    },
    getRange: function () {
      return {
        getValues: function () {
          return values;
        }
      };
    }
  };
}

console.log("開始執行 webApi.js 操作日誌分支覆蓋補足測試...\n");

console.log("1. formatTaipeiDate 應同時支援 GAS Utilities 與 Node 降級...\n");
{
  const date = new Date("2026-11-19T16:30:00Z");
  withGlobals(
    {
      Utilities: {
        formatDate: function () {
          return "2099-01-02";
        }
      }
    },
    function () {
      assert.strictEqual(api.formatTaipeiDate(date), "2099-01-02");
    }
  );
  withGlobals({ Utilities: {} }, function () {
    assert.strictEqual(api.formatTaipeiDate(date), "2026-11-20");
  });
  console.log("   ✓ Utilities 與降級路徑驗證通過！\n");
}

console.log("2. 空 payload 與空試算表應回傳空結果...\n");
{
  const empty = api.handleGetActivityLogWebApiAction(null, { role: "admin" }, null);
  assert.strictEqual(empty.ok, true);
  assert.strictEqual(empty.total, 0);
  assert.strictEqual(empty.page, 1);
  assert.strictEqual(empty.pageSize, 50);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(empty.startDate));

  const noSheetFn = api.handleGetActivityLogWebApiAction({}, { role: "admin" }, {});
  assert.strictEqual(noSheetFn.ok, true);
  assert.strictEqual(noSheetFn.rows.length, 0);

  const missingGetRange = api.handleGetActivityLogWebApiAction(
    {},
    { role: "admin" },
    {
      getSheetByName: function () {
        return {
          getLastRow: function () {
            return 100;
          }
        };
      }
    }
  );
  assert.strictEqual(missingGetRange.ok, true);
  console.log("   ✓ 空輸入與缺損工作表驗證通過！\n");
}

console.log("3. 非數值與過小列數應回傳空結果...\n");
{
  const nanResult = api.handleGetActivityLogWebApiAction(
    {},
    { role: "admin" },
    {
      getSheetByName: function () {
        return makeSheet("not-a-number", []);
      }
    }
  );
  assert.strictEqual(nanResult.total, 0);

  const oneRow = api.handleGetActivityLogWebApiAction(
    {},
    { role: "admin" },
    {
      getSheetByName: function () {
        return makeSheet(1, []);
      }
    }
  );
  assert.strictEqual(oneRow.total, 0);
  console.log("   ✓ 列數邊界驗證通過！\n");
}

console.log("4. getValues 回傳 null 與非陣列列應安全處理...\n");
{
  const nullValues = api.handleGetActivityLogWebApiAction(
    { startDate: "2000-01-01", endDate: "2099-12-31" },
    { role: "admin" },
    {
      getSheetByName: function () {
        return makeSheet(2, null);
      }
    }
  );
  assert.strictEqual(nullValues.total, 0);

  const malformed = api.handleGetActivityLogWebApiAction(
    { startDate: "2000-01-01", endDate: "2099-12-31" },
    { role: "admin" },
    {
      getSheetByName: function () {
        return makeSheet(2, ["not-an-array"]);
      }
    }
  );
  assert.strictEqual(malformed.total, 0, "非陣列列應被略過");
  console.log("   ✓ 非陣列列與null值驗證通過！\n");
}

console.log("5. 缺少欄位、空耗時與相同時間戳記應正確處理...\n");
{
  const rows = [
    ["2026-11-19 10:00:00", "r1"],
    ["2026-11-19 10:00:00", "r2", "write", "動作", "failure", "b@example.com", "乙", "管理員", "摘要", "{}", "", ""]
  ];
  const result = api.handleGetActivityLogWebApiAction(
    { startDate: "2000-01-01", endDate: "2099-12-31" },
    { role: "admin" },
    {
      getSheetByName: function () {
        return makeSheet(rows.length + 1, rows);
      }
    }
  );
  assert.strictEqual(result.total, 2);
  // 同時間戳記時應維持較早列在前（與既有穩定排序行為一致）
  assert.strictEqual(result.rows[0].requestId, "r1");
  assert.strictEqual(result.rows[0].durationMs, null, "缺欄位耗時應為 null");
  assert.strictEqual(result.rows[0].email, "");
  assert.strictEqual(result.rows[0].category, "");
  assert.strictEqual(result.rows[1].requestId, "r2");
  assert.strictEqual(result.rows[1].durationMs, null, "空字串耗時應為 null");
  assert.strictEqual(result.truncated, undefined, "未達掃描上限時不應標記 truncated");
  console.log("   ✓ 缺損欄位與排序等價驗證通過！\n");
}

console.log("6. 無 ss 時應由 SpreadsheetApp 解析試算表...\n");
{
  const sheet = makeSheet(2, [
    ["2026-11-19 10:00:00", "r1", "query", "動作", "success", "a@example.com", "甲", "檢視人員", "摘要", "{}", 1, ""]
  ]);
  const ss = {
    getSheetByName: function () {
      return sheet;
    }
  };
  withGlobals({ SpreadsheetApp: { getActiveSpreadsheet: () => ss } }, function () {
    const result = api.handleGetActivityLogWebApiAction(
      { startDate: "2000-01-01", endDate: "2099-12-31" },
      { role: "admin" }
    );
    assert.strictEqual(result.total, 1);
  });
  console.log("   ✓ SpreadsheetApp 解析驗證通過！\n");
}

console.log("✓ webApi.js 操作日誌分支覆蓋補足測試全數通過！\n");
