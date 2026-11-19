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
const OAUTH_STATE_NONCE_CACHE_PREFIX = "gas_tmpl_oauth_nonce_";
const OAUTH_STATE_NONCE_TTL_SECONDS = 600;
const WEB_API_MEMORY_NONCES = {};

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

/** 角色權限矩陣（RBAC）：所有受保護 action 必須明確列舉，不使用 getXxx 通配規則 */
const ROLE_PERMISSIONS = {
  admin: ["*"],
  staff: ["getSession", "logout", "getCourseIndex", "getSystemSettings", "importCourseCodes"],
  viewer: ["getSession", "logout", "getCourseIndex", "getSystemSettings"]
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
  return permissions.indexOf(action) !== -1;
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

/**
 * 在短臨界區內執行首次管理員開通；寫入前重新檢查白名單以避免並發覆寫。
 * 無 LockService 的 Node 測試環境直接執行回呼。
 */
function runBootstrapWithLock_(fn) {
  if (typeof LockService === "undefined" || !LockService.getScriptLock) return fn();
  const lock = LockService.getScriptLock();
  let acquired = false;
  try {
    acquired = lock.tryLock(WEB_API_LOCK_TIMEOUT_MS);
  } catch (lockError) {
    acquired = false;
  }
  if (!acquired) return webApiError("lock_timeout", "系統繁忙中，請稍候片刻再試");
  try {
    return fn();
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseError) {
      // 釋放失敗不影響已完成的寫入結果
    }
  }
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

  // 安全預設：只有明確標記 allowBootstrap 且白名單為空時才允許首次開通。
  let bootstrapped = false;
  if (options.allowBootstrap === true) {
    const currentAccounts = readWhitelist(ss) || [];
    if (currentAccounts.length === 0) {
      const bootstrapResult = runBootstrapWithLock_(function () {
        if ((readWhitelist(ss) || []).length !== 0) return false;
        return !!bootstrapAdminIfNeeded(cleanEmail, name, ss);
      });
      if (bootstrapResult && typeof bootstrapResult === "object" && bootstrapResult.ok === false) {
        return bootstrapResult;
      }
      bootstrapped = bootstrapResult === true;
    }
  }

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

function fetchTokenInfoResponse_(idToken, deps) {
  const context = deps && typeof deps === "object" ? deps : {};
  const url = GOOGLE_TOKENINFO_URL + "?id_token=" + encodeURIComponent(idToken);
  if (context.fetch === null) return { unavailable: true };
  if (typeof context.fetch === "function") {
    return context.fetch(url);
  }
  if (typeof UrlFetchApp !== "undefined" && UrlFetchApp.fetch) {
    return UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  }
  return { unavailable: true };
}

function isValidGoogleIssuer_(issuer) {
  return issuer === "https://accounts.google.com" || issuer === "accounts.google.com";
}

function isVerifiedGoogleEmail_(value) {
  return value === true || value === "true";
}

function validateTokenInfoClaims_(info, expectedClientId, configuredDomain) {
  if (!info.email) {
    return webApiError("invalid_token_payload", "Google 憑證缺少 Email 欄位");
  }
  if (!isValidGoogleIssuer_(info.iss)) {
    return webApiError("invalid_issuer", "Google 憑證發行者不符");
  }
  if (!isVerifiedGoogleEmail_(info.email_verified)) {
    return webApiError("email_not_verified", "Google 帳號 Email 尚未完成驗證");
  }
  if (info.aud !== expectedClientId) {
    return webApiError("client_id_mismatch", "OAuth Client ID 不符");
  }
  if (!isAllowedGoogleDomain(info.email, configuredDomain, info.hd)) {
    return webApiError("domain_not_allowed", "僅允許 " + normalizeAllowedDomain(configuredDomain) + " 網域帳號登入");
  }
  return null;
}

function buildVerifiedGoogleIdentity_(info) {
  return {
    ok: true,
    email: String(info.email).toLowerCase(),
    name: info.name || info.email,
    sub: info.sub,
    picture: info.picture
  };
}

function verifyGoogleIdToken(idToken, expectedClientId, configuredDomain, deps) {
  if (!idToken || typeof idToken !== "string") {
    return webApiError("missing_id_token", "缺少 Google ID Token");
  }

  const cleanClientId = String(expectedClientId || "").trim();
  if (!cleanClientId) {
    return webApiError("server_misconfigured", "系統尚未設定 Google OAuth Client ID，請系統管理員先完成系統設定");
  }

  try {
    const rawResponse = fetchTokenInfoResponse_(idToken, deps);
    if (rawResponse && rawResponse.unavailable) {
      return webApiError("environment_error", "未支援的 UrlFetchApp 環境");
    }

    const response = normalizeOAuthHttpResponse_(rawResponse);
    if (response.statusCode !== 200) {
      return webApiError("invalid_id_token", "Google 憑證驗證失敗，請重新登入");
    }

    const info = JSON.parse(response.text);
    const claimError = validateTokenInfoClaims_(info, cleanClientId, configuredDomain);
    if (claimError) return claimError;

    return buildVerifiedGoogleIdentity_(info);
  } catch (err) {
    return webApiError("token_verify_error", "驗證 Google 憑證時發生錯誤：" + (err && err.message ? err.message : err));
  }
}

function loginWithGoogleIdToken(idToken, options) {
  const resolvedOptions = options || {};
  const ss = resolveLoginSpreadsheet_(resolvedOptions);
  const readSettingsFn = resolveRouteDependency_("readSystemSettings", readSystemSettings);
  const settings = readSettingsFn(ss) || {};
  const expectedClientId = resolvedOptions.clientId || settings.clientId || "";

  const verifyFn = getOverridableApiFn_("verifyGoogleIdToken", verifyGoogleIdToken);
  const verify = verifyFn(idToken, expectedClientId, settings.allowedLoginDomain);
  if (!verify.ok) return verify;

  const createSessionFn = getOverridableApiFn_("createSessionForEmail", createSessionForEmail);
  return createSessionFn(verify.email, verify.name, { spreadsheet: ss, allowBootstrap: true });
}

function resolveLoginSpreadsheet_(options) {
  const resolvedOptions = options || {};
  if (resolvedOptions.spreadsheet) return resolvedOptions.spreadsheet;
  if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet) {
    return SpreadsheetApp.getActiveSpreadsheet();
  }
  return null;
}

function getActiveUserEmail_() {
  try {
    if (typeof Session !== "undefined" && Session.getActiveUser) {
      return String(Session.getActiveUser().getEmail() || "")
        .trim()
        .toLowerCase();
    }
  } catch (e) {
    // ignore
  }
  return "";
}

function loginWithActiveUser(options) {
  const ss = resolveLoginSpreadsheet_(options);
  const email = getActiveUserEmail_();
  if (!email) {
    return webApiError(
      "no_active_user",
      "無法辨識目前的 Google 帳號，請確認已使用授權的 Google 帳號登入後重新整理頁面"
    );
  }

  const createSessionFn = getOverridableApiFn_("createSessionForEmail", createSessionForEmail);
  return createSessionFn(email, email, { spreadsheet: ss, allowBootstrap: true });
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

function decodeOAuthState_(raw) {
  if (typeof Utilities !== "undefined" && Utilities.base64Decode && Utilities.newBlob) {
    return Utilities.newBlob(Utilities.base64Decode(raw)).getDataAsString();
  }
  if (typeof Buffer !== "undefined") {
    return Buffer.from(raw, "base64").toString("utf8");
  }
  return "";
}

/**
 * 解析 OAuth state；回傳 { nonce, redirectUri }，舊格式或非物件回傳 null。
 */
function parseOAuthState_(raw) {
  const text = String(raw || "").trim();
  if (!text) return null;
  try {
    const decoded = decodeOAuthState_(text);
    if (!decoded || decoded.charAt(0) !== "{") return null;
    const parsed = JSON.parse(decoded);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") return null;
    return {
      nonce: typeof parsed.nonce === "string" ? parsed.nonce.trim() : "",
      redirectUri: typeof parsed.redirectUri === "string" ? parsed.redirectUri.trim() : ""
    };
  } catch (e) {
    return null;
  }
}

function resolveOAuthRedirectUri(state, fallbackUrl) {
  const fallback = String(fallbackUrl || "").trim();
  const parsed = parseOAuthState_(state);
  if (!parsed) return fallback;
  return isAllowedOAuthRedirectUri(parsed.redirectUri) ? parsed.redirectUri : fallback;
}

/**
 * 取得 nonce 一次性消耗的快取；GAS 用 CacheService，Node 測試用記憶體備援。
 */
function getOAuthNonceCache_(deps) {
  if (
    deps &&
    deps.nonceCache &&
    typeof deps.nonceCache.get === "function" &&
    typeof deps.nonceCache.put === "function"
  ) {
    return deps.nonceCache;
  }
  if (typeof CacheService !== "undefined" && CacheService.getScriptCache) {
    return CacheService.getScriptCache();
  }
  return {
    get: function (key) {
      return WEB_API_MEMORY_NONCES[key] || null;
    },
    put: function (key, value) {
      WEB_API_MEMORY_NONCES[key] = value;
    }
  };
}

/**
 * 一次性消耗 nonce；重放或格式異常時回傳 false。
 */
function consumeOAuthNonce_(nonce, deps) {
  const clean = String(nonce || "").trim();
  if (clean.length < 8 || clean.length > 256) return false;
  const cache = getOAuthNonceCache_(deps);
  const key = OAUTH_STATE_NONCE_CACHE_PREFIX + clean;
  try {
    if (cache.get(key)) return false;
    cache.put(key, "1", OAUTH_STATE_NONCE_TTL_SECONDS);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 驗證 OAuth 回呼的 state：nonce 必須存在且未使用，redirectUri 必須與設定相符。
 */
function validateOAuthCallbackState_(state, expectedRedirectUri, deps) {
  const parsed = parseOAuthState_(state);
  if (!parsed || !parsed.nonce) {
    return webApiError("invalid_oauth_state", "OAuth 狀態參數無效，請重新發起登入");
  }
  const expected = String(expectedRedirectUri || "").trim();
  if (!parsed.redirectUri || !isAllowedOAuthRedirectUri(parsed.redirectUri)) {
    return webApiError("invalid_oauth_state", "OAuth 導向網址不受信任，請重新發起登入");
  }
  if (expected && parsed.redirectUri !== expected) {
    return webApiError("oauth_redirect_mismatch", "OAuth 導向網址與系統設定不符，請重新發起登入");
  }
  if (!consumeOAuthNonce_(parsed.nonce, deps)) {
    return webApiError("oauth_nonce_reused", "登入狀態已使用或過期，請重新發起登入");
  }
  return { ok: true, redirectUri: parsed.redirectUri };
}

function getOAuthSpreadsheet_(deps) {
  if (deps && deps.spreadsheet) return deps.spreadsheet;
  return typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
    ? SpreadsheetApp.getActiveSpreadsheet()
    : null;
}

function getOAuthSettings_(deps, ss) {
  if (deps && deps.settings) return deps.settings;
  const readSettings =
    deps && typeof deps.readSystemSettings === "function"
      ? deps.readSystemSettings
      : typeof readSystemSettings === "function"
        ? readSystemSettings
        : null;
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

function verifyAndCreateOAuthSession_(deps, tokenData, clientId, settings, ss, stateContext) {
  const verifyFn =
    deps && typeof deps.verifyGoogleIdToken === "function" ? deps.verifyGoogleIdToken : verifyGoogleIdToken;
  const createSessionFn =
    deps && typeof deps.createSessionForEmail === "function" ? deps.createSessionForEmail : createSessionForEmail;
  const verification = verifyFn(tokenData.id_token, clientId, settings.allowedLoginDomain);
  if (!verification.ok) return verification;

  const context = stateContext || {};
  const stateValidation = validateOAuthCallbackState_(context.state, context.expectedRedirectUri, deps);
  if (!stateValidation.ok) return stateValidation;

  return createSessionFn(verification.email, verification.name, { spreadsheet: ss, allowBootstrap: true });
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

  const redirectUri = resolveOAuthRedirectUri(e && e.parameter ? e.parameter.state : "", getOAuthWebAppUrl_(context));
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

    return verifyAndCreateOAuthSession_(context, tokenData, clientId, settings, ss, {
      state: e && e.parameter ? e.parameter.state : "",
      expectedRedirectUri: getOAuthWebAppUrl_(context)
    });
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

function resolveRouteDependency_(name, fallback) {
  if (typeof module !== "undefined" && module.exports && typeof module.exports[name] === "function") {
    return module.exports[name];
  }
  if (typeof globalThis !== "undefined" && typeof globalThis[name] === "function") {
    return globalThis[name];
  }
  return fallback;
}

function getRouteSpreadsheet_() {
  return typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
    ? SpreadsheetApp.getActiveSpreadsheet()
    : null;
}

function routePublicWebApiAction_(name, payload) {
  switch (name) {
    case "ping":
      return { ok: true, pong: Date.now(), version: WEB_API_VERSION };
    case "getPublicConfig":
      return getOverridableApiFn_("getPublicConfig", getPublicConfig)();
    case "login":
      return getOverridableApiFn_(
        "loginWithGoogleIdToken",
        loginWithGoogleIdToken
      )(payload ? payload.idToken || payload.credential : "");
    case "loginWithActiveUser":
      return getOverridableApiFn_("loginWithActiveUser", loginWithActiveUser)();
    default:
      return null;
  }
}

function validateRouteCsrf_(name, payload, session) {
  if (WEB_API_WRITE_ACTIONS.indexOf(name) === -1) return null;
  const reqCsrf = payload ? payload.csrfToken || "" : "";
  if (!session || !session.csrfToken || reqCsrf !== session.csrfToken) {
    return webApiError("invalid_csrf_token", "CSRF Token 驗證失敗或請求已過期，請重新整理頁面");
  }
  return null;
}

/**
 * 依角色遮蔽系統設定中的敏感欄位；clientSecret 僅管理員可見。
 */
function sanitizeSystemSettingsForRole_(settings, role) {
  const source = settings || {};
  if (String(role || "") === "admin") return source;
  const safe = Object.assign({}, source);
  delete safe.clientSecret;
  return safe;
}

function routeProtectedWebApiAction_(name, payload, session, ss) {
  switch (name) {
    case "getSession":
      return getOverridableApiFn_("getSessionState", getSessionState)(payload.token);
    case "logout":
      return getOverridableApiFn_("logoutSession", logoutSession)(payload.token);

    case "importCourseCodes":
      if (!payload || !Array.isArray(payload.rows) || payload.rows.length === 0) {
        return webApiError("missing_rows", "缺少課程代碼資料（rows）");
      }
      return resolveRouteDependency_("importNormalizedCourseCodes", importNormalizedCourseCodes)(payload.rows, {
        spreadsheet: ss,
        preNormalized: payload.preNormalized === true
      });

    case "getCourseIndex":
      return resolveRouteDependency_("getNormalizedCourses", getNormalizedCourses)(payload, ss);

    case "getSystemSettings":
      return {
        ok: true,
        settings: sanitizeSystemSettingsForRole_(
          resolveRouteDependency_("readSystemSettings", readSystemSettings)(ss),
          session.role
        )
      };

    case "saveSystemSettings":
      if (session.role !== "admin") {
        return webApiError("forbidden", "僅系統管理員可修改系統參數");
      }
      resolveRouteDependency_("saveSystemSettings", saveSystemSettings)(payload.settings || {}, ss);
      return { ok: true };

    case "getAccounts":
      if (session.role !== "admin") {
        return webApiError("forbidden", "僅系統管理員可檢視授權白名單");
      }
      return {
        ok: true,
        accounts: resolveRouteDependency_("readWhitelist", readWhitelist)(ss)
      };

    case "saveWhitelist":
      if (session.role !== "admin") {
        return webApiError("forbidden", "僅系統管理員可修改授權白名單");
      }
      return resolveRouteDependency_("saveWhitelist", saveWhitelist)(payload.accounts || [], ss);

    default:
      return webApiError("unknown_action", "未支援的 action：" + name);
  }
}

function routeWebApiAction(action, payload, event) {
  const name = String(action || "").trim();
  if (name === "") return webApiError("missing_action", "缺少 action 參數");

  const publicResult = routePublicWebApiAction_(name, payload);
  if (publicResult !== null) return publicResult;

  const authorization = getOverridableApiFn_("authorizeWebApiAction", authorizeWebApiAction)(name, payload || {});
  if (!authorization.ok) return authorization;

  const session = authorization.session;
  const csrfError = validateRouteCsrf_(name, payload, session);
  if (csrfError) return csrfError;

  return routeProtectedWebApiAction_(name, payload, session, getRouteSpreadsheet_());
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
      typeof module !== "undefined" && module.exports && typeof module.exports.routeWebApiAction === "function"
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

function getOverridableApiFn_(name, fallback) {
  if (typeof module !== "undefined" && module.exports && typeof module.exports[name] === "function") {
    return module.exports[name];
  }
  return fallback;
}

function handleDoGetActionRequest_(action, event) {
  if (action !== "ping" && action !== "getPublicConfig") {
    return jsonResponse(
      webApiError("method_not_allowed", "為保障安全性，除 ping 與 getPublicConfig 外之操作一律必須使用 POST 方法發送")
    );
  }
  try {
    const payload = parseWebApiPayload(event);
    const routeFn = getOverridableApiFn_("routeWebApiAction", routeWebApiAction);
    return jsonResponse(routeFn(action, payload, event));
  } catch (error) {
    return jsonResponse(webApiError("server_error", String(error && error.message ? error.message : error)));
  }
}

function resolveDoGetInitialAuth_(parameter, event) {
  const authorizationCode = String(parameter.code || "").trim();
  if (authorizationCode === "") return null;
  try {
    const callbackFn = getOverridableApiFn_("handleOAuthCodeCallback", handleOAuthCodeCallback);
    return callbackFn(authorizationCode, event);
  } catch (error) {
    return webApiError(
      "oauth_callback_failed",
      "Google 登入回傳處理失敗：" + String(error && error.message ? error.message : error)
    );
  }
}

function buildDoGetFallbackResponse_() {
  return jsonResponse({
    ok: true,
    service: "gas-course-web-template",
    version: WEB_API_VERSION
  });
}

function renderDoGetHtml_(initialAuthResult, parameter) {
  if (typeof HtmlService === "undefined" || !HtmlService.createTemplateFromFile) {
    return null;
  }
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
    return null;
  }
}

function doGet(e) {
  const parameter = e && e.parameter ? e.parameter : {};
  const action = String(parameter.action || "").trim();
  if (action !== "") {
    return handleDoGetActionRequest_(action, e);
  }

  const initialAuthResult = resolveDoGetInitialAuth_(parameter, e);
  const htmlOutput = renderDoGetHtml_(initialAuthResult, parameter);
  return htmlOutput || buildDoGetFallbackResponse_();
}

function doPost(e) {
  let payload;
  try {
    const parseFn = getOverridableApiFn_("parseWebApiPayload", parseWebApiPayload);
    payload = parseFn(e);
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

  const execFn = getOverridableApiFn_("executeWebApi", executeWebApi);
  return jsonResponse(execFn(payload, e));
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
    parseOAuthState: parseOAuthState_,
    consumeOAuthNonce: consumeOAuthNonce_,
    validateOAuthCallbackState: validateOAuthCallbackState_,
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
