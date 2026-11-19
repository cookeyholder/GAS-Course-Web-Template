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

console.log("6. 受保護動作的授權注入點應被呼叫兩次且引數一致...");
{
  const calls = [];
  withOverrides(
    {
      authorizeWebApiAction: function (action, payload) {
        calls.push({ action: action, payload: payload });
        return { ok: true, session: { role: "viewer", email: "viewer@example.com" } };
      }
    },
    function () {
      api.executeWebApi({ action: "getSystemSettings" }, {});
    }
  );
  assert.strictEqual(calls.length, 2, "應呼叫授權兩次：日誌 context 一次、路由自行驗證一次");
  assert.strictEqual(calls[0].action, "getSystemSettings");
  assert.strictEqual(calls[1].action, "getSystemSettings");
  assert.deepStrictEqual(calls[0].payload, calls[1].payload, "兩次授權應收到相同的 payload");
  console.log("   ✓ 雙次授權注入驗證通過！\n");
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

console.log("14. 寫入動作應擷取快照並傳遞原始 payload 給產生器...");
{
  const calls = [];
  const rows = [];
  let captureIndex = 0;
  const fakeBuilders = {
    captureBefore: function (detailKey) {
      const snapshot = "snap-" + captureIndex;
      captureIndex += 1;
      calls.push(["capture", detailKey, snapshot]);
      return snapshot;
    },
    projectPayload: function (payload) {
      const projected = {};
      if (payload && payload.action) projected.action = payload.action;
      return projected;
    },
    describe: function (detailKey, before, payload, result) {
      calls.push(["describe", detailKey, before, payload]);
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
            settings: { schoolYear: "115" },
            accounts: [{ email: "new@example.com" }]
          },
          {}
        );
      }
    );
  });
  assert.deepStrictEqual(calls[0], ["capture", "systemSettings", "snap-0"]);
  assert.strictEqual(calls.length, 2, "應只擷取一次 before 快照且 describe 不再接收 after 快照");
  assert.strictEqual(calls[1][0], "describe");
  assert.strictEqual(calls[1][1], "systemSettings");
  assert.strictEqual(calls[1][2], "snap-0");
  const describePayload = calls[1][3];
  assert.strictEqual(describePayload.action, "saveSystemSettings");
  assert.deepStrictEqual(
    describePayload.settings,
    { schoolYear: "115" },
    "產生器應收到原始 settings，才能計算欄位變動"
  );
  assert.deepStrictEqual(
    describePayload.accounts,
    [{ email: "new@example.com" }],
    "產生器應收到原始 accounts，才能計算成員變動"
  );
  assert.strictEqual(rows.length, 1);
  const detailText = rows[0].detail;
  assert(detailText.indexOf("版本") !== -1);
  assert.strictEqual(detailText.indexOf("SECRET-TOKEN"), -1);
  assert.strictEqual(detailText.indexOf("RAW-ROW"), -1);
  console.log("   ✓ 原始 payload 送達產生器驗證通過！\n");
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
  assert.strictEqual(result.truncated, undefined, "未達掃描上限時不應標記 truncated");
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

console.log("19. 完整 executeWebApi 應為 saveSystemSettings 產生非空的變動明細...");
{
  const records = [];
  const before = { schoolYear: "114", systemName: "舊系統" };
  withGlobals(
    {
      readSystemSettings: function () {
        return Object.assign({}, before);
      }
    },
    function () {
      withOverrides(
        {
          authorizeWebApiAction: function () {
            return { ok: true, session: { role: "admin", email: "admin@example.com" } };
          },
          routeWebApiAction: function () {
            return { ok: true };
          },
          appendActivityLog: function (record) {
            records.push(record);
          }
        },
        function () {
          api.executeWebApi(
            {
              action: "saveSystemSettings",
              settings: { schoolYear: "115", systemName: "舊系統", clientSecret: "SHOULD-NOT-APPEAR" }
            },
            {}
          );
        }
      );
    }
  );
  assert.strictEqual(records.length, 1);
  const detail = JSON.parse(records[0].detail);
  assert.strictEqual(detail.動作, "saveSystemSettings");
  assert(Array.isArray(detail.變動));
  assert(detail.變動.length >= 1, "應記錄學年度變動");
  assert.deepStrictEqual(detail.變動[0], { 欄位: "學年度", 前: "114", 後: "115" });
  assert.strictEqual(JSON.stringify(detail).indexOf("SHOULD-NOT-APPEAR"), -1, "敏感值不得外洩");
  console.log("   ✓ 系統設定變動明細整合驗證通過！\n");
}

console.log("20. 完整 executeWebApi 應為 saveWhitelist 同時記錄新增與移除成員...");
{
  const records = [];
  const before = [{ email: "a@example.com" }, { email: "b@example.com" }];
  withGlobals(
    {
      readWhitelist: function () {
        return before.map(function (item) {
          return Object.assign({}, item);
        });
      }
    },
    function () {
      withOverrides(
        {
          authorizeWebApiAction: function () {
            return { ok: true, session: { role: "admin", email: "admin@example.com" } };
          },
          routeWebApiAction: function () {
            return { ok: true, count: 2 };
          },
          appendActivityLog: function (record) {
            records.push(record);
          }
        },
        function () {
          api.executeWebApi(
            {
              action: "saveWhitelist",
              accounts: [{ email: "B@example.com" }, { email: "c@example.com" }]
            },
            {}
          );
        }
      );
    }
  );
  assert.strictEqual(records.length, 1);
  const detail = JSON.parse(records[0].detail);
  assert.strictEqual(detail.動作, "saveWhitelist");
  assert.strictEqual(detail.變動.length, 2);
  assert.deepStrictEqual(detail.變動[0], { 欄位: "新增成員", 前: "", 後: "c@example.com" });
  assert.deepStrictEqual(detail.變動[1], { 欄位: "移除成員", 前: "a@example.com", 後: "" });
  console.log("   ✓ 白名單新增與移除整合驗證通過！\n");
}

console.log("21. 假工作表回傳 Date 物件時仍能查到且排序正確...");
{
  const newer = new Date("2026-11-19T02:00:00.000Z"); // Asia/Taipei 2026-11-19 10:00:00
  const older = new Date("2026-11-18T01:30:00.000Z"); // Asia/Taipei 2026-11-18 09:30:00
  assert.strictEqual(api.normalizeActivityLogTimestamp(newer), "2026-11-19 10:00:00");
  assert.strictEqual(api.normalizeActivityLogTimestamp("2026-11-19 10:00:00"), "2026-11-19 10:00:00");
  assert.strictEqual(api.normalizeActivityLogTimestamp(null), "");
  assert.strictEqual(api.normalizeActivityLogTimestamp(undefined), "");
  withGlobals(
    {
      Utilities: {
        formatDate: function (date, timezone, pattern) {
          assert.strictEqual(timezone, "Asia/Taipei");
          assert.strictEqual(pattern, "yyyy-MM-dd HH:mm:ss");
          return "2026-11-19 10:00:00";
        }
      }
    },
    function () {
      assert.strictEqual(api.normalizeActivityLogTimestamp(newer), "2026-11-19 10:00:00");
    }
  );

  const rows = [
    [older, "r-old", "query", "查詢", "success", "a@example.com", "甲", "檢視人員", "s1", "{}", 2, ""],
    [newer, "r-new", "query", "查詢", "success", "a@example.com", "甲", "檢視人員", "s2", "{}", 1, ""]
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
  const result = api.handleGetActivityLogWebApiAction(
    { startDate: "2026-11-18", endDate: "2026-11-19", page: 1, pageSize: 50 },
    { role: "admin" },
    ss
  );
  assert.strictEqual(result.total, 2, "Date 物件仍應落在日期區間內");
  assert.deepStrictEqual(
    result.rows.map(function (row) {
      return row.requestId;
    }),
    ["r-new", "r-old"],
    "應依正規化後時間遞減排序"
  );
  assert.strictEqual(result.rows[0].timestamp, "2026-11-19 10:00:00");
  console.log("   ✓ Date 物件正規化與排序驗證通過！\n");
}

console.log("22. 失敗請求應清除誤導變動並保留匯入統計標記...");
{
  const written = [];

  // CSRF 失敗模擬：saveSystemSettings 依 payload 推導出變動，但寫入未實際執行
  withGlobals(
    {
      readSystemSettings: function () {
        return { schoolYear: "112", semester: "1", systemName: "舊系統" };
      }
    },
    function () {
      withOverrides(
        {
          authorizeWebApiAction: function () {
            return {
              session: { email: "admin@example.com", name: "管理員", role: "admin", csrfToken: "ok" }
            };
          },
          routeWebApiAction: function () {
            return { ok: false, error: "invalid_csrf_token", message: "CSRF 驗證失敗" };
          },
          appendActivityLog: function (record) {
            written.push(record);
          }
        },
        function () {
          api.executeWebApi(
            {
              action: "saveSystemSettings",
              token: "tok",
              csrfToken: "bad",
              settings: { schoolYear: "113", semester: "2", systemName: "新系統" }
            },
            {}
          );
        }
      );
    }
  );
  assert.strictEqual(written.length, 1, "應寫入一列失敗日誌");
  const csrfDetail = JSON.parse(written[0].detail);
  assert.deepStrictEqual(csrfDetail.變動, [], "CSRF 失敗不得保留變動明細");
  assert.strictEqual(csrfDetail.指標.執行, "未執行", "失敗請求應標註未執行");
  assert.strictEqual(csrfDetail.指標.變動欄數, 3, "失敗時仍可保留依快照推導出的指標數值");

  // importCourseCodes 失敗時保留統計標記（指標）但清除變動並標註未執行
  withOverrides(
    {
      authorizeWebApiAction: function () {
        return {
          session: { email: "admin@example.com", name: "管理員", role: "admin", csrfToken: "ok" }
        };
      },
      routeWebApiAction: function () {
        return {
          ok: false,
          error: "validation_failed",
          message: "驗證失敗",
          stats: { sourceRows: 10, excludedRows: 2, keptCourseRows: 8, expandedRows: 24, returnedRows: 0 }
        };
      },
      appendActivityLog: function (record) {
        written.push(record);
      }
    },
    function () {
      api.executeWebApi({ action: "importCourseCodes", token: "tok", csrfToken: "ok" }, {});
    }
  );
  assert.strictEqual(written.length, 2, "應再寫入一列匯入失敗日誌");
  const importDetail = JSON.parse(written[1].detail);
  assert.deepStrictEqual(importDetail.變動, [], "失敗匯入不得保留變動");
  assert.strictEqual(importDetail.指標.執行, "未執行");
  assert.strictEqual(importDetail.指標.上傳筆數, 10, "應保留匯入統計標記");
  assert.strictEqual(importDetail.指標.展開筆數, 24);
  console.log("   ✓ 失敗請求變動清除與統計保留驗證通過！\n");
}

console.log("23. 無效日期區間應回傳明確錯誤且不回退預設值...");
{
  const emptySheet = {
    getLastRow: function () {
      return 1;
    },
    getRange: function () {
      throw new Error("不應讀取工作表");
    }
  };
  const ss = {
    getSheetByName: function () {
      return emptySheet;
    }
  };
  const cases = [
    { label: "月份與日期溢位", payload: { startDate: "2026-13-40", endDate: "2026-11-19" } },
    { label: "不存在的日期", payload: { startDate: "2026-02-30", endDate: "2026-11-19" } },
    { label: "起訖顛倒", payload: { startDate: "2026-11-20", endDate: "2026-11-10" } },
    { label: "年份過小", payload: { startDate: "1969-12-31", endDate: "2026-11-19" } },
    { label: "年份過大", payload: { startDate: "2026-11-19", endDate: "2101-01-01" } }
  ];
  cases.forEach(function (item) {
    const result = api.handleGetActivityLogWebApiAction(item.payload, { role: "admin" }, ss);
    assert.strictEqual(result.ok, false, item.label + " 應回傳失敗");
    assert.strictEqual(result.error, "invalid_date_range", item.label + " 應回傳 invalid_date_range");
    assert(result.message && result.message.indexOf("日期") !== -1, item.label + " 應提供明確訊息");
  });

  // 省略日期仍應回退預設值（含端點）
  const fallback = api.handleGetActivityLogWebApiAction(
    {},
    { role: "admin" },
    {
      getSheetByName: function () {
        return {
          getLastRow: function () {
            return 1;
          }
        };
      }
    }
  );
  assert.strictEqual(fallback.ok, true);
  assert(/^\d{4}-\d{2}-\d{2}$/.test(fallback.startDate));
  assert(/^\d{4}-\d{2}-\d{2}$/.test(fallback.endDate));
  console.log("   ✓ 無效日期區間驗證通過！\n");
}

console.log("24. 由最後一列往前分批讀取，跨出日期下界即停止且不標記 truncated...");
{
  const calls = [];
  // 600 列資料（超過單批 500）：
  // - 前 540 列在查詢區間下界之前（2026-10-*）
  // - 後段含 3 列符合區間（2026-11-14~16）與少量較新資料
  const dataRows = [];
  for (let i = 0; i < 540; i += 1) {
    dataRows.push([
      "2026-10-01 08:00:00",
      "old-" + i,
      "auth",
      "登入",
      "success",
      "a@example.com",
      "甲",
      "檢視人員",
      "s",
      "{}",
      1,
      ""
    ]);
  }
  dataRows.push([
    "2026-11-13 08:00:00",
    "r5",
    "auth",
    "登入",
    "success",
    "a@example.com",
    "甲",
    "檢視人員",
    "s",
    "{}",
    1,
    ""
  ]);
  dataRows.push([
    "2026-11-14 08:00:00",
    "r6",
    "auth",
    "登入",
    "success",
    "a@example.com",
    "甲",
    "檢視人員",
    "s",
    "{}",
    1,
    ""
  ]);
  dataRows.push([
    "2026-11-15 08:00:00",
    "r7",
    "auth",
    "登入",
    "success",
    "a@example.com",
    "甲",
    "檢視人員",
    "s",
    "{}",
    1,
    ""
  ]);
  dataRows.push([
    "2026-11-16 08:00:00",
    "r8",
    "auth",
    "登入",
    "success",
    "a@example.com",
    "甲",
    "檢視人員",
    "s",
    "{}",
    1,
    ""
  ]);
  dataRows.push([
    "2026-11-17 08:00:00",
    "r9",
    "auth",
    "登入",
    "success",
    "a@example.com",
    "甲",
    "檢視人員",
    "s",
    "{}",
    1,
    ""
  ]);
  for (let i = dataRows.length; i < 600; i += 1) {
    dataRows.push([
      "2026-11-18 08:00:00",
      "new-" + i,
      "auth",
      "登入",
      "success",
      "a@example.com",
      "甲",
      "檢視人員",
      "s",
      "{}",
      1,
      ""
    ]);
  }

  const sheet = {
    getLastRow: function () {
      return dataRows.length + 1;
    },
    getRange: function (r, c, numRows, numCols) {
      calls.push({ row: r, col: c, numRows: numRows, numCols: numCols });
      return {
        getValues: function () {
          return dataRows.slice(r - 2, r - 2 + numRows).map(function (row) {
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
  const result = api.handleGetActivityLogWebApiAction(
    { startDate: "2026-11-14", endDate: "2026-11-16", page: 1, pageSize: 50 },
    { role: "admin" },
    ss
  );
  assert.deepStrictEqual(
    result.rows.map(function (row) {
      return row.requestId;
    }),
    ["r8", "r7", "r6"],
    "應回傳區間內資料並依時間遞減排序"
  );
  assert.strictEqual(result.total, 3, "跨出日期下界時 total 應精確");
  assert.strictEqual(result.truncated, undefined, "未達掃描上限不應標記 truncated");
  assert(
    calls.every(function (c) {
      return c.numRows <= 500 && c.numCols === 12;
    }),
    "單次讀取不得超過批次上限且應固定 12 欄"
  );
  assert(
    calls.length >= 2 &&
      calls.every(function (c) {
        return c.numRows < dataRows.length;
      }),
    "不應一次讀取整表"
  );
  // 跨出 range.start 後會再多讀一批以容忍時間戳記錯置，但不應掃描至最舊區塊
  assert(calls.length <= 3, "跨出日期下界後僅再多讀一批即可停止，實際 " + calls.length + " 批");
  console.log("   ✓ 分批讀取與提前終止驗證通過！\n");
}

console.log("25. 達掃描上限時應回傳 truncated 且 total 為已掃描下限...");
{
  const totalDataRows = 5200; // 超過 ACTIVITY_LOG_MAX_SCAN_ROWS (5000)
  const sheet = {
    getLastRow: function () {
      return totalDataRows + 1;
    },
    getRange: function (r, c, numRows) {
      // 所有資料都在查詢區間內，迫使掃描達上限
      const values = [];
      for (let i = 0; i < numRows; i += 1) {
        const rowNum = r + i;
        values.push([
          "2026-11-19 12:00:00",
          "r" + rowNum,
          "query",
          "查詢",
          "success",
          "a@example.com",
          "甲",
          "檢視人員",
          "s",
          "{}",
          1,
          ""
        ]);
      }
      return {
        getValues: function () {
          return values;
        }
      };
    }
  };
  const ss = {
    getSheetByName: function () {
      return sheet;
    }
  };
  const result = api.handleGetActivityLogWebApiAction(
    { startDate: "2000-01-01", endDate: "2099-12-31", page: 1, pageSize: 50 },
    { role: "admin" },
    ss
  );
  assert.strictEqual(result.truncated, true, "達掃描上限應標記 truncated");
  assert(result.total <= 5000, "total 應為已掃描範圍的符合筆數（下限），實得 " + result.total);
  assert(result.total > 0, "應有掃描到的符合列");
  assert.strictEqual(result.rows.length, 50, "仍應依分頁回傳本頁資料");
  console.log("   ✓ 掃描上限與 truncated 驗證通過！\n");
}

console.log("26. category 篩選應不分大小寫...");
{
  const rows = [
    ["2026-11-19 10:00:00", "r1", "Auth", "登入", "success", "a@example.com", "甲", "檢視人員", "s", "{}", 1, ""],
    ["2026-11-19 11:00:00", "r2", "WRITE", "寫入", "success", "a@example.com", "甲", "管理員", "s", "{}", 1, ""],
    ["2026-11-19 12:00:00", "r3", "query", "查詢", "success", "a@example.com", "甲", "檢視人員", "s", "{}", 1, ""]
  ];
  const sheet = {
    getLastRow: function () {
      return rows.length + 1;
    },
    getRange: function () {
      return {
        getValues: function () {
          return rows.map(function (r) {
            return r.slice();
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
  ["auth", "AUTH", "Auth"].forEach(function (cat) {
    const result = api.handleGetActivityLogWebApiAction(
      { startDate: "2000-01-01", endDate: "2099-12-31", category: cat },
      { role: "admin" },
      ss
    );
    assert.strictEqual(result.total, 1, "category " + cat + " 應命中一筆");
    assert.strictEqual(result.rows[0].requestId, "r1");
  });
  console.log("   ✓ category 大小寫不敏感驗證通過！\n");
}

console.log("27. beforeSnapshot 應於取得鎖後擷取，且連續請求以前次寫入後狀態為前值...");
{
  const events = [];
  let sharedValue = "舊值";
  const rows = [];
  const fakeBuilders = {
    captureBefore: function () {
      events.push("capture:" + sharedValue);
      return { value: sharedValue };
    },
    describe: function (detailKey, before, payload) {
      return {
        版本: 1,
        動作: payload.action,
        指標: {},
        變動: [{ 欄位: "值", 前值: before ? before.value : "", 後值: payload.nextValue }]
      };
    }
  };
  withGlobals({ activityLogBuilders: fakeBuilders }, function () {
    withOverrides(
      {
        appendActivityLog: function (record) {
          rows.push(record);
          events.push("log");
        },
        routeWebApiAction: function (action, payload) {
          events.push("route:" + sharedValue);
          sharedValue = payload.nextValue;
          events.push("mutated:" + sharedValue);
          return { ok: true };
        }
      },
      function () {
        withGlobals(
          {
            LockService: {
              getScriptLock: function () {
                return {
                  tryLock: function () {
                    events.push("lock");
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
            api.executeWebApi({ action: "saveSystemSettings", nextValue: "第一次寫入" }, {});
            api.executeWebApi({ action: "saveSystemSettings", nextValue: "第二次寫入" }, {});
          }
        );
      }
    );
  });
  assert.deepStrictEqual(
    events.slice(0, 5),
    ["lock", "capture:舊值", "route:舊值", "mutated:第一次寫入", "unlock"],
    "鎖定動作應先取得鎖再擷取快照，最後解鎖後寫日誌"
  );
  assert.strictEqual(events[5], "log");
  assert.deepStrictEqual(
    events.slice(6, 11),
    ["lock", "capture:第一次寫入", "route:第一次寫入", "mutated:第二次寫入", "unlock"],
    "第二次請求的前值應為第一次寫入後狀態"
  );
  assert.strictEqual(rows.length, 2);
  const firstDetail = JSON.parse(rows[0].detail);
  const secondDetail = JSON.parse(rows[1].detail);
  assert.strictEqual(firstDetail.變動[0].前值, "舊值");
  assert.strictEqual(firstDetail.變動[0].後值, "第一次寫入");
  assert.strictEqual(secondDetail.變動[0].前值, "第一次寫入");
  assert.strictEqual(secondDetail.變動[0].後值, "第二次寫入");
  console.log("   ✓ 鎖後擷取與連續請求前值驗證通過！\n");
}

console.log("28. 非鎖定動作的 beforeSnapshot 應在鎖判定後、路由前擷取...");
{
  const events = [];
  const fakeBuilders = {
    captureBefore: function () {
      events.push("capture");
      return { v: 1 };
    },
    describe: function () {
      return { 版本: 1, 動作: "getCourseIndex", 指標: {}, 變動: [] };
    }
  };
  // getCourseIndex 非鎖定但屬可記錄動作（query 類且 enabled）
  withGlobals({ activityLogBuilders: fakeBuilders }, function () {
    withOverrides(
      {
        appendActivityLog: function () {
          events.push("log");
        },
        routeWebApiAction: function () {
          events.push("route");
          return { ok: true };
        }
      },
      function () {
        api.executeWebApi({ action: "getCourseIndex" }, {});
      }
    );
  });
  assert.deepStrictEqual(events.slice(0, 2), ["capture", "route"], "非鎖定動作應於鎖判定後、路由前擷取");
  console.log("   ✓ 非鎖定動作擷取時機驗證通過！\n");
}

console.log("29. lock_timeout 應寫入失敗日誌且不呼叫 releaseLock...");
{
  const rows = [];
  let releaseCalls = 0;
  const result = withGlobals(
    {
      LockService: {
        getScriptLock: function () {
          return {
            tryLock: function () {
              return false;
            },
            releaseLock: function () {
              releaseCalls += 1;
            }
          };
        }
      }
    },
    function () {
      return withOverrides(
        {
          authorizeWebApiAction: function () {
            return {
              session: { email: "admin@example.com", name: "管理員", role: "admin", csrfToken: "ok" }
            };
          },
          appendActivityLog: function (record) {
            rows.push(record);
          }
        },
        function () {
          return api.executeWebApi({ action: "saveSystemSettings", token: "tok", csrfToken: "ok" }, {});
        }
      );
    }
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error, "lock_timeout");
  assert.strictEqual(releaseCalls, 0, "未取得鎖時不得釋放鎖");
  assert.strictEqual(rows.length, 1, "lock_timeout 應寫入一列日誌");
  assert.strictEqual(rows[0].result, "failure");
  assert.strictEqual(rows[0].errorCode, "lock_timeout");
  console.log("   ✓ lock_timeout 日誌與鎖釋放驗證通過！\n");
}

console.log("30. CSRF 驗證失敗應寫入失敗日誌與 errorCode...");
{
  const rows = [];
  withOverrides(
    {
      authorizeWebApiAction: function () {
        return {
          session: { email: "admin@example.com", name: "管理員", role: "admin", csrfToken: "ok" }
        };
      },
      routeWebApiAction: function () {
        return { ok: false, error: "invalid_csrf_token", message: "CSRF 驗證失敗" };
      },
      appendActivityLog: function (record) {
        rows.push(record);
      }
    },
    function () {
      api.executeWebApi({ action: "saveSystemSettings", token: "tok", csrfToken: "bad" }, {});
    }
  );
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].result, "failure");
  assert.strictEqual(rows[0].errorCode, "invalid_csrf_token");
  console.log("   ✓ CSRF 失敗日誌驗證通過！\n");
}

console.log("✓ webApiActivityLog.test.js 測試全數通過！\n");
