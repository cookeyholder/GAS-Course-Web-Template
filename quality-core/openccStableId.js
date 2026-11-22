"use strict";

/**
 * @file openccStableId.js
 * @description 候選與核准紀錄的內容定址識別碼純函式。識別碼只綁定位置欄位，
 *              不受行號、欄位偏移與人工選詞影響；本模組僅供 Node 工具鏈使用。
 */

const crypto = require("crypto");

/** 穩定 ID 截取之十六進位碼長度 */
const STABLE_ID_LENGTH = 16;

/** 上下文雜湊截取之十六進位碼長度 */
const CONTEXT_HASH_LENGTH = 16;

/** 上下文比對半徑（UTF-16 程式碼單元） */
const CONTEXT_RADIUS = 24;

/** 欄位分隔符 */
const SEPARATOR = "\0";

/** 識別碼使用的四個欄位，順序具有版本意義 */
const ID_FIELDS = Object.freeze(["file", "original", "contextHash", "occurrenceIndex"]);

/** 不得出現在清冊物件的原型相關鍵 */
const FORBIDDEN_KEYS = Object.freeze(["__proto__", "constructor", "prototype"]);

/**
 * 判斷是否為可用於清冊索引的普通物件。
 *
 * @param {*} value - 待判定值
 * @returns {boolean} 是否為普通物件
 */
function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * 判斷物件是否含原型相關自有鍵。
 *
 * @param {Object} value - 待判定物件
 * @returns {boolean} 是否含禁用鍵
 */
function hasForbiddenKeys(value) {
  return FORBIDDEN_KEYS.some(function (key) {
    return Object.hasOwn(value, key);
  });
}

/**
 * 判斷單一值是否含欄位分隔符。
 *
 * @param {*} value - 待判定值
 * @returns {boolean} 是否含分隔符
 */
function hasSeparator(value) {
  return String(value).indexOf(SEPARATOR) !== -1;
}

/**
 * 判斷識別欄位是否任一含欄位分隔符。
 *
 * @param {Object} fields - 識別欄位
 * @returns {boolean} 是否含分隔符
 */
function hasIdentifierSeparator(fields) {
  if (!fields || typeof fields !== "object") return false;
  return ID_FIELDS.some(function (field) {
    return hasSeparator(fields[field]);
  });
}

/**
 * 安全版分隔符檢查：欄位自訂轉字串行為拋出例外時視為不可用。
 *
 * @param {Object} fields - 識別欄位
 * @returns {boolean} 是否含分隔符或無法安全檢查
 */
function hasIdentifierSeparatorSafely(fields) {
  try {
    return hasIdentifierSeparator(fields);
  } catch (error) {
    return true;
  }
}

/**
 * 判斷識別碼是否符合十六碼十六進位格式。
 *
 * @param {*} id - 待判定識別碼
 * @returns {boolean} 格式是否正確
 */
function isValidIdFormat(id) {
  return typeof id === "string" && /^[0-9a-fA-F]{16}$/.test(id);
}

/**
 * 計算 SHA-256 摘要並截取指定長度。
 *
 * @param {string} text - 摘要輸入
 * @param {number} length - 截取長度
 * @returns {string} 十六進位摘要
 */
function digest(text, length) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex").slice(0, length);
}

/**
 * 建立指定欄位順序的識別碼計算函式；預設匯出的 computeStableId 使用四欄位版本。
 * 此工廠供版本遷移測試注入舊版欄位組合，不改變預設識別碼契約。
 *
 * @param {Array<string>} fields - 參與計算的欄位順序
 * @returns {Function} 識別碼計算函式
 */
function createStableId(fields) {
  if (!Array.isArray(fields) || fields.length === 0) {
    throw new TypeError("createStableId 需要非空白欄位陣列");
  }
  return function computeWithFields(entry) {
    if (!entry || typeof entry !== "object") {
      throw new TypeError("computeStableId 需要物件參數");
    }
    const parts = fields.map(function (field) {
      return String(entry[field]);
    });
    return digest(parts.join(SEPARATOR), STABLE_ID_LENGTH);
  };
}

const computeStableId = createStableId(ID_FIELDS);

/**
 * 將可能為負數或非數值的偏移收斂為非負整數。
 *
 * @param {*} value - 原始偏移
 * @returns {number} 非負整數偏移
 */
function normalizeOffset(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.floor(number));
}

/**
 * 計算替換處的上下文雜湊。即使傳入多行文字，也只取替換處所在行的前後上下文，
 * 不足處以空字串補齊，故檔案前方插入新行不會改變結果。
 *
 * @param {string} text - 替換處所在文字，可為單行或整份檔案內容
 * @param {number} start - 替換起始偏移（UTF-16 程式碼單元）
 * @param {number} length - 替換原文長度（UTF-16 程式碼單元）
 * @returns {string} 十六碼上下文雜湊
 */
function computeContextHash(text, start, length) {
  const content = String(text);
  const position = normalizeOffset(start);
  const size = normalizeOffset(length);
  const lineStart = content.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
  let lineEnd = content.indexOf("\n", position);
  if (lineEnd === -1) lineEnd = content.length;
  if (lineEnd > lineStart && content.charAt(lineEnd - 1) === "\r") lineEnd -= 1;

  const replacementEnd = Math.min(lineEnd, position + size);
  const leftStart = Math.max(lineStart, position - CONTEXT_RADIUS);
  const rightEnd = Math.min(lineEnd, replacementEnd + CONTEXT_RADIUS);
  return digest(
    content.slice(leftStart, position) + SEPARATOR + content.slice(replacementEnd, rightEnd),
    CONTEXT_HASH_LENGTH
  );
}

/**
 * 依檔案與原文分組，由左至右、由上至下指派 occurrenceIndex，且不修改傳入資料。
 *
 * @param {Array<Object>} entries - 依掃描順序排列的候選陣列
 * @returns {Array<Object>} 附帶 occurrenceIndex 的新候選陣列
 */
function assignOccurrenceIndices(entries) {
  if (!Array.isArray(entries)) return [];
  const counters = new Map();
  return entries.map(function (entry) {
    const source = entry && typeof entry === "object" ? entry : {};
    const key = String(source.file) + SEPARATOR + String(source.original);
    const current = counters.has(key) ? counters.get(key) : 0;
    counters.set(key, current + 1);
    return Object.assign({}, source, { occurrenceIndex: current });
  });
}

/**
 * 以目前演算法驗證核准紀錄自身的識別欄位是否仍自洽。
 *
 * @param {string} id - 核准紀錄的識別碼
 * @param {Object} registryEntryFields - 核准紀錄自身的四個識別欄位
 * @returns {boolean} 格式與重新計算結果皆相符時回傳 true
 */
function isStableIdValid(id, registryEntryFields) {
  if (!isValidIdFormat(id)) return false;
  if (!registryEntryFields || typeof registryEntryFields !== "object") return false;
  if (hasIdentifierSeparatorSafely(registryEntryFields)) return false;
  try {
    return computeStableId(registryEntryFields) === id.toLowerCase();
  } catch (error) {
    return false;
  }
}

/**
 * 產生索引結果容器。
 *
 * @param {boolean} ok - 清冊可否使用
 * @param {string|null} reason - 拒絕原因
 * @returns {Object} 索引結果
 */
function createIndexResult(ok, reason) {
  return { ok: ok, reason: reason, valid: new Map(), invalid: new Map(), excluded: [] };
}

/**
 * 建立核准索引。格式無效或含分隔符的紀錄被剔除；重新計算不符者保留於 invalid，
 * 供授權判定階段查詢與診斷，但不授予任何寫入權限。
 *
 * @param {Object} approvals - 清冊的 approvals 物件
 * @returns {Object} 索引結果
 */
function indexApprovals(approvals) {
  const result = createIndexResult(true, null);
  if (!isPlainObject(approvals)) {
    result.ok = false;
    result.reason = "APPROVALS_NOT_PLAIN_OBJECT";
    return result;
  }
  if (hasForbiddenKeys(approvals)) {
    result.ok = false;
    result.reason = "APPROVALS_PROTOTYPE_KEY";
    return result;
  }

  Object.keys(approvals).forEach(function (id) {
    const record = approvals[id];
    const unusable =
      !isValidIdFormat(id) ||
      hasSeparator(id) ||
      !record ||
      typeof record !== "object" ||
      hasIdentifierSeparatorSafely(record);
    if (unusable) {
      result.excluded.push(id);
      return;
    }
    const target = isStableIdValid(id, record) ? result.valid : result.invalid;
    target.set(id, record);
  });
  return result;
}

/**
 * 取出四個識別欄位，供診斷比對使用。
 *
 * @param {Object} fields - 欄位來源
 * @returns {Object} 只含識別欄位的新物件
 */
function pickIdentifierFields(fields) {
  const picked = {};
  ID_FIELDS.forEach(function (field) {
    picked[field] = fields && typeof fields === "object" ? fields[field] : undefined;
  });
  return picked;
}

/**
 * 在授權判定階段區隔舊 ID 失效的兩種原因；此方法不得於清冊載入階段呼叫。
 *
 * @param {Object} registryEntryFields - 舊紀錄自身的識別欄位
 * @param {Object} candidateFields - 目前候選的識別欄位
 * @returns {string} ID_ALGORITHM_CHANGED 或 APPROVAL_TAMPERED
 */
function classifyInvalidApproval(registryEntryFields, candidateFields) {
  const record = pickIdentifierFields(registryEntryFields);
  const candidate = pickIdentifierFields(candidateFields);
  const identical = ID_FIELDS.every(function (field) {
    return String(record[field]) === String(candidate[field]);
  });
  return identical ? "ID_ALGORITHM_CHANGED" : "APPROVAL_TAMPERED";
}

module.exports = {
  STABLE_ID_LENGTH: STABLE_ID_LENGTH,
  CONTEXT_HASH_LENGTH: CONTEXT_HASH_LENGTH,
  CONTEXT_RADIUS: CONTEXT_RADIUS,
  ID_FIELDS: ID_FIELDS,
  createStableId: createStableId,
  computeStableId: computeStableId,
  computeContextHash: computeContextHash,
  assignOccurrenceIndices: assignOccurrenceIndices,
  hasIdentifierSeparator: hasIdentifierSeparator,
  isStableIdValid: isStableIdValid,
  isPlainObject: isPlainObject,
  hasForbiddenKeys: hasForbiddenKeys,
  indexApprovals: indexApprovals,
  classifyInvalidApproval: classifyInvalidApproval
};
