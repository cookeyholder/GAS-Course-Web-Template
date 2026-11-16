/**
 * @file ui.js
 * @description 網頁多風格主題、共用視覺元件、Toast 與對話框渲染
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function number(value) {
    const n = Number(value);
    return isFinite(n) ? n.toLocaleString("zh-TW") : "0";
  }

  function roleName(role) {
    return MEA.config.roleNames[String(role || "")] || String(role || "未授權");
  }

  // ============================================================================
  // 主題與風格切換（多風格支援）
  // ============================================================================

  function applyTheme(theme) {
    const value = theme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = value;
    try {
      window.localStorage.setItem(MEA.config.themeKey, value);
    } catch (error) {}
    return value;
  }

  function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
  }

  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    const btn = document.getElementById("themeToggle");
    if (btn) btn.textContent = next === "dark" ? "◑ 淺色模式" : "◐ 深色模式";
    const loginToggle = document.getElementById("loginThemeToggle");
    if (loginToggle) loginToggle.textContent = next === "dark" ? "◑ 淺色" : "◐ 深色";
  }

  function getStyleList() {
    return (MEA.config.styles || []).slice();
  }

  function currentStyle() {
    return document.documentElement.dataset.style || MEA.config.defaultStyle || "modern-slate";
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
    const target = valid ? styleId : (MEA.config.defaultStyle || "modern-slate");
    document.documentElement.dataset.style = target;
    try {
      window.localStorage.setItem(MEA.config.styleKey, target);
    } catch (error) {}
    return target;
  }

  function initThemeAndStyle() {
    let savedTheme = "light";
    let savedStyle = MEA.config.defaultStyle || "modern-slate";
    try {
      savedTheme = window.localStorage.getItem(MEA.config.themeKey) || "light";
      savedStyle = window.localStorage.getItem(MEA.config.styleKey) || savedStyle;
    } catch (e) {}
    applyTheme(savedTheme);
    applyStyle(savedStyle);
  }

  // ============================================================================
  // Toast 通知訊息
  // ============================================================================

  function toast(message, type, duration) {
    const host = document.getElementById("toastHost");
    if (!host) return;

    const t = document.createElement("div");
    const kind = type === "ok" ? "ok" : type === "err" ? "err" : type === "warn" ? "warn" : "info";
    t.className = "toast " + kind;

    const iconSpan = document.createElement("span");
    iconSpan.className = "toast-icon";
    iconSpan.textContent = kind === "ok" ? "✓" : kind === "err" ? "✕" : kind === "warn" ? "⚠" : "ℹ";

    const textSpan = document.createElement("span");
    textSpan.className = "toast-msg";
    textSpan.textContent = message;

    t.appendChild(iconSpan);
    t.appendChild(textSpan);
    host.appendChild(t);

    setTimeout(function () {
      t.classList.add("visible");
    }, 10);

    const time = typeof duration === "number" ? duration : kind === "err" ? 5000 : 3500;
    setTimeout(function () {
      t.classList.remove("visible");
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 300);
    }, time);
  }

  // ============================================================================
  // Modal 彈跳對話框
  // ============================================================================

  function modal(title, contentHtml, buttons) {
    const host = document.getElementById("modalHost");
    if (!host) return;

    host.innerHTML = "";
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";

    const card = document.createElement("div");
    card.className = "modal-card";

    const head = document.createElement("div");
    head.className = "modal-header";
    head.innerHTML = '<h3 class="modal-title">' + escapeHtml(title) + '</h3><button class="modal-close" id="modalCloseBtn">✕</button>';

    const body = document.createElement("div");
    body.className = "modal-body";
    body.innerHTML = contentHtml;

    const foot = document.createElement("div");
    foot.className = "modal-footer";

    const btns = buttons || [{ text: "關閉", primary: true, onClick: closeModal }];
    btns.forEach(function (btn) {
      const b = document.createElement("button");
      b.className = "btn " + (btn.primary ? "primary" : "secondary");
      b.textContent = btn.text;
      b.onclick = function () {
        if (typeof btn.onClick === "function") {
          btn.onClick();
        } else {
          closeModal();
        }
      };
      foot.appendChild(b);
    });

    card.appendChild(head);
    card.appendChild(body);
    card.appendChild(foot);
    overlay.appendChild(card);
    host.appendChild(overlay);

    document.getElementById("modalCloseBtn").onclick = closeModal;
    overlay.onclick = function (e) {
      if (e.target === overlay) closeModal();
    };
  }

  function closeModal() {
    const host = document.getElementById("modalHost");
    if (host) host.innerHTML = "";
  }

  // ============================================================================
  // Header 與導覽列元件
  // ============================================================================

  function renderHeader() {
    const user = MEA.state.user || {};
    const styles = getStyleList();
    const curStyle = currentStyle();

    let styleOptionsHtml = "";
    for (let i = 0; i < styles.length; i++) {
      const s = styles[i];
      const selected = s.id === curStyle ? " selected" : "";
      styleOptionsHtml += '<option value="' + escapeHtml(s.id) + '"' + selected + '>' + escapeHtml(s.icon + " " + s.name) + '</option>';
    }

    return '<header class="app-header">'
      + '<div class="header-brand">'
      + '  <div class="brand-mark">📋</div>'
      + '  <div class="brand-text">'
      + '    <h1 class="brand-title">' + escapeHtml(MEA.config.title) + '</h1>'
      + '    <span class="brand-sub">Google Apps Script Web App Template v' + escapeHtml(MEA.config.version) + '</span>'
      + '  </div>'
      + '</div>'
      + '<div class="header-tools">'
      + '  <div class="user-pill">'
      + '    <span class="user-avatar">👤</span>'
      + '    <span class="user-name">' + escapeHtml(user.name || user.email) + '</span>'
      + '    <span class="pill ' + (user.role === "admin" ? "accent" : "muted") + '">' + escapeHtml(user.roleName || roleName(user.role)) + '</span>'
      + '  </div>'
      + '  <div class="style-selector-wrap">'
      + '    <select id="styleSelect" class="select compact" onchange="MEA.ui.applyStyle(this.value)">'
      +        styleOptionsHtml
      + '    </select>'
      + '  </div>'
      + '  <button id="themeToggle" class="btn secondary compact" onclick="MEA.ui.toggleTheme()">'
      +      (currentTheme() === "dark" ? "◑ 淺色模式" : "◐ 深色模式")
      + '  </button>'
      + '  <button class="btn secondary compact" onclick="MEA.auth.logout()">登出</button>'
      + '</div>'
      + '</header>';
  }

  function renderNavbar() {
    const tabs = MEA.config.tabs || [];
    const currentTab = MEA.state.tab || "overview";

    let tabsHtml = "";
    for (let i = 0; i < tabs.length; i++) {
      const t = tabs[i];
      const active = t.id === currentTab ? " active" : "";
      tabsHtml += '<button class="nav-tab' + active + '" onclick="MEA.setTab(\'' + t.id + '\')">'
        + '<span class="nav-icon">' + t.icon + '</span>'
        + '<span class="nav-name">' + escapeHtml(t.name) + '</span>'
        + '</button>';
    }

    return '<nav class="app-nav">'
      + '<div class="nav-tabs-container">' + tabsHtml + '</div>'
      + '</nav>';
  }

  // ============================================================================
  // 登入畫面渲染
  // ============================================================================

  function renderLoginView() {
    const isMock = MEA.config.mock;
    const loginError = MEA.state.loginError || "";
    const loginBusy = MEA.state.loginBusy || false;
    const config = MEA.state.publicConfig || {};
    const styles = getStyleList();
    const curStyle = currentStyle();

    let styleOptionsHtml = "";
    for (let i = 0; i < styles.length; i++) {
      const s = styles[i];
      const selected = s.id === curStyle ? " selected" : "";
      styleOptionsHtml += '<option value="' + escapeHtml(s.id) + '"' + selected + '>' + escapeHtml(s.icon + " " + s.name) + '</option>';
    }

    let errorHtml = "";
    if (loginError) {
      errorHtml = '<div class="login-alert err"><span class="alert-icon">⚠</span><span>' + escapeHtml(loginError) + '</span></div>';
    }

    return '<div class="login-container">'
      + '<div class="login-header-tools">'
      + '  <select id="loginStyleSelect" class="select compact" onchange="MEA.ui.applyStyle(this.value)">'
      +      styleOptionsHtml
      + '  </select>'
      + '  <button id="loginThemeToggle" class="btn secondary compact" onclick="MEA.ui.toggleTheme()">'
      +      (currentTheme() === "dark" ? "◑ 淺色" : "◐ 深色")
      + '  </button>'
      + '</div>'
      + '<div class="login-card">'
      + '  <div class="login-brand">'
      + '    <div class="login-logo">✨</div>'
      + '    <h2 class="login-title">' + escapeHtml(config.systemName || MEA.config.title) + '</h2>'
      + '    <p class="login-desc">Google Identity Services (GIS) 身分驗證 · 課程代碼 1NF 正規化範本</p>'
      + '  </div>'
      +    errorHtml
      + '  <div class="login-actions">'
      + '    <div class="gis-button-wrapper">'
      + '      <div id="googleLoginButton" class="google-btn-host"></div>'
      + '    </div>'
      +      (isMock
              ? '<div class="login-divider"><span>或</span></div>'
              + '<button class="btn secondary block" onclick="MEA.auth.loginMock()"' + (loginBusy ? ' disabled' : '') + '>'
              + '  🧪 本地測試身分登入 (Mock Mode)'
              + '</button>'
              : '')
      + '  </div>'
      + '  <div class="login-footer">'
      + '    <p class="login-note">請使用 Google 帳號登入；首次登入者將自動開通管理員身分</p>'
      + '  </div>'
      + '</div>'
      + '</div>';
  }

  // ============================================================================
  // 概覽儀表板渲染
  // ============================================================================

  function renderOverviewView() {
    const config = MEA.state.publicConfig || {};
    const user = MEA.state.user || {};
    const courses = MEA.state.courses || {};

    return '<div class="panel overview-panel">'
      + '<div class="panel-header">'
      + '  <div>'
      + '    <h2 class="panel-title">系統概覽儀表板</h2>'
      + '    <p class="panel-sub">Google Apps Script 網頁應用程式範本核心運作狀態</p>'
      + '  </div>'
      + '</div>'
      + '<div class="metrics-grid">'
      + '  <div class="metric-card">'
      + '    <div class="metric-label">目前學年度 / 學期</div>'
      + '    <div class="metric-value">' + escapeHtml(config.schoolYear || "114") + ' - ' + escapeHtml(config.semester || "1") + '</div>'
      + '    <div class="metric-sub">系統作業環境</div>'
      + '  </div>'
      + '  <div class="metric-card">'
      + '    <div class="metric-label">已登入使用者</div>'
      + '    <div class="metric-value">' + escapeHtml(user.name || user.email) + '</div>'
      + '    <div class="metric-sub">角色權限：' + escapeHtml(user.roleName || user.role) + '</div>'
      + '  </div>'
      + '  <div class="metric-card">'
      + '    <div class="metric-label">OAuth 登入機制</div>'
      + '    <div class="metric-value">' + (config.clientId ? '已配置 Client ID' : '使用 ActiveUser') + '</div>'
      + '    <div class="metric-sub">Google Identity Services</div>'
      + '  </div>'
      + '</div>'
      + '<div class="card mt-4">'
      + '  <h3 class="card-title">🚀 範本功能快速導覽</h3>'
      + '  <div class="feature-grid mt-3">'
      + '    <div class="feature-item" onclick="MEA.setTab(\'import\')">'
      + '      <div class="feature-icon">📥</div>'
      + '      <div class="feature-text">'
      + '        <h4>課程代碼匯入與 1NF 正規化</h4>'
      + '        <p>支援 39 欄課綱寬表 Excel 檔案上傳，全數匯入並展開為 14 欄標準 1NF 課程索引。</p>'
      + '      </div>'
      + '    </div>'
      + '    <div class="feature-item" onclick="MEA.setTab(\'courses\')">'
      + '      <div class="feature-icon">📚</div>'
      + '      <div class="feature-text">'
      + '        <h4>正規化課程檢索與分頁</h4>'
      + '        <p>提供多維度關鍵字、學年、學期、科別篩選機制，支援大批量課程資料快速檢索。</p>'
      + '      </div>'
      + '    </div>'
      + '    <div class="feature-item" onclick="MEA.setTab(\'settings\')">'
      + '      <div class="feature-icon">⚙️</div>'
      + '      <div class="feature-text">'
      + '        <h4>系統設定與授權管理 (RBAC)</h4>'
      + '        <p>維護 Google OAuth 2.0 Client ID、學期參數與系統存取授權白名單。</p>'
      + '      </div>'
      + '    </div>'
      + '  </div>'
      + '</div>'
      + '</div>';
  }

  MEA.ui = {
    escapeHtml: escapeHtml,
    number: number,
    roleName: roleName,
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
})(window.MEA);
