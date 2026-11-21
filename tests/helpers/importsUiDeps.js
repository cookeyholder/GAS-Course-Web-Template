"use strict";

/**
 * @file importsUiDeps.js
 * @description webapp/js/imports.js 與 webapp/js/ui.js 測試共用的依賴模擬工廠。
 */

const uiModule = require("../../webapp/js/ui.js");
const safeErrors = require("./safeErrorsDeps.js").safeErrors;
const importsModule = require("../../webapp/js/imports.js");

/**
 * 簡化版 HTML 跳脫，供匯入模組測試驗證預覽 escaping。
 *
 * @param {*} value - 待跳脫值
 * @returns {string} 跳脫後字串
 */
function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 簡化版數字格式化。
 *
 * @param {*} value - 數值
 * @returns {string} 格式化後字串
 */
function number(value) {
  const n = Number(value);
  return isFinite(n) ? n.toLocaleString("zh-TW") : "0";
}

/**
 * 建立假的 DOM 元素。
 *
 * @param {string} tag - 標籤名稱
 * @returns {Object} 假元素
 */
function createElement(tag) {
  const classes = new Set();
  return {
    tagName: tag,
    id: "",
    className: "",
    textContent: "",
    innerHTML: "",
    value: "",
    checked: false,
    files: [],
    clicked: 0,
    children: [],
    parentNode: null,
    onclick: null,
    attributes: {},
    setAttribute: function (name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    classList: {
      add: function (name) {
        classes.add(name);
      },
      remove: function (name) {
        classes.delete(name);
      },
      contains: function (name) {
        return classes.has(name);
      }
    },
    click: function () {
      this.clicked++;
    },
    appendChild: function (child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    removeChild: function (child) {
      const index = this.children.indexOf(child);
      if (index !== -1) this.children.splice(index, 1);
      child.parentNode = null;
      return child;
    }
  };
}

/**
 * 建立假的 document 與元素對照表。
 *
 * @returns {{doc: Object, elements: Object, created: Array}} 假文件資源
 */
function createDocument() {
  const elements = Object.create(null);
  const created = [];
  const doc = {
    title: "舊標題",
    readyState: "complete",
    documentElement: { dataset: {} },
    head: createElement("head"),
    getElementById: function (id) {
      return elements[id] || null;
    },
    createElement: function (tag) {
      const el = createElement(tag);
      created.push(el);
      return el;
    },
    addEventListener: function () {}
  };
  return { doc: doc, elements: elements, created: created };
}

/**
 * 建立假的 localStorage。
 *
 * @param {Object} [initial] - 初始資料
 * @returns {Object} 假 localStorage
 */
function createLocalStorage(initial) {
  const store = Object.assign({}, initial || {});
  return {
    store: store,
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem: function (key, value) {
      store[key] = String(value);
    },
    removeItem: function (key) {
      delete store[key];
    }
  };
}

/**
 * 建立假的 window。
 *
 * @param {Object} doc - 假 document
 * @param {Object} calls - 呼叫紀錄
 * @returns {Object} 假 window
 */
function createWindow(doc, calls) {
  const log = calls || { timeouts: [], cleared: [] };
  return {
    document: doc,
    localStorage: createLocalStorage(),
    XLSX: null,
    FileReader: null,
    setTimeout: function (fn, ms) {
      log.timeouts.push({ fn: fn, ms: ms });
      return log.timeouts.length;
    },
    clearTimeout: function (id) {
      if (!log.cleared) log.cleared = [];
      log.cleared.push(id);
    }
  };
}

/**
 * 建立假活頁簿。
 *
 * @param {Object} sheets - 工作表名稱與內容對照
 * @returns {Object} 活頁簿
 */
function makeWorkbook(sheets) {
  const source = sheets || {};
  return { SheetNames: Object.keys(source), Sheets: source };
}

/**
 * 建立假 SheetJS 物件。
 *
 * @param {Object} sheets - 工作表名稱與內容對照
 * @param {Object} [overrides] - 覆寫讀取行為
 * @returns {Object} 假 SheetJS
 */
function makeXlsx(sheets, overrides) {
  const workbook = makeWorkbook(sheets);
  return Object.assign(
    {
      read: function () {
        return workbook;
      },
      utils: {
        sheet_to_json: function (sheet) {
          return (sheet && sheet.rows) || [];
        }
      }
    },
    overrides || {}
  );
}

/**
 * 建立假 FileReader 建構函式。
 *
 * @param {Object} calls - 呼叫紀錄
 * @returns {Function} 假 FileReader
 */
function createFakeFileReader(calls) {
  const log = calls || { fileReads: [] };
  function FakeFileReader() {
    this.result = null;
    this.onload = null;
    this.onerror = null;
  }
  FakeFileReader.prototype.readAsArrayBuffer = function (file) {
    if (!log.fileReads) log.fileReads = [];
    log.fileReads.push(file);
    if (file && file.failRead) {
      if (this.onerror) this.onerror();
      return;
    }
    this.result = file && Object.prototype.hasOwnProperty.call(file, "buffer") ? file.buffer : [1, 2, 3];
    if (this.onload) this.onload();
  };
  return FakeFileReader;
}

/**
 * 建立 ui.js 測試依賴。
 *
 * @param {Object} [overrides] - 覆寫依賴
 * @returns {Object} 依賴、呼叫紀錄與模組實例
 */
function createUiDeps(overrides) {
  const bundle = createDocument();
  const calls = {
    timeouts: [],
    cleared: [],
    setState: [],
    isGasHosted: 0,
    loginMock: 0,
    logout: 0
  };
  const win = createWindow(bundle.doc, calls);
  const state = {
    view: "app",
    tab: "overview",
    user: null,
    publicConfig: null,
    loginError: "",
    loginBusy: false,
    courses: { total: 0 }
  };
  const config = {
    title: "測試系統",
    version: "1.1.0",
    mock: false,
    themeKey: "gas_tmpl.theme.v1",
    styleKey: "gas_tmpl.style.v1",
    defaultStyle: "modern-slate",
    styles: [
      { id: "modern-slate", name: "極簡曜藍", icon: "✨" },
      { id: "paper", name: "紙張風格", icon: "📄" }
    ],
    tabs: [{ id: "overview", name: "概覽", icon: "📊" }],
    roleNames: { admin: "系統管理員", viewer: "檢視人員" }
  };
  const MEA = {
    state: state,
    config: config,
    safeErrors: safeErrors,
    setState: function (patch) {
      Object.assign(state, patch);
      calls.setState.push(Object.assign({}, patch));
    },
    auth: {
      isGasHosted: function () {
        calls.isGasHosted++;
        return false;
      },
      loginMock: function () {
        calls.loginMock++;
      },
      logout: function () {
        calls.logout++;
      },
      renderGoogleButton: function () {}
    }
  };

  const deps = Object.assign(
    {
      MEA: MEA,
      window: win,
      document: bundle.doc,
      setTimeoutFn: function (fn, ms) {
        calls.timeouts.push({ fn: fn, ms: ms });
        return calls.timeouts.length;
      },
      exposeInternals: true
    },
    overrides || {}
  );

  const ui = uiModule.createUiModule(deps);
  deps.MEA.ui = ui;

  return {
    deps: deps,
    calls: calls,
    MEA: deps.MEA,
    state: deps.MEA.state,
    config: deps.MEA.config,
    doc: deps.document || bundle.doc,
    elements: bundle.elements,
    created: bundle.created,
    win: deps.window || win,
    ui: ui
  };
}

/**
 * 建立 imports.js 測試依賴。
 *
 * @param {Object} [overrides] - 覆寫依賴
 * @returns {Object} 依賴、呼叫紀錄與模組實例
 */
function createImportsDeps(overrides) {
  const bundle = createDocument();
  const calls = {
    setState: [],
    toasts: [],
    apiCalls: [],
    apiResponses: [],
    apiErrors: [],
    fetchList: [],
    fileReads: [],
    normalizeCalls: []
  };
  const win = createWindow(bundle.doc, calls);
  win.FileReader = createFakeFileReader(calls);
  win.XLSX = makeXlsx({});

  const state = {
    importBusy: false,
    imports: {},
    importLast: null,
    user: { perms: ["*"] },
    courses: {}
  };
  const config = { mock: false };
  const MEA = {
    state: state,
    config: config,
    safeErrors: safeErrors,
    setState: function (patch) {
      Object.assign(state, patch);
      calls.setState.push(Object.assign({}, patch));
    },
    ui: Object.assign({}, uiModule, {
      escapeHtml: escapeHtml,
      number: number,
      toast: function (message, type) {
        calls.toasts.push({ message: message, type: type });
      }
    }),
    api: {
      call: function (action, payload) {
        calls.apiCalls.push({ action: action, payload: payload });
        if (calls.apiErrors.length > 0) return Promise.reject(calls.apiErrors.shift());
        if (calls.apiResponses.length > 0) return Promise.resolve(calls.apiResponses.shift());
        return Promise.resolve({ ok: true });
      }
    },
    courseData: {
      normalizeCourseCodes: function (rows, options) {
        calls.normalizeCalls.push({ rows: rows, options: options });
        const normalized = rows.map(function (row, index) {
          return [
            "114",
            "1",
            "1",
            "C" + (index + 1),
            String(row[0] || "科目"),
            "科別",
            "必修",
            "2",
            "2",
            "",
            "一般",
            "3",
            "0"
          ];
        });
        return {
          rows: normalized,
          stats: { sourceRows: rows.length, keptCourseRows: rows.length, expandedRows: rows.length * 6 }
        };
      }
    },
    courses: {
      fetchList: function (page) {
        calls.fetchList.push(page);
      }
    }
  };

  const deps = Object.assign(
    {
      MEA: MEA,
      window: win,
      document: bundle.doc,
      FileReader: win.FileReader,
      exposeInternals: true
    },
    overrides || {}
  );

  const imports = importsModule.createImportsModule(deps);
  deps.MEA.imports = imports;

  return {
    deps: deps,
    calls: calls,
    MEA: deps.MEA,
    state: deps.MEA.state,
    config: deps.MEA.config,
    doc: deps.document || bundle.doc,
    elements: bundle.elements,
    created: bundle.created,
    win: deps.window || win,
    imports: imports
  };
}

module.exports = {
  escapeHtml: escapeHtml,
  number: number,
  createElement: createElement,
  createDocument: createDocument,
  createLocalStorage: createLocalStorage,
  createWindow: createWindow,
  makeWorkbook: makeWorkbook,
  makeXlsx: makeXlsx,
  createFakeFileReader: createFakeFileReader,
  createUiDeps: createUiDeps,
  createImportsDeps: createImportsDeps
};
