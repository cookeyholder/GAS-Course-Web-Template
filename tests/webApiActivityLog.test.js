"use strict";

/**
 * webApiActivityLog.test.js（task 4.1 起）
 * 驗證請求層級日誌 context、授權身分寫回，以及解析失敗／缺少 action 仍進入 finally。
 */

const assert = require("assert");
const api = require("../webApi.js");
const originalCreateContext = api.createWebApiLogContext;

console.log("開始執行 webApiActivityLog 測試...\n");

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

console.log("1. context 應含請求識別碼、動作與開始時間...");
{
  const context = api.createWebApiLogContext("saveSystemSettings", 12345);
  assert.strictEqual(typeof context.requestId, "string");
  assert(context.requestId.indexOf("req_") === 0);
  assert.strictEqual(context.action, "saveSystemSettings");
  assert.strictEqual(context.startTime, 12345);
  assert.strictEqual(context.email, "");
  assert.strictEqual(context.name, "");
  assert.strictEqual(context.role, "");
  assert.strictEqual(context.errorCode, "");
  console.log("   ✓ context 建立驗證通過！\n");
}

console.log("2. 授權 session 應寫回已驗證身分，角色顯示名稱由 role 換算...");
{
  const context = api.createWebApiLogContext("getSession");
  api.recordWebApiIdentity(
    context,
    {
      ok: true,
      session: {
        email: "staff@example.com",
        name: "業務人員甲",
        role: "staff",
        roleName: "遭竄改的角色"
      }
    },
    null
  );
  assert.strictEqual(context.email, "staff@example.com");
  assert.strictEqual(context.name, "業務人員甲");
  assert.strictEqual(context.role, "業務人員");
  assert.notStrictEqual(context.role, "遭竄改的角色");
  console.log("   ✓ 授權身分寫回驗證通過！\n");
}

console.log("3. 公開登入成功應由回傳結果補寫已驗證身分...");
{
  const context = api.createWebApiLogContext("login");
  api.recordWebApiIdentity(context, null, {
    ok: true,
    email: "admin@example.com",
    name: "管理員",
    role: "admin",
    roleName: "遭竄改的角色"
  });
  assert.strictEqual(context.email, "admin@example.com");
  assert.strictEqual(context.role, "系統管理員");
  assert.notStrictEqual(context.role, "遭竄改的角色");
  console.log("   ✓ 登入身分補寫驗證通過！\n");
}

console.log("4. JSON 解析失敗仍應建立 context（try 已上移）...");
{
  const contexts = [];
  withOverrides(
    {
      createWebApiLogContext: function (action, startTime) {
        const context = originalCreateContext(action, startTime);
        contexts.push(context);
        return context;
      }
    },
    function () {
      const result = api.executeWebApi("{bad json", {});
      assert.strictEqual(result.error, "invalid_json");
    }
  );
  assert.strictEqual(contexts.length, 1, "解析失敗仍應建立 context");
  assert.strictEqual(contexts[0].action, "");
  console.log("   ✓ 解析失敗 context 驗證通過！\n");
}

console.log("5. 缺少 action 仍應建立 context...");
{
  const contexts = [];
  withOverrides(
    {
      createWebApiLogContext: function (action, startTime) {
        const context = originalCreateContext(action, startTime);
        contexts.push(context);
        return context;
      }
    },
    function () {
      const result = api.executeWebApi({}, {});
      assert.strictEqual(result.error, "missing_action");
    }
  );
  assert.strictEqual(contexts.length, 1);
  assert.strictEqual(contexts[0].action, "");
  console.log("   ✓ 缺少 action context 驗證通過！\n");
}

console.log("6. 被置換的 routeWebApiAction 應收到單次授權結果...");
{
  const seen = [];
  withOverrides(
    {
      routeWebApiAction: function (action, payload, event, authorization) {
        seen.push({ action: action, authorization: authorization });
        return { ok: true, replaced: true };
      }
    },
    function () {
      const result = api.executeWebApi({ action: "ping" }, {});
      assert.strictEqual(result.replaced, true);
    }
  );
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].action, "ping");
  assert.strictEqual(seen[0].authorization.ok, true);
  assert.strictEqual(seen[0].authorization.session, null);
  console.log("   ✓ 路由置換情境驗證通過！\n");
}

console.log("7. executeWebApi 應在登入成功後寫回 context 身分...");
{
  const contexts = [];
  withOverrides(
    {
      createWebApiLogContext: function (action, startTime) {
        const context = originalCreateContext(action, startTime);
        contexts.push(context);
        return context;
      },
      routeWebApiAction: function () {
        return {
          ok: true,
          email: "admin@example.com",
          name: "管理員",
          role: "admin",
          roleName: "遭竄改的角色"
        };
      }
    },
    function () {
      api.executeWebApi({ action: "login" }, {});
    }
  );
  assert.strictEqual(contexts.length, 1);
  assert.strictEqual(contexts[0].email, "admin@example.com");
  assert.strictEqual(contexts[0].role, "系統管理員");
  console.log("   ✓ 注入式身分寫回驗證通過！\n");
}

console.log("✓ webApiActivityLog.test.js 測試全數通過！\n");
