/**
 * @file mock.js
 * @description 本機離線開發與展示用之 Mock API 模擬器
 */
(function (root, factory) {
  "use strict";

  const mockApi = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    MEA.mock = mockApi.createMockApi({
      window: window,
      setTimeoutFn: function (fn, ms) {
        return window.setTimeout(fn, ms);
      },
      nowFn: function () {
        return Date.now();
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = mockApi;
  }
})(typeof window !== "undefined" ? window : typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const MOCK_DELAY_MS = 150;

  /**
   * 建立獨立的 Mock API 實例，狀態不與其他實例共用。
   *
   * @param {Object} [deps] - 可注入的瀏覽器與計時依賴
   * @returns {{handle: Function}} Mock API 介面
   */
  function createMockApi(deps) {
    const options = deps || {};
    const mockWindow = options.window || (typeof window !== "undefined" ? window : null);
    const setTimeoutFn =
      typeof options.setTimeoutFn === "function"
        ? options.setTimeoutFn
        : function (fn, ms) {
            return setTimeout(fn, ms);
          };
    const nowFn =
      typeof options.nowFn === "function"
        ? options.nowFn
        : function () {
            return Date.now();
          };

    const mockSettings = {
      systemName: "Google Apps Script 應用程式範本 (Mock Mode)",
      schoolYear: "114",
      semester: "1",
      clientId: "mock-client-id.apps.googleusercontent.com",
      clientSecret: "",
      restrictWhitelist: false,
      allowedLoginDomain: ""
    };

    const mockAccounts = [
      { email: "admin@example.com", name: "測試管理員", role: "admin", roleName: "系統管理員", enabled: true },
      { email: "teacher@example.com", name: "測試教師", role: "staff", roleName: "業務人員", enabled: true }
    ];

    let mockCoursesList = [
      {
        academicYear: "114",
        semester: "1",
        grade: "1",
        entryYear: "114",
        courseCode: "305101A",
        subjectName: "程式設計實習Ⅰ",
        group: "電機與電子群",
        department: "資訊科",
        subjectType: "部定必修",
        openWay: "原班級",
        attribute: "實習科目",
        required: "必修",
        credits: "3",
        hours: "3"
      },
      {
        academicYear: "114",
        semester: "1",
        grade: "1",
        entryYear: "114",
        courseCode: "308102B",
        subjectName: "基本電學Ⅰ",
        group: "電機與電子群",
        department: "電機科",
        subjectType: "部定必修",
        openWay: "原班級",
        attribute: "專業科目",
        required: "必修",
        credits: "3",
        hours: "3"
      },
      {
        academicYear: "114",
        semester: "1",
        grade: "2",
        entryYear: "113",
        courseCode: "301201C",
        subjectName: "機械製造Ⅱ",
        group: "機械群",
        department: "機械科",
        subjectType: "部定必修",
        openWay: "原班級",
        attribute: "專業科目",
        required: "必修",
        credits: "2",
        hours: "2"
      },
      {
        academicYear: "114",
        semester: "1",
        grade: "3",
        entryYear: "112",
        courseCode: "311301D",
        subjectName: "工程力學Ⅱ",
        group: "土木與建築群",
        department: "建築科",
        subjectType: "部定必修",
        openWay: "原班級",
        attribute: "專業科目",
        required: "必修",
        credits: "3",
        hours: "3"
      }
    ];

    function buildLoginPayload() {
      return {
        ok: true,
        token: "mock_session_token_" + nowFn(),
        csrfToken: "mock_csrf_" + nowFn(),
        expiresIn: 21600,
        email: "admin@example.com",
        name: "測試管理員",
        role: "admin",
        roleName: "系統管理員",
        perms: ["*"]
      };
    }

    function createPublicConfig() {
      return {
        ok: true,
        version: "1.1.0-mock",
        systemName: mockSettings.systemName,
        schoolYear: mockSettings.schoolYear,
        semester: mockSettings.semester,
        clientId: mockSettings.clientId,
        hasClientSecret: Boolean(mockSettings.clientSecret),
        allowedDomain: String(mockSettings.allowedLoginDomain || "")
          .trim()
          .replace(/^@/, "")
          .toLowerCase(),
        activeEmail: "admin@example.com",
        webAppUrl: (mockWindow && mockWindow.location && mockWindow.location.href) || ""
      };
    }

    function createSession(payload) {
      return {
        ok: true,
        email: "admin@example.com",
        name: "測試管理員",
        role: "admin",
        roleName: "系統管理員",
        perms: ["*"],
        csrfToken: payload && payload.csrfToken ? payload.csrfToken : "mock_csrf_token"
      };
    }

    function importCourseCodes(payload) {
      if (payload && Array.isArray(payload.rows)) {
        mockCoursesList = payload.rows.map(function (r) {
          return {
            academicYear: r[0],
            semester: r[1],
            grade: r[2],
            entryYear: r[3],
            courseCode: r[4],
            subjectName: r[5],
            group: r[6],
            department: r[7],
            subjectType: r[8],
            openWay: r[9],
            attribute: r[10],
            required: r[11],
            credits: r[12],
            hours: r[13]
          };
        });
      }
      return { ok: true, rows: mockCoursesList.length };
    }

    /**
     * 以與後端 getNormalizedCourses 相同的篩選與分頁規則查詢 mock 課程代碼。
     *
     * @param {Object} [payload] - 查詢條件
     * @returns {Object} `{ ok, list, total, page, pageSize, totalPages }`
     */
    function createCourseIndex(payload) {
      const source = payload || {};
      const keyword = String(source.keyword || "")
        .trim()
        .toLowerCase();
      const academicYear = String(source.academicYear || "").trim();
      const semester = String(source.semester || "").trim();
      const department = String(source.department || "").trim();
      const matched = mockCoursesList.filter(function (course) {
        if (academicYear !== "" && String(course.academicYear || "") !== academicYear) return false;
        if (semester !== "" && String(course.semester || "") !== semester) return false;
        if (department !== "" && String(course.department || "") !== department) return false;
        if (keyword === "") return true;
        const line = [course.courseCode, course.subjectName, course.department, course.group]
          .map(function (value) {
            return String(value || "");
          })
          .join(" ")
          .toLowerCase();
        return line.indexOf(keyword) !== -1;
      });
      const page = Math.max(1, parseInt(source.page, 10) || 1);
      const pageSize = Math.max(1, Math.min(200, parseInt(source.pageSize, 10) || 50));
      const total = matched.length;
      const totalPages = Math.ceil(total / pageSize) || 1;
      const start = (page - 1) * pageSize;
      return {
        ok: true,
        list: matched.slice(start, start + pageSize),
        total: total,
        page: page,
        pageSize: pageSize,
        totalPages: totalPages
      };
    }

    function createCourseIndexStats() {
      return { ok: true, total: mockCoursesList.length };
    }

    function createSystemSettings() {
      return { ok: true, settings: Object.assign({}, mockSettings) };
    }

    function saveSystemSettings(payload) {
      const incoming = (payload && payload.settings) || {};
      const mapped = Object.assign({}, incoming);
      if (typeof mapped.allowedLoginDomain === "undefined" && typeof incoming["Google 登入允許網域"] !== "undefined") {
        mapped.allowedLoginDomain = incoming["Google 登入允許網域"];
      }
      Object.assign(mockSettings, mapped);
      return { ok: true };
    }

    function createAccounts() {
      return { ok: true, accounts: mockAccounts.slice() };
    }

    function getActivityLog(payload) {
      const options = payload || {};
      return {
        ok: true,
        rows: [],
        total: 0,
        page: Number(options.page) || 1,
        pageSize: Number(options.pageSize) || 50
      };
    }

    function saveWhitelist(payload) {
      mockAccounts.length = 0;
      const incoming = payload && payload.accounts ? payload.accounts : [];
      incoming.forEach(function (account) {
        mockAccounts.push(account);
      });
      return { ok: true, count: mockAccounts.length };
    }

    const actionHandlers = {
      ping: function () {
        return { ok: true, pong: nowFn(), version: "1.1.0-mock" };
      },
      getPublicConfig: createPublicConfig,
      login: buildLoginPayload,
      loginWithActiveUser: buildLoginPayload,
      getSession: createSession,
      logout: function () {
        return { ok: true };
      },
      importCourseCodes: importCourseCodes,
      getCourseIndex: createCourseIndex,
      getCourseIndexStats: createCourseIndexStats,
      getSystemSettings: createSystemSettings,
      saveSystemSettings: saveSystemSettings,
      getAccounts: createAccounts,
      saveWhitelist: saveWhitelist,
      getActivityLog: getActivityLog
    };

    function createUnknownActionResult(action) {
      return { ok: false, error: "unknown_mock_action", message: "Mock 未支援 action：" + action };
    }

    const actionRegistry =
      options.actionRegistry ||
      (typeof globalThis !== "undefined" && globalThis.MEA && globalThis.MEA.actionRegistry) ||
      (typeof globalThis !== "undefined" && globalThis.actionRegistry) ||
      null;

    function resolveAction(action, payload) {
      if (actionRegistry && !actionRegistry.hasAction(action)) {
        return createUnknownActionResult(action);
      }
      if (!Object.prototype.hasOwnProperty.call(actionHandlers, action)) {
        return createUnknownActionResult(action);
      }
      return actionHandlers[action](payload);
    }

    function handle(action, payload) {
      return new Promise(function (resolve) {
        setTimeoutFn(function () {
          resolve(resolveAction(action, payload));
        }, MOCK_DELAY_MS);
      });
    }

    return { handle: handle };
  }

  return { createMockApi: createMockApi };
});
