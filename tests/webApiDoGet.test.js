"use strict";

/**
 * doGet 單元測試（G2.3）
 * 驗證 GET action 白名單、OAuth 回呼處理、HtmlService 模板渲染與降級回應行為。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 doGet 測試...\n");

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

function makeHtmlService(templateImpl) {
  const calls = { create: 0, setTitle: null, addMetaTag: [], setXFrame: null, evaluate: 0 };
  const evaluated = { ok: true, rendered: "html" };
  const output = {
    setTitle: function (t) { calls.setTitle = t; return output; },
    addMetaTag: function (n, v) { calls.addMetaTag.push([n, v]); return output; },
    setXFrameOptionsMode: function (m) { calls.setXFrame = m; return output; },
    _evaluated: evaluated
  };
  const template = templateImpl || {
    evaluate: function () { calls.evaluate += 1; return output; }
  };
  const HtmlService = {
    XFrameOptionsMode: { DEFAULT: "DEFAULT" },
    createTemplateFromFile: function (file) {
      calls.create += 1;
      calls.file = file;
      return template;
    },
    _calls: calls,
    _output: output
  };
  return HtmlService;
}

async function run() {
  console.log("1. GET action=ping 應回傳 JSON 成功結果...");
  {
    const r = api.doGet({ parameter: { action: "ping" } });
    assert.strictEqual(r.ok, true);
    assert(r.pong > 0, "應包含 pong");
    console.log("   ✓ ping 驗證通過！\n");
  }

  console.log("2. GET action=getPublicConfig 應回傳 JSON 成功結果...");
  {
    const r = api.doGet({ parameter: { action: "getPublicConfig" } });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.version, api.WEB_API_VERSION);
    console.log("   ✓ getPublicConfig 驗證通過！\n");
  }

  console.log("3. GET 非白名單 action 應回傳 method_not_allowed...");
  {
    const r = api.doGet({ parameter: { action: "getCourseIndex" } });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "method_not_allowed");
    console.log("   ✓ 非白名單 action 驗證通過！\n");
  }

  console.log("4. GET 白名單 action 路由例外應回傳 server_error...");
  {
    const prev = api.routeWebApiAction;
    try {
      api.routeWebApiAction = function () { throw new Error("route fail"); };
      const r = api.doGet({ parameter: { action: "ping" } });
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.error, "server_error");
      assert(r.message.indexOf("route fail") !== -1);
    } finally {
      api.routeWebApiAction = prev;
    }
    console.log("   ✓ 路由例外驗證通過！\n");
  }

  console.log("5. 無 HtmlService 時應回傳服務資訊 JSON...");
  {
    const r = withGlobals({ HtmlService: undefined }, function () {
      return api.doGet({ parameter: {} });
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.service, "gas-course-web-template");
    assert.strictEqual(r.version, api.WEB_API_VERSION);
    console.log("   ✓ fallback JSON 驗證通過！\n");
  }

  console.log("6. 有 HtmlService 時應渲染模板並設定中繼資料...");
  {
    const template = {
      initialAuthResult: "unset",
      switchAccount: "unset",
      evaluate: function () { return null; }
    };
    const hs = makeHtmlService(template);
    template.evaluate = function () { hs._calls.evaluate += 1; return hs._output; };
    const result = withGlobals({ HtmlService: hs }, function () {
      return api.doGet({ parameter: {} });
    });
    assert.strictEqual(result, hs._output, "應回傳 evaluate 結果");
    assert.strictEqual(hs._calls.create, 1);
    assert.strictEqual(hs._calls.file, "index");
    assert.strictEqual(template.initialAuthResult, "");
    assert.strictEqual(template.switchAccount, false);
    assert.strictEqual(hs._calls.setTitle, "Google Apps Script 應用程式範本");
    assert.deepStrictEqual(hs._calls.addMetaTag, [["viewport", "width=device-width, initial-scale=1"]]);
    assert.strictEqual(hs._calls.setXFrame, "DEFAULT");
    console.log("   ✓ 模板渲染驗證通過！\n");
  }

  console.log("7. OAuth 回呼成功時應將 initialAuthResult 注入模板並跳脫 < ...");
  {
    const prev = api.handleOAuthCodeCallback;
    const template = { evaluate: function () { return null; } };
    const hs = makeHtmlService(template);
    template.evaluate = function () { return hs._output; };
    try {
      api.handleOAuthCodeCallback = function (code, e) {
        assert.strictEqual(code, "auth-code");
        return { ok: true, token: "t", html: "<script>" };
      };
      const result = withGlobals({ HtmlService: hs }, function () {
        return api.doGet({ parameter: { code: "auth-code", switch: "1" } });
      });
      assert.strictEqual(result, hs._output);
      assert.strictEqual(template.switchAccount, true);
      assert(template.initialAuthResult.indexOf("\\u003c") !== -1, "應跳脫 < 字元");
      assert(template.initialAuthResult.indexOf("<script>") === -1, "不應保留原始 <");
      const parsed = JSON.parse(template.initialAuthResult.replace(/\\u003c/g, "<"));
      assert.strictEqual(parsed.token, "t");
    } finally {
      api.handleOAuthCodeCallback = prev;
    }
    console.log("   ✓ OAuth 回呼注入驗證通過！\n");
  }

  console.log("8. OAuth 回呼拋出例外時應注入 oauth_callback_failed...");
  {
    const prev = api.handleOAuthCodeCallback;
    const template = { evaluate: function () { return null; } };
    const hs = makeHtmlService(template);
    template.evaluate = function () { return hs._output; };
    try {
      api.handleOAuthCodeCallback = function () { throw new Error("cb boom"); };
      withGlobals({ HtmlService: hs }, function () {
        api.doGet({ parameter: { code: "x" } });
      });
      const parsed = JSON.parse(template.initialAuthResult);
      assert.strictEqual(parsed.ok, false);
      assert.strictEqual(parsed.error, "oauth_callback_failed");
      assert(parsed.message.indexOf("cb boom") !== -1);
    } finally {
      api.handleOAuthCodeCallback = prev;
    }
    console.log("   ✓ OAuth 回呼例外驗證通過！\n");
  }

  console.log("9. HtmlService 模板評估失敗時應降級為服務 JSON...");
  {
    const hs = {
      XFrameOptionsMode: { DEFAULT: "DEFAULT" },
      createTemplateFromFile: function () { throw new Error("tpl fail"); }
    };
    const r = withGlobals({ HtmlService: hs }, function () {
      return api.doGet({ parameter: {} });
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.service, "gas-course-web-template");
    console.log("   ✓ 模板失敗降級驗證通過！\n");
  }

  console.log("✓ doGet 測試全數通過！\n");
}

run().catch(function (err) {
  console.error(err);
  process.exitCode = 1;
});
