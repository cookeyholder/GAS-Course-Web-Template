"use strict";

/**
 * webapp/js/state.js 單元測試（task 4.6）。
 * 以 vm 模擬瀏覽器 window，驗證狀態合併、訂閱順序、例外隔離與取消訂閱。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

function createStateModule() {
  const source = fs.readFileSync(path.join(__dirname, "..", "webapp", "js", "state.js"), "utf8");
  const errors = [];
  const win = { MEA: {} };
  const sandbox = {
    window: win,
    console: {
      error: function (message, error) {
        errors.push({ message: message, error: error });
      }
    }
  };
  vm.runInNewContext(source, sandbox, { filename: "state.js" });
  return { MEA: win.MEA, errors: errors };
}

function run() {
  console.log("1. 初始狀態應包含完整欄位...");
  const ctx = createStateModule();
  const MEA = ctx.MEA;
  assert.strictEqual(typeof MEA.setState, "function");
  assert.strictEqual(typeof MEA.subscribe, "function");
  assert.strictEqual(MEA.state.view, "loading");
  assert.strictEqual(MEA.state.tab, "overview");
  assert.strictEqual(MEA.state.loginBusy, false);
  assert.strictEqual(MEA.state.loginError, "");
  assert.strictEqual(MEA.state.importBusy, false);
  assert.strictEqual(MEA.state.settings.accounts.length, 0);
  console.log("   ✓ 初始狀態驗證通過！\n");

  console.log("2. setState 應合併而非取代整個狀態...");
  const seen = [];
  const unsubscribe = MEA.subscribe(function (state) {
    seen.push(state.tab);
  });
  MEA.setState({ tab: "courses", logoutBusy: true });
  assert.strictEqual(MEA.state.tab, "courses");
  assert.strictEqual(MEA.state.logoutBusy, true, "新欄位可透過 setState 加入");
  assert.strictEqual(MEA.state.view, "loading", "未指定的欄位應保留");
  assert.strictEqual(MEA.state.settings.loading, false, "巢狀物件未被指定時應保留原參考");
  assert.deepStrictEqual(Array.from(seen), ["courses"]);
  console.log("   ✓ 狀態合併驗證通過！\n");

  console.log("3. 訂閱者應依註冊順序收到完整狀態...");
  const order = [];
  const offFirst = MEA.subscribe(function (state) {
    order.push("first:" + state.tab);
  });
  MEA.subscribe(function (state) {
    order.push("second:" + state.tab);
  });
  MEA.setState({ tab: "settings" });
  assert.deepStrictEqual(Array.from(order), ["first:settings", "second:settings"]);
  offFirst();
  MEA.setState({ tab: "import" });
  assert.deepStrictEqual(Array.from(order), ["first:settings", "second:settings", "second:import"]);
  unsubscribe();
  console.log("   ✓ 順序與取消訂閱驗證通過！\n");

  console.log("4. 單一訂閱者拋錯不應中斷其他訂閱者...");
  const beforeErrors = ctx.errors.length;
  const survived = [];
  MEA.subscribe(function () {
    throw new Error("訂閱者故意失敗");
  });
  MEA.subscribe(function (state) {
    survived.push(state.tab);
  });
  MEA.setState({ tab: "overview" });
  assert.deepStrictEqual(Array.from(survived), ["overview"]);
  assert.strictEqual(ctx.errors.length, beforeErrors + 1);
  assert(ctx.errors[ctx.errors.length - 1].message.indexOf("[setState listener error]") !== -1);
  console.log("   ✓ 例外隔離驗證通過！\n");

  console.log("5. 無效補丁與非函式訂閱應被忽略...");
  const invalidCtx = createStateModule();
  const marks = [];
  invalidCtx.MEA.subscribe(function () {
    marks.push(1);
  });
  invalidCtx.MEA.subscribe(null);
  invalidCtx.MEA.setState(null);
  invalidCtx.MEA.setState("not-an-object");
  assert.deepStrictEqual(Array.from(marks), []);
  assert.strictEqual(invalidCtx.MEA.state.view, "loading");
  const unsubscribeNoop = invalidCtx.MEA.subscribe(123);
  assert.strictEqual(typeof unsubscribeNoop, "function");
  console.log("   ✓ 無效輸入防護驗證通過！\n");

  console.log("✓ webapp/js/state.js 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
