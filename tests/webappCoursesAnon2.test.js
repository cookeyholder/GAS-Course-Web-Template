"use strict";

/**
 * webapp/js/courses.js 匿名方法 2 單元測試（G7.8）。
 * 實際對應：fetchList 中的 then 回呼（原 L27-46），重構後抽為 handleFetchListSuccess。
 */

const assert = require("assert");
const coursesModule = require("../webapp/js/courses.js");
const depsFactory = require("./helpers/accountsCoursesDeps.js");
const createDeps = depsFactory.createCoursesDeps;
const flush = depsFactory.flush;

console.log("開始執行 webapp/js/courses.js 匿名方法 2 測試...\n");

function setup(result, initialState) {
  const ctx = createDeps();
  if (initialState) {
    ctx.state.courses = initialState;
  }
  ctx.setResponder(function () {
    return Promise.resolve(result);
  });
  coursesModule.createCoursesModule(ctx.deps).fetchList(3);
  return ctx;
}

async function run() {
  let ctx = setup(
    {
      ok: true,
      list: [{ courseCode: "A1" }],
      total: 42,
      page: 5,
      pageSize: 20,
      totalPages: 9
    },
    { keyword: "程式", custom: "保留" }
  );
  await flush();
  assert.strictEqual(ctx.state.courses.loading, false);
  assert.deepStrictEqual(ctx.state.courses.list, [{ courseCode: "A1" }]);
  assert.strictEqual(ctx.state.courses.total, 42);
  assert.strictEqual(ctx.state.courses.page, 5);
  assert.strictEqual(ctx.state.courses.pageSize, 20);
  assert.strictEqual(ctx.state.courses.totalPages, 9);
  assert.strictEqual(ctx.state.courses.custom, "保留", "應保留請求前的其他狀態欄位");
  assert.strictEqual(ctx.calls.toast.length, 0);
  console.log("1. 成功回應完整寫入狀態 ✓\n");

  ctx = setup({ ok: true });
  await flush();
  assert.strictEqual(ctx.state.courses.loading, false);
  assert.deepStrictEqual(ctx.state.courses.list, []);
  assert.strictEqual(ctx.state.courses.total, 0);
  assert.strictEqual(ctx.state.courses.page, 3, "回應缺頁碼時應回退至目標頁碼");
  assert.strictEqual(ctx.state.courses.pageSize, 30);
  assert.strictEqual(ctx.state.courses.totalPages, 1);
  console.log("2. 成功回應缺欄位時使用預設值 ✓\n");

  ctx = setup({ ok: false, message: "查詢逾時" }, { list: ["既有資料"], keyword: "程式" });
  await flush();
  assert.strictEqual(ctx.state.courses.loading, false);
  assert.deepStrictEqual(ctx.state.courses.list, ["既有資料"], "失敗時不應覆蓋清單");
  assert.strictEqual(ctx.state.courses.keyword, "程式");
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "查詢逾時", kind: "err" }]);
  console.log("3. 失敗回應顯示後端訊息且保留原資料 ✓\n");

  ctx = setup({ ok: false });
  await flush();
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "讀取課程資料失敗", kind: "err" }]);
  console.log("4. 失敗且無訊息時使用預設文字 ✓\n");

  ctx = setup(null);
  await flush();
  assert.strictEqual(ctx.state.courses.loading, false);
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "讀取課程資料失敗", kind: "err" }]);
  console.log("5. 空回應視為失敗 ✓\n");

  console.log("✓ webapp/js/courses.js 匿名方法 2 測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
