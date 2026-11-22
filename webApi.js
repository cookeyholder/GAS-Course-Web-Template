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

/**
 * 將資料物件封裝為 Google Apps Script JSON 文字回應或原生資料。
 * 若在 GAS 環境且 ContentService 可用，則回傳設定 MimeType.JSON 的 TextOutput 物件；
 * 在測試或 Node.js 環境中則直接回傳原物件。
 *
 * @param {Object} data - 欲回應的資料物件
 * @returns {GoogleAppsScript.Content.TextOutput|Object} 封裝後的回應物件
 */
function jsonResponse(data) {
  if (typeof ContentService !== "undefined" && ContentService.createTextOutput) {
    return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
  }
  return data;
}

/**
 * 建立標準錯誤結構回應物件。純函式，無副作用。
 *
 * @param {string} [code="unknown_error"] - 錯誤代碼（如 unauthorized, forbidden, invalid_payload 等）
 * @param {string} [message="執行發生未預期的錯誤"] - 臺灣繁體中文之安全錯誤說明訊息
 * @returns {{ ok: false, error: string, message: string }} 格式化錯誤物件
 */
function webApiError(code, message) {
  return {
    ok: false,
    error: code || "unknown_error",
    message: message || "執行發生未預期的錯誤"
  };
}

/**
 * 解析 HTTP 事件物件中的 payload 資料。
 * 支援 POST postData.contents（JSON 字串解析）以及 GET parameter 物件解析。
 *
 * @param {Object} e - Apps Script 傳入之 HTTP 事件物件
 * @param {Object} [e.postData] - POST 請求資料物件
 * @param {string} [e.postData.contents] - POST 請求字串內容
 * @param {Object} [e.parameter] - 查詢參數物件
 * @returns {Object|null} 解析後的 payload 字典物件；若 JSON 語法無效則回傳 null
 */
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

/**
 * 檢查指定角色是否具備呼叫某 action 之權限。
 *
 * @param {string} role - 角色名稱（admin, staff, viewer 等）
 * @param {string} action - action 動作名稱
 * @returns {boolean} 是否具備權限
 */
function hasPermission(role, action) {
  const normRole = normalizeRole(role);
  const permissions = ROLE_PERMISSIONS[normRole] || [];
  return permissions.indexOf(action) !== -1;
}

/**
 * 取得工作階段快取儲存實例。
 * 在 GAS 環境中回傳 CacheService.getScriptCache()；在 Node.js 測試環境中回傳記憶體暫存替身。
 *
 * @returns {{ get: Function, put: Function, remove: Function }} 快取儲存實例
 */
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

/**
 * 產生唯一的工作階段 Session Token 字串。
 * 格式為 `gas_` 加上 UUID 或隨機字串。
 *
 * @returns {string} Session Token
 */
function generateSessionToken() {
  if (typeof Utilities !== "undefined" && Utilities.getUuid) {
    return "gas_" + Utilities.getUuid().replace(/-/g, "");
  }
  const rand1 = Math.random().toString(36).substring(2);
  const rand2 = Math.random().toString(36).substring(2);
  const time = Date.now().toString(36);
  return "gas_" + time + "_" + rand1 + rand2;
}

/**
 * 產生唯一的防跨站請求偽造 CSRF Token 字串。
 * 格式為 `csrf_` 加上 UUID 或隨機字串。
 *
 * @returns {string} CSRF Token
 */
function generateCsrfToken() {
  if (typeof Utilities !== "undefined" && Utilities.getUuid) {
    return "csrf_" + Utilities.getUuid().replace(/-/g, "");
  }
  const rand1 = Math.random().toString(36).substring(2);
  const rand2 = Math.random().toString(36).substring(2);
  const time = Date.now().toString(36);
  return "csrf_" + time + "_" + rand1 + rand2;
}

/**
 * 正規化允許登入網域，委派至 gasRuntime 單一來源。
 *
 * @param {*} configuredDomain - 設定之網域值
 * @returns {string} 正規化後的小寫網域名稱（無前綴 @）
 */
function normalizeAllowedDomain(configuredDomain) {
  return GAS_RUNTIME.normalizeAllowedDomain(configuredDomain);
}

/**
 * 驗證使用者的 Google 電子郵件或受託管網域是否符合系統設定的允許登入網域。
 * 若系統未限制網域（空字串），則一律允許通過。純函式，無副作用。
 *
 * @param {string} email - 使用者電子郵件
 * @param {string} [configuredDomain] - 系統設定的限制網域
 * @param {string} [hostedDomain] - Google ID Token 的 hd (hosted domain) claim
 * @returns {boolean} 是否符合網域限制
 */
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
 *
 * @private
 * @param {Function} fn - 臨界區內執行的開通回呼函式
 * @returns {*} 回呼函式之回傳值
 */
function runBootstrapWithLock_(fn) {
  return withScriptLock_({}, fn);
}

/**
 * 依據指定的 Email 與姓名建立系統工作階段（Session）並寫入快取。
 * 若系統未初始化且請求明確允許 bootstrap，則自動在安全鎖內將其開通為首位管理員。
 *
 * @param {string} email - 使用者 Email
 * @param {string} [name] - 使用者姓名
 * @param {Object} [options={}] - 選項設定
 * @param {boolean} [options.allowBootstrap=false] - 是否允許首次自動開通管理員
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [options.spreadsheet] - 試算表實體注入
 * @returns {Object} 登入成功物件（含 token, csrfToken, role 等）或 webApiError 結構
 */
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

/**
 * 發送 HTTP 請求至 Google tokeninfo 端點取得 ID Token 解密資訊。
 *
 * @private
 * @param {string} idToken - Google ID Token
 * @param {Object} [deps] - 相依注入物件（支援測試替身）
 * @param {Function|null} [deps.fetch] - 自訂 fetch 實作
 * @returns {Object} HTTP 回應物件或 `{ unavailable: true }`
 */
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

/**
 * 驗證 Token 發行者是否為合法 Google 帳號服務。純函式，無副作用。
 *
 * @private
 * @param {string} issuer - 發行者字串
 * @returns {boolean} 是否合法
 */
function isValidGoogleIssuer_(issuer) {
  return issuer === "https://accounts.google.com" || issuer === "accounts.google.com";
}

/**
 * 判斷 Token 中的 email_verified 宣告是否為真。純函式，無副作用。
 *
 * @private
 * @param {boolean|string} value - 宣告值
 * @returns {boolean} 是否已驗證
 */
function isVerifiedGoogleEmail_(value) {
  return value === true || value === "true";
}

/** ID Token 時間宣告容許的時鐘誤差（秒） */
const GOOGLE_TOKEN_CLOCK_SKEW_SECONDS = 60;

/**
 * 解析 Token 時間宣告欄位為有效秒數數值。純函式，無副作用。
 *
 * @private
 * @param {*} value - 時間數值或字串
 * @returns {number|null} 秒數時間戳記，若無效則回傳 null
 */
function parseTokenTimeClaim_(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  if (!isFinite(numeric) || numeric <= 0) return null;
  return numeric;
}

/**
 * 驗證 Google tokeninfo 回傳之各項聲明（Claims）。純函式，無副作用。
 *
 * @private
 * @param {Object} info - Google tokeninfo 解析物件
 * @param {string} expectedClientId - 預期的 OAuth Client ID
 * @param {string} [configuredDomain] - 系統限制之登入網域
 * @param {Object} [options] - 驗證選項
 * @param {Function} [options.now] - 取得目前秒數時間戳記之回呼
 * @returns {Object|null} 驗證失敗回傳 webApiError 物件，全數通過回傳 null
 */
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

/**
 * 建立通過驗證之 Google 身分資料物件。純函式，無副作用。
 *
 * @private
 * @param {Object} info - tokeninfo 回傳之 payload 物件
 * @returns {{ ok: true, email: string, name: string, sub: string, picture: string }} 格式化身分物件
 */
function buildVerifiedGoogleIdentity_(info) {
  return {
    ok: true,
    email: String(info.email).toLowerCase(),
    name: info.name || info.email,
    sub: info.sub,
    picture: info.picture
  };
}

/**
 * 呼叫 Google tokeninfo API 驗證 ID Token 之簽名、發行者、受眾與有效期。
 *
 * @param {string} idToken - 由前端 Google Identity Services (GIS) 取得的憑證字串
 * @param {string} expectedClientId - 系統設定之 OAuth Client ID
 * @param {string} [configuredDomain] - 系統限制之登入網域
 * @param {Object} [deps] - 相依注入物件（支援測試替身）
 * @returns {Object} 驗證成功回傳身分物件，失敗回傳 webApiError
 */
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

/**
 * 透過 Google ID Token 執行登入驗證並建立 Session。
 *
 * @param {string} idToken - Google ID Token 字串
 * @param {Object} [options] - 選項設定
 * @param {string} [options.clientId] - 覆寫 Client ID
 * @param {boolean} [options.allowBootstrap] - 是否允許首次自動開通管理員
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [options.spreadsheet] - 試算表實體注入
 * @returns {Object} 登入成功物件或 webApiError
 */
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

/**
 * 安全解析登入所需的試算表實體。
 *
 * @private
 * @param {Object} [options] - 選項設定
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet|null} 試算表實體
 */
function resolveLoginSpreadsheet_(options) {
  return GAS_RUNTIME.getActiveSpreadsheetSafe_(options);
}

/**
 * 透過 Apps Script Session.getActiveUser() 取得目前執行者的 Google 帳號 Email。
 *
 * @private
 * @returns {string} 小寫 Email 字串；若無法取得則回傳空字串
 */
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

/**
 * 透過 GAS 現存使用中帳號（Active User）自動執行免密碼/免提示登入。
 * 僅在同一組織或以使用者身分執行之部署情境生效。
 *
 * @param {Object} [options] - 選項設定
 * @param {boolean} [options.allowBootstrap] - 是否允許首次開通管理員
 * @returns {Object} 登入成功物件或 webApiError
 */
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

/**
 * 檢查 OAuth 重新導向 URI 是否符合白名單規則（GAS 部署網址或本機 localhost）。純函式，無副作用。
 *
 * @param {string} uri - 待檢查之重新導向 URI
 * @returns {boolean} 是否符合白名單
 */
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

/**
 * 將 Base64 編碼之 OAuth state 字串解碼為 UTF-8 明文字串。
 *
 * @private
 * @param {string} raw - Base64 字串
 * @returns {string} 解碼後字串
 */
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
 * 解析 OAuth state 字串；回傳包含 nonce 與 redirectUri 之物件，若格式非有效 JSON 則回傳 null。純函式，無副作用。
 *
 * @private
 * @param {string} raw - 原始 state 字串（Base64 編碼）
 * @returns {{ nonce: string, redirectUri: string }|null} 解析結果
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

/**
 * 解析並驗證 OAuth 重新導向 URI；若符合白名單則採用，否則退回 fallbackUrl。純函式，無副作用。
 *
 * @param {string} state - OAuth state 參數
 * @param {string} [fallbackUrl] - 預設備援網址
 * @returns {string} 安全的重新導向網址
 */
function resolveOAuthRedirectUri(state, fallbackUrl) {
  const fallback = String(fallbackUrl || "").trim();
  const parsed = parseOAuthState_(state);
  if (!parsed) return fallback;
  return isAllowedOAuthRedirectUri(parsed.redirectUri) ? parsed.redirectUri : fallback;
}

/**
 * 取得 nonce 一次性消耗的快取；GAS 用 CacheService，Node 測試用記憶體備援。
 *
 * @private
 * @param {Object} [deps] - 相依注入物件
 * @returns {{ get: Function, put: Function }} 快取實例
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
 * 一次性消耗 OAuth state 中的 nonce；若重放（Replay Attack）或格式異常時回傳 false。
 *
 * @private
 * @param {string} nonce - 隨機字串
 * @param {Object} [deps] - 相依注入物件
 * @returns {boolean} 是否消耗成功（未被重放）
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
 *
 * @private
 * @param {string} state - 回呼 state 字串
 * @param {string} expectedRedirectUri - 系統預期導向網址
 * @param {Object} [deps] - 相依注入
 * @returns {Object} 驗證成功回傳 `{ ok: true, redirectUri }`，失敗回傳 webApiError
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

/**
 * 安全取得 OAuth 流程中的試算表實體。
 *
 * @private
 * @param {Object} [deps] - 相依注入物件
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet|null} 試算表實體
 */
function getOAuthSpreadsheet_(deps) {
  return GAS_RUNTIME.getActiveSpreadsheetSafe_(deps);
}

/**
 * 讀取系統設定供 OAuth 流程使用。
 *
 * @private
 * @param {Object} [deps] - 相依注入物件
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} [ss] - 試算表實體
 * @returns {Object} 系統設定字典物件
 */
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

/**
 * 取得目前發布之 Web App URL 供 OAuth 回呼導向使用。
 *
 * @private
 * @param {Object} [deps] - 相依注入物件
 * @returns {string} Web App URL
 */
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

/**
 * 發送 POST 請求至 Google OAuth Token 端點進行授權碼交換。
 *
 * @private
 * @param {Object} deps - 相依注入物件
 * @param {string} redirectUri - 導向網址
 * @param {Object} payload - 交換引數
 * @returns {Object} 原生 HTTP 回應物件
 */
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

/**
 * 正規化 OAuth HTTP 回應結構，相容 Apps Script HTTPResponse 與 Node 測試替身。純函式，無副作用。
 *
 * @param {Object} response - 原始回應物件
 * @returns {{ statusCode: number, text: string }} 正規化回應物件
 */
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

/**
 * 解析 OAuth Token 端點回應之 JSON 字串。純函式，無副作用。
 *
 * @private
 * @param {string} responseText - 回應字串
 * @returns {{ ok: true, data: Object }|Object} 解析成功或 webApiError
 */
function parseOAuthTokenData_(responseText) {
  try {
    return { ok: true, data: JSON.parse(responseText) };
  } catch (parseError) {
    return webApiError("token_parse_error", "解析 Google 憑證回應失敗，請重新登入");
  }
}

/**
 * 建立 OAuth 授權碼交換失敗的友善錯誤回應。純函式，無副作用。
 *
 * @private
 * @param {number} statusCode - HTTP 狀態碼
 * @param {Object} tokenData - 錯誤 payload
 * @returns {Object} webApiError
 */
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
 *
 * @private
 * @param {Function} fn - 臨界區回呼函式
 * @param {Object} [deps] - 相依注入物件
 * @returns {*} 回呼函式之執行結果
 */
function runOAuthCallbackWriteLock_(fn, deps) {
  // deps.lockService 可供測試注入；未注入時由 withScriptLock_ 使用全域 LockService。
  return withScriptLock_({ lockService: deps && deps.lockService ? deps.lockService : undefined }, fn);
}

/**
 * 驗證 Token 資料並在安全臨界區內建立 OAuth 工作階段。
 *
 * @private
 * @param {Object} deps - 相依注入物件
 * @param {Object} tokenData - 交換回傳之 Token 資料
 * @param {string} clientId - OAuth Client ID
 * @param {Object} settings - 系統設定
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss - 試算表實體
 * @param {Object} stateContext - 狀態脈絡
 * @returns {Object} 登入成功物件或 webApiError
 */
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

/**
 * 驗證系統是否已完成 OAuth 憑證（Client ID 與 Client Secret）設定。純函式，無副作用。
 *
 * @private
 * @param {Object} settings - 系統設定物件
 * @returns {{ valid: boolean, clientId?: string, clientSecret?: string, error?: Object }} 檢查結果
 */
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

/**
 * 評估 Token 交換之 HTTP 回應狀態並解析 Token 物件。
 *
 * @private
 * @param {Object} rawResponse - 原始 HTTP 回應物件
 * @returns {Object} `{ ok: true, tokenData }` 或 webApiError
 */
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

/**
 * 處理 Google OAuth 授權碼回呼請求（Authorization Code Flow）。
 *
 * @param {string} code - Google 授權碼
 * @param {Object} e - HTTP 請求事件物件
 * @param {Object} [deps] - 測試相依注入物件
 * @returns {Object} 登入成功物件或 webApiError
 */
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

/**
 * 依據 Session Token 讀取快取中的工作階段詳細資料。
 *
 * @param {string} token - Session Token
 * @returns {{ ok: true, session: Object }|Object} 成功回傳 session，失敗回傳 webApiError
 */
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

/**
 * 取得公開的前端工作階段狀態（過濾內部細節，提供身分、角色與 CSRF Token）。
 *
 * @param {string} token - Session Token
 * @returns {Object} 工作階段狀態物件或 webApiError
 */
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

/**
 * 註銷指定的 Session Token，從快取中清除。
 *
 * @param {string} token - Session Token
 * @returns {{ ok: true }} 登出結果
 */
function logoutSession(token) {
  const cleanToken = String(token || "").trim();
  if (cleanToken) {
    const cache = getCacheStore();
    cache.remove(WEB_API_SESSION_PREFIX + cleanToken);
  }
  return { ok: true };
}

/**
 * 驗證呼叫 action 之授權狀態（公開 action 放行，受保護 action 檢核 Session 與角色權限）。
 *
 * @param {string} action - action 名稱
 * @param {Object} [payload] - 請求內容（包含 token）
 * @returns {{ ok: true, session: Object|null }|Object} 授權通過或 webApiError
 */
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

/**
 * 取得 Web App 公開設定資訊（供前端初始化、登入介面判斷使用）。
 *
 * @returns {Object} 包含系統名稱、Client ID、網域限制、版本等公開欄位之物件
 */
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

/**
 * 執行 Web API Action 進入點，供 doPost 與 google.script.run 共用。
 * 負責請求 JSON 格式解析、動作授權檢查、ScriptLock 保護與最外層統一操作日誌寫入。
 *
 * @param {Object|string} payload - 請求資料物件或 JSON 字串
 * @param {Object} [event] - HTTP 原始事件物件
 * @returns {Object} Action 執行結果物件或標準錯誤物件（webApiError）
 */
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

/**
 * 處理經由 GET 傳入之 action 操作請求（僅允許 ping 與 getPublicConfig 等白名單）。
 *
 * @private
 * @param {string} action - action 名稱
 * @param {Object} event - GET 請求事件物件
 * @returns {GoogleAppsScript.Content.TextOutput|Object} JSON 回應物件
 */
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

/**
 * 解析 doGet 中的 Google OAuth 授權碼回傳參數並執行初始登入。
 *
 * @private
 * @param {Object} parameter - 查詢參數字典
 * @param {Object} event - GET 事件物件
 * @returns {Object|null} 授權處理結果物件，若無授權碼則回傳 null
 */
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

/**
 * 建立 doGet 在無 HtmlService 或無樣板時的備援 JSON 回應。
 *
 * @private
 * @returns {GoogleAppsScript.Content.TextOutput|Object} JSON 回應
 */
function buildDoGetFallbackResponse_() {
  return jsonResponse({
    ok: true,
    service: "gas-course-web-template",
    version: WEB_API_VERSION
  });
}

/**
 * 渲染前端主應用程式之 index.html 樣板。
 *
 * @private
 * @param {Object|null} initialAuthResult - 初始登入驗證結果
 * @param {Object} parameter - 查詢參數
 * @returns {GoogleAppsScript.HTML.HtmlOutput|null} 渲染後的 HTML 頁面輸出，失敗時回傳 null
 */
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

const WEB_APP_DOC_ROUTE_PARAM = "page";

/** 允許透過 Web App 路由存取的文件白名單（路由值 → HtmlService 檔案與標題） */
const WEB_APP_DOC_ROUTES = {
  "docs/architecture-guide.html": {
    file: "docs/architecture-guide",
    title: "系統架構指南"
  },
  "docs/clasp-guide.html": {
    file: "docs/clasp-guide",
    title: "CLASP 部署指南"
  },
  "docs/course-normalization-guide.html": {
    file: "docs/course-normalization-guide",
    title: "課程代碼正規化指南"
  },
  "docs/gis-login-guide.html": {
    file: "docs/gis-login-guide",
    title: "GIS 登入指南"
  },
  "docs/index.html": {
    file: "docs/index",
    title: "技術手冊索引"
  },
  "docs/rbac-guide.html": {
    file: "docs/rbac-guide",
    title: "RBAC 權限指南"
  },
  "docs/user-guide.html": {
    file: "docs/user-guide",
    title: "使用者操作手冊"
  }
};

/**
 * 正規化並解析文件路由參數；僅接受白名單完全相符的 docs/*.html 路徑。
 *
 * @param {string} requestedPath - 使用者請求的文件路徑
 * @returns {Object|null} 白名單文件設定，無效時回傳 null
 */
function resolveWebAppDocRoute(requestedPath) {
  let raw = String(requestedPath == null ? "" : requestedPath).trim();
  if (raw === "") return null;
  try {
    raw = decodeURIComponent(raw);
  } catch (e) {
    // 保留原始值，後續由白名單比對攔截
  }
  raw = raw.replace(/\\/g, "/");
  if (raw.indexOf("..") !== -1 || raw.indexOf("\0") !== -1) return null;
  if (raw.charAt(0) === "/" || /^[A-Za-z]:\//.test(raw)) return null;
  if (!/\.html$/i.test(raw)) return null;
  return Object.prototype.hasOwnProperty.call(WEB_APP_DOC_ROUTES, raw) ? WEB_APP_DOC_ROUTES[raw] : null;
}

/**
 * 建立文件找不到時的回應；不讀取 docs/ 範圍外檔案。
 *
 * @returns {Object} HtmlService 輸出或錯誤物件
 */
function createWebAppDocNotFoundOutput() {
  if (typeof HtmlService !== "undefined" && HtmlService.createHtmlOutput) {
    return HtmlService.createHtmlOutput(
      '<!doctype html><html lang="zh-TW"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>找不到文件</title></head><body style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:24px;line-height:1.6"><h1 style="margin-top:0">找不到文件</h1><p>您請求的文件不存在或未開放存取。</p></body></html>'
    )
      .setTitle("找不到文件")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
  }
  return webApiError("not_found", "找不到文件");
}

/**
 * 處理 Web App 文件路由回應，相容 clasp 檔案扁平化候選。
 *
 * @param {string} requestedPath - 使用者請求的文件路徑
 * @returns {Object} HtmlService 輸出或錯誤物件
 */
function createWebAppDocResponse(requestedPath) {
  const entry = resolveWebAppDocRoute(requestedPath);
  if (!entry) return createWebAppDocNotFoundOutput();
  if (typeof HtmlService === "undefined") {
    return webApiError("service_unavailable", "文件服務目前無法使用");
  }

  const base = String(entry.file || "");
  const candidates = [base];
  if (base.indexOf("/") !== -1) {
    candidates.push(base.replace(/\//g, "-"));
    candidates.push(base.replace(/\//g, "_"));
    candidates.push(base.replace(/\//g, "."));
    candidates.push(base.split("/").pop());
  }

  for (let i = 0; i < candidates.length; i++) {
    const file = candidates[i];
    if (!file) continue;
    try {
      if (typeof HtmlService.createHtmlOutputFromFile === "function") {
        return HtmlService.createHtmlOutputFromFile(file)
          .setTitle(entry.title || "文件")
          .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
      }
    } catch (error) {
      console.error(
        "createWebAppDocResponse createHtmlOutputFromFile failed: " +
          file +
          " / " +
          (error && error.message ? error.message : error)
      );
    }
  }

  return createWebAppDocNotFoundOutput();
}

/**
 * Google Apps Script Web App HTTP GET 請求主進入點。
 * 負責派發白名單 GET Action（如 ping、getPublicConfig）、文件路由（?page=docs/...）或主頁面渲染。
 *
 * @param {Object} e - HTTP GET 事件物件
 * @param {Object} [e.parameter] - 查詢參數字典
 * @returns {GoogleAppsScript.HTML.HtmlOutput|GoogleAppsScript.Content.TextOutput} HTML 或 JSON 回應
 */
function doGet(e) {
  const parameter = e && e.parameter ? e.parameter : {};
  const action = String(parameter.action || "").trim();
  if (action !== "") {
    return handleDoGetActionRequest_(action, e);
  }

  // 處理 Web App 文件路由（白名單 docs/*.html）
  const docPage = String(parameter[WEB_APP_DOC_ROUTE_PARAM] || "").trim();
  if (docPage !== "") {
    return createWebAppDocResponse(docPage);
  }

  const initialAuthResult = resolveDoGetInitialAuth_(parameter, e);
  const htmlOutput = renderDoGetHtml_(initialAuthResult, parameter);
  return htmlOutput || buildDoGetFallbackResponse_();
}

/**
 * Google Apps Script Web App HTTP POST 請求主進入點。
 * 接收 text/plain;charset=utf-8 傳入之 JSON 字串，統一交由 executeWebApi 執行。
 *
 * @param {Object} e - HTTP POST 事件物件
 * @param {Object} [e.postData] - POST 請求內容
 * @param {string} [e.postData.contents] - 原始字串內容
 * @returns {GoogleAppsScript.Content.TextOutput} JSON 文字輸出回應
 */
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
    WEB_APP_DOC_ROUTE_PARAM: WEB_APP_DOC_ROUTE_PARAM,
    WEB_APP_DOC_ROUTES: WEB_APP_DOC_ROUTES,
    resolveWebAppDocRoute: resolveWebAppDocRoute,
    createWebAppDocNotFoundOutput: createWebAppDocNotFoundOutput,
    createWebAppDocResponse: createWebAppDocResponse,
    doGet: doGet,
    doPost: doPost
  };
}
