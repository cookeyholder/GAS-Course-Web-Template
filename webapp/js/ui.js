/**
 * @file ui.js
 * @description 網頁多風格主題、共用視覺元件、Toast 與對話框渲染
 *
 * 開發與測試環境可透過 createUiModule 注入 MEA、window、document 與計時器；
 * 瀏覽器環境仍組裝 window.MEA.ui，保留原有公開方法名稱與 DOM 事件。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    MEA.ui = api.createUiModule({
      MEA: MEA,
      window: window,
      document: window.document,
      setTimeoutFn: function (fn, ms) {
        return window.setTimeout(fn, ms);
      }
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_STYLE = "modern-slate";
  const MODAL_TITLE_ID = "meaModalTitle";

  /**
   * 跳脫 HTML 特殊字元。
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
   * 格式化數字為繁體中文千分位。
   *
   * @param {*} value - 數值
   * @returns {string} 格式化後字串
   */
  function number(value) {
    const n = Number(value);
    return isFinite(n) ? n.toLocaleString("zh-TW") : "0";
  }

  /**
   * 取得角色顯示名稱。
   *
   * @param {string} role - 角色代碼
   * @returns {string} 角色名稱
   */
  function roleName(role, config) {
    const names = (config && config.roleNames) || {};
    return names[String(role || "")] || String(role || "未授權");
  }

  /**
   * 輸出風格下拉選單。
   *
   * @param {Array} styles - 風格清單
   * @param {string} curStyle - 目前風格
   * @returns {string} option 標籤 HTML
   */
  function renderStyleOptions(styles, curStyle) {
    let html = "";
    for (let i = 0; i < styles.length; i++) {
      const s = styles[i];
      const selected = s.id === curStyle ? " selected" : "";
      html +=
        '<option value="' + escapeHtml(s.id) + '"' + selected + ">" + escapeHtml(s.icon + " " + s.name) + "</option>";
    }
    return html;
  }

  /**
   * 解析 Toast 種類。
   *
   * @param {string} type - 傳入種類
   * @returns {string} 正規化後種類
   */
  function resolveToastKind(type) {
    return type === "ok" ? "ok" : type === "err" ? "err" : type === "warn" ? "warn" : "info";
  }

  /**
   * 取得 Toast 圖示。
   *
   * @param {string} kind - 正規化後種類
   * @returns {string} 圖示文字
   */
  function resolveToastIcon(kind) {
    return kind === "ok" ? "✓" : kind === "err" ? "✕" : kind === "warn" ? "⚠" : "ℹ";
  }

  /**
   * 取得 Toast 停留時間。
   *
   * @param {string} kind - 正規化後種類
   * @param {*} duration - 可覆寫的毫秒數
   * @returns {number} 停留毫秒數
   */
  function resolveToastDuration(kind, duration) {
    if (typeof duration === "number") return duration;
    return kind === "err" ? 5000 : 3500;
  }

  /**
   * 建立 Toast 元素。
   *
   * @param {Object} doc - document 依賴
   * @param {string} message - 訊息內容
   * @param {string} kind - 正規化後種類
   * @returns {Object} Toast 元素
   */
  function createToastElement(doc, message, kind) {
    const t = doc.createElement("div");
    t.className = "toast " + kind;

    const iconSpan = doc.createElement("span");
    iconSpan.className = "toast-icon";
    iconSpan.textContent = resolveToastIcon(kind);

    const textSpan = doc.createElement("span");
    textSpan.className = "toast-msg";
    textSpan.textContent = message;

    t.appendChild(iconSpan);
    t.appendChild(textSpan);
    return t;
  }

  /**
   * 安排 Toast 出現與消失計時。
   *
   * @param {Object} t - Toast 元素
   * @param {number} time - 停留毫秒數
   * @param {Function} setTimeoutFn - 計時函式
   */
  function scheduleToastRemoval(t, time, setTimeoutFn) {
    setTimeoutFn(function () {
      t.classList.remove("visible");
      setTimeoutFn(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 300);
    }, time);
  }

  /**
   * 建立可注入依賴的 UI 模組實例。
   *
   * @param {Object} deps - MEA、window、document 與計時器依賴
   * @returns {Object} MEA.ui 公開方法與測試用內部函式
   */
  function createUiModule(deps) {
    const options = deps || {};
    const MEA = options.MEA || (typeof window !== "undefined" ? window.MEA : null) || {};
    const win = options.window || (typeof window !== "undefined" ? window : null) || {};
    const doc = options.document || (win && win.document) || (typeof document !== "undefined" ? document : null);
    const setTimeoutFn =
      typeof options.setTimeoutFn === "function"
        ? options.setTimeoutFn
        : function (fn, ms) {
            return setTimeout(fn, ms);
          };

    let modalRestoreFocus = null;

    function applyTheme(theme) {
      const value = theme === "dark" ? "dark" : "light";
      doc.documentElement.dataset.theme = value;
      try {
        win.localStorage.setItem(MEA.config.themeKey, value);
      } catch (error) {}
      return value;
    }

    function currentTheme() {
      return doc.documentElement.dataset.theme === "dark" ? "dark" : "light";
    }

    function updateThemeToggleLabels(next) {
      const btn = doc.getElementById("themeToggle");
      if (btn) btn.textContent = next === "dark" ? "◑ 淺色模式" : "◐ 深色模式";
      const loginToggle = doc.getElementById("loginThemeToggle");
      if (loginToggle) loginToggle.textContent = next === "dark" ? "◑ 淺色" : "◐ 深色";
    }

    function toggleTheme() {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      updateThemeToggleLabels(next);
    }

    function getStyleList() {
      return (MEA.config.styles || []).slice();
    }

    function currentStyle() {
      return doc.documentElement.dataset.style || MEA.config.defaultStyle || DEFAULT_STYLE;
    }

    function applyStyle(styleId) {
      const list = getStyleList();
      let valid = false;
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === styleId) {
          valid = true;
          break;
        }
      }
      const target = valid ? styleId : MEA.config.defaultStyle || DEFAULT_STYLE;
      doc.documentElement.dataset.style = target;
      try {
        win.localStorage.setItem(MEA.config.styleKey, target);
      } catch (error) {}
      return target;
    }

    function initThemeAndStyle() {
      let savedTheme = "light";
      let savedStyle = MEA.config.defaultStyle || DEFAULT_STYLE;
      try {
        savedTheme = win.localStorage.getItem(MEA.config.themeKey) || "light";
        savedStyle = win.localStorage.getItem(MEA.config.styleKey) || savedStyle;
      } catch (e) {}
      applyTheme(savedTheme);
      applyStyle(savedStyle);
    }

    function toast(message, type, duration) {
      const host = doc.getElementById("toastHost");
      if (!host) return;

      const kind = resolveToastKind(type);
      const t = createToastElement(doc, message, kind);
      host.appendChild(t);

      setTimeoutFn(function () {
        t.classList.add("visible");
      }, 10);

      scheduleToastRemoval(t, resolveToastDuration(kind, duration), setTimeoutFn);
    }

    /**
     * 收集容器內可聚焦元素，供初始焦點與 Tab 焦點陷阱使用。
     *
     * @param {Object} root - 查詢根元素
     * @returns {Array} 可聚焦元素清單
     */
    function collectFocusableElements(root) {
      if (!root || typeof root.querySelectorAll !== "function") return [];
      const found = root.querySelectorAll("button, input, select, textarea, a[href], [tabindex]");
      const nodes = [];
      for (let i = 0; i < found.length; i++) {
        const node = found[i];
        const tabIndex = typeof node.getAttribute === "function" ? node.getAttribute("tabindex") : null;
        if (node.disabled === true || tabIndex === "-1") continue;
        nodes.push(node);
      }
      return nodes;
    }

    function modal(title, contentHtml, buttons) {
      const host = doc.getElementById("modalHost");
      if (!host) return;

      const previousFocus = doc.activeElement || null;
      host.innerHTML = "";
      const overlay = doc.createElement("div");
      overlay.className = "modal-overlay";
      if (typeof overlay.setAttribute === "function") {
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", MODAL_TITLE_ID);
      }

      const card = doc.createElement("div");
      card.className = "modal-card";

      const head = doc.createElement("div");
      head.className = "modal-header";
      head.innerHTML =
        '<h3 class="modal-title" id="' +
        MODAL_TITLE_ID +
        '">' +
        escapeHtml(title) +
        '</h3><button type="button" class="modal-close" id="modalCloseBtn" aria-label="關閉對話框">✕</button>';

      const body = doc.createElement("div");
      body.className = "modal-body";
      body.innerHTML = contentHtml;

      const foot = doc.createElement("div");
      foot.className = "modal-footer";

      const footButtons = [];
      const btns = buttons || [{ text: "關閉", primary: true, onClick: closeModal }];
      btns.forEach(function (btn) {
        const b = doc.createElement("button");
        b.className = "btn " + (btn.primary ? "primary" : "secondary");
        if (typeof b.setAttribute === "function") b.setAttribute("type", "button");
        b.textContent = btn.text;
        b.onclick = function () {
          if (typeof btn.onClick === "function") {
            btn.onClick();
          } else {
            closeModal();
          }
        };
        foot.appendChild(b);
        footButtons.push(b);
      });

      card.appendChild(head);
      card.appendChild(body);
      card.appendChild(foot);
      overlay.appendChild(card);
      host.appendChild(overlay);

      modalRestoreFocus = previousFocus;

      const closeBtn = doc.getElementById("modalCloseBtn");
      if (closeBtn) closeBtn.onclick = closeModal;
      overlay.onclick = function (e) {
        if (e.target === overlay) closeModal();
      };

      function collectFocusables() {
        const closeNodes = closeBtn ? [closeBtn] : [];
        return closeNodes.concat(collectFocusableElements(body), footButtons);
      }

      const focusables = collectFocusables();
      if (focusables.length > 0 && typeof focusables[0].focus === "function") {
        focusables[0].focus();
      }

      overlay.onkeydown = function (e) {
        if (!e) return;
        const key = e.key || "";
        if (key === "Escape" || key === "Esc" || e.keyCode === 27) {
          if (typeof e.preventDefault === "function") e.preventDefault();
          closeModal();
          return;
        }
        if (key !== "Tab" && e.keyCode !== 9) return;
        const nodes = collectFocusables();
        if (nodes.length === 0) return;
        const index = nodes.indexOf(doc.activeElement);
        if (e.shiftKey) {
          if (index <= 0) {
            if (typeof e.preventDefault === "function") e.preventDefault();
            nodes[nodes.length - 1].focus();
          }
        } else if (index === -1 || index === nodes.length - 1) {
          if (typeof e.preventDefault === "function") e.preventDefault();
          nodes[0].focus();
        }
      };
    }

    function closeModal() {
      const host = doc.getElementById("modalHost");
      if (host) host.innerHTML = "";
      const restoreTarget = modalRestoreFocus;
      modalRestoreFocus = null;
      if (restoreTarget && typeof restoreTarget.focus === "function") restoreTarget.focus();
    }

    function renderUserPill(user) {
      return (
        '  <div class="user-pill">' +
        '    <span class="user-avatar">👤</span>' +
        '    <span class="user-name">' +
        escapeHtml(user.name || user.email) +
        "</span>" +
        '    <span class="pill ' +
        (user.role === "admin" ? "accent" : "muted") +
        '">' +
        escapeHtml(user.roleName || roleName(user.role, MEA.config)) +
        "</span>" +
        "  </div>"
      );
    }

    function renderHeader() {
      const user = MEA.state.user || {};
      const styles = getStyleList();
      const curStyle = currentStyle();
      const systemName = (MEA.state.publicConfig && MEA.state.publicConfig.systemName) || MEA.config.title;

      return (
        '<header class="app-header">' +
        '<div class="header-brand">' +
        '  <div class="brand-mark">📋</div>' +
        '  <div class="brand-text">' +
        '    <h1 class="brand-title">' +
        escapeHtml(systemName) +
        "</h1>" +
        '    <span class="brand-sub">Google Apps Script Web App Template v' +
        escapeHtml(MEA.config.version) +
        "</span>" +
        "  </div>" +
        "</div>" +
        '<div class="header-tools">' +
        renderUserPill(user) +
        '  <div class="style-selector-wrap">' +
        '    <select id="styleSelect" class="select compact" onchange="MEA.ui.applyStyle(this.value)">' +
        renderStyleOptions(styles, curStyle) +
        "    </select>" +
        "  </div>" +
        '  <button id="themeToggle" class="btn secondary compact" onclick="MEA.ui.toggleTheme()">' +
        (currentTheme() === "dark" ? "◑ 淺色模式" : "◐ 深色模式") +
        "  </button>" +
        '  <button class="btn secondary compact" onclick="MEA.auth.logout()">登出</button>' +
        "</div>" +
        "</header>"
      );
    }

    function renderNavbar() {
      const tabs = MEA.config.tabs || [];
      const currentTab = MEA.state.tab || "overview";

      let tabsHtml = "";
      for (let i = 0; i < tabs.length; i++) {
        const t = tabs[i];
        const active = t.id === currentTab ? " active" : "";
        tabsHtml +=
          '<button class="nav-tab' +
          active +
          '" onclick="MEA.setTab(\'' +
          t.id +
          "')\">" +
          '<span class="nav-icon">' +
          t.icon +
          "</span>" +
          '<span class="nav-name">' +
          escapeHtml(t.name) +
          "</span>" +
          "</button>";
      }

      return '<nav class="app-nav">' + '<div class="nav-tabs-container">' + tabsHtml + "</div>" + "</nav>";
    }

    function renderLoginErrorHtml(loginError) {
      if (!loginError) return "";
      return (
        '<div class="login-alert err"><span class="alert-icon">⚠</span><span>' +
        escapeHtml(loginError) +
        "</span></div>"
      );
    }

    function getLoginStatusHtml(isMock, config, auth) {
      if (isMock) {
        return '<div class="login-hint">目前為本機 Mock 模式，可直接使用測試身分登入。</div>';
      }
      if (auth && typeof auth.isGasHosted === "function" && auth.isGasHosted()) {
        const activeEmail = String(config.activeEmail || "").trim();
        return activeEmail
          ? '<div class="login-hint">目前瀏覽器 Google 帳號：<strong>' + escapeHtml(activeEmail) + "</strong></div>"
          : '<div class="login-hint">將透過 Google 帳戶選擇器以目前瀏覽器 Google 帳號登入。</div>';
      }
      if (config.clientId) {
        return '<div class="login-hint">使用 Google Identity Services 憑證進行登入驗證。</div>';
      }
      return '<div class="login-hint">尚未設定 OAuth Client ID；可請管理員於系統設定完成後再啟用 GIS 登入。</div>';
    }

    function renderLoginActions(isMock, loginBusy) {
      const mockHtml = isMock
        ? '<div class="login-divider"><span>或</span></div>' +
          '<button class="btn secondary block" onclick="MEA.auth.loginMock()"' +
          (loginBusy ? " disabled" : "") +
          ">" +
          "  🧪 本地測試身分登入 (Mock Mode)" +
          "</button>"
        : "";

      return (
        '  <div class="login-actions">' +
        '    <div class="gis-button-wrapper">' +
        '      <div id="googleLoginButton" class="google-btn-host"></div>' +
        "    </div>" +
        mockHtml +
        "  </div>"
      );
    }

    function renderLoginView() {
      const isMock = MEA.config.mock;
      const loginError = MEA.state.loginError || "";
      const loginBusy = MEA.state.loginBusy || false;
      const config = MEA.state.publicConfig || {};
      const styles = getStyleList();
      const curStyle = currentStyle();
      const styleOptionsHtml = renderStyleOptions(styles, curStyle);
      const errorHtml = renderLoginErrorHtml(loginError);
      const statusHtml = getLoginStatusHtml(isMock, config, MEA.auth);

      return (
        '<div class="login-container">' +
        '<div class="login-header-tools">' +
        '  <select id="loginStyleSelect" class="select compact" onchange="MEA.ui.applyStyle(this.value)">' +
        styleOptionsHtml +
        "  </select>" +
        '  <button id="loginThemeToggle" class="btn secondary compact" onclick="MEA.ui.toggleTheme()">' +
        (currentTheme() === "dark" ? "◑ 淺色" : "◐ 深色") +
        "  </button>" +
        "</div>" +
        '<div class="login-card">' +
        '  <div class="login-brand">' +
        '    <div class="login-logo">✨</div>' +
        '    <h2 class="login-title">' +
        escapeHtml(config.systemName || MEA.config.title) +
        "</h2>" +
        '    <p class="login-desc">Google 帳號登入、Session 安全控管與 108 課綱課程代碼 1NF 正規化範本</p>' +
        "  </div>" +
        errorHtml +
        statusHtml +
        renderLoginActions(isMock, loginBusy) +
        '  <div class="login-footer">' +
        '    <p class="login-note">首次登入且尚無白名單資料時，系統將自動建立第一位系統管理員。</p>' +
        "  </div>" +
        "</div>" +
        "</div>"
      );
    }

    function getLoginMode(config, auth) {
      const isGasHosted = auth && typeof auth.isGasHosted === "function" && auth.isGasHosted();
      if (isGasHosted) return "GAS ActiveUser / AccountChooser";
      if (config.clientId) return "Google Identity Services";
      return "未設定 Client ID";
    }

    function renderOverviewMetrics(config, user, courses, loginMode) {
      return (
        '<div class="metrics-grid">' +
        '  <div class="metric-card">' +
        '    <div class="metric-label">目前學年度 / 學期</div>' +
        '    <div class="metric-value">' +
        escapeHtml(config.schoolYear || "114") +
        " - " +
        escapeHtml(config.semester || "1") +
        "</div>" +
        '    <div class="metric-sub">系統作業環境</div>' +
        "  </div>" +
        '  <div class="metric-card">' +
        '    <div class="metric-label">已登入使用者</div>' +
        '    <div class="metric-value">' +
        escapeHtml(user.name || user.email) +
        "</div>" +
        '    <div class="metric-sub">角色權限：' +
        escapeHtml(user.roleName || user.role) +
        "</div>" +
        "  </div>" +
        '  <div class="metric-card">' +
        '    <div class="metric-label">登入機制</div>' +
        '    <div class="metric-value">' +
        escapeHtml(loginMode) +
        "</div>" +
        '    <div class="metric-sub">' +
        (config.allowedDomain ? "限制網域：@" + escapeHtml(config.allowedDomain) : "未限制登入網域") +
        "</div>" +
        "  </div>" +
        '  <div class="metric-card">' +
        '    <div class="metric-label">課程索引筆數</div>' +
        '    <div class="metric-value">' +
        number(courses.total || 0) +
        "</div>" +
        '    <div class="metric-sub">正規化課程紀錄總數</div>' +
        "  </div>" +
        "</div>"
      );
    }

    function renderFeatureGrid() {
      return (
        '<div class="card mt-4">' +
        '  <h3 class="card-title">🚀 範本功能快速導覽</h3>' +
        '  <div class="feature-grid mt-3">' +
        '    <div class="feature-item" onclick="MEA.setTab(\'import\')">' +
        '      <div class="feature-icon">📥</div>' +
        '      <div class="feature-text">' +
        "        <h4>課程代碼匯入與 1NF 正規化</h4>" +
        "        <p>支援 39 欄課綱寬表 Excel 檔案上傳，全數匯入並展開為 14 欄標準 1NF 課程索引。</p>" +
        "      </div>" +
        "    </div>" +
        '    <div class="feature-item" onclick="MEA.setTab(\'courses\')">' +
        '      <div class="feature-icon">📚</div>' +
        '      <div class="feature-text">' +
        "        <h4>正規化課程檢索與分頁</h4>" +
        "        <p>提供多維度關鍵字、學年、學期、科別篩選機制，支援大批量課程資料快速檢索。</p>" +
        "      </div>" +
        "    </div>" +
        '    <div class="feature-item" onclick="MEA.setTab(\'settings\')">' +
        '      <div class="feature-icon">⚙️</div>' +
        '      <div class="feature-text">' +
        "        <h4>系統設定與授權管理 (RBAC)</h4>" +
        "        <p>維護 Google OAuth 設定、登入網域限制、學期參數與系統存取授權白名單。</p>" +
        "      </div>" +
        "    </div>" +
        "  </div>" +
        "</div>"
      );
    }

    function renderOverviewView() {
      const config = MEA.state.publicConfig || {};
      const user = MEA.state.user || {};
      const courses = MEA.state.courses || {};
      const loginMode = getLoginMode(config, MEA.auth);

      return (
        '<div class="panel overview-panel">' +
        '<div class="panel-header">' +
        "  <div>" +
        '    <h2 class="panel-title">系統概覽儀表板</h2>' +
        '    <p class="panel-sub">Google Apps Script 網頁應用程式範本核心運作狀態</p>' +
        "  </div>" +
        "</div>" +
        renderOverviewMetrics(config, user, courses, loginMode) +
        renderFeatureGrid() +
        "</div>"
      );
    }

    /**
     * 函數防抖 (Debounce)
     *
     * @param {Function} fn - 目標執行函數
     * @param {number} [delay=250] - 延遲毫秒數
     * @returns {Function} 防抖包裹後之函數
     */
    function debounce(fn, delay) {
      let timer = null;
      const wait = typeof delay === "number" ? delay : 250;
      return function () {
        const context = this;
        const args = arguments;
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeoutFn(function () {
          fn.apply(context, args);
        }, wait);
      };
    }

    const api = {
      escapeHtml: escapeHtml,
      number: number,
      roleName: function (role) {
        return roleName(role, MEA.config);
      },
      debounce: debounce,
      applyTheme: applyTheme,
      currentTheme: currentTheme,
      toggleTheme: toggleTheme,
      getStyleList: getStyleList,
      currentStyle: currentStyle,
      applyStyle: applyStyle,
      initThemeAndStyle: initThemeAndStyle,
      toast: toast,
      modal: modal,
      closeModal: closeModal,
      renderHeader: renderHeader,
      renderNavbar: renderNavbar,
      renderLoginView: renderLoginView,
      renderOverviewView: renderOverviewView
    };

    if (options.exposeInternals) {
      Object.assign(api, {
        renderStyleOptions: renderStyleOptions,
        resolveToastKind: resolveToastKind,
        resolveToastIcon: resolveToastIcon,
        resolveToastDuration: resolveToastDuration,
        createToastElement: createToastElement,
        scheduleToastRemoval: scheduleToastRemoval,
        renderUserPill: renderUserPill,
        renderLoginErrorHtml: renderLoginErrorHtml,
        getLoginStatusHtml: getLoginStatusHtml,
        renderLoginActions: renderLoginActions,
        getLoginMode: getLoginMode,
        renderOverviewMetrics: renderOverviewMetrics,
        renderFeatureGrid: renderFeatureGrid,
        updateThemeToggleLabels: updateThemeToggleLabels
      });
    }

    return api;
  }

  return {
    createUiModule: createUiModule,
    DEFAULT_STYLE: DEFAULT_STYLE,
    escapeHtml: escapeHtml,
    number: number,
    roleName: roleName,
    renderStyleOptions: renderStyleOptions,
    resolveToastKind: resolveToastKind,
    resolveToastIcon: resolveToastIcon,
    resolveToastDuration: resolveToastDuration,
    createToastElement: createToastElement,
    scheduleToastRemoval: scheduleToastRemoval
  };
});
