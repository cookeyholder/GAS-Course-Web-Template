/**
 * @file app.js
 * @description 前端主進入點、路由切換與畫面掛載（可測試控制器）
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    const controller = api.createAppController({
      MEA: MEA,
      document: window.document,
      window: window,
      setTimeoutFn: function (fn, ms) {
        return window.setTimeout(fn, ms);
      }
    });

    MEA.setTab = controller.setTab;
    MEA.render = controller.render;
    MEA.init = controller.init;

    if (window.document.readyState === "loading") {
      window.document.addEventListener("DOMContentLoaded", controller.init);
    } else {
      controller.init();
    }
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const LOADING_VIEW_HTML =
    '<div class="login-container">' +
    '<div class="login-card text-center py-12">' +
    '  <div class="spinner mb-4"></div>' +
    '  <div class="text-muted">正在初始化系統連線與設定...</div>' +
    "</div>" +
    "</div>";

  function invoke(module, method) {
    return module && typeof module[method] === "function" ? module[method]() : undefined;
  }

  function syncDocumentTitle(MEA, doc) {
    if (!doc) return;
    const systemName = ((MEA && MEA.state && MEA.state.publicConfig) || {}).systemName;
    if (systemName && doc.title !== systemName) {
      doc.title = systemName;
    }
  }

  function buildBodyHtml(MEA, tab) {
    switch (tab) {
      case "import":
        return invoke(MEA.imports, "renderView") || "";
      case "courses":
        return invoke(MEA.courses, "renderView") || "";
      case "settings":
        return invoke(MEA.accounts, "renderView") || "";
      case "overview":
      default:
        return invoke(MEA.ui, "renderOverviewView") || "";
    }
  }

  function createAppController(deps) {
    const options = deps || {};
    const MEA = options.MEA || (typeof window !== "undefined" ? window.MEA : null) || {};
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    const win = options.window || (typeof window !== "undefined" ? window : null);
    const setTimeoutFn =
      typeof options.setTimeoutFn === "function"
        ? options.setTimeoutFn
        : function (fn, ms) {
            return setTimeout(fn, ms);
          };

    function syncTitle() {
      syncDocumentTitle(MEA, doc);
    }

    function setTab(tabId) {
      if (typeof MEA.setState === "function") {
        MEA.setState({ tab: tabId });
      }
      if (tabId === "courses") {
        invoke(MEA.courses, "fetchList");
      } else if (tabId === "settings") {
        invoke(MEA.accounts, "loadSettingsAndAccounts");
      }
    }

    function cleanUrlQuery() {
      try {
        const topWin = (win && win.top) || win;
        if (topWin && topWin.history && topWin.history.replaceState && topWin.location) {
          const cleanUrl = topWin.location.href.split("?")[0].split("#")[0];
          topWin.history.replaceState({}, doc ? doc.title : "", cleanUrl);
        }
      } catch (e) {}
    }

    function applyInitialAuth() {
      const initial = win && win.INITIAL_AUTH;
      if (!initial || typeof initial !== "object") return false;

      cleanUrlQuery();
      try {
        delete win.INITIAL_AUTH;
      } catch (e) {
        win.INITIAL_AUTH = null;
      }

      if (initial.ok === true) {
        if (MEA.auth && typeof MEA.auth.applyLoginSuccess === "function") {
          MEA.auth.applyLoginSuccess(initial);
        }
        return true;
      }

      if (MEA.api && typeof MEA.api.getToken === "function" && MEA.api.getToken()) {
        invoke(MEA.auth, "restore");
        if (initial.message && typeof MEA.setState === "function") {
          MEA.setState({ loginError: initial.message });
        }
        return true;
      }

      if (typeof MEA.setState === "function") {
        MEA.setState({
          view: "login",
          loginBusy: false,
          loginError: initial.message || "Google 登入失敗，請重新嘗試"
        });
      }
      return true;
    }

    function applyAccountSwitch() {
      if (!MEA.config || !MEA.config.switchAccount) return false;
      cleanUrlQuery();
      if (MEA.api && typeof MEA.api.setToken === "function") MEA.api.setToken("");
      if (MEA.api && typeof MEA.api.setCsrfToken === "function") MEA.api.setCsrfToken("");
      invoke(MEA.auth, "loginActiveUser");
      return true;
    }

    function render() {
      syncTitle();
      if (!doc || typeof doc.getElementById !== "function") return;
      const mount = doc.getElementById("app");
      if (!mount) return;

      const state = MEA.state || {};
      if (state.view === "loading") {
        mount.innerHTML = LOADING_VIEW_HTML;
        return;
      }

      if (state.view === "login") {
        mount.innerHTML = invoke(MEA.ui, "renderLoginView") || "";
        setTimeoutFn(function () {
          invoke(MEA.auth, "renderGoogleButton");
        }, 50);
        return;
      }

      const tab = state.tab || "overview";
      mount.innerHTML =
        '<div class="app-layout">' +
        (invoke(MEA.ui, "renderHeader") || "") +
        (invoke(MEA.ui, "renderNavbar") || "") +
        '<main class="app-content">' +
        buildBodyHtml(MEA, tab) +
        "</main>" +
        "</div>";
    }

    function finishAuth() {
      if (!applyInitialAuth() && !applyAccountSwitch()) {
        invoke(MEA.auth, "restore");
      }
    }

    function init() {
      invoke(MEA.ui, "initThemeAndStyle");
      if (typeof MEA.subscribe === "function") {
        MEA.subscribe(render);
      }

      const request =
        MEA.api && typeof MEA.api.call === "function"
          ? MEA.api.call("getPublicConfig", {})
          : Promise.resolve(null);

      return Promise.resolve(request)
        .then(function (configRes) {
          if (configRes && configRes.ok === true) {
            if (typeof MEA.setState === "function") {
              MEA.setState({ publicConfig: configRes });
            }
            syncTitle();
          }
          finishAuth();
        })
        .catch(function () {
          finishAuth();
        });
    }

    return {
      setTab: setTab,
      cleanUrlQuery: cleanUrlQuery,
      applyInitialAuth: applyInitialAuth,
      applyAccountSwitch: applyAccountSwitch,
      render: render,
      init: init,
      syncDocumentTitle: syncTitle
    };
  }

  return {
    createAppController: createAppController,
    syncDocumentTitle: syncDocumentTitle,
    buildBodyHtml: buildBodyHtml
  };
});
