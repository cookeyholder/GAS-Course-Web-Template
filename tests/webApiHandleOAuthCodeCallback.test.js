"use strict";

/**
 * handleOAuthCodeCallback 單元測試（G2.1）
 * 驗證 OAuth 授權碼回呼流程各分支行為，並支援相依性注入以利測試與重構。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 handleOAuthCodeCallback 測試...\n");

function buildState(nonce, redirectUri) {
  return Buffer.from(JSON.stringify({ nonce: nonce, redirectUri: redirectUri }), "utf8").toString("base64");
}

function createMemoryNonceCache() {
  const store = {};
  return {
    get: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    put: function (key, value) {
      store[key] = value;
    }
  };
}

function makeDeps(overrides) {
  return Object.assign(
    {
      settings: {
        clientId: "client-id",
        clientSecret: "client-secret",
        allowedLoginDomain: ""
      },
      webAppUrl: "https://script.google.com/macros/s/DEPLOY_ID/exec",
      fetch: async function () {
        throw new Error("unexpected fetch");
      },
      verifyGoogleIdToken: function () {
        return { ok: true, email: "user@example.com", name: "User" };
      },
      createSessionForEmail: function (email, name) {
        return { ok: true, token: "t", email: email, name: name };
      },
      spreadsheet: {}
    },
    overrides || {}
  );
}

(async function run() {
  console.log("1. 缺少授權碼應回傳 missing_code...");
  {
    const r1 = await api.handleOAuthCodeCallback("", {}, makeDeps());
    const r2 = await api.handleOAuthCodeCallback("   ", {}, makeDeps());
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.error, "missing_code");
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.error, "missing_code");
    console.log("   ✓ 缺少授權碼驗證通過！\n");
  }

  console.log("2. 缺少 Client ID 應回傳 server_misconfigured...");
  {
    const deps = makeDeps({ settings: { clientId: "", clientSecret: "s" } });
    const r = await api.handleOAuthCodeCallback("code", {}, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "server_misconfigured");
    console.log("   ✓ 缺少 Client ID 驗證通過！\n");
  }

  console.log("3. 缺少 Client Secret 應回傳 missing_client_secret...");
  {
    const deps = makeDeps({ settings: { clientId: "id", clientSecret: "" } });
    const r = await api.handleOAuthCodeCallback("code", {}, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "missing_client_secret");
    console.log("   ✓ 缺少 Client Secret 驗證通過！\n");
  }

  console.log("4. 無法交換授權碼環境應回傳 environment_error...");
  {
    const deps = makeDeps({ fetch: null });
    const r = await api.handleOAuthCodeCallback("code", {}, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "environment_error");
    console.log("   ✓ 環境不支援驗證通過！\n");
  }

  console.log("5. Token 回應解析失敗應回傳 token_parse_error...");
  {
    const deps = makeDeps({
      fetch: function () {
        return { statusCode: 200, text: "not-json" };
      }
    });
    const r = await api.handleOAuthCodeCallback("code", {}, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "token_parse_error");
    console.log("   ✓ JSON 解析失敗驗證通過！\n");
  }

  console.log("6. invalid_grant/Bad Request 應回傳授權碼失效訊息...");
  {
    const deps1 = makeDeps({
      fetch: function () {
        return { statusCode: 400, text: JSON.stringify({ error: "invalid_grant" }) };
      }
    });
    const r1 = await api.handleOAuthCodeCallback("code", {}, deps1);
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.error, "token_exchange_failed");
    assert(r1.message.indexOf("授權碼已失效") !== -1, "應提示授權碼已失效");

    const deps2 = makeDeps({
      fetch: function () {
        return {
          statusCode: 400,
          text: JSON.stringify({ error: "other", error_description: "Bad Request" })
        };
      }
    });
    const r2 = await api.handleOAuthCodeCallback("code", {}, deps2);
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.error, "token_exchange_failed");
    assert(r2.message.indexOf("授權碼已失效") !== -1, "Bad Request 應視為失效授權碼");
    console.log("   ✓ 授權碼失效驗證通過！\n");
  }

  console.log("7. 其他交換失敗應回傳詳細錯誤...");
  {
    const deps = makeDeps({
      fetch: function () {
        return {
          statusCode: 500,
          text: JSON.stringify({ error: "server_error", error_description: "boom" })
        };
      }
    });
    const r = await api.handleOAuthCodeCallback("code", {}, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "token_exchange_failed");
    assert(r.message.indexOf("boom") !== -1, "應包含錯誤詳情");
    console.log("   ✓ 一般交換失敗驗證通過！\n");
  }

  console.log("8. 缺少 id_token 應視為交換失敗...");
  {
    const deps = makeDeps({
      fetch: function () {
        return { statusCode: 200, text: JSON.stringify({ access_token: "a" }) };
      }
    });
    const r = await api.handleOAuthCodeCallback("code", {}, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "token_exchange_failed");
    console.log("   ✓ 缺少 id_token 驗證通過！\n");
  }

  console.log("9. ID Token 驗證失敗應回傳驗證錯誤...");
  {
    const deps = makeDeps({
      fetch: function () {
        return { statusCode: 200, text: JSON.stringify({ id_token: "idtok" }) };
      },
      verifyGoogleIdToken: function () {
        return { ok: false, error: "invalid_audience", message: "bad aud" };
      }
    });
    const r = await api.handleOAuthCodeCallback("code", {}, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "invalid_audience");
    console.log("   ✓ 驗證失敗傳遞驗證通過！\n");
  }

  console.log("10. 成功時應建立 Session 並傳遞正確參數...");
  {
    let capturedFetch = null;
    let capturedVerify = null;
    let capturedSession = null;
    const deps = makeDeps({
      webAppUrl: "https://script.google.com/macros/s/DEPLOY_ID/exec",
      fetch: function (url, options) {
        capturedFetch = { url: url, options: options };
        return { statusCode: 200, text: JSON.stringify({ id_token: "idtok" }) };
      },
      verifyGoogleIdToken: function (token, clientId, allowedDomain) {
        capturedVerify = { token: token, clientId: clientId, allowedDomain: allowedDomain };
        return { ok: true, email: "ok@example.com", name: "OK" };
      },
      createSessionForEmail: function (email, name, options) {
        capturedSession = { email: email, name: name, options: options };
        return { ok: true, token: "sess", email: email, name: name };
      },
      settings: {
        clientId: "client-id",
        clientSecret: "client-secret",
        allowedLoginDomain: "example.com"
      }
    });
    const state = Buffer.from(
      JSON.stringify({
        nonce: "nonce-success-10-abcdef",
        redirectUri: "https://script.google.com/macros/s/DEPLOY_ID/exec"
      }),
      "utf8"
    ).toString("base64");
    const e = { parameter: { state: state } };
    const r = await api.handleOAuthCodeCallback("auth-code", e, deps);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.token, "sess");
    assert.strictEqual(capturedFetch.url, "https://oauth2.googleapis.com/token");
    assert.strictEqual(capturedFetch.options.payload.code, "auth-code");
    assert.strictEqual(capturedFetch.options.payload.client_id, "client-id");
    assert.strictEqual(capturedFetch.options.payload.client_secret, "client-secret");
    assert.strictEqual(capturedFetch.options.payload.grant_type, "authorization_code");
    assert.strictEqual(capturedVerify.token, "idtok");
    assert.strictEqual(capturedVerify.clientId, "client-id");
    assert.strictEqual(capturedVerify.allowedDomain, "example.com");
    assert.strictEqual(capturedSession.email, "ok@example.com");
    assert.strictEqual(capturedSession.name, "OK");
    console.log("   ✓ 成功流程驗證通過！\n");
  }

  console.log("11. fetch 拋出例外應回傳 token_exchange_error...");
  {
    const deps = makeDeps({
      fetch: function () {
        throw new Error("network down");
      }
    });
    const r = await api.handleOAuthCodeCallback("code", {}, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "token_exchange_error");
    assert(r.message.indexOf("network down") === -1, "不得回傳例外訊息原文");
    assert(r.message.indexOf("請稍後再試") !== -1, "應回傳通用錯誤訊息");
    console.log("   ✓ 例外處理驗證通過！\n");
  }

  console.log("12. 重放 nonce 應被拒絕且不建立 session...");
  {
    let sessionCreated = 0;
    const webAppUrl = "https://script.google.com/macros/s/DEPLOY_ID/exec";
    const deps = makeDeps({
      webAppUrl: webAppUrl,
      nonceCache: createMemoryNonceCache(),
      fetch: function () {
        return { statusCode: 200, text: JSON.stringify({ id_token: "idtok" }) };
      },
      createSessionForEmail: function () {
        sessionCreated += 1;
        return { ok: true, token: "sess" };
      }
    });
    const e = { parameter: { state: buildState("nonce-replay-12345678", webAppUrl) } };
    const r1 = await api.handleOAuthCodeCallback("code-1", e, deps);
    assert.strictEqual(r1.ok, true);
    const r2 = await api.handleOAuthCodeCallback("code-2", e, deps);
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.error, "oauth_nonce_reused");
    assert.strictEqual(sessionCreated, 1, "重放請求不得建立第二個 session");
    console.log("   ✓ nonce 重放防護通過！\n");
  }

  console.log("13. redirectUri 與系統設定不符應拒絕...");
  {
    let sessionCreated = 0;
    const deps = makeDeps({
      webAppUrl: "https://script.google.com/macros/s/DEPLOY_ID/exec",
      nonceCache: createMemoryNonceCache(),
      fetch: function () {
        return { statusCode: 200, text: JSON.stringify({ id_token: "idtok" }) };
      },
      createSessionForEmail: function () {
        sessionCreated += 1;
        return { ok: true, token: "sess" };
      }
    });
    const e = { parameter: { state: buildState("nonce-mismatch-87654321", "http://localhost:8080/cb") } };
    const r = await api.handleOAuthCodeCallback("code", e, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "oauth_redirect_mismatch");
    assert.strictEqual(sessionCreated, 0);
    console.log("   ✓ redirectUri 綁定驗證通過！\n");
  }

  console.log("14. 缺少 nonce 應拒絕建立 session...");
  {
    let sessionCreated = 0;
    const webAppUrl = "https://script.google.com/macros/s/DEPLOY_ID/exec";
    const deps = makeDeps({
      webAppUrl: webAppUrl,
      nonceCache: createMemoryNonceCache(),
      fetch: function () {
        return { statusCode: 200, text: JSON.stringify({ id_token: "idtok" }) };
      },
      createSessionForEmail: function () {
        sessionCreated += 1;
        return { ok: true, token: "sess" };
      }
    });
    const legacyState = Buffer.from(JSON.stringify({ redirectUri: webAppUrl }), "utf8").toString("base64");
    const r = await api.handleOAuthCodeCallback("code", { parameter: { state: legacyState } }, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "invalid_oauth_state");
    assert.strictEqual(sessionCreated, 0);
    console.log("   ✓ 舊格式 state 拒絕敏感寫入通過！\n");
  }

  console.log("✓ handleOAuthCodeCallback 測試全數通過！\n");
})().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
