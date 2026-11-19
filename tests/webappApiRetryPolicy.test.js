"use strict";

/**
 * 前端 API 重試策略測試（task 2.6）。
 * 驗證 jitter、總重試時間上限與大型匯入停用自動重試。
 */

const assert = require("assert");
const apiModule = require("../webapp/js/api.js");

console.log("開始執行前端 API 重試策略測試...\n");

function makeStorage() {
  const store = {};
  return {
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

function makeFetch(resultFactory) {
  const state = { calls: 0 };
  state.fetch = function () {
    state.calls += 1;
    const result = resultFactory(state.calls);
    return Promise.resolve({
      ok: true,
      text: function () {
        return Promise.resolve(JSON.stringify(result));
      }
    });
  };
  return state;
}

function createClient(overrides) {
  return apiModule.createApiClient(
    Object.assign(
      {
        config: { storageKey: "gas_tmpl.session.v1", apiUrl: "https://api.test/exec", mock: false },
        storage: makeStorage(),
        setTimeoutFn: function (fn) {
          fn();
        }
      },
      overrides || {}
    )
  );
}

const LOCK_TIMEOUT = { ok: false, error: "lock_timeout", message: "系統繁忙中" };
const SUCCESS = { ok: true };

(async function run() {
  console.log("1. jitter 應落在基準延遲正負 20% 內且可注入...");
  {
    const delayUpper = [];
    const upper = makeFetch(function (n) {
      return n < 2 ? LOCK_TIMEOUT : SUCCESS;
    });
    const clientUpper = createClient({
      fetch: upper.fetch,
      randomFn: function () {
        return 1;
      },
      setTimeoutFn: function (fn, ms) {
        delayUpper.push(ms);
        fn();
      }
    });
    await clientUpper.callWithRetry("x", {}, { delays: [100] });
    assert.deepStrictEqual(delayUpper, [120], "random=1 應為 1.2 倍");

    const delayLower = [];
    const lower = makeFetch(function (n) {
      return n < 2 ? LOCK_TIMEOUT : SUCCESS;
    });
    const clientLower = createClient({
      fetch: lower.fetch,
      randomFn: function () {
        return 0;
      },
      setTimeoutFn: function (fn, ms) {
        delayLower.push(ms);
        fn();
      }
    });
    await clientLower.callWithRetry("x", {}, { delays: [100] });
    assert.deepStrictEqual(delayLower, [80], "random=0 應為 0.8 倍");
    console.log("   ✓ jitter 驗證通過！\n");
  }

  console.log("2. 累積延遲不得超過總重試時間上限...");
  {
    const delays = [];
    const source = makeFetch(function () {
      return LOCK_TIMEOUT;
    });
    const client = createClient({
      fetch: source.fetch,
      randomFn: function () {
        return 0;
      },
      setTimeoutFn: function (fn, ms) {
        delays.push(ms);
        fn();
      }
    });
    const result = await client.callWithRetry("x", {}, { delays: [100, 100, 100], totalRetryMs: 150 });
    assert.strictEqual(result.error, "lock_timeout");
    assert.deepStrictEqual(delays, [80, 70], "第二次重試只能用剩餘時間");
    assert.strictEqual(source.calls, 3, "上限用盡後不得再重送");
    console.log("   ✓ 總時間上限驗證通過！\n");
  }

  console.log("3. 大型匯入收到 lock_timeout 不自動重試...");
  {
    const source = makeFetch(function () {
      return LOCK_TIMEOUT;
    });
    const client = createClient({
      fetch: source.fetch,
      randomFn: function () {
        return 0;
      }
    });
    const rows = new Array(apiModule.LARGE_IMPORT_ROW_THRESHOLD);
    for (let i = 0; i < rows.length; i++) rows[i] = ["x"];
    const result = await client.callWithRetry("importCourseCodes", { rows: rows }, { delays: [10, 10] });
    assert.strictEqual(result.error, "lock_timeout");
    assert.strictEqual(source.calls, 1, "大型匯入不得自動重送");
    console.log("   ✓ 大型匯入不重試驗證通過！\n");
  }

  console.log("4. opts.retry=false 可明確停用自動重試，call 會轉送選項...");
  {
    const source = makeFetch(function () {
      return LOCK_TIMEOUT;
    });
    const client = createClient({ fetch: source.fetch });
    const result = await client.call("x", {}, { delays: [10, 10], retry: false });
    assert.strictEqual(result.error, "lock_timeout");
    assert.strictEqual(source.calls, 1);
    console.log("   ✓ 明確停用重試驗證通過！\n");
  }

  console.log("5. 小型匯入仍可依策略重試...");
  {
    const source = makeFetch(function (n) {
      return n < 2 ? LOCK_TIMEOUT : SUCCESS;
    });
    const client = createClient({
      fetch: source.fetch,
      randomFn: function () {
        return 0;
      }
    });
    const result = await client.call("importCourseCodes", { rows: [["x"]] }, { delays: [10] });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(source.calls, 2);
    console.log("   ✓ 小型匯入重試驗證通過！\n");
  }

  console.log("✓ 前端 API 重試策略測試全數通過！\n");
})().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
