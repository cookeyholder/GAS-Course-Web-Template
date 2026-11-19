"use strict";

/**
 * webappMockCourseQuery.test.js（task 4.6）
 * 驗證 mock getCourseIndex 支援與後端一致的篩選、分頁與回應形狀。
 */

const assert = require("assert");
const mockModule = require("../webapp/js/mock.js");

function createMock() {
  return mockModule.createMockApi({
    window: { location: { href: "https://example.test/app?mock=true" } },
    setTimeoutFn: function (fn) {
      fn();
    },
    nowFn: function () {
      return 1700000000000;
    }
  });
}

(async function run() {
  console.log("開始執行 mock getCourseIndex 篩選與分頁測試...\n");

  const mock = createMock();

  console.log("1. 無條件查詢應回傳與後端一致的形狀...");
  const all = await mock.handle("getCourseIndex");
  assert.deepStrictEqual(Object.keys(all).sort(), ["list", "ok", "page", "pageSize", "total", "totalPages"]);
  assert.strictEqual(all.ok, true);
  assert.strictEqual(all.total, 4);
  assert.strictEqual(all.page, 1);
  assert.strictEqual(all.pageSize, 50);
  assert.strictEqual(all.totalPages, 1);
  assert.strictEqual(all.list.length, 4);
  console.log("   ✓ 回應形狀驗證通過！\n");

  console.log("2. 關鍵字篩選應比對代碼、科目、科別與群別...");
  const byKeyword = await mock.handle("getCourseIndex", { keyword: "程式" });
  assert.strictEqual(byKeyword.total, 1);
  assert.strictEqual(byKeyword.list[0].courseCode, "305101A");
  const byCode = await mock.handle("getCourseIndex", { keyword: "311301D" });
  assert.strictEqual(byCode.total, 1);
  console.log("   ✓ 關鍵字篩選驗證通過！\n");

  console.log("3. 學年、學期與科別篩選應可合併使用...");
  const byFields = await mock.handle("getCourseIndex", {
    academicYear: "114",
    semester: "1",
    department: "資訊科"
  });
  assert.strictEqual(byFields.total, 1);
  assert.strictEqual(byFields.list[0].department, "資訊科");
  const noMatch = await mock.handle("getCourseIndex", { academicYear: "999" });
  assert.strictEqual(noMatch.total, 0);
  assert.strictEqual(noMatch.list.length, 0);
  assert.strictEqual(noMatch.totalPages, 1);
  console.log("   ✓ 欄位篩選驗證通過！\n");

  console.log("4. 分頁應套用 page 與 pageSize 並回傳正確中繼資料...");
  const firstPage = await mock.handle("getCourseIndex", { page: 1, pageSize: 2 });
  assert.strictEqual(firstPage.total, 4);
  assert.strictEqual(firstPage.page, 1);
  assert.strictEqual(firstPage.pageSize, 2);
  assert.strictEqual(firstPage.totalPages, 2);
  assert.strictEqual(firstPage.list.length, 2);
  const secondPage = await mock.handle("getCourseIndex", { page: 2, pageSize: 2 });
  assert.strictEqual(secondPage.page, 2);
  assert.strictEqual(secondPage.list.length, 2);
  assert.notStrictEqual(firstPage.list[0].courseCode, secondPage.list[0].courseCode);
  console.log("   ✓ 分頁驗證通過！\n");

  console.log("5. 異常頁碼與過大每頁筆數應正規化...");
  const normalized = await mock.handle("getCourseIndex", { page: -5, pageSize: 999 });
  assert.strictEqual(normalized.page, 1);
  assert.strictEqual(normalized.pageSize, 200);
  const invalid = await mock.handle("getCourseIndex", { page: "abc", pageSize: "xyz" });
  assert.strictEqual(invalid.page, 1);
  assert.strictEqual(invalid.pageSize, 50);
  console.log("   ✓ 參數正規化驗證通過！\n");

  console.log("✓ mock getCourseIndex 測試全數通過！\n");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
