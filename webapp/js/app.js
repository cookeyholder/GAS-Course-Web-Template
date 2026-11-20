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

  /**
   * 角色代碼單一來源（task 5.3）：GAS 全域 gasRuntime 優先，Node 由 require 取得。
   * gasRuntime.js 在建置順序中早於本模組載入，故可安全取得。
   */
  const ROLE_CODES =
    (typeof globalThis !== "undefined" && globalThis.gasRuntime && globalThis.gasRuntime.ROLE_CODES) ||
    (typeof require === "function" ? require("../../gasRuntime.js").ROLE_CODES : null);

  const LOADING_VIEW_HTML =
    '<div class="login-container">' +
    '<div class="login-card text-center py-12" role="status" aria-label="系統載入中" aria-busy="true">' +
    '  <div class="spinner mb-4"></div>' +
    '  <div class="text-muted">正在初始化系統連線與設定...</div>' +
    "</div>" +
    "</div>";

  function invoke(module, method) {
    return module && typeof module[method] === "function" ? module[method]() : undefined;
  }

  /**
   * 依頁籤的管理員旗標與目前使用者角色判定頁籤是否可見。
   * 與 webapp/js/ui.js 的守門邏輯一致，防止直接竄改 state 進入管理員頁籤。
   *
   * @param {Object} tab - 頁籤定義
   * @param {Object} user - 目前登入使用者（MEA.state.user）
   * @returns {boolean} 是否允許存取
   */
  function isTabAllowed(tab, user) {
    if (!tab || tab.adminOnly !== true) return true;
    return !!(user && ROLE_CODES && user.role === ROLE_CODES.ADMIN);
  }

  /**
   * 依頁籤識別碼從設定中找出頁籤定義。
   *
   * @param {Object} MEA - 前端全域物件
   * @param {string} tabId - 頁籤識別碼
   * @returns {Object|null} 頁籤定義或 null
   */
  function findTab(MEA, tabId) {
    const tabs = (MEA.config && MEA.config.tabs) || [];
    for (let i = 0; i < tabs.length; i++) {
      if (tabs[i].id === tabId) return tabs[i];
    }
    return null;
  }

  function syncDocumentTitle(MEA, doc) {
    if (!doc) return;
    const systemName = ((MEA && MEA.state && MEA.state.publicConfig) || {}).systemName;
    if (systemName && doc.title !== systemName) {
      doc.title = systemName;
    }
  }

  /**
   * 在整塊 innerHTML 重建前記錄焦點元素與輸入選取範圍。
   *
   * @param {Object} doc - document 物件
   * @param {Object} mount - 即將重建的掛載元素
   * @returns {Object|null} 焦點快照
   */
  function captureFocusState(doc, mount) {
    const active = doc && doc.activeElement;
    if (!active || !active.id) return null;
    if (mount && active !== mount && typeof mount.contains === "function" && !mount.contains(active)) return null;
    const snapshot = { id: active.id };
    if (typeof active.selectionStart === "number") {
      snapshot.selectionStart = active.selectionStart;
      snapshot.selectionEnd = typeof active.selectionEnd === "number" ? active.selectionEnd : active.selectionStart;
    }
    return snapshot;
  }

  /**
   * 重建後還原先前記錄的焦點與選取範圍；元素不存在時安全略過。
   *
   * @param {Object} doc - document 物件
   * @param {Object} snapshot - captureFocusState 產生的快照
   */
  function restoreFocusState(doc, snapshot) {
    if (!snapshot || !doc || typeof doc.getElementById !== "function") return;
    const element = doc.getElementById(snapshot.id);
    if (!element || typeof element.focus !== "function") return;
    element.focus();
    if (typeof snapshot.selectionStart === "number" && typeof element.setSelectionRange === "function") {
      try {
        element.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
      } catch (e) {
        // 部分輸入類型不支援選取範圍，忽略即可
      }
    }
  }

  function buildBodyHtml(MEA, tab) {
    const allowed = isTabAllowed(findTab(MEA, tab), MEA.state && MEA.state.user);
    const effectiveTab = allowed ? tab : "overview";
    switch (effectiveTab) {
      case "import":
        return invoke(MEA.imports, "renderView") || "";
      case "courses":
        return invoke(MEA.courses, "renderView") || "";
      case "settings":
        return invoke(MEA.accounts, "renderView") || "";
      case "activityLog":
        return invoke(MEA.activityLog, "renderView") || "";
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
      const allowed = isTabAllowed(findTab(MEA, tabId), MEA.state && MEA.state.user);
      const effectiveTab = allowed ? tabId : "overview";
      if (typeof MEA.setState === "function") {
        MEA.setState({ tab: effectiveTab });
      }
      if (effectiveTab === "courses") {
        invoke(MEA.courses, "fetchList");
      } else if (effectiveTab === "settings") {
        invoke(MEA.accounts, "loadSettingsAndAccounts");
      } else if (effectiveTab === "activityLog") {
        invoke(MEA.activityLog, "fetchList");
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

      const focusSnapshot = captureFocusState(doc, mount);
      const state = MEA.state || {};
      if (state.view === "loading") {
        mount.innerHTML = LOADING_VIEW_HTML;
        restoreFocusState(doc, focusSnapshot);
        return;
      }

      if (state.view === "login") {
        mount.innerHTML = invoke(MEA.ui, "renderLoginView") || "";
        setTimeoutFn(function () {
          invoke(MEA.auth, "renderGoogleButton");
        }, 50);
        restoreFocusState(doc, focusSnapshot);
        return;
      }

      const tab = state.tab || "overview";
      mount.innerHTML =
        '<div class="app-layout">' +
        (invoke(MEA.ui, "renderHeader") || "") +
        (invoke(MEA.ui, "renderNavbar") || "") +
        '<main id="main-content" class="app-content" tabindex="-1">' +
        buildBodyHtml(MEA, tab) +
        "</main>" +
        "</div>";
      restoreFocusState(doc, focusSnapshot);
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
        MEA.api && typeof MEA.api.call === "function" ? MEA.api.call("getPublicConfig", {}) : Promise.resolve(null);

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
      syncDocumentTitle: syncTitle,
      captureFocusState: function () {
        return captureFocusState(
          doc,
          doc && typeof doc.getElementById === "function" ? doc.getElementById("app") : null
        );
      },
      restoreFocusState: function (snapshot) {
        return restoreFocusState(doc, snapshot);
      }
    };
  }

  return {
    createAppController: createAppController,
    syncDocumentTitle: syncDocumentTitle,
    buildBodyHtml: buildBodyHtml,
    captureFocusState: captureFocusState,
    restoreFocusState: restoreFocusState
  };
});
