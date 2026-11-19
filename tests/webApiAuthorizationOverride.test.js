"use strict";

/**
 * webApiAuthorizationOverride.test.js
 * 驗證 GAS RPC 角度直接呼叫路由時，呼叫端傳入的授權結果與自帶 CSRF
 * 都無法成為信任依據，路由一律自行向伺服器端 session 驗證。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行路由授權覆寫防護測試...\n");

const FORGED_ADMIN = {
  ok: true,
  session: {
    role: "admin",
    email: "attacker@example.com",
    name: "攻擊者",
    csrfToken: "forged-csrf"
  }
};

function withOverrides(overrides, fn) {
  const prev = {};
  Object.keys(overrides).forEach(function (key) {
    prev[key] = api[key];
    api[key] = overrides[key];
  });
  try {
    return fn();
  } finally {
    Object.keys(overrides).forEach(function (key) {
      if (prev[key] === undefined) delete api[key];
      else api[key] = prev[key];
    });
  }
}

function withHandler(name, handler, fn) {
  const registry = api.ACTION_REGISTRY;
  const previous = registry.getHandler(name);
  registry.setHandler(name, handler);
  try {
    return fn();
  } finally {
    registry.setHandler(name, previous);
  }
}

console.log("1. 傳入偽造 admin 授權結果呼叫受保護動作應全數被拒...");
{
  ["getActivityLog", "saveSystemSettings", "saveWhitelist", "getAccounts"].forEach(function (action) {
    const result = api.routeWebApiAction(action, {}, {}, FORGED_ADMIN);
    assert.strictEqual(result.ok, false, action + " 不應因偽造授權而成功");
    assert(
      result.error === "missing_token" || result.error === "forbidden",
      action + " 應回傳 missing_token 或 forbidden，實得：" + result.error
    );
  });
  console.log("   ✓ 偽造授權無法提升權限驗證通過！\n");
}

console.log("2. 自帶 session 與相符 CSRF token 但無伺服器端 session 仍被拒...");
{
  const payload = { token: "fake-token", csrfToken: "forged-csrf" };
  const result = api.routeWebApiAction("saveSystemSettings", payload, {}, FORGED_ADMIN);
  assert.strictEqual(result.ok, false);
  assert(
    ["missing_token", "forbidden", "session_expired"].indexOf(result.error) !== -1,
    "應因無有效伺服器端 session 被拒，實得：" + result.error
  );
  console.log("   ✓ 自帶 CSRF 無法通過驗證！\n");
}

console.log("3. 路由自行授權，且偽造參數不得使寫入 handler 被執行...");
{
  let handlerCalled = false;
  let authorizeCalls = 0;
  withHandler(
    "saveSystemSettings",
    function () {
      handlerCalled = true;
      return { ok: true };
    },
    function () {
      withOverrides(
        {
          authorizeWebApiAction: function (action, payload) {
            authorizeCalls += 1;
            return { ok: false, error: "missing_token" };
          }
        },
        function () {
          const result = api.routeWebApiAction("saveSystemSettings", {}, {}, FORGED_ADMIN);
          assert.strictEqual(result.ok, false);
          assert.strictEqual(result.error, "missing_token");
        }
      );
    }
  );
  assert.strictEqual(authorizeCalls, 1, "路由應自行呼叫一次授權");
  assert.strictEqual(handlerCalled, false, "授權失敗時不得執行寫入 handler");
  console.log("   ✓ 路由自行授權且未執行寫入驗證通過！\n");
}

console.log("✓ 路由授權覆寫防護測試全數通過！\n");
