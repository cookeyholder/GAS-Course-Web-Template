"use strict";

/**
 * webapp/js/courses.js handleSearch 單元測試（G7.9）。
 * 驗證表單讀取、狀態更新與重新查詢第一頁。
 */

const assert = require("assert");
const coursesModule = require("../webapp/js/courses.js");
const depsFactory = require("./helpers/accountsCoursesDeps.js");
const createDeps = depsFactory.createCoursesDeps;
const flush = depsFactory.flush;

console.log("開始執行 webapp/js/courses.js handleSearch 測試...\n");

function setup(ctx) {
  return coursesModule.createCoursesModule(ctx.deps);
}

async function run() {
  assert.strictEqual(typeof coursesModule.createCoursesModule, "function", "應匯出模組工廠");
  console.log("1. 模組工廠可匯入 ✓\n");

  let ctx = createDeps();
  Object.assign(ctx.elements, {
    courseSearchKeyword: { value: "  程式設計  " },
    courseSearchDept: { value: " 資訊管理科 " },
    courseSearchYear: { value: " 114 " },
    courseSearchSem: { value: " 2 " }
  });
  ctx.state.courses = { page: 7, pageSize: 50, custom: "保留", list: ["舊資料"] };
  let prevented = 0;
  setup(ctx).handleSearch({
    preventDefault: function () {
      prevented++;
    }
  });
  assert.strictEqual(prevented, 1, "應呼叫 preventDefault");
  assert.strictEqual(ctx.state.courses.keyword, "程式設計");
  assert.strictEqual(ctx.state.courses.department, "資訊管理科");
  assert.strictEqual(ctx.state.courses.academicYear, "114");
  assert.strictEqual(ctx.state.courses.semester, "2");
  assert.strictEqual(ctx.state.courses.custom, "保留", "應保留其他狀態欄位");
  assert.strictEqual(ctx.calls.apiCalls.length, 1, "應重新查詢");
  assert.strictEqual(ctx.calls.apiCalls[0].action, "getCourseIndex");
  assert.strictEqual(ctx.calls.apiCalls[0].payload.page, 1, "搜尋應回到第一頁");
  assert.strictEqual(ctx.calls.apiCalls[0].payload.pageSize, 50);
  assert.strictEqual(ctx.calls.apiCalls[0].payload.keyword, "程式設計");
  await flush();
  console.log("2. 表單讀取、狀態更新與回到第一頁 ✓\n");

  ctx = createDeps();
  setup(ctx).handleSearch();
  assert.strictEqual(ctx.state.courses.keyword, "");
  assert.strictEqual(ctx.state.courses.department, "");
  assert.strictEqual(ctx.state.courses.academicYear, "");
  assert.strictEqual(ctx.state.courses.semester, "");
  assert.strictEqual(ctx.calls.apiCalls[0].payload.page, 1);
  await flush();
  console.log("3. 缺少表單元素時以空字串查詢 ✓\n");

  ctx = createDeps();
  ctx.elements.courseSearchKeyword = { value: "會計" };
  setup(ctx).handleSearch({});
  assert.strictEqual(ctx.state.courses.keyword, "會計");
  await flush();
  console.log("4. 無 preventDefault 的事件物件亦能處理 ✓\n");

  console.log("✓ webapp/js/courses.js handleSearch 測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
