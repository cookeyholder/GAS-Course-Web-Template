/**
 * @file webApi.js
 * @description Google Apps Script 網頁版 API 路由總管
 *
 * 架構規範：
 * - 前端以 `POST` + `Content-Type: text/plain;charset=utf-8` 發送 JSON，
 *   避免瀏覽器對 GAS 發出不支援的 `OPTIONS` CORS 預檢請求。
 * - 所有請求統一套用 `{ action, token?, ...payload }` 信封格式。
 * - 所有回應統一套用 `{ ok: true, ... }` 或 `{ ok: false, error, message }`。
 * - 寫入型 action 一律以 `LockService` 排隊，避免多人同時覆寫工作表。
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

const WEB_API_VERSION = "1.0.0";
const WEB_API_SESSION_TTL_SECONDS = 21600; // 6 小時
const WEB_API_LOCK_TIMEOUT_MS = 15000;

/** 免登入即可呼叫的公開 action */
const WEB_API_PUBLIC_ACTIONS = ["getPublicConfig", "ping", "login"];

/** 寫入型 action（需 LockService 保護） */
const WEB_API_WRITE_ACTIONS = [
  "importCourseCodes",
  "saveSystemSettings",
  "saveWhitelist"
];

const WEB_API_LOCKED_ACTIONS = WEB_API_WRITE_ACTIONS.concat(["login"]);

const GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const WEB_API_SESSION_PREFIX = "gas_tmpl_session_";

/** 角色權限矩陣（RBAC） */
const ROLE_PERMISSIONS = {
  admin: ["*"],
  staff: [
    "read",
    "importCourseCodes",
    "getCourseIndex",
    "getSystemSettings"
  ],
  viewer: [
    "read",
    "getCourseIndex"
  ]
};

/** Node.js 沙盒測試用之記憶體 Session 儲存 */
const WEB_API_MEMORY_SESSIONS = {};

// ============================================================================
// 回應與請求解析輔助函式
// ============================================================================

function jsonResponse(data) {
  if (typeof ContentService !== "undefined" && ContentService.createTextOutput) {
    return ContentService.createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
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
// 權限與 Session 驗證
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
    get: function (k) { return WEB_API_MEMORY_SESSIONS[k] || null; },
    put: function (k, v, ttl) { WEB_API_MEMORY_SESSIONS[k] = v; },
    remove: function (k) { delete WEB_API_MEMORY_SESSIONS[k]; }
  };
}

function generateSessionToken() {
  const rand1 = Math.random().toString(36).substring(2);
  const rand2 = Math.random().toString(36).substring(2);
  const time = Date.now().toString(36);
  return "gas_" + time + "_" + rand1 + rand2;
}

function createSessionForEmail(email, name, options) {
  options = options || {};
  const ss = options.spreadsheet || (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet ? SpreadsheetApp.getActiveSpreadsheet() : null);

  const bootstrapped = bootstrapAdminIfNeeded(email, name, ss);
  const account = getAccountRole(email, ss);
  const settings = readSystemSettings(ss);

  if (settings.restrictWhitelist && !account.found) {
    return webApiError("not_whitelisted", "您的帳號（" + email + "）尚未加入系統授權名單，請洽系統管理員開通權限");
  }

  if (account.found && account.enabled === false) {
    return webApiError("account_disabled", "您的帳號（" + email + "）目前處於停用狀態，請洽系統管理員");
  }

  const role = account.role;
  const token = generateSessionToken();
  const session = {
    token: token,
    email: email,
    name: account.name || name || email,
    role: role,
    perms: ROLE_PERMISSIONS[role] || [],
    createdAt: Date.now()
  };

  const cache = getCacheStore();
  cache.put(WEB_API_SESSION_PREFIX + token, JSON.stringify(session), WEB_API_SESSION_TTL_SECONDS);

  return {
    ok: true,
    token: token,
    expiresIn: WEB_API_SESSION_TTL_SECONDS,
    email: session.email,
    name: session.name,
    role: session.role,
    roleName: getRoleDisplayName(session.role),
    perms: session.perms,
    bootstrapped: bootstrapped
  };
}

function verifyGoogleIdToken(idToken, expectedClientId) {
  if (!idToken || typeof idToken !== "string") {
    return webApiError("missing_id_token", "缺少 Google ID Token");
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

    if (expectedClientId && info.aud && info.aud !== expectedClientId) {
      return webApiError("client_id_mismatch", "OAuth Client ID 不符");
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
  const ss = options.spreadsheet || (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet ? SpreadsheetApp.getActiveSpreadsheet() : null);
  const settings = readSystemSettings(ss);
  const expectedClientId = options.clientId || settings.clientId || "";

  const verify = verifyGoogleIdToken(idToken, expectedClientId);
  if (!verify.ok) return verify;

  return createSessionForEmail(verify.email, verify.name, { spreadsheet: ss });
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
    perms: result.session.perms
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
    return webApiError(
      "forbidden",
      "目前角色（" + sessionResult.session.role + "）無權限執行：" + action
    );
  }

  return { ok: true, session: sessionResult.session };
}

// ============================================================================
// Action 路由派發
// ============================================================================

function getPublicConfig() {
  const ss = typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet ? SpreadsheetApp.getActiveSpreadsheet() : null;
  const settings = readSystemSettings(ss);

  let webAppUrl = "";
  try {
    if (typeof ScriptApp !== "undefined" && ScriptApp.getService) {
      webAppUrl = ScriptApp.getService().getUrl() || "";
    }
  } catch (e) {
    webAppUrl = "";
  }

  return {
    ok: true,
    version: WEB_API_VERSION,
    systemName: settings.systemName || "Google Apps Script 應用程式範本",
    schoolYear: settings.schoolYear || "114",
    semester: settings.semester || "1",
    clientId: settings.clientId || "",
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
      if (payload && payload.mock) {
        return createSessionForEmail("mock-admin@example.com", "測試管理員");
      }
      return loginWithGoogleIdToken(payload ? (payload.idToken || payload.credential) : "", {
        clientId: payload ? payload.clientId : ""
      });
  }

  // 需登入驗證
  const authorization = authorizeWebApiAction(name, payload || {});
  if (!authorization.ok) return authorization;

  const session = authorization.session;
  const ss = typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet ? SpreadsheetApp.getActiveSpreadsheet() : null;

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

function doGet(e) {
  const parameter = e && e.parameter ? e.parameter : {};
  const action = String(parameter.action || "").trim();

  // 若帶有 ?action= 則以 JSON 回應（供唯讀或偵錯）
  if (action !== "") {
    if (WEB_API_WRITE_ACTIONS.indexOf(action) !== -1 || action === "login" || action === "logout") {
      return jsonResponse(webApiError("method_not_allowed", "此操作涉及資料寫入或身分憑證，必須使用 POST 方法發送"));
    }
    try {
      const payload = parseWebApiPayload(e);
      return jsonResponse(routeWebApiAction(action, payload, e));
    } catch (error) {
      return jsonResponse(webApiError("server_error", String(error && error.message ? error.message : error)));
    }
  }

  // 渲染 Web App HTML
  if (typeof HtmlService !== "undefined" && HtmlService.createTemplateFromFile) {
    try {
      const template = HtmlService.createTemplateFromFile("index");
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
  let lock = null;
  let hasLock = false;

  try {
    const payload = parseWebApiPayload(e);
    if (payload === null) {
      return jsonResponse(webApiError("invalid_json", "請求 JSON 格式錯誤"));
    }

    const action = String(payload.action || (e && e.parameter && e.parameter.action) || "").trim();
    if (action === "") {
      return jsonResponse(webApiError("missing_action", "缺少 action 參數"));
    }

    const needsLock = WEB_API_LOCKED_ACTIONS.indexOf(action) !== -1;
    if (needsLock && typeof LockService !== "undefined" && LockService.getScriptLock) {
      lock = LockService.getScriptLock();
      try {
        hasLock = lock.tryLock(WEB_API_LOCK_TIMEOUT_MS);
      } catch (lockError) {
        hasLock = false;
      }
      if (!hasLock) {
        return jsonResponse(webApiError("lock_timeout", "系統繁忙中，請稍候片刻再試"));
      }
    }

    const result = routeWebApiAction(action, payload, e);
    return jsonResponse(result);
  } catch (error) {
    console.error("[webApi doPost error] " + (error && error.stack ? error.stack : error));
    return jsonResponse(webApiError("server_error", String(error && error.message ? error.message : error)));
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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    WEB_API_VERSION: WEB_API_VERSION,
    WEB_API_PUBLIC_ACTIONS: WEB_API_PUBLIC_ACTIONS,
    WEB_API_WRITE_ACTIONS: WEB_API_WRITE_ACTIONS,
    ROLE_PERMISSIONS: ROLE_PERMISSIONS,
    jsonResponse: jsonResponse,
    webApiSuccess: webApiSuccess,
    webApiError: webApiError,
    parseWebApiPayload: parseWebApiPayload,
    hasPermission: hasPermission,
    generateSessionToken: generateSessionToken,
    createSessionForEmail: createSessionForEmail,
    getSessionInfo: getSessionInfo,
    getSessionState: getSessionState,
    logoutSession: logoutSession,
    authorizeWebApiAction: authorizeWebApiAction,
    routeWebApiAction: routeWebApiAction,
    getPublicConfig: getPublicConfig,
    doGet: doGet,
    doPost: doPost
  };
}
