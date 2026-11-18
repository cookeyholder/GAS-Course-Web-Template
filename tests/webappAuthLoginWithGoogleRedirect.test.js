"use strict";

/**
 * webapp/js/auth.js::loginWithGoogleRedirect 單元測試（G6.4）。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");
const helper = require("./helpers/authDeps.js");
const createDeps = helper.createDeps;
const fakeBtoa = helper.fakeBtoa;

console.log("開始執行 webapp/js/auth.js loginWithGoogleRedirect 測試...\n");

function run() {
  assert.deepStrictEqual(authModule.validateRedirectSetup({}, null), {
    clientId: "",
    redirectUri: "",
    message: "尚未設定 OAuth Client ID，請系統管理員先於「系統設定」完成設定"
  });
  assert.strictEqual(
    authModule.validateRedirectSetup({ clientId: " client-1 ", hasClientSecret: false }, null).message,
    "尚未設定 OAuth Client Secret，請系統管理員先於「系統設定」完成設定"
  );
  assert.strictEqual(
    authModule.validateRedirectSetup(
      { clientId: "client-1", hasClientSecret: true },
      null
    ).message,
    "無法取得 Web App 網址，請確認部署狀態後重新整理頁面"
  );
  const fallback = authModule.validateRedirectSetup(
    { clientId: "client-1", hasClientSecret: true },
    { GAS_WEBAPP_URL: "  https://gas.test/app  " }
  );
  assert.deepStrictEqual(fallback, {
    clientId: "client-1",
    redirectUri: "https://gas.test/app",
    message: ""
  });
  assert.strictEqual(authModule.resolveWebAppUrl(null, null), "");
  assert.strictEqual(authModule.resolveWebAppUrl({ webAppUrl: "https://a.test" }, null), "https://a.test");
  console.log("1. OAuth 設定驗證與網址解析純函式 ✓\n");

  const state = authModule.encodeAuthState("https://gas.test/app", {
    btoa: fakeBtoa,
    random: function () {
      return 0.5;
    },
    now: function () {
      return 1000;
    }
  });
  const decoded = JSON.parse(Buffer.from(state, "base64").toString("utf8"));
  assert.strictEqual(decoded.redirectUri, "https://gas.test/app");
  assert(decoded.nonce.length > 0);
  assert.strictEqual(authModule.encodeAuthState("https://gas.test/app", {}), "");
  assert.strictEqual(
    authModule.encodeAuthState("https://gas.test/app", {
      btoa: function () {
        throw new Error("編碼失敗");
      }
    }),
    ""
  );
  const url = authModule.buildGoogleAuthUrl("client id", "https://gas.test/app?a=1", {
    btoa: fakeBtoa
  });
  assert(url.indexOf("https://accounts.google.com/o/oauth2/v2/auth?client_id=client%20id") === 0);
  assert(url.indexOf("redirect_uri=https%3A%2F%2Fgas.test%2Fapp%3Fa%3D1") !== -1);
  assert(url.indexOf("response_type=code") !== -1);
  assert(url.indexOf("scope=openid%20email%20profile") !== -1);
  assert(url.indexOf("access_type=online") !== -1);
  assert(url.indexOf("prompt=select_account") !== -1);
  assert(url.indexOf("&state=") !== -1);
  console.log("2. Google 授權網址與狀態編碼純函式 ✓\n");

  const ctx = createDeps();
  const auth = authModule.createAuthController(ctx.deps);
  auth.loginWithGoogleRedirect();
  assert.strictEqual(ctx.calls.apiCalls.length, 0);
  assert.strictEqual(ctx.state.loginError, "尚未設定 OAuth Client ID，請系統管理員先於「系統設定」完成設定");
  assert.strictEqual(ctx.calls.timeouts.length, 0);
  console.log("3. 缺少 Client ID 時不導向 ✓\n");

  ctx.state.publicConfig = { clientId: "client-1", hasClientSecret: false, webAppUrl: "https://gas.test/app" };
  auth.loginWithGoogleRedirect();
  assert.strictEqual(ctx.state.loginError, "尚未設定 OAuth Client Secret，請系統管理員先於「系統設定」完成設定");
  console.log("4. 缺少 Client Secret 時不導向 ✓\n");

  ctx.state.publicConfig = { clientId: "client-1", hasClientSecret: true };
  auth.loginWithGoogleRedirect();
  assert.strictEqual(ctx.state.loginError, "無法取得 Web App 網址，請確認部署狀態後重新整理頁面");
  console.log("5. 缺少 Web App 網址時不導向 ✓\n");

  const topFrame = { location: { href: "" } };
  ctx.hostWindow.top = topFrame;
  ctx.state.publicConfig = {
    clientId: "client-ok",
    hasClientSecret: true,
    webAppUrl: "https://gas.test/app"
  };
  auth.loginWithGoogleRedirect();
  assert.strictEqual(ctx.state.loginBusy, true);
  assert.strictEqual(ctx.state.loginError, "");
  assert(topFrame.location.href.indexOf("https://accounts.google.com/o/oauth2/v2/auth?client_id=client-ok") === 0);
  console.log("6. 正常導向至上層框架並進入忙碌狀態 ✓\n");

  ctx.hostWindow.top = ctx.hostWindow;
  auth.loginWithGoogleRedirect();
  assert(ctx.hostWindow.location.href.indexOf("client_id=client-ok") !== -1);
  assert.strictEqual(ctx.calls.opened.length, 0);
  console.log("7. 非框架環境導向目前視窗 ✓\n");

  ctx.hostWindow.top = {};
  auth.loginWithGoogleRedirect();
  assert.strictEqual(ctx.calls.opened.length, 1);
  assert.strictEqual(ctx.calls.opened[0].target, "_top");
  assert(ctx.calls.opened[0].url.indexOf("client_id=client-ok") !== -1);
  console.log("8. 導向例外時改以開啟新視窗 ✓\n");

  console.log("✓ webapp/js/auth.js loginWithGoogleRedirect 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
