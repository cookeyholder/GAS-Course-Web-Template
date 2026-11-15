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

  function render() {
    const mount = document.getElementById("app");
    if (!mount) return;

    const state = MEA.state;
    const view = state.view;

    if (view === "loading") {
      mount.innerHTML = '<div class="login-container">'
        + '<div class="login-card text-center py-12">'
        + '  <div class="spinner mb-4"></div>'
        + '  <div class="text-muted">正在初始化系統連線與設定...</div>'
        + '</div>'
        + '</div>';
      return;
    }

    if (view === "login") {
      mount.innerHTML = MEA.ui.renderLoginView();
      setTimeout(function () {
        MEA.auth.renderGoogleButton();
      }, 50);
      return;
    }

    // App 主要畫面
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

    mount.innerHTML = '<div class="app-layout">'
      + MEA.ui.renderHeader()
      + MEA.ui.renderNavbar()
      + '<main class="app-content">' + bodyHtml + '</main>'
      + '</div>';
  }

  function init() {
    MEA.ui.initThemeAndStyle();
    MEA.subscribe(render);

    // 取得公開設定並嘗試還原 Session
    MEA.api.call("getPublicConfig", {})
      .then(function (configRes) {
        if (configRes && configRes.ok) {
          MEA.setState({ publicConfig: configRes });
        }
        MEA.auth.restore();
      })
      .catch(function () {
        MEA.auth.restore();
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
