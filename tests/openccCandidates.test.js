"use strict";

/**
 * @file openccCandidates.test.js
 * @description 候選排序、最長優先重疊合併與 high／pending 分層契約測試。
 */

const assert = require("assert");
const candidates = require("../quality-core/openccCandidates.js");

/**
 * 建立測試候選。
 *
 * @param {Object} overrides - 覆寫欄位
 * @returns {Object} 候選物件
 */
function makeCandidate(overrides) {
  return Object.assign(
    {
      id: "candidate",
      start: 0,
      end: 2,
      original: "XY",
      rule: "S2TWP",
      suggestionSource: "S2TW",
      suggestionOptions: [{ source: "S2TW", text: "XY" }]
    },
    overrides
  );
}

/**
 * 取出候選識別碼陣列。
 *
 * @param {Array<Object>} list - 候選陣列
 * @returns {Array<string>} 識別碼陣列
 */
function ids(list) {
  return list.map(function (candidate) {
    return candidate.id;
  });
}

console.log("開始執行候選排序與分層契約測試...\n");

console.log("1. 常數、範圍有效性與比較順序...");
{
  assert.strictEqual(candidates.TIER_HIGH, "high");
  assert.strictEqual(candidates.TIER_PENDING, "pending");
  assert.strictEqual(candidates.isValidCandidate(makeCandidate({})), true);
  assert.strictEqual(candidates.isValidCandidate(null), false);
  assert.strictEqual(candidates.isValidCandidate("candidate"), false);
  assert.strictEqual(candidates.isValidCandidate({ start: 1, end: 1 }), false);
  assert.strictEqual(candidates.isValidCandidate({ start: "x", end: 2 }), false);

  const short = makeCandidate({ id: "short", start: 0, end: 2 });
  const long = makeCandidate({ id: "long", start: 0, end: 4 });
  const later = makeCandidate({ id: "later", start: 2, end: 4 });
  assert.ok(candidates.compareCandidateOrder(long, short) < 0);
  assert.ok(candidates.compareCandidateOrder(short, later) < 0);
  assert.ok(
    candidates.compareCandidateOrder(
      makeCandidate({ id: "ascii", start: 0, end: 2, original: "ab" }),
      makeCandidate({ id: "shortOriginal", start: 0, end: 2, original: "a" })
    ) < 0
  );
  console.log("   ✓ 範圍與比較順序驗證通過！\n");
}

console.log("2. 最長優先合併重疊候選並沿用保留候選欄位...");
{
  const shortGet = makeCandidate({
    id: "get",
    start: 0,
    end: 2,
    original: "\u53d6\u5f97",
    rule: "S2TWP",
    suggestionSource: "S2TWP",
    suggestionOptions: [{ source: "S2TWP", text: "short" }]
  });
  const longest = makeCandidate({
    id: "getRequest",
    start: 0,
    end: 4,
    original: "\u53d6\u5f97\u8acb\u6c42",
    rule: "HARD",
    suggestionSource: "S2TW",
    suggestionOptions: [{ source: "S2TW", text: "long" }]
  });
  const shortRequest = makeCandidate({
    id: "request",
    start: 2,
    end: 4,
    original: "\u8acb\u6c42",
    rule: "S2TWP",
    suggestionSource: "MAINLAND_TERMS",
    suggestionOptions: [{ source: "MAINLAND_TERMS", text: "shortRequest" }]
  });
  const input = Object.freeze([shortRequest, shortGet, longest]);
  const merged = candidates.mergeOverlappingSuggestions(input);
  assert.deepStrictEqual(ids(merged), ["getRequest"]);
  assert.strictEqual(merged[0].rule, "HARD");
  assert.strictEqual(merged[0].suggestionSource, "S2TW");
  assert.strictEqual(merged[0].suggestionOptions, longest.suggestionOptions);
  assert.deepStrictEqual(ids(input), ["request", "get", "getRequest"]);

  const earlierShort = makeCandidate({ id: "earlierShort", start: 0, end: 3 });
  const laterLong = makeCandidate({ id: "laterLong", start: 2, end: 6 });
  assert.deepStrictEqual(ids(candidates.mergeOverlappingSuggestions([earlierShort, laterLong])), ["laterLong"]);
  console.log("   ✓ 最長優先合併與欄位沿用驗證通過！\n");
}

console.log("3. 相鄰與有間隔的候選皆保留...");
{
  const first = makeCandidate({ id: "first", start: 0, end: 2 });
  const adjacent = makeCandidate({ id: "adjacent", start: 2, end: 4 });
  const separated = makeCandidate({ id: "separated", start: 5, end: 7 });
  const result = candidates.mergeOverlappingSuggestions([separated, adjacent, first]);
  assert.deepStrictEqual(ids(result), ["first", "adjacent", "separated"]);
  assert.strictEqual(result[0], first);
  assert.strictEqual(result[1], adjacent);
  assert.strictEqual(result[2], separated);
  assert.deepStrictEqual(candidates.mergeOverlappingSuggestions(null), []);
  assert.deepStrictEqual(candidates.mergeOverlappingSuggestions([]), []);
  assert.deepStrictEqual(
    ids(candidates.mergeOverlappingSuggestions([null, "invalid", makeCandidate({ id: "only" })])),
    ["only"]
  );
  console.log("   ✓ 相鄰保留與無效輸入驗證通過！\n");
}

console.log("4. high／pending 分層、排序與計數...");
{
  const hard = makeCandidate({ id: "hard", rule: "HARD", start: 5, end: 6 });
  const pendingLeft = makeCandidate({ id: "pendingLeft", rule: "S2TWP", start: 1, end: 2 });
  const pendingRight = makeCandidate({ id: "pendingRight", rule: "S2TWP", start: 3, end: 4 });
  assert.strictEqual(candidates.tierCandidate(hard), "high");
  assert.strictEqual(candidates.tierCandidate(pendingLeft), "pending");
  assert.strictEqual(candidates.tierCandidate(null), "pending");
  assert.strictEqual(candidates.tierCandidate(makeCandidate({ rule: "MAINLAND_TERMS" })), "pending");

  const input = Object.freeze([pendingLeft, hard, pendingRight]);
  const tiered = candidates.tierCandidates(input);
  assert.deepStrictEqual(
    tiered.map(function (candidate) {
      return candidate.tier;
    }),
    ["pending", "high", "pending"]
  );
  assert.notStrictEqual(tiered[0], pendingLeft);
  assert.strictEqual(pendingLeft.tier, undefined);
  assert.strictEqual(candidates.tierCandidates([makeCandidate({ tier: "high" })])[0].tier, "pending");
  assert.deepStrictEqual(candidates.tierCandidates(null), []);

  assert.deepStrictEqual(ids(candidates.sortCandidatesForReport(tiered)), ["hard", "pendingLeft", "pendingRight"]);
  const tied = [
    makeCandidate({ id: "short", tier: "high", start: 0, end: 2 }),
    makeCandidate({ id: "long", tier: "high", start: 0, end: 4 })
  ];
  assert.deepStrictEqual(ids(candidates.sortCandidatesForReport(tied)), ["long", "short"]);
  assert.deepStrictEqual(candidates.sortCandidatesForReport(null), []);

  assert.deepStrictEqual(candidates.countTiers(tiered), { high: 1, pending: 2 });
  assert.deepStrictEqual(candidates.countTiers([null]), { high: 0, pending: 1 });
  assert.deepStrictEqual(candidates.countTiers(null), { high: 0, pending: 0 });
  console.log("   ✓ 分層排序與計數驗證通過！\n");
}

console.log("✓ 候選排序與分層契約測試全數通過！\n");
