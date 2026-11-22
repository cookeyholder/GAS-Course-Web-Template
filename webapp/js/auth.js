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
    // task 6.1：僅註冊工廠，實例由 wiring.js 集中建立並注入最小介面。
    if (!MEA.factories) {
      MEA.factories = {};
    }
    MEA.factories.auth = api.createAuthController;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // 網域正規化規則單一來源（task 5.5）：瀏覽器由建置腳本先嵌入 gasRuntime，Node 由 require 取得。
  const gasRuntime = globalThis.gasRuntime || require("../../gasRuntime.js");

  // task 6.4：共用 Node require 相容墊片與 safeErrors 注入解析（Node 由 require 取得，瀏覽器由全域取得）。
  const moduleHelpers = typeof require === "function" ? require("./moduleHelpers.js") : globalThis.MEA.moduleHelpers;
  // 模組級純函式無法取得工廠注入，故使用共用解析結果做為安全訊息來源。
  const sharedSafeErrors = moduleHelpers.resolveSafeErrors();

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
  const DEFAULT_LOGOUT_ERROR = "登出失敗，請稍後再試";
  const SESSION_EXPIRED_ERROR = "工作階段已過期，請重新登入";
  const MISSING_CLIENT_ID_ERROR = "尚未設定 OAuth Client ID，請系統管理員先於「系統設定」完成設定";
  const MISSING_CLIENT_SECRET_ERROR = "尚未設定 OAuth Client Secret，請系統管理員先於「系統設定」完成設定";
  const MISSING_WEBAPP_URL_ERROR = "無法取得 Web App 網址，請確認部署狀態後重新整理頁面";
  const OAUTH_STATE_STORAGE_KEY = "gas_tmpl_oauth_state";
  const MISSING_CHOOSER_URL_ERROR = "無法建立 Google 帳戶切換網址，請稍後再試";

  // ---------------------------------------------------------------------------
  // 純函式：登入結果轉換
  // ---------------------------------------------------------------------------

  /**
   * 檢查 API 回應是否成功（ok === true）。
   *
   * @param {*} result - API 回應物件
   * @returns {boolean} 是否為成功結果
   */
  function isOkResult(result) {
    return !!(result && result.ok === true);
  }

  /**
   * 建立登入失敗時的狀態物件。
   *
   * @param {*} result - 失敗回應物件或錯誤
   * @returns {{view: string, loginBusy: boolean, loginError: string}} 登入失敗狀態
   */
  function buildLoginFailureState(result) {
    return {
      view: "login",
      loginBusy: false,
      loginError: sharedSafeErrors.resolveSafeMessage(result, DEFAULT_LOGIN_ERROR)
    };
  }

  /**
   * 將登入成功回應轉換為前端標準使用者物件。
   *
   * @param {Object} result - 登入回應物件
   * @param {Object} [roleNames] - 角色代碼至名稱之對照表
   * @returns {Object} 使用者資訊物件
   */
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

  /**
   * 建立登入成功時的狀態物件。
   *
   * @param {Object} user - 標準使用者物件
   * @returns {{view: string, user: Object, loginBusy: boolean, loginError: string}} 登入成功狀態
   */
  function buildLoginSuccessState(user) {
    return {
      view: "app",
      user: user,
      loginBusy: false,
      loginError: ""
    };
  }

  /**
   * 產生登入成功時之歡迎提示文字與等級。
   *
   * @param {Object} user - 使用者物件
   * @returns {{message: string, level: string}} 提示訊息與樣式等級
   */
  function getLoginToast(user) {
    return { message: "歡迎回來，" + user.name + "！", level: "ok" };
  }

  /**
   * 若回應中包含 CSRF Token，則更新至 API 客戶端。
   *
   * @param {Object} api - API 客戶端實例
   * @param {string} [csrfToken] - CSRF Token 字串
   */
  function applyCsrfToken(api, csrfToken) {
    if (csrfToken) api.setCsrfToken(csrfToken);
  }

  /**
   * 登入或還原後僅取得輕量統計，完整清單留待進入課程分頁時再載入。
   *
   * @param {Object} MEA - 前端全域命名空間
   */
  function invokeFetchStats(MEA) {
    if (MEA.courses && typeof MEA.courses.fetchStats === "function") {
      MEA.courses.fetchStats();
    }
  }

  // ---------------------------------------------------------------------------
  // 純函式：網址建立與導向
  // ---------------------------------------------------------------------------

  /**
   * 產生不可預測的 nonce：注入的 random 優先，其次 Web Crypto，最後為時間亂數備援。
   *
   * @param {Object} settings - 設定或依賴物件
   * @returns {string} 隨機 nonce 字串
   */
  function buildAuthNonce_(settings) {
    if (typeof settings.random === "function") {
      const now =
        typeof settings.now === "function"
          ? settings.now
          : function () {
              return Date.now();
            };
      return settings.random().toString(36).substring(2) + now().toString(36);
    }
    const cryptoObj =
      settings.crypto || (typeof globalThis !== "undefined" && globalThis.crypto ? globalThis.crypto : null);
    if (cryptoObj && typeof cryptoObj.getRandomValues === "function") {
      const bytes = new Uint8Array(16);
      cryptoObj.getRandomValues(bytes);
      let hex = "";
      for (let i = 0; i < bytes.length; i++) {
        hex += ("0" + bytes[i].toString(16)).slice(-2);
      }
      return hex;
    }
    return String(Date.now()) + Math.random().toString(36).substring(2);
  }

  /**
   * 取得用於保存 OAuth 狀態之 Storage 實例。
   *
   * @param {Object} settings - 依賴注入設定
   * @returns {Storage|null} sessionStorage 或 null
   */
  function getAuthStateStorage_(settings) {
    if (settings.sessionStorage) return settings.sessionStorage;
    if (typeof globalThis !== "undefined" && globalThis.sessionStorage) return globalThis.sessionStorage;
    return null;
  }

  /**
   * 保存 nonce 與 redirectUri 供回呼比對。
   *
   * @param {string} nonce - 隨機 nonce
   * @param {string} redirectUri - 重新導向目標網址
   * @param {Object} [options] - 設定選項
   * @returns {boolean} 是否成功保存
   */
  function saveAuthState(nonce, redirectUri, options) {
    const storage = getAuthStateStorage_(options || {});
    if (!storage || typeof storage.setItem !== "function") return false;
    try {
      storage.setItem(OAUTH_STATE_STORAGE_KEY, JSON.stringify({ nonce: nonce, redirectUri: redirectUri }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 讀取先前保存的 OAuth state。
   *
   * @param {Object} [options] - 設定選項
   * @returns {{nonce: string, redirectUri: string}|null} 保存之 state 或 null
   */
  function readAuthState(options) {
    const storage = getAuthStateStorage_(options || {});
    if (!storage || typeof storage.getItem !== "function") return null;
    try {
      const raw = storage.getItem(OAUTH_STATE_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed.nonce !== "string" || typeof parsed.redirectUri !== "string") return null;
      return { nonce: parsed.nonce, redirectUri: parsed.redirectUri };
    } catch (error) {
      return null;
    }
  }

  /**
   * 一次性清除已保存的 OAuth state。
   *
   * @param {Object} [options] - 設定選項
   * @returns {boolean} 是否成功清除
   */
  function clearAuthState(options) {
    const storage = getAuthStateStorage_(options || {});
    if (!storage || typeof storage.removeItem !== "function") return false;
    try {
      storage.removeItem(OAUTH_STATE_STORAGE_KEY);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 編碼並持久化 OAuth state 字串。
   *
   * @param {string} redirectUri - 重新導向網址
   * @param {Object} [options] - 依賴選項（如 btoa 實作）
   * @returns {string} Base64 編碼之 state 字串
   */
  function encodeAuthState(redirectUri, options) {
    const settings = options || {};
    try {
      if (typeof settings.btoa !== "function") return "";
      const nonce = buildAuthNonce_(settings);
      saveAuthState(nonce, redirectUri, settings);
      return settings.btoa(JSON.stringify({ nonce: nonce, redirectUri: redirectUri }));
    } catch (error) {
      return "";
    }
  }

  /**
   * 組裝 Google OAuth2 授權端點網址。
   *
   * @param {string} clientId - OAuth 用戶端 ID
   * @param {string} redirectUri - 授權後重新導向網址
   * @param {Object} [options] - state 編碼與亂數選項
   * @returns {string} 完整 Google 授權網址
   */
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

  /**
   * 建立 Google 帳戶切換後的接續目標網址（附帶 switch=1 參數）。
   *
   * @param {string} webAppUrl - Web App 網址
   * @returns {string} 接續導向網址
   */
  function buildChooserContinueUrl(webAppUrl) {
    const target = String(webAppUrl || "").trim();
    if (target === "") return "";
    return target + (target.indexOf("?") === -1 ? "?" : "&") + "switch=1";
  }

  /**
   * 正規化允許登入的 Google 託管網域（Delegates to gasRuntime.normalizeAllowedDomain）。
   *
   * @param {string} allowedDomain - 原始網域名稱字串
   * @returns {string} 正規化後之網域名稱
   */
  function normalizeAllowedDomain(allowedDomain) {
    return gasRuntime.normalizeAllowedDomain(allowedDomain);
  }

  /**
   * 建立 Google Account Chooser 網址，支援限定網域（hd 參數）。
   *
   * @param {string} webAppUrl - Web App 網址
   * @param {string} [allowedDomain] - 允許之網域
   * @returns {string} 完整帳戶選擇器網址
   */
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

  /**
   * 解析 Web App 網址，優先從設定取得，備援使用全域變數。
   *
   * @param {Object} [config] - 設定物件
   * @param {Object} [win] - 瀏覽器 window 物件
   * @returns {string} Web App 網址字串
   */
  function resolveWebAppUrl(config, win) {
    const source = config || {};
    const host = win || {};
    return String(source.webAppUrl || host.GAS_WEBAPP_URL || "").trim();
  }

  /**
   * 驗證重新導向登入所需之設定（clientId, hasClientSecret, webAppUrl）。
   *
   * @param {Object} [config] - 公開設定物件
   * @param {Object} [win] - 瀏覽器 window 物件
   * @returns {{clientId: string, redirectUri: string, message: string}} 驗證結果與錯誤訊息
   */
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

  /**
   * 將瀏覽器視窗導向至指定網址，支援 iframe top 跳脫。
   *
   * @param {Object} win - 瀏覽器 window 物件
   * @param {string} url - 目標網址
   */
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

  /**
   * 偵測當前是否處於 Google Apps Script 託管容器內（存在 google.script.run 且非 mock 模式）。
   *
   * @param {Object} [config] - 設定物件
   * @param {Object} [google] - google 全域物件
   * @returns {boolean} 是否為 GAS 託管環境
   */
  function detectGasHosting(config, google) {
    const source = config || {};
    return !(source.mock || !google || !google.script || typeof google.script.run !== "object");
  }

  /**
   * 建立 GAS 託管環境專用之 Google 登入按鈕 HTML。
   *
   * @param {boolean} [loginBusy] - 是否正在處理登入
   * @returns {string} 按鈕 HTML 字串
   */
  function buildGasHostedLoginButtonHtml(loginBusy) {
    const busy = loginBusy ? " disabled" : "";
    return (
      '<button type="button" class="btn google-redirect-btn" data-auth-action="switch-google-account"' +
      busy +
      ">" +
      GOOGLE_LOGO_SVG +
      "<span>使用 Google 帳號登入</span>" +
      "</button>"
    );
  }

  /**
   * 準備 Google 登入按鈕之掛載目標與內容結構。
   *
   * @param {Object} [options] - 環境與設定參數
   * @returns {{host: HTMLElement, html: string, clientId: string}|null} 按鈕準備設定或 null
   */
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

  /**
   * 建立 Google Identity Services 初始化設定物件。
   *
   * @param {string} clientId - OAuth Client ID
   * @param {Function} callback - 憑證回呼函式
   * @returns {Object} GIS 初始化選項
   */
  function buildGisInitializeOptions(clientId, callback) {
    return {
      client_id: clientId,
      callback: callback,
      auto_select: false,
      cancel_on_tap_outside: true,
      ux_mode: "popup"
    };
  }

  /**
   * 建立 Google Identity Services 渲染按鈕設定物件。
   *
   * @param {string} theme - 主題名稱（dark 或 light）
   * @returns {Object} GIS 按鈕樣式選項
   */
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

  /**
   * 將 Session 驗證回應組裝為標準使用者物件。
   *
   * @param {Object} result - getSession 回應物件
   * @param {Object} [roleNames] - 角色代碼對應名稱
   * @returns {Object} 使用者資訊物件
   */
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

  /**
   * 建立工作階段還原成功狀態物件。
   *
   * @param {Object} result - 回應成果物件
   * @param {Object} [roleNames] - 角色名稱字典
   * @returns {{view: string, user: Object}} 成功狀態
   */
  function buildSessionSuccessState(result, roleNames) {
    return { view: "app", user: buildSessionUser(result, roleNames) };
  }

  /**
   * 解析工作階段過期或無效之錯誤訊息。
   *
   * @param {Object} [result] - 回應物件
   * @returns {string} 提示訊息
   */
  function getSessionErrorMessage(result) {
    if (!result) return SESSION_EXPIRED_ERROR;
    if (result.error === "missing_token" || result.error === "session_expired" || result.error === "invalid_session") {
      return SESSION_EXPIRED_ERROR;
    }
    return result.message || SESSION_EXPIRED_ERROR;
  }

  /**
   * 正規化登出失敗訊息。
   *
   * @param {*} error - 例外或錯誤物件
   * @returns {string} 顯示給使用者的訊息
   */
  function normalizeLogoutError(error) {
    return sharedSafeErrors.resolveSafeMessage(error, DEFAULT_LOGOUT_ERROR);
  }

  /**
   * 建立工作階段還原失敗狀態物件。
   *
   * @param {Object} [result] - 回應物件
   * @returns {{view: string, loginError: string}} 登入失敗狀態
   */
  function buildSessionFailureState(result) {
    return { view: "login", loginError: getSessionErrorMessage(result) };
  }

  // ---------------------------------------------------------------------------
  // 控制器工廠：組裝 MEA.auth 公開方法
  // ---------------------------------------------------------------------------

  /**
   * 建立身分驗證控制器實例。
   *
   * @param {Object} [deps] - 依賴注入選項（包含 MEA、document、window、setTimeoutFn）
   * @returns {Object} 身分驗證控制器操作介面
   */
  function createAuthController(deps) {
    const options = deps || {};
    const safeErrors = moduleHelpers.resolveSafeErrors(options);
    const MEA = options.MEA || (typeof window !== "undefined" ? window.MEA : null) || {};
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    const win = options.window || (typeof window !== "undefined" ? window : null);
    const setTimeoutFn =
      typeof options.setTimeoutFn === "function"
        ? options.setTimeoutFn
        : function (fn, ms) {
            return setTimeout(fn, ms);
          };
    // task 6.2：事件綁定守護由共用模組提供（Node 由 require 取得，瀏覽器由全域取得）。
    const bindings = typeof require === "function" ? require("./eventBindings.js") : globalThis.MEA.eventBindings;

    /** 以 document 委派綁定 GAS 託管登入按鈕（按鈕由 renderGoogleButton 後注入）。 */
    function bindEventsOnce() {
      if (!bindings || !doc || typeof doc.addEventListener !== "function") return;
      bindings.delegate(doc, "click", "[data-auth-action='switch-google-account']", function () {
        switchGoogleAccount();
      });
    }

    bindEventsOnce();

    let gisPromise = null;
    let initializedClientId = "";
    let logoutBusy = false;

    /**
     * 取得系統角色代碼至顯示名稱對照表。
     *
     * @returns {Object} 角色對照字典
     */
    function getRoleNames() {
      return (MEA.config && MEA.config.roleNames) || {};
    }

    /**
     * 判斷目前是否處於 Mock 測試模式。
     *
     * @returns {boolean} 是否為 Mock 模式
     */
    function isMock() {
      return !!(MEA.config && MEA.config.mock);
    }

    /**
     * 取得應用程式全域公開設定物件。
     *
     * @returns {Object} 公開設定物件
     */
    function getPublicConfig() {
      return (MEA.state && MEA.state.publicConfig) || {};
    }

    /**
     * 只有後端公開設定明確標記待開通時，才在登入請求附上 bootstrap 旗標。
     *
     * @returns {boolean} 是否需附帶 bootstrap 旗標
     */
    function shouldRequestBootstrap() {
      return getPublicConfig().needsBootstrap === true;
    }

    /**
     * 檢查是否處於 GAS 原生託管環境。
     *
     * @returns {boolean} 是否為 GAS 託管環境
     */
    function isGasHosted() {
      return detectGasHosting(MEA.config, win ? win.google : null);
    }

    /**
     * 非同步載入 Google Identity Services SDK 腳本。
     *
     * @returns {Promise<Object>} Google Accounts ID API 物件
     */
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
            reject(safeErrors.createSafeError("Google 登入服務載入失敗"));
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
            reject(safeErrors.createSafeError("Google 登入服務載入失敗"));
          }
        };
        script.onerror = function () {
          reject(safeErrors.createSafeError("Google 登入服務載入失敗，請檢查網路連線"));
        };
        doc.head.appendChild(script);
      });
      return gisPromise;
    }

    /**
     * 套用登入成功或失敗回應並更新應用程式狀態。
     *
     * @param {Object} result - 登入呼叫結果
     * @returns {Promise<Object|null>} 成功時回傳使用者物件，失敗時回傳 null
     */
    function applyLoginSuccess(result) {
      if (!isOkResult(result)) {
        MEA.setState(buildLoginFailureState(result));
        return Promise.resolve(null);
      }
      MEA.api.setToken(result.token || "");
      applyCsrfToken(MEA.api, result.csrfToken);
      const user = buildLoginUser(result, getRoleNames());
      MEA.setState(buildLoginSuccessState(user));
      const toast = getLoginToast(user);
      MEA.ui.toast(toast.message, toast.level);
      invokeFetchStats(MEA);
      return Promise.resolve(user);
    }

    /**
     * 處理 Google Identity Services 登入回傳之憑證。
     *
     * @param {Object} response - GIS 憑證回應物件
     */
    function handleCredential(response) {
      const credential = response && response.credential ? String(response.credential) : "";
      if (credential === "") {
        MEA.setState({ loginBusy: false, loginError: "未取得 Google 登入憑證，請重試" });
        return;
      }
      MEA.setState({ loginBusy: true, loginError: "" });
      MEA.api
        .call("login", { credential: credential, bootstrap: shouldRequestBootstrap() })
        .then(applyLoginSuccess)
        .catch(handleAuthCallFailure);
    }

    /**
     * 建立 Google OAuth 導向授權網址。
     *
     * @param {string} clientId - OAuth 用戶端 ID
     * @param {string} redirectUri - 重新導向網址
     * @returns {string} 授權端點網址
     */
    function buildGoogleAuthUrl(clientId, redirectUri) {
      return buildGoogleAuthUrlWithOptions(clientId, redirectUri, {
        btoa: win && typeof win.btoa === "function" ? win.btoa.bind(win) : null
      });
    }

    /**
     * 導向至 Google 帳戶切換器網址（適用於 GAS 託管容器內）。
     */
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

    /**
     * 以 Google OAuth 重新導向方式執行登入。
     */
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

    /**
     * 在 GAS 託管環境中使用目前啟用的 Google 帳戶登入。
     */
    function loginActiveUser() {
      MEA.setState({ loginBusy: true, loginError: "" });
      MEA.api
        .call("loginWithActiveUser", { bootstrap: shouldRequestBootstrap() })
        .then(applyLoginSuccess)
        .catch(handleAuthCallFailure);
    }

    /**
     * 建立 GIS SDK 準備就緒之按鈕渲染回呼函式。
     *
     * @param {HTMLElement} host - 按鈕容器元素
     * @param {string} clientId - OAuth 用戶端 ID
     * @returns {Function} 渲染回呼函式
     */
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

    /**
     * 處理 GIS SDK 載入或執行失敗。
     *
     * @param {*} error - 例外物件
     */
    function handleGisFailure(error) {
      MEA.setState({ loginError: safeErrors.resolveSafeMessage(error, DEFAULT_LOGIN_ERROR) });
    }

    /**
     * 統一處理 API 呼叫拒絕，避免未捕獲的 Promise 例外並提供明確回饋。
     *
     * @param {*} error - 例外或錯誤物件
     */
    function handleAuthCallFailure(error) {
      const message = safeErrors.resolveSafeMessage(error, DEFAULT_LOGIN_ERROR);
      MEA.setState({ loginBusy: false, loginError: message });
      MEA.ui.toast(message, "err");
    }

    /**
     * 依當前執行環境渲染適當的 Google 登入按鈕（GIS 按鈕、GAS 託管按鈕或提示訊息）。
     */
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

    /**
     * 於 Mock 測試模式下模擬登入動作。
     */
    function loginMock() {
      MEA.setState({ loginBusy: true, loginError: "" });
      MEA.api
        .call("login", { mock: true, bootstrap: shouldRequestBootstrap() })
        .then(applyLoginSuccess)
        .catch(handleAuthCallFailure);
    }

    /**
     * 延遲排程渲染 Google 登入按鈕，確保 DOM 節點已掛載。
     */
    function scheduleRenderGoogleButton() {
      setTimeoutFn(renderGoogleButton, 50);
    }

    /**
     * 執行使用者登出，清除狀態與 Token。
     *
     * @returns {Promise<boolean>} 是否成功完成登出流程
     */
    function logout() {
      if (logoutBusy) return Promise.resolve(false);
      logoutBusy = true;
      MEA.setState({ logoutBusy: true, loginError: "" });
      return MEA.api
        .call("logout", {})
        .then(function () {
          MEA.api.setToken("");
          MEA.api.setCsrfToken("");
          MEA.setState({
            view: "login",
            user: null,
            loginError: "",
            loginBusy: false,
            logoutBusy: false
          });
          logoutBusy = false;
          scheduleRenderGoogleButton();
          return true;
        })
        .catch(function (error) {
          logoutBusy = false;
          MEA.setState({ logoutBusy: false });
          MEA.ui.toast(normalizeLogoutError(error), "err");
          return false;
        });
    }

    /**
     * 套用工作階段驗證成功狀態。
     *
     * @param {Object} result - Session 驗證回應
     * @returns {boolean} 是否驗證成功
     */
    function applySessionSuccess(result) {
      if (!isOkResult(result)) return false;
      applyCsrfToken(MEA.api, result.csrfToken);
      MEA.setState(buildSessionSuccessState(result, getRoleNames()));
      invokeFetchStats(MEA);
      return true;
    }

    /**
     * 還原既有工作階段（由 Token 或 Mock 還原登入狀態）。
     */
    function restore() {
      const token = MEA.api.getToken();
      if (isMock()) {
        MEA.api
          .call("getSession", {})
          .then(function (result) {
            if (!applySessionSuccess(result)) {
              MEA.setState(buildSessionFailureState(result));
              scheduleRenderGoogleButton();
            }
          })
          .catch(handleAuthCallFailure);
        return;
      }
      if (!token) {
        MEA.setState({ view: "login" });
        scheduleRenderGoogleButton();
        return;
      }
      MEA.api
        .call("getSession", { token: token })
        .then(function (result) {
          if (!applySessionSuccess(result)) {
            MEA.api.setToken("");
            MEA.api.setCsrfToken("");
            MEA.setState(buildSessionFailureState(result));
            scheduleRenderGoogleButton();
          }
        })
        .catch(handleAuthCallFailure);
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
    invokeFetchStats: invokeFetchStats,
    encodeAuthState: encodeAuthState,
    saveAuthState: saveAuthState,
    readAuthState: readAuthState,
    clearAuthState: clearAuthState,
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
    normalizeLogoutError: normalizeLogoutError,
    constants: {
      GIS_SRC: GIS_SRC,
      GOOGLE_AUTH_URL: GOOGLE_AUTH_URL,
      GOOGLE_ACCOUNT_CHOOSER_URL: GOOGLE_ACCOUNT_CHOOSER_URL,
      CLIENT_ID_HINT_HTML: CLIENT_ID_HINT_HTML,
      DEFAULT_LOGIN_ERROR: DEFAULT_LOGIN_ERROR,
      DEFAULT_LOGOUT_ERROR: DEFAULT_LOGOUT_ERROR,
      SESSION_EXPIRED_ERROR: SESSION_EXPIRED_ERROR
    }
  };
});
