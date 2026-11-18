"use strict";

/**
 * routeWebApiAction 單元測試（G2.6）
 * 驗證公開/受保護 action 分支、權限與 CSRF 路徑行為。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行 routeWebApiAction 測試...\n");

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

function withGlobal(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(global, name);
  const prev = global[name];
  global[name] = value;
  try {
    return fn();
  } finally {
    if (had) global[name] = prev;
    else delete global[name];
  }
}

(function run() {
  console.log("1. 缺少或空白 action 應回傳 missing_action...");
  {
    ["", "   ", null, undefined].forEach(function (a) {
      const r = api.routeWebApiAction(a, {});
      assert.strictEqual(r.ok, false);
      assert.strictEqual(r.error, "missing_action");
    });
    console.log("   ✓ 缺少 action 驗證通過！\n");
  }

  console.log("2. 公開 action ping 應回傳 pong 與版本...");
  {
    const r = api.routeWebApiAction("ping", {});
    assert.strictEqual(r.ok, true);
    assert(typeof r.pong === "number" && r.pong > 0);
    assert.strictEqual(r.version, api.WEB_API_VERSION);
    console.log("   ✓ ping 驗證通過！\n");
  }

  console.log("3. 公開 action getPublicConfig 應委派並回傳結果...");
  {
    const expected = { ok: true, systemName: "X" };
    withStubbed(
      api,
      "getPublicConfig",
      function () {
        return expected;
      },
      function () {
        const r = api.routeWebApiAction("getPublicConfig", {});
        assert.strictEqual(r, expected);
      }
    );
    console.log("   ✓ getPublicConfig 驗證通過！\n");
  }

  console.log("4. 公開 action login 應傳遞 idToken/credential/空值...");
  {
    const calls = [];
    withStubbed(
      api,
      "loginWithGoogleIdToken",
      function (t) {
        calls.push(t);
        return { ok: true, t: t };
      },
      function () {
        api.routeWebApiAction("login", { idToken: "id-1" });
        api.routeWebApiAction("login", { credential: "cred-1" });
        api.routeWebApiAction("login", {});
        api.routeWebApiAction("login", null);
      }
    );
    assert.deepStrictEqual(calls, ["id-1", "cred-1", undefined, ""]);
    console.log("   ✓ login 驗證通過！\n");
  }

  console.log("5. 公開 action loginWithActiveUser 應委派處理...");
  {
    const expected = { ok: false, error: "no_active_user" };
    withStubbed(
      api,
      "loginWithActiveUser",
      function () {
        return expected;
      },
      function () {
        const r = api.routeWebApiAction("loginWithActiveUser", {});
        assert.strictEqual(r, expected);
      }
    );
    console.log("   ✓ loginWithActiveUser 驗證通過！\n");
  }

  console.log("6. 受保護 action 授權失敗應回傳授權錯誤...");
  {
    const denied = { ok: false, error: "missing_token" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return denied;
      },
      function () {
        const r = api.routeWebApiAction("getCourseIndex", { token: "" });
        assert.strictEqual(r, denied);
      }
    );
    console.log("   ✓ 授權失敗驗證通過！\n");
  }

  console.log("7. 寫入型 action CSRF 缺失或不符應回傳 invalid_csrf_token...");
  {
    const session = { role: "admin", csrfToken: "csrf-ok" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: session };
      },
      function () {
        ["importCourseCodes", "saveSystemSettings", "saveWhitelist", "logout"].forEach(function (action) {
          const base = action === "importCourseCodes" ? { rows: [{ a: 1 }] } : {};
          const r1 = api.routeWebApiAction(action, Object.assign({ token: "t" }, base));
          const r2 = api.routeWebApiAction(action, Object.assign({ token: "t", csrfToken: "bad" }, base));
          assert.strictEqual(r1.error, "invalid_csrf_token", action + " 缺 csrf");
          assert.strictEqual(r2.error, "invalid_csrf_token", action + " csrf 不符");
        });
      }
    );
    console.log("   ✓ CSRF 驗證通過！\n");
  }

  console.log("8. getSession 應依 payload.token 回傳 session 狀態...");
  {
    const session = { role: "viewer", csrfToken: "c" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: session };
      },
      function () {
        withStubbed(
          api,
          "getSessionState",
          function (token) {
            return { ok: true, email: "u@e", tokenSeen: token };
          },
          function () {
            const r = api.routeWebApiAction("getSession", { token: "tok-1" });
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.tokenSeen, "tok-1");
          }
        );
      }
    );
    console.log("   ✓ getSession 驗證通過！\n");
  }

  console.log("9. logout 應在 CSRF 正確時登出指定 token...");
  {
    const session = { role: "viewer", csrfToken: "csrf-ok" };
    let loggedOut = null;
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: session };
      },
      function () {
        withStubbed(
          api,
          "logoutSession",
          function (token) {
            loggedOut = token;
            return { ok: true };
          },
          function () {
            const r = api.routeWebApiAction("logout", { token: "tok-2", csrfToken: "csrf-ok" });
            assert.strictEqual(r.ok, true);
            assert.strictEqual(loggedOut, "tok-2");
          }
        );
      }
    );
    console.log("   ✓ logout 驗證通過！\n");
  }

  console.log("10. importCourseCodes 缺少 rows 應回傳 missing_rows...");
  {
    const session = { role: "admin", csrfToken: "csrf-ok" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: session };
      },
      function () {
        const r1 = api.routeWebApiAction("importCourseCodes", { csrfToken: "csrf-ok" });
        const r2 = api.routeWebApiAction("importCourseCodes", { csrfToken: "csrf-ok", rows: [] });
        const r3 = api.routeWebApiAction("importCourseCodes", { csrfToken: "csrf-ok", rows: "x" });
        assert.strictEqual(r1.error, "missing_rows");
        assert.strictEqual(r2.error, "missing_rows");
        assert.strictEqual(r3.error, "missing_rows");
      }
    );
    console.log("   ✓ importCourseCodes 缺 rows 驗證通過！\n");
  }

  console.log("11. importCourseCodes 有效資料應呼叫匯入並傳遞選項...");
  {
    const session = { role: "admin", csrfToken: "csrf-ok" };
    let captured = null;
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: session };
      },
      function () {
        withGlobal(
          "importNormalizedCourseCodes",
          function (rows, options) {
            captured = { rows: rows, options: options };
            return { ok: true, count: 1 };
          },
          function () {
            const rows = [{ a: 1 }];
            const r = api.routeWebApiAction("importCourseCodes", {
              csrfToken: "csrf-ok",
              rows: rows,
              preNormalized: true
            });
            assert.strictEqual(r.ok, true);
            assert.deepStrictEqual(captured.rows, rows);
            assert.strictEqual(captured.options.preNormalized, true);
            assert("spreadsheet" in captured.options);
          }
        );
      }
    );
    console.log("   ✓ importCourseCodes 成功驗證通過！\n");
  }

  console.log("12. getCourseIndex 應委派課程查詢...");
  {
    const session = { role: "viewer", csrfToken: "c" };
    let captured = null;
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: session };
      },
      function () {
        withGlobal(
          "getNormalizedCourses",
          function (payload, ss) {
            captured = { payload: payload, ss: ss };
            return { ok: true, rows: [] };
          },
          function () {
            const payload = { token: "t", page: 2 };
            const r = api.routeWebApiAction("getCourseIndex", payload);
            assert.strictEqual(r.ok, true);
            assert.strictEqual(captured.payload, payload);
          }
        );
      }
    );
    console.log("   ✓ getCourseIndex 驗證通過！\n");
  }

  console.log("13. getSystemSettings 應回傳系統設定...");
  {
    const session = { role: "staff", csrfToken: "c" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: session };
      },
      function () {
        withGlobal(
          "readSystemSettings",
          function () {
            return { schoolYear: "114" };
          },
          function () {
            const r = api.routeWebApiAction("getSystemSettings", { token: "t" });
            assert.strictEqual(r.ok, true);
            assert.deepStrictEqual(r.settings, { schoolYear: "114" });
          }
        );
      }
    );
    console.log("   ✓ getSystemSettings 驗證通過！\n");
  }

  console.log("14. saveSystemSettings 權限與儲存行為...");
  {
    const staffSession = { role: "staff", csrfToken: "csrf-ok" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: staffSession };
      },
      function () {
        const r = api.routeWebApiAction("saveSystemSettings", { csrfToken: "csrf-ok", settings: { a: 1 } });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, "forbidden");
      }
    );
    const adminSession = { role: "admin", csrfToken: "csrf-ok" };
    let saved = null;
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: adminSession };
      },
      function () {
        withGlobal(
          "saveSystemSettings",
          function (settings) {
            saved = settings;
            return { ok: true };
          },
          function () {
            const r = api.routeWebApiAction("saveSystemSettings", { csrfToken: "csrf-ok", settings: { a: 1 } });
            assert.strictEqual(r.ok, true);
            assert.deepStrictEqual(saved, { a: 1 });
            api.routeWebApiAction("saveSystemSettings", { csrfToken: "csrf-ok" });
            assert.deepStrictEqual(saved, {});
          }
        );
      }
    );
    console.log("   ✓ saveSystemSettings 驗證通過！\n");
  }

  console.log("15. getAccounts 權限與回傳行為...");
  {
    const viewerSession = { role: "viewer", csrfToken: "c" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: viewerSession };
      },
      function () {
        const r = api.routeWebApiAction("getAccounts", { token: "t" });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, "forbidden");
      }
    );
    const adminSession = { role: "admin", csrfToken: "c" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: adminSession };
      },
      function () {
        withGlobal(
          "readWhitelist",
          function () {
            return [{ email: "a@b" }];
          },
          function () {
            const r = api.routeWebApiAction("getAccounts", { token: "t" });
            assert.strictEqual(r.ok, true);
            assert.deepStrictEqual(r.accounts, [{ email: "a@b" }]);
          }
        );
      }
    );
    console.log("   ✓ getAccounts 驗證通過！\n");
  }

  console.log("16. saveWhitelist 權限與儲存行為...");
  {
    const staffSession = { role: "staff", csrfToken: "csrf-ok" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: staffSession };
      },
      function () {
        const r = api.routeWebApiAction("saveWhitelist", { csrfToken: "csrf-ok", accounts: [] });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, "forbidden");
      }
    );
    const adminSession = { role: "admin", csrfToken: "csrf-ok" };
    let saved = null;
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: adminSession };
      },
      function () {
        withGlobal(
          "saveWhitelist",
          function (accounts) {
            saved = accounts;
            return { ok: true, count: accounts.length };
          },
          function () {
            const r = api.routeWebApiAction("saveWhitelist", { csrfToken: "csrf-ok", accounts: [{ email: "x@y" }] });
            assert.strictEqual(r.ok, true);
            assert.deepStrictEqual(saved, [{ email: "x@y" }]);
            api.routeWebApiAction("saveWhitelist", { csrfToken: "csrf-ok" });
            assert.deepStrictEqual(saved, []);
          }
        );
      }
    );
    console.log("   ✓ saveWhitelist 驗證通過！\n");
  }

  console.log("17. 未知 action 應回傳 unknown_action...");
  {
    const session = { role: "admin", csrfToken: "c" };
    withStubbed(
      api,
      "authorizeWebApiAction",
      function () {
        return { ok: true, session: session };
      },
      function () {
        const r = api.routeWebApiAction("notExistsAction", { token: "t" });
        assert.strictEqual(r.ok, false);
        assert.strictEqual(r.error, "unknown_action");
      }
    );
    console.log("   ✓ unknown_action 驗證通過！\n");
  }

  console.log("✓ routeWebApiAction 測試全數通過！\n");
})();
