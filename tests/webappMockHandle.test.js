"use strict";

/**
 * webapp/js/mock.js 單元測試（G8.1）
 * 驗證各 action 回應、狀態隔離、非同步語意與 ?mock=true 相容行為。
 */

const assert = require("assert");
const mockModule = require("../webapp/js/mock.js");
const apiModule = require("../webapp/js/api.js");

const MOCK_DELAY_MS = 150;
const FIXED_NOW = 1700000000000;

/**
 * 建立可觀測計時器的 Mock API 實例。
 *
 * @param {Object} [overrides] - 覆寫依賴
 * @returns {Object} Mock 實例、計時紀錄與依賴
 */
function createMock(overrides) {
  const timers = [];
  const deps = Object.assign(
    {
      window: { location: { href: "https://example.test/app?mock=true" } },
      setTimeoutFn: function (fn, ms) {
        timers.push(ms);
        fn();
        return timers.length;
      },
      nowFn: function () {
        return FIXED_NOW;
      }
    },
    overrides || {}
  );
  return { mock: mockModule.createMockApi(deps), timers: timers, deps: deps };
}

(async function run() {
  console.log("開始執行 webapp/js/mock.js 測試...\n");

  console.log("1. 應匯出可測試的 Mock API 工廠...");
  {
    assert.strictEqual(typeof mockModule.createMockApi, "function", "應匯出 createMockApi");
    const instance = createMock();
    assert.strictEqual(typeof instance.mock.handle, "function", "MEA.mock.handle 契約應保留");
    console.log("   ✓ 匯出介面驗證通過！\n");
  }

  console.log("2. handle 應回傳 Promise，並經由 150 毫秒延遲後解析...");
  {
    let pending = null;
    const timers = [];
    const mock = mockModule.createMockApi({
      window: { location: { href: "https://example.test/app" } },
      setTimeoutFn: function (fn, ms) {
        timers.push({ fn: fn, ms: ms });
        return timers.length;
      },
      nowFn: function () {
        return FIXED_NOW;
      }
    });
    let settled = false;
    pending = mock.handle("ping").then(function (result) {
      settled = true;
      return result;
    });
    assert.strictEqual(timers.length, 1, "應註冊一次延遲執行");
    assert.strictEqual(timers[0].ms, MOCK_DELAY_MS);
    assert.strictEqual(settled, false, "計時器觸發前不應解析");
    timers[0].fn();
    const result = await pending;
    assert.strictEqual(settled, true);
    assert.deepStrictEqual(result, { ok: true, pong: FIXED_NOW, version: "1.1.0-mock" });
    console.log("   ✓ 非同步延遲語意驗證通過！\n");
  }

  console.log("3. ping 應回傳固定版本與注入時間...");
  {
    const { mock, timers } = createMock();
    assert.deepStrictEqual(await mock.handle("ping"), { ok: true, pong: FIXED_NOW, version: "1.1.0-mock" });
    assert.deepStrictEqual(timers, [MOCK_DELAY_MS]);
    console.log("   ✓ ping 驗證通過！\n");
  }

  console.log("4. getPublicConfig 應回傳公開設定與目前網址...");
  {
    const { mock } = createMock();
    const result = await mock.handle("getPublicConfig");
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.version, "1.1.0-mock");
    assert.strictEqual(result.systemName, "Google Apps Script 應用程式範本 (Mock Mode)");
    assert.strictEqual(result.schoolYear, "114");
    assert.strictEqual(result.semester, "1");
    assert.strictEqual(result.clientId, "mock-client-id.apps.googleusercontent.com");
    assert.strictEqual(result.hasClientSecret, false);
    assert.strictEqual(result.allowedDomain, "");
    assert.strictEqual(result.activeEmail, "admin@example.com");
    assert.strictEqual(result.webAppUrl, "https://example.test/app?mock=true");
    console.log("   ✓ getPublicConfig 驗證通過！\n");
  }

  console.log("5. login 與 loginWithActiveUser 應回傳相同登入負載...");
  {
    const { mock } = createMock();
    const expected = {
      ok: true,
      token: "mock_session_token_" + FIXED_NOW,
      csrfToken: "mock_csrf_" + FIXED_NOW,
      expiresIn: 21600,
      email: "admin@example.com",
      name: "測試管理員",
      role: "admin",
      roleName: "系統管理員",
      perms: ["*"]
    };
    assert.deepStrictEqual(await mock.handle("login"), expected);
    assert.deepStrictEqual(await mock.handle("loginWithActiveUser", { ignored: true }), expected);
    console.log("   ✓ 登入負載驗證通過！\n");
  }

  console.log("6. getSession 應使用傳入的 csrfToken，否則回傳預設值...");
  {
    const { mock } = createMock();
    assert.deepStrictEqual(await mock.handle("getSession"), {
      ok: true,
      email: "admin@example.com",
      name: "測試管理員",
      role: "admin",
      roleName: "系統管理員",
      perms: ["*"],
      csrfToken: "mock_csrf_token"
    });
    const custom = await mock.handle("getSession", { csrfToken: "自訂權杖" });
    assert.strictEqual(custom.csrfToken, "自訂權杖");
    const empty = await mock.handle("getSession", { csrfToken: "" });
    assert.strictEqual(empty.csrfToken, "mock_csrf_token");
    console.log("   ✓ getSession 驗證通過！\n");
  }

  console.log("7. logout 應回傳成功...");
  {
    const { mock } = createMock();
    assert.deepStrictEqual(await mock.handle("logout"), { ok: true });
    console.log("   ✓ logout 驗證通過！\n");
  }

  console.log("8. importCourseCodes 應展開十四欄並可供 getCourseIndex 查詢...");
  {
    const { mock } = createMock();
    const row = [
      "114",
      "2",
      "3",
      "112",
      "AA001",
      "測試課程",
      "電機與電子群",
      "資訊科",
      "部定必修",
      "原班級",
      "專業科目",
      "必修",
      "2",
      "4"
    ];
    assert.deepStrictEqual(await mock.handle("importCourseCodes", { rows: [row] }), { ok: true, rows: 1 });
    const index = await mock.handle("getCourseIndex");
    assert.strictEqual(index.total, 1);
    assert.strictEqual(index.page, 1);
    assert.strictEqual(index.pageSize, 50);
    assert.strictEqual(index.totalPages, 1);
    assert.strictEqual(index.list.length, 1);
    assert.deepStrictEqual(index.list[0], {
      academicYear: "114",
      semester: "2",
      grade: "3",
      entryYear: "112",
      courseCode: "AA001",
      subjectName: "測試課程",
      group: "電機與電子群",
      department: "資訊科",
      subjectType: "部定必修",
      openWay: "原班級",
      attribute: "專業科目",
      required: "必修",
      credits: "2",
      hours: "4"
    });
    assert.deepStrictEqual(await mock.handle("importCourseCodes", {}), { ok: true, rows: 1 });
    console.log("   ✓ 課程匯入與查詢驗證通過！\n");
  }

  console.log("9. getCourseIndex 初始應回傳四筆內建課程...");
  {
    const { mock } = createMock();
    const index = await mock.handle("getCourseIndex");
    assert.strictEqual(index.ok, true);
    assert.strictEqual(index.list.length, 4);
    assert.strictEqual(index.total, 4);
    assert.strictEqual(index.list[0].courseCode, "305101A");
    assert.strictEqual(index.list[3].courseCode, "311301D");
    console.log("   ✓ 內建課程驗證通過！\n");
  }

  console.log("10. getSystemSettings 應回傳設定副本...");
  {
    const { mock } = createMock();
    const first = await mock.handle("getSystemSettings");
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.settings.schoolYear, "114");
    first.settings.schoolYear = "999";
    const second = await mock.handle("getSystemSettings");
    assert.strictEqual(second.settings.schoolYear, "114");
    console.log("   ✓ 設定副本驗證通過！\n");
  }

  console.log("11. saveSystemSettings 應合併設定並轉換中文欄位名稱...");
  {
    const { mock } = createMock();
    assert.deepStrictEqual(
      await mock.handle("saveSystemSettings", {
        settings: { clientSecret: "secret", "Google 登入允許網域": "@Example.COM " }
      }),
      { ok: true }
    );
    const config = await mock.handle("getPublicConfig");
    assert.strictEqual(config.hasClientSecret, true);
    assert.strictEqual(config.allowedDomain, "example.com");

    assert.deepStrictEqual(
      await mock.handle("saveSystemSettings", { settings: { allowedLoginDomain: "@School.TW" } }),
      {
        ok: true
      }
    );
    const again = await mock.handle("getPublicConfig");
    assert.strictEqual(again.allowedDomain, "school.tw");
    assert.deepStrictEqual(await mock.handle("saveSystemSettings", {}), { ok: true });
    console.log("   ✓ 設定儲存驗證通過！\n");
  }

  console.log("12. getAccounts 與 saveWhitelist 應維持帳號陣列語意...");
  {
    const { mock } = createMock();
    const accounts = await mock.handle("getAccounts");
    assert.strictEqual(accounts.accounts.length, 2);
    assert.strictEqual(accounts.accounts[0].email, "admin@example.com");
    accounts.accounts.push({ email: "extra@example.com" });
    const unchanged = await mock.handle("getAccounts");
    assert.strictEqual(unchanged.accounts.length, 2);

    const accountsToSave = [{ email: "new@example.com", name: "新成員", role: "viewer", enabled: false }];
    assert.deepStrictEqual(await mock.handle("saveWhitelist", { accounts: accountsToSave }), { ok: true, count: 1 });
    const saved = await mock.handle("getAccounts");
    assert.deepStrictEqual(saved.accounts, accountsToSave);
    assert.deepStrictEqual(await mock.handle("saveWhitelist", {}), { ok: true, count: 0 });
    console.log("   ✓ 授權名單驗證通過！\n");
  }

  console.log("13. 未支援的 action 應回傳明確錯誤...");
  {
    const { mock } = createMock();
    assert.deepStrictEqual(await mock.handle("unknownAction"), {
      ok: false,
      error: "unknown_mock_action",
      message: "Mock 未支援 action：unknownAction"
    });
    console.log("   ✓ 未知 action 驗證通過！\n");
  }

  console.log("14. 不同 Mock 實例的狀態應彼此隔離...");
  {
    const first = createMock();
    const second = createMock();
    await first.mock.handle("saveWhitelist", { accounts: [] });
    const firstAccounts = await first.mock.handle("getAccounts");
    const secondAccounts = await second.mock.handle("getAccounts");
    assert.strictEqual(firstAccounts.accounts.length, 0);
    assert.strictEqual(secondAccounts.accounts.length, 2);
    console.log("   ✓ 狀態隔離驗證通過！\n");
  }

  console.log("15. ?mock=true 相容：前端 API 客戶端應可直接使用 Mock...");
  {
    const { mock } = createMock();
    let received = null;
    const api = apiModule.createApiClient({
      config: { storageKey: "gas_tmpl.session.v1", apiUrl: "", mock: true },
      storage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
      getMock: function () {
        return mock;
      }
    });
    const result = await api.call("ping", { source: "mock-compat" });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.version, "1.1.0-mock");
    received = result;
    assert(received.pong > 0);
    console.log("   ✓ 離線模式相容驗證通過！\n");
  }

  console.log("16. getCourseIndexStats 應回傳輕量總筆數...");
  {
    const { mock } = createMock();
    assert.deepStrictEqual(await mock.handle("getCourseIndexStats"), { ok: true, total: 4 });
    await mock.handle("importCourseCodes", {
      rows: [["114", "1", "1", "114", "C1", "科目", "群", "科", "類", "式", "屬", "必", "1", "1"]],
      preNormalized: true
    });
    assert.deepStrictEqual(await mock.handle("getCourseIndexStats"), { ok: true, total: 1 });
    console.log("   ✓ 輕量統計 Mock 驗證通過！\n");
  }

  console.log("17. getActivityLog 應回傳示範日誌並支援分頁與篩選...");
  {
    const { mock } = createMock();
    const all = await mock.handle("getActivityLog", {
      startDate: "2000-01-01",
      endDate: "2099-12-31"
    });
    assert.strictEqual(all.ok, true);
    assert(all.rows.length >= 3, "應內建至少三筆示範日誌");
    assert.strictEqual(all.total, all.rows.length);
    assert.strictEqual(all.page, 1);
    assert.strictEqual(all.pageSize, 50);
    all.rows.forEach(function (row) {
      assert(row.timestamp && row.requestId && row.action, "每筆日誌應具備必要欄位");
      assert(row.detail && typeof row.detail === "string", "詳情應為 JSON 字串");
      JSON.parse(row.detail);
    });

    const paged = await mock.handle("getActivityLog", {
      startDate: "2000-01-01",
      endDate: "2099-12-31",
      page: 2,
      pageSize: 2
    });
    assert.strictEqual(paged.rows.length, all.rows.length - 2);
    assert.strictEqual(paged.page, 2);
    assert.strictEqual(paged.pageSize, 2);

    const byCategory = await mock.handle("getActivityLog", {
      startDate: "2000-01-01",
      endDate: "2099-12-31",
      category: "auth"
    });
    assert(byCategory.rows.length >= 1);
    byCategory.rows.forEach(function (row) {
      assert.strictEqual(row.category, "auth");
    });

    const byEmail = await mock.handle("getActivityLog", {
      startDate: "2000-01-01",
      endDate: "2099-12-31",
      email: "teacher@example.com"
    });
    assert.strictEqual(byEmail.rows.length, 1);
    assert.strictEqual(byEmail.rows[0].result, "failure");
    assert.strictEqual(byEmail.rows[0].errorCode, "forbidden");

    const outOfRange = await mock.handle("getActivityLog", {
      startDate: "2000-01-01",
      endDate: "2000-01-02"
    });
    assert.strictEqual(outOfRange.rows.length, 0);
    assert.strictEqual(outOfRange.total, 0);
    console.log("   ✓ 示範日誌、分頁與篩選驗證通過！\n");
  }

  console.log("18. getActivityLog 分頁上限應限制為 500...");
  {
    const { mock } = createMock();
    const result = await mock.handle("getActivityLog", {
      startDate: "2000-01-01",
      endDate: "2099-12-31",
      pageSize: 9999
    });
    assert.strictEqual(result.pageSize, 500);
    console.log("   ✓ 分頁上限驗證通過！\n");
  }

  console.log("✓ webapp/js/mock.js 測試全數通過！\n");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
