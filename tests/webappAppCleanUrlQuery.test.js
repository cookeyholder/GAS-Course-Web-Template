"use strict";

/**
 * webapp/js/app.js cleanUrlQuery / init 單元測試（G5.6）。
 */

const assert = require("assert");
const appModule = require("../webapp/js/app.js");
const createDeps = require("./helpers/appControllerDeps.js").createDeps;

console.log("開始執行 webapp/js/app.js 網址清理與啟動測試...\n");

async function run() {
  const ctx = createDeps();
  const app = appModule.createAppController(ctx.deps);
  app.cleanUrlQuery();
  assert.deepStrictEqual(ctx.calls.historyReplace, {
    s: {},
    t: "old",
    url: "https://x.test/app"
  });

  const denied = createDeps();
  denied.deps.window.top.history.replaceState = function () {
    throw new Error("deny");
  };
  const deniedApp = appModule.createAppController(denied.deps);
  assert.doesNotThrow(function () {
    deniedApp.cleanUrlQuery();
  });
  console.log("1. 清除 query/hash 並容錯 history 例外 ✓\n");

  const first = createDeps();
  const firstApp = appModule.createAppController(first.deps);
  await firstApp.init();
  assert.strictEqual(first.calls.initThemeAndStyle, 1);
  assert.strictEqual(typeof first.calls.subscribe, "function");
  assert.strictEqual(first.state.publicConfig.systemName, "SYS");
  assert.strictEqual(first.calls.restore, 1);
  assert.deepStrictEqual(first.calls.apiCalls, [{ action: "getPublicConfig", payload: {} }]);

  const initial = createDeps();
  initial.deps.window.INITIAL_AUTH = { ok: true, user: { name: "B" } };
  const initialApp = appModule.createAppController(initial.deps);
  await initialApp.init();
  assert.strictEqual(initial.calls.applyLoginSuccess.length, 1);
  assert.strictEqual(initial.calls.restore, 0);

  const switched = createDeps();
  switched.MEA.config.switchAccount = true;
  const switchedApp = appModule.createAppController(switched.deps);
  await switchedApp.init();
  assert.strictEqual(switched.calls.loginActiveUser, 1);
  assert.strictEqual(switched.calls.restore, 0);

  const failed = createDeps();
  failed.MEA.api.call = function () {
    return Promise.reject(new Error("net"));
  };
  const failedApp = appModule.createAppController(failed.deps);
  await failedApp.init();
  assert.strictEqual(failed.calls.restore, 1);
  console.log("2. 啟動流程依序處理設定、初始授權、切換帳號與還原 ✓\n");

  console.log("✓ webapp/js/app.js 網址清理與啟動測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
