"use strict";

/**
 * webapp/js/auth.js::<anon method-11> 單元測試（G6.2）。
 *
 * 原匿名函式位於 restore() 中 `MEA.api.call("getSession", { token })`
 * 的 `.then(function (result) { ... })`（原檔 L331–359，循環複雜度 18）。
 * 重構後該回呼僅保留成功/失敗分流，資料轉換改由純函式處理。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");
const helper = require("./helpers/authDeps.js");
const createDeps = helper.createDeps;
const flush = helper.flush;

console.log("開始執行 webapp/js/auth.js anon method-11（權杖工作階段回呼）測試...\n");

function run() {
  const roles = { admin: "系統管理員", staff: "業務人員" };
  const user = authModule.buildSessionUser(
    {
      email: "session@example.test",
      name: "會員甲",
      role: "admin",
      perms: ["read"],
      csrfToken: "csrf-session"
    },
    roles
  );
  assert.deepStrictEqual(user, {
    email: "session@example.test",
    name: "會員甲",
    role: "admin",
    roleName: "系統管理員",
    perms: ["read"],
    csrfToken: "csrf-session"
  });
  const minimal = authModule.buildSessionUser({ role: "staff", roleName: "自訂職稱", perms: "錯誤型別" }, roles);
  assert.strictEqual(minimal.name, "");
  assert.strictEqual(minimal.roleName, "自訂職稱");
  assert.deepStrictEqual(minimal.perms, []);
  assert.strictEqual(authModule.buildSessionUser({ role: "guest" }, null).roleName, "guest");
  const successState = authModule.buildSessionSuccessState({ name: "會員乙", role: "admin" }, roles);
  assert.strictEqual(successState.view, "app");
  assert.strictEqual(successState.user.name, "會員乙");
  assert.strictEqual(successState.user.roleName, "系統管理員");
  console.log("1. 工作階段使用者與成功狀態純函式 ✓\n");

  const expired = authModule.constants.SESSION_EXPIRED_ERROR;
  assert.strictEqual(authModule.getSessionErrorMessage(null), expired);
  assert.strictEqual(authModule.getSessionErrorMessage({ error: "missing_token", message: "忽略" }), expired);
  assert.strictEqual(authModule.getSessionErrorMessage({ error: "session_expired" }), expired);
  assert.strictEqual(authModule.getSessionErrorMessage({ error: "invalid_session" }), expired);
  assert.strictEqual(authModule.getSessionErrorMessage({ error: "invalid_token", message: "權杖無效" }), "權杖無效");
  assert.strictEqual(authModule.getSessionErrorMessage({ error: "invalid_token" }), expired);
  assert.deepStrictEqual(authModule.buildSessionFailureState({ error: "missing_token" }), {
    view: "login",
    loginError: expired
  });
  console.log("2. 工作階段失敗訊息純函式 ✓\n");

  const ctx = createDeps();
  ctx.calls.currentToken = "token-9";
  ctx.apiResponses.getSession = function (payload) {
    assert.deepStrictEqual(payload, { token: "token-9" });
    return {
      ok: true,
      email: "restore@example.test",
      name: "會員丙",
      role: "admin",
      csrfToken: "csrf-new",
      perms: ["write"]
    };
  };
  const auth = authModule.createAuthController(ctx.deps);
  auth.restore();
  return flush()
    .then(function () {
      assert.strictEqual(ctx.state.view, "app");
      assert.strictEqual(ctx.state.user.email, "restore@example.test");
      assert.strictEqual(ctx.state.user.roleName, "系統管理員");
      assert.deepStrictEqual(ctx.calls.setCsrfToken, ["csrf-new"]);
      assert.deepStrictEqual(ctx.calls.setToken, []);
      assert.strictEqual(ctx.calls.fetchStats, 1);
      assert.strictEqual(ctx.calls.timeouts.length, 0);
      console.log("3. 攜帶權杖還原成功：寫入 CSRF、觸發統計、不清除權杖 ✓\n");

      ctx.apiResponses.getSession = { ok: false, error: "missing_token", message: "缺少權杖" };
      auth.restore();
      return flush();
    })
    .then(function () {
      assert.strictEqual(ctx.state.view, "login");
      assert.strictEqual(ctx.state.loginError, expired);
      assert.deepStrictEqual(ctx.calls.setToken.slice(-1), [""]);
      assert.deepStrictEqual(ctx.calls.setCsrfToken.slice(-1), [""]);
      assert.strictEqual(ctx.calls.timeouts.length, 1);
      assert.strictEqual(ctx.calls.timeouts[0].ms, 50);
      console.log("4. missing_token 失敗：清除憑證且排程重繪按鈕 ✓\n");

      ctx.calls.currentToken = "token-9";
      ctx.apiResponses.getSession = { ok: false, error: "invalid_token", message: "工作階段已過期" };
      auth.restore();
      return flush();
    })
    .then(function () {
      assert.strictEqual(ctx.state.loginError, "工作階段已過期");
      assert.strictEqual(ctx.calls.timeouts.length, 2);
      console.log("5. 一般失敗保留後端錯誤訊息 ✓\n");

      ctx.calls.currentToken = "token-9";
      ctx.apiResponses.getSession = null;
      auth.restore();
      return flush();
    })
    .then(function () {
      assert.strictEqual(ctx.state.loginError, expired);
      assert.strictEqual(ctx.calls.timeouts.length, 3);
      ctx.calls.timeouts[2].fn();
      assert(ctx.elements.googleLoginButton.innerHTML.indexOf("尚未設定 OAuth Client ID") !== -1);
      console.log("6. 空回應與延遲回呼確實重繪 Google 按鈕 ✓\n");

      const noCourses = createDeps();
      noCourses.calls.currentToken = "token-x";
      noCourses.apiResponses.getSession = { ok: true, name: "無列表" };
      noCourses.MEA.courses = null;
      const authWithoutCourses = authModule.createAuthController(noCourses.deps);
      authWithoutCourses.restore();
      return flush();
    })
    .then(function () {
      console.log("✓ webapp/js/auth.js anon method-11 測試全數通過！\n");
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
