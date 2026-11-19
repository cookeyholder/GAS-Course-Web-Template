"use strict";

/**
 * courses.js 輕量統計與 in-flight Promise 避免重複測試（task 2.2）
 * 驗證概覽頁只取得總筆數、課程清單在進入分頁時才抓，且相同參數不重複送請求。
 */

const assert = require("assert");
const coursesModule = require("../webapp/js/courses.js");
const depsFactory = require("./helpers/accountsCoursesDeps.js");
const createDeps = depsFactory.createCoursesDeps;
const createDeferred = depsFactory.createDeferred;
const flush = depsFactory.flush;

async function run() {
  console.log("1. fetchStats 應只呼叫 getCourseIndexStats 並更新總筆數...");
  {
    const ctx = createDeps();
    ctx.setResponder(function (action) {
      if (action === "getCourseIndexStats") return Promise.resolve({ ok: true, total: 12345 });
      return Promise.resolve({ ok: true });
    });
    const controller = coursesModule.createCoursesModule(ctx.deps);
    await controller.fetchStats();
    assert.strictEqual(ctx.calls.apiCalls.length, 1);
    assert.strictEqual(ctx.calls.apiCalls[0].action, "getCourseIndexStats");
    assert.strictEqual(ctx.calls.apiCalls[0].payload && Object.keys(ctx.calls.apiCalls[0].payload).length, 0);
    assert.strictEqual(ctx.state.courses.total, 12345);
    assert.strictEqual(ctx.state.courses.list.length, 0);
    assert.strictEqual(
      ctx.calls.apiCalls.some(function (call) {
        return call.action === "getCourseIndex";
      }),
      false
    );
    console.log("   ✓ 輕量統計驗證通過！\n");
  }

  console.log("2. 統計失敗時應保留原總筆數且不拋錯...");
  {
    const ctx = createDeps();
    ctx.state.courses.total = 88;
    ctx.setResponder(function () {
      return Promise.reject(new Error("統計失敗"));
    });
    const controller = coursesModule.createCoursesModule(ctx.deps);
    await controller.fetchStats();
    assert.strictEqual(ctx.state.courses.total, 88);
    assert.deepStrictEqual(ctx.calls.toast, []);
    console.log("   ✓ 統計失敗包容驗證通過！\n");
  }

  console.log("2.1 統計回應失敗或缺少 API 時應安全略過...");
  {
    const ctx = createDeps();
    ctx.state.courses.total = 88;
    ctx.setResponder(function () {
      return Promise.resolve({ ok: false, total: 999 });
    });
    const controller = coursesModule.createCoursesModule(ctx.deps);
    await controller.fetchStats();
    assert.strictEqual(ctx.state.courses.total, 88, "失敗回應不應覆蓋總筆數");

    const missingApiCtx = createDeps();
    missingApiCtx.deps.MEA = { state: missingApiCtx.state, setState: missingApiCtx.MEA.setState };
    const missingApiController = coursesModule.createCoursesModule(missingApiCtx.deps);
    await missingApiController.fetchStats();
    assert.strictEqual(missingApiCtx.calls.apiCalls.length, 0);
    console.log("   ✓ 統計失敗情境驗證通過！\n");
  }

  console.log("2.2 統計 total 為 0 時應明確寫入零值...");
  {
    const ctx = createDeps();
    ctx.state.courses.total = 50;
    ctx.setResponder(function () {
      return Promise.resolve({ ok: true, total: 0 });
    });
    const controller = coursesModule.createCoursesModule(ctx.deps);
    await controller.fetchStats();
    assert.strictEqual(ctx.state.courses.total, 0);
    console.log("   ✓ 零筆數驗證通過！\n");
  }

  console.log("3. 相同參數的並行清單請求應只送出一次且共享結果...");
  {
    const ctx = createDeps();
    const deferred = createDeferred();
    ctx.setResponder(function (action) {
      if (action === "getCourseIndex") return deferred.promise;
      return Promise.resolve({ ok: true });
    });
    const controller = coursesModule.createCoursesModule(ctx.deps);
    const first = controller.fetchList(2);
    const second = controller.fetchList(2);
    assert.strictEqual(first, second, "應回傳同一個 Promise");
    assert.strictEqual(ctx.calls.apiCalls.length, 1, "實際只送出一次 API 呼叫");
    deferred.resolve({
      ok: true,
      list: [{ courseCode: "C1" }],
      total: 99,
      page: 2,
      pageSize: 30,
      totalPages: 4
    });
    await first;
    await flush();
    assert.strictEqual(ctx.state.courses.total, 99);
    assert.strictEqual(ctx.state.courses.list[0].courseCode, "C1");
    console.log("   ✓ 相同參數避免重複驗證通過！\n");
  }

  console.log("4. 不同參數應各自送出請求，完成後相同參數可再次請求...");
  {
    const ctx = createDeps();
    ctx.setResponder(function () {
      return Promise.resolve({
        ok: true,
        list: [],
        total: 1,
        page: 1,
        pageSize: 30,
        totalPages: 1
      });
    });
    const controller = coursesModule.createCoursesModule(ctx.deps);
    const p1 = controller.fetchList(1);
    const p2 = controller.fetchList(2);
    assert.strictEqual(ctx.calls.apiCalls.length, 2, "不同頁碼應分別送出");
    assert.notStrictEqual(p1, p2);
    await Promise.all([p1, p2]);
    const p3 = controller.fetchList(2);
    assert.notStrictEqual(p3, p2, "請求完成後應清除避免重複記錄");
    await p3;
    assert.strictEqual(ctx.calls.apiCalls.length, 3);
    console.log("   ✓ 不同參數與避免重複清理驗證通過！\n");
  }

  console.log("5. 清單請求失敗時也應清除避免重複記錄...");
  {
    const ctx = createDeps();
    const deferred = createDeferred();
    ctx.setResponder(function () {
      return deferred.promise;
    });
    const controller = coursesModule.createCoursesModule(ctx.deps);
    const p1 = controller.fetchList(1);
    deferred.reject(new Error("網路錯誤"));
    await p1;
    await flush();
    const p2 = controller.fetchList(1);
    assert.notStrictEqual(p2, p1);
    assert.strictEqual(ctx.calls.apiCalls.length, 2);
    await p2;
    console.log("   ✓ 失敗後重試驗證通過！\n");
  }

  console.log("✓ webapp/js/courses.js 統計與避免重複測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
