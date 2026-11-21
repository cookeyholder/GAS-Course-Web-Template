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

const GAS_RUNTIME =
  typeof globalThis !== "undefined" && globalThis.gasRuntime
    ? globalThis.gasRuntime
    : typeof require === "function"
      ? require("./gasRuntime.js")
      : null;

// Node.js 單元測試環境：僅注入白名單匯出，避免 Object.assign 全域污染與空 catch 掩蓋錯誤。
if (typeof require !== "undefined" && GAS_RUNTIME) {
  GAS_RUNTIME.injectGlobals_("./databaseInitializer.js", [
    "normalizeRole",
    "getRoleDisplayName",
    "readSystemSettings",
    "saveSystemSettings",
    "readWhitelist",
    "saveWhitelist",
    "getAccountRole",
    "bootstrapAdminIfNeeded"
  ]);
  GAS_RUNTIME.injectGlobals_("./subjectCodeTransformer.js", [
    "importNormalizedCourseCodes",
    "getNormalizedCourses",
    "getCourseIndexStats"
  ]);
}

/** Web API 版本號由 gasRuntime 提供（單一來源） */
const WEB_API_VERSION = GAS_RUNTIME.WEB_API_VERSION;

/** 系統管理員顯示名稱由 gasRuntime 提供（單一來源） */
const ADMIN_ROLE_NAME = GAS_RUNTIME.ROLE_DEFINITIONS.admin;

/**
 * 操作日誌查詢模組（task 4.1）：實際邏輯移入 activityLogQuery.js，
 * 此處僅注入 webApi 專有的相依並保留 facade 轉發。
 * GAS 環境由全域取得；Node 環境主動 require。
 */
const ACTIVITY_LOG_QUERY_MODULE =
  typeof globalThis !== "undefined" && globalThis.activityLogQuery
    ? globalThis.activityLogQuery
    : typeof require === "function"
      ? require("./activityLogQuery.js")
      : null;
const ACTIVITY_LOG_QUERY = ACTIVITY_LOG_QUERY_MODULE
  ? ACTIVITY_LOG_QUERY_MODULE.createActivityLogQuery({
      webApiError: webApiError,
      adminRoleCode: GAS_RUNTIME.ROLE_CODES.ADMIN,
      adminRoleName: ADMIN_ROLE_NAME,
      sheetName: GAS_RUNTIME.SHEET_ACTIVITY_LOG,
      getSpreadsheet: getRouteSpreadsheet_,
      fieldIndex: GAS_RUNTIME.ACTIVITY_LOG_FIELD_INDEX
    })
  : null;

/** action 登錄表（前後端共用單一來源） */
const ACTION_REGISTRY =
  typeof globalThis !== "undefined" && globalThis.actionRegistry
    ? globalThis.actionRegistry
    : typeof require === "function"
      ? require("./actionRegistry.js")
      : null;
const WEB_API_SESSION_TTL_SECONDS = 21600; // 6 小時
const WEB_API_LOCK_TIMEOUT_MS = 15000;
const OAUTH_STATE_NONCE_CACHE_PREFIX = "gas_tmpl_oauth_nonce_";
const OAUTH_STATE_NONCE_TTL_SECONDS = 600;
const WEB_API_MEMORY_NONCES = {};

/** 公開／寫入／全域鎖 action 清單由 ACTION_REGISTRY 單一來源產生 */
const WEB_API_PUBLIC_ACTIONS = ACTION_REGISTRY.listPublicActions();
const WEB_API_WRITE_ACTIONS = ACTION_REGISTRY.listWriteActions();
const WEB_API_LOCKED_ACTIONS = ACTION_REGISTRY.listLockedActions();
const WEB_API_DO_GET_ACTIONS = ACTION_REGISTRY.listDoGetAllowedActions();
const ACTIVITY_LOG_EXCLUDED_ACTIONS = ACTION_REGISTRY.listLogExcludedActions();
const WEB_API_IDENTITY_BACKFILL_ACTIONS = ACTION_REGISTRY.listIdentityBackfillActions();

const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const WEB_API_SESSION_PREFIX = "gas_tmpl_session_";

/** 匯入 API 邊界限制：列數上限與原始／正規化欄數 */
const WEB_API_IMPORT_MAX_ROWS = 100000;
const WEB_API_IMPORT_RAW_COLUMNS = 39;
const WEB_API_IMPORT_NORMALIZED_COLUMNS = 14;

/** 匯入冪等結果快取前綴與保存時間（6 小時，與 Session TTL 一致） */
const WEB_API_IMPORT_RESULT_PREFIX = "gas_tmpl_import_";
const WEB_API_IMPORT_RESULT_TTL_SECONDS = WEB_API_SESSION_TTL_SECONDS;

/** 角色權限矩陣（RBAC）由 ACTION_REGISTRY 產生，所有角色皆明確列舉 action */
const ROLE_PERMISSIONS = ACTION_REGISTRY.buildRolePermissions();

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
  return GAS_RUNTIME.normalizeAllowedDomain(configuredDomain);
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
 * 單一 Script Lock 模板（task 4.3）：取得鎖後執行 fn，並在 finally 釋放。
 *
 * - 無 LockService 或 skipLock 時直接執行 fn（Node 測試環境與非鎖定動作）。
 * - tryLock 失敗或擲錯時呼叫 onLockFailure；未提供時回傳 lock_timeout 錯誤。
 * - 釋放鎖的 try/catch 集中在這裡，釋放失敗不影響已完成的工作。
 *
 * @param {Object} [options] - 選項
 * @param {Object} [options.lockService] - 鎖服務（預設使用全域 LockService）
 * @param {boolean} [options.skipLock] - 是否略過鎖定
 * @param {Function} [options.onLockFailure] - 取得鎖失敗時的處理函式
 * @param {Function} fn - 臨界區回呼，接收鎖狀態
 * @returns {*} fn 或 onLockFailure 的回傳值
 */
function withScriptLock_(options, fn) {
  const config = options || {};
  const lockService =
    config.lockService || (typeof LockService !== "undefined" && LockService.getScriptLock ? LockService : null);
  const lockState = { lock: null, hasLock: false, lockFailed: false };
  // 無可用鎖服務或明確略過：直接執行，不視為逾時。
  if (config.skipLock === true || !lockService) return fn(lockState);

  const lock = lockService.getScriptLock();
  let acquired = false;
  try {
    acquired = !!lock.tryLock(WEB_API_LOCK_TIMEOUT_MS);
  } catch (lockError) {
    acquired = false;
  }
  if (!acquired) {
    lockState.lockFailed = true;
    if (typeof config.onLockFailure === "function") return config.onLockFailure(lockState);
    return webApiError("lock_timeout", "系統繁忙中，請稍候片刻再試");
  }

  lockState.lock = lock;
  lockState.hasLock = true;
  try {
    return fn(lockState);
  } finally {
    try {
      lock.releaseLock();
    } catch (releaseError) {
      // 釋放失敗不影響已完成的寫入結果
    }
  }
}

/**
 * 在短臨界區內執行首次管理員開通；寫入前重新檢查白名單以避免並發覆寫。
 * 無 LockService 的 Node 測試環境直接執行回呼。
 */
function runBootstrapWithLock_(fn) {
  return withScriptLock_({}, fn);
}

function createSessionForEmail(email, name, options) {
  options = options || {};
  const ss = GAS_RUNTIME.getActiveSpreadsheetSafe_(options);

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
    return webApiError(
      "not_whitelisted",
      "您的帳號（" + cleanEmail + "）尚未加入系統授權名單，請洽" + ADMIN_ROLE_NAME + "開通權限"
    );
  }

  if (account.found && account.enabled === false) {
    return webApiError("account_disabled", "您的帳號（" + cleanEmail + "）目前處於停用狀態，請洽" + ADMIN_ROLE_NAME);
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

/** ID Token 時間宣告容許的時鐘誤差（秒） */
const GOOGLE_TOKEN_CLOCK_SKEW_SECONDS = 60;

function parseTokenTimeClaim_(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

function validateTokenInfoClaims_(info, expectedClientId, configuredDomain, options) {
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

  // 明確驗證 exp/iat，不依賴 tokeninfo 端點的間接保證。
  const settings = options || {};
  const nowSeconds = typeof settings.now === "function" ? Number(settings.now()) : Math.floor(Date.now() / 1000);
  const issuedAt = parseTokenTimeClaim_(info.iat);
  const expiresAt = parseTokenTimeClaim_(info.exp);
  if (issuedAt === null || expiresAt === null) {
    return webApiError("invalid_token_payload", "Google 憑證缺少有效的時間宣告");
  }
  if (!isFinite(nowSeconds) || nowSeconds <= 0) {
    return webApiError("invalid_token_payload", "系統時間異常，無法驗證 Google 憑證");
  }
  if (issuedAt > nowSeconds + GOOGLE_TOKEN_CLOCK_SKEW_SECONDS) {
    return webApiError("token_issued_in_future", "Google 憑證簽發時間異常，請確認裝置時間");
  }
  if (expiresAt <= issuedAt) {
    return webApiError("invalid_token_payload", "Google 憑證時間宣告異常");
  }
  if (nowSeconds > expiresAt + GOOGLE_TOKEN_CLOCK_SKEW_SECONDS) {
    return webApiError("token_expired", "Google 憑證已過期，請重新登入");
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
    return webApiError(
      "server_misconfigured",
      "系統尚未設定 Google OAuth Client ID，請" + ADMIN_ROLE_NAME + "先完成系統設定"
    );
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
    const claimError = validateTokenInfoClaims_(info, cleanClientId, configuredDomain, deps);
    if (claimError) return claimError;

    return buildVerifiedGoogleIdentity_(info);
  } catch (err) {
    // 不回傳例外 message 原文，避免內部路徑或設定值外洩。
    return webApiError("token_verify_error", "驗證 Google 憑證時發生錯誤，請稍後再試或重新登入");
  }
}

function loginWithGoogleIdToken(idToken, options) {
  const resolvedOptions = options || {};
  const ss = resolveLoginSpreadsheet_(resolvedOptions);
  const readSettingsFn = resolveRouteDependency_("readSystemSettings", readSystemSettings);
  const settings = readSettingsFn(ss) || {};
  const expectedClientId = resolvedOptions.clientId || settings.clientId || "";

  const verifyFn = resolveRouteDependency_("verifyGoogleIdToken", verifyGoogleIdToken);
  const verify = verifyFn(idToken, expectedClientId, settings.allowedLoginDomain);
  if (!verify.ok) return verify;

  const createSessionFn = resolveRouteDependency_("createSessionForEmail", createSessionForEmail);
  return createSessionFn(verify.email, verify.name, {
    spreadsheet: ss,
    allowBootstrap: resolvedOptions.allowBootstrap === true
  });
}

function resolveLoginSpreadsheet_(options) {
  return GAS_RUNTIME.getActiveSpreadsheetSafe_(options);
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

  const createSessionFn = resolveRouteDependency_("createSessionForEmail", createSessionForEmail);
  return createSessionFn(email, email, {
    spreadsheet: ss,
    allowBootstrap: !!(options && options.allowBootstrap === true)
  });
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
  return GAS_RUNTIME.getActiveSpreadsheetSafe_(deps);
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

/**
 * 在短臨界區內執行 OAuth 回呼寫入；取得失敗時回傳 lock_timeout，並在 finally 釋放鎖。
 * deps.lockService 可供測試注入，正式環境使用全域 LockService。
 */
function runOAuthCallbackWriteLock_(fn, deps) {
  // deps.lockService 可供測試注入；未注入時由 withScriptLock_ 使用全域 LockService。
  return withScriptLock_({ lockService: deps && deps.lockService ? deps.lockService : undefined }, fn);
}

function verifyAndCreateOAuthSession_(deps, tokenData, clientId, settings, ss, stateContext) {
  const verifyFn =
    deps && typeof deps.verifyGoogleIdToken === "function" ? deps.verifyGoogleIdToken : verifyGoogleIdToken;
  const createSessionFn =
    deps && typeof deps.createSessionForEmail === "function" ? deps.createSessionForEmail : createSessionForEmail;
  // ID Token 驗證可能為外部 HTTP tokeninfo 呼叫，必須在取得鎖之前完成。
  const verification = verifyFn(tokenData.id_token, clientId, settings.allowedLoginDomain);
  if (!verification.ok) return verification;

  const context = stateContext || {};
  return runOAuthCallbackWriteLock_(function () {
    const stateValidation = validateOAuthCallbackState_(context.state, context.expectedRedirectUri, deps);
    if (!stateValidation.ok) return stateValidation;
    return createSessionFn(verification.email, verification.name, {
      spreadsheet: ss,
      allowBootstrap: false
    });
  }, deps);
}

function validateOAuthCredentials_(settings) {
  const current = settings || {};
  const clientId = String(current.clientId || "").trim();
  const clientSecret = String(current.clientSecret || "").trim();

  if (!clientId) {
    return {
      valid: false,
      error: webApiError(
        "server_misconfigured",
        "系統尚未設定 OAuth Client ID，請" + ADMIN_ROLE_NAME + "先完成系統設定"
      )
    };
  }
  if (!clientSecret) {
    return {
      valid: false,
      error: webApiError("missing_client_secret", "系統尚未設定 OAuth Client Secret，無法完成 Google 帳號登入")
    };
  }
  return { valid: true, clientId: clientId, clientSecret: clientSecret };
}

function evaluateTokenExchangeResponse_(rawResponse) {
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

  return { ok: true, tokenData: tokenData };
}

function handleOAuthCodeCallback(code, e, deps) {
  const authorizationCode = String(code || "").trim();
  if (!authorizationCode) {
    return webApiError("missing_code", "缺少 Google 授權碼，請重新發起登入");
  }

  const context = deps && typeof deps === "object" ? deps : {};
  const ss = getOAuthSpreadsheet_(context);
  const settings = getOAuthSettings_(context, ss) || {};
  const credentials = validateOAuthCredentials_(settings);
  if (!credentials.valid) return credentials.error;

  const redirectUri = resolveOAuthRedirectUri(e && e.parameter ? e.parameter.state : "", getOAuthWebAppUrl_(context));
  const payload = {
    code: authorizationCode,
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code"
  };

  try {
    const rawResponse = getOAuthFetchResponse_(context, redirectUri, payload);
    const tokenResult = evaluateTokenExchangeResponse_(rawResponse);
    if (!tokenResult.ok) return tokenResult;

    return verifyAndCreateOAuthSession_(context, tokenResult.tokenData, credentials.clientId, settings, ss, {
      state: e && e.parameter ? e.parameter.state : "",
      expectedRedirectUri: getOAuthWebAppUrl_(context)
    });
  } catch (error) {
    return webApiError("token_exchange_error", "連線 Google 憑證伺服器失敗，請稍後再試");
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
  const ss = GAS_RUNTIME.getActiveSpreadsheetSafe_();
  const settings = readSystemSettings(ss);

  let needsBootstrap = false;
  try {
    needsBootstrap = (resolveRouteDependency_("readWhitelist", readWhitelist)(ss) || []).length === 0;
  } catch (error) {
    needsBootstrap = false;
  }

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
    webAppUrl: webAppUrl,
    needsBootstrap: needsBootstrap
  };
}

/**
 * 單一相依解析轉發入口：統一呼叫 gasRuntime.resolveDependency_。
 * 傳入 module.exports 作為 overrides，保留以 api[key] = stub 注入的測試接縫。
 *
 * @param {string} name - 相依匯出名稱
 * @param {*} [fallback] - 選用備援值
 * @param {string} [modulePath] - Node.js require 路徑（日誌模組使用）
 * @param {boolean} [requireModule] - 是否解析整包模組本體（日誌模組使用）
 * @returns {*} 解析後的相依
 */
function resolveRouteDependency_(name, fallback, modulePath, requireModule) {
  if (GAS_RUNTIME) {
    // GAS 環境無 module 全域，僅 Node.js 測試環境傳入 module.exports 做為注入接縫。
    const overrides = typeof module !== "undefined" && module.exports ? module.exports : null;
    return GAS_RUNTIME.resolveDependency_(name, modulePath || null, fallback, overrides, requireModule === true);
  }
  return fallback;
}

function getRouteSpreadsheet_() {
  return GAS_RUNTIME ? GAS_RUNTIME.getActiveSpreadsheetSafe_() : null;
}

/** 公開 action：ping */
function handlePingWebApiAction_() {
  return { ok: true, pong: Date.now(), version: WEB_API_VERSION };
}

/** 公開 action：getPublicConfig */
function handleGetPublicConfigWebApiAction_() {
  return resolveRouteDependency_("getPublicConfig", getPublicConfig)();
}

/** 公開 action：login */
function handleLoginWebApiAction_(payload) {
  return resolveRouteDependency_("loginWithGoogleIdToken", loginWithGoogleIdToken)(
    payload ? payload.idToken || payload.credential : "",
    { allowBootstrap: !!(payload && payload.bootstrap === true) }
  );
}

/** 公開 action：loginWithActiveUser */
function handleLoginWithActiveUserWebApiAction_(payload) {
  return resolveRouteDependency_(
    "loginWithActiveUser",
    loginWithActiveUser
  )({
    allowBootstrap: !!(payload && payload.bootstrap === true)
  });
}

/** 受保護 action：getSession */
function handleGetSessionWebApiAction_(payload) {
  return resolveRouteDependency_("getSessionState", getSessionState)(payload.token);
}

/** 受保護 action：logout */
function handleLogoutWebApiAction_(payload) {
  return resolveRouteDependency_("logoutSession", logoutSession)(payload.token);
}

/** 受保護 action：importCourseCodes */
function handleImportCourseCodesWebApiAction_(payload, session, ss) {
  const validation = validateImportRowsPayload_(payload);
  if (validation) return validation;
  const cached = getCachedImportResult_(payload.importId);
  if (cached) return Object.assign({}, cached, { idempotent: true });
  const result = resolveRouteDependency_("importNormalizedCourseCodes", importNormalizedCourseCodes)(payload.rows, {
    spreadsheet: ss,
    preNormalized: payload.preNormalized === true
  });
  cacheImportResult_(payload.importId, result);
  return result;
}

/** 受保護 action：getCourseIndex */
function handleGetCourseIndexWebApiAction_(payload, session, ss) {
  return resolveRouteDependency_("getNormalizedCourses", getNormalizedCourses)(payload, ss);
}

/** 受保護 action：getCourseIndexStats */
function handleGetCourseIndexStatsWebApiAction_(payload, session, ss) {
  return resolveRouteDependency_("getCourseIndexStats", getCourseIndexStats)(ss);
}

/** 受保護 action：getSystemSettings */
function handleGetSystemSettingsWebApiAction_(payload, session, ss) {
  return {
    ok: true,
    settings: sanitizeSystemSettingsForRole_(
      resolveRouteDependency_("readSystemSettings", readSystemSettings)(ss),
      session.role
    )
  };
}

/** 受保護 action：saveSystemSettings */
function handleSaveSystemSettingsWebApiAction_(payload, session, ss) {
  if (!ACTION_REGISTRY.isActionAllowed(session.role, "saveSystemSettings")) {
    return webApiError("forbidden", "僅" + ADMIN_ROLE_NAME + "可修改系統參數");
  }
  resolveRouteDependency_("saveSystemSettings", saveSystemSettings)(payload.settings || {}, ss);
  return { ok: true };
}

/** 受保護 action：getAccounts */
function handleGetAccountsWebApiAction_(payload, session, ss) {
  if (!ACTION_REGISTRY.isActionAllowed(session.role, "getAccounts")) {
    return webApiError("forbidden", "僅" + ADMIN_ROLE_NAME + "可檢視授權白名單");
  }
  return {
    ok: true,
    accounts: resolveRouteDependency_("readWhitelist", readWhitelist)(ss)
  };
}

/** 受保護 action：saveWhitelist */
function handleSaveWhitelistWebApiAction_(payload, session, ss) {
  if (!ACTION_REGISTRY.isActionAllowed(session.role, "saveWhitelist")) {
    return webApiError("forbidden", "僅" + ADMIN_ROLE_NAME + "可修改授權白名單");
  }
  return resolveRouteDependency_("saveWhitelist", saveWhitelist)(payload.accounts || [], ss);
}

/**
 * facade：以 Asia/Taipei 時區格式化日期（實際邏輯見 activityLogQuery.js）。
 *
 * @param {Date} date - 日期物件
 * @returns {string} yyyy-MM-dd
 */
function formatTaipeiDate_(date) {
  if (ACTIVITY_LOG_QUERY) return ACTIVITY_LOG_QUERY.formatTaipeiDate(date);
  return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * facade：將時間戳記正規化為 `yyyy-MM-dd HH:mm:ss`（實際邏輯見 activityLogQuery.js）。
 *
 * @param {*} value - 原始儲存格值
 * @returns {string} 正規化後字串
 */
function normalizeActivityLogTimestamp_(value) {
  if (ACTIVITY_LOG_QUERY) return ACTIVITY_LOG_QUERY.normalizeActivityLogTimestamp(value);
  return String(value === null || value === undefined ? "" : value);
}

/**
 * facade：受保護 action getActivityLog（實際查詢邏輯見 activityLogQuery.js）。
 *
 * @param {Object} payload - 請求 payload
 * @param {Object} session - 工作階段
 * @param {*} ss - 試算表
 * @returns {Object} 查詢結果
 */
function handleGetActivityLogWebApiAction_(payload, session, ss) {
  if (ACTIVITY_LOG_QUERY) return ACTIVITY_LOG_QUERY.handleGetActivityLog(payload, session, ss);
  return webApiError("server_error", "系統發生未預期的錯誤，請稍後再試");
}

/** 將所有 action 的處理函式註冊至 ACTION_REGISTRY，消除獨立 switch 造成的漂移。 */
function registerWebApiActionHandlers_() {
  const handlers = {
    ping: handlePingWebApiAction_,
    getPublicConfig: handleGetPublicConfigWebApiAction_,
    login: handleLoginWebApiAction_,
    loginWithActiveUser: handleLoginWithActiveUserWebApiAction_,
    getSession: handleGetSessionWebApiAction_,
    logout: handleLogoutWebApiAction_,
    importCourseCodes: handleImportCourseCodesWebApiAction_,
    getCourseIndex: handleGetCourseIndexWebApiAction_,
    getCourseIndexStats: handleGetCourseIndexStatsWebApiAction_,
    getSystemSettings: handleGetSystemSettingsWebApiAction_,
    saveSystemSettings: handleSaveSystemSettingsWebApiAction_,
    getAccounts: handleGetAccountsWebApiAction_,
    saveWhitelist: handleSaveWhitelistWebApiAction_,
    getActivityLog: handleGetActivityLogWebApiAction_
  };
  Object.keys(handlers).forEach(function (name) {
    ACTION_REGISTRY.setHandler(name, handlers[name]);
  });
}

registerWebApiActionHandlers_();

function routePublicWebApiAction_(name, payload) {
  const handler = ACTION_REGISTRY.getHandler(name);
  if (!handler || !ACTION_REGISTRY.isPublicAction(name)) return null;
  return handler(payload);
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
  if (String(role || "") === GAS_RUNTIME.ROLE_CODES.ADMIN) return source;
  const safe = Object.assign({}, source);
  delete safe.clientSecret;
  return safe;
}

/**
 * 驗證匯入 payload 的二維陣列結構、列數上限與每列欄數。
 * 回傳 null 代表通過；否則回傳 webApiError。
 */
function validateImportRowsPayload_(payload) {
  const rows = payload && payload.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    return webApiError("missing_rows", "缺少課程代碼資料（rows）");
  }
  if (rows.length > WEB_API_IMPORT_MAX_ROWS) {
    return webApiError("too_many_rows", "匯入筆數超過上限（最多 " + WEB_API_IMPORT_MAX_ROWS + " 筆），請分批匯入");
  }
  const expectedColumns =
    payload.preNormalized === true ? WEB_API_IMPORT_NORMALIZED_COLUMNS : WEB_API_IMPORT_RAW_COLUMNS;
  for (let i = 0; i < rows.length; i++) {
    if (!Array.isArray(rows[i])) {
      return webApiError("invalid_rows", "第 " + (i + 1) + " 列資料格式錯誤，請確認為二維陣列");
    }
    if (rows[i].length !== expectedColumns) {
      return webApiError("invalid_columns", "第 " + (i + 1) + " 列欄數不符（應為 " + expectedColumns + " 欄）");
    }
  }
  return null;
}

/** 讀取匯入冪等結果；無 importId、格式異常或快取不存在時回傳 null。 */
function getCachedImportResult_(importId) {
  const id = String(importId || "").trim();
  if (!id || id.length > 200) return null;
  try {
    const raw = getCacheStore().get(WEB_API_IMPORT_RESULT_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.ok === true ? parsed : null;
  } catch (error) {
    return null;
  }
}

/** 保存成功的匯入結果供相同 importId 重送時直接回傳。 */
function cacheImportResult_(importId, result) {
  const id = String(importId || "").trim();
  if (!id || id.length > 200 || !result || result.ok !== true) return;
  try {
    getCacheStore().put(WEB_API_IMPORT_RESULT_PREFIX + id, JSON.stringify(result), WEB_API_IMPORT_RESULT_TTL_SECONDS);
  } catch (error) {
    // 快取寫入失敗不影響已完成的匯入
  }
}

function routeProtectedWebApiAction_(name, payload, session, ss) {
  const handler = ACTION_REGISTRY.getHandler(name);
  if (!handler) return webApiError("unknown_action", "未支援的 action：" + name);
  return handler(payload, session, ss);
}

function routeWebApiAction(action, payload, event) {
  const name = String(action || "").trim();
  if (name === "") return webApiError("missing_action", "缺少 action 參數");
  if (!ACTION_REGISTRY.hasAction(name)) {
    return webApiError("unknown_action", "未支援的 action：" + name);
  }

  const publicResult = routePublicWebApiAction_(name, payload);
  if (publicResult !== null) return publicResult;

  // 路由一律自行向伺服器端 session 驗證；GAS 全域函式可經 google.script.run
  // 直接呼叫，任何由呼叫端傳入的授權結果都不得作為信任依據。
  const authorization = resolveRouteDependency_("authorizeWebApiAction", authorizeWebApiAction)(name, payload || {});
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
 * 操作日誌攔截器實例（task 4.2）：實際邏輯移入 activityLogInterceptor.js，
 * 此處僅注入 webApi 專有的解析函式（保留以 module.exports 注入的測試接縫）。
 * GAS 環境由全域取得；Node 環境主動 require。
 */
const ACTIVITY_LOG_INTERCEPTOR_MODULE =
  typeof globalThis !== "undefined" && globalThis.activityLogInterceptor
    ? globalThis.activityLogInterceptor
    : typeof require === "function"
      ? require("./activityLogInterceptor.js")
      : null;
const ACTIVITY_LOG_INTERCEPTOR = ACTIVITY_LOG_INTERCEPTOR_MODULE
  ? ACTIVITY_LOG_INTERCEPTOR_MODULE.createActivityLogInterceptor({
      generateSessionToken: generateSessionToken,
      resolveRoleDisplayName: function (role) {
        if (!role) return "";
        if (typeof getRoleDisplayName === "function") {
          try {
            return getRoleDisplayName(role) || String(role);
          } catch (error) {
            return String(role);
          }
        }
        return String(role);
      },
      getActionMeta: function (action) {
        return ACTION_REGISTRY.getActionMeta(action);
      },
      excludedActions: ACTIVITY_LOG_EXCLUDED_ACTIONS,
      resolveBuilders: function () {
        return resolveRouteDependency_("activityLogBuilders", null, "./activityLogBuilders.js", true);
      },
      resolveSnapshotProvider: function () {
        return {
          readSystemSettings: resolveRouteDependency_("readSystemSettings", readSystemSettings),
          readWhitelist: resolveRouteDependency_("readWhitelist", readWhitelist)
        };
      },
      getSpreadsheet: getRouteSpreadsheet_,
      resolveAppendActivityLog: function () {
        const loggerModule = resolveRouteDependency_("activityLogger", null, "./activityLogger.js", true);
        return resolveRouteDependency_("appendActivityLog", loggerModule ? loggerModule.appendActivityLog : null);
      },
      logError: function (message, detail) {
        console.error(message, detail);
      }
    })
  : null;

/**
 * facade：取得動作日誌中繼資料（實際邏輯見 activityLogInterceptor.js）。
 *
 * @param {string} action - 動作名稱
 * @returns {Object} 日誌中繼資料
 */
function getActivityLogMeta_(action) {
  return ACTIVITY_LOG_INTERCEPTOR.getMeta(action);
}

/**
 * facade：判斷動作是否應寫入日誌（實際邏輯見 activityLogInterceptor.js）。
 *
 * @param {string} action - 動作名稱
 * @param {Object} meta - 日誌中繼資料
 * @returns {boolean} 是否寫入
 */
function shouldLogActivity_(action, meta) {
  return ACTIVITY_LOG_INTERCEPTOR.shouldLog(action, meta);
}

/**
 * facade：建立請求層級的日誌 context（實際邏輯見 activityLogInterceptor.js）。
 *
 * @param {string} [action] - 動作名稱
 * @param {number} [startTime] - 起始時間（毫秒）
 * @returns {Object} 日誌 context
 */
function createWebApiLogContext_(action, startTime) {
  return ACTIVITY_LOG_INTERCEPTOR.createContext(action, startTime);
}

/**
 * facade：補寫已驗證身分（實際邏輯見 activityLogInterceptor.js）。
 *
 * @param {Object} context - 日誌 context
 * @param {Object} [authorization] - 授權結果
 * @param {Object} [result] - action 回傳結果
 * @returns {Object} 同一個 context
 */
function recordWebApiIdentity_(context, authorization, result) {
  return ACTIVITY_LOG_INTERCEPTOR.recordIdentity(context, authorization, result);
}

/**
 * facade：建立操作日誌寫入紀錄（實際邏輯見 activityLogInterceptor.js）。
 *
 * @param {Object} context - 日誌 context
 * @param {Object} meta - 動作日誌中繼資料
 * @param {Object} payload - 請求 payload
 * @param {Object} result - action 回傳結果
 * @param {*} [before] - 變動前快照
 * @returns {Object} 12 欄日誌紀錄
 */
function buildActivityLogRecord_(context, meta, payload, result, before) {
  return ACTIVITY_LOG_INTERCEPTOR.buildRecord(context, meta, payload, result, before);
}

/**
 * 執行 Web API Action，供 doPost 與 google.script.run 共用。
 *
 * @param {Object|string} payload - 請求資料物件或 JSON 字串
 * @param {Object} [event] - HTTP 原始事件物件
 * @returns {Object} Action 結果或錯誤物件
 */
/**
 * 由請求資料取得 action 字串，供日誌 context 與路由共用。
 *
 * @param {Object|string} payload - 請求資料
 * @param {Object} [event] - HTTP 原始事件物件
 * @param {boolean} [shouldTrim] - 是否去除前後空白
 * @returns {string} action 字串
 */
function getWebApiAction_(payload, event, shouldTrim) {
  const raw = String((payload && payload.action) || (event && event.parameter && event.parameter.action) || "");
  return shouldTrim ? raw.trim() : raw;
}

/**
 * 於 executeWebApi 的 finally 統一寫入操作日誌（鎖已由 withScriptLock_ 釋放）。
 * 日誌寫入失敗不得影響 API 回應。
 *
 * @param {Object} context - 日誌 context
 * @param {Object|null} actionMeta - 日誌中繼資料
 * @param {Object|string} payload - 原始請求資料
 * @param {Object|null} finalResult - 最終 API 回應
 * @param {Object|null} beforeSnapshot - 寫入前快照
 */
function finalizeWebApiRequest_(context, actionMeta, payload, finalResult, beforeSnapshot) {
  // 寫入與失敗隔離的實際邏輯見 activityLogInterceptor.js。
  ACTIVITY_LOG_INTERCEPTOR.finalize(context, actionMeta, payload, finalResult, beforeSnapshot);
}

function executeWebApi(payload, event) {
  const context = resolveRouteDependency_("createWebApiLogContext", createWebApiLogContext_)(
    getWebApiAction_(payload, event, false),
    Date.now()
  );
  let finalResult = null;
  let actionMeta = null;
  let beforeSnapshot = null;
  const finish_ = function (result) {
    finalResult = result;
    if (result && result.ok === false && !context.errorCode) {
      context.errorCode = result.error || "failed";
    }
    return result;
  };
  try {
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch (error) {
        context.errorCode = "invalid_json";
        return finish_(webApiError("invalid_json", "請求 JSON 格式錯誤"));
      }
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      context.errorCode = "invalid_json";
      return finish_(webApiError("invalid_json", "請求 JSON 格式錯誤"));
    }

    const action = getWebApiAction_(payload, event, true);
    context.action = action;
    if (action === "") {
      context.errorCode = "missing_action";
      return finish_(webApiError("missing_action", "缺少 action 參數"));
    }

    actionMeta = getActivityLogMeta_(action);

    // 取得一次授權結果僅供日誌 context 使用；路由會自行再次授權，
    // 兩次都讀取伺服器端 session，避免把授權結果作為公開參數傳入路由。
    let authorization = null;
    try {
      authorization = resolveRouteDependency_("authorizeWebApiAction", authorizeWebApiAction)(action, payload);
    } catch (error) {
      // 授權函式本身的例外交由路由再次觸發，維持既有 server_error 行為。
      authorization = null;
    }
    if (authorization) recordWebApiIdentity_(context, authorization, null);

    // 單一鎖模板：鎖定動作在臨界區內擷取快照並執行路由，
    // withScriptLock_ 於 fn 結束時先釋放鎖，外層 finally 才寫入日誌。
    const routeResult = withScriptLock_(
      {
        skipLock: WEB_API_LOCKED_ACTIONS.indexOf(action) === -1,
        onLockFailure: function () {
          context.errorCode = "lock_timeout";
          return webApiError("lock_timeout", "系統繁忙中，請稍候片刻再試");
        }
      },
      function () {
        if (shouldLogActivity_(action, actionMeta)) {
          beforeSnapshot = ACTIVITY_LOG_INTERCEPTOR.captureSnapshot(actionMeta);
        }
        const routeFn =
          typeof module !== "undefined" && module.exports && typeof module.exports.routeWebApiAction === "function"
            ? module.exports.routeWebApiAction
            : routeWebApiAction;
        const result = routeFn(action, payload, event);
        if (WEB_API_IDENTITY_BACKFILL_ACTIONS.indexOf(action) !== -1 && result && result.ok) {
          recordWebApiIdentity_(context, null, result);
        }
        return result;
      }
    );
    return finish_(routeResult);
  } catch (error) {
    console.error("[webApi executeWebApi error] " + (error && error.stack ? error.stack : error));
    context.errorCode = "server_error";
    return finish_(webApiError("server_error", "系統發生未預期的錯誤，請稍後再試"));
  } finally {
    finalizeWebApiRequest_(context, actionMeta, payload, finalResult, beforeSnapshot);
  }
}

function handleDoGetActionRequest_(action, event) {
  if (WEB_API_DO_GET_ACTIONS.indexOf(action) === -1) {
    return jsonResponse(
      webApiError(
        "method_not_allowed",
        "為保障安全性，除 " + WEB_API_DO_GET_ACTIONS.join(" 與 ") + " 外之操作一律必須使用 POST 方法發送"
      )
    );
  }
  try {
    const payload = parseWebApiPayload(event);
    const routeFn = resolveRouteDependency_("routeWebApiAction", routeWebApiAction);
    return jsonResponse(routeFn(action, payload, event));
  } catch (error) {
    return jsonResponse(webApiError("server_error", "系統發生未預期的錯誤，請稍後再試"));
  }
}

function resolveDoGetInitialAuth_(parameter, event) {
  const authorizationCode = String(parameter.code || "").trim();
  if (authorizationCode === "") return null;
  try {
    const callbackFn = resolveRouteDependency_("handleOAuthCodeCallback", handleOAuthCodeCallback);
    return callbackFn(authorizationCode, event);
  } catch (error) {
    return webApiError("oauth_callback_failed", "Google 登入回傳處理失敗，請重新發起登入");
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
  let payload = null;
  try {
    const parseFn = resolveRouteDependency_("parseWebApiPayload", parseWebApiPayload);
    payload = parseFn(e);
  } catch (error) {
    // 解析例外不提前回傳；改由 executeWebApi 的 try／finally 統一寫入失敗日誌
    payload = null;
  }

  // null／非物件 payload 與缺少 action 皆由 executeWebApi 判定並回傳對應錯誤，
  // 如此兩條 HTTP 失敗路徑也能進入最外層日誌攔截。
  const execFn = resolveRouteDependency_("executeWebApi", executeWebApi);
  return jsonResponse(execFn(payload, e));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WEB_API_VERSION: WEB_API_VERSION,
    ACTION_REGISTRY: ACTION_REGISTRY,
    WEB_API_PUBLIC_ACTIONS: WEB_API_PUBLIC_ACTIONS,
    WEB_API_WRITE_ACTIONS: WEB_API_WRITE_ACTIONS,
    WEB_API_LOCKED_ACTIONS: WEB_API_LOCKED_ACTIONS,
    WEB_API_DO_GET_ACTIONS: WEB_API_DO_GET_ACTIONS,
    ACTIVITY_LOG_EXCLUDED_ACTIONS: ACTIVITY_LOG_EXCLUDED_ACTIONS,
    WEB_API_IDENTITY_BACKFILL_ACTIONS: WEB_API_IDENTITY_BACKFILL_ACTIONS,
    WEB_API_IMPORT_MAX_ROWS: WEB_API_IMPORT_MAX_ROWS,
    WEB_API_IMPORT_RAW_COLUMNS: WEB_API_IMPORT_RAW_COLUMNS,
    WEB_API_IMPORT_NORMALIZED_COLUMNS: WEB_API_IMPORT_NORMALIZED_COLUMNS,
    WEB_API_IMPORT_RESULT_PREFIX: WEB_API_IMPORT_RESULT_PREFIX,
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,
    jsonResponse: jsonResponse,
    webApiError: webApiError,
    parseWebApiPayload: parseWebApiPayload,
    hasPermission: hasPermission,
    generateSessionToken: generateSessionToken,
    generateCsrfToken: generateCsrfToken,
    normalizeAllowedDomain: normalizeAllowedDomain,
    isAllowedGoogleDomain: isAllowedGoogleDomain,
    isAllowedOAuthRedirectUri: isAllowedOAuthRedirectUri,
    validateTokenInfoClaims: validateTokenInfoClaims_,
    resolveOAuthRedirectUri: resolveOAuthRedirectUri,
    parseOAuthState: parseOAuthState_,
    consumeOAuthNonce: consumeOAuthNonce_,
    validateOAuthCallbackState: validateOAuthCallbackState_,
    validateImportRowsPayload: validateImportRowsPayload_,
    getCachedImportResult: getCachedImportResult_,
    cacheImportResult: cacheImportResult_,
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
    handleGetActivityLogWebApiAction: handleGetActivityLogWebApiAction_,
    formatTaipeiDate: formatTaipeiDate_,
    normalizeActivityLogTimestamp: normalizeActivityLogTimestamp_,
    getPublicConfig: getPublicConfig,
    executeWebApi: executeWebApi,
    withScriptLock: withScriptLock_,
    createWebApiLogContext: createWebApiLogContext_,
    recordWebApiIdentity: recordWebApiIdentity_,
    buildActivityLogRecord: buildActivityLogRecord_,
    appendActivityLog: null,
    doGet: doGet,
    doPost: doPost
  };
}
