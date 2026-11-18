"use strict";

/**
 * webapp/js/auth.js::applyLoginSuccess 單元測試（G6.1）。
 * 涵蓋重構後抽出的純函式與控制器公開方法，驗證既有行為完全不變。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");
const helper = require("./helpers/authDeps.js");
const createDeps = helper.createDeps;
const flush = helper.flush;

console.log("開始執行 webapp/js/auth.js applyLoginSuccess 測試...\n");

function run() {
  assert.strictEqual(typeof authModule.createAuthController, "function", "應匯出控制器工廠");
  assert.strictEqual(typeof authModule.applyLoginSuccess, "undefined", "公開方法應由工廠組裝");
  console.log("1. UMD 工廠匯出與瀏覽器組裝職責分離 ✓\n");

  const failure = authModule.buildLoginFailureState({ message: "憑證過期" });
  assert.deepStrictEqual(failure, {
    view: "login",
    loginBusy: false,
    loginError: "憑證過期"
  });
  assert.strictEqual(authModule.buildLoginFailureState(null).loginError, "登入失敗，請稍後再試");
  assert.strictEqual(authModule.buildLoginFailureState({}).loginError, "登入失敗，請稍後再試");
  assert.strictEqual(authModule.isOkResult({ ok: true }), true);
  assert.strictEqual(authModule.isOkResult({ ok: "true" }), false);
  assert.strictEqual(authModule.isOkResult(null), false);
  console.log("2. 失敗狀態與成功判定純函式 ✓\n");

  const roles = { admin: "系統管理員" };
  const fullUser = authModule.buildLoginUser(
    {
      email: "a@example.test",
      name: "甲君",
      role: "admin",
      roleName: "自訂名稱",
      perms: ["read"],
      csrfToken: "csrf-1"
    },
    roles
  );
  assert.deepStrictEqual(fullUser, {
    email: "a@example.test",
    name: "甲君",
    role: "admin",
    roleName: "自訂名稱",
    perms: ["read"],
    csrfToken: "csrf-1"
  });
  const fallbackUser = authModule.buildLoginUser({ email: "b@example.test", role: "admin" }, roles);
  assert.strictEqual(fallbackUser.name, "b@example.test");
  assert.strictEqual(fallbackUser.roleName, "系統管理員");
  assert.deepStrictEqual(fallbackUser.perms, []);
  assert.strictEqual(fallbackUser.csrfToken, "");
  const roleFallbackUser = authModule.buildLoginUser({ role: "guest" }, null);
  assert.strictEqual(roleFallbackUser.roleName, "guest");
  assert.deepStrictEqual(
    authModule.buildLoginSuccessState(fullUser),
    { view: "app", user: fullUser, loginBusy: false, loginError: "" }
  );
  assert.deepStrictEqual(authModule.getLoginToast(fullUser, false), {
    message: "歡迎回來，甲君！",
    level: "ok"
  });
  assert.deepStrictEqual(authModule.getLoginToast(fullUser, true), {
    message: "初次登入已自動開通系統管理員權限！",
    level: "warn"
  });
  console.log("3. 使用者物件、成功狀態與提示訊息純函式 ✓\n");

  const side = createDeps();
  authModule.applyCsrfToken(side.MEA.api, "csrf-a");
  authModule.applyCsrfToken(side.MEA.api, "");
  assert.deepStrictEqual(side.calls.setCsrfToken, ["csrf-a"]);
  authModule.invokeFetchCourses(side.MEA);
  assert.strictEqual(side.calls.fetchList, 1);
  assert.strictEqual(side.calls.lastFetchPage, 1);
  const noCourses = createDeps();
  noCourses.MEA.courses = null;
  assert.doesNotThrow(function () {
    authModule.invokeFetchCourses(noCourses.MEA);
  });
  console.log("4. CSRF 設定與課程列表觸發純函式 ✓\n");

  const ctx = createDeps();
  const auth = authModule.createAuthController(ctx.deps);
  return auth
    .applyLoginSuccess({
      ok: true,
      token: "token-1",
      csrfToken: "csrf-1",
      email: "c@example.test",
      name: "乙君",
      role: "admin",
      perms: ["write"]
    })
    .then(function (user) {
      assert.strictEqual(user.email, "c@example.test");
      assert.strictEqual(user.roleName, "系統管理員");
      assert.deepStrictEqual(ctx.calls.setToken, ["token-1"]);
      assert.deepStrictEqual(ctx.calls.setCsrfToken, ["csrf-1"]);
      assert.strictEqual(ctx.state.view, "app");
      assert.strictEqual(ctx.state.loginBusy, false);
      assert.strictEqual(ctx.state.loginError, "");
      assert.strictEqual(ctx.calls.toasts.length, 1);
      assert.strictEqual(ctx.calls.toasts[0].level, "ok");
      assert.strictEqual(ctx.calls.fetchList, 1);
      console.log("5. 成功登入：權杖、狀態、提示與列表更新 ✓\n");

      return auth.applyLoginSuccess({ ok: true, email: "d@example.test", bootstrapped: true });
    })
    .then(function (user) {
      assert.strictEqual(user.name, "d@example.test");
      assert.strictEqual(user.roleName, undefined);
      assert.strictEqual(ctx.calls.toasts[1].level, "warn");
      assert.strictEqual(ctx.calls.toasts[1].message, "初次登入已自動開通系統管理員權限！");
      assert.strictEqual(ctx.calls.fetchList, 2);
      console.log("6. 初次登入管理員提示分支 ✓\n");

      return auth.applyLoginSuccess({ ok: false, message: "帳號或密碼錯誤" });
    })
    .then(function (result) {
      assert.strictEqual(result, null);
      assert.strictEqual(ctx.state.view, "login");
      assert.strictEqual(ctx.state.loginError, "帳號或密碼錯誤");
      assert.strictEqual(ctx.state.loginBusy, false);
      assert.strictEqual(ctx.calls.fetchList, 2);
      assert.strictEqual(ctx.calls.toasts.length, 2);
      console.log("7. 失敗登入不寫入權杖且回到登入畫面 ✓\n");

      const missing = createDeps();
      const missingAuth = authModule.createAuthController(missing.deps);
      return missingAuth.applyLoginSuccess(undefined).then(function (result) {
        assert.strictEqual(result, null);
        assert.strictEqual(missing.state.loginError, "登入失敗，請稍後再試");
        console.log("8. 空回應使用預設錯誤訊息 ✓\n");
        return flush();
      });
    })
    .then(function () {
      console.log("✓ webapp/js/auth.js applyLoginSuccess 測試全數通過！\n");
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
