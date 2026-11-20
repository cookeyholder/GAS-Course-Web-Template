"use strict";

/**
 * webappWiring.test.js（task 6.1）
 * 驗證前端單一組裝點 wiring.js：最小介面傳遞、模組建立順序、navigation/views
 * 組裝、全域別名回填與 init 觸發時機；並驗證各模組 UMD 外層改為註冊工廠。
 */

const assert = require("assert");
const path = require("path");

const WIRING_PATH = path.join(__dirname, "../webapp/js/wiring.js");
const MODULE_NAMES = ["ui", "auth", "imports", "courses", "accounts", "activityLog", "app"];

/** 在還原的全域環境中執行函式，避免測試間相互污染。 */
function withGlobals(windowValue, meaValue, fn) {
  const hadWindow = Object.prototype.hasOwnProperty.call(global, "window");
  const prevWindow = global.window;
  const hadMea = Object.prototype.hasOwnProperty.call(global, "MEA");
  const prevMea = global.MEA;
  try {
    if (windowValue) global.window = windowValue;
    else delete global.window;
    global.MEA = meaValue;
    return fn();
  } finally {
    if (hadWindow) global.window = prevWindow;
    else delete global.window;
    if (hadMea) global.MEA = prevMea;
    else delete global.MEA;
  }
}

/** 執行 wiring.js（清除快取以支援多次情境）。 */
function runWiring(windowValue, meaValue) {
  withGlobals(windowValue, meaValue, function () {
    delete require.cache[require.resolve(WIRING_PATH)];
    require(WIRING_PATH);
  });
  return meaValue;
}

/** 建立回傳間諜模組的工廠。 */
function makeModuleFactory(name, observed) {
  return function (deps) {
    observed.push(name);
    assert(deps.MEA, name + " 應收到 MEA 最小介面");
    return {
      renderView: function () {
        return "<div>" + name + "</div>";
      },
      renderNavbar: function () {
        return "<nav>";
      },
      renderOverviewView: function () {
        return "<overview>";
      },
      renderLoginView: function () {
        return "<login>";
      },
      renderHeader: function () {
        return "<header>";
      },
      initThemeAndStyle: function () {},
      fetchList: function () {},
      loadSettingsAndAccounts: function () {},
      fetchStats: function () {}
    };
  };
}

/** 建立測試用 window／document。 */
function makeWindow(readyState) {
  const registered = [];
  const doc = {
    readyState: readyState || "complete",
    addEventListener: function (evt, fn) {
      registered.push({ evt: evt, fn: fn });
    }
  };
  const win = {
    document: doc,
    setTimeout: function (fn) {
      fn();
    }
  };
  return { win: win, registered: registered };
}

function buildFactories(observed) {
  const factories = {};
  ["ui", "auth", "imports", "courses", "accounts", "activityLog"].forEach(function (name) {
    factories[name] = makeModuleFactory(name, observed);
  });
  return factories;
}

function buildMea(factories, overrides) {
  return Object.assign(
    {
      config: { tabs: [] },
      state: {},
      setState: function () {},
      subscribe: function () {},
      api: {},
      safeErrors: {},
      courseData: {},
      factories: factories
    },
    overrides || {}
  );
}

function run() {
  console.log("1. 無 window 環境應安全略過（Node 載入相容）...");
  {
    const emptyMea = {};
    runWiring(null, emptyMea);
    assert.deepStrictEqual(emptyMea, {});
    console.log("   ✓ 無 window 略過驗證通過！\n");
  }

  console.log("2. readyState=complete 時應組裝全部模組並立即 init...");
  {
    const observed = [];
    const env = makeWindow("complete");
    let initCalls = 0;
    const factories = buildFactories(observed);
    factories.app = function (deps) {
      observed.push("app");
      assert(deps.navigation, "app 應收到 navigation 最小介面");
      assert(deps.views, "app 應收到 views");
      assert.strictEqual(deps.navigation.setTab, null, "app 建立前 setTab 尚未回填");
      return {
        setTab: function () {},
        render: function () {},
        init: function () {
          initCalls++;
        }
      };
    };
    const mea = buildMea(factories);
    runWiring(env.win, mea);
    assert.deepStrictEqual(observed, ["ui", "auth", "imports", "courses", "accounts", "activityLog", "app"]);
    assert.strictEqual(initCalls, 1, "complete 時應立即 init 一次");
    ["ui", "auth", "imports", "courses", "accounts", "activityLog"].forEach(function (name) {
      assert(mea[name], name + " 應回填全域別名");
    });
    assert.strictEqual(typeof mea.setTab, "function", "MEA.setTab 應回填");
    assert.strictEqual(typeof mea.render, "function", "MEA.render 應回填");
    assert.strictEqual(typeof mea.init, "function", "MEA.init 應回填");
    assert.strictEqual(mea.ui.renderView(), "<div>ui</div>", "最小介面方法應可用");
    console.log("   ✓ 完整組裝驗證通過！\n");
  }

  console.log("3. readyState=loading 時應註冊 DOMContentLoaded，不立即 init...");
  {
    const env = makeWindow("loading");
    let initCalls = 0;
    const factories = buildFactories([]);
    factories.app = function () {
      return {
        setTab: function () {},
        render: function () {},
        init: function () {
          initCalls++;
        }
      };
    };
    const mea = buildMea(factories);
    runWiring(env.win, mea);
    assert.strictEqual(initCalls, 0, "loading 時不應立即 init");
    assert.strictEqual(env.registered.length, 1);
    assert.strictEqual(env.registered[0].evt, "DOMContentLoaded");
    env.registered[0].fn();
    assert.strictEqual(initCalls, 1, "DOMContentLoaded 觸發後應 init");
    console.log("   ✓ 延遲 init 驗證通過！\n");
  }

  console.log("4. 無 factories 時應退回既有 MEA 模組且不建立 app...");
  {
    const env = makeWindow("complete");
    const existing = {
      renderView: function () {
        return "既";
      }
    };
    const mea = buildMea({}, { ui: existing });
    runWiring(env.win, mea);
    assert.strictEqual(mea.ui, existing, "應保留既有 MEA.ui");
    assert.strictEqual(mea.setTab, undefined, "無 app 時不應回填 setTab");
    console.log("   ✓ 退回既有模組驗證通過！\n");
  }

  console.log("5. 模組缺少方法時 navigation/views 應安全回傳 null...");
  {
    const env = makeWindow("complete");
    const factories = buildFactories([]);
    factories.ui = function () {
      return {};
    };
    let captured = null;
    factories.app = function (deps) {
      captured = deps;
      return { setTab: function () {}, render: function () {}, init: function () {} };
    };
    const mea = buildMea(factories);
    runWiring(env.win, mea);
    assert.strictEqual(captured.navigation.renderNavbar, null);
    assert.strictEqual(captured.views.overview, null);
    console.log("   ✓ 缺失方法容錯驗證通過！\n");
  }

  console.log("6. 各模組 UMD 外層應註冊工廠（含 factories 已存在的分支）...");
  {
    const env = makeWindow("complete");
    function loadAll() {
      MODULE_NAMES.forEach(function (name) {
        const modulePath = path.join(__dirname, "../webapp/js/" + name + ".js");
        delete require.cache[require.resolve(modulePath)];
        require(modulePath);
      });
    }
    withGlobals(env.win, {}, function () {
      loadAll();
      assert(global.MEA.factories, "應建立 factories 集合");
      MODULE_NAMES.forEach(function (name) {
        assert.strictEqual(typeof global.MEA.factories[name], "function", name + " 工廠應註冊");
      });
    });
    withGlobals(env.win, { factories: { existing: true } }, function () {
      loadAll();
      assert.strictEqual(global.MEA.factories.existing, true, "應保留既有 factories");
    });
    // 逐一單獨載入且 MEA 尚未有 factories，覆蓋各模組的初始化分支。
    MODULE_NAMES.forEach(function (name) {
      withGlobals(env.win, undefined, function () {
        const modulePath = path.join(__dirname, "../webapp/js/" + name + ".js");
        delete require.cache[require.resolve(modulePath)];
        require(modulePath);
        assert.strictEqual(typeof global.MEA.factories[name], "function", "應建立 factories 並註冊 " + name);
      });
    });
    console.log("   ✓ UMD 工廠註冊驗證通過！\n");
  }

  console.log("7. gasRuntime 全域不存在時應退回 require（模組載入相容）...");
  {
    const env = makeWindow("complete");
    const prevGasRuntime = globalThis.gasRuntime;
    delete globalThis.gasRuntime;
    try {
      withGlobals(env.win, {}, function () {
        const modulePath = path.join(__dirname, "../webapp/js/accounts.js");
        delete require.cache[require.resolve(modulePath)];
        require(modulePath);
        assert.strictEqual(typeof global.MEA.factories.accounts, "function", "退回 require 後仍應註冊工廠");
      });
    } finally {
      if (prevGasRuntime !== undefined) globalThis.gasRuntime = prevGasRuntime;
    }
    console.log("   ✓ gasRuntime 退回驗證通過！\n");
  }

  console.log("✓ webapp/js/wiring.js 組裝測試全數通過！\n");
}

run();
