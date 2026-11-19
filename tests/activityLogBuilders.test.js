"use strict";

/**
 * activityLogBuilders.test.js（task 2.2）
 * 驗證操作日誌詳情產生器：版本欄位、各類彙總指標與變動明細、
 * 三種匯入結果形狀，以及敏感欄位排除。
 */

const assert = require("assert");
const builders = require("../activityLogBuilders.js");

console.log("開始執行 activityLogBuilders 測試...\n");

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

console.log("1. 詳情應含版本號且預設產生器回退正常...");
{
  const detail = builders.describe("unknown-key", null, null, { action: "test" }, {});
  assert.strictEqual(detail.版本, builders.ACTIVITY_DETAIL_VERSION);
  assert.strictEqual(detail.動作, "test");
  assert.deepStrictEqual(detail.指標, {});
  assert.deepStrictEqual(detail.變動, []);
  console.log("   ✓ 版本與回退驗證通過！\n");
}

console.log("2. 驗證失敗（無 stats）應明確標記統計不適用...");
{
  const detail = builders.describe(
    "importCourseCodes",
    null,
    null,
    { action: "importCourseCodes" },
    { ok: false, error: " validation " }
  );
  assert.strictEqual(detail.指標.結果, "統計不適用");
  assert.strictEqual(detail.指標.上傳筆數, undefined);
  console.log("   ✓ 驗證失敗形狀驗證通過！\n");
}

console.log("3. 匯入成功應記錄上傳與展開筆數（展開筆數取自 result.rows）...");
{
  const detail = builders.describe(
    "importCourseCodes",
    null,
    null,
    { action: "importCourseCodes" },
    {
      ok: true,
      rows: 120,
      stats: {
        sourceRows: 80,
        excludedRows: 5,
        keptCourseRows: 75,
        expandedRows: 119,
        returnedRows: 120
      }
    }
  );
  assert.strictEqual(detail.指標.上傳筆數, 80);
  assert.strictEqual(detail.指標.展開筆數, 120);
  assert.strictEqual(detail.指標.回傳筆數, 120);
  assert.strictEqual(detail.指標.結果, "全新匯入");
  console.log("   ✓ 匯入成功形狀驗證通過！\n");
}

console.log("4. 缺少 result.rows 時應回退至 stats.expandedRows...");
{
  const detail = builders.describe(
    "importCourseCodes",
    null,
    null,
    { action: "importCourseCodes" },
    {
      ok: true,
      stats: { sourceRows: 3, excludedRows: 0, keptCourseRows: 3, expandedRows: 9, returnedRows: 9 }
    }
  );
  assert.strictEqual(detail.指標.展開筆數, 9);
  console.log("   ✓ 回退展開筆數驗證通過！\n");
}

console.log("5. 冪等命中應明確標記且不誤寫統計...");
{
  const detail = builders.describe(
    "importCourseCodes",
    null,
    null,
    { action: "importCourseCodes" },
    { idempotent: true, ok: true }
  );
  assert.strictEqual(detail.指標.結果, "冪等命中");
  assert.strictEqual(detail.指標.上傳筆數, undefined);
  console.log("   ✓ 冪等命中形狀驗證通過！\n");
}

console.log("6. 查詢動作僅記錄篩選、分頁與回傳筆數...");
{
  const detail = builders.describe(
    "query",
    null,
    null,
    { action: "getCourseIndex", page: 2, pageSize: 50, category: "A" },
    { ok: true, rows: [{ code: "A1" }], total: 7 }
  );
  assert.strictEqual(detail.指標.頁碼, 2);
  assert.strictEqual(detail.指標.每頁筆數, 50);
  assert.strictEqual(detail.指標.回傳筆數, 1);
  assert.strictEqual(detail.指標.篩選, "A");
  assert.strictEqual(JSON.stringify(detail).indexOf("A1"), -1, "不得寫入回傳內容");
  console.log("   ✓ 查詢彙總驗證通過！\n");
}

console.log("7. 系統設定應產生欄位級 before/after 明細且排除敏感值...");
{
  const before = { schoolYear: "114", systemName: "舊名稱", clientId: "old-id", clientSecret: "old-secret" };
  const detail = withGlobals(
    {
      readSystemSettings: function () {
        return before;
      }
    },
    function () {
      const snapshot = builders.captureBefore("systemSettings", { fake: true });
      assert.deepStrictEqual(snapshot, {
        schoolYear: "114",
        systemName: "舊名稱",
        clientId: "old-id"
      });
      return builders.describe(
        "systemSettings",
        snapshot,
        null,
        {
          action: "saveSystemSettings",
          csrfToken: "CSRF-SECRET",
          settings: {
            schoolYear: "115",
            systemName: "舊名稱",
            clientId: "new-id",
            clientSecret: "NEW-SECRET-SHOULD-NOT-APPEAR"
          }
        },
        { ok: true }
      );
    }
  );
  assert.strictEqual(detail.指標.變動欄數, 2);
  assert.strictEqual(detail.變動.length, 2);
  assert.deepStrictEqual(detail.變動[0], { 欄位: "學年度", 前: "114", 後: "115" });
  assert.deepStrictEqual(detail.變動[1], { 欄位: "OAuth Client ID", 前: "old-id", 後: "new-id" });
  const text = JSON.stringify(detail);
  assert.strictEqual(text.indexOf("NEW-SECRET-SHOULD-NOT-APPEAR"), -1);
  assert.strictEqual(text.indexOf("CSRF-SECRET"), -1);
  console.log("   ✓ 系統設定明細與敏感排除驗證通過！\n");
}

console.log("8. 白名單應記錄新增與移除成員...");
{
  const before = [{ email: "a@example.com" }, { email: "b@example.com" }];
  const detail = withGlobals(
    {
      readWhitelist: function () {
        return before;
      }
    },
    function () {
      const snapshot = builders.captureBefore("whitelist", { fake: true });
      return builders.describe(
        "whitelist",
        snapshot,
        null,
        {
          action: "saveWhitelist",
          accounts: [{ email: "B@example.com" }, { email: "c@example.com" }]
        },
        { ok: true, count: 2 }
      );
    }
  );
  assert.strictEqual(detail.指標.原有人數, 2);
  assert.strictEqual(detail.指標.現有人數, 2);
  assert.strictEqual(detail.指標.寫入筆數, 2);
  assert.strictEqual(detail.變動.length, 2, "B 大小寫視為同一人，只記錄 c 新增與 a 移除");
  assert.deepStrictEqual(detail.變動[0], { 欄位: "新增成員", 前: "", 後: "c@example.com" });
  assert.deepStrictEqual(detail.變動[1], { 欄位: "移除成員", 前: "a@example.com", 後: "" });
  console.log("   ✓ 白名單明細驗證通過！\n");
}

console.log("8.1 白名單 accounts 非陣列時不拋錯且回傳空變動...");
{
  [null, undefined, "not-an-array", { email: "x@example.com" }, 42].forEach(function (value) {
    const detail = builders.describe(
      "whitelist",
      [{ email: "old@example.com" }],
      null,
      { action: "saveWhitelist", accounts: value },
      { ok: true }
    );
    assert(Array.isArray(detail.變動), "應維持變動為陣列");
    assert.strictEqual(detail.變動.length, 0, "非陣列 accounts 不應產生變動：" + JSON.stringify(value));
    assert.strictEqual(detail.指標.現有人數, 0);
    console.log("   ✓ 非陣列 accounts 防護驗證通過：" + JSON.stringify(value));
  });
  console.log("");
}

console.log("9. 敏感欄位與原始資料不得進入任何詳情...");
{
  const detail = builders.describe(
    "auth",
    null,
    null,
    {
      action: "login",
      token: "SESSION-TOKEN-X",
      csrfToken: "CSRF-TOKEN-X",
      idToken: "ID-TOKEN-X",
      credential: "CREDENTIAL-X",
      rows: [["原始", "上傳", "資料"]],
      result: { secret: "回傳內容" }
    },
    { ok: true }
  );
  const text = JSON.stringify(detail);
  ["SESSION-TOKEN-X", "CSRF-TOKEN-X", "ID-TOKEN-X", "CREDENTIAL-X", "原始", "回傳內容"].forEach(function (needle) {
    assert.strictEqual(text.indexOf(needle), -1, "不得寫入 " + needle);
  });
  assert.strictEqual(detail.指標.登入方式, "一般登入");
  console.log("   ✓ 敏感欄位排除驗證通過！\n");
}

console.log("✓ activityLogBuilders.test.js 測試全數通過！\n");
