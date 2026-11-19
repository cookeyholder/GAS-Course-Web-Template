"use strict";

/**
 * loginWithGoogleIdToken 單元測試（G2.8）
 * 驗證 Google ID Token 登入流程、設定讀取與 session 建立委派行為。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 loginWithGoogleIdToken 測試...\n");

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

console.log("1. 驗證失敗時應直接回傳 verify 結果...");
{
  const ss = { id: "ss1" };
  let captured = null;
  const verifyResult = { ok: false, error: "invalid_id_token" };
  withGlobals(
    {
      readSystemSettings: function (spreadsheet) {
        return { clientId: "cfg-client", allowedLoginDomain: "example.com", _ss: spreadsheet };
      },
      SpreadsheetApp: undefined
    },
    function () {
      withStubbed(
        api,
        "verifyGoogleIdToken",
        function (token, clientId, domain) {
          captured = { token: token, clientId: clientId, domain: domain };
          return verifyResult;
        },
        function () {
          const r = api.loginWithGoogleIdToken("id-token", { spreadsheet: ss });
          assert.strictEqual(r, verifyResult);
        }
      );
    }
  );
  assert.deepStrictEqual(captured, {
    token: "id-token",
    clientId: "cfg-client",
    domain: "example.com"
  });
  console.log("   ✓ 驗證失敗分支通過！\n");
}

console.log("2. 驗證成功時應建立 session 並回傳結果...");
{
  const ss = { id: "ss2" };
  const verifyResult = { ok: true, email: "user@example.com", name: "User" };
  const sessionResult = { ok: true, token: "session-token" };
  let verifyArgs = null;
  let sessionArgs = null;
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
        function (token, clientId, domain) {
          verifyArgs = [token, clientId, domain];
          return verifyResult;
        },
        function () {
          withStubbed(
            api,
            "createSessionForEmail",
            function (email, name, options) {
              sessionArgs = { email: email, name: name, options: options };
              return sessionResult;
            },
            function () {
              const r = api.loginWithGoogleIdToken("tok", { spreadsheet: ss });
              assert.strictEqual(r, sessionResult);
            }
          );
        }
      );
    }
  );
  assert.deepStrictEqual(verifyArgs, ["tok", "cfg-client", ""]);
  assert.deepStrictEqual(sessionArgs, {
    email: "user@example.com",
    name: "User",
    options: { spreadsheet: ss, allowBootstrap: true }
  });
  console.log("   ✓ 驗證成功分支通過！\n");
}

console.log("3. options.clientId 應優先於系統設定 clientId...");
{
  const ss = { id: "ss3" };
  let verifyClientId = null;
  withGlobals(
    {
      readSystemSettings: function () {
        return { clientId: "cfg-client", allowedLoginDomain: "x.com" };
      },
      SpreadsheetApp: undefined
    },
    function () {
      withStubbed(
        api,
        "verifyGoogleIdToken",
        function (token, clientId) {
          verifyClientId = clientId;
          return { ok: false, error: "x" };
        },
        function () {
          api.loginWithGoogleIdToken("tok", { spreadsheet: ss, clientId: "override-client" });
        }
      );
    }
  );
  assert.strictEqual(verifyClientId, "override-client");
  console.log("   ✓ clientId 覆寫驗證通過！\n");
}

console.log("4. 無 options.spreadsheet 時應使用 SpreadsheetApp.getActiveSpreadsheet...");
{
  const ss = { id: "active" };
  const SpreadsheetApp = {
    getActiveSpreadsheet: function () {
      return ss;
    }
  };
  let readSs = null;
  let sessionSs = null;
  withGlobals(
    {
      SpreadsheetApp: SpreadsheetApp,
      readSystemSettings: function (spreadsheet) {
        readSs = spreadsheet;
        return { clientId: "c", allowedLoginDomain: "" };
      }
    },
    function () {
      withStubbed(
        api,
        "verifyGoogleIdToken",
        function () {
          return { ok: true, email: "a@b", name: "A" };
        },
        function () {
          withStubbed(
            api,
            "createSessionForEmail",
            function (e, n, options) {
              sessionSs = options.spreadsheet;
              return { ok: true };
            },
            function () {
              api.loginWithGoogleIdToken("tok", {});
            }
          );
        }
      );
    }
  );
  assert.strictEqual(readSs, ss);
  assert.strictEqual(sessionSs, ss);
  console.log("   ✓ SpreadsheetApp fallback 驗證通過！\n");
}

console.log("5. 無 SpreadsheetApp 且無 options.spreadsheet 時應使用 null...");
{
  let readSs = "unset";
  let sessionSs = "unset";
  withGlobals(
    {
      SpreadsheetApp: undefined,
      readSystemSettings: function (spreadsheet) {
        readSs = spreadsheet;
        return { clientId: "", allowedLoginDomain: "" };
      }
    },
    function () {
      withStubbed(
        api,
        "verifyGoogleIdToken",
        function (t, clientId) {
          assert.strictEqual(clientId, "");
          return { ok: true, email: "a@b", name: "A" };
        },
        function () {
          withStubbed(
            api,
            "createSessionForEmail",
            function (e, n, options) {
              sessionSs = options.spreadsheet;
              return { ok: true };
            },
            function () {
              api.loginWithGoogleIdToken("tok");
            }
          );
        }
      );
    }
  );
  assert.strictEqual(readSs, null);
  assert.strictEqual(sessionSs, null);
  console.log("   ✓ null spreadsheet 驗證通過！\n");
}

console.log("✓ loginWithGoogleIdToken 測試全數通過！\n");
