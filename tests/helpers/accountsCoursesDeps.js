"use strict";

/**
 * @file accountsCoursesDeps.js
 * @description webapp/js/accounts.js 與 webapp/js/courses.js 控制器測試共用的依賴模擬工廠。
 */

const safeErrors = require("./safeErrorsDeps.js").safeErrors;
const realUi = require("../../webapp/js/ui.js");
const realCourseData = require("../../webapp/js/courseData.js");

const ROLE_NAMES = {
  admin: "系統管理員",
  staff: "業務人員",
  viewer: "檢視人員"
};

/**
 * 建立可手動解決的 Promise，用於觀測非同步 then/catch 回呼。
 *
 * @returns {Object} promise、resolve、reject
 */
function createDeferred() {
  let resolveFn = null;
  let rejectFn = null;
  const promise = new Promise(function (resolve, reject) {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return { promise: promise, resolve: resolveFn, reject: rejectFn };
}

/**
 * 清空數輪 microtask，等待 Promise 鏈完成。
 *
 * @returns {Promise<void>} 清空後的 Promise
 */
async function flush() {
  for (let i = 0; i < 6; i++) {
    await Promise.resolve();
  }
}

/**
 * 建立 accounts.js 控制器測試依賴。
 *
 * @param {Object} [overrides] - 覆寫 deps 欄位
 * @returns {Object} 依賴、呼叫紀錄與狀態快照
 */
function createAccountsDeps(overrides) {
  const state = {
    user: { role: "admin", roleName: "系統管理員" },
    settings: { data: {}, accounts: [], loading: false, saving: false },
    publicConfig: null
  };
  const calls = {
    setState: [],
    toast: [],
    modal: null,
    closeModal: 0,
    apiCalls: []
  };
  const elements = {};
  let responder = function () {
    return Promise.resolve({ ok: true });
  };

  const MEA = {
    state: state,
    config: { roleNames: ROLE_NAMES },
    safeErrors: safeErrors,
    setState: function (patch) {
      Object.assign(state, patch);
      calls.setState.push(Object.assign({}, patch));
    },
    api: {
      call: function (action, payload) {
        calls.apiCalls.push({ action: action, payload: payload });
        return responder(action, payload);
      }
    },
    ui: Object.assign({}, realUi, {
      escapeHtml: function (value) {
        return String(value === undefined || value === null ? "" : value);
      },
      toast: function (message, kind) {
        calls.toast.push({ message: message, kind: kind });
      },
      modal: function (title, html, actions) {
        calls.modal = { title: title, html: html, actions: actions };
      },
      closeModal: function () {
        calls.closeModal++;
      }
    })
  };

  const document = {
    getElementById: function (id) {
      return elements[id] || null;
    }
  };

  const deps = Object.assign({ MEA: MEA, document: document }, overrides || {});

  return {
    deps: deps,
    MEA: MEA,
    state: state,
    calls: calls,
    elements: elements,
    document: deps.document,
    setResponder: function (fn) {
      responder = fn;
    }
  };
}

/**
 * 建立 courses.js 控制器測試依賴。
 *
 * @param {Object} [overrides] - 覆寫 deps 欄位
 * @returns {Object} 依賴、呼叫紀錄與狀態快照
 */
function createCoursesDeps(overrides) {
  const state = {
    courses: {
      list: [],
      total: 0,
      page: 1,
      pageSize: 30,
      totalPages: 1,
      loading: false,
      keyword: "",
      department: "",
      academicYear: "",
      semester: ""
    }
  };
  const calls = {
    setState: [],
    toast: [],
    apiCalls: [],
    numbers: [],
    debounce: []
  };
  const elements = {};
  let responder = function () {
    return Promise.resolve({ ok: true });
  };

  const MEA = {
    state: state,
    safeErrors: safeErrors,
    courseData: {
      DEPARTMENT_CODE_NAMES: { 1: "資訊管理科", 2: "機械工程科" },
      compareDepartmentsByCode: realCourseData.compareDepartmentsByCode
    },
    setState: function (patch) {
      Object.assign(state, patch);
      calls.setState.push(Object.assign({}, patch));
    },
    api: {
      call: function (action, payload) {
        calls.apiCalls.push({ action: action, payload: payload });
        return responder(action, payload);
      }
    },
    ui: Object.assign({}, realUi, {
      escapeHtml: function (value) {
        return String(value === undefined || value === null ? "" : value);
      },
      toast: function (message, kind) {
        calls.toast.push({ message: message, kind: kind });
      },
      number: function (value) {
        calls.numbers.push(value);
        return String(value === undefined || value === null ? 0 : value);
      },
      debounce: function (fn, ms) {
        calls.debounce.push({ fn: fn, ms: ms });
        return function () {
          fn();
        };
      }
    })
  };

  const document = {
    getElementById: function (id) {
      return elements[id] || null;
    }
  };

  const deps = Object.assign({ MEA: MEA, document: document }, overrides || {});

  return {
    deps: deps,
    MEA: MEA,
    state: state,
    calls: calls,
    elements: elements,
    document: deps.document,
    setResponder: function (fn) {
      responder = fn;
    }
  };
}

module.exports = {
  ROLE_NAMES: ROLE_NAMES,
  createDeferred: createDeferred,
  flush: flush,
  createAccountsDeps: createAccountsDeps,
  createCoursesDeps: createCoursesDeps
};
