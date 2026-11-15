"use strict";

const assert = require("assert");
const api = require("../webApi.js");
const db = require("../databaseInitializer.js");

console.log("開始執行 Web API 與權限驗證單元測試...\n");

// 1. 測試公開 ping 與 getPublicConfig
{
  const pingRes = api.routeWebApiAction("ping", {});
  assert.strictEqual(pingRes.ok, true, "ping 回應 ok 應為 true");
  assert(pingRes.pong > 0, "ping 回應應包含時間戳記");

  const configRes = api.routeWebApiAction("getPublicConfig", {});
  assert.strictEqual(configRes.ok, true, "getPublicConfig 回應 ok 應為 true");
  assert.strictEqual(configRes.version, api.WEB_API_VERSION, "版本代碼相符");
}

// 2. 測試角色權限檢查 (RBAC)
{
  assert.strictEqual(api.hasPermission("admin", "importCourseCodes"), true, "admin 應具備所有權限");
  assert.strictEqual(api.hasPermission("admin", "saveSystemSettings"), true, "admin 應具備修改設定權限");

  assert.strictEqual(api.hasPermission("staff", "importCourseCodes"), true, "staff 應具備匯入課程權限");
  assert.strictEqual(api.hasPermission("staff", "getCourseIndex"), true, "staff 應具備查詢課程權限");
  assert.strictEqual(api.hasPermission("staff", "saveSystemSettings"), false, "staff 不得修改系統設定");

  assert.strictEqual(api.hasPermission("viewer", "getCourseIndex"), true, "viewer 應具備查詢課程權限");
  assert.strictEqual(api.hasPermission("viewer", "importCourseCodes"), false, "viewer 不得匯入課程");
  assert.strictEqual(api.hasPermission("viewer", "saveSystemSettings"), false, "viewer 不得修改系統設定");
}

// 3. 測試 Session 建立與授權流程
{
  const sessionResult = api.createSessionForEmail("test-admin@example.com", "測試管理員");
  assert.strictEqual(sessionResult.ok, true, "建立 Session 應成功");
  assert(sessionResult.token.startsWith("gas_"), "Token 應帶有 gas_ 前綴");
  assert.strictEqual(sessionResult.email, "test-admin@example.com");

  // 使用 Session Token 呼叫 getSession
  const getSessionRes = api.routeWebApiAction("getSession", { token: sessionResult.token });
  assert.strictEqual(getSessionRes.ok, true, "驗證 Token 成功");
  assert.strictEqual(getSessionRes.email, "test-admin@example.com");

  // 登出 Session
  const logoutRes = api.routeWebApiAction("logout", { token: sessionResult.token });
  assert.strictEqual(logoutRes.ok, true, "登出應成功");

  // 再次呼叫應回傳 session_expired
  const expiredRes = api.routeWebApiAction("getSession", { token: sessionResult.token });
  assert.strictEqual(expiredRes.ok, false, "已登出 Token 應失效");
  assert.strictEqual(expiredRes.error, "session_expired");
}

// 4. 測試未登入存取受保護 Action 應遭攔截
{
  const unauthorizedRes = api.routeWebApiAction("importCourseCodes", {});
  assert.strictEqual(unauthorizedRes.ok, false, "無 Token 呼叫應遭拒絕");
  assert.strictEqual(unauthorizedRes.error, "missing_token");
}

console.log("✓ Web API 與權限驗證單元測試全數通過！");
