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
  const detail = builders.describe("unknown-key", null, { action: "test" }, {});
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

console.log("9.1 巢狀物件、陣列與大小寫變體敏感資料不得外洩...");
{
  const leaked = ["NESTED-TOKEN-LEAK", "ARRAY-CSRF-LEAK", "CASE-TOKEN-LEAK", "CASE-CSRF-LEAK"];
  const authDetail = builders.describe(
    "auth",
    null,
    {
      action: "login",
      TOKEN: "CASE-TOKEN-LEAK",
      CsrfToken: "CASE-CSRF-LEAK",
      page: { nested: { token: "NESTED-TOKEN-LEAK" } },
      category: ["ok", { csrfToken: "ARRAY-CSRF-LEAK" }]
    },
    { ok: true }
  );
  const authText = JSON.stringify(authDetail);
  leaked.forEach(function (needle) {
    assert.strictEqual(authText.indexOf(needle), -1, "auth 詳情不得寫入 " + needle);
  });

  const settingsDetail = builders.describe(
    "systemSettings",
    { schoolYear: "114" },
    {
      action: "saveSystemSettings",
      TOKEN: "CASE-TOKEN-LEAK",
      CsrfToken: "CASE-CSRF-LEAK",
      settings: {
        schoolYear: { nested: "NESTED-TOKEN-LEAK" },
        clientSecret: "ARRAY-CSRF-LEAK"
      }
    },
    { ok: true }
  );
  const settingsText = JSON.stringify(settingsDetail);
  leaked.forEach(function (needle) {
    assert.strictEqual(settingsText.indexOf(needle), -1, "systemSettings 詳情不得寫入 " + needle);
  });
  console.log("   ✓ 巢狀與大小寫變體敏感資料排除驗證通過！\n");
}

console.log("10. 詳情超限時應逐級降級且各級皆為可解析 JSON...");
{
  const limit = builders.ACTIVITY_DETAIL_MAX_LENGTH;
  function assertValid(text, label) {
    assert.strictEqual(typeof text, "string", label + " 應為字串");
    assert(text.length <= limit, label + " 長度應 ≤ " + limit + "，實得 " + text.length);
    const parsed = JSON.parse(text);
    assert(parsed && typeof parsed === "object" && !Array.isArray(parsed), label + " 應為物件");
    assert.strictEqual(parsed.版本, builders.ACTIVITY_DETAIL_VERSION);
    assert.strictEqual(parsed.截斷, true, label + " 應標註截斷");
    return parsed;
  }

  // 第一級：捨棄變動即可滿足上限
  const level1Source = JSON.stringify({
    版本: 1,
    動作: "saveWhitelist",
    指標: { 變動欄數: 1 },
    變動: [{ 欄位: "新增成員", 前: "", 後: "x".repeat(limit) }]
  });
  const level1 = assertValid(builders.truncateDetailToLimit(level1Source), "第一級");
  assert.strictEqual(level1.變動, undefined, "第一級應捨棄變動");
  assert.strictEqual(level1.指標.變動欄數, 1);

  // 第二級：超長 category 使指標.篩選超限，字串型指標改「已省略」
  const longCategory = "c".repeat(limit + 100);
  const queryDetail = builders.describe(
    "query",
    null,
    { action: "getActivityLog", category: longCategory, page: 1, pageSize: 50 },
    { ok: true, rows: [], total: 0 }
  );
  assert.strictEqual(queryDetail.指標.篩選, longCategory, "指標.篩選 應來自 category");
  const level2 = assertValid(builders.truncateDetailToLimit(JSON.stringify(queryDetail)), "第二級");
  assert.strictEqual(level2.指標.篩選, "已省略", "字串型指標應改為「已省略」");
  assert.strictEqual(level2.指標.頁碼, 1, "數字型指標應保留");
  assert.strictEqual(level2.變動, undefined);

  // 同時驗證超長 email 亦為篩選來源
  const longEmail = "e".repeat(limit + 100) + "@example.com";
  const emailDetail = builders.describe(
    "query",
    null,
    { action: "getActivityLog", email: longEmail },
    { ok: true, rows: [] }
  );
  assert.strictEqual(emailDetail.指標.篩選, longEmail, "無 category 時指標.篩選 應來自 email");
  const emailResult = assertValid(builders.truncateDetailToLimit(JSON.stringify(emailDetail)), "email 降級");
  assert.strictEqual(emailResult.指標.篩選, "已省略");

  // 第三級：超長 action 使前兩級仍超限，只留版本／動作（含上限）／截斷
  const longAction = "a".repeat(limit + 200);
  const actionDetail = builders.describe("unknown-key", null, { action: longAction }, {});
  const level3 = assertValid(builders.truncateDetailToLimit(JSON.stringify(actionDetail)), "第三級");
  assert.strictEqual(level3.指標, undefined, "第三級應捨棄指標");
  assert(level3.動作.length > 0 && level3.動作.length < longAction.length, "動作應被截短但仍保留部分內容");

  // 非法 JSON 應回退至最小合法 JSON
  const minimal = assertValid(builders.truncateDetailToLimit("{not json"), "最小合法 JSON");
  assert.strictEqual(minimal.動作, "");
  assert.deepStrictEqual(minimal.指標, {});
  assert.strictEqual(minimal.變動, undefined);

  // 未超限的詳情應原樣回傳，不標註截斷
  const normal = builders.describe("auth", null, { action: "login" }, { ok: true });
  const normalText = builders.truncateDetailToLimit(JSON.stringify(normal));
  assert.strictEqual(normalText, JSON.stringify(normal), "未超限不應變更詳情");
  assert.strictEqual(JSON.parse(normalText).截斷, undefined);
  console.log("   ✓ 逐級降級與 JSON 合法性驗證通過！\n");
}

console.log("✓ activityLogBuilders.test.js 測試全數通過！\n");
