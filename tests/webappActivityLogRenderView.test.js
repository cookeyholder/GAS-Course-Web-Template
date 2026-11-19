"use strict";

/**
 * webappActivityLogRenderView.test.js（task 5.2）
 * 驗證操作日誌模組的渲染、篩選、分頁、詳情展開與無障礙屬性。
 */

const assert = require("assert");
const activityLogModule = require("../webapp/js/activityLog.js");
require("../webapp/js/errorMessages.js");

console.log("開始執行 webapp/js/activityLog.js renderView 測試...\n");

const ROLE_NAMES = {
  admin: "系統管理員",
  staff: "業務人員",
  viewer: "檢視人員"
};

function createDeps(initialState) {
  const state = Object.assign(
    {
      activityLog: {
        list: [],
        total: 0,
        page: 1,
        pageSize: 50,
        totalPages: 1,
        startDate: "",
        endDate: "",
        email: "",
        category: "",
        loading: false,
        expanded: {}
      }
    },
    initialState || {}
  );
  const calls = { apiCalls: [], toasts: [], setState: [] };
  const elements = {};
  let responder = function () {
    return Promise.resolve({ ok: true });
  };

  const MEA = {
    state: state,
    config: { roleNames: ROLE_NAMES },
    setState: function (patch) {
      Object.assign(state, patch);
      calls.setState.push(Object.assign({}, patch));
    },
    api: {
      call: function (action, payload) {
        calls.apiCalls.push({ action: action, payload: payload });
        return responder(action, payload);
      }
    },
    ui: {
      escapeHtml: function (value) {
        return String(value === undefined || value === null ? "" : value)
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;")
          .replace(/'/g, "&#39;");
      },
      number: function (value) {
        return String(value);
      },
      toast: function (message, kind) {
        calls.toasts.push({ message: message, kind: kind });
      }
    }
  };

  return {
    MEA: MEA,
    state: state,
    calls: calls,
    elements: elements,
    deps: {
      MEA: MEA,
      document: {
        getElementById: function (id) {
          return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null;
        }
      }
    },
    setResponder: function (fn) {
      responder = fn;
    }
  };
}

function run() {
  assert.strictEqual(typeof activityLogModule.createActivityLogModule, "function", "應匯出可測試的模組工廠");
  console.log("1. 應匯出可測試的模組工廠 ✓\n");

  const ctx = createDeps();
  const log = activityLogModule.createActivityLogModule(ctx.deps);

  ctx.state.activityLog = {
    list: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    startDate: "2026-11-13",
    endDate: "2026-11-19",
    email: "",
    category: "",
    loading: false,
    expanded: {}
  };
  let html = log.renderView();
  assert(html.indexOf("操作日誌") !== -1);
  assert(html.indexOf("目前沒有符合條件的操作日誌") !== -1);
  assert(html.indexOf('value="2026-11-13"') !== -1);
  assert(html.indexOf('value="2026-11-19"') !== -1);
  console.log("2. 空清單與預設日期區間 ✓\n");

  const thCount = (html.match(/<th scope="col">/g) || []).length;
  assert.strictEqual(thCount, 8, '八個表格標頭皆應具 scope="col"');
  ["activityLogStartDate", "activityLogEndDate", "activityLogEmail", "activityLogCategory"].forEach(function (id) {
    assert(html.indexOf('for="' + id + '"') !== -1, "篩選控制項 " + id + " 應有標籤");
  });
  assert(html.indexOf('onsubmit="MEA.activityLog.handleSearch(event)"') !== -1);
  assert(html.indexOf("MEA.activityLog.resetSearch()") !== -1);
  console.log("3. 表格標頭與篩選控制項無障礙屬性 ✓\n");

  ctx.state.activityLog = {
    list: [
      {
        timestamp: "2026-11-19 10:00:00",
        requestId: "req-1",
        category: "write",
        action: "儲存系統設定",
        result: "success",
        email: "admin@example.com",
        name: "管理員",
        role: "系統管理員",
        summary: "儲存系統設定成功",
        detail: '{"版本":1,"指標":{}}',
        durationMs: 12,
        errorCode: ""
      }
    ],
    total: 1,
    page: 1,
    pageSize: 50,
    totalPages: 1,
    startDate: "2000-01-01",
    endDate: "2099-12-31",
    email: "",
    category: "",
    loading: false,
    expanded: {}
  };
  html = log.renderView();
  assert(html.indexOf("2026-11-19 10:00:00") !== -1);
  assert(html.indexOf("儲存系統設定成功") !== -1);
  assert(html.indexOf("admin@example.com") !== -1);
  assert(html.indexOf('aria-expanded="false"') !== -1, "未展開按鈕應標記 false");
  assert(html.indexOf('aria-controls="activityLogDetail_0"') !== -1);
  assert(html.indexOf("<tr hidden>") !== -1, "未展開的詳情列應隱藏");
  assert(html.indexOf("共 1 筆紀錄 · 第 1 / 1 頁") !== -1);
  assert(html.indexOf("MEA.activityLog.toggleDetail('req-1')") !== -1);
  console.log("4. 日誌資料列與未展開詳情 ✓\n");

  ctx.state.activityLog.expanded = { "req-1": true };
  html = log.renderView();
  assert(html.indexOf('aria-expanded="true"') !== -1, "展開按鈕應標記 true");
  assert(html.indexOf("收起") !== -1);
  assert(
    html.indexOf('<tr><td colspan="8"><pre class="mono font-sm activity-log-detail" id="activityLogDetail_0">') !== -1
  );
  assert(html.indexOf("{&quot;版本&quot;:1,&quot;指標&quot;:{}}") !== -1, "詳情 JSON 應跳脫");
  console.log("5. 展開詳情與 JSON 跳脫 ✓\n");

  ctx.state.activityLog = {
    list: [],
    total: 100,
    page: 2,
    pageSize: 50,
    totalPages: 2,
    startDate: "2026-11-13",
    endDate: "2026-11-19",
    email: "",
    category: "",
    loading: true,
    expanded: {}
  };
  html = log.renderView();
  assert(html.indexOf("正在載入操作日誌...") !== -1);
  assert(html.indexOf('MEA.activityLog.fetchList(1)" disabled') !== -1);
  assert(html.indexOf('MEA.activityLog.fetchList(3)" disabled') !== -1);
  console.log("6. 載入中狀態與分頁停用 ✓\n");
}

const result = (async function () {
  run();

  console.log("7. fetchList 應呼叫 getActivityLog 並更新狀態...");
  {
    const ctx = createDeps();
    const log = activityLogModule.createActivityLogModule(ctx.deps);
    ctx.setResponder(function (action, payload) {
      assert.strictEqual(action, "getActivityLog");
      return Promise.resolve({
        ok: true,
        rows: [{ requestId: "req-x" }],
        total: 21,
        page: 1,
        pageSize: 50
      });
    });
    await log.fetchList(1);
    assert.strictEqual(ctx.calls.apiCalls.length, 1);
    assert.strictEqual(ctx.state.activityLog.total, 21);
    assert.strictEqual(ctx.state.activityLog.totalPages, 1);
    assert.deepStrictEqual(ctx.state.activityLog.list, [{ requestId: "req-x" }]);
    console.log("   ✓ 讀取與狀態更新驗證通過！\n");
  }

  console.log("8. 分頁上限與失敗處理...");
  {
    const ctx = createDeps();
    const log = activityLogModule.createActivityLogModule(ctx.deps);
    ctx.state.activityLog.pageSize = 9999;
    ctx.setResponder(function () {
      return Promise.resolve({ ok: true, rows: [], total: 1200, page: 1, pageSize: 500 });
    });
    await log.fetchList(1);
    assert.strictEqual(ctx.calls.apiCalls[0].payload.pageSize, 500, "單次上限應為 500");
    assert.strictEqual(ctx.state.activityLog.totalPages, 3);

    ctx.setResponder(function () {
      return Promise.resolve({ ok: false, error: "forbidden", message: "無權限" });
    });
    await log.fetchList(1);
    assert.strictEqual(ctx.calls.toasts.length, 1);
    assert.strictEqual(ctx.calls.toasts[0].kind, "err");
    console.log("   ✓ 上限與失敗處理驗證通過！\n");
  }

  console.log("9. 篩選、重設與展開切換...");
  {
    const ctx = createDeps();
    const log = activityLogModule.createActivityLogModule(ctx.deps);
    ctx.elements.activityLogStartDate = { value: "2026-01-01" };
    ctx.elements.activityLogEndDate = { value: "2026-01-31" };
    ctx.elements.activityLogEmail = { value: "admin@example.com" };
    ctx.elements.activityLogCategory = { value: "write" };
    await log.handleSearch({ preventDefault: function () {} });
    assert.strictEqual(ctx.calls.apiCalls[0].payload.startDate, "2026-01-01");
    assert.strictEqual(ctx.calls.apiCalls[0].payload.email, "admin@example.com");
    assert.strictEqual(ctx.state.activityLog.category, "write");

    log.toggleDetail("req-9");
    assert.strictEqual(ctx.state.activityLog.expanded["req-9"], true);
    log.toggleDetail("req-9");
    assert.strictEqual(ctx.state.activityLog.expanded["req-9"], false);

    await log.resetSearch();
    assert.strictEqual(ctx.state.activityLog.email, "");
    assert.strictEqual(ctx.state.activityLog.category, "");
    assert(/^\d{4}-\d{2}-\d{2}$/.test(ctx.state.activityLog.startDate));
    console.log("   ✓ 篩選與切換驗證通過！\n");
  }

  console.log("10. Asia/Taipei 日期格式化...");
  {
    const utcDate = new Date("2026-11-19T16:30:00Z");
    assert.strictEqual(activityLogModule.formatTaipeiDate(utcDate), "2026-11-20");
    const range = activityLogModule.defaultDateRange();
    assert(/^\d{4}-\d{2}-\d{2}$/.test(range.startDate));
    assert(/^\d{4}-\d{2}-\d{2}$/.test(range.endDate));
    console.log("   ✓ 時區格式化驗證通過！\n");
  }

  console.log("✓ webapp/js/activityLog.js renderView 測試全數通過！\n");
})();

result.catch(function (error) {
  console.error(error);
  process.exit(1);
});
