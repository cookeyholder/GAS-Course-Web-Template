"use strict";

/**
 * 後端公開設定/Session/CSRF 測試補強（G2.10）
 * 涵蓋 getPublicConfig、session 核發/驗證、CSRF 保護與錯誤分支。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行公開設定、Session 與 CSRF 補強測試...\n");

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

console.log("1. getPublicConfig 應彙整系統設定與執行環境資訊...");
{
  const ss = { id: "ss" };
  const SpreadsheetApp = {
    getActiveSpreadsheet: function () {
      return ss;
    }
  };
  const ScriptApp = {
    getService: function () {
      return {
        getUrl: function () {
          return "https://script.google.com/app";
        }
      };
    }
  };
  const Session = {
    getActiveUser: function () {
      return {
        getEmail: function () {
          return " admin@example.com ";
        }
      };
    }
  };
  const settings = {
    systemName: "課程系統",
    schoolYear: "113",
    semester: "2",
    clientId: "client-1",
    clientSecret: "secret",
    allowedLoginDomain: "@example.com"
  };
  const r = withGlobals(
    {
      SpreadsheetApp,
      ScriptApp,
      Session,
      readSystemSettings: function (spreadsheet) {
        assert.strictEqual(spreadsheet, ss);
        return settings;
      }
    },
    function () {
      return api.getPublicConfig();
    }
  );
  assert.deepStrictEqual(r, {
    ok: true,
    version: api.WEB_API_VERSION,
    systemName: "課程系統",
    schoolYear: "113",
    semester: "2",
    clientId: "client-1",
    hasClientSecret: true,
    allowedDomain: "example.com",
    activeEmail: "admin@example.com",
    webAppUrl: "https://script.google.com/app",
    needsBootstrap: false
  });
  console.log("   ✓ 完整設定彙整驗證通過！\n");
}

console.log("2. getPublicConfig 於環境資訊缺失或例外時應使用預設/空值...");
{
  const ScriptApp = {
    getService: function () {
      throw new Error("no service");
    }
  };
  const Session = {
    getActiveUser: function () {
      throw new Error("no user");
    }
  };
  const r = withGlobals(
    {
      SpreadsheetApp: undefined,
      ScriptApp,
      Session,
      readSystemSettings: function (ss) {
        assert.strictEqual(ss, null);
        return {};
      }
    },
    function () {
      return api.getPublicConfig();
    }
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.systemName, "Google Apps Script 應用程式範本");
  assert.strictEqual(r.schoolYear, "114");
  assert.strictEqual(r.semester, "1");
  assert.strictEqual(r.clientId, "");
  assert.strictEqual(r.hasClientSecret, false);
  assert.strictEqual(r.allowedDomain, "");
  assert.strictEqual(r.activeEmail, "");
  assert.strictEqual(r.webAppUrl, "");
  assert.strictEqual(r.needsBootstrap, true, "空白名單預設視為待開通情境");
  console.log("   ✓ 預設值與例外分支驗證通過！\n");
}

console.log("3. createSessionForEmail 應拒絕不允許網域...");
{
  const r = withGlobals(
    {
      SpreadsheetApp: undefined,
      bootstrapAdminIfNeeded: function () {
        return false;
      },
      getAccountRole: function () {
        return { found: false, role: "viewer", enabled: true, name: "" };
      },
      readSystemSettings: function () {
        return { allowedLoginDomain: "school.edu", restrictWhitelist: false };
      }
    },
    function () {
      return api.createSessionForEmail("User@Other.com", "User");
    }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "domain_not_allowed");
  console.log("   ✓ 網域限制驗證通過！\n");
}

console.log("4. createSessionForEmail 啟用白名單限制且帳號不在名單時應拒絕...");
{
  const r = withGlobals(
    {
      SpreadsheetApp: undefined,
      bootstrapAdminIfNeeded: function () {
        return false;
      },
      getAccountRole: function () {
        return { found: false, role: "viewer", enabled: true, name: "" };
      },
      readSystemSettings: function () {
        return { allowedLoginDomain: "", restrictWhitelist: true };
      }
    },
    function () {
      return api.createSessionForEmail("user@example.com", "User");
    }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "not_whitelisted");
  console.log("   ✓ 白名單限制驗證通過！\n");
}

console.log("5. createSessionForEmail 帳號停用時應拒絕...");
{
  const r = withGlobals(
    {
      SpreadsheetApp: undefined,
      bootstrapAdminIfNeeded: function () {
        return false;
      },
      getAccountRole: function () {
        return { found: true, role: "staff", enabled: false, name: "停用者" };
      },
      readSystemSettings: function () {
        return { allowedLoginDomain: "", restrictWhitelist: false };
      }
    },
    function () {
      return api.createSessionForEmail("user@example.com", "User");
    }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "account_disabled");
  console.log("   ✓ 帳號停用驗證通過！\n");
}

console.log("6. createSessionForEmail 成功時應核發 token/csrf 並可驗證 session...");
{
  const ss = { id: "ss-ok" };
  let bootArgs = null;
  let roleArgs = null;
  const r = withGlobals(
    {
      SpreadsheetApp: undefined,
      readWhitelist: function () {
        return [];
      },
      bootstrapAdminIfNeeded: function (email, name, spreadsheet) {
        bootArgs = [email, name, spreadsheet];
        return true;
      },
      getAccountRole: function (email, spreadsheet) {
        roleArgs = [email, spreadsheet];
        return { found: true, role: "admin", enabled: true, name: "管理員" };
      },
      readSystemSettings: function () {
        return { allowedLoginDomain: "", restrictWhitelist: true };
      }
    },
    function () {
      return api.createSessionForEmail("  ADMIN@EXAMPLE.COM ", "Fallback", {
        spreadsheet: ss,
        allowBootstrap: true
      });
    }
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.email, "admin@example.com");
  assert.strictEqual(r.name, "管理員");
  assert.strictEqual(r.role, "admin");
  assert.strictEqual(r.roleName, "系統管理員");
  assert.deepStrictEqual(r.perms, api.ROLE_PERMISSIONS.admin);
  assert.strictEqual(r.perms.indexOf("*"), -1, "管理員權限不得包含萬用字元");
  assert(r.perms.indexOf("getActivityLog") !== -1, "管理員權限應含 getActivityLog");
  assert.strictEqual(r.bootstrapped, true);
  assert(r.token.indexOf("gas_") === 0);
  assert(r.csrfToken.indexOf("csrf_") === 0);
  assert.deepStrictEqual(bootArgs, ["admin@example.com", "Fallback", ss]);
  assert.deepStrictEqual(roleArgs, ["admin@example.com", ss]);

  const info = api.getSessionInfo(r.token);
  assert.strictEqual(info.ok, true);
  assert.strictEqual(info.session.email, "admin@example.com");
  assert.strictEqual(info.session.csrfToken, r.csrfToken);

  const state = api.getSessionState(r.token);
  assert.strictEqual(state.ok, true);
  assert.strictEqual(state.email, "admin@example.com");
  assert.strictEqual(state.role, "admin");
  assert.strictEqual(state.csrfToken, r.csrfToken);

  const logout = api.logoutSession(r.token);
  assert.strictEqual(logout.ok, true);
  const expired = api.getSessionInfo(r.token);
  assert.strictEqual(expired.ok, false);
  assert.strictEqual(expired.error, "session_expired");
  console.log("   ✓ session 核發、驗證與失效流程通過！\n");
}

console.log("6.1 白名單非空時即使標記 bootstrap 也不得寫入角色...");
{
  let bootstrapCalled = false;
  const r = withGlobals(
    {
      SpreadsheetApp: undefined,
      readWhitelist: function () {
        return [{ email: "admin@example.com", role: "admin", enabled: true }];
      },
      bootstrapAdminIfNeeded: function () {
        bootstrapCalled = true;
        return true;
      },
      getAccountRole: function () {
        return { found: false, role: "viewer", enabled: true };
      },
      readSystemSettings: function () {
        return { allowedLoginDomain: "", restrictWhitelist: true };
      }
    },
    function () {
      return api.createSessionForEmail("intruder@example.com", "Intruder", {
        spreadsheet: { id: "ss-nonempty" },
        allowBootstrap: true
      });
    }
  );
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "not_whitelisted");
  assert.strictEqual(bootstrapCalled, false, "白名單非空時不得呼叫 bootstrapAdminIfNeeded");
  assert.strictEqual(r.token, undefined, "不得建立 session");
  console.log("   ✓ 白名單非空守衛驗證通過！\n");
}

/** 建立 bootstrap 寫入鎖測試所需的共用全域 stub。 */
function bootstrapLockGlobals_(lock, overrides) {
  return Object.assign(
    {
      SpreadsheetApp: undefined,
      LockService: lock
        ? {
            getScriptLock: function () {
              return lock;
            }
          }
        : undefined,
      readWhitelist: function () {
        return [];
      },
      bootstrapAdminIfNeeded: function () {
        return true;
      },
      getAccountRole: function () {
        return { found: true, role: "admin", enabled: true, name: "管理員" };
      },
      readSystemSettings: function () {
        return { allowedLoginDomain: "", restrictWhitelist: true };
      }
    },
    overrides || {}
  );
}

console.log("6.2 bootstrap 寫入鎖：成功取得鎖時寫入並釋放...");
{
  let acquired = false;
  let released = false;
  const lock = {
    tryLock: function () {
      acquired = true;
      return true;
    },
    releaseLock: function () {
      released = true;
    }
  };
  const r = withGlobals(bootstrapLockGlobals_(lock), function () {
    return api.createSessionForEmail("admin@example.com", "Admin", {
      spreadsheet: { id: "ss-lock" },
      allowBootstrap: true
    });
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.bootstrapped, true);
  assert.strictEqual(acquired, true);
  assert.strictEqual(released, true);
  console.log("   ✓ 鎖成功路徑通過！\n");
}

console.log("6.3 bootstrap 寫入鎖：無法取得鎖時回傳 lock_timeout...");
{
  const lock = {
    tryLock: function () {
      return false;
    },
    releaseLock: function () {
      assert.fail("未取得鎖時不得釋放鎖");
    }
  };
  const r = withGlobals(bootstrapLockGlobals_(lock), function () {
    return api.createSessionForEmail("admin@example.com", "Admin", {
      spreadsheet: { id: "ss-lock-fail" },
      allowBootstrap: true
    });
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "lock_timeout");
  assert.strictEqual(r.token, undefined);
  console.log("   ✓ 鎖逾時路徑通過！\n");
}

console.log("6.4 bootstrap 寫入鎖：tryLock 拋錯時回傳 lock_timeout...");
{
  const lock = {
    tryLock: function () {
      throw new Error("lock service unavailable");
    },
    releaseLock: function () {
      assert.fail("tryLock 拋錯時不得釋放鎖");
    }
  };
  const r = withGlobals(bootstrapLockGlobals_(lock), function () {
    return api.createSessionForEmail("admin@example.com", "Admin", {
      spreadsheet: { id: "ss-lock-throw" },
      allowBootstrap: true
    });
  });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, "lock_timeout");
  console.log("   ✓ tryLock 例外路徑通過！\n");
}

console.log("6.5 bootstrap 寫入鎖：releaseLock 拋錯不影響寫入結果...");
{
  const lock = {
    tryLock: function () {
      return true;
    },
    releaseLock: function () {
      throw new Error("release failed");
    }
  };
  const r = withGlobals(bootstrapLockGlobals_(lock), function () {
    return api.createSessionForEmail("admin@example.com", "Admin", {
      spreadsheet: { id: "ss-release-throw" },
      allowBootstrap: true
    });
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.bootstrapped, true);
  console.log("   ✓ releaseLock 例外容忍通過！\n");
}

console.log("6.6 bootstrap 雙重檢查：鎖內發現白名單已非空時不寫入...");
{
  let whitelistReads = 0;
  let bootstrapCalled = false;
  const lock = {
    tryLock: function () {
      return true;
    },
    releaseLock: function () {}
  };
  const globals = bootstrapLockGlobals_(lock, {
    readWhitelist: function () {
      whitelistReads += 1;
      return whitelistReads === 1 ? [] : [{ email: "other@example.com", role: "admin" }];
    },
    bootstrapAdminIfNeeded: function () {
      bootstrapCalled = true;
      return true;
    },
    getAccountRole: function () {
      return { found: true, role: "viewer", enabled: true, name: "檢視者" };
    },
    readSystemSettings: function () {
      return { allowedLoginDomain: "", restrictWhitelist: false };
    }
  });
  const r = withGlobals(globals, function () {
    return api.createSessionForEmail("viewer@example.com", "Viewer", {
      spreadsheet: { id: "ss-double-check" },
      allowBootstrap: true
    });
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.role, "viewer");
  assert.strictEqual(r.bootstrapped, false);
  assert.strictEqual(whitelistReads, 2);
  assert.strictEqual(bootstrapCalled, false, "鎖內二次檢查應阻止寫入");
  console.log("   ✓ 雙重檢查路徑通過！\n");
}

console.log("6.7 readWhitelist 回傳 null 時應視為空白名單...");
{
  const lock = {
    tryLock: function () {
      return true;
    },
    releaseLock: function () {}
  };
  const globals = bootstrapLockGlobals_(lock, {
    readWhitelist: function () {
      return null;
    },
    getAccountRole: function () {
      return { found: true, role: "admin", enabled: true, name: "管理員" };
    }
  });
  const r = withGlobals(globals, function () {
    return api.createSessionForEmail("admin@example.com", "Admin", {
      spreadsheet: { id: "ss-null-whitelist" },
      allowBootstrap: true
    });
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.bootstrapped, true);
  console.log("   ✓ null 白名單容錯路徑通過！\n");
}

console.log("7. getSessionInfo/getSessionState 錯誤分支應正確回應...");
{
  assert.strictEqual(api.getSessionInfo("").error, "missing_token");
  assert.strictEqual(api.getSessionInfo("   ").error, "missing_token");
  assert.strictEqual(api.getSessionState("not-exist").error, "session_expired");

  // 模擬毀損 session 資料
  const token = "gas_corrupt_test_token";
  const cache = {
    get: function (k) {
      return k.indexOf(token) !== -1 ? "{bad json" : null;
    },
    put: function () {},
    remove: function () {}
  };
  withGlobals(
    {
      CacheService: {
        getScriptCache: function () {
          return cache;
        }
      }
    },
    function () {
      const r = api.getSessionInfo(token);
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.error, "invalid_session");
    }
  );
  console.log("   ✓ session 驗證錯誤分支通過！\n");
}

console.log("8. authorizeWebApiAction 應處理公開、無效 session 與權限拒絕...");
{
  const pub = api.authorizeWebApiAction("ping", {});
  assert.strictEqual(pub.ok, true);
  assert.strictEqual(pub.session, null);

  const missing = api.authorizeWebApiAction("getCourseIndex", {});
  assert.strictEqual(missing.ok, false);
  assert.strictEqual(missing.error, "missing_token");

  // 建立 viewer session 後嘗試無權限 action
  const sess = withGlobals(
    {
      SpreadsheetApp: undefined,
      bootstrapAdminIfNeeded: function () {
        return false;
      },
      getAccountRole: function () {
        return { found: true, role: "viewer", enabled: true, name: "檢視者" };
      },
      readSystemSettings: function () {
        return { allowedLoginDomain: "", restrictWhitelist: false };
      }
    },
    function () {
      return api.createSessionForEmail("viewer-auth@example.com", "V");
    }
  );
  const forbidden = api.authorizeWebApiAction("saveSystemSettings", { token: sess.token });
  assert.strictEqual(forbidden.ok, false);
  assert.strictEqual(forbidden.error, "forbidden");

  const allowed = api.authorizeWebApiAction("getCourseIndex", { token: sess.token });
  assert.strictEqual(allowed.ok, true);
  assert.strictEqual(allowed.session.role, "viewer");
  console.log("   ✓ 授權分支驗證通過！\n");
}

console.log("9. CSRF 保護與錯誤分支應可透過路由與 executeWebApi 回歸...");
{
  const sess = withGlobals(
    {
      SpreadsheetApp: undefined,
      bootstrapAdminIfNeeded: function () {
        return false;
      },
      getAccountRole: function () {
        return { found: true, role: "admin", enabled: true, name: "管理員" };
      },
      readSystemSettings: function () {
        return { allowedLoginDomain: "", restrictWhitelist: false };
      }
    },
    function () {
      return api.createSessionForEmail("csrf-admin@example.com", "A");
    }
  );

  const missing = api.routeWebApiAction("logout", { token: sess.token });
  const mismatch = api.routeWebApiAction("logout", { token: sess.token, csrfToken: "bad" });
  assert.strictEqual(missing.error, "invalid_csrf_token");
  assert.strictEqual(mismatch.error, "invalid_csrf_token");

  const ok = api.routeWebApiAction("logout", { token: sess.token, csrfToken: sess.csrfToken });
  assert.strictEqual(ok.ok, true);

  // executeWebApi 應保留路由層 CSRF 錯誤
  const sess2 = withGlobals(
    {
      SpreadsheetApp: undefined,
      bootstrapAdminIfNeeded: function () {
        return false;
      },
      getAccountRole: function () {
        return { found: true, role: "admin", enabled: true, name: "管理員" };
      },
      readSystemSettings: function () {
        return { allowedLoginDomain: "", restrictWhitelist: false };
      }
    },
    function () {
      return api.createSessionForEmail("csrf-admin2@example.com", "A2");
    }
  );
  const execCsrf = api.executeWebApi({ action: "logout", token: sess2.token, csrfToken: "wrong" }, {});
  assert.strictEqual(execCsrf.ok, false);
  assert.strictEqual(execCsrf.error, "invalid_csrf_token");
  console.log("   ✓ CSRF 保護與錯誤分支驗證通過！\n");
}

console.log("✓ 公開設定、Session 與 CSRF 補強測試全數通過！\n");
