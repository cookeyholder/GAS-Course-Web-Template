"use strict";

/**
 * @file authDeps.js
 * @description webapp/js/auth.js 控制器測試共用的依賴模擬工廠。
 */

/**
 * 將一般文字轉為 Base64，供測試環境模擬瀏覽器的 window.btoa。
 *
 * @param {string} text - 待轉換文字
 * @returns {string} Base64 結果
 */
function fakeBtoa(text) {
  return Buffer.from(String(text), "utf8").toString("base64");
}

/**
 * 建立 auth 控制器測試所需的依賴、狀態與呼叫紀錄。
 *
 * @param {Object} [overrides] - 覆寫預設依賴
 * @returns {Object} 依賴、呼叫紀錄與狀態快照
 */
function createDeps(overrides) {
  const options = overrides || {};
  const state = {
    view: "loading",
    publicConfig: null,
    loginBusy: false,
    loginError: "",
    user: null
  };
  const calls = {
    setState: [],
    toasts: [],
    apiCalls: [],
    setToken: [],
    setCsrfToken: [],
    fetchList: 0,
    currentTheme: "light",
    timeouts: [],
    navigations: [],
    opened: [],
    initialized: [],
    renderedButtons: [],
    queriedScripts: [],
    createdScripts: [],
    appendedScripts: [],
    renderGoogleButton: 0
  };
  const apiResponses = {};
  const elements = {
    googleLoginButton: { innerHTML: "" },
    app: { innerHTML: "" }
  };
  const hostWindow = {
    INITIAL_AUTH: null,
    GAS_WEBAPP_URL: options.gasWebappUrl === undefined ? "" : options.gasWebappUrl,
    google: options.google === undefined ? undefined : options.google,
    btoa: fakeBtoa,
    location: { href: "https://example.test/app?mock=true" },
    open: function (url, target) {
      calls.opened.push({ url: url, target: target });
    }
  };
  hostWindow.top = hostWindow;

  const doc = {
    title: "舊標題",
    getElementById: function (id) {
      return elements[id] || null;
    },
    querySelector: function () {
      return null;
    },
    createElement: function (tag) {
      const script = {
        tagName: tag,
        src: "",
        async: false,
        defer: false,
        dataset: {},
        onload: null,
        onerror: null
      };
      calls.createdScripts.push(script);
      return script;
    },
    head: {
      appendChild: function (script) {
        calls.appendedScripts.push(script);
      }
    }
  };

  const MEA = {
    state: state,
    config: Object.assign(
      {
        mock: false,
        roleNames: {
          admin: "系統管理員",
          staff: "業務人員"
        }
      },
      options.config || {}
    ),
    setState: function (patch) {
      Object.assign(state, patch);
      calls.setState.push(Object.assign({}, patch));
    },
    api: {
      getToken: function () {
        return calls.currentToken || "";
      },
      setToken: function (token) {
        calls.setToken.push(token);
        calls.currentToken = token;
      },
      getCsrfToken: function () {
        return calls.currentCsrfToken || "";
      },
      setCsrfToken: function (token) {
        calls.setCsrfToken.push(token);
        calls.currentCsrfToken = token;
      },
      call: function (action, payload) {
        calls.apiCalls.push({ action: action, payload: payload });
        if (Object.prototype.hasOwnProperty.call(apiResponses, action)) {
          const response = apiResponses[action];
          return Promise.resolve(
            typeof response === "function" ? response(payload) : response
          );
        }
        return Promise.resolve({ ok: true });
      }
    },
    ui: {
      toast: function (message, level) {
        calls.toasts.push({ message: message, level: level });
      },
      currentTheme: function () {
        return calls.currentTheme;
      }
    },
    courses: {
      fetchList: function (page) {
        calls.fetchList += 1;
        calls.lastFetchPage = page;
      }
    },
    auth: {
      renderGoogleButton: function () {
        calls.renderGoogleButton += 1;
      }
    }
  };

  const deps = Object.assign(
    {
      MEA: MEA,
      document: doc,
      window: hostWindow,
      setTimeoutFn: function (fn, ms) {
        calls.timeouts.push({ fn: fn, ms: ms });
      }
    },
    options.deps || {}
  );

  return {
    deps: deps,
    calls: calls,
    state: state,
    MEA: MEA,
    elements: elements,
    hostWindow: hostWindow,
    apiResponses: apiResponses,
    doc: deps.document
  };
}

/**
 * 等待數個微任務，讓測試中的 Promise 鏈結完成。
 *
 * @returns {Promise<void>} 可等待的 Promise
 */
function flush() {
  return Promise.resolve()
    .then(function () {})
    .then(function () {})
    .then(function () {});
}

module.exports = {
  createDeps: createDeps,
  fakeBtoa: fakeBtoa,
  flush: flush
};
