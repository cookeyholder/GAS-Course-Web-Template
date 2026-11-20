"use strict";

/**
 * activityLogQueryFallback.test.js
 * 驗證未注入 adminRoleCode 時退回同值常數 "admin"，角色守門仍正常運作。
 */

const assert = require("assert");
const queryModule = require("../activityLogQuery.js");

function run() {
  console.log("開始執行 activityLogQuery 角色代碼 fallback 測試...\n");

  // 刻意不傳 adminRoleCode，迫使 createActivityLogQuery 走 || "admin" 退回路徑。
  const query = queryModule.createActivityLogQuery({
    webApiError: function (code, message) {
      return { ok: false, error: code, message: message };
    },
    adminRoleName: "系統管理員",
    sheetName: "操作日誌",
    getSpreadsheet: function () {
      return null;
    }
  });

  const ss = {
    getSheetByName: function () {
      return null;
    }
  };

  const adminResult = query.handleGetActivityLog({}, { role: "admin" }, ss);
  assert.notStrictEqual(adminResult.error, "forbidden", "退回角色代碼後管理員仍應可查詢");

  const viewerResult = query.handleGetActivityLog({}, { role: "viewer" }, ss);
  assert.strictEqual(viewerResult.error, "forbidden", "非管理員仍應被拒絕");

  console.log("   ✓ adminRoleCode 退回與角色比對驗證通過！\n");
}

if (require.main === module) {
  try {
    run();
    console.log("✓ 全部測試通過！");
  } catch (error) {
    console.error("✗ 測試失敗：", error && error.stack ? error.stack : error);
    process.exitCode = 1;
  }
}

module.exports = { run };
