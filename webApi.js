/**
 * @file webApi.js
 * @description Google Apps Script 網頁版 API 路由總管
 *
 * 架構規範：
 * - 前端於 GAS HtmlService 容器內優先使用 `google.script.run.executeWebApi`（原生 RPC），
 *   一般環境以 `POST` + `Content-Type: text/plain;charset=utf-8` 備援，避免 CORS 預檢。
 * - 所有請求統一套用 `{ action, token?, csrfToken?, ...payload }` 信封格式。
 * - 所有回應統一套用 `{ ok: true, ... }` 或 `{ ok: false, error, message }`。
 * - 寫入型 action 一律以 `LockService` 排隊並驗證 CSRF Token。
 */

// ============================================================================
// API 常數
// ============================================================================

// Node.js 單元測試環境全域相容性支援（GAS 環境下自動忽略）
if (typeof require !== "undefined") {
  try {
    const db = require("./databaseInitializer.js");
    Object.assign(globalThis, db);
  } catch (e) {}
  try {
    const transformer = require("./subjectCodeTransformer.js");
    Object.assign(globalThis, transformer);
  } catch (e) {}
  try {
    const utils = require("./utilities.js");
    Object.assign(globalThis, utils);
  } catch (e) {}
}

const WEB_API_VERSION = "1.1.0";
const WEB_API_SESSION_TTL_SECONDS = 21600; // 6 小時
const WEB_API_LOCK_TIMEOUT_MS = 15000;

/** 免登入即可呼叫的公開 action */
const WEB_API_PUBLIC_ACTIONS = ["getPublicConfig", "ping", "login", "loginWithActiveUser"];

/** 寫入型 action（需 LockService 保護與 CSRF 驗證） */
const WEB_API_WRITE_ACTIONS = ["importCourseCodes", "saveSystemSettings", "saveWhitelist", "logout"];

const WEB_API_LOCKED_ACTIONS = [
  "importCourseCodes",
  "saveSystemSettings",
  "saveWhitelist",
  "login",
  "loginWithActiveUser"
];

const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const WEB_API_SESSION_PREFIX = "gas_tmpl_session_";

/** 角色權限矩陣（RBAC） */
const ROLE_PERMISSIONS = {
  admin: ["*"],
  staff: ["read", "importCourseCodes", "getCourseIndex", "getSystemSettings"],
  viewer: ["read", "getCourseIndex"]
};

/** Node.js 沙盒測試用之記憶體 Session 儲存 */
const WEB_API_MEMORY_SESSIONS = {};

// ============================================================================
// 回應與請求解析輔助函式
// ============================================================================

function jsonResponse(data) {
  if (typeof ContentService !== "undefined" && ContentService.createTextOutput) {
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  }
  return data;
}

function webApiSuccess(payload) {
  return Object.assign({ ok: true }, payload || {});
}

function webApiError(code, message) {
  return {
    ok: false,
    error: code || "unknown_error",
    message: message || "執行發生未預期的錯誤"
  };
}

function parseWebApiPayload(e) {
  if (!e) return {};
  if (e.postData && typeof e.postData.contents === "string") {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      return null;
    }
  }
  if (e.parameter) {
    return e.parameter;
  }
  return {};
}

// ============================================================================
// 權限、Session 與安全驗證
// ============================================================================

function hasPermission(role, action) {
  const normRole = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normRole] || [];
  if (permissions.indexOf("*") !== -1) return true;
  if (permissions.indexOf(action) !== -1) return true;
  if (/^get[A-Z]/.test(action) && permissions.indexOf("read") !== -1) return true;
  return false;
}

function getCacheStore() {
  if (typeof CacheService !== "undefined" && CacheService.getScriptCache) {
    return CacheService.getScriptCache();
  }
  return {
    get: function (k) {
      return WEB_API_MEMORY_SESSIONS[k] || null;
    },
    put: function (k, v, ttl) {
      WEB_API_MEMORY_SESSIONS[k] = v;
    },
    remove: function (k) {
      delete WEB_API_MEMORY_SESSIONS[k];
    }
  };
}

function generateSessionToken() {
  if (typeof Utilities !== "undefined" && Utilities.getUuid) {
    return "gas_" + Utilities.getUuid().replace(/-/g, "");
  }
  const rand1 = Math.random().toString(36).substring(2);
  const rand2 = Math.random().toString(36).substring(2);
  const time = Date.now().toString(36);
  return "gas_" + time + "_" + rand1 + rand2;
}

function generateCsrfToken() {
  if (typeof Utilities !== "undefined" && Utilities.getUuid) {
    return "csrf_" + Utilities.getUuid().replace(/-/g, "");
  }
  const rand1 = Math.random().toString(36).substring(2);
  const rand2 = Math.random().toString(36).substring(2);
  const time = Date.now().toString(36);
  return "csrf_" + time + "_" + rand1 + rand2;
}

function normalizeAllowedDomain(configuredDomain) {
  return String(configuredDomain || "")
    .trim()
    .replace(/^@/, "")
    .toLowerCase();
}

function isAllowedGoogleDomain(email, configuredDomain, hostedDomain) {
  const allowedDomain = normalizeAllowedDomain(configuredDomain);
  if (!allowedDomain) return true;
  const emailDomain = String(email || "")
    .trim()
    .toLowerCase()
    .split("@")
    .pop();
  const hosted = String(hostedDomain || "")
    .trim()
    .toLowerCase();
  return emailDomain === allowedDomain || hosted === allowedDomain;
}

function createSessionForEmail(email, name, options) {
  options = options || {};
  const ss =
    options.spreadsheet ||
    (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
      ? SpreadsheetApp.getActiveSpreadsheet()
      : null);

  const cleanEmail = String(email || "")
    .trim()
    .toLowerCase();
  const bootstrapped = bootstrapAdminIfNeeded(cleanEmail, name, ss);
  const account = getAccountRole(cleanEmail, ss);
  const settings = readSystemSettings(ss);

  if (!isAllowedGoogleDomain(cleanEmail, settings.allowedLoginDomain)) {
    return webApiError(
      "domain_not_allowed",
      "僅允許 " + normalizeAllowedDomain(settings.allowedLoginDomain) + " 網域帳號登入"
    );
  }

  if (settings.restrictWhitelist && !account.found) {
    return webApiError("not_whitelisted", "您的帳號（" + cleanEmail + "）尚未加入系統授權名單，請洽系統管理員開通權限");
  }

  if (account.found && account.enabled === false) {
    return webApiError("account_disabled", "您的帳號（" + cleanEmail + "）目前處於停用狀態，請洽系統管理員");
  }

  const role = account.role;
  const token = generateSessionToken();
  const csrfToken = generateCsrfToken();
  const session = {
    token: token,
    csrfToken: csrfToken,
    email: cleanEmail,
    name: account.name || name || cleanEmail,
    role: role,
    perms: ROLE_PERMISSIONS[role] || [],
    createdAt: Date.now()
  };

  const cache = getCacheStore();
  cache.put(WEB_API_SESSION_PREFIX + token, JSON.stringify(session), WEB_API_SESSION_TTL_SECONDS);

  return {
    ok: true,
    token: token,
    csrfToken: csrfToken,
    expiresIn: WEB_API_SESSION_TTL_SECONDS,
    email: session.email,
    name: session.name,
    role: session.role,
    roleName: getRoleDisplayName(session.role),
    perms: session.perms,
    bootstrapped: bootstrapped
  };
}

function verifyGoogleIdToken(idToken, expectedClientId, configuredDomain) {
  if (!idToken || typeof idToken !== "string") {
    return webApiError("missing_id_token", "缺少 Google ID Token");
  }

  const cleanClientId = String(expectedClientId || "").trim();
  if (!cleanClientId) {
    return webApiError("server_misconfigured", "系統尚未設定 Google OAuth Client ID，請系統管理員先完成系統設定");
  }

  try {
    const url = GOOGLE_TOKENINFO_URL + "?id_token=" + encodeURIComponent(idToken);
    let content = "";

    if (typeof UrlFetchApp !== "undefined" && UrlFetchApp.fetch) {
      const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      content = resp.getContentText();
      if (resp.getResponseCode() !== 200) {
        return webApiError("invalid_id_token", "Google 憑證驗證失敗，請重新登入");
      }
    } else {
      // 供 Node.js 測試或無 UrlFetchApp 環境備援
      return webApiError("environment_error", "未支援的 UrlFetchApp 環境");
    }

    const info = JSON.parse(content);
    if (!info.email) {
      return webApiError("invalid_token_payload", "Google 憑證缺少 Email 欄位");
    }

    if (info.iss !== "https://accounts.google.com" && info.iss !== "accounts.google.com") {
      return webApiError("invalid_issuer", "Google 憑證發行者不符");
    }

    if (info.email_verified !== true && info.email_verified !== "true") {
      return webApiError("email_not_verified", "Google 帳號 Email 尚未完成驗證");
    }

    if (info.aud !== cleanClientId) {
      return webApiError("client_id_mismatch", "OAuth Client ID 不符");
    }

    if (!isAllowedGoogleDomain(info.email, configuredDomain, info.hd)) {
      return webApiError("domain_not_allowed", "僅允許 " + normalizeAllowedDomain(configuredDomain) + " 網域帳號登入");
    }

    return {
      ok: true,
      email: String(info.email).toLowerCase(),
      name: info.name || info.email,
      sub: info.sub,
      picture: info.picture
    };
  } catch (err) {
    return webApiError("token_verify_error", "驗證 Google 憑證時發生錯誤：" + (err && err.message ? err.message : err));
  }
}

function loginWithGoogleIdToken(idToken, options) {
  options = options || {};
  const ss =
    options.spreadsheet ||
    (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
      ? SpreadsheetApp.getActiveSpreadsheet()
      : null);
  const settings = readSystemSettings(ss);
  const expectedClientId = options.clientId || settings.clientId || "";

  const verify = verifyGoogleIdToken(idToken, expectedClientId, settings.allowedLoginDomain);
  if (!verify.ok) return verify;

  return createSessionForEmail(verify.email, verify.name, { spreadsheet: ss });
}

function loginWithActiveUser(options) {
  options = options || {};
  const ss =
    options.spreadsheet ||
    (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
      ? SpreadsheetApp.getActiveSpreadsheet()
      : null);

  let email = "";
  try {
    if (typeof Session !== "undefined" && Session.getActiveUser) {
      email = String(Session.getActiveUser().getEmail() || "")
        .trim()
        .toLowerCase();
    }
  } catch (e) {
    email = "";
  }

  if (!email) {
    return webApiError(
      "no_active_user",
      "無法辨識目前的 Google 帳號，請確認已使用授權的 Google 帳號登入後重新整理頁面"
    );
  }

  return createSessionForEmail(email, email, { spreadsheet: ss });
}

function isAllowedOAuthRedirectUri(uri) {
  const target = String(uri || "").trim();
  if (!target) return false;
  if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:[?#].*)?$/.test(target)) {
    return true;
  }
  if (/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//.test(target)) {
    return true;
  }
  return false;
}

function resolveOAuthRedirectUri(state, fallbackUrl) {
  const fallback = String(fallbackUrl || "").trim();
  const raw = String(state || "").trim();
  if (!raw) return fallback;

  try {
    let decoded = "";
    if (typeof Utilities !== "undefined" && Utilities.base64Decode && Utilities.newBlob) {
      decoded = Utilities.newBlob(Utilities.base64Decode(raw)).getDataAsString();
    } else if (typeof Buffer !== "undefined") {
      decoded = Buffer.from(raw, "base64").toString("utf8");
    }
    if (!decoded || decoded.charAt(0) !== "{") return fallback;
    const parsed = JSON.parse(decoded);
    const candidate = String((parsed && parsed.redirectUri) || "").trim();
    return isAllowedOAuthRedirectUri(candidate) ? candidate : fallback;
  } catch (e) {
    return fallback;
  }
}

function getOAuthSpreadsheet_(deps) {
  if (deps && deps.spreadsheet) return deps.spreadsheet;
  return typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
    ? SpreadsheetApp.getActiveSpreadsheet()
    : null;
}

function getOAuthSettings_(deps, ss) {
  if (deps && deps.settings) return deps.settings;
  const readSettings = deps && typeof deps.readSystemSettings === "function"
    ? deps.readSystemSettings
    : (typeof readSystemSettings === "function" ? readSystemSettings : null);
  return readSettings ? readSettings(ss) : {};
}

function getOAuthWebAppUrl_(deps) {
  if (deps && typeof deps.webAppUrl === "string") return deps.webAppUrl;
  try {
    if (typeof ScriptApp !== "undefined" && ScriptApp.getService) {
      return ScriptApp.getService().getUrl() || "";
    }
  } catch (urlError) {
    return "";
  }
  return "";
}

function getOAuthFetchResponse_(deps, redirectUri, payload) {
  if (deps && deps.fetch === null) return { unavailable: true };
  const options = {
    method: "post",
    payload: payload,
    muteHttpExceptions: true
  };
  if (deps && typeof deps.fetch === "function") {
    return deps.fetch("https://oauth2.googleapis.com/token", options);
  }
  if (typeof UrlFetchApp !== "undefined" && UrlFetchApp.fetch) {
    return UrlFetchApp.fetch("https://oauth2.googleapis.com/token", options);
  }
  return { unavailable: true };
}

function normalizeOAuthHttpResponse_(response) {
  if (!response) return { statusCode: 0, text: "" };
  if (typeof response.getResponseCode === "function" && typeof response.getContentText === "function") {
    return { statusCode: response.getResponseCode(), text: response.getContentText() };
  }
  return {
    statusCode: typeof response.statusCode === "number" ? response.statusCode : 0,
    text: String(response.text == null ? "" : response.text)
  };
}

function parseOAuthTokenData_(responseText) {
  try {
    return { ok: true, data: JSON.parse(responseText) };
  } catch (parseError) {
    return webApiError("token_parse_error", "解析 Google 憑證回應失敗，請重新登入");
  }
}

function buildTokenExchangeFailure_(statusCode, tokenData) {
  const detail = String(tokenData.error_description || tokenData.error || "HTTP " + statusCode);
  const staleCode = tokenData.error === "invalid_grant" || detail.indexOf("Bad Request") !== -1;
  return webApiError(
    "token_exchange_failed",
    staleCode
      ? "登入授權碼已失效（可能因重新整理頁面），請重新點選 Google 帳號登入"
      : "Google 授權碼交換失敗：" + detail
  );
}

function verifyAndCreateOAuthSession_(deps, tokenData, clientId, settings, ss) {
  const verifyFn = deps && typeof deps.verifyGoogleIdToken === "function"
    ? deps.verifyGoogleIdToken
    : verifyGoogleIdToken;
  const createSessionFn = deps && typeof deps.createSessionForEmail === "function"
    ? deps.createSessionForEmail
    : createSessionForEmail;
  const verification = verifyFn(tokenData.id_token, clientId, settings.allowedLoginDomain);
  if (!verification.ok) return verification;
  return createSessionFn(verification.email, verification.name, { spreadsheet: ss });
}

function handleOAuthCodeCallback(code, e, deps) {
  const authorizationCode = String(code || "").trim();
  if (!authorizationCode) {
    return webApiError("missing_code", "缺少 Google 授權碼，請重新發起登入");
  }

  const context = deps && typeof deps === "object" ? deps : {};
  const ss = getOAuthSpreadsheet_(context);
  const settings = getOAuthSettings_(context, ss) || {};
  const clientId = String(settings.clientId || "").trim();
  const clientSecret = String(settings.clientSecret || "").trim();

  if (!clientId) {
    return webApiError("server_misconfigured", "系統尚未設定 OAuth Client ID，請系統管理員先完成系統設定");
  }
  if (!clientSecret) {
    return webApiError("missing_client_secret", "系統尚未設定 OAuth Client Secret，無法完成 Google 帳號登入");
  }

  const redirectUri = resolveOAuthRedirectUri(
    e && e.parameter ? e.parameter.state : "",
    getOAuthWebAppUrl_(context)
  );
  const payload = {
    code: authorizationCode,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  };

  try {
    const rawResponse = getOAuthFetchResponse_(context, redirectUri, payload);
    if (rawResponse && rawResponse.unavailable) {
      return webApiError("environment_error", "目前環境不支援交換 Google 授權碼");
    }

    const response = normalizeOAuthHttpResponse_(rawResponse);
    const parsed = parseOAuthTokenData_(response.text);
    if (!parsed.ok) return parsed;

    const tokenData = parsed.data || {};
    if (response.statusCode !== 200 || !tokenData.id_token) {
      return buildTokenExchangeFailure_(response.statusCode, tokenData);
    }

    return verifyAndCreateOAuthSession_(context, tokenData, clientId, settings, ss);
  } catch (error) {
    return webApiError(
      "token_exchange_error",
      "連線 Google 憑證伺服器失敗：" + String(error && error.message ? error.message : error)
    );
  }
}

function getSessionInfo(token) {
  const cleanToken = String(token || "").trim();
  if (!cleanToken) {
    return webApiError("missing_token", "未提供 Session Token");
  }

  const cache = getCacheStore();
  const raw = cache.get(WEB_API_SESSION_PREFIX + cleanToken);
  if (!raw) {
    return webApiError("session_expired", "登入狀態已過期，請重新登入");
  }

  try {
    const session = JSON.parse(raw);
    return { ok: true, session: session };
  } catch (e) {
    return webApiError("invalid_session", "Session 資料毀損");
  }
}

function getSessionState(token) {
  const result = getSessionInfo(token);
  if (!result.ok) return result;
  return {
    ok: true,
    email: result.session.email,
    name: result.session.name,
    role: result.session.role,
    roleName: getRoleDisplayName(result.session.role),
    perms: result.session.perms,
    csrfToken: result.session.csrfToken || ""
  };
}

function logoutSession(token) {
  const cleanToken = String(token || "").trim();
  if (cleanToken) {
    const cache = getCacheStore();
    cache.remove(WEB_API_SESSION_PREFIX + cleanToken);
  }
  return { ok: true };
}

function authorizeWebApiAction(action, payload) {
  if (WEB_API_PUBLIC_ACTIONS.indexOf(action) !== -1) {
    return { ok: true, session: null };
  }

  const sessionResult = getSessionInfo(payload ? payload.token : "");
  if (!sessionResult.ok) return sessionResult;

  if (!hasPermission(sessionResult.session.role, action)) {
    return webApiError("forbidden", "目前角色（" + sessionResult.session.role + "）無權限執行：" + action);
  }

  return { ok: true, session: sessionResult.session };
}

// ============================================================================
// Action 路由派發
// ============================================================================

function getPublicConfig() {
  const ss =
    typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
      ? SpreadsheetApp.getActiveSpreadsheet()
      : null;
  const settings = readSystemSettings(ss);

  let webAppUrl = "";
  try {
    if (typeof ScriptApp !== "undefined" && ScriptApp.getService) {
      webAppUrl = ScriptApp.getService().getUrl() || "";
    }
  } catch (e) {
    webAppUrl = "";
  }

  let activeEmail = "";
  try {
    if (typeof Session !== "undefined" && Session.getActiveUser) {
      activeEmail = String(Session.getActiveUser().getEmail() || "").trim();
    }
  } catch (e) {
    activeEmail = "";
  }

  return {
    ok: true,
    version: WEB_API_VERSION,
    systemName: settings.systemName || "Google Apps Script 應用程式範本",
    schoolYear: settings.schoolYear || "114",
    semester: settings.semester || "1",
    clientId: settings.clientId || "",
    hasClientSecret: Boolean(settings.clientSecret),
    allowedDomain: normalizeAllowedDomain(settings.allowedLoginDomain),
    activeEmail: activeEmail,
    webAppUrl: webAppUrl
  };
}

function routeWebApiAction(action, payload, event) {
  const name = String(action || "").trim();
  if (name === "") return webApiError("missing_action", "缺少 action 參數");

  // 公開 action
  switch (name) {
    case "ping":
      return { ok: true, pong: Date.now(), version: WEB_API_VERSION };
    case "getPublicConfig":
      return getPublicConfig();
    case "login":
      return loginWithGoogleIdToken(payload ? payload.idToken || payload.credential : "");
    case "loginWithActiveUser":
      return loginWithActiveUser();
  }

  // 需登入驗證
  const authorization = authorizeWebApiAction(name, payload || {});
  if (!authorization.ok) return authorization;

  const session = authorization.session;
  const ss =
    typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
      ? SpreadsheetApp.getActiveSpreadsheet()
      : null;

  // 寫入型 action 驗證 CSRF Token
  if (WEB_API_WRITE_ACTIONS.indexOf(name) !== -1) {
    const reqCsrf = payload ? payload.csrfToken || "" : "";
    if (!session || !session.csrfToken || reqCsrf !== session.csrfToken) {
      return webApiError("invalid_csrf_token", "CSRF Token 驗證失敗或請求已過期，請重新整理頁面");
    }
  }

  switch (name) {
    case "getSession":
      return getSessionState(payload.token);
    case "logout":
      return logoutSession(payload.token);

    // 課程代碼相關 action
    case "importCourseCodes":
      if (!payload || !Array.isArray(payload.rows) || payload.rows.length === 0) {
        return webApiError("missing_rows", "缺少課程代碼資料（rows）");
      }
      return importNormalizedCourseCodes(payload.rows, {
        spreadsheet: ss,
        preNormalized: payload.preNormalized === true
      });

    case "getCourseIndex":
      return getNormalizedCourses(payload, ss);

    // 系統設定與授權相關 action
    case "getSystemSettings":
      return {
        ok: true,
        settings: readSystemSettings(ss)
      };

    case "saveSystemSettings":
      if (session.role !== "admin") {
        return webApiError("forbidden", "僅系統管理員可修改系統參數");
      }
      saveSystemSettings(payload.settings || {}, ss);
      return { ok: true };

    case "getAccounts":
      if (session.role !== "admin") {
        return webApiError("forbidden", "僅系統管理員可檢視授權白名單");
      }
      return {
        ok: true,
        accounts: readWhitelist(ss)
      };

    case "saveWhitelist":
      if (session.role !== "admin") {
        return webApiError("forbidden", "僅系統管理員可修改授權白名單");
      }
      return saveWhitelist(payload.accounts || [], ss);

    default:
      return webApiError("unknown_action", "未支援的 action：" + name);
  }
}

// ============================================================================
// GAS 進入點
// ============================================================================

/**
 * 執行 Web API Action，供 doPost 與 google.script.run 共用。
 *
 * @param {Object|string} payload - 請求資料物件或 JSON 字串
 * @param {Object} [event] - HTTP 原始事件物件
 * @returns {Object} Action 結果或錯誤物件
 */
function executeWebApi(payload, event) {
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch (error) {
      return webApiError("invalid_json", "請求 JSON 格式錯誤");
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return webApiError("invalid_json", "請求 JSON 格式錯誤");
  }

  const action = String(payload.action || (event && event.parameter && event.parameter.action) || "").trim();
  if (action === "") return webApiError("missing_action", "缺少 action 參數");

  let lock = null;
  let hasLock = false;
  try {
    const needsLock = WEB_API_LOCKED_ACTIONS.indexOf(action) !== -1;
    if (needsLock && typeof LockService !== "undefined" && LockService.getScriptLock) {
      lock = LockService.getScriptLock();
      try {
        hasLock = lock.tryLock(WEB_API_LOCK_TIMEOUT_MS);
      } catch (lockError) {
        hasLock = false;
      }
      if (!hasLock) return webApiError("lock_timeout", "系統繁忙中，請稍候片刻再試");
    }
    const routeFn =
      typeof module !== "undefined" &&
      module.exports &&
      typeof module.exports.routeWebApiAction === "function"
        ? module.exports.routeWebApiAction
        : routeWebApiAction;
    return routeFn(action, payload, event);
  } catch (error) {
    console.error("[webApi executeWebApi error] " + (error && error.stack ? error.stack : error));
    return webApiError("server_error", String(error && error.message ? error.message : error));
  } finally {
    if (hasLock && lock) {
      try {
        lock.releaseLock();
      } catch (releaseError) {
        // 忽略解鎖失敗
      }
    }
  }
}

function doGet(e) {
  const parameter = e && e.parameter ? e.parameter : {};
  const action = String(parameter.action || "").trim();

  // 若帶有 ?action= 則以 JSON 回應（僅開放 ping 與 getPublicConfig 供唯讀檢查）
  if (action !== "") {
    if (action !== "ping" && action !== "getPublicConfig") {
      return jsonResponse(
        webApiError("method_not_allowed", "為保障安全性，除 ping 與 getPublicConfig 外之操作一律必須使用 POST 方法發送")
      );
    }
    try {
      const payload = parseWebApiPayload(e);
      return jsonResponse(routeWebApiAction(action, payload, e));
    } catch (error) {
      return jsonResponse(webApiError("server_error", String(error && error.message ? error.message : error)));
    }
  }

  // 處理 Google OAuth 2.0 授權碼回傳（重新導向登入）
  let initialAuthResult = null;
  const authorizationCode = String(parameter.code || "").trim();
  if (authorizationCode !== "") {
    try {
      initialAuthResult = handleOAuthCodeCallback(authorizationCode, e);
    } catch (error) {
      initialAuthResult = webApiError(
        "oauth_callback_failed",
        "Google 登入回傳處理失敗：" + String(error && error.message ? error.message : error)
      );
    }
  }

  // 渲染 Web App HTML
  if (typeof HtmlService !== "undefined" && HtmlService.createTemplateFromFile) {
    try {
      const template = HtmlService.createTemplateFromFile("index");
      template.initialAuthResult = initialAuthResult ? JSON.stringify(initialAuthResult).replace(/</g, "\\u003c") : "";
      template.switchAccount = String(parameter.switch || "") === "1";
      return template
        .evaluate()
        .setTitle("Google Apps Script 應用程式範本")
        .addMetaTag("viewport", "width=device-width, initial-scale=1")
        .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
    } catch (error) {
      console.error("HtmlService template evaluation error: " + (error && error.stack ? error.stack : error));
    }
  }

  return jsonResponse({
    ok: true,
    service: "gas-course-web-template",
    version: WEB_API_VERSION
  });
}

function doPost(e) {
  let payload;
  try {
    payload = parseWebApiPayload(e);
  } catch (error) {
    return jsonResponse(webApiError("invalid_json", "請求 JSON 格式錯誤"));
  }
  if (payload === null) {
    return jsonResponse(webApiError("invalid_json", "請求 JSON 格式錯誤"));
  }

  const action = String(payload.action || (e && e.parameter && e.parameter.action) || "").trim();
  if (action === "") {
    return jsonResponse(webApiError("missing_action", "缺少 action 參數"));
  }

  return jsonResponse(executeWebApi(payload, e));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WEB_API_VERSION: WEB_API_VERSION,
    WEB_API_PUBLIC_ACTIONS: WEB_API_PUBLIC_ACTIONS,
    WEB_API_WRITE_ACTIONS: WEB_API_WRITE_ACTIONS,
    WEB_API_LOCKED_ACTIONS: WEB_API_LOCKED_ACTIONS,
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,
    jsonResponse: jsonResponse,
    webApiSuccess: webApiSuccess,
    webApiError: webApiError,
    parseWebApiPayload: parseWebApiPayload,
    hasPermission: hasPermission,
    generateSessionToken: generateSessionToken,
    generateCsrfToken: generateCsrfToken,
    normalizeAllowedDomain: normalizeAllowedDomain,
    isAllowedGoogleDomain: isAllowedGoogleDomain,
    isAllowedOAuthRedirectUri: isAllowedOAuthRedirectUri,
    resolveOAuthRedirectUri: resolveOAuthRedirectUri,
    createSessionForEmail: createSessionForEmail,
    verifyGoogleIdToken: verifyGoogleIdToken,
    loginWithGoogleIdToken: loginWithGoogleIdToken,
    loginWithActiveUser: loginWithActiveUser,
    handleOAuthCodeCallback: handleOAuthCodeCallback,
    getSessionInfo: getSessionInfo,
    getSessionState: getSessionState,
    logoutSession: logoutSession,
    authorizeWebApiAction: authorizeWebApiAction,
    routeWebApiAction: routeWebApiAction,
    getPublicConfig: getPublicConfig,
    executeWebApi: executeWebApi,
    doGet: doGet,
    doPost: doPost
  };
}
