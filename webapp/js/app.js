/**
 * @file app.js
 * @description 前端主進入點、路由切換與畫面掛載
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  function setTab(tabId) {
    MEA.setState({ tab: tabId });
    if (tabId === "courses") {
      if (MEA.courses && typeof MEA.courses.fetchList === "function") {
        MEA.courses.fetchList();
      }
    } else if (tabId === "settings") {
      if (MEA.accounts && typeof MEA.accounts.loadSettingsAndAccounts === "function") {
        MEA.accounts.loadSettingsAndAccounts();
      }
    }
  }

  function syncDocumentTitle() {
    const systemName = (MEA.state.publicConfig || {}).systemName;
    if (systemName && document.title !== systemName) {
      document.title = systemName;
    }
  }

  function cleanUrlQuery() {
    try {
      const topWin = window.top || window;
      if (topWin && topWin.history && topWin.history.replaceState && topWin.location) {
        const cleanUrl = topWin.location.href.split("?")[0].split("#")[0];
        topWin.history.replaceState({}, document.title, cleanUrl);
      }
    } catch (e) {}
  }

  function applyInitialAuth() {
    const initial = window.INITIAL_AUTH;
    if (!initial || typeof initial !== "object") return false;

    cleanUrlQuery();
    try {
      delete window.INITIAL_AUTH;
    } catch (e) {
      window.INITIAL_AUTH = null;
    }

    if (initial.ok === true) {
      MEA.auth.applyLoginSuccess(initial);
      return true;
    }

    if (MEA.api.getToken()) {
      MEA.auth.restore();
      if (initial.message) {
        MEA.setState({ loginError: initial.message });
      }
      return true;
    }

    MEA.setState({
      view: "login",
      loginBusy: false,
      loginError: initial.message || "Google 登入失敗，請重新嘗試"
    });
    return true;
  }

  function applyAccountSwitch() {
    if (!MEA.config.switchAccount) return false;
    cleanUrlQuery();
    MEA.api.setToken("");
    MEA.api.setCsrfToken("");
    MEA.auth.loginActiveUser();
    return true;
  }

  function render() {
    syncDocumentTitle();
    const mount = document.getElementById("app");
    if (!mount) return;

    const state = MEA.state;
    const view = state.view;

    if (view === "loading") {
      mount.innerHTML =
        '<div class="login-container">' +
        '<div class="login-card text-center py-12">' +
        '  <div class="spinner mb-4"></div>' +
        '  <div class="text-muted">正在初始化系統連線與設定...</div>' +
        "</div>" +
        "</div>";
      return;
    }

    if (view === "login") {
      mount.innerHTML = MEA.ui.renderLoginView();
      setTimeout(function () {
        MEA.auth.renderGoogleButton();
      }, 50);
      return;
    }

    const tab = state.tab || "overview";
    let bodyHtml = "";

    switch (tab) {
      case "import":
        bodyHtml = MEA.imports.renderView();
        break;
      case "courses":
        bodyHtml = MEA.courses.renderView();
        break;
      case "settings":
        bodyHtml = MEA.accounts.renderView();
        break;
      case "overview":
      default:
        bodyHtml = MEA.ui.renderOverviewView();
        break;
    }

    mount.innerHTML =
      '<div class="app-layout">' +
      MEA.ui.renderHeader() +
      MEA.ui.renderNavbar() +
      '<main class="app-content">' +
      bodyHtml +
      "</main>" +
      "</div>";
  }

  function init() {
    MEA.ui.initThemeAndStyle();
    MEA.subscribe(render);

    MEA.api
      .call("getPublicConfig", {})
      .then(function (configRes) {
        if (configRes && configRes.ok) {
          MEA.setState({ publicConfig: configRes });
          syncDocumentTitle();
        }
        if (!applyInitialAuth() && !applyAccountSwitch()) {
          MEA.auth.restore();
        }
      })
      .catch(function () {
        if (!applyInitialAuth() && !applyAccountSwitch()) {
          MEA.auth.restore();
        }
      });
  }

  MEA.setTab = setTab;
  MEA.render = render;
  MEA.init = init;

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.MEA);
