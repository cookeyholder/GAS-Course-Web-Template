"use strict";

/**
 * @file activityLogBuilders.js
 * @description 操作日誌詳情產生器，依 logDetailKey 分派彙總指標與變動明細。
 *
 * 詳情採版本化結構；各產生器自行以欄位級白名單挑選可記錄欄位，
 * 不得寫入 token、原始上傳列或查詢回傳內容。
 */

/** 詳情格式版本，日後欄位增減時可由此判讀舊資料 */
const ACTIVITY_DETAIL_VERSION = 1;

/** 可安全寫入日誌的請求欄位白名單 */
const SAFE_PAYLOAD_KEYS = [
  "action",
  "page",
  "pageSize",
  "sortBy",
  "sortDir",
  "startDate",
  "endDate",
  "email",
  "name",
  "role",
  "category",
  "idempotent",
  "useActiveUser"
];

/** 系統設定中不得寫入日誌的敏感欄位 */
const SENSITIVE_SETTING_KEYS = ["clientSecret", "OAuth Client Secret", "token", "csrfToken"];

/** 系統設定欄位代碼與中文標籤對照 */
const SYSTEM_SETTING_LABELS = {
  schoolYear: "學年度",
  semester: "學期",
  systemName: "系統名稱",
  clientId: "OAuth Client ID",
  restrictWhitelist: "登入白名單限制啟用",
  allowedLoginDomain: "Google 登入允許網域",
  學年度: "學年度",
  學期: "學期",
  系統名稱: "系統名稱",
  "OAuth Client ID": "OAuth Client ID",
  登入白名單限制啟用: "登入白名單限制啟用",
  "Google 登入允許網域": "Google 登入允許網域"
};

/**
 * 僅保留白名單欄位，並將物件／陣列折疊為摘要描述，避免原始內容外洩。
 *
 * @param {Object} payload - 原始請求 payload
 * @returns {Object} 安全投影
 */
function projectPayload_(payload) {
  const source = payload || {};
  const projected = {};
  SAFE_PAYLOAD_KEYS.forEach(function (key) {
    if (source[key] === undefined) return;
    const value = source[key];
    if (value === null || typeof value !== "object") {
      projected[key] = value;
    } else if (Array.isArray(value)) {
      projected[key] = "[陣列，共 " + value.length + " 項]";
    } else {
      projected[key] = "[物件]";
    }
  });
  return projected;
}

/**
 * 從結果取出筆數，避免把整份回傳內容寫入日誌。
 *
 * @param {Object} result - handler 回傳結果
 * @returns {number|null} 筆數或 null
 */
function countFromResult_(result) {
  if (!result || typeof result !== "object") return null;
  if (typeof result.rows === "number") return result.rows;
  if (Array.isArray(result.rows)) return result.rows.length;
  if (Array.isArray(result.accounts)) return result.accounts.length;
  if (typeof result.count === "number") return result.count;
  if (typeof result.total === "number") return result.total;
  return null;
}

/**
 * 解析 databaseInitializer 的函式（GAS 全域優先，Node 再 require）。
 *
 * @param {string} name - 函式名稱
 * @returns {Function|null} 解析後的函式
 */
function resolveDbFn_(name) {
  if (typeof globalThis !== "undefined" && typeof globalThis[name] === "function") return globalThis[name];
  if (typeof require === "function") {
    try {
      const db = require("./databaseInitializer.js");
      return typeof db[name] === "function" ? db[name] : null;
    } catch (error) {
      return null;
    }
  }
  return null;
}

/** 各 logDetailKey 的詳情產生器 */
const DETAIL_BUILDERS = {
  none: {
    captureBefore: null,
    describe: function () {
      return { 指標: {} };
    }
  },
  auth: {
    captureBefore: null,
    describe: function (before, after, payload) {
      const safe = projectPayload_(payload);
      const useActiveUser = safe.useActiveUser === true || safe.action === "loginWithActiveUser";
      return {
        指標: {
          登入方式: useActiveUser ? "使用現存帳號" : "一般登入"
        }
      };
    }
  },
  importCourseCodes: {
    captureBefore: null,
    describe: function (before, after, payload, result) {
      const stats = result && typeof result.stats === "object" ? result.stats : null;
      if (!stats) {
        return {
          指標: {
            結果: result && result.idempotent === true ? "冪等命中" : "統計不適用"
          }
        };
      }
      const expandedRows = result && typeof result.rows === "number" ? result.rows : stats.expandedRows;
      return {
        指標: {
          上傳筆數: numberOrNull_(stats.sourceRows),
          排除筆數: numberOrNull_(stats.excludedRows),
          保留筆數: numberOrNull_(stats.keptCourseRows),
          展開筆數: numberOrNull_(expandedRows),
          回傳筆數: numberOrNull_(stats.returnedRows),
          結果: result && result.idempotent === true ? "冪等命中" : "全新匯入"
        }
      };
    }
  },
  query: {
    captureBefore: null,
    describe: function (before, after, payload, result) {
      const safe = projectPayload_(payload);
      return {
        指標: {
          頁碼: numberOrNull_(safe.page),
          每頁筆數: numberOrNull_(safe.pageSize),
          回傳筆數: countFromResult_(result),
          篩選: safe.category || safe.email || null
        }
      };
    }
  },
  systemSettings: {
    captureBefore: function (ss) {
      const read = resolveDbFn_("readSystemSettings");
      if (!read) return null;
      try {
        const settings = read(ss) || {};
        const snapshot = {};
        Object.keys(SYSTEM_SETTING_LABELS).forEach(function (key) {
          if (settings[key] !== undefined) snapshot[key] = settings[key];
        });
        return snapshot;
      } catch (error) {
        return null;
      }
    },
    describe: function (before, after, payload) {
      const incoming = (payload && payload.settings) || {};
      const changes = [];
      Object.keys(SYSTEM_SETTING_LABELS).forEach(function (key) {
        if (SENSITIVE_SETTING_KEYS.indexOf(key) !== -1) return;
        if (incoming[key] === undefined) return;
        const label = SYSTEM_SETTING_LABELS[key];
        const previous = before && before[key] !== undefined ? before[key] : "";
        if (String(previous) === String(incoming[key])) return;
        changes.push({ 欄位: label, 前: String(previous), 後: String(incoming[key]) });
      });
      return { 指標: { 變動欄數: changes.length }, 變動: changes };
    }
  },
  whitelist: {
    captureBefore: function (ss) {
      const read = resolveDbFn_("readWhitelist");
      if (!read) return null;
      try {
        return read(ss) || [];
      } catch (error) {
        return null;
      }
    },
    describe: function (before, after, payload, result) {
      // accounts 非陣列屬無效請求，不得解讀為「清空名單」而產生移除變動
      if (!Array.isArray(payload && payload.accounts)) {
        return {
          指標: {
            原有人數: Array.isArray(before) ? before.length : 0,
            現有人數: 0,
            寫入筆數: null
          },
          變動: []
        };
      }
      const incoming = payload.accounts;
      const previous = Array.isArray(before) ? before : [];
      const previousEmails = previous.map(function (item) {
        return item && item.email ? String(item.email).toLowerCase() : "";
      });
      const nextEmails = incoming.map(function (item) {
        return item && item.email ? String(item.email).toLowerCase() : "";
      });
      const added = nextEmails.filter(function (email) {
        return email && previousEmails.indexOf(email) === -1;
      });
      const removed = previousEmails.filter(function (email) {
        return email && nextEmails.indexOf(email) === -1;
      });
      const changes = [];
      added.forEach(function (email) {
        changes.push({ 欄位: "新增成員", 前: "", 後: email });
      });
      removed.forEach(function (email) {
        changes.push({ 欄位: "移除成員", 前: email, 後: "" });
      });
      return {
        指標: {
          原有人數: previous.length,
          現有人數: nextEmails.length,
          寫入筆數: result && typeof result.count === "number" ? result.count : null
        },
        變動: changes
      };
    }
  }
};

/**
 * 數值正規化：僅接受有限數字，其餘回傳 null。
 *
 * @param {*} value - 待檢查值
 * @returns {number|null} 數值或 null
 */
function numberOrNull_(value) {
  return typeof value === "number" && isFinite(value) ? value : null;
}

/**
 * 取得指定 logDetailKey 的產生器。
 *
 * @param {string} detailKey - 詳情鍵
 * @returns {Object} 產生器（未知鍵回退為 none）
 */
function getBuilder(detailKey) {
  return DETAIL_BUILDERS[detailKey] || DETAIL_BUILDERS.none;
}

/**
 * 於 handler 執行前擷取變動前快照。
 *
 * @param {string} detailKey - 詳情鍵
 * @param {*} ss - 試算表物件
 * @returns {*} 快照或 null
 */
function captureBefore(detailKey, ss) {
  const builder = getBuilder(detailKey);
  if (typeof builder.captureBefore !== "function") return null;
  try {
    return builder.captureBefore(ss);
  } catch (error) {
    return null;
  }
}

/**
 * 於 handler 執行後產生版本化詳情。
 *
 * @param {string} detailKey - 詳情鍵
 * @param {*} before - 變動前快照
 * @param {*} after - 變動後快照（目前保留參數以供未來擴充）
 * @param {Object} payload - 原始請求 payload（由各產生器自行過濾敏感欄位）
 * @param {Object} result - handler 回傳結果
 * @returns {Object} 版本化詳情物件
 */
function describe(detailKey, before, after, payload, result) {
  const builder = getBuilder(detailKey);
  const detail = builder.describe(before, after, payload, result) || {};
  return {
    版本: ACTIVITY_DETAIL_VERSION,
    動作: (payload && payload.action) || detailKey,
    指標: detail.指標 || {},
    變動: detail.變動 || []
  };
}

/** 詳情序列化後的字元上限 */
const ACTIVITY_DETAIL_MAX_LENGTH = 500;

/** 降級失敗時使用的最小合法 JSON */
const MINIMAL_ACTIVITY_DETAIL_JSON = '{"版本":1,"動作":"","指標":{},"截斷":true}';

/**
 * 將詳情序列化結果修剪至上限內，採逐級降級且每級重新序列化驗證，
 * 保證回傳值皆為可解析且長度合規的 JSON。
 *
 * @param {string} serialized - 已序列化的詳情 JSON 字串
 * @param {number} [maxLength] - 字元上限，預設 500
 * @returns {string} 長度合規且可解析的詳情 JSON 字串
 */
function truncateDetailToLimit(serialized, maxLength) {
  const limit = typeof maxLength === "number" && maxLength > 0 ? maxLength : ACTIVITY_DETAIL_MAX_LENGTH;
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch (error) {
    return MINIMAL_ACTIVITY_DETAIL_JSON;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return MINIMAL_ACTIVITY_DETAIL_JSON;
  }
  const original = JSON.stringify(parsed);
  if (original.length <= limit) return original;

  // 第一級：捨棄變動，保留版本／動作／指標並標註截斷
  const level1 = {
    版本: parsed.版本,
    動作: parsed.動作,
    指標: parsed.指標 && typeof parsed.指標 === "object" && !Array.isArray(parsed.指標) ? parsed.指標 : {},
    截斷: true
  };
  const text1 = JSON.stringify(level1);
  if (text1.length <= limit) return text1;

  // 第二級：僅保留數字型指標；字串型指標（可能來自超長 email／category）改為「已省略」
  const compactMetrics = {};
  Object.keys(level1.指標).forEach(function (key) {
    const value = level1.指標[key];
    compactMetrics[key] = typeof value === "number" && isFinite(value) ? value : "已省略";
  });
  const level2 = { 版本: level1.版本, 動作: level1.動作, 指標: compactMetrics, 截斷: true };
  const text2 = JSON.stringify(level2);
  if (text2.length <= limit) return text2;

  // 第三級：只保留版本／動作（必要時截短）／截斷
  const action = String(level2.動作 === undefined || level2.動作 === null ? "" : level2.動作);
  const level3 = { 版本: level2.版本, 動作: action, 截斷: true };
  const text3 = JSON.stringify(level3);
  if (text3.length <= limit) return text3;
  const overhead = text3.length - action.length;
  const allowed = Math.max(0, limit - overhead);
  level3.動作 = action.slice(0, allowed);
  const text3b = JSON.stringify(level3);
  if (text3b.length <= limit) return text3b;

  return MINIMAL_ACTIVITY_DETAIL_JSON;
}

const ACTIVITY_LOG_BUILDERS_API = {
  ACTIVITY_DETAIL_VERSION: ACTIVITY_DETAIL_VERSION,
  ACTIVITY_DETAIL_MAX_LENGTH: ACTIVITY_DETAIL_MAX_LENGTH,
  MINIMAL_ACTIVITY_DETAIL_JSON: MINIMAL_ACTIVITY_DETAIL_JSON,
  SAFE_PAYLOAD_KEYS: SAFE_PAYLOAD_KEYS,
  projectPayload: projectPayload_,
  getBuilder: getBuilder,
  captureBefore: captureBefore,
  describe: describe,
  truncateDetailToLimit: truncateDetailToLimit
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = ACTIVITY_LOG_BUILDERS_API;
}
if (typeof globalThis !== "undefined") {
  globalThis.activityLogBuilders = ACTIVITY_LOG_BUILDERS_API;
  globalThis.MEA = globalThis.MEA || {};
  globalThis.MEA.activityLogBuilders = ACTIVITY_LOG_BUILDERS_API;
}
