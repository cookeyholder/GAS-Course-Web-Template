"use strict";

/**
 * OAuth 回呼寫入鎖單元測試（_task 1.5）
 * 驗證 handleOAuthCodeCallback 寫入鏈在 LockService 保護下完成、外部 HTTP 在鎖外執行，
 * 以及寫入例外時 finally 釋放鎖、取得鎖失敗時不建立 session。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 OAuth 回呼寫入鎖測試...\n");

const WEB_APP_URL = "https://script.google.com/macros/s/DEPLOY_ID/exec";

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

function createLockTracker(tryLockResult) {
  const tracker = {
    tryLockCalls: 0,
    releaseCalls: 0,
    locked: false,
    tryLockResult: tryLockResult !== false,
    service: null
  };
  tracker.service = {
    getScriptLock: function () {
      return {
        tryLock: function () {
          tracker.tryLockCalls += 1;
          if (tracker.tryLockResult) tracker.locked = true;
          return tracker.tryLockResult;
        },
        releaseLock: function () {
          tracker.releaseCalls += 1;
          tracker.locked = false;
        }
      };
    }
  };
  return tracker;
}

function makeDeps(overrides) {
  return Object.assign(
    {
      settings: {
        clientId: "client-id",
        clientSecret: "client-secret",
        allowedLoginDomain: ""
      },
      webAppUrl: WEB_APP_URL,
      spreadsheet: {},
      nonceCache: createMemoryNonceCache(),
      fetch: function () {
        return { statusCode: 200, text: JSON.stringify({ id_token: "id-token" }) };
      },
      verifyGoogleIdToken: function () {
        return { ok: true, email: "user@example.com", name: "User" };
      },
      createSessionForEmail: function () {
        return { ok: true, token: "session-token" };
      }
    },
    overrides || {}
  );
}

function validEvent() {
  return { parameter: { state: buildState("nonce-lock-test-12345678", WEB_APP_URL) } };
}

(async function run() {
  console.log("1. 回呼寫入取得鎖並正確釋放...");
  {
    const tracker = createLockTracker(true);
    let sessionCreated = 0;
    const deps = makeDeps({
      lockService: tracker.service,
      createSessionForEmail: function () {
        sessionCreated += 1;
        return { ok: true, token: "session-token" };
      }
    });
    const r = await api.handleOAuthCodeCallback("auth-code", validEvent(), deps);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(sessionCreated, 1);
    assert.strictEqual(tracker.tryLockCalls, 1);
    assert.strictEqual(tracker.releaseCalls, 1);
    assert.strictEqual(tracker.locked, false);
    console.log("   ✓ 取得鎖與釋放驗證通過！\n");
  }

  console.log("2. 寫入拋出例外時 finally 仍釋放鎖...");
  {
    const tracker = createLockTracker(true);
    const deps = makeDeps({
      lockService: tracker.service,
      createSessionForEmail: function () {
        throw new Error("write boom");
      }
    });
    const r = await api.handleOAuthCodeCallback("auth-code", validEvent(), deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(tracker.releaseCalls, 1);
    assert.strictEqual(tracker.locked, false);
    console.log("   ✓ 例外釋放鎖驗證通過！\n");
  }

  console.log("3. 取得鎖失敗時不建立 session 且不消耗 nonce...");
  {
    const tracker = createLockTracker(false);
    let sessionCreated = 0;
    const deps = makeDeps({
      lockService: tracker.service,
      createSessionForEmail: function () {
        sessionCreated += 1;
        return { ok: true, token: "session-token" };
      }
    });
    const event = validEvent();
    const r1 = await api.handleOAuthCodeCallback("auth-code-1", event, deps);
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.error, "lock_timeout");
    assert.strictEqual(sessionCreated, 0);
    assert.strictEqual(tracker.releaseCalls, 0);

    // 鎖恢復後同一 nonce 仍可使用，代表先前未消耗。
    tracker.tryLockResult = true;
    deps.lockService = tracker.service;
    const r2 = await api.handleOAuthCodeCallback("auth-code-2", event, deps);
    assert.strictEqual(r2.ok, true, "lock timeout 不應消耗 nonce");
    console.log("   ✓ lock timeout 防護通過！\n");
  }

  console.log("4. 外部 HTTP（ID Token 驗證）必須在取得鎖之前完成...");
  {
    const tracker = createLockTracker(true);
    const events = [];
    const deps = makeDeps({
      lockService: tracker.service,
      verifyGoogleIdToken: function () {
        events.push({ name: "verify", locked: tracker.locked });
        return { ok: true, email: "user@example.com", name: "User" };
      },
      createSessionForEmail: function () {
        events.push({ name: "createSession", locked: tracker.locked });
        return { ok: true, token: "session-token" };
      }
    });
    const r = await api.handleOAuthCodeCallback("auth-code", validEvent(), deps);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(events, [
      { name: "verify", locked: false },
      { name: "createSession", locked: true }
    ]);
    console.log("   ✓ 外部 HTTP 與鎖分離驗證通過！\n");
  }

  console.log("5. nonce 驗證失敗時不建立 session...");
  {
    const tracker = createLockTracker(true);
    let sessionCreated = 0;
    const deps = makeDeps({
      lockService: tracker.service,
      createSessionForEmail: function () {
        sessionCreated += 1;
        return { ok: true, token: "session-token" };
      }
    });
    const legacyState = Buffer.from(JSON.stringify({ redirectUri: WEB_APP_URL }), "utf8").toString("base64");
    const r = await api.handleOAuthCodeCallback("auth-code", { parameter: { state: legacyState } }, deps);
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "invalid_oauth_state");
    assert.strictEqual(sessionCreated, 0);
    assert.strictEqual(tracker.tryLockCalls, 1, "state 驗證在鎖內執行，仍應取得鎖");
    assert.strictEqual(tracker.releaseCalls, 1);
    console.log("   ✓ nonce 驗證失敗路徑驗證通過！\n");
  }

  console.log("✓ OAuth 回呼寫入鎖測試全數通過！\n");
})().catch(function (error) {
  console.error("✗ 測試失敗：tests/webApiOAuthCallbackLock.test.js");
  console.error(error);
  process.exitCode = 1;
});
