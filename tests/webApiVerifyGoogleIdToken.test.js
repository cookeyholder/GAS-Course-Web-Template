"use strict";

/**
 * verifyGoogleIdToken 單元測試（G2.4）
 * 驗證 Google ID Token 各項檢查分支與錯誤處理行為。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 verifyGoogleIdToken 測試...\n");

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function validInfo(overrides) {
  return Object.assign(
    {
      email: "user@example.com",
      iss: "https://accounts.google.com",
      email_verified: "true",
      aud: "client-id",
      iat: nowSeconds() - 60,
      exp: nowSeconds() + 3600
    },
    overrides || {}
  );
}

function makeDeps(overrides) {
  return Object.assign(
    {
      fetch: function () {
        return {
          statusCode: 200,
          text: JSON.stringify(
            validInfo({
              name: "使用者",
              sub: "sub-1",
              picture: "https://img"
            })
          )
        };
      }
    },
    overrides || {}
  );
}

console.log("1. 缺少 ID Token 應回傳 missing_id_token...");
{
  const r1 = api.verifyGoogleIdToken("", "client-id", "", makeDeps());
  const r2 = api.verifyGoogleIdToken(null, "client-id", "", makeDeps());
  const r3 = api.verifyGoogleIdToken(123, "client-id", "", makeDeps());
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.error, "missing_id_token");
  assert.strictEqual(r2.error, "missing_id_token");
  assert.strictEqual(r3.error, "missing_id_token");
  console.log("   ✓ 缺少 ID Token 驗證通過！\n");
}

console.log("2. 缺少 Client ID 應回傳 server_misconfigured...");
{
  const r1 = api.verifyGoogleIdToken("token", "", "", makeDeps());
  const r2 = api.verifyGoogleIdToken("token", "   ", "", makeDeps());
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.error, "server_misconfigured");
  assert.strictEqual(r2.error, "server_misconfigured");
  console.log("   ✓ 缺少 Client ID 驗證通過！\n");
}

console.log("3. 無可用 tokeninfo 查詢環境應回傳 environment_error...");
{
  const r = api.verifyGoogleIdToken("token", "client-id", "", { fetch: null });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "environment_error");
  console.log("   ✓ 環境不支援驗證通過！\n");
}

console.log("4. tokeninfo 非 200 應回傳 invalid_id_token...");
{
  const r = api.verifyGoogleIdToken(
    "token",
    "client-id",
    "",
    makeDeps({
      fetch: function () {
        return { statusCode: 401, text: "{}" };
      }
    })
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "invalid_id_token");
  console.log("   ✓ 非 200 回應驗證通過！\n");
}

console.log("5. tokeninfo JSON 解析失敗應回傳 token_verify_error...");
{
  const r = api.verifyGoogleIdToken(
    "token",
    "client-id",
    "",
    makeDeps({
      fetch: function () {
        return { statusCode: 200, text: "not-json" };
      }
    })
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "token_verify_error");
  console.log("   ✓ JSON 解析錯誤驗證通過！\n");
}

console.log("6. 缺少 Email 欄位應回傳 invalid_token_payload...");
{
  const r = api.verifyGoogleIdToken(
    "token",
    "client-id",
    "",
    makeDeps({
      fetch: function () {
        return {
          statusCode: 200,
          text: JSON.stringify({ iss: "https://accounts.google.com", email_verified: "true", aud: "client-id" })
        };
      }
    })
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "invalid_token_payload");
  console.log("   ✓ 缺少 Email 驗證通過！\n");
}

console.log("7. 發行者不符應回傳 invalid_issuer...");
{
  const r = api.verifyGoogleIdToken(
    "token",
    "client-id",
    "",
    makeDeps({
      fetch: function () {
        return {
          statusCode: 200,
          text: JSON.stringify({
            email: "user@example.com",
            iss: "https://evil.example.com",
            email_verified: "true",
            aud: "client-id"
          })
        };
      }
    })
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "invalid_issuer");
  console.log("   ✓ 發行者驗證通過！\n");
}

console.log("8. Email 未驗證應回傳 email_not_verified...");
{
  const makeResp = function (verified) {
    return makeDeps({
      fetch: function () {
        return {
          statusCode: 200,
          text: JSON.stringify({
            email: "user@example.com",
            iss: "accounts.google.com",
            email_verified: verified,
            aud: "client-id"
          })
        };
      }
    });
  };
  assert.strictEqual(api.verifyGoogleIdToken("token", "client-id", "", makeResp(false)).error, "email_not_verified");
  assert.strictEqual(api.verifyGoogleIdToken("token", "client-id", "", makeResp("false")).error, "email_not_verified");
  console.log("   ✓ Email 驗證狀態檢查通過！\n");
}

console.log("9. Client ID 不符應回傳 client_id_mismatch...");
{
  const r = api.verifyGoogleIdToken("token", "expected-client", "", makeDeps());
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "client_id_mismatch");
  console.log("   ✓ Client ID 驗證通過！\n");
}

console.log("10. 網域不允許應回傳 domain_not_allowed...");
{
  const deps = makeDeps({
    fetch: function () {
      return {
        statusCode: 200,
        text: JSON.stringify({
          email: "user@other.com",
          iss: "https://accounts.google.com",
          email_verified: "true",
          aud: "client-id",
          hd: "other.com"
        })
      };
    }
  });
  const r = api.verifyGoogleIdToken("token", "client-id", "example.com", deps);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "domain_not_allowed");
  console.log("   ✓ 網域限制驗證通過！\n");
}

console.log("11. 驗證成功應回傳正規化使用者資訊...");
{
  let capturedUrl = "";
  const deps = makeDeps({
    fetch: function (url) {
      capturedUrl = url;
      return {
        statusCode: 200,
        text: JSON.stringify(
          validInfo({
            email: "USER@Example.com",
            email_verified: true,
            name: "測試者",
            sub: "sub-9",
            picture: "https://pic"
          })
        )
      };
    }
  });
  const r = api.verifyGoogleIdToken("my-token", "client-id", "", deps);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.email, "user@example.com");
  assert.strictEqual(r.name, "測試者");
  assert.strictEqual(r.sub, "sub-9");
  assert.strictEqual(r.picture, "https://pic");
  assert(
    capturedUrl.indexOf("id_token=my-token") !== -1 || capturedUrl.indexOf("id_token=") !== -1,
    "應查詢 tokeninfo"
  );
  console.log("   ✓ 成功流程驗證通過！\n");
}

console.log("12. 名稱缺失時應回退為 email...");
{
  const deps = makeDeps({
    fetch: function () {
      return {
        statusCode: 200,
        text: JSON.stringify(validInfo({ iss: "accounts.google.com" }))
      };
    }
  });
  const r = api.verifyGoogleIdToken("token", "client-id", "", deps);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.name, "user@example.com");
  console.log("   ✓ 名稱回退驗證通過！\n");
}

console.log("13. fetch 拋出例外應回傳 token_verify_error...");
{
  const deps = makeDeps({
    fetch: function () {
      throw new Error("net err");
    }
  });
  const r = api.verifyGoogleIdToken("token", "client-id", "", deps);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "token_verify_error");
  assert(r.message.indexOf("net err") === -1, "不得回傳例外訊息原文");
  assert(r.message.indexOf("請稍後再試或重新登入") !== -1, "應回傳通用錯誤訊息");
  console.log("   ✓ 例外處理驗證通過！\n");
}

console.log("14. 缺少 exp/iat 時間宣告應回傳 invalid_token_payload...");
{
  const makeTimeDeps = function (infoOverrides) {
    return makeDeps({
      fetch: function () {
        return { statusCode: 200, text: JSON.stringify(validInfo(infoOverrides)) };
      }
    });
  };
  const now = nowSeconds();
  assert.strictEqual(
    api.verifyGoogleIdToken("token", "client-id", "", makeTimeDeps({ exp: undefined })).error,
    "invalid_token_payload"
  );
  assert.strictEqual(
    api.verifyGoogleIdToken("token", "client-id", "", makeTimeDeps({ iat: undefined })).error,
    "invalid_token_payload"
  );
  assert.strictEqual(
    api.verifyGoogleIdToken("token", "client-id", "", makeTimeDeps({ exp: "abc", iat: "0" })).error,
    "invalid_token_payload"
  );
  assert.strictEqual(
    api.verifyGoogleIdToken("token", "client-id", "", makeTimeDeps({ iat: now + 120, exp: now + 3600 })).error,
    "token_issued_in_future"
  );
  assert.strictEqual(
    api.verifyGoogleIdToken("token", "client-id", "", makeTimeDeps({ iat: now - 200, exp: now - 100 })).error,
    "token_expired"
  );
  assert.strictEqual(
    api.verifyGoogleIdToken("token", "client-id", "", makeTimeDeps({ iat: now - 10, exp: now - 10 })).error,
    "invalid_token_payload"
  );
  console.log("   ✓ 時間宣告檢查通過！\n");
}

console.log("15. clock skew 容忍範圍與注入 now 驗證...");
{
  const now = 1_700_000_000;
  const makeTimeDeps = function (iat, exp) {
    return makeDeps({
      now: function () {
        return now;
      },
      fetch: function () {
        return {
          statusCode: 200,
          text: JSON.stringify(validInfo({ iat: iat, exp: exp }))
        };
      }
    });
  };
  const skewed = api.verifyGoogleIdToken("token", "client-id", "", makeTimeDeps(now - 30, now + 30));
  assert.strictEqual(skewed.ok, true, "容許時鐘誤差範圍內應通過");
  assert.strictEqual(
    api.verifyGoogleIdToken("token", "client-id", "", makeTimeDeps(now - 91, now - 61)).error,
    "token_expired"
  );
  const invalidNow = makeTimeDeps(now - 30, now + 30);
  invalidNow.now = function () {
    return "bad";
  };
  assert.strictEqual(api.verifyGoogleIdToken("token", "client-id", "", invalidNow).error, "invalid_token_payload");
  console.log("   ✓ clock skew 與 now 注入驗證通過！\n");
}

console.log("16. validateTokenInfoClaims_ 可供獨立單元測試呼叫...");
{
  assert.strictEqual(typeof api.validateTokenInfoClaims, "function");
  const now = nowSeconds();
  assert.strictEqual(
    api.validateTokenInfoClaims(validInfo(), "client-id", "", {
      now: function () {
        return now;
      }
    }),
    null
  );
  console.log("   ✓ 匯出驗證通過！\n");
}

console.log("✓ verifyGoogleIdToken 測試全數通過！\n");
