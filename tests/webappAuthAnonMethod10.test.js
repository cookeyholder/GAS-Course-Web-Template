"use strict";

/**
 * webapp/js/auth.js::<anon method-10> 單元測試（G6.3）。
 *
 * 原匿名函式位於 restore() 的模擬模式分支：
 * `MEA.api.call("getSession", {}).then(function (result) { ... })`
 * （原檔 L300–321，循環複雜度 14）。重構後共用 applySessionSuccess 與純函式。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");
const helper = require("./helpers/authDeps.js");
const createDeps = helper.createDeps;
const flush = helper.flush;

console.log("開始執行 webapp/js/auth.js anon method-10（模擬工作階段回呼）測試...\n");

function run() {
  let withoutCoursesCtx;
  let noCsrfCtx;
  const ctx = createDeps({ config: { mock: true, roleNames: { admin: "系統管理員" } } });
  ctx.calls.currentToken = "不應被使用的權杖";
  ctx.state.loginError = "先前的錯誤";
  ctx.apiResponses.getSession = function (payload) {
    assert.deepStrictEqual(payload, {});
    return {
      ok: true,
      email: "mock@example.test",
      name: "模擬會員",
      role: "admin",
      csrfToken: "csrf-mock",
      perms: ["read"]
    };
  };
  const auth = authModule.createAuthController(ctx.deps);
  auth.restore();
  return flush()
    .then(function () {
      assert.strictEqual(ctx.state.view, "app");
      assert.strictEqual(ctx.state.user.email, "mock@example.test");
      assert.strictEqual(ctx.state.user.roleName, "系統管理員");
      assert.deepStrictEqual(ctx.calls.setCsrfToken, ["csrf-mock"]);
      assert.deepStrictEqual(ctx.calls.setToken, []);
      assert.strictEqual(ctx.calls.fetchStats, 1);
      assert.strictEqual(ctx.calls.timeouts.length, 0);
      console.log("1. 模擬模式還原成功：不清除既有權杖並載入統計 ✓\n");

      ctx.apiResponses.getSession = { ok: false, message: "模擬工作階段無效" };
      auth.restore();
      return flush();
    })
    .then(function () {
      assert.strictEqual(ctx.state.view, "login");
      assert.strictEqual(ctx.state.loginError, "先前的錯誤");
      assert.deepStrictEqual(ctx.calls.setToken, []);
      assert.deepStrictEqual(ctx.calls.setCsrfToken, ["csrf-mock"]);
      assert.strictEqual(ctx.calls.fetchStats, 1);
      assert.strictEqual(ctx.calls.timeouts.length, 1);
      assert.strictEqual(ctx.calls.timeouts[0].ms, 50);
      console.log("2. 模擬模式還原失敗：僅切換畫面且排程重繪 ✓\n");

      ctx.calls.timeouts[0].fn();
      assert(ctx.elements.googleLoginButton.innerHTML === "", "模擬模式重繪不寫入 Google 按鈕");
      console.log("3. 模擬模式延遲回呼不會建立 GIS 按鈕 ✓\n");

      withoutCoursesCtx = createDeps({ config: { mock: true } });
      withoutCoursesCtx.MEA.courses = null;
      withoutCoursesCtx.apiResponses.getSession = { ok: true, name: "沒有列表模組" };
      const authWithoutCourses = authModule.createAuthController(withoutCoursesCtx.deps);
      authWithoutCourses.restore();
      return flush();
    })
    .then(function () {
      assert.strictEqual(withoutCoursesCtx.state.view, "app");
      assert.strictEqual(withoutCoursesCtx.calls.fetchStats, 0);
      console.log("4. 缺少課程模組時仍可完成還原 ✓\n");

      noCsrfCtx = createDeps({ config: { mock: true } });
      noCsrfCtx.apiResponses.getSession = { ok: true, name: "沒有 CSRF" };
      const authNoCsrf = authModule.createAuthController(noCsrfCtx.deps);
      authNoCsrf.restore();
      return flush();
    })
    .then(function () {
      assert.deepStrictEqual(noCsrfCtx.calls.setCsrfToken, []);
      assert.strictEqual(authModule.buildSessionFailureState(null).loginError, "");
      console.log("✓ webapp/js/auth.js anon method-10 測試全數通過！\n");
    });
}

try {
  Promise.resolve(run()).catch(function (error) {
    console.error(error);
    process.exit(1);
  });
} catch (error) {
  console.error(error);
  process.exit(1);
}
