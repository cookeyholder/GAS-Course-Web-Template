"use strict";

/**
 * @file appControllerDeps.js
 * @description webapp/js/app.js 控制器測試共用的依賴模擬工廠。
 */

const safeErrors = require("./safeErrorsDeps.js").safeErrors;

/**
 * 建立控制器測試所需的依賴與觀測紀錄。
 *
 * @param {Object} [overrides] - 覆寫預設依賴
 * @returns {Object} 依賴、呼叫紀錄與狀態快照
 */
function createDeps(overrides) {
  const state = { view: "loading", tab: "overview", loginError: "", publicConfig: null };
  const calls = {
    setState: [],
    fetchList: 0,
    loadSettingsAndAccounts: 0,
    applyLoginSuccess: [],
    restore: 0,
    loginActiveUser: 0,
    setToken: [],
    setCsrfToken: [],
    renderGoogleButton: 0,
    subscribe: null,
    initThemeAndStyle: 0,
    apiCalls: [],
    historyReplace: null,
    timeouts: []
  };
  const elements = { app: { innerHTML: "" } };

  const MEA = {
    state: state,
    config: { switchAccount: false },
    safeErrors: safeErrors,
    setState: function (patch) {
      Object.assign(state, patch);
      calls.setState.push(Object.assign({}, patch));
    },
    setTab: null,
    subscribe: function (fn) {
      calls.subscribe = fn;
    },
    api: {
      call: function (action, payload) {
        calls.apiCalls.push({ action: action, payload: payload });
        return Promise.resolve({ ok: true, systemName: "SYS" });
      },
      getToken: function () {
        return "";
      },
      setToken: function (token) {
        calls.setToken.push(token);
      },
      setCsrfToken: function (token) {
        calls.setCsrfToken.push(token);
      }
    },
    auth: {
      applyLoginSuccess: function (data) {
        calls.applyLoginSuccess.push(data);
      },
      restore: function () {
        calls.restore++;
      },
      loginActiveUser: function () {
        calls.loginActiveUser++;
      },
      renderGoogleButton: function () {
        calls.renderGoogleButton++;
      }
    },
    courses: {
      fetchList: function () {
        calls.fetchList++;
      }
    },
    accounts: {
      loadSettingsAndAccounts: function () {
        calls.loadSettingsAndAccounts++;
      }
    },
    imports: {
      renderView: function () {
        return '<div id="import-view"></div>';
      }
    },
    ui: {
      initThemeAndStyle: function () {
        calls.initThemeAndStyle++;
      },
      renderLoginView: function () {
        return '<div id="login-view"></div>';
      },
      renderOverviewView: function () {
        return '<div id="overview-view"></div>';
      },
      renderHeader: function () {
        return "<header></header>";
      },
      renderNavbar: function () {
        return "<nav></nav>";
      }
    }
  };

  const deps = Object.assign(
    {
      MEA: MEA,
      document: {
        title: "old",
        getElementById: function (id) {
          return elements[id] || null;
        },
        readyState: "complete",
        addEventListener: function () {}
      },
      window: {
        INITIAL_AUTH: null,
        top: {
          location: { href: "https://x.test/app?mock=true#h" },
          history: {
            replaceState: function (s, t, url) {
              calls.historyReplace = { s: s, t: t, url: url };
            }
          }
        },
        location: { href: "https://x.test/app?mock=true#h" },
        history: {
          replaceState: function (s, t, url) {
            calls.historyReplace = { s: s, t: t, url: url };
          }
        }
      },
      setTimeoutFn: function (fn) {
        calls.timeouts.push(fn);
        fn();
      }
    },
    overrides || {}
  );
  if (deps.window && deps.window.top == null) {
    deps.window.top = deps.window;
  }

  return { deps: deps, calls: calls, state: state, MEA: MEA, elements: elements };
}

module.exports = { createDeps: createDeps };
