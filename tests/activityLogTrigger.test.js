"use strict";

/**
 * activityLogTrigger.test.js（task 3.5）
 * 驗證每日清理觸發器只在首次安裝，且時段設定為 03:00、每日一次。
 */

const assert = require("assert");
const logger = require("../activityLogger.js");

console.log("開始執行 activityLogTrigger 測試...\n");

function makeScriptApp(existingHandlers) {
  const calls = [];
  const handlers = existingHandlers || [];
  return {
    calls: calls,
    getProjectTriggers: function () {
      return handlers.map(function (name) {
        return {
          getHandlerFunction: function () {
            return name;
          }
        };
      });
    },
    newTrigger: function (name) {
      calls.push(["newTrigger", name]);
      const builder = {
        timeBased: function () {
          calls.push(["timeBased"]);
          return builder;
        },
        atHour: function (hour) {
          calls.push(["atHour", hour]);
          return builder;
        },
        everyDays: function (days) {
          calls.push(["everyDays", days]);
          return builder;
        },
        create: function () {
          calls.push(["create"]);
          return { fake: true };
        }
      };
      return builder;
    }
  };
}

console.log("1. 首次安裝應建立每日 03:00 觸發器...");
{
  const scriptApp = makeScriptApp([]);
  const result = logger.ensureActivityLogCleanupTrigger_({ scriptApp: scriptApp });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.created, true);
  assert.strictEqual(result.reason, "created");
  assert.deepStrictEqual(scriptApp.calls, [
    ["newTrigger", "cleanupActivityLogRows"],
    ["timeBased"],
    ["atHour", 3],
    ["everyDays", 1],
    ["create"]
  ]);
  console.log("   ✓ 首次安裝驗證通過！\n");
}

console.log("2. 已有同名觸發器時不重複建立...");
{
  const scriptApp = makeScriptApp(["cleanupActivityLogRows"]);
  const result = logger.ensureActivityLogCleanupTrigger_({ scriptApp: scriptApp });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.created, false);
  assert.strictEqual(result.reason, "exists");
  assert.deepStrictEqual(scriptApp.calls, []);
  console.log("   ✓ 冪等安裝驗證通過！\n");
}

console.log("3. 其他觸發器不應誤判為已安裝...");
{
  const scriptApp = makeScriptApp(["someOtherHandler"]);
  const result = logger.ensureActivityLogCleanupTrigger_({ scriptApp: scriptApp });
  assert.strictEqual(result.created, true);
  console.log("   ✓ 觸發器比對驗證通過！\n");
}

console.log("4. 無 ScriptApp 環境應安全略過...");
{
  const result = logger.ensureActivityLogCleanupTrigger_({ scriptApp: null });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.reason, "unavailable");
  console.log("   ✓ 環境缺漏驗證通過！\n");
}

console.log("✓ activityLogTrigger.test.js 測試全數通過！\n");
