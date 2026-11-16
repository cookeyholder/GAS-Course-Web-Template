/**
 * @file auth.js
 * @description Google Identity Services (GIS) 登入、工作階段還原與登出
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  const GIS_SRC = "https://accounts.google.com/gsi/client";
  let gisPromise = null;
  let initializedClientId = "";

  function loadGis() {
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        resolve(window.google.accounts.id);
        return;
      }
      const existing = document.querySelector('script[data-gas-gis="1"]');
      if (existing) {
        existing.addEventListener("load", function () { resolve(window.google.accounts.id); });
        existing.addEventListener("error", function () { reject(new Error("Google 登入服務載入失敗")); });
        return;
      }
      const script = document.createElement("script");
      script.src = GIS_SRC;
      script.async = true;
      script.defer = true;
      script.dataset.gasGis = "1";
      script.onload = function () {
        if (window.google && window.google.accounts && window.google.accounts.id) {
          resolve(window.google.accounts.id);
        } else {
          reject(new Error("Google 登入服務載入失敗"));
        }
      };
      script.onerror = function () { reject(new Error("Google 登入服務載入失敗，請檢查網路連線")); };
      document.head.appendChild(script);
    });
    return gisPromise;
  }

  function applyLoginSuccess(result) {
    if (!result || result.ok !== true) {
      MEA.setState({
        view: "login",
        loginBusy: false,
        loginError: (result && result.message) || "登入失敗，請稍後再試"
      });
      return Promise.resolve(null);
    }

    MEA.api.setToken(result.token || "");
    const user = {
      email: result.email || "",
      name: result.name || result.email || "",
      role: result.role || "",
      roleName: result.roleName || (MEA.config.roleNames && MEA.config.roleNames[result.role]) || result.role,
      perms: Array.isArray(result.perms) ? result.perms : []
    };

    MEA.setState({
      view: "app",
      user: user,
      loginBusy: false,
      loginError: ""
    });

    if (result.bootstrapped) {
      MEA.ui.toast("初次登入已自動開通系統管理員權限！", "warn");
    } else {
      MEA.ui.toast("歡迎回來，" + user.name + "！", "ok");
    }

    // 若有課程檢索模組，載入首頁資料
    if (MEA.courses && typeof MEA.courses.fetchList === "function") {
      MEA.courses.fetchList(1);
    }

    return Promise.resolve(user);
  }

  function handleCredential(response) {
    const credential = response && response.credential ? String(response.credential) : "";
    if (credential === "") {
      MEA.setState({ loginBusy: false, loginError: "未取得 Google 登入憑證，請重試" });
      return;
    }
    MEA.setState({ loginBusy: true, loginError: "" });
    MEA.api.call("login", { credential: credential }).then(applyLoginSuccess);
  }

  function renderGoogleButton() {
    if (MEA.config.mock) return;
    const config = MEA.state.publicConfig || {};
    const clientId = String(config.clientId || "");
    const host = document.getElementById("googleLoginButton");
    if (!host) return;

    if (clientId === "") {
      host.innerHTML = '<div style="font-size:12px; color:var(--ink-3); padding:8px 0;">（尚未於後端設定 OAuth Client ID，請使用下方 Workspace 登入）</div>';
      return;
    }

    loadGis().then(function (id) {
      if (initializedClientId !== clientId) {
        id.initialize({
          client_id: clientId,
          callback: handleCredential,
          auto_select: false,
          cancel_on_tap_outside: true,
          ux_mode: "popup"
        });
        initializedClientId = clientId;
      }
      host.innerHTML = "";
      id.renderButton(host, {
        type: "standard",
        theme: MEA.ui.currentTheme() === "dark" ? "filled_black" : "outline",
        size: "large",
        text: "signin_with",
        shape: "rectangular",
        logo_alignment: "left",
        locale: "zh_TW",
        width: 280
      });
    }).catch(function (error) {
      MEA.setState({ loginError: String(error && error.message ? error.message : error) });
    });
  }

  function loginMock() {
    MEA.setState({ loginBusy: true, loginError: "" });
    MEA.api.call("login", { mock: true }).then(applyLoginSuccess);
  }

  function logout() {
    MEA.api.call("logout", {}).then(function () {
      MEA.api.setToken("");
      MEA.setState({
        view: "login",
        user: null,
        loginError: "",
        loginBusy: false
      });
      setTimeout(renderGoogleButton, 50);
    });
  }

  function restore() {
    const token = MEA.api.getToken();
    if (MEA.config.mock) {
      MEA.api.call("getSession", {}).then(function (result) {
        if (result && result.ok === true) {
          MEA.setState({
            view: "app",
            user: {
              email: result.email || "",
              name: result.name || "",
              role: result.role || "",
              roleName: result.roleName || (MEA.config.roleNames && MEA.config.roleNames[result.role]) || result.role,
              perms: Array.isArray(result.perms) ? result.perms : []
            }
          });
          if (MEA.courses && typeof MEA.courses.fetchList === "function") {
            MEA.courses.fetchList(1);
          }
        } else {
          MEA.setState({ view: "login" });
          setTimeout(renderGoogleButton, 50);
        }
      });
      return;
    }

    if (!token) {
      MEA.setState({ view: "login" });
      setTimeout(renderGoogleButton, 50);
      return;
    }

    MEA.api.call("getSession", { token: token }).then(function (result) {
      if (result && result.ok === true) {
        MEA.setState({
          view: "app",
          user: {
            email: result.email || "",
            name: result.name || "",
            role: result.role || "",
            roleName: result.roleName || (MEA.config.roleNames && MEA.config.roleNames[result.role]) || result.role,
            perms: Array.isArray(result.perms) ? result.perms : []
          }
        });
        if (MEA.courses && typeof MEA.courses.fetchList === "function") {
          MEA.courses.fetchList(1);
        }
      } else {
        MEA.api.setToken("");
        MEA.setState({
          view: "login",
          loginError: result && result.error !== "invalid_token" ? ((result && result.message) || "") : ""
        });
        setTimeout(renderGoogleButton, 50);
      }
    });
  }

  MEA.auth = {
    loadGis: loadGis,
    renderGoogleButton: renderGoogleButton,
    handleCredential: handleCredential,
    applyLoginSuccess: applyLoginSuccess,
    loginMock: loginMock,
    logout: logout,
    restore: restore
  };
})(window.MEA);
