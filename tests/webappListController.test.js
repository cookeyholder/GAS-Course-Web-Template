"use strict";

/**
 * webappListController.test.js（task 6.3）
 * 驗證共用列表控制器的預設回呼、請求序號防護、避免重複與分頁渲染。
 */

const assert = require("assert");
const listControllerModule = require("../webapp/js/listController.js");
const createListController = listControllerModule.createListController;

/** 建立可手動控制的 Promise。 */
function createDeferred() {
  let resolveFn;
  let rejectFn;
  const promise = new Promise(function (resolve, reject) {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return { promise: promise, resolve: resolveFn, reject: rejectFn };
}

/** 建立控制器測試資源。 */
function makeController(overrides) {
  const state = { page: 1, total: 0, list: [], loading: false };
  const calls = { states: [], toasts: [], api: [] };
  const config = Object.assign(
    {
      getState: function () {
        return state;
      },
      setState: function (next) {
        Object.assign(state, next);
        calls.states.push(Object.assign({}, next));
      },
      callApi: function (action, payload) {
        calls.api.push({ action: action, payload: payload });
        return Promise.resolve({ ok: true, list: [], total: 0 });
      },
      toast: function (message, kind) {
        calls.toasts.push({ message: message, kind: kind });
      }
    },
    overrides || {}
  );
  return { ctl: createListController(config), state: state, calls: calls };
}

async function run() {
  console.log("1. 模組匯出與完全預設設定應安全降級...");
  {
    assert.strictEqual(typeof createListController, "function");
    const ctl = createListController();
    assert.strictEqual(await ctl.fetchList(), null, "缺少 API 時應回傳 null 而非拋錯");
    ctl.handleSearch({ preventDefault: function () {} });
    ctl.resetSearch();
    const html = ctl.renderPagination({ total: 5, currentPage: 2, totalPages: 3 }, false);
    assert(html.indexOf("共 5 筆紀錄 · 第 2 / 3 頁") !== -1);
    assert(html.indexOf('data-action="page"') !== -1, "預設應使用通用 data-action");
    assert(html.indexOf('data-page="1"') !== -1);
    assert(html.indexOf(" disabled") === -1);
    console.log("   ✓ 預設回呼驗證通過！\n");
  }

  console.log("2. 成功回應應合併狀態並套用預設成功片段...");
  {
    const ctx = makeController();
    await ctx.ctl.fetchList(2);
    assert.strictEqual(ctx.calls.api[0].action, "");
    assert.deepStrictEqual(ctx.calls.api[0].payload, { page: 2 });
    assert.strictEqual(ctx.state.loading, false);
    assert.strictEqual(ctx.calls.states.length, 2, "載入中與完成各更新一次");
    console.log("   ✓ 成功回應驗證通過！\n");
  }

  console.log("3. 失敗回應與例外皆應轉譯為安全文案...");
  {
    const ctx = makeController({
      callApi: function () {
        return Promise.resolve({ ok: false, message: "後端原始訊息" });
      }
    });
    await ctx.ctl.fetchList(1);
    assert.strictEqual(ctx.calls.toasts[0].message, "後端原始訊息");

    const errorCtx = makeController({
      callApi: function () {
        return Promise.reject(new Error("機密堆疊"));
      }
    });
    await errorCtx.ctl.fetchList(1);
    assert.strictEqual(errorCtx.calls.toasts[0].message, "讀取資料失敗，請稍後再試");
    assert.strictEqual(errorCtx.state.loading, false);
    console.log("   ✓ 失敗文案驗證通過！\n");
  }

  console.log("4. 自訂回呼應套用於查詢、篩選、重設與成功片段...");
  {
    const ctx = makeController({
      apiAction: "getList",
      buildQuery: function (state, page) {
        return { keyword: state.keyword || "", page: page };
      },
      buildSuccessPatch: function (state, result, page) {
        return { list: result.rows || [], page: page, loading: false };
      },
      readFilters: function () {
        return { keyword: "關鍵字" };
      },
      buildResetPatch: function () {
        return { keyword: "" };
      },
      buildSearchExtraPatch: function () {
        return { expanded: {} };
      },
      callApi: function (action, payload) {
        ctx.calls.api.push({ action: action, payload: payload });
        return Promise.resolve({ ok: true, rows: ["列"] });
      }
    });
    ctx.state.keyword = "既有";
    await ctx.ctl.handleSearch({ preventDefault: function () {} });
    assert.strictEqual(ctx.state.keyword, "關鍵字");
    assert.deepStrictEqual(ctx.state.list, ["列"]);
    assert.deepStrictEqual(ctx.state.expanded, {});
    assert.strictEqual(ctx.calls.api[0].action, "getList");
    assert.deepStrictEqual(ctx.calls.api[0].payload, { keyword: "關鍵字", page: 1 });

    await ctx.ctl.resetSearch();
    assert.strictEqual(ctx.state.keyword, "");
    console.log("   ✓ 自訂回呼驗證通過！\n");
  }

  console.log("5. 過期回應不得覆蓋較新請求結果...");
  {
    const oldResponse = createDeferred();
    const newResponse = createDeferred();
    const ctx = makeController({
      callApi: function (action, payload) {
        ctx.calls.api.push(payload);
        return payload.page === 1 ? oldResponse.promise : newResponse.promise;
      },
      buildSuccessPatch: function (state, result, page) {
        return { list: [result.label], page: page, loading: false };
      },
      normalizePage: function (requested, state) {
        return Math.max(1, requested || state.page || 1);
      }
    });
    const oldFetch = ctx.ctl.fetchList(1);
    const newFetch = ctx.ctl.fetchList(2);
    newResponse.resolve({ ok: true, label: "新" });
    await newFetch;
    oldResponse.resolve({ ok: true, label: "舊" });
    await oldFetch;
    assert.deepStrictEqual(ctx.state.list, ["新"]);
    assert.strictEqual(ctx.ctl.isCurrentRequest(1), false);
    assert.strictEqual(ctx.ctl.isCurrentRequest(2), true);
    console.log("   ✓ 請求序號防護驗證通過！\n");
  }

  console.log("6. 避免重複鍵共享 Promise，完成或失敗後皆清除...");
  {
    const deferred = createDeferred();
    const ctx = makeController({
      buildFetchKey: function (query) {
        return JSON.stringify(query);
      },
      callApi: function () {
        ctx.calls.api.push({});
        return deferred.promise;
      }
    });
    const first = ctx.ctl.fetchList(1);
    const second = ctx.ctl.fetchList(1);
    assert.strictEqual(first, second, "同參數請求應共享 Promise");
    assert.strictEqual(ctx.calls.api.length, 1);
    deferred.resolve({ ok: true, list: [], total: 0 });
    await first;
    const third = ctx.ctl.fetchList(1);
    assert.notStrictEqual(third, first, "完成後應清除避免重複記錄");
    await third;

    const failure = createDeferred();
    const failCtx = makeController({
      buildFetchKey: function (query) {
        return JSON.stringify(query);
      },
      callApi: function () {
        return failure.promise;
      }
    });
    const p1 = failCtx.ctl.fetchList(1);
    failure.reject(new Error("失敗"));
    await p1;
    const p2 = failCtx.ctl.fetchList(1);
    assert.notStrictEqual(p2, p1, "失敗後也應清除避免重複記錄");
    await p2;
    console.log("   ✓ 避免重複記錄驗證通過！\n");
  }

  console.log("7. API 不可用時不更新狀態亦不顯示錯誤...");
  {
    const ctx = makeController({
      canCallApi: function () {
        return false;
      }
    });
    assert.strictEqual(await ctx.ctl.fetchList(1), null);
    assert.strictEqual(ctx.calls.api.length, 0);
    assert.strictEqual(ctx.calls.states.length, 0);
    assert.strictEqual(ctx.calls.toasts.length, 0);
    console.log("   ✓ API 不可用降級驗證通過！\n");
  }

  console.log("8. 分頁渲染應依自訂設定標記停用狀態...");
  {
    const ctl = createListController({
      pagination: {
        actionAttribute: "data-list-action",
        number: function (value) {
          return "[" + value + "]";
        },
        normalize: function (state) {
          return { total: state.total, currentPage: state.page, totalPages: state.totalPages };
        }
      }
    });
    const html = ctl.renderPagination({ total: 9, page: 1, totalPages: 1 }, true);
    assert(html.indexOf("共 [9] 筆紀錄 · 第 1 / 1 頁") !== -1);
    assert(html.indexOf('data-list-action="page"') !== -1);
    assert.strictEqual((html.match(/ disabled/g) || []).length, 2, "載入中兩頁按鈕皆停用");
    console.log("   ✓ 分頁渲染驗證通過！\n");
  }

  console.log("✓ webapp/js/listController.js 共用控制器測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
