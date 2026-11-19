"use strict";

/**
 * webApiActivityLog.test.js（task 4.1 起）
 * 驗證請求層級日誌 context、授權身分寫回，以及解析失敗／缺少 action 仍進入 finally。
 */

const assert = require("assert");
const api = require("../webApi.js");
const originalCreateContext = api.createWebApiLogContext;

console.log("開始執行 webApiActivityLog 測試...\n");

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

function withOverrides(overrides, fn) {
  const prev = {};
  Object.keys(overrides).forEach(function (key) {
    prev[key] = api[key];
    api[key] = overrides[key];
  });
  try {
    return fn();
  } finally {
    Object.keys(overrides).forEach(function (key) {
      if (prev[key] === undefined) delete api[key];
      else api[key] = prev[key];
    });
  }
}

console.log("1. context 應含請求識別碼、動作與開始時間...");
{
  const context = api.createWebApiLogContext("saveSystemSettings", 12345);
  assert.strictEqual(typeof context.requestId, "string");
  assert(context.requestId.indexOf("req_") === 0);
  assert.strictEqual(context.action, "saveSystemSettings");
  assert.strictEqual(context.startTime, 12345);
  assert.strictEqual(context.email, "");
  assert.strictEqual(context.name, "");
  assert.strictEqual(context.role, "");
  assert.strictEqual(context.errorCode, "");
  console.log("   ✓ context 建立驗證通過！\n");
}

console.log("2. 授權 session 應寫回已驗證身分，角色顯示名稱由 role 換算...");
{
  const context = api.createWebApiLogContext("getSession");
  api.recordWebApiIdentity(
    context,
    {
      ok: true,
      session: {
        email: "staff@example.com",
        name: "業務人員甲",
        role: "staff",
        roleName: "遭竄改的角色"
      }
    },
    null
  );
  assert.strictEqual(context.email, "staff@example.com");
  assert.strictEqual(context.name, "業務人員甲");
  assert.strictEqual(context.role, "業務人員");
  assert.notStrictEqual(context.role, "遭竄改的角色");
  console.log("   ✓ 授權身分寫回驗證通過！\n");
}

console.log("3. 公開登入成功應由回傳結果補寫已驗證身分...");
{
  const context = api.createWebApiLogContext("login");
  api.recordWebApiIdentity(context, null, {
    ok: true,
    email: "admin@example.com",
    name: "管理員",
    role: "admin",
    roleName: "遭竄改的角色"
  });
  assert.strictEqual(context.email, "admin@example.com");
  assert.strictEqual(context.role, "系統管理員");
  assert.notStrictEqual(context.role, "遭竄改的角色");
  console.log("   ✓ 登入身分補寫驗證通過！\n");
}

console.log("4. JSON 解析失敗仍應建立 context（try 已上移）...");
{
  const contexts = [];
  withOverrides(
    {
      createWebApiLogContext: function (action, startTime) {
        const context = originalCreateContext(action, startTime);
        contexts.push(context);
        return context;
      }
    },
    function () {
      const result = api.executeWebApi("{bad json", {});
      assert.strictEqual(result.error, "invalid_json");
    }
  );
  assert.strictEqual(contexts.length, 1, "解析失敗仍應建立 context");
  assert.strictEqual(contexts[0].action, "");
  console.log("   ✓ 解析失敗 context 驗證通過！\n");
}

console.log("5. 缺少 action 仍應建立 context...");
{
  const contexts = [];
  withOverrides(
    {
      createWebApiLogContext: function (action, startTime) {
        const context = originalCreateContext(action, startTime);
        contexts.push(context);
        return context;
      }
    },
    function () {
      const result = api.executeWebApi({}, {});
      assert.strictEqual(result.error, "missing_action");
    }
  );
  assert.strictEqual(contexts.length, 1);
  assert.strictEqual(contexts[0].action, "");
  console.log("   ✓ 缺少 action context 驗證通過！\n");
}

console.log("6. 被置換的 routeWebApiAction 只應收到三個參數...");
{
  const seen = [];
  withOverrides(
    {
      routeWebApiAction: function () {
        seen.push(Array.prototype.slice.call(arguments));
        return { ok: true, replaced: true };
      }
    },
    function () {
      const result = api.executeWebApi({ action: "ping" }, {});
      assert.strictEqual(result.replaced, true);
    }
  );
  assert.strictEqual(seen.length, 1);
  assert.strictEqual(seen[0].length, 3);
  assert.strictEqual(seen[0][0], "ping");
  console.log("   ✓ 路由置換情境驗證通過！\n");
}

console.log("7. executeWebApi 應在登入成功後寫回 context 身分...");
{
  const contexts = [];
  withOverrides(
    {
      createWebApiLogContext: function (action, startTime) {
        const context = originalCreateContext(action, startTime);
        contexts.push(context);
        return context;
      },
      routeWebApiAction: function () {
        return {
          ok: true,
          email: "admin@example.com",
          name: "管理員",
          role: "admin",
          roleName: "遭竄改的角色"
        };
      }
    },
    function () {
      api.executeWebApi({ action: "login" }, {});
    }
  );
  assert.strictEqual(contexts.length, 1);
  assert.strictEqual(contexts[0].email, "admin@example.com");
  assert.strictEqual(contexts[0].role, "系統管理員");
  console.log("   ✓ 注入式身分寫回驗證通過！\n");
}

console.log("8. 成功請求應寫入一列成功日誌...");
{
  const rows = [];
  withOverrides(
    {
      appendActivityLog: function (record) {
        rows.push(record);
      },
      routeWebApiAction: function () {
        return { ok: true, rows: [] };
      }
    },
    function () {
      api.executeWebApi({ action: "getCourseIndex", page: 1 }, {});
    }
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].result, "success");
  assert.strictEqual(rows[0].errorCode, "");
  assert.strictEqual(rows[0].category, "query");
  assert.strictEqual(rows[0].action, "查詢課程代碼");
  assert.strictEqual(typeof rows[0].durationMs, "number");
  assert(rows[0].requestId.indexOf("req_") === 0);
  console.log("   ✓ 成功日誌寫入驗證通過！\n");
}

console.log("9. 授權失敗應寫入失敗日誌與錯誤代碼...");
{
  const rows = [];
  withOverrides(
    {
      appendActivityLog: function (record) {
        rows.push(record);
      },
      routeWebApiAction: function () {
        return api.webApiError("forbidden", "無權限");
      }
    },
    function () {
      api.executeWebApi({ action: "getAccounts" }, {});
    }
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].result, "failure");
  assert.strictEqual(rows[0].errorCode, "forbidden");
  assert(rows[0].summary.indexOf("失敗") !== -1);
  console.log("   ✓ 授權失敗日誌驗證通過！\n");
}

console.log("10. JSON 解析失敗與缺少 action 亦應寫入日誌...");
{
  const rows = [];
  const capture = {
    appendActivityLog: function (record) {
      rows.push(record);
    }
  };
  withOverrides(capture, function () {
    api.executeWebApi("{bad", {});
    api.executeWebApi({}, {});
  });
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].errorCode, "invalid_json");
  assert.strictEqual(rows[1].errorCode, "missing_action");
  console.log("   ✓ 解析失敗與缺少 action 日誌驗證通過！\n");
}

console.log("11. 心跳、公開設定與日誌查詢不寫入日誌...");
{
  const rows = [];
  withOverrides(
    {
      appendActivityLog: function (record) {
        rows.push(record);
      },
      routeWebApiAction: function () {
        return { ok: true };
      }
    },
    function () {
      ["ping", "getPublicConfig", "getActivityLog"].forEach(function (action) {
        api.executeWebApi({ action: action }, {});
      });
    }
  );
  assert.strictEqual(rows.length, 0);
  console.log("   ✓ 例外動作驗證通過！\n");
}

console.log("12. 日誌寫入應發生於釋放鎖之後...");
{
  const events = [];
  let append = null;
  withOverrides(
    {
      routeWebApiAction: function () {
        return { ok: true };
      },
      appendActivityLog: function () {
        events.push("log");
      }
    },
    function () {
      withGlobals(
        {
          LockService: {
            getScriptLock: function () {
              return {
                tryLock: function () {
                  return true;
                },
                releaseLock: function () {
                  events.push("unlock");
                }
              };
            }
          }
        },
        function () {
          append = api.executeWebApi({ action: "saveSystemSettings" }, {});
        }
      );
    }
  );
  assert.strictEqual(append.ok, true);
  assert.deepStrictEqual(events, ["unlock", "log"]);
  console.log("   ✓ 解鎖順序驗證通過！\n");
}

console.log("13. 日誌附加失敗不影響原本回應...");
{
  const originalError = console.error;
  console.error = function () {};
  try {
    withOverrides(
      {
        appendActivityLog: function () {
          throw new Error("寫入失敗");
        },
        routeWebApiAction: function () {
          return { ok: true, value: 1 };
        }
      },
      function () {
        const result = api.executeWebApi({ action: "getCourseIndex" }, {});
        assert.strictEqual(result.ok, true);
        assert.strictEqual(result.value, 1);
      }
    );
  } finally {
    console.error = originalError;
  }
  console.log("   ✓ 附加失敗不阻斷驗證通過！\n");
}

console.log("14. 寫入動作應擷取 before/after 並只傳遞白名單投影 payload...");
{
  const calls = [];
  const rows = [];
  let captureIndex = 0;
  const fakeBuilders = {
    captureBefore: function () {
      const snapshot = "snap-" + captureIndex;
      captureIndex += 1;
      calls.push(["capture", snapshot]);
      return snapshot;
    },
    projectPayload: function (payload) {
      const projected = {};
      if (payload && payload.action) projected.action = payload.action;
      return projected;
    },
    describe: function (detailKey, before, after, payload, result) {
      calls.push(["describe", detailKey, before, after, payload]);
      return { 版本: 1, 動作: payload.action, 指標: {}, 變動: [] };
    }
  };
  withGlobals({ activityLogBuilders: fakeBuilders }, function () {
    withOverrides(
      {
        appendActivityLog: function (record) {
          rows.push(record);
        },
        routeWebApiAction: function () {
          return { ok: true };
        }
      },
      function () {
        api.executeWebApi(
          {
            action: "saveSystemSettings",
            token: "SECRET-TOKEN",
            rows: [["RAW-ROW"]],
            settings: { schoolYear: "115" }
          },
          {}
        );
      }
    );
  });
  assert.deepStrictEqual(calls[0], ["capture", "snap-0"]);
  assert.deepStrictEqual(calls[1], ["capture", "snap-1"]);
  assert.strictEqual(calls[2][0], "describe");
  assert.strictEqual(calls[2][1], "systemSettings");
  assert.strictEqual(calls[2][2], "snap-0");
  assert.strictEqual(calls[2][3], "snap-1");
  assert.deepStrictEqual(calls[2][4], { action: "saveSystemSettings" });
  assert.strictEqual(rows.length, 1);
  const detailText = rows[0].detail;
  assert(detailText.indexOf("版本") !== -1);
  assert.strictEqual(detailText.indexOf("SECRET-TOKEN"), -1);
  assert.strictEqual(detailText.indexOf("RAW-ROW"), -1);
  console.log("   ✓ before/after 與白名單投影驗證通過！\n");
}

console.log("15. 例外動作不應擷取快照...");
{
  let captureCalls = 0;
  const fakeBuilders = {
    captureBefore: function () {
      captureCalls += 1;
      return null;
    },
    projectPayload: function (payload) {
      return payload || {};
    },
    describe: function () {
      return { 版本: 1, 指標: {}, 變動: [] };
    }
  };
  withGlobals({ activityLogBuilders: fakeBuilders }, function () {
    withOverrides(
      {
        appendActivityLog: function () {},
        routeWebApiAction: function () {
          return { ok: true };
        }
      },
      function () {
        api.executeWebApi({ action: "ping" }, {});
      }
    );
  });
  assert.strictEqual(captureCalls, 0);
  console.log("   ✓ 例外動作略過驗證通過！\n");
}

console.log("16. 管理員可查詢日誌，非管理員被拒...");
{
  const rows = [
    [
      "2026-11-19 10:00:00",
      "req-1",
      "query",
      "查詢課程代碼",
      "success",
      "admin@example.com",
      "管理員",
      "系統管理員",
      "查詢課程代碼成功",
      "{}",
      12,
      ""
    ]
  ];
  const sheet = {
    getLastRow: function () {
      return rows.length + 1;
    },
    getRange: function (r, c, numRows) {
      return {
        getValues: function () {
          return rows.slice(r - 2, r - 2 + numRows).map(function (row) {
            return row.slice();
          });
        }
      };
    }
  };
  const ss = {
    getSheetByName: function (name) {
      return name === "操作日誌" ? sheet : null;
    }
  };
  const adminResult = withGlobals(
    {
      SpreadsheetApp: {
        getActiveSpreadsheet: function () {
          return ss;
        }
      }
    },
    function () {
      return withOverrides(
        {
          authorizeWebApiAction: function () {
            return { ok: true, session: { role: "admin", email: "admin@example.com" } };
          },
          appendActivityLog: function () {}
        },
        function () {
          return api.executeWebApi({ action: "getActivityLog", startDate: "2000-01-01", endDate: "2099-12-31" }, {});
        }
      );
    }
  );
  assert.strictEqual(adminResult.ok, true);
  assert.strictEqual(adminResult.total, 1);
  assert.strictEqual(adminResult.rows.length, 1);
  assert.strictEqual(adminResult.rows[0].requestId, "req-1");
  assert.strictEqual(adminResult.rows[0].durationMs, 12);

  const staffResult = withOverrides(
    {
      authorizeWebApiAction: function () {
        return { ok: true, session: { role: "staff" } };
      },
      appendActivityLog: function () {}
    },
    function () {
      return api.executeWebApi({ action: "getActivityLog" }, {});
    }
  );
  assert.strictEqual(staffResult.ok, false);
  assert.strictEqual(staffResult.error, "forbidden");
  console.log("   ✓ 管理員查詢與角色拒絕驗證通過！\n");
}

console.log("17. 日誌清單應依時間遞減排序並分頁...");
{
  const rows = [
    [
      "2026-11-19 10:00:00",
      "r1",
      "query",
      "查詢課程代碼",
      "success",
      "a@example.com",
      "甲",
      "檢視人員",
      "s1",
      "{}",
      1,
      ""
    ],
    [
      "2026-11-18 09:00:00",
      "r2",
      "write",
      "儲存系統設定",
      "success",
      "b@example.com",
      "乙",
      "系統管理員",
      "s2",
      "{}",
      2,
      ""
    ],
    [
      "2026-11-20 08:00:00",
      "r3",
      "query",
      "查詢課程統計",
      "failure",
      "a@example.com",
      "甲",
      "檢視人員",
      "s3",
      "{}",
      3,
      "forbidden"
    ]
  ];
  const sheet = {
    getLastRow: function () {
      return rows.length + 1;
    },
    getRange: function (r, c, numRows) {
      return {
        getValues: function () {
          return rows.slice(r - 2, r - 2 + numRows).map(function (row) {
            return row.slice();
          });
        }
      };
    }
  };
  const result = api.handleGetActivityLogWebApiAction(
    { startDate: "2000-01-01", endDate: "2099-12-31", page: 1, pageSize: 2 },
    { role: "admin" },
    {
      getSheetByName: function () {
        return sheet;
      }
    }
  );
  assert.strictEqual(result.total, 3);
  assert.strictEqual(result.pageSize, 2);
  assert.deepStrictEqual(
    result.rows.map(function (row) {
      return row.requestId;
    }),
    ["r3", "r1"]
  );

  const page2 = api.handleGetActivityLogWebApiAction(
    { startDate: "2000-01-01", endDate: "2099-12-31", page: 2, pageSize: 2 },
    { role: "admin" },
    {
      getSheetByName: function () {
        return sheet;
      }
    }
  );
  assert.deepStrictEqual(
    page2.rows.map(function (row) {
      return row.requestId;
    }),
    ["r2"]
  );
  console.log("   ✓ 排序與分頁驗證通過！\n");
}

console.log("18. 預設僅回傳最近 7 天，且篩選與上限生效...");
{
  const today = api.formatTaipeiDate(new Date());
  const oldDay = api.formatTaipeiDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
  const rows = [
    [
      today + " 09:00:00",
      "recent",
      "query",
      "查詢課程代碼",
      "success",
      "a@example.com",
      "甲",
      "檢視人員",
      "s1",
      "{}",
      1,
      ""
    ],
    [
      oldDay + " 09:00:00",
      "old",
      "query",
      "查詢課程代碼",
      "success",
      "a@example.com",
      "甲",
      "檢視人員",
      "s2",
      "{}",
      1,
      ""
    ],
    [
      today + " 10:00:00",
      "write",
      "write",
      "儲存系統設定",
      "success",
      "b@example.com",
      "乙",
      "系統管理員",
      "s3",
      "{}",
      2,
      ""
    ]
  ];
  const sheet = {
    getLastRow: function () {
      return rows.length + 1;
    },
    getRange: function (r, c, numRows) {
      return {
        getValues: function () {
          return rows.slice(r - 2, r - 2 + numRows).map(function (row) {
            return row.slice();
          });
        }
      };
    }
  };
  const ss = {
    getSheetByName: function () {
      return sheet;
    }
  };
  const defaults = api.handleGetActivityLogWebApiAction({}, { role: "admin" }, ss);
  assert.strictEqual(defaults.pageSize, 50);
  assert.strictEqual(defaults.total, 2, "30 天前的資料不應出現");
  assert.strictEqual(defaults.rows[0].requestId, "write");
  assert.strictEqual(defaults.endDate, today);

  const filtered = api.handleGetActivityLogWebApiAction(
    { email: "a@example", category: "query", pageSize: 1000 },
    { role: "admin" },
    ss
  );
  assert.strictEqual(filtered.pageSize, 500, "單次上限應為 500");
  assert.strictEqual(filtered.total, 1);
  assert.strictEqual(filtered.rows[0].requestId, "recent");
  console.log("   ✓ 預設區間、篩選與上限驗證通過！\n");
}

console.log("✓ webApiActivityLog.test.js 測試全數通過！\n");
