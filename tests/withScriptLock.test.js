"use strict";

/**
 * withScriptLock.test.js（task 4.3）
 *
 * 驗證單一 Script Lock 模板的行為：
 * - LockService 不存在與 skipLock 時直接執行 fn
 * - tryLock 失敗／擲錯時呼叫 onLockFailure，且 fn 不執行
 * - 成功取得鎖後於 finally 釋放，fn 擲錯時仍釋放
 * - executeWebApi 先釋放鎖再寫入日誌
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 withScriptLock 測試...\n");

/**
 * 暫時設定全域變數並於結束後還原。
 *
 * @param {Object} temp - 暫時的全域值
 * @param {Function} fn - 執行函式
 * @returns {*} fn 的回傳值
 */
function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (key) {
    prev[key] = Object.prototype.hasOwnProperty.call(global, key) ? global[key] : undefined;
    global[key] = temp[key];
  });
  try {
    return fn();
  } finally {
    Object.keys(temp).forEach(function (key) {
      if (prev[key] === undefined) delete global[key];
      else global[key] = prev[key];
    });
  }
}

/**
 * 建立可觀測的鎖服務。
 *
 * @param {Object} [options] - 選項
 * @param {boolean} [options.acquire=true] - tryLock 是否成功
 * @param {boolean} [options.throwOnTry] - tryLock 是否擲錯
 * @returns {{service: Object, state: Object}} 鎖服務與狀態
 */
function makeLockService(options) {
  const config = options || {};
  const state = { tryCalls: 0, releaseCalls: 0, timeoutMs: null };
  const service = {
    getScriptLock: function () {
      return {
        tryLock: function (ms) {
          state.tryCalls += 1;
          state.timeoutMs = ms;
          if (config.throwOnTry) throw new Error("tryLock failed");
          return config.acquire !== false;
        },
        releaseLock: function () {
          state.releaseCalls += 1;
        }
      };
    }
  };
  return { service: service, state: state };
}

console.log("1. LockService 不存在時應直接執行 fn...\n");
{
  let called = 0;
  const result = withGlobals({ LockService: undefined }, function () {
    return api.withScriptLock({}, function (lockState) {
      called += 1;
      assert.strictEqual(lockState.hasLock, false);
      return "done";
    });
  });
  assert.strictEqual(result, "done");
  assert.strictEqual(called, 1);
  console.log("   ✓ 無鎖服務路徑驗證通過！\n");
}

console.log("2. skipLock 時應略過取得鎖...\n");
{
  const { service, state } = makeLockService();
  const result = api.withScriptLock({ lockService: service, skipLock: true }, function () {
    return "skipped";
  });
  assert.strictEqual(result, "skipped");
  assert.strictEqual(state.tryCalls, 0);
  assert.strictEqual(state.releaseCalls, 0);
  console.log("   ✓ 略過鎖定驗證通過！\n");
}

console.log("3. tryLock 失敗時應呼叫 onLockFailure 且不執行 fn...\n");
{
  const { service, state } = makeLockService({ acquire: false });
  let fnCalls = 0;
  let failureCalls = 0;
  const result = api.withScriptLock(
    {
      lockService: service,
      onLockFailure: function (lockState) {
        failureCalls += 1;
        assert.strictEqual(lockState.lockFailed, true);
        return "lock_failed";
      }
    },
    function () {
      fnCalls += 1;
      return "should_not_run";
    }
  );
  assert.strictEqual(result, "lock_failed");
  assert.strictEqual(fnCalls, 0);
  assert.strictEqual(failureCalls, 1);
  assert.strictEqual(state.tryCalls, 1);
  assert.strictEqual(state.timeoutMs, 15000);
  assert.strictEqual(state.releaseCalls, 0, "未取得鎖不應釋放");
  console.log("   ✓ tryLock 失敗驗證通過！\n");
}

console.log("4. tryLock 失敗且無 onLockFailure 時應回傳 lock_timeout...\n");
{
  const { service } = makeLockService({ acquire: false });
  const result = api.withScriptLock({ lockService: service }, function () {
    return "should_not_run";
  });
  assert.strictEqual(result.error, "lock_timeout");
  assert.strictEqual(result.ok, false);
  console.log("   ✓ 預設逾時錯誤驗證通過！\n");
}

console.log("5. tryLock 擲錯時應視為失敗並呼叫 onLockFailure...\n");
{
  const { service, state } = makeLockService({ throwOnTry: true });
  const result = api.withScriptLock(
    {
      lockService: service,
      onLockFailure: function () {
        return "thrown_handled";
      }
    },
    function () {
      return "should_not_run";
    }
  );
  assert.strictEqual(result, "thrown_handled");
  assert.strictEqual(state.releaseCalls, 0);
  console.log("   ✓ tryLock 例外驗證通過！\n");
}

console.log("6. 成功取得鎖時應執行 fn 並於 finally 釋放...\n");
{
  const { service, state } = makeLockService();
  const result = api.withScriptLock({ lockService: service }, function (lockState) {
    assert.strictEqual(lockState.hasLock, true);
    assert.strictEqual(lockState.lockFailed, false);
    assert(state.tryCalls === 1);
    // fn 執行期間鎖尚未釋放
    assert.strictEqual(state.releaseCalls, 0);
    return "ok";
  });
  assert.strictEqual(result, "ok");
  assert.strictEqual(state.releaseCalls, 1);
  console.log("   ✓ 成功取得鎖與釋放驗證通過！\n");
}

console.log("7. fn 擲錯時仍應釋放鎖並向外傳播錯誤...\n");
{
  const { service, state } = makeLockService();
  assert.throws(function () {
    api.withScriptLock({ lockService: service }, function () {
      throw new Error("route failed");
    });
  }, /route failed/);
  assert.strictEqual(state.releaseCalls, 1);
  console.log("   ✓ fn 例外釋放驗證通過！\n");
}

console.log("8. executeWebApi 應先釋放鎖再寫入日誌...\n");
{
  const events = [];
  const lock = {
    tryLock: function () {
      events.push("tryLock");
      return true;
    },
    releaseLock: function () {
      events.push("releaseLock");
    }
  };
  const lockService = {
    getScriptLock: function () {
      return lock;
    }
  };
  const originalAppend = api.appendActivityLog;
  const originalRoute = api.routeWebApiAction;
  api.appendActivityLog = function () {
    events.push("writeLog");
  };
  api.routeWebApiAction = function () {
    events.push("route");
    return { ok: true };
  };
  try {
    withGlobals({ LockService: lockService }, function () {
      api.executeWebApi({ action: "saveSystemSettings" }, {});
    });
  } finally {
    api.appendActivityLog = originalAppend;
    api.routeWebApiAction = originalRoute;
  }
  assert.deepStrictEqual(events, ["tryLock", "route", "releaseLock", "writeLog"]);
  console.log("   ✓ 先解鎖再寫日誌驗證通過！\n");
}

console.log("✓ withScriptLock.test.js 測試全數通過！\n");
