/**
 * @file app.js
 * @description 前端主進入點、路由切換與畫面掛載（可測試控制器）
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    // task 6.1：僅註冊工廠，實例建立、全域別名回填與 init 由 wiring.js 集中處理。
    if (!MEA.factories) {
      MEA.factories = {};
    }
    MEA.factories.app = api.createAppController;
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

  /**
   * 頁籤與控制器的對應關係（buildBodyHtml 與 setTab 共用，避免路由漂移）。
   * 以 Object.create(null) 隔離原型鏈，避免 "toString" 等屬性誤判為有效頁籤。
   * render 為畫面產生器；load 為切換頁籤時的資料載入，無則省略。
   */
  const TAB_CONTROLLERS = Object.assign(Object.create(null), {
    import: { module: "imports", render: "renderView" },
    courses: { module: "courses", render: "renderView", load: "fetchList" },
    settings: { module: "accounts", render: "renderView", load: "loadSettingsAndAccounts" },
    activityLog: { module: "activityLog", render: "renderView", load: "fetchList" },
    overview: { module: "ui", render: "renderOverviewView" }
  });

  /**
   * 安全呼叫物件方法：方法不存在時回傳 undefined，並保留原本的 this 綁定。
   *
   * @param {Object} owner - 方法所屬物件
   * @param {string} methodName - 方法名稱
   * @returns {*} 方法回傳值，或 undefined
   */
  function invokeIfFunction_(owner, methodName) {
    if (!owner || typeof owner[methodName] !== "function") return undefined;
    return owner[methodName].call(owner);
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

  /**
   * 同步更新瀏覽器分頁標題為系統名稱。
   *
   * @param {Object} MEA - 前端全域物件
   * @param {Document} [doc] - document 物件
   */
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

  /**
   * 依目前頁籤與權限建構主內容區域 HTML。
   *
   * @param {Object} MEA - 前端全域物件
   * @param {string} tab - 頁籤識別碼
   * @returns {string} 主內容 HTML 字串
   */
  function buildBodyHtml(MEA, tab) {
    const allowed = isTabAllowed(findTab(MEA, tab), MEA.state && MEA.state.user);
    const effectiveTab = allowed ? tab : "overview";
    const controller = TAB_CONTROLLERS[effectiveTab] || TAB_CONTROLLERS.overview;
    return invokeIfFunction_(MEA[controller.module], controller.render) || "";
  }

  /**
   * 渲染共用頁尾 HTML（包含系統名稱、版本號與說明手冊連結）。
   *
   * @param {Object} MEA - 前端全域物件
   * @returns {string} 頁尾 HTML 字串
   */
  function renderFooterHtml(MEA) {
    const config = (MEA && MEA.config) || {};
    const appName = config.appName || "GAS-Course-Web-Template";
    const version = config.version ? " v" + config.version : "";
    const guideUrl =
      MEA && MEA.ui && typeof MEA.ui.getUserGuideUrl === "function" ? MEA.ui.getUserGuideUrl() : "docs/user-guide.html";
    const escape =
      MEA && MEA.ui && typeof MEA.ui.escapeHtml === "function"
        ? MEA.ui.escapeHtml
        : function (s) {
            return String(s || "")
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;")
              .replace(/"/g, "&quot;")
              .replace(/'/g, "&#39;");
          };

    return (
      '<footer class="app-footer" role="contentinfo">' +
      '<div class="app-footer-content">' +
      "<span>" +
      escape(appName + version) +
      "</span>" +
      '<span class="app-footer-divider" aria-hidden="true">|</span>' +
      '<a href="' +
      escape(guideUrl) +
      '" target="_blank" rel="noopener noreferrer" class="footer-guide-link" aria-label="說明手冊（另開新分頁）">' +
      '<span aria-hidden="true">📖</span> 說明手冊' +
      "</a>" +
      "</div>" +
      "</footer>"
    );
  }

  /**
   * 建立應用程式主控制器實例。
   *
   * @param {Object} [deps] - 依賴注入選項（包含 MEA、document、window、setTimeoutFn）
   * @returns {Object} 包含 setTab, cleanUrlQuery, applyInitialAuth, render, init 等操作介面
   */
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

    /** 同步更新網頁標題。 */
    function syncTitle() {
      syncDocumentTitle(MEA, doc);
    }

    /**
     * 切換應用程式頁籤並觸發該頁籤之載入動作。
     *
     * @param {string} tabId - 目標頁籤識別碼
     */
    function setTab(tabId) {
      const allowed = isTabAllowed(findTab(MEA, tabId), MEA.state && MEA.state.user);
      const effectiveTab = allowed ? tabId : "overview";
      if (typeof MEA.setState === "function") {
        MEA.setState({ tab: effectiveTab });
      }
      const controller = TAB_CONTROLLERS[effectiveTab];
      if (controller && controller.load) {
        invokeIfFunction_(MEA[controller.module], controller.load);
      }
    }

    /** 清理網址列之 query 參數（如 token, auth 等敏感回呼字串）。 */
    function cleanUrlQuery() {
      try {
        const topWin = (win && win.top) || win;
        if (topWin && topWin.history && topWin.history.replaceState && topWin.location) {
          const cleanUrl = topWin.location.href.split("?")[0].split("#")[0];
          topWin.history.replaceState({}, doc ? doc.title : "", cleanUrl);
        }
      } catch (e) {}
    }

    /**
     * 套用伺服器端注入之初始身分驗證資料（INITIAL_AUTH）。
     *
     * @returns {boolean} 是否成功處理初始授權
     */
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
        invokeIfFunction_(MEA.auth, "restore");
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

    /**
     * 處理切換帳號要求。
     *
     * @returns {boolean} 是否已觸發切換
     */
    function applyAccountSwitch() {
      if (!MEA.config || !MEA.config.switchAccount) return false;
      cleanUrlQuery();
      if (MEA.api && typeof MEA.api.setToken === "function") MEA.api.setToken("");
      if (MEA.api && typeof MEA.api.setCsrfToken === "function") MEA.api.setCsrfToken("");
      invokeIfFunction_(MEA.auth, "loginActiveUser");
      return true;
    }

    /**
     * 主畫面渲染函式，維護焦點並依據 state.view 渲染適當畫面。
     */
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
        mount.innerHTML = invokeIfFunction_(MEA.ui, "renderLoginView") || "";
        setTimeoutFn(function () {
          invokeIfFunction_(MEA.auth, "renderGoogleButton");
        }, 50);
        restoreFocusState(doc, focusSnapshot);
        return;
      }

      const tab = state.tab || "overview";
      mount.innerHTML =
        '<div class="app-layout">' +
        (invokeIfFunction_(MEA.ui, "renderHeader") || "") +
        (invokeIfFunction_(MEA.ui, "renderNavbar") || "") +
        '<main id="main-content" class="app-content" tabindex="-1">' +
        buildBodyHtml(MEA, tab) +
        "</main>" +
        renderFooterHtml(MEA) +
        "</div>";
      restoreFocusState(doc, focusSnapshot);
    }

    /** 結束授權流程並嘗試還原工作階段。 */
    function finishAuth() {
      if (!applyInitialAuth() && !applyAccountSwitch()) {
        MEA.auth && typeof MEA.auth.restore === "function" ? MEA.auth.restore() : undefined;
      }
    }

    /**
     * 初始化前端應用程式（載入主題、訂閱狀態變更並讀取公開設定）。
     *
     * @returns {Promise<void>} 初始化非同步 Promise
     */
    function init() {
      MEA.ui && typeof MEA.ui.initThemeAndStyle === "function" ? MEA.ui.initThemeAndStyle() : undefined;
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
      renderFooterHtml: function () {
        return renderFooterHtml(MEA);
      },
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
    renderFooterHtml: renderFooterHtml,
    captureFocusState: captureFocusState,
    restoreFocusState: restoreFocusState
  };
});
