"use strict";

/**
 * 首次管理員開通明確旗標測試。
 * 驗證登入入口不得隱含 allowBootstrap，必須由請求明確標記為開通情境。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行首次管理員開通明確旗標測試...\n");

function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (key) {
    prev[key] = Object.prototype.hasOwnProperty.call(global, key) ? global[key] : undefined;
    if (temp[key] === undefined) delete global[key];
    else global[key] = temp[key];
  });
  try {
    return fn();
  } finally {
    Object.keys(temp).forEach(function (key) {
      if (prev[key] === undefined) delete global[key];
      else global[key] = prev[key];
    });
  }
}

function withStubbed(obj, key, stub, fn) {
  const had = Object.prototype.hasOwnProperty.call(obj, key);
  const prev = obj[key];
  obj[key] = stub;
  try {
    return fn();
  } finally {
    if (had) obj[key] = prev;
    else delete obj[key];
  }
}

function buildState(nonce, redirectUri) {
  return Buffer.from(JSON.stringify({ nonce: nonce, redirectUri: redirectUri, bootstrap: true }), "utf8").toString(
    "base64"
  );
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

function captureIdTokenLoginOptions(options, stubOptions) {
  let captured = null;
  withGlobals(
    {
      readSystemSettings: function () {
        return { clientId: "cfg-client", allowedLoginDomain: "" };
      },
      SpreadsheetApp: undefined
    },
    function () {
      withStubbed(
        api,
        "verifyGoogleIdToken",
        function () {
          return { ok: true, email: "user@example.com", name: "User" };
        },
        function () {
          withStubbed(
            api,
            "createSessionForEmail",
            function (email, name, capturedOptions) {
              captured = capturedOptions;
              return { ok: true };
            },
            function () {
              api.loginWithGoogleIdToken("id-token", options);
            }
          );
        }
      );
    }
  );
  return captured;
}

console.log("1. ID Token 登入未標記 bootstrap 時不得開通管理員...");
{
  const captured = captureIdTokenLoginOptions({ spreadsheet: { id: "ss-1" } });
  assert.strictEqual(captured.allowBootstrap, false);
  console.log("   ✓ 預設不開通驗證通過！\n");
}

console.log("2. ID Token 登入明確標記 bootstrap 時才可開通管理員...");
{
  const captured = captureIdTokenLoginOptions({ spreadsheet: { id: "ss-2" }, allowBootstrap: true });
  assert.strictEqual(captured.allowBootstrap, true);
  console.log("   ✓ 明確旗標驗證通過！\n");
}

console.log("3. 作用中使用者登入未標記 bootstrap 時不得開通管理員...");
{
  const Session = {
    getActiveUser: function () {
      return {
        getEmail: function () {
          return "user@example.com";
        }
      };
    }
  };
  let captured = null;
  withGlobals({ Session: Session, SpreadsheetApp: undefined }, function () {
    withStubbed(
      api,
      "createSessionForEmail",
      function (email, name, options) {
        captured = options;
        return { ok: true };
      },
      function () {
        api.loginWithActiveUser({ spreadsheet: { id: "ss-3" } });
      }
    );
  });
  assert.strictEqual(captured.allowBootstrap, false);
  console.log("   ✓ 預設不開通驗證通過！\n");
}

console.log("4. 公開 login action 必須轉送明確 bootstrap 旗標...");
{
  let captured = null;
  withStubbed(
    api,
    "loginWithGoogleIdToken",
    function (credential, options) {
      captured = { credential: credential, options: options };
      return { ok: true };
    },
    function () {
      api.routeWebApiAction("login", { credential: "credential-1", bootstrap: true });
      assert.deepStrictEqual(captured, { credential: "credential-1", options: { allowBootstrap: true } });
      api.routeWebApiAction("login", { credential: "credential-2" });
      assert.deepStrictEqual(captured, { credential: "credential-2", options: { allowBootstrap: false } });
    }
  );
  console.log("   ✓ 公開 action 轉送驗證通過！\n");
}

console.log("5. 公開 loginWithActiveUser action 必須轉送明確 bootstrap 旗標...");
{
  let captured = null;
  withStubbed(
    api,
    "loginWithActiveUser",
    function (options) {
      captured = options;
      return { ok: true };
    },
    function () {
      api.routeWebApiAction("loginWithActiveUser", { bootstrap: true });
      assert.deepStrictEqual(captured, { allowBootstrap: true });
      api.routeWebApiAction("loginWithActiveUser", {});
      assert.deepStrictEqual(captured, { allowBootstrap: false });
    }
  );
  console.log("   ✓ 作用中使用者 action 轉送驗證通過！\n");
}

console.log("6. 公開設定應回報是否處於首次開通情境...");
{
  withGlobals(
    {
      SpreadsheetApp: undefined,
      ScriptApp: undefined,
      readSystemSettings: function () {
        return { systemName: "S", schoolYear: "114", semester: "1", clientId: "", clientSecret: "" };
      },
      readWhitelist: function () {
        return [];
      }
    },
    function () {
      const config = api.getPublicConfig();
      assert.strictEqual(config.ok, true);
      assert.strictEqual(config.needsBootstrap, true);
    }
  );
  withGlobals(
    {
      SpreadsheetApp: undefined,
      ScriptApp: undefined,
      readSystemSettings: function () {
        return { systemName: "S", schoolYear: "114", semester: "1", clientId: "", clientSecret: "" };
      },
      readWhitelist: function () {
        return [{ email: "admin@example.com", role: "admin", enabled: true }];
      }
    },
    function () {
      const config = api.getPublicConfig();
      assert.strictEqual(config.needsBootstrap, false);
    }
  );
  console.log("   ✓ 公開設定旗標驗證通過！\n");
}

(async function runOAuthCase() {
  console.log("7. OAuth 回呼即使 state 含 bootstrap 也不得開通管理員...");
  const webAppUrl = "https://script.google.com/macros/s/DEPLOY_ID/exec";
  let captured = null;
  const deps = {
    settings: { clientId: "client-id", clientSecret: "client-secret", allowedLoginDomain: "" },
    webAppUrl: webAppUrl,
    nonceCache: createMemoryNonceCache(),
    fetch: function () {
      return { statusCode: 200, text: JSON.stringify({ id_token: "id-token" }) };
    },
    verifyGoogleIdToken: function () {
      return { ok: true, email: "user@example.com", name: "User" };
    },
    createSessionForEmail: function (email, name, options) {
      captured = options;
      return { ok: true, token: "session-token" };
    },
    spreadsheet: { id: "ss-oauth" }
  };
  const state = buildState("nonce-explicit-flag-12345678", webAppUrl);
  const result = await api.handleOAuthCodeCallback("auth-code", { parameter: { state: state } }, deps);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(captured.allowBootstrap, false);
  console.log("   ✓ OAuth 回呼不開通驗證通過！\n");
  console.log("✓ 首次管理員開通明確旗標測試全數通過！\n");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
