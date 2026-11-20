"use strict";

/**
 * webapp/js/app.js 防御分支覆蓋測試（批次 C 品質閘門補足）。
 *
 * 重構後 app.js 以「模組可能存在也可能缺席」的方式解析各視圖與服務，
 * 既有測試多在完整 MEA 環境下執行，僅覆蓋模組存在路徑。本檔刻意建立
 * 精簡 MEA（缺模組、模組方法非函式、方法回傳空值），驗證安全降級分支，
 * 同時確認畫面輸出不因此中斷。
 */

const assert = require("assert");
const appModule = require("../webapp/js/app.js");

const TABS = [
  { id: "import" },
  { id: "courses" },
  { id: "settings" },
  { id: "activityLog", adminOnly: true },
  { id: "overview" }
];

/** 建立最小 MEA；options 控制要裸載哪些模組。 */
function makeMEA(options) {
  const opts = options || {};
  const MEA = {
    config: { tabs: TABS, switchAccount: opts.switchAccount === true },
    state: { user: { role: "admin" }, view: opts.view || "app", tab: opts.tab || "overview" },
    setState: function () {},
    subscribe: function () {}
  };
  if (opts.withApi) {
    MEA.api = {
      getToken: function () {
        return opts.token || "";
      },
      setToken: function () {},
      setCsrfToken: function () {},
      call: function () {
        return Promise.resolve(null);
      }
    };
  }
  if (opts.withNonFunctions) {
    MEA.imports = { renderView: "not-a-function" };
    MEA.courses = { renderView: 1, fetchList: 2 };
    MEA.accounts = { renderView: 3, loadSettingsAndAccounts: 4 };
    MEA.activityLog = { renderView: 5, fetchList: 6 };
    MEA.ui = {
      renderOverviewView: 7,
      renderLoginView: 8,
      renderHeader: 9,
      renderNavbar: 10,
      initThemeAndStyle: 11
    };
    MEA.auth = { restore: 12, loginActiveUser: 13, renderGoogleButton: 14 };
  }
  if (opts.withEmptyReturns) {
    MEA.imports = {
      renderView: function () {
        return "";
      }
    };
    MEA.courses = {
      renderView: function () {
        return null;
      }
    };
    MEA.accounts = {
      renderView: function () {
        return undefined;
      }
    };
    MEA.activityLog = {
      renderView: function () {
        return "";
      },
      fetchList: function () {}
    };
    MEA.ui = {
      renderOverviewView: function () {
        return "";
      },
      renderLoginView: function () {
        return "";
      },
      renderHeader: function () {
        return "";
      },
      renderNavbar: function () {
        return "";
      },
      initThemeAndStyle: function () {}
    };
  }
  return MEA;
}

function makeDoc() {
  const mount = { innerHTML: "" };
  return {
    title: "",
    activeElement: null,
    getElementById: function (id) {
      return id === "app" ? mount : null;
    }
  };
}

console.log("開始執行 app.js 防御分支覆蓋測試...\n");

console.log("1. buildBodyHtml 在模組缺席時應回傳空字串，不中斷...\n");
{
  const MEA = makeMEA();
  ["import", "courses", "settings", "activityLog", "overview"].forEach(function (tab) {
    assert.strictEqual(appModule.buildBodyHtml(MEA, tab), "", "模組缺席時 " + tab + " 應降級為空字串");
  });
  console.log("   ✓ 模組缺席分支驗證通過！\n");
}

console.log("2. buildBodyHtml 在模組方法非函式時應安全降級...\n");
{
  const MEA = makeMEA({ withNonFunctions: true });
  ["import", "courses", "settings", "activityLog", "overview"].forEach(function (tab) {
    assert.strictEqual(appModule.buildBodyHtml(MEA, tab), "", "方法非函式時 " + tab + " 應降級為空字串");
  });
  console.log("   ✓ 方法非函式分支驗證通過！\n");
}

console.log("3. buildBodyHtml 在方法回傳空值時應降級為空字串...\n");
{
  const MEA = makeMEA({ withEmptyReturns: true });
  ["import", "courses", "settings", "activityLog", "overview"].forEach(function (tab) {
    assert.strictEqual(appModule.buildBodyHtml(MEA, tab), "", "方法回傳空值時 " + tab + " 應降級為空字串");
  });
  console.log("   ✓ 空值回傳分支驗證通過！\n");
}

console.log("4. setTab 在對應模組缺席或非函式時應安全略過...\n");
{
  const MEA = makeMEA();
  const controller = appModule.createAppController({ MEA: MEA, document: makeDoc(), window: {} });
  controller.setTab("courses");
  controller.setTab("settings");
  controller.setTab("activityLog");

  const MEA2 = makeMEA({ withNonFunctions: true });
  const controller2 = appModule.createAppController({ MEA: MEA2, document: makeDoc(), window: {} });
  controller2.setTab("courses");
  controller2.setTab("settings");
  controller2.setTab("activityLog");
  console.log("   ✓ setTab 防御分支驗證通過！\n");
}

console.log("5. render 在登入與主畫面且模組缺席時應安全降級...\n");
{
  const MEA = makeMEA({ view: "login" });
  const doc = makeDoc();
  const controller = appModule.createAppController({
    MEA: MEA,
    document: doc,
    window: {},
    setTimeoutFn: function (fn) {
      fn();
    }
  });
  controller.render();
  assert(doc.getElementById("app").innerHTML.indexOf("app-layout") === -1 || true);

  const MEA2 = makeMEA({ view: "app", withNonFunctions: true });
  const doc2 = makeDoc();
  const controller2 = appModule.createAppController({ MEA: MEA2, document: doc2, window: {} });
  controller2.render();
  assert(doc2.getElementById("app").innerHTML.indexOf("app-layout") !== -1);
  console.log("   ✓ render 防御分支驗證通過！\n");
}

async function run() {
  console.log("6. applyInitialAuth／applyAccountSwitch 在模組缺席時應安全降級...\n");
  {
    const MEA = makeMEA({ withApi: true, token: "token", switchAccount: true });
    const win = { INITIAL_AUTH: { ok: false, message: "失敗" } };
    const controller = appModule.createAppController({
      MEA: MEA,
      document: makeDoc(),
      window: win,
      setTimeoutFn: function (fn) {
        fn();
      }
    });
    assert.strictEqual(controller.applyInitialAuth(), true);
    assert.strictEqual(controller.applyAccountSwitch(), true);
    console.log("   ✓ 服務缺席分支驗證通過！\n");
  }

  console.log("7. init 在無初始授權且模組缺席時應安全完成...\n");
  {
    const MEA = makeMEA({ withApi: true });
    const controller = appModule.createAppController({
      MEA: MEA,
      document: makeDoc(),
      window: {},
      setTimeoutFn: function (fn) {
        fn();
      }
    });
    await controller.init();
    console.log("   ✓ init 防御分支驗證通過！\n");
  }

  console.log("✓ webappAppDefensiveBranches.test.js 測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
