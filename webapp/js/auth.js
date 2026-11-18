/**
 * @file auth.js
 * @description Google Identity Services (GIS) 登入、GAS 雙軌登入、工作階段還原與登出
 *
 * 採 UMD 工廠模式：Node.js 測試環境可直接匯入純函式與控制器工廠；
 * 瀏覽器環境則由檔案上方組裝邏輯建立 window.MEA.auth，維持既有呼叫契約。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    MEA.auth = api.createAuthController({
      MEA: MEA,
      document: window.document,
      window: window,
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
  const CLIENT_ID_HINT_HTML = '<div class="login-hint">尚未設定 OAuth Client ID；本機測試請於網址加上 ?mock=true</div>';
  const DEFAULT_LOGIN_ERROR = "登入失敗，請稍後再試";
  const MISSING_CLIENT_ID_ERROR = "尚未設定 OAuth Client ID，請系統管理員先於「系統設定」完成設定";
  const MISSING_CLIENT_SECRET_ERROR = "尚未設定 OAuth Client Secret，請系統管理員先於「系統設定」完成設定";
  const MISSING_WEBAPP_URL_ERROR = "無法取得 Web App 網址，請確認部署狀態後重新整理頁面";
  const MISSING_CHOOSER_URL_ERROR = "無法建立 Google 帳戶切換網址，請稍後再試";
  const BOOTSTRAP_TOAST_MESSAGE = "初次登入已自動開通系統管理員權限！";

  // ---------------------------------------------------------------------------
  // 純函式：登入結果轉換
  // ---------------------------------------------------------------------------

  function isOkResult(result) {
    return !!(result && result.ok === true);
  }

  function buildLoginFailureState(result) {
    return {
      view: "login",
      loginBusy: false,
      loginError: (result && result.message) || DEFAULT_LOGIN_ERROR
    };
  }

  function buildLoginUser(result, roleNames) {
    const roles = roleNames || {};
    return {
      email: result.email || "",
      name: result.name || result.email || "",
      role: result.role || "",
      roleName: result.roleName || roles[result.role] || result.role,
      perms: Array.isArray(result.perms) ? result.perms : [],
      csrfToken: result.csrfToken || ""
    };
  }

  function buildLoginSuccessState(user) {
    return {
      view: "app",
      user: user,
      loginBusy: false,
      loginError: ""
    };
  }

  function getLoginToast(user, bootstrapped) {
    if (bootstrapped) {
      return { message: BOOTSTRAP_TOAST_MESSAGE, level: "warn" };
    }
    return { message: "歡迎回來，" + user.name + "！", level: "ok" };
  }

  function applyCsrfToken(api, csrfToken) {
    if (csrfToken) api.setCsrfToken(csrfToken);
  }

  function invokeFetchCourses(MEA) {
    if (MEA.courses && typeof MEA.courses.fetchList === "function") {
      MEA.courses.fetchList(1);
    }
  }

  // ---------------------------------------------------------------------------
  // 純函式：網址建立與導向
  // ---------------------------------------------------------------------------

  function encodeAuthState(redirectUri, options) {
    const settings = options || {};
    try {
      if (typeof settings.btoa !== "function") return "";
      const random =
        typeof settings.random === "function"
          ? settings.random
          : function () {
              return Math.random();
            };
      const now =
        typeof settings.now === "function"
          ? settings.now
          : function () {
              return Date.now();
            };
      const nonce = random().toString(36).substring(2) + now().toString(36);
      return settings.btoa(JSON.stringify({ nonce: nonce, redirectUri: redirectUri }));
    } catch (error) {
      return "";
    }
  }

  function buildGoogleAuthUrlWithOptions(clientId, redirectUri, options) {
    const state = encodeAuthState(redirectUri, options);
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

  function buildChooserContinueUrl(webAppUrl) {
    const target = String(webAppUrl || "").trim();
    if (target === "") return "";
    return target + (target.indexOf("?") === -1 ? "?" : "&") + "switch=1";
  }

  function normalizeAllowedDomain(allowedDomain) {
    return String(allowedDomain || "")
      .trim()
      .replace(/^@/, "");
  }

  function buildAccountChooserUrl(webAppUrl, allowedDomain) {
    const continueUrl = buildChooserContinueUrl(webAppUrl);
    if (continueUrl === "") return "";
    let url = GOOGLE_ACCOUNT_CHOOSER_URL + "?continue=" + encodeURIComponent(continueUrl);
    const domain = normalizeAllowedDomain(allowedDomain);
    if (domain !== "") {
      url += "&hd=" + encodeURIComponent(domain);
    }
    return url;
  }

  function resolveWebAppUrl(config, win) {
    const source = config || {};
    const host = win || {};
    return String(source.webAppUrl || host.GAS_WEBAPP_URL || "").trim();
  }

  function validateRedirectSetup(config, win) {
    const source = config || {};
    const clientId = String(source.clientId || "").trim();
    if (clientId === "") {
      return { clientId: "", redirectUri: "", message: MISSING_CLIENT_ID_ERROR };
    }
    if (source.hasClientSecret === false) {
      return { clientId: clientId, redirectUri: "", message: MISSING_CLIENT_SECRET_ERROR };
    }
    const redirectUri = resolveWebAppUrl(source, win);
    if (redirectUri === "") {
      return { clientId: clientId, redirectUri: "", message: MISSING_WEBAPP_URL_ERROR };
    }
    return { clientId: clientId, redirectUri: redirectUri, message: "" };
  }

  function navigateToUrl(win, url) {
    const host = win || {};
    try {
      if (host.top && host.top !== host) {
        host.top.location.href = url;
      } else {
        host.location.href = url;
      }
    } catch (error) {
      host.open(url, "_top");
    }
  }

  // ---------------------------------------------------------------------------
  // 純函式：Google 按鈕與工作階段還原
  // ---------------------------------------------------------------------------

  function detectGasHosting(config, google) {
    const source = config || {};
    return !(source.mock || !google || !google.script || typeof google.script.run !== "object");
  }

  function buildGasHostedLoginButtonHtml(loginBusy) {
    const busy = loginBusy ? " disabled" : "";
    return (
      '<button type="button" class="btn google-redirect-btn" onclick="MEA.auth.switchGoogleAccount()"' +
      busy +
      ">" +
      GOOGLE_LOGO_SVG +
      "<span>使用 Google 帳號登入</span>" +
      "</button>"
    );
  }

  function prepareGoogleButton(options) {
    const settings = options || {};
    if (settings.mock) return null;
    const doc = settings.document;
    const host = doc && typeof doc.getElementById === "function" ? doc.getElementById("googleLoginButton") : null;
    if (!host) return null;
    const publicConfig = settings.publicConfig || {};
    const clientId = String(publicConfig.clientId || "").trim();
    if (settings.gasHosted) {
      return {
        host: host,
        html: buildGasHostedLoginButtonHtml(settings.loginBusy),
        clientId: ""
      };
    }
    if (clientId === "") {
      return { host: host, html: CLIENT_ID_HINT_HTML, clientId: "" };
    }
    return { host: host, html: "", clientId: clientId };
  }

  function buildGisInitializeOptions(clientId, callback) {
    return {
      client_id: clientId,
      callback: callback,
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: "popup"
    };
  }

  function buildGisRenderOptions(theme) {
    return {
      type: "standard",
      theme: theme === "dark" ? "filled_black" : "outline",
      size: "large",
      text: "signin_with",
      shape: "rectangular",
      logo_alignment: "left",
      locale: "zh_TW",
      width: 280
    };
  }

  function buildSessionUser(result, roleNames) {
    const roles = roleNames || {};
    return {
      email: result.email || "",
      name: result.name || "",
      role: result.role || "",
      roleName: result.roleName || roles[result.role] || result.role,
      perms: Array.isArray(result.perms) ? result.perms : [],
      csrfToken: result.csrfToken || ""
    };
  }

  function buildSessionSuccessState(result, roleNames) {
    return { view: "app", user: buildSessionUser(result, roleNames) };
  }

  function getSessionErrorMessage(result) {
    if (!result || result.error === "missing_token") return "";
    return result.message || "";
  }

  function buildSessionFailureState(result) {
    return { view: "login", loginError: getSessionErrorMessage(result) };
  }

  // ---------------------------------------------------------------------------
  // 控制器工廠：組裝 MEA.auth 公開方法
  // ---------------------------------------------------------------------------

  function createAuthController(deps) {
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

    let gisPromise = null;
    let initializedClientId = "";

    function getRoleNames() {
      return (MEA.config && MEA.config.roleNames) || {};
    }

    function isMock() {
      return !!(MEA.config && MEA.config.mock);
    }

    function getPublicConfig() {
      return (MEA.state && MEA.state.publicConfig) || {};
    }

    function isGasHosted() {
      return detectGasHosting(MEA.config, win ? win.google : null);
    }

    function loadGis() {
      if (gisPromise) return gisPromise;
      gisPromise = new Promise(function (resolve, reject) {
        const host = win || {};
        if (host.google && host.google.accounts && host.google.accounts.id) {
          resolve(host.google.accounts.id);
          return;
        }
        const existing =
          doc && typeof doc.querySelector === "function" ? doc.querySelector('script[data-gas-gis="1"]') : null;
        if (existing) {
          existing.addEventListener("load", function () {
            resolve(host.google.accounts.id);
          });
          existing.addEventListener("error", function () {
            reject(new Error("Google 登入服務載入失敗"));
          });
          return;
        }
        const script = doc.createElement("script");
        script.src = GIS_SRC;
        script.async = true;
        script.defer = true;
        script.dataset.gasGis = "1";
        script.onload = function () {
          if (host.google && host.google.accounts && host.google.accounts.id) {
            resolve(host.google.accounts.id);
          } else {
            reject(new Error("Google 登入服務載入失敗"));
          }
        };
        script.onerror = function () {
          reject(new Error("Google 登入服務載入失敗，請檢查網路連線"));
        };
        doc.head.appendChild(script);
      });
      return gisPromise;
    }

    function applyLoginSuccess(result) {
      if (!isOkResult(result)) {
        MEA.setState(buildLoginFailureState(result));
        return Promise.resolve(null);
      }
      MEA.api.setToken(result.token || "");
      applyCsrfToken(MEA.api, result.csrfToken);
      const user = buildLoginUser(result, getRoleNames());
      MEA.setState(buildLoginSuccessState(user));
      const toast = getLoginToast(user, result.bootstrapped);
      MEA.ui.toast(toast.message, toast.level);
      invokeFetchCourses(MEA);
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
      return buildGoogleAuthUrlWithOptions(clientId, redirectUri, {
        btoa: win && typeof win.btoa === "function" ? win.btoa.bind(win) : null
      });
    }

    function switchGoogleAccount() {
      const config = getPublicConfig();
      const webAppUrl = resolveWebAppUrl(config, win);
      if (webAppUrl === "") {
        MEA.setState({ loginBusy: false, loginError: MISSING_WEBAPP_URL_ERROR });
        return;
      }
      const authUrl = buildAccountChooserUrl(webAppUrl, config.allowedDomain || "");
      if (authUrl === "") {
        MEA.setState({ loginBusy: false, loginError: MISSING_CHOOSER_URL_ERROR });
        return;
      }
      MEA.setState({ loginBusy: true, loginError: "" });
      navigateToUrl(win, authUrl);
    }

    function loginWithGoogleRedirect() {
      const setup = validateRedirectSetup(getPublicConfig(), win);
      if (setup.message !== "") {
        MEA.setState({ loginError: setup.message });
        return;
      }
      MEA.setState({ loginBusy: true, loginError: "" });
      const authUrl = buildGoogleAuthUrl(setup.clientId, setup.redirectUri);
      navigateToUrl(win, authUrl);
    }

    function loginActiveUser() {
      MEA.setState({ loginBusy: true, loginError: "" });
      MEA.api.call("loginWithActiveUser", {}).then(applyLoginSuccess);
    }

    function createGisReadyHandler(host, clientId) {
      return function (id) {
        if (initializedClientId !== clientId) {
          id.initialize(buildGisInitializeOptions(clientId, handleCredential));
          initializedClientId = clientId;
        }
        host.innerHTML = "";
        id.renderButton(host, buildGisRenderOptions(MEA.ui.currentTheme()));
      };
    }

    function handleGisFailure(error) {
      MEA.setState({ loginError: String(error && error.message ? error.message : error) });
    }

    function renderGoogleButton() {
      const prepared = prepareGoogleButton({
        mock: isMock(),
        publicConfig: getPublicConfig(),
        document: doc,
        gasHosted: isGasHosted(),
        loginBusy: !!(MEA.state && MEA.state.loginBusy)
      });
      if (!prepared) return;
      if (prepared.html !== "") {
        prepared.host.innerHTML = prepared.html;
        return;
      }
      loadGis().then(createGisReadyHandler(prepared.host, prepared.clientId)).catch(handleGisFailure);
    }

    function loginMock() {
      MEA.setState({ loginBusy: true, loginError: "" });
      MEA.api.call("login", { mock: true }).then(applyLoginSuccess);
    }

    function scheduleRenderGoogleButton() {
      setTimeoutFn(renderGoogleButton, 50);
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
        scheduleRenderGoogleButton();
      });
    }

    function applySessionSuccess(result) {
      if (!isOkResult(result)) return false;
      applyCsrfToken(MEA.api, result.csrfToken);
      MEA.setState(buildSessionSuccessState(result, getRoleNames()));
      invokeFetchCourses(MEA);
      return true;
    }

    function restore() {
      const token = MEA.api.getToken();
      if (isMock()) {
        MEA.api.call("getSession", {}).then(function (result) {
          if (!applySessionSuccess(result)) {
            MEA.setState({ view: "login" });
            scheduleRenderGoogleButton();
          }
        });
        return;
      }
      if (!token) {
        MEA.setState({ view: "login" });
        scheduleRenderGoogleButton();
        return;
      }
      MEA.api.call("getSession", { token: token }).then(function (result) {
        if (!applySessionSuccess(result)) {
          MEA.api.setToken("");
          MEA.api.setCsrfToken("");
          MEA.setState(buildSessionFailureState(result));
          scheduleRenderGoogleButton();
        }
      });
    }

    return {
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
  }

  return {
    createAuthController: createAuthController,
    isOkResult: isOkResult,
    buildLoginFailureState: buildLoginFailureState,
    buildLoginUser: buildLoginUser,
    buildLoginSuccessState: buildLoginSuccessState,
    getLoginToast: getLoginToast,
    applyCsrfToken: applyCsrfToken,
    invokeFetchCourses: invokeFetchCourses,
    encodeAuthState: encodeAuthState,
    buildGoogleAuthUrl: buildGoogleAuthUrlWithOptions,
    buildChooserContinueUrl: buildChooserContinueUrl,
    normalizeAllowedDomain: normalizeAllowedDomain,
    buildAccountChooserUrl: buildAccountChooserUrl,
    resolveWebAppUrl: resolveWebAppUrl,
    validateRedirectSetup: validateRedirectSetup,
    navigateToUrl: navigateToUrl,
    detectGasHosting: detectGasHosting,
    buildGasHostedLoginButtonHtml: buildGasHostedLoginButtonHtml,
    prepareGoogleButton: prepareGoogleButton,
    buildGisInitializeOptions: buildGisInitializeOptions,
    buildGisRenderOptions: buildGisRenderOptions,
    buildSessionUser: buildSessionUser,
    buildSessionSuccessState: buildSessionSuccessState,
    getSessionErrorMessage: getSessionErrorMessage,
    buildSessionFailureState: buildSessionFailureState,
    constants: {
      GIS_SRC: GIS_SRC,
      GOOGLE_AUTH_URL: GOOGLE_AUTH_URL,
      GOOGLE_ACCOUNT_CHOOSER_URL: GOOGLE_ACCOUNT_CHOOSER_URL,
      CLIENT_ID_HINT_HTML: CLIENT_ID_HINT_HTML,
      DEFAULT_LOGIN_ERROR: DEFAULT_LOGIN_ERROR
    }
  };
});
