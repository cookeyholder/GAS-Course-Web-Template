/**
 * @file auth.js
 * @description Google Identity Services (GIS) 登入、GAS 雙軌登入、工作階段還原與登出
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  const GIS_SRC = "https://accounts.google.com/gsi/client";
  const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
  const GOOGLE_ACCOUNT_CHOOSER_URL = "https://accounts.google.com/AccountChooser";
  const GOOGLE_LOGO_SVG =
    '<svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">' +
    '<path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>' +
    '<path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>' +
    '<path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>' +
    '<path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>' +
    "</svg>";

  let gisPromise = null;
  let initializedClientId = "";

  function isGasHosted() {
    return (
      !MEA.config.mock &&
      typeof window.google !== "undefined" &&
      window.google.script &&
      typeof window.google.script.run === "object"
    );
  }

  function loadGis() {
    if (gisPromise) return gisPromise;
    gisPromise = new Promise(function (resolve, reject) {
      if (window.google && window.google.accounts && window.google.accounts.id) {
        resolve(window.google.accounts.id);
        return;
      }
      const existing = document.querySelector('script[data-gas-gis="1"]');
      if (existing) {
        existing.addEventListener("load", function () {
          resolve(window.google.accounts.id);
        });
        existing.addEventListener("error", function () {
          reject(new Error("Google 登入服務載入失敗"));
        });
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
      script.onerror = function () {
        reject(new Error("Google 登入服務載入失敗，請檢查網路連線"));
      };
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
    if (result.csrfToken) {
      MEA.api.setCsrfToken(result.csrfToken);
    }

    const user = {
      email: result.email || "",
      name: result.name || result.email || "",
      role: result.role || "",
      roleName: result.roleName || (MEA.config.roleNames && MEA.config.roleNames[result.role]) || result.role,
      perms: Array.isArray(result.perms) ? result.perms : [],
      csrfToken: result.csrfToken || ""
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

  function buildGoogleAuthUrl(clientId, redirectUri) {
    let state = "";
    try {
      state = window.btoa(
        JSON.stringify({
          nonce: Math.random().toString(36).substring(2) + Date.now().toString(36),
          redirectUri: redirectUri
        })
      );
    } catch (e) {
      state = "";
    }
    return (
      GOOGLE_AUTH_URL +
      "?client_id=" +
      encodeURIComponent(clientId) +
      "&redirect_uri=" +
      encodeURIComponent(redirectUri) +
      "&response_type=code" +
      "&scope=" +
      encodeURIComponent("openid email profile") +
      "&access_type=online" +
      "&prompt=select_account" +
      "&state=" +
      encodeURIComponent(state)
    );
  }

  function buildAccountChooserUrl(webAppUrl, allowedDomain) {
    const target = String(webAppUrl || "").trim();
    if (target === "") return "";
    const continueUrl = target + (target.indexOf("?") === -1 ? "?" : "&") + "switch=1";
    let url = GOOGLE_ACCOUNT_CHOOSER_URL + "?continue=" + encodeURIComponent(continueUrl);
    const domain = String(allowedDomain || "")
      .trim()
      .replace(/^@/, "");
    if (domain !== "") {
      url += "&hd=" + encodeURIComponent(domain);
    }
    return url;
  }

  function switchGoogleAccount() {
    const config = MEA.state.publicConfig || {};
    const webAppUrl = String(config.webAppUrl || window.GAS_WEBAPP_URL || "").trim();
    if (webAppUrl === "") {
      MEA.setState({ loginBusy: false, loginError: "無法取得 Web App 網址，請確認部署狀態後重新整理頁面" });
      return;
    }
    const authUrl = buildAccountChooserUrl(webAppUrl, config.allowedDomain || "");
    if (authUrl === "") {
      MEA.setState({ loginBusy: false, loginError: "無法建立 Google 帳戶切換網址，請稍後再試" });
      return;
    }
    MEA.setState({ loginBusy: true, loginError: "" });
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = authUrl;
      } else {
        window.location.href = authUrl;
      }
    } catch (e) {
      window.open(authUrl, "_top");
    }
  }

  function loginWithGoogleRedirect() {
    const config = MEA.state.publicConfig || {};
    const clientId = String(config.clientId || "").trim();
    if (clientId === "") {
      MEA.setState({ loginError: "尚未設定 OAuth Client ID，請系統管理員先於「系統設定」完成設定" });
      return;
    }
    if (config.hasClientSecret === false) {
      MEA.setState({ loginError: "尚未設定 OAuth Client Secret，請系統管理員先於「系統設定」完成設定" });
      return;
    }
    const redirectUri = String(config.webAppUrl || window.GAS_WEBAPP_URL || "").trim();
    if (redirectUri === "") {
      MEA.setState({ loginError: "無法取得 Web App 網址，請確認部署狀態後重新整理頁面" });
      return;
    }

    MEA.setState({ loginBusy: true, loginError: "" });
    const authUrl = buildGoogleAuthUrl(clientId, redirectUri);
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = authUrl;
      } else {
        window.location.href = authUrl;
      }
    } catch (e) {
      window.open(authUrl, "_top");
    }
  }

  function loginActiveUser() {
    MEA.setState({ loginBusy: true, loginError: "" });
    MEA.api.call("loginWithActiveUser", {}).then(applyLoginSuccess);
  }

  function renderGoogleButton() {
    if (MEA.config.mock) return;
    const config = MEA.state.publicConfig || {};
    const clientId = String(config.clientId || "").trim();
    const host = document.getElementById("googleLoginButton");
    if (!host) return;

    if (isGasHosted()) {
      const busy = MEA.state.loginBusy ? " disabled" : "";
      host.innerHTML =
        '<button type="button" class="btn google-redirect-btn" onclick="MEA.auth.switchGoogleAccount()"' +
        busy +
        ">" +
        GOOGLE_LOGO_SVG +
        "<span>使用 Google 帳號登入</span>" +
        "</button>";
      return;
    }

    if (clientId === "") {
      host.innerHTML = '<div class="login-hint">尚未設定 OAuth Client ID；本機測試請於網址加上 ?mock=true</div>';
      return;
    }

    loadGis()
      .then(function (id) {
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
      })
      .catch(function (error) {
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
      MEA.api.setCsrfToken("");
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
          if (result.csrfToken) MEA.api.setCsrfToken(result.csrfToken);
          MEA.setState({
            view: "app",
            user: {
              email: result.email || "",
              name: result.name || "",
              role: result.role || "",
              roleName: result.roleName || (MEA.config.roleNames && MEA.config.roleNames[result.role]) || result.role,
              perms: Array.isArray(result.perms) ? result.perms : [],
              csrfToken: result.csrfToken || ""
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
        if (result.csrfToken) {
          MEA.api.setCsrfToken(result.csrfToken);
        }
        MEA.setState({
          view: "app",
          user: {
            email: result.email || "",
            name: result.name || "",
            role: result.role || "",
            roleName: result.roleName || (MEA.config.roleNames && MEA.config.roleNames[result.role]) || result.role,
            perms: Array.isArray(result.perms) ? result.perms : [],
            csrfToken: result.csrfToken || ""
          }
        });
        if (MEA.courses && typeof MEA.courses.fetchList === "function") {
          MEA.courses.fetchList(1);
        }
      } else {
        MEA.api.setToken("");
        MEA.api.setCsrfToken("");
        MEA.setState({
          view: "login",
          loginError: result && result.error !== "missing_token" ? (result && result.message) || "" : ""
        });
        setTimeout(renderGoogleButton, 50);
      }
    });
  }

  MEA.auth = {
    loadGis: loadGis,
    isGasHosted: isGasHosted,
    buildGoogleAuthUrl: buildGoogleAuthUrl,
    buildAccountChooserUrl: buildAccountChooserUrl,
    switchGoogleAccount: switchGoogleAccount,
    loginWithGoogleRedirect: loginWithGoogleRedirect,
    loginActiveUser: loginActiveUser,
    renderGoogleButton: renderGoogleButton,
    handleCredential: handleCredential,
    applyLoginSuccess: applyLoginSuccess,
    loginMock: loginMock,
    logout: logout,
    restore: restore
  };
})(window.MEA);
