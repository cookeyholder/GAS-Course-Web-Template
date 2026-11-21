"use strict";

/**
 * webappActivityLogBranchCoverage.test.js（task 6.3）
 * 補足 webapp/js/activityLog.js 的防禦性與降級分支覆蓋率：
 * 無依賴工廠、缺少表單元素、API 不可用、失敗結果、邊界渲染等情境。
 */

const assert = require("assert");

// 以瀏覽器全域環境載入模組，覆蓋 UMD 的 window 分支（行 12）。
global.window = {
  MEA: null,
  document: {}
};
global.document = global.window.document;

const activityLogModule = require("../webapp/js/activityLog.js");
const realUi = require("../webapp/js/ui.js");
require("../webapp/js/errorMessages.js");

/** 建立完整的 MEA mock，供需要 ui/setState 的情境使用。 */
function makeMea(initialState) {
  const state = Object.assign(
    {
      activityLog: Object.assign(
        {
          list: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          email: "",
          category: "",
          loading: false,
          expanded: {}
        },
        initialState || {}
      )
    },
    {}
  );
  const calls = { api: [], toasts: [], sets: [] };
  const elements = {};
  const mea = {
    state: state,
    setState: function (patch) {
      Object.assign(state, patch);
      calls.sets.push(patch);
    },
    api: {
      call: function (action, payload) {
        calls.api.push({ action: action, payload: payload });
        return Promise.resolve({ ok: true, rows: [], total: 0, page: 1, pageSize: 50 });
      }
    },
    ui: Object.assign({}, realUi, {
      escapeHtml: function (value) {
        return String(value === undefined || value === null ? "" : value);
      },
      number: function (value) {
        return String(value === undefined || value === null ? "" : value);
      },
      toast: function (message, kind) {
        calls.toasts.push({ message: message, kind: kind });
      }
    })
  };
  return {
    mea: mea,
    state: state,
    calls: calls,
    elements: elements,
    deps: {
      MEA: mea,
      document: {
        getElementById: function (id) {
          return Object.prototype.hasOwnProperty.call(elements, id) ? elements[id] : null;
        }
      }
    }
  };
}

async function run() {
  console.log("1. 無參數工廠應使用 window 全域並容忍缺少 getElementById...\n");
  {
    const browserMea = makeMea();
    global.window.MEA = browserMea.mea;
    global.document = {};
    const mod = activityLogModule.createActivityLogModule();
    const html = mod.renderView();
    assert(html.indexOf("操作日誌") !== -1);
    assert(html.indexOf('value="2026-01-01"') !== -1, "應使用預設日期區間");
    global.document = global.window.document;
    console.log("   ✓ 無參數工廠與降級文件驗證通過！\n");
  }

  console.log("2. 完全無 window/document 時工廠應安全降級...\n");
  {
    const savedWindow = global.window;
    const savedDocument = global.document;
    delete global.window;
    delete global.document;
    const mod = activityLogModule.createActivityLogModule();
    assert.strictEqual(typeof mod.renderView, "function");
    global.window = savedWindow;
    global.document = savedDocument;
    console.log("   ✓ 無全域環境降級驗證通過！\n");
  }

  console.log("3. 缺少 state.activityLog 與部分欄位時應補預設值...\n");
  {
    const ctx = makeMea();
    ctx.state.activityLog = undefined;
    const mod = activityLogModule.createActivityLogModule(ctx.deps);
    const html = mod.renderView();
    assert(html.indexOf("目前沒有符合條件的操作日誌") !== -1);
    assert(/value="\d{4}-\d{2}-\d{2}"/.test(html), "應補上預設日期");
    console.log("   ✓ 缺損狀態補預設驗證通過！\n");
  }

  console.log("4. 缺少表單元素與空值時 readFilterFormValues 應降級...\n");
  {
    const ctx = makeMea();
    const mod = activityLogModule.createActivityLogModule(ctx.deps);
    await mod.handleSearch({ preventDefault: function () {} });
    const payload = ctx.calls.api[0].payload;
    assert(/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate));
    assert(/^\d{4}-\d{2}-\d{2}$/.test(payload.endDate));
    assert.strictEqual(payload.email, "");
    assert.strictEqual(payload.category, "");

    ctx.elements.activityLogStartDate = { value: "" };
    ctx.elements.activityLogEndDate = { value: "" };
    ctx.elements.activityLogEmail = { value: "" };
    ctx.elements.activityLogCategory = { value: "" };
    await mod.handleSearch({ preventDefault: function () {} });
    assert(/^\d{4}-\d{2}-\d{2}$/.test(ctx.calls.api[1].payload.startDate));
    console.log("   ✓ 表單元素降級驗證通過！\n");
  }

  console.log("5. API 不可用時 fetchList 應回傳 null 而不拋錯...\n");
  {
    const ctx = makeMea();
    ctx.mea.api = undefined;
    const mod = activityLogModule.createActivityLogModule(ctx.deps);
    const result = await mod.fetchList();
    assert.strictEqual(result, null);
    assert.strictEqual(ctx.calls.api.length, 0);
    console.log("   ✓ API 不可用降級驗證通過！\n");
  }

  console.log("6. 失敗結果缺少 message 或為 null 時應顯示安全文案...\n");
  {
    const ctx = makeMea();
    const mod = activityLogModule.createActivityLogModule(ctx.deps);
    ctx.mea.api.call = function () {
      return Promise.resolve({ ok: false });
    };
    await mod.fetchList(1);
    assert.strictEqual(ctx.calls.toasts[0].message, "讀取操作日誌失敗");

    ctx.mea.api.call = function () {
      return Promise.resolve(null);
    };
    await mod.fetchList(1);
    assert.strictEqual(ctx.calls.toasts[1].message, "讀取操作日誌失敗");
    console.log("   ✓ 失敗結果安全文案驗證通過！\n");
  }

  console.log("7. 失敗結果應以安全訊息層轉譯例外...\n");
  {
    const ctx = makeMea();
    const mod = activityLogModule.createActivityLogModule(ctx.deps);
    ctx.mea.api.call = function () {
      const error = new Error("機密堆疊");
      error.safeMessage = "自訂安全訊息";
      return Promise.reject(error);
    };
    await mod.fetchList(1);
    assert.strictEqual(ctx.calls.toasts[0].message, "自訂安全訊息");
    console.log("   ✓ 例外安全轉譯驗證通過！\n");
  }

  console.log("8. 失敗結果、空識別碼、選中類別與可點擊分頁應正確渲染...\n");
  {
    const ctx = makeMea({
      list: [
        {
          timestamp: "2026-11-19 10:00:00",
          category: "write",
          action: "寫入",
          result: "error",
          email: "u@example.com",
          summary: "失敗摘要",
          detail: "{}",
          durationMs: 5
        }
      ],
      total: 100,
      page: 2,
      totalPages: 5,
      category: "write",
      expanded: { "": true }
    });
    const mod = activityLogModule.createActivityLogModule(ctx.deps);
    const html = mod.renderView();
    assert(html.indexOf('aria-expanded="true"') !== -1);
    assert(html.indexOf("失敗") !== -1, "失敗結果應顯示失敗");
    assert(html.indexOf('value="write" selected') !== -1, "類別應被選中");

    mod.toggleDetail("");
    assert.strictEqual(ctx.state.activityLog.expanded[""], false, "空識別碼應可切換");
    console.log("   ✓ 邊界渲染與空識別碼驗證通過！\n");
  }

  console.log("9. Intl 失效時 formatTaipeiDate 應以 UTC+8 降級...\n");
  {
    const OriginalIntl = global.Intl;
    global.Intl = {
      DateTimeFormat: function () {
        throw new Error("Intl unavailable");
      }
    };
    try {
      const date = new Date("2026-11-19T16:30:00Z");
      assert.strictEqual(activityLogModule.formatTaipeiDate(date), "2026-11-20");
    } finally {
      global.Intl = OriginalIntl;
    }
    console.log("   ✓ 時區格式化降級驗證通過！\n");
  }

  console.log("✓ webapp/js/activityLog.js 分支覆蓋補足測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
