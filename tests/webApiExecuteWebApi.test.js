"use strict";

/**
 * executeWebApi 單元測試（G2.2）
 * 驗證請求解析、action 解析、鎖定行為與錯誤處理，並支援重構後行為不變。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 executeWebApi 測試...\n");

function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (k) {
    prev[k] = Object.prototype.hasOwnProperty.call(global, k) ? global[k] : undefined;
    global[k] = temp[k];
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

console.log("1. 字串 payload JSON 格式錯誤應回傳 invalid_json...");
{
  const r = api.executeWebApi("{bad json", {});
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "invalid_json");
  console.log("   ✓ 無效 JSON 字串驗證通過！\n");
}

console.log("2. 非物件/陣列/null payload 應回傳 invalid_json...");
{
  ["null", "[]", '"x"', "123", "true"].forEach(function (s) {
    const r = api.executeWebApi(s, {});
    assert.strictEqual(r.ok, false, "應拒絕：" + s);
    assert.strictEqual(r.error, "invalid_json");
  });
  const rObjNull = api.executeWebApi(null, {});
  assert.strictEqual(rObjNull.ok, false);
  assert.strictEqual(rObjNull.error, "invalid_json");
  console.log("   ✓ 非物件 payload 驗證通過！\n");
}

console.log("3. 缺少 action 應回傳 missing_action...");
{
  const r1 = api.executeWebApi({}, {});
  const r2 = api.executeWebApi({ action: "   " }, {});
  assert.strictEqual(r1.ok, false);
  assert.strictEqual(r1.error, "missing_action");
  assert.strictEqual(r2.ok, false);
  assert.strictEqual(r2.error, "missing_action");
  console.log("   ✓ 缺少 action 驗證通過！\n");
}

console.log("4. 可由 event.parameter.action 取得 action（公開 action）...");
{
  const r = api.executeWebApi({}, { parameter: { action: "ping" } });
  assert.strictEqual(r.ok, true);
  assert(r.pong > 0, "應回傳 pong");
  console.log("   ✓ event parameter action 驗證通過！\n");
}

console.log("5. 物件 payload 可正常路由公開 action...");
{
  const r = api.executeWebApi({ action: "ping" }, {});
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.version, api.WEB_API_VERSION);
  console.log("   ✓ 公開 action 路由驗證通過！\n");
}

console.log("6. JSON 字串 payload 可正常解析與路由...");
{
  const r = api.executeWebApi(JSON.stringify({ action: "ping" }), {});
  assert.strictEqual(r.ok, true);
  console.log("   ✓ 字串 payload 驗證通過！\n");
}

console.log("7. 需鎖定 action 在 LockService 可用時應取得並釋放鎖...");
{
  let tryLockCalls = 0;
  let releaseCalls = 0;
  const lock = {
    tryLock: function (ms) {
      tryLockCalls += 1;
      assert.strictEqual(ms, 15000);
      return true;
    },
    releaseLock: function () {
      releaseCalls += 1;
    }
  };
  const r = withGlobals(
    {
      LockService: {
        getScriptLock: function () {
          return lock;
        }
      }
    },
    function () {
      return api.executeWebApi({ action: "saveSystemSettings" }, {});
    }
  );
  assert.strictEqual(tryLockCalls, 1, "應嘗試取得鎖");
  assert.strictEqual(releaseCalls, 1, "應釋放鎖");
  assert.strictEqual(r.ok, false, "Node 環境無有效 session 應走原路由結果");
  console.log("   ✓ 鎖定取得與釋放驗證通過！\n");
}

console.log("8. 鎖定逾時應回傳 lock_timeout 且不執行路由副作用...");
{
  let releaseCalls = 0;
  const lock = {
    tryLock: function () {
      return false;
    },
    releaseLock: function () {
      releaseCalls += 1;
    }
  };
  const r = withGlobals(
    {
      LockService: {
        getScriptLock: function () {
          return lock;
        }
      }
    },
    function () {
      return api.executeWebApi({ action: "saveSystemSettings" }, {});
    }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "lock_timeout");
  assert.strictEqual(releaseCalls, 0, "未取得鎖不應釋放");
  console.log("   ✓ 鎖定逾時驗證通過！\n");
}

console.log("9. tryLock 拋出例外應視為逾時...");
{
  const lock = {
    tryLock: function () {
      throw new Error("boom");
    },
    releaseLock: function () {}
  };
  const r = withGlobals(
    {
      LockService: {
        getScriptLock: function () {
          return lock;
        }
      }
    },
    function () {
      return api.executeWebApi({ action: "saveSystemSettings" }, {});
    }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "lock_timeout");
  console.log("   ✓ tryLock 例外驗證通過！\n");
}

console.log("10. 非鎖定 action 不應取得鎖...");
{
  let called = 0;
  const r = withGlobals(
    {
      LockService: {
        getScriptLock: function () {
          called += 1;
          return {
            tryLock: function () {
              return true;
            },
            releaseLock: function () {}
          };
        }
      }
    },
    function () {
      return api.executeWebApi({ action: "ping" }, {});
    }
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(called, 0, "ping 不應取得鎖");
  console.log("   ✓ 非鎖定 action 驗證通過！\n");
}

console.log("10.1 登入 action 不得取得全域鎖（外部 HTTP 須在鎖外執行）...");
{
  let called = 0;
  const lockService = {
    getScriptLock: function () {
      called += 1;
      return {
        tryLock: function () {
          return true;
        },
        releaseLock: function () {}
      };
    }
  };
  ["login", "loginWithActiveUser"].forEach(function (action) {
    const r = withGlobals({ LockService: lockService }, function () {
      return api.executeWebApi({ action: action, idToken: "fake-token" }, {});
    });
    assert.strictEqual(called, 0, action + " 不應取得全域 Script Lock");
    assert.strictEqual(r.ok, false, "Node 環境缺少外部驗證依賴應走原路由結果");
  });
  assert.strictEqual(api.WEB_API_LOCKED_ACTIONS.indexOf("login"), -1);
  assert.strictEqual(api.WEB_API_LOCKED_ACTIONS.indexOf("loginWithActiveUser"), -1);
  console.log("   ✓ 登入鎖粒度驗證通過！\n");
}

console.log("11. 路由拋出例外應回傳 server_error...");
{
  const prev = api.routeWebApiAction;
  let released = 0;
  const lock = {
    tryLock: function () {
      return true;
    },
    releaseLock: function () {
      released += 1;
    }
  };
  try {
    api.routeWebApiAction = function () {
      throw new Error("route boom");
    };
    const r = withGlobals(
      {
        LockService: {
          getScriptLock: function () {
            return lock;
          }
        }
      },
      function () {
        return api.executeWebApi({ action: "saveSystemSettings" }, {});
      }
    );
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "server_error");
    assert(r.message.indexOf("route boom") === -1, "不得回傳例外訊息原文");
    assert.strictEqual(released, 1, "發生例外仍應釋放鎖");
  } finally {
    api.routeWebApiAction = prev;
  }
  console.log("   ✓ server_error 與 finally 釋放驗證通過！\n");
}

console.log("✓ executeWebApi 測試全數通過！\n");
