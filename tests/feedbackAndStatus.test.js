"use strict";

/**
 * 操作回饋與狀態提示測試（task 3.6）。
 * 驗證破壞性操作確認、儲存中禁用、Session 過期文案、登出防重複與失敗回饋，
 * 以及非提交按鈕型別與表格標頭語意。
 */

const assert = require("assert");
const accountsModule = require("../webapp/js/accounts.js");
const coursesModule = require("../webapp/js/courses.js");
const authModule = require("../webapp/js/auth.js");
const uiModule = require("../webapp/js/ui.js");
const accountHelper = require("./helpers/accountsCoursesDeps.js");
const authHelper = require("./helpers/authDeps.js");
const uiHelper = require("./helpers/importsUiDeps.js");

async function run() {
  console.log("1. 刪除授權成員前應先確認，取消不送出儲存...");
  const acc = accountHelper.createAccountsDeps();
  acc.state.settings.accounts = [
    { email: "a@example.test", name: "管理員", role: "admin", roleName: "系統管理員", enabled: true }
  ];
  const accounts = accountsModule.createAccountsModule(acc.deps);
  accounts.removeAccount("a@example.test");
  assert(acc.calls.modal, "應顯示確認對話框");
  assert.strictEqual(acc.calls.modal.title, "確認刪除授權成員");
  assert(acc.calls.modal.html.indexOf("a@example.test") !== -1);
  assert.strictEqual(acc.calls.apiCalls.length, 0, "顯示對話框時不應送出 saveWhitelist");

  acc.calls.modal.actions[0].onClick();
  assert.strictEqual(acc.calls.closeModal, 1, "取消應關閉對話框");
  assert.strictEqual(acc.calls.apiCalls.length, 0, "取消不應送出 saveWhitelist");

  accounts.removeAccount("a@example.test");
  acc.calls.modal.actions[1].onClick();
  await accountHelper.flush();
  assert.strictEqual(acc.calls.closeModal, 2, "確認後應關閉對話框");
  const whitelistCalls = acc.calls.apiCalls.filter(function (item) {
    return item.action === "saveWhitelist";
  });
  assert.strictEqual(whitelistCalls.length, 1, "確認後應送出一次 saveWhitelist");
  assert.deepStrictEqual(whitelistCalls[0].payload.accounts, [], "應送出已移除該成員的清單");
  console.log("   ✓ 刪除確認與取消行為驗證通過！\n");

  console.log("2. 儲存與讀取中應禁用按鈕並顯示處理中狀態...");
  acc.state.settings.saving = true;
  acc.state.settings.loading = true;
  let html = accounts.renderView();
  assert(html.indexOf("正在更新授權白名單，請稍候...") !== -1, "應顯示白名單更新提示");
  assert(html.indexOf('role="status"') !== -1, "處理中提示應具備 status 角色");
  assert(html.indexOf("讀取中...") !== -1, "重新讀取按鈕應顯示處理中文字");
  assert(html.indexOf("儲存中...") !== -1, "儲存按鈕應顯示處理中文字");
  assert(html.indexOf('scope="col"') !== -1, "表格標頭應標記 scope");
  const accountsDisabledCount = (html.match(/ disabled/g) || []).length;
  assert(accountsDisabledCount >= 3, "至少三個操作按鈕應被禁用，實際 " + accountsDisabledCount);
  console.log("   ✓ 儲存中禁用與狀態提示驗證通過！\n");

  console.log("3. 課程分頁與表格標頭應具備無障礙語意...");
  const crs = accountHelper.createCoursesDeps();
  const courses = coursesModule.createCoursesModule(crs.deps);
  html = courses.renderView();
  assert(html.indexOf('scope="col"') !== -1, "課程表格標頭應標記 scope");
  const buttons = html.match(/<button[^>]*>/g) || [];
  assert(buttons.length > 0, "應產生至少一個按鈕");
  buttons.forEach(function (button) {
    assert(
      button.indexOf('type="button"') !== -1 || button.indexOf('type="submit"') !== -1,
      "每個按鈕都應明確標記 type：" + button
    );
  });
  console.log("   ✓ 按鈕與表頭語意驗證通過！\n");

  console.log("4. 登出應防重複點擊並提供失敗回饋...");
  const au = authHelper.createDeps();
  au.apiResponses.logout = { ok: true };
  const auth = authModule.createAuthController(au.deps);
  const first = auth.logout();
  const second = auth.logout();
  assert.strictEqual(
    au.calls.apiCalls.filter(function (item) {
      return item.action === "logout";
    }).length,
    1,
    "重複點擊只送出一次 logout"
  );
  assert.strictEqual(au.state.logoutBusy, true, "登出中應設定 logoutBusy");
  assert.strictEqual(await first, true);
  assert.strictEqual(await second, false, "重複點擊應直接回傳 false");
  assert.strictEqual(au.state.logoutBusy, false, "登出完成應清除 logoutBusy");
  assert.strictEqual(au.state.view, "login");

  const failing = authHelper.createDeps();
  failing.MEA.api.call = function (action, payload) {
    failing.calls.apiCalls.push({ action: action, payload: payload });
    return Promise.reject(new Error("登出服務暫時無法使用"));
  };
  const failingAuth = authModule.createAuthController(failing.deps);
  assert.strictEqual(await failingAuth.logout(), false, "失敗應回傳 false");
  assert.strictEqual(failing.state.logoutBusy, false, "失敗應清除 logoutBusy");
  assert(
    failing.calls.toasts.some(function (item) {
      return item.level === "err" && item.message === authModule.constants.DEFAULT_LOGOUT_ERROR;
    }),
    "失敗應顯示錯誤 Toast"
  );
  console.log("   ✓ 登出防重複與失敗回饋驗證通過！\n");

  console.log("5. 登出按鈕應隨狀態禁用並顯示處理中文字...");
  const busyUi = uiHelper.createUiDeps();
  busyUi.state.logoutBusy = true;
  html = busyUi.ui.renderHeader();
  assert(html.indexOf("登出中...") !== -1, "應顯示登出中文字");
  const logoutButton = (html.match(/<button[^>]*data-ui-action="logout"[^>]*>/) || [])[0];
  assert(logoutButton, "應找到登出按鈕");
  assert(logoutButton.indexOf(" disabled") !== -1, "登出中按鈕應被禁用");
  assert(logoutButton.indexOf('type="button"') !== -1, "登出按鈕應標記 type");

  const idleUi = uiHelper.createUiDeps();
  html = idleUi.ui.renderHeader();
  assert(html.indexOf(">登出<") !== -1, "空閒時應顯示登出");
  assert.strictEqual(html.indexOf("登出中..."), -1);
  console.log("   ✓ 登出按鈕狀態驗證通過！\n");

  console.log("6. Session 過期與登出常數應正確匯出...");
  assert.strictEqual(authModule.constants.SESSION_EXPIRED_ERROR, "工作階段已過期，請重新登入");
  assert.strictEqual(
    authModule.normalizeLogoutError(new Error("逾時")),
    authModule.constants.DEFAULT_LOGOUT_ERROR,
    "原始例外文字不得外顯"
  );
  assert.strictEqual(
    authModule.normalizeLogoutError({ ok: false, error: "server_error", message: "登出失敗，請稍後再試" }),
    "登出失敗，請稍後再試",
    "後端安全訊息應可顯示"
  );
  assert.strictEqual(
    authModule.normalizeLogoutError(null),
    authModule.constants.DEFAULT_LOGOUT_ERROR,
    "無訊息時應使用預設文案"
  );
  assert.strictEqual(typeof uiModule.resolveToastRole, "function", "Toast 角色函式應可用於狀態提示");
  console.log("   ✓ 常數與錯誤訊息驗證通過！\n");

  console.log("✓ 操作回饋與狀態提示測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
