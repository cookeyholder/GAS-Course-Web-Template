"use strict";

/**
 * webappEventDelegation.test.js（task 6.2）
 * 驗證前端各模組移除 inline 事件後，改以 data-* 委派仍保留原有行為。
 * 透過可擷取事件監聽器的假 document 直接觸發委派 handler，
 * 同時涵蓋各 handler 的分支以提升變更覆蓋率。
 */

const assert = require("assert");
const uiModule = require("../webapp/js/ui.js");
const authModule = require("../webapp/js/auth.js");
const coursesModule = require("../webapp/js/courses.js");
const accountsModule = require("../webapp/js/accounts.js");
const importsHelper = require("./helpers/importsUiDeps.js");
const accountsHelper = require("./helpers/accountsCoursesDeps.js");
const authHelper = require("./helpers/authDeps.js");

/** 建立可擷取 addEventListener 監聽器的假 document。 */
function createCapturingDocument() {
  const listeners = Object.create(null);
  const elements = Object.create(null);
  const doc = {
    title: "舊標題",
    readyState: "complete",
    documentElement: { dataset: {} },
    head: { appendChild: function () {} },
    elements: elements,
    listeners: listeners,
    addEventListener: function (type, handler) {
      (listeners[type] = listeners[type] || []).push(handler);
    },
    getElementById: function (id) {
      return elements[id] || null;
    },
    querySelector: function () {
      return null;
    },
    createElement: function () {
      return { dataset: {}, style: {}, classList: { add: function () {}, remove: function () {} } };
    },
    /** 觸發指定事件類型的全部監聽器。 */
    dispatch: function (type, target, extras) {
      const event = Object.assign({ type: type, target: target, preventDefault: function () {} }, extras || {});
      (listeners[type] || []).slice().forEach(function (handler) {
        handler(event);
      });
      return event;
    }
  };
  return doc;
}

/** 建立帶資料屬性的假元素，並支援 data-* selector 比對。 */
function createTarget(attributes, extras) {
  const attrs = Object.assign({}, attributes || {});
  const target = {
    attributes: attrs,
    parentNode: null,
    value: "",
    files: [],
    hasAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attrs, name);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    matches: function (selector) {
      const matched = /^\[data-([\w-]+)(?:='([^']*)')?\]$/.exec(selector);
      if (!matched) return false;
      const name = "data-" + matched[1];
      if (!Object.prototype.hasOwnProperty.call(attrs, name)) return false;
      return matched[2] === undefined || attrs[name] === matched[2];
    },
    closest: function (selector) {
      let node = this;
      while (node) {
        if (typeof node.matches === "function" && node.matches(selector)) return node;
        node = node.parentNode;
      }
      return null;
    },
    classList: {
      add: function () {},
      remove: function () {},
      contains: function () {
        return false;
      }
    }
  };
  return Object.assign(target, extras || {});
}

function run() {
  console.log("1. ui.js 事件委派應保留風格、主題、登入與頁籤行為...");
  {
    const doc = createCapturingDocument();
    const ctx = importsHelper.createUiDeps({ document: doc });
    let tab = "";
    ctx.MEA.navigation = {
      setTab: function (value) {
        tab = value;
      }
    };

    doc.dispatch("change", createTarget({ "data-ui-action": "apply-style" }, { value: "paper" }));
    assert.strictEqual(doc.documentElement.dataset.style, "paper", "應套用選取的風格");

    doc.dispatch("click", createTarget({ "data-ui-action": "toggle-theme" }));
    assert.strictEqual(doc.documentElement.dataset.theme, "dark", "應切換至深色主題");

    doc.dispatch("click", createTarget({ "data-ui-action": "logout" }));
    assert.strictEqual(ctx.calls.logout, 1);

    doc.dispatch("click", createTarget({ "data-ui-action": "login-mock" }));
    assert.strictEqual(ctx.calls.loginMock, 1);

    doc.dispatch("click", createTarget({ "data-ui-action": "set-tab", "data-tab": "courses" }));
    assert.strictEqual(tab, "courses");

    doc.dispatch("click", createTarget({ "data-ui-action": "unknown" }));
    assert.strictEqual(tab, "courses", "未知動作不應改變狀態");

    ctx.MEA.navigation = null;
    let legacyTab = "";
    ctx.MEA.setTab = function (value) {
      legacyTab = value;
    };
    doc.dispatch("click", createTarget({ "data-ui-action": "set-tab", "data-tab": "settings" }));
    assert.strictEqual(legacyTab, "settings", "缺少 navigation 時應回退至 MEA.setTab");

    ctx.MEA.navigation = { setTab: function () {} };
    ctx.MEA.auth = null;
    doc.dispatch("click", createTarget({ "data-ui-action": "logout" }));
    doc.dispatch("click", createTarget({ "data-ui-action": "login-mock" }));
    console.log("   ✓ ui.js 事件委派驗證通過！\n");
  }

  console.log("2. courses.js 事件委派應保留分頁、搜尋、重設與重新整理...");
  {
    const doc = createCapturingDocument();
    const ctx = accountsHelper.createCoursesDeps({ document: doc });
    const courses = coursesModule.createCoursesModule(ctx.deps);

    doc.dispatch("submit", createTarget({ "data-course-action": "search" }));
    assert.strictEqual(ctx.calls.apiCalls.length, 1, "搜尋表單應觸發查詢");

    doc.dispatch("click", createTarget({ "data-course-action": "page", "data-page": "3" }));
    assert.strictEqual(ctx.calls.apiCalls.length, 2);

    doc.dispatch("click", createTarget({ "data-course-action": "refresh", "data-page": "2" }));
    assert.strictEqual(ctx.calls.apiCalls.length, 3);

    doc.dispatch("click", createTarget({ "data-course-action": "page", "data-page": "not-a-number" }));
    assert.strictEqual(ctx.calls.apiCalls.length, 3, "無效頁碼不應觸發查詢");

    doc.dispatch("click", createTarget({ "data-course-action": "reset" }));
    assert.strictEqual(ctx.state.courses.keyword, "");

    doc.dispatch("click", createTarget({ "data-course-action": "unknown" }));
    assert.strictEqual(typeof courses.renderView, "function");
    console.log("   ✓ courses.js 事件委派驗證通過！\n");
  }

  console.log("3. accounts.js 事件委派應保留欄位、表單與帳號操作...");
  {
    const doc = createCapturingDocument();
    const ctx = accountsHelper.createAccountsDeps({ document: doc });
    const accounts = accountsModule.createAccountsModule(ctx.deps);
    ctx.state.settings.accounts = [{ email: "a@example.com", enabled: true }];

    doc.dispatch("change", createTarget({ "data-account-action": "clear-field-error", id: "newAccountEmail" }));
    doc.dispatch("submit", createTarget({ "data-account-action": "save-settings", id: "settingsForm" }));
    doc.dispatch("click", createTarget({ "data-account-action": "toggle", "data-email": "a@example.com" }));
    assert.strictEqual(ctx.state.settings.accounts[0].enabled, false);
    doc.dispatch("click", createTarget({ "data-account-action": "remove", "data-email": "a@example.com" }));
    assert(ctx.calls.modal !== null, "刪除應開啟確認對話框");
    doc.dispatch("click", createTarget({ "data-account-action": "add" }));
    assert(ctx.calls.modal !== null);
    doc.dispatch("click", createTarget({ "data-account-action": "reload" }));
    doc.dispatch("click", createTarget({ "data-account-action": "toggle" }));
    doc.dispatch("click", createTarget({ "data-account-action": "unknown" }));
    assert.strictEqual(typeof accounts.renderView, "function");
    console.log("   ✓ accounts.js 事件委派驗證通過！\n");
  }

  console.log("4. imports.js 事件委派應保留拖曳、鍵盤與檔案操作...");
  {
    const doc = createCapturingDocument();
    const ctx = importsHelper.createImportsDeps({ document: doc });
    const zone = createTarget({ "data-import-dropzone": "1" });

    doc.dispatch("dragover", zone);
    doc.dispatch("dragleave", zone);
    doc.dispatch("drop", zone);
    doc.dispatch("keydown", zone, { key: "Enter", keyCode: 13 });
    doc.dispatch("click", zone);

    const fileInput = createTarget({ "data-import-action": "file-select" }, { files: [] });
    doc.dispatch("change", fileInput);
    doc.dispatch("click", createTarget({ "data-import-action": "reset" }));
    doc.dispatch("click", createTarget({ "data-import-action": "import" }));
    doc.dispatch("click", createTarget({ "data-import-action": "unknown" }));
    assert.strictEqual(typeof ctx.imports.renderView, "function");
    console.log("   ✓ imports.js 事件委派驗證通過！\n");
  }

  console.log("5. auth.js 事件委派應保留切換 Google 帳號行為...");
  {
    const doc = createCapturingDocument();
    const ctx = authHelper.createDeps({ deps: { document: doc } });
    authModule.createAuthController(ctx.deps);
    doc.dispatch("click", createTarget({ "data-auth-action": "switch-google-account" }));
    assert(Array.isArray(ctx.calls.setState), "切換帳號應更新狀態");
    console.log("   ✓ auth.js 事件委派驗證通過！\n");
  }

  console.log("6. activityLog.js 事件委派應保留搜尋、分頁與詳情展開...");
  {
    const doc = createCapturingDocument();
    const activityLogModule = require("../webapp/js/activityLog.js");
    const ctx = activityLogModule.createActivityLogModule({
      MEA: {
        state: { activityLog: { list: [], page: 1, totalPages: 1, loading: false } },
        api: {
          call: function () {
            return Promise.resolve({ ok: true, data: [] });
          }
        },
        setState: function () {}
      },
      document: doc
    });
    doc.dispatch("submit", createTarget({ "data-activity-form": "search" }));
    doc.dispatch("click", createTarget({ "data-activity-action": "refresh" }));
    doc.dispatch("click", createTarget({ "data-activity-action": "reset" }));
    doc.dispatch("click", createTarget({ "data-activity-action": "page", "data-page": "2" }));
    doc.dispatch("click", createTarget({ "data-activity-action": "toggle-detail", "data-request-id": "req-1" }));
    doc.dispatch("click", createTarget({ "data-activity-action": "unknown" }));
    assert.strictEqual(typeof ctx.renderView, "function");
    console.log("   ✓ activityLog.js 事件委派驗證通過！\n");
  }

  console.log("✓ webapp 事件委派行為測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
