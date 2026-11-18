"use strict";

/**
 * webapp/js/courses.js fetchList 單元測試（G7.7）。
 * 驗證頁碼解析、查詢參數組裝、載入中狀態與例外處理。
 */

const assert = require("assert");
const coursesModule = require("../webapp/js/courses.js");
const depsFactory = require("./helpers/accountsCoursesDeps.js");
const createDeps = depsFactory.createCoursesDeps;
const flush = depsFactory.flush;

console.log("開始執行 webapp/js/courses.js fetchList 測試...\n");

function setup(ctx, page) {
  const controller = coursesModule.createCoursesModule(ctx.deps);
  controller.fetchList(page);
  return controller;
}

async function run() {
  assert.strictEqual(typeof coursesModule.createCoursesModule, "function", "應匯出模組工廠");
  console.log("1. 模組工廠可匯入 ✓\n");

  let ctx = createDeps();
  ctx.state.courses = { page: 4, keyword: "程式", department: "資訊管理科", academicYear: "114", semester: "1" };
  setup(ctx);
  assert.strictEqual(ctx.state.courses.loading, true);
  assert.strictEqual(ctx.state.courses.page, 4, "無參數時應沿用狀態中的頁碼");
  let call = ctx.calls.apiCalls[0];
  assert.strictEqual(call.action, "getCourseIndex");
  assert.deepStrictEqual(call.payload, {
    keyword: "程式",
    department: "資訊管理科",
    academicYear: "114",
    semester: "1",
    page: 4,
    pageSize: 30
  });
  await flush();
  console.log("2. 沿用狀態頁碼與篩選條件 ✓\n");

  ctx = createDeps();
  ctx.state.courses = { page: 4, list: ["既有資料"], custom: "保留" };
  setup(ctx, 2);
  assert.strictEqual(ctx.state.courses.page, 2, "明確頁碼應優先");
  assert.strictEqual(ctx.calls.apiCalls[0].payload.page, 2);
  assert.deepStrictEqual(ctx.calls.apiCalls[0].payload.keyword, "");
  assert.strictEqual(ctx.state.courses.custom, "保留", "應保留其他狀態欄位");
  await flush();
  console.log("3. 明確頁碼優先並保留其他狀態 ✓\n");

  ctx = createDeps();
  ctx.state.courses = { pageSize: 50, page: 1 };
  setup(ctx, 1);
  assert.strictEqual(ctx.calls.apiCalls[0].payload.pageSize, 50, "應使用自訂分頁大小");
  await flush();
  console.log("4. 自訂分頁大小 ✓\n");

  ctx = createDeps();
  ctx.state.courses = { page: 1 };
  ctx.setResponder(function () {
    return Promise.reject(new Error("讀取失敗"));
  });
  setup(ctx, 1);
  assert.strictEqual(ctx.state.courses.loading, true);
  await flush();
  assert.strictEqual(ctx.state.courses.loading, false);
  assert.deepStrictEqual(ctx.calls.toast, [{ message: "讀取失敗", kind: "err" }]);
  console.log("5. 例外路徑結束載入中並顯示錯誤 ✓\n");

  console.log("✓ webapp/js/courses.js fetchList 測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
