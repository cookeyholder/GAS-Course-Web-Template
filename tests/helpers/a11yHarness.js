"use strict";

/**
 * @file a11yHarness.js
 * @description 以 jsdom 承載既有前端模板，產生 axe-core 無障礙稽核所需的畫面夾具。
 *
 * 直接使用 webapp/index.html 去除 GAS 模板標記與外部資源，確保 skip link、
 * live region 容器等骨架與正式頁面一致；再由各模組工廠渲染實際畫面。
 */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const configModule = require("../../webapp/js/config.js");
const uiModule = require("../../webapp/js/ui.js");
const coursesModule = require("../../webapp/js/courses.js");
const accountsModule = require("../../webapp/js/accounts.js");
const importsModule = require("../../webapp/js/imports.js");
const activityLogModule = require("../../webapp/js/activityLog.js");
const appModule = require("../../webapp/js/app.js");
const safeErrors = require("./safeErrorsDeps.js").safeErrors;

const INDEX_PATH = path.join(__dirname, "..", "..", "webapp", "index.html");

const ADMIN_USER = {
  name: "測試管理員",
  email: "admin@example.edu.tw",
  role: "admin",
  roleName: "系統管理員"
};

const COURSE_ROW = {
  academicYear: "114",
  semester: "1",
  grade: "一年級",
  courseCode: "ABC123",
  subjectName: "測試課程",
  department: "通用",
  subjectType: "一般",
  attribute: "專業",
  required: "必修",
  credits: "2",
  hours: "2"
};

const PREVIEW_ENTRY = {
  fileName: "課程代碼.xlsx",
  sheetName: "課綱寬表",
  fileSize: 20480,
  stats: { sourceRows: 10, expandedRows: 60 },
  sample: [["114", "1", "1", "", "科目一", "", "通用", "", "", "", "專業", "必修", "2"]]
};

/**
 * 建立 jsdom 文件，並以指定的主題載入 webapp/index.html 骨架。
 *
 * @param {string} [theme] - light 或 dark
 * @returns {Object} JSDOM 實例
 */
function createDocumentHtml(theme) {
  const raw = fs.readFileSync(INDEX_PATH, "utf8");
  return raw
    .replace(/<\?!=[\s\S]*?\?>/g, "")
    .replace(/<!--\s*\/?BUILD:[A-Z]+\s*-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<link\b[^>]*>/gi, "")
    .replace('data-theme="light"', 'data-theme="' + (theme === "dark" ? "dark" : "light") + '"');
}

function createA11yDocument(theme) {
  return new JSDOM(createDocumentHtml(theme), { url: "https://example.test/", pretendToBeVisual: true });
}

/**
 * 在既有 JSDOM 實例中重設頁面骨架，避免 axe-core 與不同 window 實例衝突。
 *
 * @param {Object} dom - JSDOM 實例
 * @param {string} theme - light 或 dark
 * @returns {Object} document 物件
 */
function resetDocument(dom, theme) {
  const doc = dom.window.document;
  doc.open();
  doc.write(createDocumentHtml(theme));
  doc.close();
  return doc;
}

/**
 * 建立完整前端模組與控制器，供模板渲染與互動夾具使用。
 *
 * @param {Object} dom - JSDOM 實例
 * @param {Object} [stateOverrides] - 疊加至 MEA.state 的欄位
 * @returns {Object} MEA、控制器與文件資源
 */
function createFrontend(dom, stateOverrides) {
  const win = dom.window;
  const doc = win.document;
  const config = configModule.buildFrontendConfig({
    search: "",
    protocol: "https:",
    hostname: "example.test",
    href: "https://example.test/"
  });
  const MEA = {
    config: config,
    safeErrors: safeErrors,
    state: Object.assign(
      {
        view: "ready",
        tab: "overview",
        user: ADMIN_USER,
        publicConfig: { systemName: "測試系統" },
        loginError: "",
        loginBusy: false,
        logoutBusy: false,
        courses: { list: [], page: 1, pageSize: 30, total: 0 },
        settings: { data: {}, accounts: [], loading: false, saving: false },
        imports: {},
        importBusy: false,
        activityLog: {
          list: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          startDate: "2026-11-13",
          endDate: "2026-11-19",
          email: "",
          category: "",
          loading: false,
          expanded: {}
        }
      },
      stateOverrides || {}
    ),
    courseData: require("../../webapp/js/courseData.js"),
    setState: function (patch) {
      Object.assign(MEA.state, patch);
    },
    subscribe: function () {},
    api: {
      call: function () {
        return Promise.resolve({ ok: true });
      }
    },
    auth: {
      isGasHosted: function () {
        return false;
      }
    }
  };

  MEA.ui = uiModule.createUiModule({
    MEA: MEA,
    window: win,
    document: doc,
    setTimeoutFn: function () {
      return 0;
    }
  });
  MEA.courses = coursesModule.createCoursesModule({ MEA: MEA, document: doc });
  MEA.accounts = accountsModule.createAccountsModule({ MEA: MEA, document: doc });
  MEA.imports = importsModule.createImportsModule({ MEA: MEA, window: win, document: doc });
  MEA.activityLog = activityLogModule.createActivityLogModule({ MEA: MEA, document: doc });

  const app = appModule.createAppController({
    MEA: MEA,
    document: doc,
    window: win,
    setTimeoutFn: function () {
      return 0;
    }
  });
  MEA.setTab = app.setTab;

  return { MEA: MEA, app: app, window: win, document: doc };
}

/**
 * 產生所有稽核夾具，每種畫面與狀態皆有淺色與深色版本。
 *
 * @returns {Array<Object>} 夾具清單
 */
function collectFixtures() {
  const activityLogRow = {
    timestamp: "2026-11-19 10:00:00",
    requestId: "req-001",
    category: "write",
    action: "儲存系統設定",
    result: "success",
    email: "admin@example.edu.tw",
    name: "測試管理員",
    role: "系統管理員",
    summary: "儲存系統設定",
    detail: '{"版本":1,"動作":"saveSystemSettings","指標":{},"變動":[]}',
    durationMs: 12,
    errorCode: ""
  };

  const definitions = [
    { name: "login", state: { view: "login" } },
    { name: "login-error", state: { view: "login", loginError: "工作階段已過期，請重新登入" } },
    { name: "loading", state: { view: "loading" } },
    { name: "overview", state: { view: "ready", tab: "overview" } },
    { name: "import", state: { view: "ready", tab: "import" } },
    {
      name: "courses",
      state: {
        view: "ready",
        tab: "courses",
        courses: { list: [COURSE_ROW], page: 1, pageSize: 30, total: 1 }
      }
    },
    {
      name: "settings",
      state: {
        view: "ready",
        tab: "settings",
        settings: {
          data: { systemName: "測試系統", schoolYear: "114", semester: "1", clientId: "", allowedLoginDomain: "" },
          accounts: [
            { email: "admin@example.edu.tw", name: "測試管理員", role: "admin", roleName: "系統管理員", enabled: true }
          ],
          loading: false,
          saving: false
        }
      }
    },
    {
      name: "activity-log",
      state: {
        view: "ready",
        tab: "activityLog",
        activityLog: {
          list: [activityLogRow],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          startDate: "2026-11-13",
          endDate: "2026-11-19",
          email: "",
          category: "",
          loading: false,
          expanded: {}
        }
      }
    },
    {
      name: "activity-log-expanded",
      state: {
        view: "ready",
        tab: "activityLog",
        activityLog: {
          list: [activityLogRow],
          total: 1,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          startDate: "2026-11-13",
          endDate: "2026-11-19",
          email: "",
          category: "",
          loading: false,
          expanded: { "req-001": true }
        }
      }
    },
    {
      name: "activity-log-empty",
      state: {
        view: "ready",
        tab: "activityLog",
        activityLog: {
          list: [],
          total: 0,
          page: 1,
          pageSize: 50,
          totalPages: 1,
          startDate: "2026-11-13",
          endDate: "2026-11-19",
          email: "",
          category: "",
          loading: false,
          expanded: {}
        }
      }
    },
    {
      name: "activity-log-guard",
      state: {
        view: "ready",
        tab: "activityLog",
        user: { email: "viewer@example.edu.tw", role: "viewer", roleName: "檢視人員" }
      }
    },
    {
      name: "forbidden",
      state: { view: "ready", tab: "settings", user: { email: "viewer@example.edu.tw", role: "viewer" } }
    },
    { name: "modal", state: { view: "ready", tab: "settings" }, setup: "addAccountPrompt" },
    {
      name: "import-preview",
      state: { view: "ready", tab: "import", imports: { courseCodes: PREVIEW_ENTRY } }
    }
  ];

  const fixtures = [];
  ["light", "dark"].forEach(function (theme) {
    definitions.forEach(function (definition) {
      fixtures.push({
        name: definition.name,
        theme: theme,
        state: definition.state,
        setup: definition.setup || null
      });
    });
  });
  return fixtures;
}

module.exports = {
  INDEX_PATH: INDEX_PATH,
  ADMIN_USER: ADMIN_USER,
  COURSE_ROW: COURSE_ROW,
  PREVIEW_ENTRY: PREVIEW_ENTRY,
  createDocumentHtml: createDocumentHtml,
  createA11yDocument: createA11yDocument,
  resetDocument: resetDocument,
  createFrontend: createFrontend,
  collectFixtures: collectFixtures
};
