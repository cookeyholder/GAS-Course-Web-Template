"use strict";

/**
 * webapp/js/auth.js::switchGoogleAccount 單元測試（G6.5）。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");
const helper = require("./helpers/authDeps.js");
const createDeps = helper.createDeps;

console.log("開始執行 webapp/js/auth.js switchGoogleAccount 測試...\n");

function run() {
  assert.strictEqual(authModule.buildChooserContinueUrl(""), "");
  assert.strictEqual(authModule.buildChooserContinueUrl("   "), "");
  assert.strictEqual(authModule.buildChooserContinueUrl("https://gas.test/app"), "https://gas.test/app?switch=1");
  assert.strictEqual(
    authModule.buildChooserContinueUrl("https://gas.test/app?a=1"),
    "https://gas.test/app?a=1&switch=1"
  );
  assert.strictEqual(authModule.normalizeAllowedDomain(null), "");
  assert.strictEqual(authModule.normalizeAllowedDomain("  @example.edu.tw  "), "example.edu.tw");
  assert.strictEqual(authModule.normalizeAllowedDomain("example.edu.tw"), "example.edu.tw");
  console.log("1. 切換繼續網址與網域正規化純函式 ✓\n");

  assert.strictEqual(authModule.buildAccountChooserUrl("", ""), "");
  const plain = authModule.buildAccountChooserUrl("https://gas.test/app", "");
  assert.strictEqual(
    plain,
    "https://accounts.google.com/AccountChooser?continue=https%3A%2F%2Fgas.test%2Fapp%3Fswitch%3D1"
  );
  const withDomain = authModule.buildAccountChooserUrl("https://gas.test/app", "@example.edu.tw");
  assert(withDomain.indexOf("&hd=example.edu.tw") !== -1);
  console.log("2. 帳戶選擇器網址純函式 ✓\n");

  const ctx = createDeps();
  const auth = authModule.createAuthController(ctx.deps);
  auth.switchGoogleAccount();
  assert.strictEqual(ctx.state.loginError, "無法取得 Web App 網址，請確認部署狀態後重新整理頁面");
  assert.strictEqual(ctx.state.loginBusy, false);
  assert.strictEqual(ctx.calls.opened.length, 0);
  console.log("3. 缺少 Web App 網址時不導向 ✓\n");

  const topFrame = { location: { href: "" } };
  ctx.hostWindow.top = topFrame;
  ctx.state.publicConfig = { webAppUrl: " https://gas.test/app ", allowedDomain: "@example.edu.tw" };
  auth.switchGoogleAccount();
  assert.strictEqual(ctx.state.loginBusy, true);
  assert.strictEqual(ctx.state.loginError, "");
  assert(topFrame.location.href.indexOf("https://accounts.google.com/AccountChooser?continue=") === 0);
  assert(topFrame.location.href.indexOf("&hd=example.edu.tw") !== -1);
  assert.strictEqual(ctx.calls.opened.length, 0);
  console.log("4. 切換帳號導向選擇器並帶入網域 ✓\n");

  ctx.hostWindow.top = ctx.hostWindow;
  ctx.state.publicConfig = { webAppUrl: "https://gas.test/app?from=mail" };
  auth.switchGoogleAccount();
  assert(ctx.hostWindow.location.href.indexOf("from%3Dmail%26switch%3D1") !== -1);
  console.log("5. 既有查詢參數以 & 串接 switch=1 ✓\n");

  ctx.hostWindow.top = {};
  auth.switchGoogleAccount();
  assert.strictEqual(ctx.calls.opened.length, 1);
  assert.strictEqual(ctx.calls.opened[0].target, "_top");
  console.log("6. 導向例外時改以開啟新視窗 ✓\n");

  const globalUrl = createDeps({ gasWebappUrl: "https://gas-global.test/app" });
  globalUrl.hostWindow.top = globalUrl.hostWindow;
  const authGlobal = authModule.createAuthController(globalUrl.deps);
  authGlobal.switchGoogleAccount();
  assert(globalUrl.hostWindow.location.href.indexOf("gas-global.test") !== -1);
  console.log("7. 全域 GAS_WEBAPP_URL 備援來源 ✓\n");

  const frame = { location: { href: "before" } };
  authModule.navigateToUrl({ top: frame, location: { href: "self" } }, "https://target.test");
  assert.strictEqual(frame.location.href, "https://target.test");
  const noTop = { top: null, location: { href: "before" } };
  noTop.top = noTop;
  authModule.navigateToUrl(noTop, "https://target.test");
  assert.strictEqual(noTop.location.href, "https://target.test");
  console.log("8. 導向輔助函式涵蓋框架與目前視窗 ✓\n");

  console.log("✓ webapp/js/auth.js switchGoogleAccount 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
