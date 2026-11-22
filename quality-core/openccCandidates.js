"use strict";

/**
 * @file openccCandidates.js
 * @description 語言檢查候選的排序、最長優先重疊合併與 high／pending 分層。
 *              此模組只做呈現排序與分類，不授予任何寫入權限，亦不修改傳入資料。
 */

/** 候選分層：由 s2tw 定位且命中硬閘門違規 */
const TIER_HIGH = "high";

/** 候選分層：由 s2tw 定位但未命中硬閘門違規 */
const TIER_PENDING = "pending";

/**
 * 判斷候選是否具有可比較的有效範圍。
 *
 * @param {*} candidate - 待判定候選
 * @returns {boolean} 是否為有效候選
 */
function isValidCandidate(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  const start = Number(candidate.start);
  const end = Number(candidate.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start;
}

/**
 * 比較候選順序：長度長者優先、起點靠前者優先，完全同範圍時原文長者優先。
 * 此順序保證最長重疊候選總是先被選中。
 *
 * @param {Object} a - 候選 A
 * @param {Object} b - 候選 B
 * @returns {number} 負值表示 a 優先
 */
function compareCandidateOrder(a, b) {
  const aLength = a.end - a.start;
  const bLength = b.end - b.start;
  if (aLength !== bLength) return bLength - aLength;
  if (a.start !== b.start) return a.start - b.start;
  return String(b.original).length - String(a.original).length;
}

/**
 * 判斷兩候選是否重疊；首尾相接不算重疊。
 *
 * @param {Object} a - 候選 A
 * @param {Object} b - 候選 B
 * @returns {boolean} 是否重疊
 */
function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

/**
 * 以最長優先策略合併重疊候選。較短且重疊者直接捨棄，保留下來的候選
 * 原樣回傳其 `rule`、`suggestionSource` 與 `suggestionOptions`，不新增也不合併來源。
 *
 * @param {Array<Object>} candidates - 候選陣列
 * @returns {Array<Object>} 合併後依起點排序的新陣列
 */
function mergeOverlappingSuggestions(candidates) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const sorted = candidates.filter(isValidCandidate).sort(compareCandidateOrder);
  const kept = [];
  sorted.forEach(function (candidate) {
    if (
      kept.some(function (previous) {
        return overlaps(candidate, previous);
      })
    ) {
      return;
    }
    kept.push(candidate);
  });
  return kept.sort(function (a, b) {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });
}

/**
 * 判定單一候選分層。所有候選皆由 s2tw 差異定位，因此命中硬閘門違規者為 high，
 * 其餘為 pending；分層僅供排序，不構成寫入授權。
 *
 * @param {Object} candidate - 候選
 * @returns {string} `high` 或 `pending`
 */
function tierCandidate(candidate) {
  if (candidate && candidate.rule === "HARD") return TIER_HIGH;
  return TIER_PENDING;
}

/**
 * 為候選補上分層欄位，回傳新陣列且保留其餘欄位。
 *
 * @param {Array<Object>} candidates - 候選陣列
 * @returns {Array<Object>} 附帶 tier 的新候選陣列
 */
function tierCandidates(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.map(function (candidate) {
    return Object.assign({}, candidate, { tier: tierCandidate(candidate) });
  });
}

/**
 * 依分層與起點排序候選，high 優先，同層由左至右、同起點由長至短。
 *
 * @param {Array<Object>} candidates - 候選陣列
 * @returns {Array<Object>} 排序後的新陣列
 */
function sortCandidatesForReport(candidates) {
  if (!Array.isArray(candidates)) return [];
  return candidates.slice().sort(function (a, b) {
    if (a.tier !== b.tier) return a.tier === TIER_HIGH ? -1 : 1;
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start);
  });
}

/**
 * 統計 high／pending 分層數量。
 *
 * @param {Array<Object>} candidates - 候選陣列
 * @returns {{high: number, pending: number}} 分層計數
 */
function countTiers(candidates) {
  const counts = { high: 0, pending: 0 };
  if (!Array.isArray(candidates)) return counts;
  candidates.forEach(function (candidate) {
    counts[tierCandidate(candidate)] += 1;
  });
  return counts;
}

module.exports = {
  TIER_HIGH: TIER_HIGH,
  TIER_PENDING: TIER_PENDING,
  isValidCandidate: isValidCandidate,
  compareCandidateOrder: compareCandidateOrder,
  mergeOverlappingSuggestions: mergeOverlappingSuggestions,
  tierCandidate: tierCandidate,
  tierCandidates: tierCandidates,
  sortCandidatesForReport: sortCandidatesForReport,
  countTiers: countTiers
};
