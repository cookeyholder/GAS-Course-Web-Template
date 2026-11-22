"use strict";

/**
 * @file openccProtectedTerms.js
 * @description 受保護詞彙的最長優先 trie 遮蔽與還原，以及私密使用區
 *              （PUA）字元集合不變式。所有函式皆為無副作用純函式，
 *              隨機來源可注入以利重現與測試，僅供 Node 工具鏈使用。
 */

/** 哨兵起始字元（私密使用區） */
const SENTINEL_START = "\uE000";

/** 哨兵中間字元（私密使用區） */
const SENTINEL_MID = "\uE001";

/** 哨兵結束字元（私密使用區） */
const SENTINEL_END = "\uE002";

/** trie 終端標記 */
const TERMINATOR = "\0";

/** 私密使用區碼位下限 */
const PUA_MIN = 0xe000;

/** 私密使用區碼位上限 */
const PUA_MAX = 0xf8ff;

/** 產生哨兵前綴之最大重試次數 */
const MAX_PREFIX_ATTEMPTS = 1000;

/**
 * 建立最長優先 trie。以終端標記保存完整詞彙，使比對可取回最長匹配。
 *
 * @param {Array<string>} terms - 受保護詞彙陣列
 * @returns {Map<string, Map>} trie 根節點
 */
function buildProtectedTrie(terms) {
  const root = new Map();
  if (!Array.isArray(terms)) return root;
  terms.forEach(function (term) {
    if (typeof term !== "string" || term.length === 0) return;
    let node = root;
    for (const character of term) {
      if (!node.has(character)) node.set(character, new Map());
      node = node.get(character);
    }
    node.set(TERMINATOR, term);
  });
  return root;
}

/**
 * 在指定位置尋找最長受保護詞彙。
 *
 * @param {string} text - 待比對文字
 * @param {number} index - 起始偏移（UTF-16 程式碼單元）
 * @param {Map<string, Map>} trie - trie 根節點
 * @returns {?string} 最長匹配詞彙，無匹配時回傳 null
 */
function longestMatchAt(text, index, trie) {
  let node = trie;
  let best = null;
  for (let i = index; i < text.length; i += 1) {
    const next = node.get(text[i]);
    if (!next) break;
    node = next;
    if (node.has(TERMINATOR)) best = node.get(TERMINATOR);
  }
  return best;
}

/**
 * 產生不與原始內容碰撞之哨兵前綴。每次產生後皆對整份內容做 includes
 * 檢查，衝突則重新產生，直到完全不相交為止。
 *
 * @param {string} content - 原始內容
 * @param {Function} [randomSource] - 回傳 0 至 1 隨機數之函式，預設 Math.random
 * @returns {string} 哨兵前綴
 * @throws {Error} 達最大重試次數仍碰撞時拋出
 */
function generateSentinelPrefix(content, randomSource) {
  const random = typeof randomSource === "function" ? randomSource : Math.random;
  const source = content == null ? "" : String(content);
  for (let attempt = 0; attempt < MAX_PREFIX_ATTEMPTS; attempt += 1) {
    const token = Math.floor(random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");
    const prefix = SENTINEL_START + token + SENTINEL_MID;
    if (!source.includes(prefix)) return prefix;
  }
  throw new Error("無法產生不與原始內容碰撞之哨兵前綴");
}

/**
 * 遮蔽文字中所有受保護詞彙。重疊時最長詞優先；同一詞彙重複出現時
 * 共用同一哨兵，確保僅還原一次。
 *
 * @param {string} text - 原始文字
 * @param {Array<string>} terms - 受保護詞彙陣列
 * @param {{randomSource?: Function}} [options] - 選項
 * @returns {{text: string, prefix: string, sentinelByTerm: Map<string, string>}} 遮蔽結果
 */
function maskProtectedTerms(text, terms, options) {
  const settings = options || {};
  const source = text == null ? "" : String(text);
  const trie = buildProtectedTrie(terms);
  const prefix = generateSentinelPrefix(source, settings.randomSource);
  const sentinelByTerm = new Map();
  let masked = "";
  let index = 0;
  while (index < source.length) {
    const match = longestMatchAt(source, index, trie);
    if (match !== null) {
      if (!sentinelByTerm.has(match)) {
        sentinelByTerm.set(match, prefix + sentinelByTerm.size + SENTINEL_END);
      }
      masked += sentinelByTerm.get(match);
      index += match.length;
      continue;
    }
    masked += source[index];
    index += 1;
  }
  return { text: masked, prefix: prefix, sentinelByTerm: sentinelByTerm };
}

/**
 * 將遮蔽後文字中的哨兵還原為原詞彙。
 *
 * @param {string} maskedText - 遮蔽後文字
 * @param {{prefix: string, sentinelByTerm: Map<string, string>}} maskResult - 遮蔽結果
 * @returns {string} 還原後文字
 */
function restoreProtectedTerms(maskedText, maskResult) {
  if (!maskResult || !maskResult.prefix) return String(maskedText);
  const prefix = maskResult.prefix;
  const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(escaped + "(\\d+)" + SENTINEL_END, "g");
  const bySentinel = new Map();
  maskResult.sentinelByTerm.forEach(function (sentinel, term) {
    bySentinel.set(sentinel, term);
  });
  return String(maskedText).replace(pattern, function (full, digits) {
    const reconstructed = prefix + digits + SENTINEL_END;
    return bySentinel.has(reconstructed) ? bySentinel.get(reconstructed) : full;
  });
}

/**
 * 收集文字中所有私密使用區字元。
 *
 * @param {string} text - 文字
 * @returns {Set<string>} 私密使用區字元集合
 */
function collectPuaChars(text) {
  const chars = new Set();
  for (const character of String(text)) {
    const code = character.codePointAt(0);
    if (code >= PUA_MIN && code <= PUA_MAX) chars.add(character);
  }
  return chars;
}

/**
 * 驗證遮蔽再還原後的私密使用區字元集合與原文完全相同，
 * 以確保無哨兵殘留，亦未吞掉原有字元。
 *
 * @param {string} originalText - 原始文字
 * @param {string} restoredText - 還原後文字
 * @returns {{ok: boolean, missing: string[], added: string[]}} 驗證結果
 */
function checkPuaInvariant(originalText, restoredText) {
  const before = collectPuaChars(originalText);
  const after = collectPuaChars(restoredText);
  const missing = [];
  const added = [];
  before.forEach(function (character) {
    if (!after.has(character)) missing.push(character);
  });
  after.forEach(function (character) {
    if (!before.has(character)) added.push(character);
  });
  return { ok: missing.length === 0 && added.length === 0, missing: missing, added: added };
}

module.exports = {
  SENTINEL_START: SENTINEL_START,
  SENTINEL_MID: SENTINEL_MID,
  SENTINEL_END: SENTINEL_END,
  TERMINATOR: TERMINATOR,
  PUA_MIN: PUA_MIN,
  PUA_MAX: PUA_MAX,
  MAX_PREFIX_ATTEMPTS: MAX_PREFIX_ATTEMPTS,
  buildProtectedTrie: buildProtectedTrie,
  longestMatchAt: longestMatchAt,
  generateSentinelPrefix: generateSentinelPrefix,
  maskProtectedTerms: maskProtectedTerms,
  restoreProtectedTerms: restoreProtectedTerms,
  collectPuaChars: collectPuaChars,
  checkPuaInvariant: checkPuaInvariant
};
