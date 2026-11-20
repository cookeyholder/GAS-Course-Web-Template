"use strict";

/**
 * @file activityLogInterceptor.js
 * @description 操作日誌攔截器模組（task 4.2）
 *
 * 承擔原 webApi.js 的 log context 建立、身分補寫、詳情捕獲、紀錄建構與
 * 最終寫入（含解鎖）。所有對外相依皆由 createActivityLogInterceptor 注入，
 * 使本模組對 GAS 全域命名空間與 webApi 的解析邏輯無依賴，可單獨測試。
 *
 * 對外暴露 createContext 與 finalize；另暴露 recordIdentity／buildRecord 等
 * 供 webApi.js 保留 facade 匯出與測試注入接縫。
 *
 * GAS 環境下掛載為全域 `activityLogInterceptor`，Node.js 下由 module.exports 匯出。
 */

/**
 * gasRuntime 常數單一來源（task 5.2）：僅讀取 GAS 全域，不 require，
 * 以維持本模組可在無 gasRuntime 的隔離環境載入（task 4.4 部署相容）。
 */
const GAS_RUNTIME = typeof globalThis !== "undefined" ? globalThis.gasRuntime : null;

/** 詳情序列化失敗或降級模組不可用時的最小合法 JSON（GAS 由 gasRuntime 單一來源取得） */
const MINIMAL_ACTIVITY_DETAIL_JSON =
  (GAS_RUNTIME && GAS_RUNTIME.MINIMAL_ACTIVITY_DETAIL_JSON) || '{"版本":1,"動作":"","指標":{},"截斷":true}';

/** 詳情欄位字元上限（GAS 由 gasRuntime 單一來源取得） */
const ACTIVITY_DETAIL_MAX_LENGTH = (GAS_RUNTIME && GAS_RUNTIME.ACTIVITY_DETAIL_MAX_LENGTH) || 500;

/**
 * 建立攔截器實例。
 *
 * @param {Object} deps - 對外相依（皆為函式或常數，由 webApi.js 注入）
 * @param {Function} deps.generateSessionToken - 產生請求識別碼
 * @param {Function} deps.resolveRoleDisplayName - 角色代碼轉顯示名稱（含 try/catch）
 * @param {Function} deps.getActionMeta - 取得動作日誌中繼資料
 * @param {Array<string>} deps.excludedActions - 不寫日誌的動作清單
 * @param {Function} deps.resolveBuilders - 解析詳情產生器模組
 * @param {Function} deps.resolveSnapshotProvider - 解析寫入前快照提供者
 * @param {Function} deps.getSpreadsheet - 取得試算表
 * @param {Function} deps.resolveAppendActivityLog - 解析日誌寫入函式
 * @param {Function} deps.logError - 記錄錯誤（不影響 API 回應）
 * @returns {Object} 攔截器 API
 */
function createActivityLogInterceptor(deps) {
  const config = deps || {};
  const generateSessionToken = config.generateSessionToken;
  const resolveRoleDisplayName = config.resolveRoleDisplayName;
  const getActionMeta = config.getActionMeta;
  const excludedActions = Array.isArray(config.excludedActions) ? config.excludedActions : [];
  const resolveBuilders = config.resolveBuilders;
  const resolveSnapshotProvider = config.resolveSnapshotProvider;
  const getSpreadsheet = config.getSpreadsheet;
  const resolveAppendActivityLog = config.resolveAppendActivityLog;
  const logError = config.logError;

  /**
   * 建立請求層級的日誌 context。
   * 身分欄位一開始保持空白，待授權結果或登入結果回傳後再補寫。
   *
   * @param {string} [action] - 動作名稱
   * @param {number} [startTime] - 起始時間（毫秒）
   * @returns {Object} 日誌 context
   */
  function createContext(action, startTime) {
    return {
      requestId: "req_" + generateSessionToken(),
      action: String(action || ""),
      startTime: typeof startTime === "number" ? startTime : Date.now(),
      email: "",
      name: "",
      role: "",
      errorCode: ""
    };
  }

  /**
   * 依授權結果或公開登入結果補寫日誌 context 的已驗證身分。
   * 角色顯示名稱一律由注入的解析器取得，不得讀取可能遭竄改的 session.roleName。
   *
   * @param {Object} context - 日誌 context
   * @param {Object} [authorization] - 授權結果
   * @param {Object} [result] - action 回傳結果
   * @returns {Object} 同一個 context
   */
  function recordIdentity(context, authorization, result) {
    if (!context) return context;
    if (authorization && authorization.ok && authorization.session) {
      const session = authorization.session;
      context.email = session.email || "";
      context.name = session.name || "";
      context.role = resolveRoleDisplayName(session.role);
    }
    if (result && result.ok && (result.email || result.role)) {
      context.email = result.email || context.email;
      context.name = result.name || context.name;
      context.role = resolveRoleDisplayName(result.role) || context.role;
    }
    return context;
  }

  /**
   * 取得動作的日誌中繼資料；未登錄動作（例如解析失敗）使用預設值以確保仍寫入日誌。
   *
   * @param {string} action - 動作名稱
   * @returns {Object} 日誌中繼資料
   */
  function getMeta(action) {
    return (
      getActionMeta(action) || {
        category: "query",
        label: action || "未識別動作",
        detailKey: "none",
        enabled: true
      }
    );
  }

  /**
   * 判斷動作是否應寫入日誌。
   *
   * @param {string} action - 動作名稱
   * @param {Object} meta - 日誌中繼資料
   * @returns {boolean} 是否寫入
   */
  function shouldLog(action, meta) {
    return excludedActions.indexOf(action) === -1 && meta.enabled !== false;
  }

  /**
   * 捕獲寫入前快照；詳情產生器不可用時回傳 null，不中斷請求。
   *
   * @param {Object} meta - 日誌中繼資料
   * @returns {*} 變動前快照或 null
   */
  function captureSnapshot(meta) {
    const builders = resolveBuilders();
    if (!builders || typeof builders.captureBefore !== "function") return null;
    try {
      // 由呼叫端傳入已解析的快照提供者，使 activityLogBuilders 無須自行解析
      // databaseInitializer／gasRuntime，維持單向相依並保留測試注入接縫。
      const snapshotProvider = resolveSnapshotProvider();
      return builders.captureBefore(meta.detailKey, getSpreadsheet(), snapshotProvider);
    } catch (error) {
      return null;
    }
  }

  /**
   * 產生操作日誌摘要（不含敏感內容與原始回傳值）。
   *
   * @param {Object} context - 日誌 context
   * @param {Object} meta - 動作日誌中繼資料
   * @param {Object} result - action 回傳結果
   * @returns {string} 摘要文字
   */
  function buildSummary(context, meta, result) {
    const label = meta.label || context.action || "未識別動作";
    if (result && result.ok === false) {
      return label + "失敗：" + (result.error || "未知錯誤");
    }
    return label + "成功";
  }

  /**
   * 序列化詳情並在必要時呼叫共用降級函式，保證寫入的 JSON 可解析且長度合規。
   *
   * @param {Object} detail - 版本化詳情物件
   * @param {Object|null} builders - 詳情模組 API
   * @returns {string} 合格的詳情 JSON 字串
   */
  function serializeDetail(detail, builders) {
    let text;
    try {
      text = JSON.stringify(detail);
    } catch (error) {
      return MINIMAL_ACTIVITY_DETAIL_JSON;
    }
    if (builders && typeof builders.truncateDetailToLimit === "function") {
      return builders.truncateDetailToLimit(text, ACTIVITY_DETAIL_MAX_LENGTH);
    }
    return text.length <= ACTIVITY_DETAIL_MAX_LENGTH ? text : MINIMAL_ACTIVITY_DETAIL_JSON;
  }

  /**
   * 建立最小可用的版本化詳情結構。
   *
   * @param {string} action - action 名稱
   * @returns {Object} 最小詳情物件
   */
  function createMinimalDetail_(action) {
    return { 版本: 1, 動作: action, 指標: {}, 變動: [] };
  }

  /**
   * 正規化失敗請求的詳情：保留統計指標、清空變動並標記未執行。
   * 失敗請求（例如 CSRF 驗證失敗）未實際執行寫入，不得留下基於 payload 推導的誤導變動；
   * importCourseCodes 的統計標記（指標）仍須保留，以利稽核失敗原因。
   *
   * @param {*} detail - 詳情產生器回傳值
   * @param {string} action - action 名稱
   * @returns {Object} 正規化後的詳情物件
   */
  function normalizeFailureDetail_(detail, action) {
    let normalized = detail;
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      normalized = createMinimalDetail_(action);
    }
    if (!normalized.指標 || typeof normalized.指標 !== "object" || Array.isArray(normalized.指標)) {
      normalized.指標 = {};
    }
    normalized.變動 = [];
    normalized.指標.執行 = "未執行";
    return normalized;
  }

  /**
   * 以 Asia/Taipei 時區產生 `yyyy-MM-dd HH:mm:ss` 時間戳記。
   * GAS 使用 Utilities，Node 測試採固定 +8 偏移，不依賴機器時區。
   *
   * @param {Date} now - 時間點
   * @returns {string} 格式化後的時間戳記
   */
  function formatActivityLogTimestamp_(now) {
    if (typeof Utilities !== "undefined" && Utilities.formatDate) {
      return Utilities.formatDate(now, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss");
    }
    return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().replace("T", " ").slice(0, 19);
  }

  /**
   * 建立操作日誌寫入紀錄。
   *
   * @param {Object} context - 日誌 context
   * @param {Object} meta - 動作日誌中繼資料
   * @param {Object} payload - 請求 payload（僅供詳情產生器取白名單欄位）
   * @param {Object} result - action 回傳結果
   * @param {*} [before] - 變動前快照
   * @returns {Object} 12 欄日誌紀錄
   */
  function buildRecord(context, meta, payload, result, before) {
    const builders = resolveBuilders();
    let detail = createMinimalDetail_(context.action);
    if (builders && typeof builders.describe === "function") {
      try {
        // 產生器自行以欄位級白名單挑選可記錄欄位；此處必須傳入原始 payload，
        // 否則 settings／accounts 會被通用投影折疊而丟失變動明細。
        detail = builders.describe(meta.detailKey, before, payload || {}, result || {});
      } catch (error) {
        // 詳情產生失敗時保留最小可用的版本化結構
      }
    }
    if (result && result.ok === false) {
      detail = normalizeFailureDetail_(detail, context.action);
    }
    return {
      timestamp: formatActivityLogTimestamp_(new Date()),
      requestId: context.requestId,
      category: meta.category,
      action: meta.label || context.action || "未識別動作",
      result: result && result.ok === true ? "success" : "failure",
      email: context.email,
      name: context.name,
      role: context.role,
      summary: buildSummary(context, meta, result),
      detail: serializeDetail(detail, builders),
      durationMs: Date.now() - context.startTime,
      errorCode: context.errorCode || ""
    };
  }

  /**
   * 於 executeWebApi 的 finally 統一寫入操作日誌。
   * 鎖已由 webApi.js 的 withScriptLock_ 在前一步釋放，日誌寫入失敗不得影響 API 回應。
   *
   * @param {Object} context - 日誌 context
   * @param {Object|null} actionMeta - 日誌中繼資料
   * @param {Object|string} payload - 原始請求資料
   * @param {Object|null} finalResult - 最終 API 回應
   * @param {Object|null} beforeSnapshot - 寫入前快照
   */
  function finalize(context, actionMeta, payload, finalResult, beforeSnapshot) {
    // 解析失敗或缺少 action 時仍須寫入，故補上預設中繼資料。
    const meta = actionMeta || getMeta(context.action);
    if (!shouldLog(context.action, meta)) return;
    const appendFn = resolveAppendActivityLog();
    if (typeof appendFn !== "function") return;
    try {
      appendFn(buildRecord(context, meta, payload, finalResult, beforeSnapshot), getSpreadsheet());
    } catch (error) {
      logError("寫入操作日誌失敗：", error && error.message ? error.message : error);
    }
  }

  return {
    createContext: createContext,
    finalize: finalize,
    recordIdentity: recordIdentity,
    getMeta: getMeta,
    shouldLog: shouldLog,
    captureSnapshot: captureSnapshot,
    buildRecord: buildRecord
  };
}

const ACTIVITY_LOG_INTERCEPTOR_API = {
  createActivityLogInterceptor: createActivityLogInterceptor,
  MINIMAL_ACTIVITY_DETAIL_JSON: MINIMAL_ACTIVITY_DETAIL_JSON,
  ACTIVITY_DETAIL_MAX_LENGTH: ACTIVITY_DETAIL_MAX_LENGTH
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ACTIVITY_LOG_INTERCEPTOR_API;
}
if (typeof globalThis !== "undefined") {
  globalThis.activityLogInterceptor = ACTIVITY_LOG_INTERCEPTOR_API;
  globalThis.MEA = globalThis.MEA || {};
  globalThis.MEA.activityLogInterceptor = ACTIVITY_LOG_INTERCEPTOR_API;
}
