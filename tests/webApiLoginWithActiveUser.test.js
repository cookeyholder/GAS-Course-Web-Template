"use strict";

/**
 * loginWithActiveUser 單元測試（G2.7）
 * 驗證作用中使用者辨識、錯誤分支與 session 建立委派行為。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 loginWithActiveUser 測試...\n");

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

console.log("1. 無 Session 環境時應回傳 no_active_user...");
{
  const r = withGlobals({ Session: undefined, SpreadsheetApp: undefined }, function () {
    return api.loginWithActiveUser();
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "no_active_user");
  console.log("   ✓ 無 Session 驗證通過！\n");
}

console.log("2. Session 無 getActiveUser 時應回傳 no_active_user...");
{
  const r = withGlobals({ Session: {}, SpreadsheetApp: undefined }, function () {
    return api.loginWithActiveUser({});
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "no_active_user");
  console.log("   ✓ 無 getActiveUser 驗證通過！\n");
}

console.log("3. 取得作用中使用者時拋出例外應回傳 no_active_user...");
{
  const Session = {
    getActiveUser: function () {
      throw new Error("boom");
    }
  };
  const r = withGlobals({ Session: Session, SpreadsheetApp: undefined }, function () {
    return api.loginWithActiveUser();
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "no_active_user");
  console.log("   ✓ 例外分支驗證通過！\n");
}

console.log("4. 作用中使用者 email 為空或空白時應回傳 no_active_user...");
{
  ["", "   ", null, undefined].forEach(function (email) {
    const Session = {
      getActiveUser: function () {
        return {
          getEmail: function () {
            return email;
          }
        };
      }
    };
    const r = withGlobals({ Session: Session, SpreadsheetApp: undefined }, function () {
      return api.loginWithActiveUser();
    });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.error, "no_active_user");
  });
  console.log("   ✓ 空 email 驗證通過！\n");
}

console.log("5. 有效 email 應正規化並使用 options.spreadsheet 建立 session...");
{
  const Session = {
    getActiveUser: function () {
      return {
        getEmail: function () {
          return "  USER@Example.com  ";
        }
      };
    }
  };
  const ss = { id: "ss-1" };
  let captured = null;
  const expected = { ok: true, token: "t" };
  const r = withGlobals({ Session: Session, SpreadsheetApp: undefined }, function () {
    return withStubbed(
      api,
      "createSessionForEmail",
      function (email, name, options) {
        captured = { email: email, name: name, options: options };
        return expected;
      },
      function () {
        return api.loginWithActiveUser({ spreadsheet: ss });
      }
    );
  });
  assert.strictEqual(r, expected);
  assert.deepStrictEqual(captured, {
    email: "user@example.com",
    name: "user@example.com",
    options: { spreadsheet: ss }
  });
  console.log("   ✓ options.spreadsheet 驗證通過！\n");
}

console.log("6. 無 options.spreadsheet 時應使用 SpreadsheetApp.getActiveSpreadsheet...");
{
  const Session = {
    getActiveUser: function () {
      return {
        getEmail: function () {
          return "user@example.com";
        }
      };
    }
  };
  const ss = { id: "active-ss" };
  const SpreadsheetApp = {
    getActiveSpreadsheet: function () {
      return ss;
    }
  };
  let captured = null;
  withGlobals({ Session: Session, SpreadsheetApp: SpreadsheetApp }, function () {
    withStubbed(
      api,
      "createSessionForEmail",
      function (email, name, options) {
        captured = options;
        return { ok: true };
      },
      function () {
        api.loginWithActiveUser();
      }
    );
  });
  assert.deepStrictEqual(captured, { spreadsheet: ss });
  console.log("   ✓ SpreadsheetApp fallback 驗證通過！\n");
}

console.log("7. 無 SpreadsheetApp 時 spreadsheet 應為 null...");
{
  const Session = {
    getActiveUser: function () {
      return {
        getEmail: function () {
          return "user@example.com";
        }
      };
    }
  };
  let captured = null;
  withGlobals({ Session: Session, SpreadsheetApp: undefined }, function () {
    withStubbed(
      api,
      "createSessionForEmail",
      function (email, name, options) {
        captured = options;
        return { ok: true };
      },
      function () {
        api.loginWithActiveUser({});
      }
    );
  });
  assert.deepStrictEqual(captured, { spreadsheet: null });
  console.log("   ✓ null spreadsheet 驗證通過！\n");
}

console.log("✓ loginWithActiveUser 測試全數通過！\n");
