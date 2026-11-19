"use strict";

/**
 * webapp/js/api.js 單元測試（G5.1, G5.2, G5.7 部分）
 * 驗證 mock/RPC/fetch 分流、回應解析、錯誤正規化、token/CSRF 夾帶與重試策略。
 */

const assert = require("assert");
const apiModule = require("../webapp/js/api.js");

console.log("開始執行 webapp/js/api.js 測試...\n");

function makeStorage(initial) {
  const store = Object.assign({}, initial || {});
  return {
    store: store,
    getItem: function (k) {
      return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null;
    },
    setItem: function (k, v) {
      store[k] = String(v);
    },
    removeItem: function (k) {
      delete store[k];
    }
  };
}

function baseDeps(overrides) {
  const storage = makeStorage({});
  return Object.assign(
    {
      config: { storageKey: "gas_tmpl.session.v1", apiUrl: "https://api.test/exec", mock: false },
      storage: storage,
      fetch: null,
      google: null,
      mock: null,
      setTimeoutFn: function (fn) {
        fn();
      }
    },
    overrides || {}
  );
}

(async function run() {
  console.log("1. 應匯出可測試的 API 建構函式...");
  assert.strictEqual(typeof apiModule.createApiClient, "function", "應匯出 createApiClient");
  assert.strictEqual(typeof apiModule.parseApiResponse, "function", "應匯出 parseApiResponse");
  console.log("   ✓ 匯出介面驗證通過！\n");

  console.log("2. parseApiResponse 應解析 JSON 物件並對無效回應回傳錯誤...");
  assert.deepStrictEqual(apiModule.parseApiResponse('{"ok":true,"x":1}'), { ok: true, x: 1 });
  const invalid = apiModule.parseApiResponse("not-json");
  assert.strictEqual(invalid.ok, false);
  assert.strictEqual(invalid.error, "invalid_response");
  assert.strictEqual(apiModule.parseApiResponse('"string"').error, "invalid_response");
  assert.strictEqual(apiModule.parseApiResponse("null").error, "invalid_response");
  console.log("   ✓ parseApiResponse 驗證通過！\n");

  console.log("3. mock 模式應呼叫 MEA.mock.handle 並夾帶 action/token/csrfToken...");
  {
    let handled = null;
    const storage = makeStorage({ "gas_tmpl.session.v1": "t1", "gas_tmpl.csrf.v1": "c1" });
    const mock = {
      handle: function (action, body) {
        handled = { action: action, body: body };
        return Promise.resolve({ ok: true, from: "mock" });
      }
    };
    const api = apiModule.createApiClient(
      baseDeps({ config: { storageKey: "gas_tmpl.session.v1", apiUrl: "", mock: true }, storage: storage, mock: mock })
    );
    const res = await api.requestOnce("ping", { a: 1 });
    assert.deepStrictEqual(res, { ok: true, from: "mock" });
    assert.strictEqual(handled.action, "ping");
    assert.deepStrictEqual(handled.body, { a: 1, action: "ping", token: "t1", csrfToken: "c1" });
    console.log("   ✓ mock 模式驗證通過！\n");
  }

  console.log("4. mock 模式 payload token/csrfToken 應可覆寫目前值...");
  {
    let handled = null;
    const storage = makeStorage({ "gas_tmpl.session.v1": "t1", "gas_tmpl.csrf.v1": "c1" });
    const mock = {
      handle: function (action, body) {
        handled = body;
        return Promise.resolve({ ok: true });
      }
    };
    const api = apiModule.createApiClient(
      baseDeps({ config: { storageKey: "gas_tmpl.session.v1", mock: true }, storage: storage, mock: mock })
    );
    await api.requestOnce("act", { token: "pt", csrfToken: "pc" });
    assert.strictEqual(handled.token, "pt");
    assert.strictEqual(handled.csrfToken, "pc");
    console.log("   ✓ mock 覆寫 token/csrf 驗證通過！\n");
  }

  console.log("5. google.script.run RPC 成功時應解析字串結果或直接回傳物件...");
  {
    const storage = makeStorage({ "gas_tmpl.session.v1": "t2", "gas_tmpl.csrf.v1": "c2" });
    function makeGoogle(result) {
      return {
        script: {
          run: {
            _body: null,
            withSuccessHandler: function (fn) {
              this._success = fn;
              return this;
            },
            withFailureHandler: function (fn) {
              this._failure = fn;
              return this;
            },
            executeWebApi: function (body) {
              this._body = body;
              this._success(result);
            }
          }
        }
      };
    }
    const g1 = makeGoogle('{"ok":true,"v":1}');
    const api1 = apiModule.createApiClient(baseDeps({ storage: storage, google: g1 }));
    const r1 = await api1.requestOnce("a1", { x: 1 });
    assert.deepStrictEqual(r1, { ok: true, v: 1 });
    assert.deepStrictEqual(g1.script.run._body, { x: 1, action: "a1", token: "t2", csrfToken: "c2" });

    const g2 = makeGoogle({ ok: true, obj: 1 });
    const api2 = apiModule.createApiClient(baseDeps({ storage: storage, google: g2 }));
    const r2 = await api2.requestOnce("a2", {});
    assert.deepStrictEqual(r2, { ok: true, obj: 1 });

    const g3 = makeGoogle(null);
    const api3 = apiModule.createApiClient(baseDeps({ storage: storage, google: g3 }));
    const r3 = await api3.requestOnce("a3", {});
    assert.strictEqual(r3.ok, false);
    assert.strictEqual(r3.error, "invalid_response");
    console.log("   ✓ RPC 成功分支驗證通過！\n");
  }

  console.log("6. google.script.run 失敗或拋出例外時應回傳 server_error...");
  {
    const storage = makeStorage({});
    const gFail = {
      script: {
        run: {
          withSuccessHandler: function () {
            return this;
          },
          withFailureHandler: function (fn) {
            this._failure = fn;
            return this;
          },
          executeWebApi: function () {
            this._failure(new Error("boom"));
          }
        }
      }
    };
    const apiFail = apiModule.createApiClient(baseDeps({ storage: storage, google: gFail }));
    const r1 = await apiFail.requestOnce("x", {});
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.error, "server_error");
    assert.strictEqual(r1.message, "後端執行失敗，請稍後再試");
    assert.strictEqual(r1.message.indexOf("boom"), -1);

    const gThrow = {
      script: {
        run: {
          withSuccessHandler: function () {
            return this;
          },
          withFailureHandler: function () {
            return this;
          },
          executeWebApi: function () {
            throw new Error("throw");
          }
        }
      }
    };
    const apiThrow = apiModule.createApiClient(baseDeps({ storage: storage, google: gThrow }));
    const r2 = await apiThrow.requestOnce("x", {});
    assert.strictEqual(r2.ok, false);
    assert.strictEqual(r2.error, "server_error");
    assert.strictEqual(r2.message, "後端執行失敗，請稍後再試");
    assert.strictEqual(r2.message.indexOf("throw"), -1);
    console.log("   ✓ RPC 失敗/例外驗證通過！\n");
  }

  console.log("7. 無 RPC 且無 apiUrl 時應回傳 missing_api_url...");
  {
    const api = apiModule.createApiClient(
      baseDeps({ config: { storageKey: "gas_tmpl.session.v1", apiUrl: "", mock: false }, google: null })
    );
    const r = await api.requestOnce("x", {});
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "missing_api_url");
    console.log("   ✓ missing_api_url 驗證通過！\n");
  }

  console.log("8. fetch 備援應以 text/plain;charset=utf-8 POST 並正確處理回應...");
  {
    const calls = [];
    const storage = makeStorage({ "gas_tmpl.session.v1": "tf", "gas_tmpl.csrf.v1": "cf" });
    const fetchFn = function (url, opts) {
      calls.push({ url: url, opts: opts });
      return Promise.resolve({
        ok: true,
        text: function () {
          return Promise.resolve('{"ok":true,"src":"fetch"}');
        }
      });
    };
    const api = apiModule.createApiClient(
      baseDeps({
        config: { storageKey: "gas_tmpl.session.v1", apiUrl: "https://api.test/exec", mock: false },
        storage: storage,
        fetch: fetchFn
      })
    );
    const r = await api.requestOnce("f1", { p: 1 });
    assert.deepStrictEqual(r, { ok: true, src: "fetch" });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, "https://api.test/exec");
    assert.strictEqual(calls[0].opts.method, "POST");
    assert.strictEqual(calls[0].opts.headers["Content-Type"], "text/plain;charset=utf-8");
    assert.strictEqual(calls[0].opts.redirect, "follow");
    const sent = JSON.parse(calls[0].opts.body);
    assert.deepStrictEqual(sent, { p: 1, action: "f1", token: "tf", csrfToken: "cf" });
    console.log("   ✓ fetch 成功驗證通過！\n");
  }

  console.log("9. fetch HTTP 非 ok、json fallback 與網路錯誤應回傳對應錯誤...");
  {
    const storage = makeStorage({});
    const apiHttp = apiModule.createApiClient(
      baseDeps({
        fetch: function () {
          return Promise.resolve({
            ok: false,
            status: 500,
            text: function () {
              return Promise.resolve("{}");
            }
          });
        }
      })
    );
    const r1 = await apiHttp.requestOnce("x", {});
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.error, "network_error");
    assert(r1.message.indexOf("HTTP 500") !== -1);

    const apiJson = apiModule.createApiClient(
      baseDeps({
        fetch: function () {
          return Promise.resolve({
            ok: true,
            json: function () {
              return Promise.resolve({ ok: true, j: 1 });
            }
          });
        }
      })
    );
    const r2 = await apiJson.requestOnce("x", {});
    assert.deepStrictEqual(r2, { ok: true, j: 1 });

    const apiNet = apiModule.createApiClient(
      baseDeps({
        fetch: function () {
          return Promise.reject(new Error("offline"));
        }
      })
    );
    const r3 = await apiNet.requestOnce("x", {});
    assert.strictEqual(r3.ok, false);
    assert.strictEqual(r3.error, "network_error");
    assert.strictEqual(r3.message, "無法連線至 Google Apps Script 伺服器，請確認網路連線或稍後再試");
    assert.strictEqual(r3.message.indexOf("offline"), -1);
    console.log("   ✓ fetch 錯誤分支驗證通過！\n");
  }

  console.log("10. storage 讀寫例外不應中斷請求流程...");
  {
    const badStorage = {
      getItem: function () {
        throw new Error("deny");
      },
      setItem: function () {
        throw new Error("deny");
      },
      removeItem: function () {
        throw new Error("deny");
      }
    };
    const fetchFn = function () {
      return Promise.resolve({
        ok: true,
        text: function () {
          return Promise.resolve('{"ok":true}');
        }
      });
    };
    const api = apiModule.createApiClient(baseDeps({ storage: badStorage, fetch: fetchFn }));
    const r = await api.requestOnce("x", {});
    assert.strictEqual(r.ok, true);
    console.log("   ✓ storage 例外容錯驗證通過！\n");
  }

  console.log("11. callWithRetry 應對可重試錯誤依延遲重試並在成功時停止...");
  {
    let calls = 0;
    const delaysSeen = [];
    const fetchFn = function () {
      calls++;
      if (calls < 3)
        return Promise.resolve({
          ok: false,
          status: 503,
          text: function () {
            return Promise.resolve("{}");
          }
        });
      return Promise.resolve({
        ok: true,
        text: function () {
          return Promise.resolve('{"ok":true,"try":3}');
        }
      });
    };
    const api = apiModule.createApiClient(
      baseDeps({
        fetch: fetchFn,
        randomFn: function () {
          return 0.5;
        },
        setTimeoutFn: function (fn, ms) {
          delaysSeen.push(ms);
          fn();
        }
      })
    );
    const r = await api.callWithRetry("x", {}, { delays: [10, 20, 40] });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.try, 3);
    assert.strictEqual(calls, 3);
    assert.deepStrictEqual(delaysSeen, [10, 20]);
    console.log("   ✓ 可重試錯誤重試驗證通過！\n");
  }

  console.log("12. callWithRetry 應對 rate_limited/lock_timeout 重試，且耗盡後回傳最後錯誤...");
  {
    let calls = 0;
    const responses = [
      { ok: false, error: "rate_limited", message: "r" },
      { ok: false, error: "lock_timeout", message: "l" },
      { ok: false, error: "lock_timeout", message: "l2" }
    ];
    const mock = {
      handle: function () {
        return Promise.resolve(responses[calls++]);
      }
    };
    const api = apiModule.createApiClient(baseDeps({ config: { storageKey: "s", mock: true }, mock: mock }));
    const r = await api.callWithRetry("x", {}, { delays: [1, 2] });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "lock_timeout");
    assert.strictEqual(calls, 3);
    console.log("   ✓ 重試耗盡驗證通過！\n");
  }

  console.log("13. callWithRetry 對不可重試錯誤不應重試，且 call 為其別名...");
  {
    let calls = 0;
    const mock = {
      handle: function () {
        calls++;
        return Promise.resolve({ ok: false, error: "forbidden", message: "no" });
      }
    };
    const api = apiModule.createApiClient(baseDeps({ config: { storageKey: "s", mock: true }, mock: mock }));
    const r1 = await api.callWithRetry("x", {}, { delays: [1, 2, 3] });
    assert.strictEqual(r1.error, "forbidden");
    assert.strictEqual(calls, 1);
    const r2 = await api.call("y", {});
    assert.strictEqual(r2.error, "forbidden");
    assert.strictEqual(calls, 2);
    console.log("   ✓ 不可重試與 call 別名驗證通過！\n");
  }

  console.log("14. 回應含 csrfToken 時 callWithRetry 應更新儲存與後續夾帶...");
  {
    const storage = makeStorage({ "gas_tmpl.session.v1": "t", "gas_tmpl.csrf.v1": "old" });
    let seq = 0;
    const bodies = [];
    const mock = {
      handle: function (action, body) {
        bodies.push(Object.assign({}, body));
        seq++;
        if (seq === 1) return Promise.resolve({ ok: true, csrfToken: "new-csrf" });
        return Promise.resolve({ ok: true });
      }
    };
    const api = apiModule.createApiClient(
      baseDeps({ config: { storageKey: "gas_tmpl.session.v1", mock: true }, storage: storage, mock: mock })
    );
    await api.callWithRetry("a1", {});
    assert.strictEqual(storage.store["gas_tmpl.csrf.v1"], "new-csrf");
    assert.strictEqual(api.getCsrfToken(), "new-csrf");
    await api.callWithRetry("a2", {});
    assert.strictEqual(bodies[1].csrfToken, "new-csrf");
    console.log("   ✓ CSRF 更新與夾帶驗證通過！\n");
  }

  console.log("15. setToken/setCsrfToken/getToken/getCsrfToken 應正確讀寫與移除...");
  {
    const storage = makeStorage({});
    const api = apiModule.createApiClient(baseDeps({ config: { storageKey: "k" }, storage: storage }));
    api.setToken("abc");
    assert.strictEqual(api.getToken(), "abc");
    assert.strictEqual(storage.store["k"], "abc");
    api.setToken("");
    assert.strictEqual(api.getToken(), "");
    assert.strictEqual(storage.store["k"], undefined);
    api.setCsrfToken("csrf");
    assert.strictEqual(api.getCsrfToken(), "csrf");
    assert.strictEqual(storage.store[apiModule.CSRF_STORAGE_KEY], "csrf");
    api.setCsrfToken(null);
    assert.strictEqual(api.getCsrfToken(), "");
    assert.strictEqual(storage.store[apiModule.CSRF_STORAGE_KEY], undefined);
    console.log("   ✓ token/csrf 存取驗證通過！\n");
  }

  console.log("16. applyBrowserConfig 應組裝瀏覽器端 MEA.api...");
  {
    assert.strictEqual(typeof apiModule.applyBrowserConfig, "function", "應匯出 applyBrowserConfig");
    let attempt = 0;
    const root = {
      MEA: {
        config: { storageKey: "gas_tmpl.session.v1", apiUrl: "https://x.test/exec", mock: true },
        mock: {
          handle: function () {
            attempt++;
            if (attempt === 1) {
              return Promise.resolve({ ok: false, error: "rate_limited" });
            }
            return Promise.resolve({ ok: true, from: "browser" });
          }
        }
      }
    };
    let timerArg = null;
    const win = {
      localStorage: makeStorage({ "gas_tmpl.session.v1": "browser-token" }),
      fetch: function () {
        return Promise.resolve({ ok: true });
      },
      google: null,
      setTimeout: function (fn, ms) {
        timerArg = ms;
        fn();
      }
    };
    const client = apiModule.applyBrowserConfig(root, win);
    assert.strictEqual(root.MEA.api, client);
    assert.strictEqual(client.getToken(), "browser-token");
    const retry = await client.callWithRetry("ping", {}, { delays: [7] });
    assert.strictEqual(retry.ok, true);
    assert.strictEqual(retry.from, "browser");
    assert(timerArg >= 6 && timerArg <= 8, "重試應使用瀏覽器 setTimeout 並帶正負 20% jitter");

    const fallback = apiModule.applyBrowserConfig({}, {});
    assert.strictEqual(typeof fallback.call, "function");
    console.log("   ✓ 瀏覽器組裝驗證通過！\n");
  }

  console.log("17. getActivityLog 應沿用 call 通道並傳遞查詢參數...");
  {
    let handled = null;
    const mock = {
      handle: function (action, body) {
        handled = { action: action, body: body };
        return Promise.resolve({ ok: true, rows: [], total: 0 });
      }
    };
    const api = apiModule.createApiClient(
      baseDeps({ config: { storageKey: "s", mock: true }, mock: mock })
    );
    const query = {
      startDate: "2026-11-13",
      endDate: "2026-11-19",
      email: "admin@example.com",
      category: "write",
      page: 2,
      pageSize: 50
    };
    const result = await api.getActivityLog(query);
    assert.strictEqual(result.ok, true);
    assert.strictEqual(handled.action, "getActivityLog");
    assert.strictEqual(handled.body.startDate, "2026-11-13");
    assert.strictEqual(handled.body.page, 2);
    console.log("   ✓ getActivityLog 便利性方法驗證通過！\n");
  }

  console.log("18. getActivityLog 在 fetch 模式亦應使用 text/plain;charset=utf-8...");
  {
    let opts = null;
    const fetchFn = function (url, options) {
      opts = options;
      return Promise.resolve({
        ok: true,
        text: function () {
          return Promise.resolve('{"ok":true,"rows":[]}');
        }
      });
    };
    const api = apiModule.createApiClient(
      baseDeps({
        config: { storageKey: "s", apiUrl: "https://api.test/exec", mock: false },
        fetch: fetchFn
      })
    );
    const result = await api.getActivityLog({ page: 1, pageSize: 50 });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(opts.method, "POST");
    assert.strictEqual(opts.headers["Content-Type"], "text/plain;charset=utf-8");
    const sent = JSON.parse(opts.body);
    assert.strictEqual(sent.action, "getActivityLog");
    console.log("   ✓ fetch 模式通訊協議驗證通過！\n");
  }

  console.log("✓ webapp/js/api.js 測試全數通過！\n");
})().catch(function (err) {
  console.error(err);
  process.exit(1);
});
