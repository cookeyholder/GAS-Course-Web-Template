"use strict";

/**
 * @file openccS2twpApprovals.js
 * @description 內容定址核准清冊之命令式外殼。序列化層將所有非 ASCII 字元
 *              逐 UTF-16 程式碼單元跳脫為 JSON 標準 `\uXXXX`，使清冊檔案
 *              保持純 ascii 且不命中硬閘門。授權判定一律轉呼叫語言分析核心
 *              的單一計算點，並於清冊版本不支援時 fail-closed。
 */

const fs = require("fs");
const path = require("path");
const stableId = require("../quality-core/openccStableId.js");
const analysis = require("../quality-core/openccLanguageAnalysis.js");

/** 核准清冊路徑 */
const APPROVALS_PATH = path.join(__dirname, "openccS2twpApprovals.json");

/** 唯一支援的清冊版本 */
const VERSION = 1;

/** 核准紀錄必要欄位（識別碼不包含 suggestion 與建議來源） */
const RECORD_FIELDS = Object.freeze([
  "file",
  "line",
  "column",
  "original",
  "suggestion",
  "suggestionSource",
  "contextHash",
  "occurrenceIndex",
  "approvedAt"
]);

/** 授權結果代碼（與語言分析核心共用） */
const RESULT = analysis.RESULT;

/** 不支援版本診斷代碼 */
const VERSION_UNSUPPORTED = "APPROVALS_VERSION_UNSUPPORTED";

/**
 * @description 建立空清冊。
 * @returns {{version: number, approvals: Object}} 空清冊
 */
function emptyRegistry() {
  return { version: VERSION, approvals: {} };
}

/**
 * @description 建立帶診斷代碼的清冊結果。
 * @param {number} version - 清冊版本
 * @param {Object} approvals - 核准對應
 * @param {string|null} diagnostic - 診斷代碼
 * @returns {{version: number, approvals: Object, diagnostic: string|null}} 清冊結果
 */
function withDiagnostic(version, approvals, diagnostic) {
  return { version: version, approvals: approvals, diagnostic: diagnostic };
}

/**
 * @description 將序列化結果字串中的所有非 ASCII 字元逐 UTF-16 程式碼單元跳脫。
 * @param {string} text - 已序列化字串
 * @returns {string} 純 ascii 字串
 */
function escapeNonAscii(text) {
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    result += code > 0x7f ? "\\u" + code.toString(16).padStart(4, "0") : text[index];
  }
  return result;
}

/**
 * @description 檢查字串是否全為 ascii 字元。
 * @param {string} text - 待檢查字串
 * @returns {boolean} 是否全為 ascii
 */
function isPureAscii(text) {
  return typeof text === "string" && /^[\x00-\x7f]*$/.test(text);
}

/**
 * @description 將核准紀錄濃縮為欄位固定、順序穩定之形式。
 * @param {Object} record - 核准紀錄
 * @returns {?Object} 正規化紀錄或 null
 */
function normalizeRecord(record) {
  if (!record || typeof record !== "object") return null;
  const normalized = {};
  RECORD_FIELDS.forEach(function (field) {
    normalized[field] = record[field];
  });
  normalized.file = String(normalized.file === undefined ? "" : normalized.file);
  normalized.original = String(normalized.original === undefined ? "" : normalized.original);
  normalized.suggestion = String(normalized.suggestion === undefined ? "" : normalized.suggestion);
  normalized.suggestionSource = String(normalized.suggestionSource === undefined ? "" : normalized.suggestionSource);
  normalized.contextHash = String(normalized.contextHash === undefined ? "" : normalized.contextHash);
  normalized.occurrenceIndex = Number(normalized.occurrenceIndex) || 0;
  normalized.line = Number(normalized.line) || 0;
  normalized.column = Number(normalized.column) || 0;
  normalized.approvedAt = String(normalized.approvedAt === undefined ? "" : normalized.approvedAt);
  return normalized;
}

/**
 * @description 複製並正規化核准索引，剔除格式無效或ID重新計算不符的紀錄。
 * @param {Object} approvals - ID 至紀錄之對應
 * @returns {Object} 正規化後對應
 */
function normalizeApprovals(approvals) {
  const result = {};
  if (!stableId.isPlainObject(approvals) || stableId.hasForbiddenKeys(approvals)) return result;
  Object.keys(approvals)
    .sort()
    .forEach(function (id) {
      const record = normalizeRecord(approvals[id]);
      if (!record) return;
      if (!stableId.isStableIdValid(id, record)) return;
      if (stableId.computeStableId(record) !== id) return;
      result[id] = record;
    });
  return result;
}

/**
 * @description 序列化清冊為純 ascii 字串，供唯一寫入點使用。
 * @param {{version: number, approvals: Object}} registry - 清冊
 * @returns {string} 純 ascii 序列化結果
 */
function serializeRegistry(registry) {
  const approvals = normalizeApprovals(registry && registry.approvals);
  return escapeNonAscii(JSON.stringify({ version: VERSION, approvals: approvals }, null, 2) + "\n");
}

/**
 * @description 僅呼叫一次 JSON.parse 解析清冊文字。
 * @param {string} text - 清冊文字
 * @returns {{ok: boolean, data: ?Object, reason: ?string}} 解析結果
 */
function parseRegistryText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return { ok: false, data: null, reason: "APPROVALS_PARSE_FAILED" };
  }
  return { ok: true, data: data, reason: null };
}

/**
 * @description 檢查清冊版本是否為唯一支援版本。
 * @param {*} version - 版本值
 * @returns {boolean} 是否支援
 */
function isSupportedVersion(version) {
  return typeof version === "number" && version === VERSION;
}

/**
 * @description 取得 approvals 物件的 fail-closed 診斷代碼。
 * @param {*} approvals - 核准對應
 * @returns {?string} 診斷代碼或 null
 */
function getApprovalsDiagnostic(approvals) {
  if (!stableId.isPlainObject(approvals)) return "APPROVALS_NOT_PLAIN_OBJECT";
  if (stableId.hasForbiddenKeys(approvals)) return "APPROVALS_PROTOTYPE_KEY";
  return null;
}

/**
 * @description 驗證序列化結果同時滿足純 ascii 與識別碼重新計算相符。
 * @param {string} text - 序列化清冊文字
 * @returns {{ok: boolean, registry: ?Object, reason: ?string}} 驗證結果
 */
function verifySerializedRegistry(text) {
  if (!isPureAscii(text)) return { ok: false, registry: null, reason: "NON_ASCII_SERIALIZATION" };
  const parsed = parseRegistryText(text);
  if (!parsed.ok) return { ok: false, registry: null, reason: parsed.reason };
  const data = parsed.data;
  if (!data || typeof data !== "object" || !isSupportedVersion(data.version)) {
    return { ok: false, registry: null, reason: VERSION_UNSUPPORTED };
  }
  const approvalDiagnostic = getApprovalsDiagnostic(data.approvals);
  if (approvalDiagnostic) return { ok: false, registry: null, reason: approvalDiagnostic };
  const ids = Object.keys(data.approvals);
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    if (!stableId.isStableIdValid(id, data.approvals[id]) || stableId.computeStableId(data.approvals[id]) !== id) {
      return { ok: false, registry: null, reason: "APPROVALS_ID_MISMATCH" };
    }
  }
  return { ok: true, registry: { version: VERSION, approvals: data.approvals }, reason: null };
}

/**
 * @description 讀取核准清冊；版本不支援或原型相關鍵時回傳 fail-closed 結果。
 * @param {string} [filePath] - 清冊路徑
 * @param {{readFile?: Function}} [options] - 選項
 * @returns {{version: number, approvals: Object, diagnostic: string|null}} 清冊結果
 */
function loadRegistry(filePath, options) {
  const settings = options || {};
  const reader =
    settings.readFile ||
    function (target) {
      return fs.readFileSync(target, "utf8");
    };
  let text;
  try {
    text = reader(filePath || APPROVALS_PATH);
  } catch (error) {
    return withDiagnostic(VERSION, {}, "APPROVALS_READ_FAILED");
  }
  const parsed = parseRegistryText(text);
  if (!parsed.ok) return withDiagnostic(VERSION, {}, parsed.reason);
  const data = parsed.data;
  if (!data || typeof data !== "object" || !isSupportedVersion(data.version)) {
    return withDiagnostic(data && data.version, {}, VERSION_UNSUPPORTED);
  }
  const approvalDiagnostic = getApprovalsDiagnostic(data.approvals);
  if (approvalDiagnostic) return withDiagnostic(VERSION, {}, approvalDiagnostic);
  return withDiagnostic(VERSION, data.approvals, null);
}

/**
 * @description 核准清冊唯一寫入點；寫入前通過純 ascii 與ID重新計算雙驗證。
 * @param {{version: number, approvals: Object}} registry - 清冊
 * @param {string} [filePath] - 清冊路徑
 * @param {{fs?: Object}} [options] - 可注入檔案系統以驗證寫入失敗路徑
 * @returns {number} 寫入位元組數
 * @throws {Error} 版本不支援或序列化驗證失敗時拋出
 */
function saveRegistry(registry, filePath, options) {
  const settings = options || {};
  const fsApi = settings.fs || fs;
  if (!isSupportedVersion(registry && registry.version)) {
    const error = new Error(VERSION_UNSUPPORTED);
    error.code = VERSION_UNSUPPORTED;
    throw error;
  }
  const content = serializeRegistry(registry);
  const verified = verifySerializedRegistry(content);
  if (!verified.ok) {
    const error = new Error(verified.reason);
    error.code = verified.reason;
    throw error;
  }
  const target = filePath || APPROVALS_PATH;
  const bytes = Buffer.byteLength(content, "ascii");
  fsApi.mkdirSync(path.dirname(target), { recursive: true });
  // 先寫暫存檔再原子替換，避免寫入中斷留下損毀的信任邊界清冊。
  const temporary = target + ".tmp";
  try {
    fsApi.writeFileSync(temporary, content, "ascii");
    fsApi.renameSync(temporary, target);
  } catch (error) {
    try {
      fsApi.unlinkSync(temporary);
    } catch (cleanupError) {
      // 暫存檔不存在或無法移除時不掩蓋原始寫入錯誤。
    }
    throw error;
  }
  return bytes;
}

/**
 * @description 由候選項目建立核准紀錄，ID 一律重新計算。
 * @param {Object} candidate - 候選項目
 * @param {{approvedAt?: string, line?: number, column?: number, suggestion?: string, suggestionSource?: string}} [options] - 選項
 * @returns {{id: string, record: Object}} 核准 ID 與紀錄
 */
function createApproval(candidate, options) {
  if (!candidate || typeof candidate !== "object") throw new TypeError("createApproval 需要候選物件");
  const settings = options || {};
  const merged = Object.assign({}, candidate);
  if (settings.line !== undefined) merged.line = settings.line;
  if (settings.column !== undefined) merged.column = settings.column;
  if (settings.suggestion !== undefined) merged.suggestion = settings.suggestion;
  if (settings.suggestionSource !== undefined) merged.suggestionSource = settings.suggestionSource;
  merged.approvedAt = settings.approvedAt || new Date().toISOString();
  const record = normalizeRecord(merged);
  return { id: stableId.computeStableId(record), record: record };
}

/**
 * @description 累加核准紀錄；重複ID覆蓋，無效候選列入 rejected。
 * @param {{version: number, approvals: Object}} registry - 清冊
 * @param {Object[]} candidates - 候選項目陣列
 * @param {Object} [options] - 選項
 * @returns {{registry: Object, added: string[], rejected: string[]}} 更新結果
 */
function addApprovals(registry, candidates, options) {
  const source = normalizeApprovals(registry && registry.approvals);
  const target = { version: VERSION, approvals: source };
  const added = [];
  const rejected = [];
  (Array.isArray(candidates) ? candidates : []).forEach(function (candidate) {
    if (!candidate || typeof candidate !== "object") {
      rejected.push("");
      return;
    }
    try {
      const created = createApproval(candidate, options);
      target.approvals[created.id] = created.record;
      added.push(created.id);
    } catch (error) {
      rejected.push(String(candidate.id || ""));
    }
  });
  return { registry: target, added: added, rejected: rejected };
}

/**
 * @description 由清冊撤銷一或多筆核准。
 * @param {{version: number, approvals: Object}} registry - 清冊
 * @param {string[]} ids - 核准 ID 陣列
 * @returns {{registry: Object, removed: string[], missing: string[]}} 更新結果
 */
function revokeApprovals(registry, ids) {
  const source = normalizeApprovals(registry && registry.approvals);
  const target = { version: VERSION, approvals: source };
  const removed = [];
  const missing = [];
  (Array.isArray(ids) ? ids : []).forEach(function (id) {
    if (id && Object.hasOwn(target.approvals, id)) {
      delete target.approvals[id];
      removed.push(id);
    } else {
      missing.push(id);
    }
  });
  return { registry: target, removed: removed, missing: missing };
}

/**
 * @description 由報告項目建立候選，保留報告ID做為 reportedId 診斷證據。
 * @param {Object} entry - 報告項目
 * @returns {Object} 候選
 */
function candidateFromReportEntry(entry) {
  return analysis.candidateFromReportEntry(entry);
}

/**
 * @description 由報告項目累加核准，未知ID列入 missing。
 * @param {Object[]} entries - 報告項目陣列
 * @param {string[]} ids - 欲核准ID
 * @param {{approvedAt?: string, registry?: Object}} [options] - 選項
 * @returns {{registry: Object, added: string[], missing: string[], rejected: string[]}} 更新結果
 */
function approveFromReport(entries, ids, options) {
  const settings = options || {};
  const byId = new Map();
  (Array.isArray(entries) ? entries : []).forEach(function (entry) {
    if (entry && typeof entry.id === "string") byId.set(entry.id, entry);
  });
  const candidates = [];
  const missing = [];
  (Array.isArray(ids) ? ids : []).forEach(function (id) {
    if (byId.has(id)) candidates.push(candidateFromReportEntry(byId.get(id)));
    else missing.push(id);
  });
  const base = settings.registry || emptyRegistry();
  const result = addApprovals(base, candidates, settings);
  return { registry: result.registry, added: result.added, missing: missing, rejected: result.rejected };
}

/**
 * @description 授權判定；版本不支援時達失敗關閉，其餘交給語言分析核心單一計算點。
 * @param {Object} registry - 清冊或載入結果
 * @param {Object} candidate - 目前候選
 * @returns {{result: string, reason: string, record: ?Object}} 判定結果
 */
function authorizeCandidate(registry, candidate) {
  if (registry && registry.version !== undefined && !isSupportedVersion(registry.version)) {
    return { result: RESULT.INVALID_RECORD, reason: VERSION_UNSUPPORTED, record: null };
  }
  if (registry && typeof registry.diagnostic === "string" && registry.diagnostic) {
    return { result: RESULT.INVALID_RECORD, reason: registry.diagnostic, record: null };
  }
  return analysis.authorizeCandidate(registry, candidate);
}

/**
 * @description 批次授權候選，依結果分組。
 * @param {Object} registry - 清冊
 * @param {Object[]} candidates - 候選陣列
 * @returns {Object} 分組結果
 */
function authorizeCandidates(registry, candidates) {
  const grouped = { authorized: [], unauthorized: [], invalid: [], mismatched: [] };
  (Array.isArray(candidates) ? candidates : []).forEach(function (candidate) {
    const decision = authorizeCandidate(registry, candidate);
    if (decision.result === RESULT.AUTHORIZED) grouped.authorized.push(candidate);
    if (decision.result === RESULT.UNAPPROVED) grouped.unauthorized.push(candidate);
    if (decision.result === RESULT.INVALID_RECORD) grouped.invalid.push(candidate);
    if (decision.result === RESULT.ORIGINAL_MISMATCH) grouped.mismatched.push(candidate);
  });
  return grouped;
}

/**
 * @description 格式化核准或撤銷結果供輸出使用。
 * @param {Object} result - 操作結果
 * @returns {string} 人讀訊息
 */
function formatOperationResult(result) {
  const data = result || {};
  const parts = [];
  if (data.added) parts.push("已核准 " + data.added.length + " 筆");
  if (data.removed) parts.push("已撤銷 " + data.removed.length + " 筆");
  if (data.missing && data.missing.length)
    parts.push("找不到 " + data.missing.length + " 筆：" + data.missing.join(", "));
  if (data.rejected && data.rejected.length) parts.push("拒絕 " + data.rejected.length + " 筆");
  return parts.join("；") || "無變更";
}

module.exports = {
  APPROVALS_PATH: APPROVALS_PATH,
  VERSION: VERSION,
  RECORD_FIELDS: RECORD_FIELDS,
  RESULT: RESULT,
  VERSION_UNSUPPORTED: VERSION_UNSUPPORTED,
  emptyRegistry: emptyRegistry,
  escapeNonAscii: escapeNonAscii,
  isPureAscii: isPureAscii,
  normalizeRecord: normalizeRecord,
  normalizeApprovals: normalizeApprovals,
  serializeRegistry: serializeRegistry,
  parseRegistryText: parseRegistryText,
  verifySerializedRegistry: verifySerializedRegistry,
  loadRegistry: loadRegistry,
  saveRegistry: saveRegistry,
  createApproval: createApproval,
  addApprovals: addApprovals,
  revokeApprovals: revokeApprovals,
  candidateFromReportEntry: candidateFromReportEntry,
  approveFromReport: approveFromReport,
  authorizeCandidate: authorizeCandidate,
  authorizeCandidates: authorizeCandidates,
  formatOperationResult: formatOperationResult
};
