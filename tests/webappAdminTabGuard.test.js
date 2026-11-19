"use strict";

/**
 * webappAdminTabGuard.test.js（task 5.4）
 * 驗證 setTab()/buildBodyHtml() 對管理員頁籤的守門，
 * 防止直接竄改 state.tab 進入管理員頁籤。
 */

const assert = require("assert");
const appModule = require("../webapp/js/app.js");
const createDeps = require("./helpers/appControllerDeps.js").createDeps;

console.log("開始執行 webapp/js/app.js 管理員頁籤守門測試...\n");

function setup(user) {
  const ctx = createDeps();
  ctx.MEA.config.tabs = [
    { id: "overview", name: "概覽", icon: "📊" },
    { id: "courses", name: "課程", icon: "📚" },
    { id: "settings", name: "系統設定", icon: "⚙️" },
    { id: "activityLog", name: "操作日誌", icon: "📜", adminOnly: true }
  ];
  ctx.state.user = user;
  let activityFetch = 0;
  ctx.MEA.activityLog = {
    fetchList: function () {
      activityFetch++;
    },
    renderView: function () {
      return '<div id="activity-log-view"></div>';
    }
  };
  const app = appModule.createAppController(ctx.deps);
  return {
    ctx: ctx,
    app: app,
    getActivityFetch: function () {
      return activityFetch;
    }
  };
}

function run() {
  console.log("1. 管理員可正常切換至操作日誌並載入資料...");
  {
    const fixture = setup({ role: "admin" });
    fixture.app.setTab("activityLog");
    assert.strictEqual(fixture.ctx.state.tab, "activityLog");
    assert.strictEqual(fixture.getActivityFetch(), 1);
    const html = appModule.buildBodyHtml(fixture.ctx.MEA, "activityLog");
    assert(html.indexOf("activity-log-view") !== -1, "管理員應渲染操作日誌內容");
    console.log("   ✓ 管理員存取驗證通過！\n");
  }

  console.log("2. 非管理員 setTab 應導回概覽且不觸發載入...");
  {
    const fixture = setup({ role: "viewer" });
    fixture.app.setTab("activityLog");
    assert.strictEqual(fixture.ctx.state.tab, "overview", "非管理員應被導回概覽");
    assert.strictEqual(fixture.getActivityFetch(), 0, "非管理員不應載入操作日誌");
    console.log("   ✓ 非管理員 setTab 守門驗證通過！\n");
  }

  console.log("3. 直接竄改 state.tab 時 buildBodyHtml 應退回概覽...");
  {
    const fixture = setup({ role: "staff" });
    fixture.ctx.state.tab = "activityLog";
    const html = appModule.buildBodyHtml(fixture.ctx.MEA, fixture.ctx.state.tab);
    assert(html.indexOf("activity-log-view") === -1, "非管理員不應看到操作日誌內容");
    assert(html.indexOf("overview-view") !== -1, "應退回概覽內容");

    const unauthenticated = setup(null);
    unauthenticated.ctx.state.tab = "activityLog";
    const html2 = appModule.buildBodyHtml(unauthenticated.ctx.MEA, unauthenticated.ctx.state.tab);
    assert(html2.indexOf("activity-log-view") === -1, "未登入者不應看到操作日誌內容");
    assert(html2.indexOf("overview-view") !== -1);
    console.log("   ✓ 直接竄改防護驗證通過！\n");
  }

  console.log("4. 未知頁籤與一般頁籤維持原行為...");
  {
    const fixture = setup({ role: "viewer" });
    fixture.app.setTab("courses");
    assert.strictEqual(fixture.ctx.state.tab, "courses");
    assert.strictEqual(fixture.ctx.calls.fetchList, 1);
    fixture.app.setTab("unknownTab");
    assert.strictEqual(fixture.ctx.state.tab, "unknownTab", "未知頁籤無 adminOnly 旗標，維持原行為");
    console.log("   ✓ 一般頁籤行為驗證通過！\n");
  }

  console.log("✓ webapp/js/app.js 管理員頁籤守門測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
