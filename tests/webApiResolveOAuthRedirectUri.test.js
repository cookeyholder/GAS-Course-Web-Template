"use strict";

/**
 * resolveOAuthRedirectUri 單元測試（G2.5）
 * 驗證 OAuth state 解碼、redirectUri 白名單判斷與 fallback 行為。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 resolveOAuthRedirectUri 測試...\n");

function encodeState(obj) {
  return Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
}

function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (k) {
    prev[k] = Object.prototype.hasOwnProperty.call(global, k) ? global[k] : undefined;
    if (temp[k] === undefined) delete global[k];
    else global[k] = temp[k];
  });
  try {
    return fn();
  } finally {
    Object.keys(temp).forEach(function (k) {
      if (prev[k] === undefined) delete global[k];
      else global[k] = prev[k];
    });
  }
}

console.log("1. 缺少或空白 state 應回傳 fallback...");
{
  assert.strictEqual(api.resolveOAuthRedirectUri("", "https://fallback.example/exec"), "https://fallback.example/exec");
  assert.strictEqual(
    api.resolveOAuthRedirectUri("   ", "  https://fallback.example/exec  "),
    "https://fallback.example/exec"
  );
  assert.strictEqual(api.resolveOAuthRedirectUri(null, "fallback"), "fallback");
  console.log("   ✓ 空 state fallback 驗證通過！\n");
}

console.log("2. 允許的 script.google.com redirectUri 應被採用...");
{
  const uri = "https://script.google.com/macros/s/DEPLOY_ID_123-abc/exec";
  const state = encodeState({ redirectUri: uri });
  assert.strictEqual(api.resolveOAuthRedirectUri(state, "https://fallback/"), uri);
  const uriWithQuery = "https://script.google.com/macros/s/DEPLOY_ID/exec?foo=bar#hash";
  assert.strictEqual(api.resolveOAuthRedirectUri(encodeState({ redirectUri: uriWithQuery }), "fb"), uriWithQuery);
  console.log("   ✓ script.google.com 允許來源驗證通過！\n");
}

console.log("3. 允許的 localhost/127.0.0.1 redirectUri 應被採用...");
{
  const local1 = "http://localhost:8080/callback";
  const local2 = "http://127.0.0.1/dev";
  assert.strictEqual(api.resolveOAuthRedirectUri(encodeState({ redirectUri: local1 }), "fb"), local1);
  assert.strictEqual(api.resolveOAuthRedirectUri(encodeState({ redirectUri: local2 }), "fb"), local2);
  console.log("   ✓ localhost 來源驗證通過！\n");
}

console.log("4. 不允許的 redirectUri 應回傳 fallback...");
{
  const state = encodeState({ redirectUri: "https://evil.example.com/phish" });
  assert.strictEqual(api.resolveOAuthRedirectUri(state, "https://safe/"), "https://safe/");
  console.log("   ✓ 不允許來源驗證通過！\n");
}

console.log("5. 解碼後非 JSON 物件或缺少 redirectUri 應回傳 fallback...");
{
  const notObject = Buffer.from("hello", "utf8").toString("base64");
  assert.strictEqual(api.resolveOAuthRedirectUri(notObject, "fb"), "fb");
  const arrayState = Buffer.from("[1,2,3]", "utf8").toString("base64");
  assert.strictEqual(api.resolveOAuthRedirectUri(arrayState, "fb"), "fb");
  const missing = encodeState({ other: "x" });
  assert.strictEqual(api.resolveOAuthRedirectUri(missing, "fb"), "fb");
  const emptyUri = encodeState({ redirectUri: "   " });
  assert.strictEqual(api.resolveOAuthRedirectUri(emptyUri, "fb"), "fb");
  console.log("   ✓ 非物件/缺欄位驗證通過！\n");
}

console.log("6. 無效 JSON 應安全回傳 fallback...");
{
  const badJson = Buffer.from("{bad json", "utf8").toString("base64");
  assert.strictEqual(api.resolveOAuthRedirectUri(badJson, "fb"), "fb");
  console.log("   ✓ 無效 JSON 驗證通過！\n");
}

console.log("7. Utilities 解碼路徑可用時應正確解析 state...");
{
  const uri = "http://localhost:3000/cb";
  const state = encodeState({ redirectUri: uri });
  const Utilities = {
    base64Decode: function (raw) {
      return Buffer.from(raw, "base64");
    },
    newBlob: function (bytes) {
      return {
        getDataAsString: function () {
          return Buffer.from(bytes).toString("utf8");
        }
      };
    }
  };
  const result = withGlobals({ Utilities: Utilities }, function () {
    return api.resolveOAuthRedirectUri(state, "fb");
  });
  assert.strictEqual(result, uri);
  console.log("   ✓ Utilities 路徑驗證通過！\n");
}

console.log("8. 解碼流程拋出例外時應回傳 fallback...");
{
  const state = encodeState({ redirectUri: "http://localhost/" });
  const Utilities = {
    base64Decode: function () {
      throw new Error("decode fail");
    },
    newBlob: function () {
      return {
        getDataAsString: function () {
          return "{}";
        }
      };
    }
  };
  const result = withGlobals({ Utilities: Utilities }, function () {
    return api.resolveOAuthRedirectUri(state, "fb");
  });
  assert.strictEqual(result, "fb");
  console.log("   ✓ 例外 fallback 驗證通過！\n");
}

console.log("9. parseOAuthState 應解析 nonce 與 redirectUri...");
{
  const uri = "https://script.google.com/macros/s/DEPLOY/exec";
  assert.deepStrictEqual(api.parseOAuthState(encodeState({ nonce: "abcdefgh12345678", redirectUri: uri })), {
    nonce: "abcdefgh12345678",
    redirectUri: uri
  });
  assert.strictEqual(api.parseOAuthState(""), null);
  assert.strictEqual(api.parseOAuthState(Buffer.from("hello", "utf8").toString("base64")), null);
  assert.strictEqual(api.parseOAuthState(encodeState({ redirectUri: uri })).nonce, "");
  console.log("   ✓ state 解析驗證通過！\n");
}

console.log("10. consumeOAuthNonce 應一次性消耗並拒絕異常長度...");
{
  const store = {};
  const deps = {
    nonceCache: {
      get: function (key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      put: function (key, value) {
        store[key] = value;
      }
    }
  };
  assert.strictEqual(api.consumeOAuthNonce("short", deps), false);
  assert.strictEqual(api.consumeOAuthNonce("abcdefgh12345678", deps), true);
  assert.strictEqual(api.consumeOAuthNonce("abcdefgh12345678", deps), false);
  console.log("   ✓ nonce 消耗驗證通過！\n");
}

console.log("11. validateOAuthCallbackState 應驗證 nonce 與 redirectUri 綁定...");
{
  const uri = "https://script.google.com/macros/s/DEPLOY/exec";
  const store = {};
  const deps = {
    nonceCache: {
      get: function (key) {
        return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
      },
      put: function (key, value) {
        store[key] = value;
      }
    }
  };
  const valid = api.validateOAuthCallbackState(
    encodeState({ nonce: "nonce-abcdefgh1234", redirectUri: uri }),
    uri,
    deps
  );
  assert.strictEqual(valid.ok, true);
  assert.strictEqual(valid.redirectUri, uri);

  const mismatch = api.validateOAuthCallbackState(
    encodeState({ nonce: "nonce-abcdefgh5678", redirectUri: "http://localhost:3000/cb" }),
    uri,
    deps
  );
  assert.strictEqual(mismatch.error, "oauth_redirect_mismatch");

  const noNonce = api.validateOAuthCallbackState(encodeState({ redirectUri: uri }), uri, deps);
  assert.strictEqual(noNonce.error, "invalid_oauth_state");

  const badUri = api.validateOAuthCallbackState(
    encodeState({ nonce: "nonce-abcdefgh9999", redirectUri: "https://evil.example/cb" }),
    "",
    deps
  );
  assert.strictEqual(badUri.error, "invalid_oauth_state");
  console.log("   ✓ state 驗證通過！\n");
}

console.log("✓ resolveOAuthRedirectUri 測試全數通過！\n");
