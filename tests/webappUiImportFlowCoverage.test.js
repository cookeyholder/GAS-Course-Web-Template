"use strict";

/**
 * webapp/js/ui.js、imports.js、api.js、app.js 整合流程測試（G7.19）。
 * 驗證 Mock 模式下登入、匯入頁籤、檔案解析、寫入、課程清單與概覽頁面的資料流可回歸。
 */

const assert = require("assert");
const uiModule = require("../webapp/js/ui.js");
const importsModule = require("../webapp/js/imports.js");
const apiModule = require("../webapp/js/api.js");
const appModule = require("../webapp/js/app.js");
const helpers = require("./helpers/importsUiDeps.js");

console.log("開始執行前端頁面與匯入流程整合測試...\n");

function flush() {
  return new Promise(function (resolve) {
    setImmediate(resolve);
  });
}

function buildContext() {
  const bundle = helpers.createDocument();
  const calls = {
    setState: [],
    toasts: [],
    mockActions: [],
    fetchList: [],
    timeouts: [],
    renderGoogleButton: 0,
    fileReads: []
  };
  bundle.elements.app = helpers.createElement("div");
  bundle.elements.toastHost = helpers.createElement("div");
  bundle.elements.modalHost = helpers.createElement("div");
  bundle.elements.uploadDropzone = helpers.createElement("div");
  bundle.elements.fileInput = helpers.createElement("input");

  const win = helpers.createWindow(bundle.doc, calls);
  win.FileReader = helpers.createFakeFileReader(calls);
  win.XLSX = helpers.makeXlsx({ 其他: { rows: [["隨意"]] } });

  const state = {
    view: "app",
    tab: "import",
    user: { name: "管理員", email: "admin@example.edu.tw", role: "admin", roleName: "系統管理員", perms: ["*"] },
    publicConfig: { systemName: "整合測試系統", schoolYear: "114", semester: "1", clientId: "mock-client" },
    loginError: "",
    loginBusy: false,
    importBusy: false,
    imports: {},
    importLast: null,
    courses: { list: [], total: 0, page: 1, pageSize: 30, totalPages: 1 }
  };
  const config = {
    title: "測試系統",
    version: "1.0.0",
    mock: true,
    themeKey: "gas_tmpl.theme.v1",
    styleKey: "gas_tmpl.style.v1",
    defaultStyle: "modern-slate",
    styles: [
      { id: "modern-slate", name: "極簡曜藍", icon: "✨" },
      { id: "paper", name: "紙張風格", icon: "📄" }
    ],
    tabs: [
      { id: "overview", name: "概覽", icon: "📊" },
      { id: "import", name: "匯入", icon: "📥" }
    ],
    roleNames: { admin: "系統管理員" }
  };

  const MEA = {
    state: state,
    config: config,
    setState: function (patch) {
      Object.assign(state, patch);
      calls.setState.push(Object.assign({}, patch));
    },
    courseData: {
      normalizeCourseCodes: function (rows) {
        return {
          rows: rows.map(function (row, index) {
            return [
              "114",
              "1",
              "1",
              "C" + (index + 1),
              String(row[1] || "科目"),
              "科別",
              "必修",
              "2",
              "2",
              "",
              "一般",
              "3",
              "0"
            ];
          }),
          stats: { sourceRows: rows.length, keptCourseRows: rows.length, expandedRows: rows.length * 6 }
        };
      }
    },
    mock: {
      handle: function (action, body) {
        calls.mockActions.push({ action: action, body: body });
        if (action === "importCourseCodes") return Promise.resolve({ ok: true, saved: true });
        return Promise.resolve({ ok: true, mock: true, systemName: "整合測試系統" });
      }
    },
    auth: {
      isGasHosted: function () {
        return false;
      },
      loginMock: function () {},
      renderGoogleButton: function () {
        calls.renderGoogleButton++;
      },
      logout: function () {}
    }
  };

  MEA.api = apiModule.createApiClient({
    config: config,
    storage: helpers.createLocalStorage(),
    getMock: function () {
      return MEA.mock;
    },
    fetchFn: function () {
      throw new Error("Mock 模式不應使用 fetch");
    },
    setTimeoutFn: function (fn) {
      fn();
    }
  });

  MEA.ui = uiModule.createUiModule({
    MEA: MEA,
    window: win,
    document: bundle.doc,
    setTimeoutFn: function (fn, ms) {
      calls.timeouts.push({ fn: fn, ms: ms });
    }
  });

  MEA.imports = importsModule.createImportsModule({
    MEA: MEA,
    window: win,
    document: bundle.doc,
    FileReader: win.FileReader
  });

  MEA.courses = {
    fetchList: function (page) {
      calls.fetchList.push(page);
      MEA.setState({
        courses: Object.assign({}, state.courses, {
          total: 42,
          list: [{ courseCode: "C001", subjectName: "數學" }],
          page: page
        })
      });
    },
    renderView: function () {
      return '<div id="courses-view">課程索引</div>';
    }
  };
  MEA.accounts = {
    loadSettingsAndAccounts: function () {},
    renderView: function () {
      return '<div id="settings-view">系統設定</div>';
    }
  };
  MEA.setTab = function (tab) {
    MEA.setState({ tab: tab });
  };
  MEA.subscribe = function () {};

  const app = appModule.createAppController({
    MEA: MEA,
    document: bundle.doc,
    window: win,
    setTimeoutFn: function (fn) {
      fn();
    }
  });

  return {
    MEA: MEA,
    state: state,
    config: config,
    calls: calls,
    doc: bundle.doc,
    elements: bundle.elements,
    win: win,
    app: app
  };
}

async function run() {
  assert.strictEqual(typeof apiModule.createApiClient, "function", "應可使用 API 模組");
  assert.strictEqual(typeof appModule.createAppController, "function", "應可使用應用程式控制器");
  console.log("1. 整合所需模組皆可載入 ✓\n");

  const ctx = buildContext();
  const configResult = await ctx.MEA.api.requestOnce("getPublicConfig", {});
  assert.strictEqual(configResult.ok, true);
  assert.strictEqual(configResult.mock, true);
  assert.strictEqual(ctx.calls.mockActions[0].action, "getPublicConfig");
  console.log("2. Mock 模式 API 分流正常，未使用 fetch ✓\n");

  ctx.state.view = "login";
  ctx.app.render();
  assert(ctx.elements.app.innerHTML.indexOf("login-container") !== -1);
  assert(ctx.elements.app.innerHTML.indexOf("Mock Mode") !== -1);
  assert.strictEqual(ctx.calls.renderGoogleButton, 1);
  console.log("3. 登入畫面於 Mock 模式可渲染並掛載按鈕 ✓\n");

  ctx.state.view = "app";
  ctx.state.tab = "import";
  ctx.app.render();
  assert(ctx.elements.app.innerHTML.indexOf('id="uploadDropzone"') !== -1);
  assert(ctx.elements.app.innerHTML.indexOf('<header class="app-header">') !== -1);
  assert(ctx.elements.app.innerHTML.indexOf('<nav class="app-nav">') !== -1);
  console.log("4. 匯入頁籤與頁首、導覽列外殼可渲染 ✓\n");

  const preventDefaultCalls = { count: 0 };
  const event = {
    preventDefault: function () {
      preventDefaultCalls.count++;
    }
  };
  ctx.MEA.imports.handleDragOver(event);
  assert.strictEqual(ctx.elements.uploadDropzone.classList.contains("dragover"), true);
  ctx.MEA.imports.handleDragLeave(event);
  assert.strictEqual(ctx.elements.uploadDropzone.classList.contains("dragover"), false);
  assert.strictEqual(preventDefaultCalls.count, 2);
  console.log("5. 拖曳進入與離開事件可切換樣式 ✓\n");

  ctx.win.XLSX = helpers.makeXlsx({
    其他: { rows: [["隨意"]] },
    "108課綱": {
      rows: [
        ["課程代碼", "科目名稱"],
        ["C001", "數學"]
      ]
    }
  });
  const file = { name: "108課綱.xlsx", size: 2048, buffer: [1, 2, 3] };
  const entry = await ctx.MEA.imports.previewFile(file);
  await flush();
  assert.strictEqual(entry.sheetName, "108課綱");
  assert.strictEqual(entry.stats.expandedRows, 12);
  assert.strictEqual(ctx.state.importBusy, false);
  assert(
    ctx.elements.toastHost.children.some(function (item) {
      return item.children[1] && item.children[1].textContent.indexOf("解析完成") !== -1;
    })
  );
  ctx.app.render();
  assert(ctx.elements.app.innerHTML.indexOf("檔案解析預覽：108課綱.xlsx") !== -1);
  assert(ctx.elements.app.innerHTML.indexOf("確認匯入至試算表") !== -1);
  console.log("6. 檔案解析、1NF 預覽與頁籤重新渲染 ✓\n");

  await ctx.MEA.imports.doImport();
  await flush();
  assert.strictEqual(ctx.state.importBusy, false);
  assert.strictEqual(ctx.state.imports.courseCodes.imported, true);
  assert.strictEqual(ctx.state.importLast.saved, true);
  assert.deepStrictEqual(ctx.calls.fetchList, [1]);
  assert(
    ctx.calls.mockActions.some(function (item) {
      return item.action === "importCourseCodes" && item.body.preNormalized === true;
    })
  );
  console.log("7. 匯入寫入走 Mock API 並觸發課程清單重載 ✓\n");

  ctx.app.render();
  assert(ctx.elements.app.innerHTML.indexOf("✓ 已匯入完成") !== -1);

  ctx.MEA.setTab("courses");
  ctx.app.render();
  assert(ctx.elements.app.innerHTML.indexOf("courses-view") !== -1);

  ctx.MEA.setTab("overview");
  ctx.app.render();
  assert(ctx.elements.app.innerHTML.indexOf("整合測試系統") !== -1);
  assert(ctx.elements.app.innerHTML.indexOf("42") !== -1);
  assert.strictEqual(ctx.doc.title, "整合測試系統");
  console.log("8. 匯入完成、課程索引與概覽統計可回歸 ✓\n");

  console.log("✓ 前端頁面與匯入流程整合測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
