"use strict";

/**
 * activityLogInterceptor.test.js（task 4.2）
 *
 * 以注入 stub 相依的方式直接實例化攔截器，驗證：
 * - context 建立與身分補寫（含 null context、login 結果、角色解析失敗）
 * - 中繼資料預設值、日誌排除與寫入判斷
 * - 詳情捕獲降級（產生器不存在／擲錯）
 * - 紀錄建構（產生器擲錯、失敗請求、超長詳情、GAS 時區分支）
 * - finalize（解鎖失敗、寫入函式不可用、寫入擲錯、預設中繼資料）
 */

const assert = require("assert");
const interceptorModule = require("../activityLogInterceptor.js");

console.log("開始執行 activityLogInterceptor 測試...\n");

/**
 * 建立測試用攔截器與可觀測的相依狀態。
 *
 * @param {Object} [overrides] - 覆蓋預設相依
 * @returns {{interceptor: Object, state: Object}} 攔截器與狀態
 */
function makeInterceptor(overrides) {
  const state = {
    appended: [],
    errors: [],
    snapshotProvider: null,
    spreadsheetCalls: 0
  };
  const deps = {
    generateSessionToken: function () {
      return "token123";
    },
    resolveRoleDisplayName: function (role) {
      return role ? "角色:" + role : "";
    },
    getActionMeta: function () {
      return null;
    },
    excludedActions: ["ping", "getPublicConfig", "getActivityLog"],
    resolveBuilders: function () {
      return null;
    },
    resolveSnapshotProvider: function () {
      state.snapshotProvider = { readSystemSettings: function () {}, readWhitelist: function () {} };
      return state.snapshotProvider;
    },
    getSpreadsheet: function () {
      state.spreadsheetCalls += 1;
      return { id: "ss" };
    },
    resolveAppendActivityLog: function () {
      return null;
    },
    logError: function (message, detail) {
      state.errors.push({ message: message, detail: detail });
    }
  };
  Object.keys(overrides || {}).forEach(function (key) {
    deps[key] = overrides[key];
  });
  return { interceptor: interceptorModule.createActivityLogInterceptor(deps), state: state };
}

console.log("1. createContext 應建立完整 context 並接受/預設 startTime...\n");
{
  const { interceptor } = makeInterceptor();
  const explicit = interceptor.createContext("saveSystemSettings", 12345);
  assert.strictEqual(explicit.requestId, "req_token123");
  assert.strictEqual(explicit.action, "saveSystemSettings");
  assert.strictEqual(explicit.startTime, 12345);
  assert.strictEqual(explicit.email, "");
  assert.strictEqual(explicit.role, "");
  const implicit = interceptor.createContext();
  assert.strictEqual(implicit.action, "");
  assert.strictEqual(typeof implicit.startTime, "number");
  console.log("   ✓ context 建立驗證通過！\n");
}

console.log("2. recordIdentity 應補寫授權與登入結果身分並容忍 null context...\n");
{
  const { interceptor } = makeInterceptor();
  assert.strictEqual(interceptor.recordIdentity(null, {}, {}), null);
  const context = interceptor.createContext("login", 1);
  interceptor.recordIdentity(context, {
    ok: true,
    session: { email: "a@example.com", name: "甲", role: "admin" }
  });
  assert.strictEqual(context.email, "a@example.com");
  assert.strictEqual(context.name, "甲");
  assert.strictEqual(context.role, "角色:admin");
  interceptor.recordIdentity(context, null, { ok: true, email: "b@example.com", name: "乙", role: "teacher" });
  assert.strictEqual(context.email, "b@example.com");
  assert.strictEqual(context.name, "乙");
  assert.strictEqual(context.role, "角色:teacher");
  // 角色解析回傳空值時應沿用既有的角色（|| context.role 分支）
  const { interceptor: noRoleInterceptor } = makeInterceptor({
    resolveRoleDisplayName: function () {
      return "";
    }
  });
  const noRoleContext = noRoleInterceptor.createContext("getSession", 1);
  noRoleContext.role = "既有角色";
  noRoleInterceptor.recordIdentity(noRoleContext, null, { ok: true, role: "teacher" });
  assert.strictEqual(noRoleContext.role, "既有角色");
  console.log("   ✓ 身分補寫驗證通過！\n");
}

console.log("3. getMeta 應提供預設中繼資料並保留登錄值...\n");
{
  const { interceptor } = makeInterceptor();
  const fallback = interceptor.getMeta("unknownAction");
  assert.deepStrictEqual(fallback, {
    category: "query",
    label: "unknownAction",
    detailKey: "none",
    enabled: true
  });
  const { interceptor: registered } = makeInterceptor({
    getActionMeta: function () {
      return { category: "settings", label: "設定", detailKey: "saveSystemSettings", enabled: true };
    }
  });
  assert.strictEqual(registered.getMeta("saveSystemSettings").detailKey, "saveSystemSettings");
  console.log("   ✓ 中繼資料驗證通過！\n");
}

console.log("4. shouldLog 應排除指定動作與停用中繼資料...\n");
{
  const { interceptor } = makeInterceptor();
  assert.strictEqual(interceptor.shouldLog("ping", { enabled: true }), false);
  assert.strictEqual(interceptor.shouldLog("getActivityLog", { enabled: true }), false);
  assert.strictEqual(interceptor.shouldLog("getCourseIndex", { enabled: false }), false);
  assert.strictEqual(interceptor.shouldLog("getCourseIndex", { enabled: true }), true);
  // 未提供 excludedActions 時應降級為空陣列
  const { interceptor: noExclusions } = makeInterceptor({ excludedActions: undefined });
  assert.strictEqual(noExclusions.shouldLog("ping", { enabled: true }), true);
  console.log("   ✓ 寫入判斷驗證通過！\n");
}

console.log("5. captureSnapshot 應在產生器不可用或擲錯時回傳 null...\n");
{
  const { interceptor } = makeInterceptor();
  assert.strictEqual(interceptor.captureSnapshot({ detailKey: "k" }), null);
  const { interceptor: noFn } = makeInterceptor({
    resolveBuilders: function () {
      return {};
    }
  });
  assert.strictEqual(noFn.captureSnapshot({ detailKey: "k" }), null);
  const { interceptor: throwing, state: throwingState } = makeInterceptor({
    resolveBuilders: function () {
      return {
        captureBefore: function () {
          throw new Error("boom");
        }
      };
    }
  });
  assert.strictEqual(throwing.captureSnapshot({ detailKey: "k" }), null);
  assert.strictEqual(typeof throwingState.snapshotProvider.readSystemSettings, "function");
  const { interceptor: working } = makeInterceptor({
    resolveBuilders: function () {
      return {
        captureBefore: function (detailKey) {
          return { detailKey: detailKey };
        }
      };
    }
  });
  assert.deepStrictEqual(working.captureSnapshot({ detailKey: "saveSystemSettings" }), {
    detailKey: "saveSystemSettings"
  });
  console.log("   ✓ 快照捕獲降級驗證通過！\n");
}

console.log("6. buildRecord 應處理產生器擲錯、失敗請求與超長詳情...\n");
{
  const { interceptor } = makeInterceptor();
  const meta = { category: "query", label: "查詢", detailKey: "getCourseIndex", enabled: true };
  const record = interceptor.buildRecord(interceptor.createContext("getCourseIndex", 100), meta, {}, { ok: true });
  assert.strictEqual(record.action, "查詢");
  assert.strictEqual(record.result, "success");
  assert.strictEqual(record.summary, "查詢成功");
  assert.strictEqual(record.detail, JSON.stringify({ 版本: 1, 動作: "getCourseIndex", 指標: {}, 變動: [] }));

  // 產生器擲錯時保留最小版本化結構
  const { interceptor: throwing } = makeInterceptor({
    resolveBuilders: function () {
      return {
        describe: function () {
          throw new Error("describe failed");
        }
      };
    }
  });
  const thrown = throwing.buildRecord(throwing.createContext("x", 1), meta, {}, { ok: true });
  assert(thrown.detail.indexOf('"版本":1') !== -1);

  // 失敗請求不得保留變動，須標記未執行
  const failed = interceptor.buildRecord(
    interceptor.createContext("x", 1),
    meta,
    {},
    { ok: false, error: "forbidden" }
  );
  const failedDetail = JSON.parse(failed.detail);
  assert.deepStrictEqual(failedDetail.變動, []);
  assert.strictEqual(failedDetail.指標.執行, "未執行");
  assert.strictEqual(failed.result, "failure");
  assert.strictEqual(failed.summary, "查詢失敗：forbidden");

  // 產生器回傳非物件時，失敗路徑應重建detail
  const { interceptor: badDetail } = makeInterceptor({
    resolveBuilders: function () {
      return {
        describe: function () {
          return "not an object";
        }
      };
    }
  });
  const bad = badDetail.buildRecord(badDetail.createContext("x", 1), meta, {}, { ok: false });
  assert.strictEqual(JSON.parse(bad.detail).指標.執行, "未執行");

  // 失敗請求且詳情指標為陣列時，應重建為空物件並標記未執行
  const { interceptor: invalidMetrics } = makeInterceptor({
    resolveBuilders: function () {
      return {
        describe: function () {
          return { 版本: 1, 動作: "x", 指標: [], 變動: [{ 內容: "不應保留" }] };
        }
      };
    }
  });
  const invalid = invalidMetrics.buildRecord(invalidMetrics.createContext("x", 1), meta, {}, { ok: false });
  const invalidDetail = JSON.parse(invalid.detail);
  assert.deepStrictEqual(invalidDetail.指標, { 執行: "未執行" }, "無效指標應重建為空物件");
  assert.deepStrictEqual(invalidDetail.變動, [], "失敗請求不得保留變動");

  // 無截斷函式且詳情超長時應降級為最小 JSON
  const { interceptor: longDetail } = makeInterceptor({
    resolveBuilders: function () {
      return {
        describe: function () {
          return { 版本: 1, 動作: "x", 指標: {}, 變動: [{ 內容: "字".repeat(600) }] };
        }
      };
    }
  });
  const long = longDetail.buildRecord(longDetail.createContext("x", 1), meta, {}, { ok: true });
  assert.strictEqual(long.detail, '{"版本":1,"動作":"","指標":{},"截斷":true}');

  // 無 label 且無 action 時應顯示「未識別動作」，並取得 truncate 分支
  const noLabel = interceptor.buildRecord(
    interceptor.createContext("", 1),
    { category: "query", detailKey: "none", enabled: true },
    {},
    { ok: true }
  );
  assert.strictEqual(noLabel.action, "未識別動作");
  console.log("   ✓ 紀錄建構驗證通過！\n");
}

console.log("7. buildRecord 在 GAS Utilities 可用時應以(formatDate)產生時間戳記...\n");
{
  const previousUtilities = globalThis.Utilities;
  globalThis.Utilities = {
    formatDate: function (date, timeZone, pattern) {
      assert.strictEqual(timeZone, "Asia/Taipei");
      assert.strictEqual(pattern, "yyyy-MM-dd HH:mm:ss");
      return "2026-11-20 12:34:56";
    }
  };
  try {
    const { interceptor } = makeInterceptor();
    const record = interceptor.buildRecord(
      interceptor.createContext("x", 1),
      { category: "query", detailKey: "none", enabled: true },
      {},
      { ok: true }
    );
    assert.strictEqual(record.timestamp, "2026-11-20 12:34:56");
  } finally {
    if (previousUtilities === undefined) delete globalThis.Utilities;
    else globalThis.Utilities = previousUtilities;
  }
  console.log("   ✓ GAS 時區分支驗證通過！\n");
}

console.log("8. finalize 應寫入日誌並隔離寫入例外...\n");
{
  const { interceptor, state } = makeInterceptor({
    resolveAppendActivityLog: function () {
      return function (record, spreadsheet) {
        state.appended.push({ record: record, spreadsheet: spreadsheet });
      };
    }
  });
  interceptor.finalize(
    interceptor.createContext("getCourseIndex", 1),
    { category: "query", detailKey: "none", enabled: true },
    {},
    { ok: true },
    null
  );
  assert.strictEqual(state.appended.length, 1);
  assert.strictEqual(state.spreadsheetCalls, 1);

  // 寫入函式不可用時不寫入
  const { interceptor: noAppender, state: noAppenderState } = makeInterceptor();
  noAppender.finalize(
    noAppender.createContext("x", 1),
    { category: "query", detailKey: "none", enabled: true },
    {},
    { ok: true },
    null
  );
  assert.strictEqual(noAppenderState.appended.length, 0);

  // 寫入擲錯時應呼叫 logError，且不中斷
  const { interceptor: throwing, state: throwingState } = makeInterceptor({
    resolveAppendActivityLog: function () {
      return function () {
        throw new Error("write failed");
      };
    }
  });
  throwing.finalize(
    throwing.createContext("x", 1),
    { category: "query", detailKey: "none", enabled: true },
    {},
    { ok: true },
    null
  );
  assert.strictEqual(throwingState.errors.length, 1);
  assert.strictEqual(throwingState.errors[0].detail, "write failed");

  // 無 actionMeta 時應補上預設中繼資料並寫入
  const { interceptor: noMeta, state: noMetaState } = makeInterceptor({
    resolveAppendActivityLog: function () {
      return function (record) {
        noMetaState.appended.push(record);
      };
    }
  });
  noMeta.finalize(noMeta.createContext("unknown", 1), null, {}, { ok: true }, null);
  assert.strictEqual(noMetaState.appended[0].category, "query");
  console.log("   ✓ finalize 驗證通過！\n");
}

console.log("✓ activityLogInterceptor.test.js 測試全數通過！\n");
