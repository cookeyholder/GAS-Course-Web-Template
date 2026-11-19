"use strict";

/**
 * activityLoggerBranchCoverage.test.js（task 6.3）
 * 補足 activityLogger.js 的降級、例外與邊界分支覆蓋率。
 */

const assert = require("assert");
const logger = require("../activityLogger.js");

/** 建立具 appendRow 與 getLastRow 的假工作表。 */
function makeSheet(overrides) {
  const sheet = {
    rows: [],
    appendRow: function (row) {
      this.rows.push(row);
    },
    getLastRow: function () {
      return this.rows.length + 1;
    }
  };
  return Object.assign(sheet, overrides || {});
}

/** 建立回傳指定工作表的假試算表。 */
function makeSpreadsheet(sheet) {
  return {
    getSheetByName: function () {
      return sheet;
    }
  };
}

function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (key) {
    prev[key] = Object.prototype.hasOwnProperty.call(globalThis, key) ? globalThis[key] : undefined;
    if (temp[key] === undefined) delete globalThis[key];
    else globalThis[key] = temp[key];
  });
  try {
    return fn();
  } finally {
    Object.keys(temp).forEach(function (key) {
      if (prev[key] === undefined) delete globalThis[key];
      else globalThis[key] = prev[key];
    });
  }
}

console.log("開始執行 activityLogger.js 分支覆蓋補足測試...\n");

console.log("1. buildActivityLogRow 應處理空紀錄、非字串與 null 欄位...\n");
{
  const emptyRow = logger.buildActivityLogRow(null);
  assert.strictEqual(emptyRow.length, logger.ACTIVITY_LOG_FIELDS.length);
  assert(
    emptyRow.every(function (value) {
      return value === "";
    }),
    "空紀錄應補上空字串"
  );

  const mixed = logger.buildActivityLogRow({ summary: 42, email: null, durationMs: 7 });
  assert.strictEqual(mixed[8], 42, "非字串欄位應維持原值");
  assert.strictEqual(mixed[5], "", "null 欄位應轉為空字串");
  console.log("   ✓ 空紀錄與欄位型別驗證通過！\n");
}

console.log("2. 快取 get/put 例外不應影響日誌寫入...\n");
{
  const sheet = makeSheet();
  const ss = makeSpreadsheet(sheet);
  const throwingCache = {
    get: function () {
      throw new Error("get fail");
    },
    put: function () {
      throw new Error("put fail");
    }
  };
  const ok = logger.appendActivityLog({ action: "測試" }, ss, { cache: throwingCache });
  assert.strictEqual(ok, true);
  assert.strictEqual(sheet.rows.length, 1);
  console.log("   ✓ 快取例外隔離驗證通過！\n");
}

console.log("3. appendRow 丟出非 Error 值時應安全降級為 false...\n");
{
  const sheet = makeSheet({
    appendRow: function () {
      throw "raw failure";
    }
  });
  const ok = logger.appendActivityLog({ action: "測試" }, makeSpreadsheet(sheet), {
    cache: { get: () => null, put: () => {} }
  });
  assert.strictEqual(ok, false);
  console.log("   ✓ 寫入例外降級驗證通過！\n");
}

console.log("4. CacheService 注入路徑應正確解析快取...\n");
{
  const cache = { get: () => null, put: () => {} };
  withGlobals({ CacheService: { getScriptCache: () => cache } }, function () {
    const resolved = logger.getActivityLogCache({});
    assert.strictEqual(resolved, cache);
  });
  withGlobals({ CacheService: {} }, function () {
    const resolved = logger.getActivityLogCache({});
    assert(resolved && typeof resolved.get === "function", "應回退至記憶體快取");
  });
  console.log("   ✓ CacheService 解析驗證通過！\n");
}

console.log("5. cleanupActivityLogRows 無參數與缺少工作表應回傳失敗...\n");
{
  withGlobals({ SpreadsheetApp: undefined }, function () {
    const result = logger.cleanupActivityLogRows();
    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.deleted, 0);
  });

  const noLastRow = makeSpreadsheet(makeSheet({ getLastRow: undefined }));
  const result = logger.cleanupActivityLogRows({ spreadsheet: noLastRow });
  assert.strictEqual(result.ok, false);
  console.log("   ✓ 缺少工作表降級驗證通過！\n");
}

console.log("6. cleanupActivityLogRows 邊界列數與 deleteRows 例外...\n");
{
  const throwingCache = {
    get: () => null,
    put: function () {
      throw new Error("put fail");
    }
  };

  const nanSheet = makeSheet({
    getLastRow: function () {
      return "not-a-number";
    }
  });
  const nanResult = logger.cleanupActivityLogRows({
    spreadsheet: makeSpreadsheet(nanSheet),
    cache: throwingCache
  });
  assert.strictEqual(nanResult.ok, true, "非數值列數應視為 0");

  const noDeleteSheet = makeSheet({
    getLastRow: function () {
      return 25001;
    },
    deleteRows: undefined
  });
  const noDeleteResult = logger.cleanupActivityLogRows({
    spreadsheet: makeSpreadsheet(noDeleteSheet),
    cache: throwingCache
  });
  assert.strictEqual(noDeleteResult.ok, false, "缺少 deleteRows 應回傳失敗");

  let deletedAt = null;
  const bigSheet = makeSheet({
    getLastRow: function () {
      return 25001;
    },
    deleteRows: function (start, count) {
      deletedAt = { start: start, count: count };
    }
  });
  const bigResult = logger.cleanupActivityLogRows({
    spreadsheet: makeSpreadsheet(bigSheet),
    cache: throwingCache
  });
  assert.strictEqual(bigResult.ok, true, "快取更新失敗不影響清理");
  assert.strictEqual(bigResult.deleted, 10000);
  assert.deepStrictEqual(deletedAt, { start: 2, count: 10000 });

  const throwingSheet = makeSheet({
    getLastRow: function () {
      throw "raw failure";
    }
  });
  const throwResult = logger.cleanupActivityLogRows({
    spreadsheet: makeSpreadsheet(throwingSheet),
    cache: throwingCache
  });
  assert.strictEqual(throwResult.ok, false);
  console.log("   ✓ 清理邊界與快取例外驗證通過！\n");
}

console.log("7. ensureActivityLogCleanupTrigger_ 各種降級路徑...\n");
{
  withGlobals({ ScriptApp: undefined }, function () {
    const result = logger.ensureActivityLogCleanupTrigger_();
    assert.strictEqual(result.reason, "unavailable");
  });

  const globalScriptApp = {
    newTrigger: function () {
      return {
        timeBased: function () {
          return this;
        },
        atHour: function () {
          return this;
        },
        everyDays: function () {
          return this;
        },
        create: function () {}
      };
    }
  };
  withGlobals({ ScriptApp: globalScriptApp }, function () {
    const result = logger.ensureActivityLogCleanupTrigger_();
    assert.strictEqual(result.reason, "created");
  });

  const nullTriggersApp = {
    newTrigger: globalScriptApp.newTrigger,
    getProjectTriggers: function () {
      return null;
    }
  };
  const nullResult = logger.ensureActivityLogCleanupTrigger_({ scriptApp: nullTriggersApp });
  assert.strictEqual(nullResult.reason, "created");

  const mixedTriggersApp = {
    newTrigger: globalScriptApp.newTrigger,
    getProjectTriggers: function () {
      return [null, { handlerFunction: "cleanupActivityLogRows" }];
    }
  };
  const existsResult = logger.ensureActivityLogCleanupTrigger_({ scriptApp: mixedTriggersApp });
  assert.strictEqual(existsResult.reason, "exists");

  const throwingApp = {
    newTrigger: function () {
      throw "raw failure";
    }
  };
  const errorResult = logger.ensureActivityLogCleanupTrigger_({ scriptApp: throwingApp });
  assert.strictEqual(errorResult.reason, "error");
  console.log("   ✓ 觸發器安裝降級路徑驗證通過！\n");
}

console.log("✓ activityLogger.js 分支覆蓋補足測試全數通過！\n");
