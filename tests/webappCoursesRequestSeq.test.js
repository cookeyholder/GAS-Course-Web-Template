"use strict";

/**
 * 課程清單請求序號測試（task 2.7）。
 * 驗證過期回應不會覆蓋較新篩選條件的結果，且搜尋不再隨輸入自動觸發。
 */

const assert = require("assert");
const coursesModule = require("../webapp/js/courses.js");
const depsFactory = require("./helpers/accountsCoursesDeps.js");
const createDeps = depsFactory.createCoursesDeps;
const createDeferred = depsFactory.createDeferred;

function makeRow(name) {
  return {
    academicYear: "114",
    semester: "1",
    grade: "一年級",
    courseCode: "C-" + name,
    subjectName: name,
    department: "資訊管理科",
    subjectType: "專業科目",
    attribute: "人文",
    required: "必修",
    credits: "3",
    hours: "54"
  };
}

async function run() {
  console.log("1. 過期的成功回應不得覆蓋較新請求結果...");
  {
    const ctx = createDeps();
    const oldResponse = createDeferred();
    const newResponse = createDeferred();
    ctx.setResponder(function (action, payload) {
      if (payload.keyword === "新") return newResponse.promise;
      return oldResponse.promise;
    });
    const controller = coursesModule.createCoursesModule(ctx.deps);

    ctx.state.courses.keyword = "舊";
    const oldFetch = controller.fetchList(1);
    ctx.state.courses.keyword = "新";
    const newFetch = controller.fetchList(1);

    newResponse.resolve({
      ok: true,
      list: [makeRow("新科目")],
      total: 1,
      page: 1,
      pageSize: 30,
      totalPages: 1
    });
    await newFetch;
    assert.strictEqual(ctx.state.courses.list[0].subjectName, "新科目");
    assert.strictEqual(ctx.state.courses.total, 1);

    oldResponse.resolve({
      ok: true,
      list: [makeRow("舊科目")],
      total: 999,
      page: 1,
      pageSize: 30,
      totalPages: 1
    });
    await oldFetch;
    assert.strictEqual(ctx.state.courses.list[0].subjectName, "新科目", "舊回應不得覆蓋新結果");
    assert.strictEqual(ctx.state.courses.total, 1, "舊回應不得覆蓋新總筆數");
    console.log("   ✓ 過期成功回應捨棄驗證通過！\n");
  }

  console.log("2. 過期的失敗回應不得顯示錯誤或清掉載入狀態...");
  {
    const ctx = createDeps();
    const oldResponse = createDeferred();
    const newResponse = createDeferred();
    ctx.setResponder(function (action, payload) {
      if (payload.keyword === "新") return newResponse.promise;
      return oldResponse.promise;
    });
    const controller = coursesModule.createCoursesModule(ctx.deps);

    ctx.state.courses.keyword = "舊";
    const oldFetch = controller.fetchList(1);
    ctx.state.courses.keyword = "新";
    const newFetch = controller.fetchList(1);

    newResponse.resolve({ ok: true, list: [], total: 0, page: 1, pageSize: 30, totalPages: 1 });
    await newFetch;
    assert.strictEqual(ctx.state.courses.loading, false);

    oldResponse.reject(new Error("舊連線失敗"));
    await oldFetch;
    assert.deepStrictEqual(ctx.calls.toast, [], "過期錯誤不應干擾使用者");
    assert.strictEqual(ctx.state.courses.loading, false);
    console.log("   ✓ 過期失敗回應捨棄驗證通過！\n");
  }

  console.log("3. 搜尋為明確觸發，不再提供輸入自動搜尋回呼...");
  {
    const ctx = createDeps();
    const controller = coursesModule.createCoursesModule(ctx.deps);
    assert.strictEqual(controller.onKeywordInput, undefined);
    assert.strictEqual(typeof controller.handleSearch, "function");
    assert.strictEqual(typeof controller.resetSearch, "function");
    console.log("   ✓ 明確觸發驗證通過！\n");
  }

  console.log("✓ 課程清單請求序號測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
