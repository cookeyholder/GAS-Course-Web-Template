"use strict";

/**
 * doPost 單元測試（G2.9）
 * 驗證 POST payload 解析、action 解析與 executeWebApi 委派行為。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 doPost 測試...\n");

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

console.log("1. 解析 payload 拋出例外時應回傳 invalid_json...");
{
  withStubbed(
    api,
    "parseWebApiPayload",
    function () {
      throw new Error("boom");
    },
    function () {
      const r = api.doPost({ postData: { contents: "{}" } });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.error, "invalid_json");
    }
  );
  console.log("   ✓ 解析例外驗證通過！\n");
}

console.log("2. postData JSON 格式錯誤（payload 為 null）時應回傳 invalid_json...");
{
  const event = { postData: { contents: "{bad json" } };
  const r = api.doPost(event);
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "invalid_json");
  console.log("   ✓ 無效 JSON 驗證通過！\n");
}

console.log("3. 缺少 action（payload 與 parameter 皆無）應回傳 missing_action...");
{
  const r1 = api.doPost({ postData: { contents: JSON.stringify({}) } });
  const r2 = api.doPost({ postData: { contents: JSON.stringify({ action: "   " }) } });
  const r3 = api.doPost({});
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.error, "missing_action");
  assert.strictEqual(r2.error, "missing_action");
  assert.strictEqual(r3.error, "missing_action");
  console.log("   ✓ 缺少 action 驗證通過！\n");
}

console.log("4. action 可由 payload.action 取得並委派 executeWebApi...");
{
  let captured = null;
  const payload = { action: "ping" };
  const event = { postData: { contents: JSON.stringify(payload) } };
  const expected = { ok: true, pong: 1 };
  withStubbed(
    api,
    "executeWebApi",
    function (p, e) {
      captured = { p: p, e: e };
      return expected;
    },
    function () {
      const r = api.doPost(event);
      assert.deepStrictEqual(r, expected);
    }
  );
  assert.deepStrictEqual(captured.p, payload);
  assert.strictEqual(captured.e, event);
  console.log("   ✓ payload action 委派驗證通過！\n");
}

console.log("5. action 可由 event.parameter.action 補齊並委派 executeWebApi...");
{
  let captured = null;
  const payload = { token: "t" };
  const event = { postData: { contents: JSON.stringify(payload) }, parameter: { action: "getSession" } };
  const expected = { ok: true, source: "param" };
  withStubbed(
    api,
    "executeWebApi",
    function (p, e) {
      captured = { p: p, e: e };
      return expected;
    },
    function () {
      const r = api.doPost(event);
      assert.deepStrictEqual(r, expected);
    }
  );
  assert.deepStrictEqual(captured.p, payload);
  assert.strictEqual(captured.e, event);
  console.log("   ✓ parameter action fallback 驗證通過！\n");
}

console.log("6. 直接以 parameter 傳入 action 時（無 postData）應可執行...");
{
  let captured = null;
  const event = { parameter: { action: "ping", foo: "bar" } };
  const expected = { ok: true, from: "param-only" };
  withStubbed(
    api,
    "executeWebApi",
    function (p, e) {
      captured = { p: p, e: e };
      return expected;
    },
    function () {
      const r = api.doPost(event);
      assert.deepStrictEqual(r, expected);
    }
  );
  assert.deepStrictEqual(captured.p, event.parameter);
  assert.strictEqual(captured.e, event);
  console.log("   ✓ parameter-only 請求驗證通過！\n");
}

console.log("7. executeWebApi 回傳錯誤物件時應原樣包裝回應...");
{
  const expected = { ok: false, error: "server_error", message: "x" };
  withStubbed(
    api,
    "executeWebApi",
    function () {
      return expected;
    },
    function () {
      const r = api.doPost({ postData: { contents: JSON.stringify({ action: "ping" }) } });
      assert.deepStrictEqual(r, expected);
    }
  );
  console.log("   ✓ 錯誤回應透傳驗證通過！\n");
}

console.log("8. 解析失敗與缺少 action 兩條路徑應各寫入一列失敗日誌...");
{
  const written = [];
  withStubbed(
    api,
    "appendActivityLog",
    function (record) {
      written.push(record);
    },
    function () {
      // 路徑一：parseWebApiPayload 拋出例外
      withStubbed(
        api,
        "parseWebApiPayload",
        function () {
          throw new Error("boom");
        },
        function () {
          const r = api.doPost({ postData: { contents: "{}" } });
          assert.strictEqual(r.ok, false);
          assert.strictEqual(r.error, "invalid_json");
        }
      );
      // 路徑二：解析回傳 null（JSON 格式錯誤）
      const invalid = api.doPost({ postData: { contents: "{bad json" } });
      assert.strictEqual(invalid.error, "invalid_json");
      // 路徑三：缺少 action
      const missing = api.doPost({ postData: { contents: JSON.stringify({}) } });
      assert.strictEqual(missing.error, "missing_action");
    }
  );
  assert.strictEqual(written.length, 3, "三條失敗路徑應各寫入一列日誌");
  assert(written.some(function (record) {
    return record.errorCode === "invalid_json";
  }), "應記錄 invalid_json 錯誤代碼");
  assert(written.some(function (record) {
    return record.errorCode === "missing_action";
  }), "應記錄 missing_action 錯誤代碼");
  console.log("   ✓ 失敗路徑寫入日誌驗證通過！\n");
}

console.log("✓ doPost 測試全數通過！\n");
