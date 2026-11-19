"use strict";

/**
 * 前端登入明確開通旗標測試。
 * 驗證只有公開設定標記待開通時，登入請求才會帶 bootstrap:true。
 */

const assert = require("assert");
const authModule = require("../webapp/js/auth.js");
const helper = require("./helpers/authDeps.js");
const createDeps = helper.createDeps;
const flush = helper.flush;

function lastApiCall(calls) {
  return calls.apiCalls[calls.apiCalls.length - 1];
}

(async function run() {
  console.log("1. handleCredential 在待開通情境應送出 bootstrap:true...");
  {
    const ctx = createDeps();
    ctx.state.publicConfig = { needsBootstrap: true };
    const auth = authModule.createAuthController(ctx.deps);
    auth.handleCredential({ credential: "credential-1" });
    await flush();
    assert.deepStrictEqual(lastApiCall(ctx.calls).payload, { credential: "credential-1", bootstrap: true });
    console.log("   ✓ GIS 登入旗標驗證通過！\n");
  }

  console.log("2. handleCredential 在白名單非空時不得送出 bootstrap:true...");
  {
    const ctx = createDeps();
    ctx.state.publicConfig = { needsBootstrap: false };
    const auth = authModule.createAuthController(ctx.deps);
    auth.handleCredential({ credential: "credential-2" });
    await flush();
    assert.deepStrictEqual(lastApiCall(ctx.calls).payload, { credential: "credential-2", bootstrap: false });
    console.log("   ✓ 一般登入旗標驗證通過！\n");
  }

  console.log("3. loginActiveUser 也必須遵循明確旗標...");
  {
    const ctx = createDeps();
    ctx.state.publicConfig = { needsBootstrap: true };
    const auth = authModule.createAuthController(ctx.deps);
    auth.loginActiveUser();
    await flush();
    assert.deepStrictEqual(lastApiCall(ctx.calls).payload, { bootstrap: true });
    console.log("   ✓ 作用中使用者登入旗標驗證通過！\n");
  }

  console.log("4. loginMock 也必須遵循明確旗標...");
  {
    const ctx = createDeps();
    ctx.state.publicConfig = { needsBootstrap: false };
    const auth = authModule.createAuthController(ctx.deps);
    auth.loginMock();
    await flush();
    assert.deepStrictEqual(lastApiCall(ctx.calls).payload, { mock: true, bootstrap: false });
    console.log("   ✓ 離線登入旗標驗證通過！\n");
  }

  console.log("✓ 前端登入明確開通旗標測試全數通過！\n");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
