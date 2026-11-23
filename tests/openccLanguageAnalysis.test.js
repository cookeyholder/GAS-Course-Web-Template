"use strict";

/**
 * @file openccLanguageAnalysis.test.js
 * @description 語言分析核心契約測試：s2tw 定位、多來源建議、original 粒度、
 *              授權四態與報告中繼資料。所有簡體範例皆以 Unicode 跳脫表示。
 */

const assert = require("assert");
const analysis = require("../quality-core/openccLanguageAnalysis.js");
const stableId = require("../quality-core/openccStableId.js");

/** 簡體 `\u9879\u76ee` */
const SIMPLED_XIANGMU = "\u9879\u76ee";
/** 繁體「項目」 */
const TRAD_XIANGMU = "\u9805\u76ee";
/** 繁體「專案」 */
const TRAD_ZHUANAN = "\u5c08\u6848";
/** 繁體「權限」 */
const TRAD_QUANXIAN = "\u6b0a\u9650";
/** 繁體「許可權」 */
const TRAD_XUKEQUAN = "\u8a31\u53ef\u6b0a";
/** 簡體 `\u4ec5` */
const SIMPLED_JIN = "\u4ec5";
/** 繁體「僅」 */
const TRAD_JIN = "\u50c5";

/**
 * 建立分析情境。
 *
 * @param {Object} overrides - 覆寫欄位
 * @returns {Object} 情境
 */
function makeContext(overrides) {
  return Object.assign(
    {
      file: "src/example.js",
      line: 1,
      lineText: "",
      convertedText: "",
      s2twpText: "",
      simplifiedCharacters: new Set([SIMPLED_XIANGMU[0], SIMPLED_JIN]),
      mainlandTerms: [[SIMPLED_XIANGMU, TRAD_ZHUANAN]],
      protectedTerms: [],
      ignoreMarker: analysis.DEFAULT_IGNORE_MARKER
    },
    overrides || {}
  );
}

/**
 * 建立授權測試候選。
 *
 * @param {Object} overrides - 覆寫欄位
 * @returns {Object} 候選
 */
function makeCandidate(overrides) {
  return Object.assign(
    {
      file: "src/a.js",
      original: SIMPLED_XIANGMU,
      contextHash: "aaaaaaaaaaaaaaaa",
      occurrenceIndex: 0,
      suggestion: TRAD_XIANGMU,
      suggestionSource: analysis.SOURCE_S2TW,
      suggestionOptions: [
        { source: analysis.SOURCE_S2TW, text: TRAD_XIANGMU },
        { source: analysis.SOURCE_S2TWP, text: TRAD_ZHUANAN },
        { source: analysis.SOURCE_MAINLAND_TERMS, text: TRAD_ZHUANAN }
      ],
      protected: false,
      exempt: false,
      reportedId: ""
    },
    overrides || {}
  );
}

/**
 * 由候選建立單筆核准清冊。
 *
 * @param {Object} candidate - 候選
 * @param {Object} [recordOverrides] - 紀錄覆寫
 * @returns {Object} 清冊
 */
function makeRegistry(candidate, recordOverrides) {
  const id = stableId.computeStableId(candidate);
  const record = Object.assign({}, candidate, { approvedAt: "2026-01-01T00:00:00.000Z" }, recordOverrides || {});
  return { version: 1, approvals: { [id]: record } };
}

console.log("開始執行語言分析核心契約測試...\n");

console.log("1. 常數值域...\n");
{
  assert.strictEqual(analysis.RULE_HARD, "HARD");
  assert.strictEqual(analysis.RULE_S2TWP, "S2TWP");
  assert.strictEqual(analysis.SOURCE_S2TW, "S2TW");
  assert.strictEqual(analysis.SOURCE_S2TWP, "S2TWP");
  assert.strictEqual(analysis.SOURCE_MAINLAND_TERMS, "MAINLAND_TERMS");
  assert.strictEqual(analysis.PROTECTED_TERMS_AVAILABLE, "AVAILABLE");
  assert.strictEqual(analysis.PROTECTED_TERMS_UNAVAILABLE, "PROTECTED_TERMS_UNAVAILABLE");
  assert.deepStrictEqual(
    Object.keys(analysis.RESULT).map(function (key) {
      return analysis.RESULT[key];
    }),
    ["AUTHORIZED", "UNAPPROVED", "INVALID_RECORD", "ORIGINAL_MISMATCH"]
  );
  console.log("   ✓ 規則、來源與結果值域驗證通過！\n");
}

console.log("2. 正體字不產生候選，即使 s2twp 會誤改...\n");
{
  const cases = [
    { text: TRAD_XIANGMU, s2twp: TRAD_ZHUANAN },
    { text: "\u6578\u64da", s2twp: "\u8cc7\u6599" },
    { text: "\u8ab2\u7a0b\u4ee3\u78bc", s2twp: "\u8ab2\u7a0b\u7a0b\u5f0f\u78bc" },
    { text: TRAD_QUANXIAN, s2twp: "\u8a31\u53ef\u6b0a" },
    { text: "\u9f20\u6a19", s2twp: "\u6ed1\u9f20" }
  ];
  cases.forEach(function (item) {
    const raw = analysis.analyzeLine(
      makeContext({ lineText: item.text, convertedText: item.text, s2twpText: item.s2twp })
    );
    assert.deepStrictEqual(raw, [], "正體「" + item.text + "」不應產生候選");
  });
  console.log("   ✓ 五組正體案例不產生候選驗證通過！\n");
}

console.log("3. 簡體由 s2tw 定位，s2twp 僅附加建議...\n");
{
  const lineText = "使用" + SIMPLED_XIANGMU + "設定";
  const raw = analysis.analyzeLine(
    makeContext({
      lineText: lineText,
      convertedText: "使用" + TRAD_XIANGMU + "設定",
      s2twpText: "使用" + TRAD_ZHUANAN + "設定"
    })
  );
  assert.strictEqual(raw.length, 1, "s2twp 不得獨立建立第二個候選");
  assert.strictEqual(raw[0].original, SIMPLED_XIANGMU);
  assert.strictEqual(raw[0].suggestion, TRAD_XIANGMU);
  assert.strictEqual(raw[0].suggestionSource, analysis.SOURCE_S2TW);
  assert.strictEqual(raw[0].rule, analysis.RULE_HARD);
  assert.deepStrictEqual(raw[0].suggestionOptions, [
    { source: analysis.SOURCE_S2TW, text: TRAD_XIANGMU },
    { source: analysis.SOURCE_S2TWP, text: TRAD_ZHUANAN },
    { source: analysis.SOURCE_MAINLAND_TERMS, text: TRAD_ZHUANAN }
  ]);
  console.log("   ✓ s2tw 定位、s2twp 不另建候選與建議選項完整驗證通過！\n");
}

console.log("4. original 粒度：命中硬違規取完整詞，否則取最小單元...\n");
{
  const minimal = analysis.analyzeLine(
    makeContext({
      lineText: SIMPLED_JIN,
      convertedText: TRAD_JIN,
      s2twpText: TRAD_JIN,
      simplifiedCharacters: new Set([SIMPLED_JIN]),
      mainlandTerms: []
    })
  );
  assert.strictEqual(minimal.length, 1);
  assert.strictEqual(minimal[0].original, SIMPLED_JIN);

  const full = analysis.analyzeLine(
    makeContext({
      lineText: SIMPLED_XIANGMU,
      convertedText: TRAD_XIANGMU,
      s2twpText: TRAD_ZHUANAN
    })
  );
  assert.strictEqual(full[0].original, SIMPLED_XIANGMU);
  console.log("   ✓ 完整詞與最小替換單元粒度驗證通過！\n");
}

console.log("5. 正體組成的中國用語違規不進候選工具...\n");
{
  const traditionalViolations = ["\u652f\u6301", "\u914d\u7f6e", "\u53bb\u91cd", "\u54c8\u5e0c"];
  traditionalViolations.forEach(function (text) {
    const raw = analysis.analyzeLine(
      makeContext({
        lineText: text,
        convertedText: text,
        s2twpText: text,
        mainlandTerms: [[text, "替代"]]
      })
    );
    assert.deepStrictEqual(raw, [], "正體違規「" + text + "」不應進候選工具");
  });
  console.log("   ✓ 四組正體違規不進候選工具驗證通過！\n");
}

console.log("6. 單行分析、豁免行與保護標記...\n");
{
  assert.deepStrictEqual(analysis.analyzeLine(makeContext({ lineText: "忽略 " + analysis.DEFAULT_IGNORE_MARKER })), []);
  const exempt = analysis.makeExemptCandidate({
    file: "src/a.js",
    line: 3,
    lineText: "// " + analysis.DEFAULT_IGNORE_MARKER
  });
  assert.strictEqual(exempt.exempt, true);
  assert.strictEqual(exempt.protected, false);
  assert.strictEqual(exempt.rule, analysis.RULE_S2TWP);

  const protectedRaw = analysis.analyzeLine(
    makeContext({
      lineText: SIMPLED_XIANGMU,
      convertedText: TRAD_XIANGMU,
      s2twpText: TRAD_ZHUANAN,
      protectedTerms: [SIMPLED_XIANGMU]
    })
  );
  assert.strictEqual(protectedRaw[0].protected, true);
  assert.deepStrictEqual(analysis.analyzeLine(makeContext({ lineText: "完全正常" })), []);
  console.log("   ✓ 豁免、保護標記與空結果驗證通過！\n");
}

console.log("7. 受保護區間與硬違規偵測...\n");
{
  const spans = analysis.findProtectedSpans("設備組與課程代碼", ["設備組", "課程代碼", "設備"]);
  assert.strictEqual(spans.length, 2);
  assert.strictEqual(spans[0].term, "設備組");
  assert.strictEqual(analysis.overlapsProtected({ start: 1, end: 3 }, spans), true);
  assert.strictEqual(analysis.overlapsProtected({ start: 8, end: 9 }, spans), false);
  assert.deepStrictEqual(analysis.findProtectedSpans("無", null), []);
  assert.strictEqual(analysis.isProtectedByText("課程", ["課程代碼"]), true);
  assert.strictEqual(analysis.isProtectedByText("無關", ["課程代碼"]), false);
  assert.strictEqual(analysis.isProtectedByText("", ["課程代碼"]), false);

  const rules = {
    simplifiedCharacters: new Set(["\u5b9e"]),
    mainlandTerms: [["\u4ee3\u7801", "\u7a0b\u5f0f\u78bc"]],
    ignoreMarker: analysis.DEFAULT_IGNORE_MARKER
  };
  const found = analysis.detectHardViolations("\u4ee3\u7801" + "\u4e0e" + "\u5b9e", rules); // language-check: ignore 負面測試字面值
  assert.strictEqual(found.length, 2);
  assert.deepStrictEqual(analysis.detectHardViolations("\u4ee3\u7801 " + analysis.DEFAULT_IGNORE_MARKER, rules), []); // language-check: ignore 負面測試字面值
  assert.deepStrictEqual(analysis.detectHardViolations("完全正常", rules), []);
  console.log("   ✓ 區間重疊與硬違規偵測驗證通過！\n");
}

console.log("8. 混合命中拆分與跨行穩定 ID...\n");
{
  const raw = analysis.analyzeLine(
    makeContext({
      lineText: SIMPLED_XIANGMU + "，" + "\u6743\u9650", // language-check: ignore 負面測試字面值
      convertedText: TRAD_XIANGMU + "，" + TRAD_QUANXIAN,
      s2twpText: TRAD_ZHUANAN + "，" + TRAD_XUKEQUAN,
      mainlandTerms: [
        [SIMPLED_XIANGMU, TRAD_ZHUANAN],
        ["\u6743\u9650", TRAD_XUKEQUAN]
      ] // language-check: ignore 負面測試字面值
    })
  );
  assert.strictEqual(raw.length, 2, "不同位置之替換單元應拆分");
  assert.notStrictEqual(raw[0].original, raw[1].original);

  const first = analysis.analyzeLine(
    makeContext({ lineText: SIMPLED_XIANGMU, convertedText: TRAD_XIANGMU, s2twpText: TRAD_ZHUANAN, line: 1 })
  );
  const second = analysis.analyzeLine(
    makeContext({ lineText: SIMPLED_XIANGMU, convertedText: TRAD_XIANGMU, s2twpText: TRAD_ZHUANAN, line: 9 })
  );
  const finalized = analysis.finalizeCandidates(first.concat(second));
  assert.strictEqual(finalized.length, 2);
  assert.strictEqual(finalized[0].occurrenceIndex, 0);
  assert.strictEqual(finalized[1].occurrenceIndex, 1);
  assert.notStrictEqual(finalized[0].id, finalized[1].id);
  assert.strictEqual(finalized[0].id.length, 16);
  assert.ok(finalized[0].tier === "high" || finalized[0].tier === "pending");
  assert.deepStrictEqual(analysis.finalizeCandidates(null), []);
  console.log("   ✓ 混合拆分、跨行序號與穩定 ID 驗證通過！\n");
}

console.log("9. reportedId 保留與報告項目欄位...\n");
{
  const finalized = analysis.finalizeCandidates(
    analysis.analyzeLine(
      makeContext({ lineText: SIMPLED_XIANGMU, convertedText: TRAD_XIANGMU, s2twpText: TRAD_ZHUANAN })
    )
  );
  const entry = analysis.toReportEntry(finalized[0], true, { result: analysis.RESULT.UNAPPROVED, reason: "未核准" });
  assert.strictEqual(entry.id, finalized[0].id);
  assert.strictEqual(entry.degraded, true);
  assert.strictEqual(entry.rule, analysis.RULE_HARD);
  assert.strictEqual(entry.suggestionSource, analysis.SOURCE_S2TW);
  assert.ok(Array.isArray(entry.suggestionOptions));

  const rebuilt = analysis.candidateFromReportEntry(entry);
  assert.strictEqual(rebuilt.reportedId, finalized[0].id);
  assert.strictEqual(rebuilt.original, SIMPLED_XIANGMU);
  assert.strictEqual(rebuilt.suggestionOptions.length, 3);
  assert.throws(function () {
    analysis.candidateFromReportEntry(null);
  }, /報告項目無效/);
  console.log("   ✓ reportedId 保留、報告欄位與報告還原驗證通過！\n");
}

console.log("10. 授權四態：未核准與已核准...\n");
{
  const candidate = makeCandidate();
  assert.deepStrictEqual(analysis.authorizeCandidate(null, candidate).result, analysis.RESULT.UNAPPROVED);
  assert.strictEqual(analysis.authorizeCandidate(null, candidate).reason, "未核准");
  assert.strictEqual(
    analysis.authorizeCandidate(makeRegistry(candidate), candidate).result,
    analysis.RESULT.AUTHORIZED
  );
  assert.strictEqual(analysis.authorizeCandidate({}, candidate).result, analysis.RESULT.UNAPPROVED, "空清冊等效無核准");
  assert.strictEqual(
    analysis.authorizeCandidate({ version: 1, approvals: [] }, candidate).reason,
    "APPROVALS_NOT_PLAIN_OBJECT",
    "非物件清冊 fail-closed"
  );
  const throwing = makeCandidate({
    file: {
      toString: function () {
        throw new Error("欄位不可轉換");
      }
    }
  });
  assert.deepStrictEqual(analysis.authorizeCandidate(null, throwing), {
    result: analysis.RESULT.INVALID_RECORD,
    reason: "候選欄位無效",
    record: null
  });
  assert.strictEqual(analysis.authorizeCandidates(null, [candidate, null]).unauthorized.length, 2);
  assert.strictEqual(analysis.authorizeCandidates(makeRegistry(candidate), [candidate]).authorized.length, 1);
  assert.strictEqual(analysis.authorizeCandidate(makeRegistry(candidate), null).result, analysis.RESULT.UNAPPROVED);
  console.log("   ✓ 未核准與已核准驗證通過！\n");
}

console.log("11. 授權守門：分隔符與 protected／exempt 否決...\n");
{
  const candidate = makeCandidate();
  const registry = makeRegistry(candidate);
  assert.strictEqual(
    analysis.authorizeCandidate(registry, makeCandidate({ original: "含\0分隔" })).reason,
    "SEPARATOR_IN_IDENTIFIER"
  );
  assert.strictEqual(
    analysis.authorizeCandidate(registry, makeCandidate({ contextHash: "含\0分隔" })).result,
    analysis.RESULT.INVALID_RECORD
  );
  const hitRecordWithSeparator = {
    version: 1,
    approvals: { [stableId.computeStableId(candidate)]: Object.assign({}, candidate, { original: "含\0分隔" }) }
  };
  assert.deepStrictEqual(analysis.authorizeCandidate(hitRecordWithSeparator, candidate), {
    result: analysis.RESULT.INVALID_RECORD,
    reason: "SEPARATOR_IN_IDENTIFIER",
    record: null
  });
  assert.deepStrictEqual(analysis.authorizeCandidate(registry, makeCandidate({ protected: true })), {
    result: analysis.RESULT.UNAPPROVED,
    reason: "PROTECTED_BY_ORIGINAL",
    record: null
  });
  assert.strictEqual(analysis.authorizeCandidate(registry, makeCandidate({ exempt: true })).reason, "EXEMPT_BY_POLICY");
  assert.strictEqual(
    analysis.authorizeCandidate(registry, makeCandidate({ protected: true, exempt: true })).reason,
    "PROTECTED_BY_ORIGINAL",
    "protected 優先於 exempt"
  );
  console.log("   ✓ 分隔符守門與保護／豁免否決驗證通過！\n");
}

console.log("12. 目前 ID 命中：建議漂移與欄位遭竄改...\n");
{
  const candidate = makeCandidate();
  const drifted = makeRegistry(candidate, { suggestionSource: analysis.SOURCE_S2TWP, suggestion: "不在選項中" });
  const driftedDecision = analysis.authorizeCandidate(drifted, candidate);
  assert.strictEqual(driftedDecision.result, analysis.RESULT.ORIGINAL_MISMATCH);
  assert.strictEqual(driftedDecision.reason, "SUGGESTION_OPTION_DRIFT");

  const tampered = makeRegistry(candidate, { original: "遭竄改" });
  const tamperedDecision = analysis.authorizeCandidate(tampered, candidate);
  assert.strictEqual(tamperedDecision.result, analysis.RESULT.INVALID_RECORD);
  assert.strictEqual(tamperedDecision.reason, "APPROVAL_TAMPERED");
  console.log("   ✓ 建議漂移與欄位竄改驗證通過！\n");
}

console.log("13. reportedId 為否決導向：原文變動...\n");
{
  const original = makeCandidate();
  const registry = makeRegistry(original);
  const moved = makeCandidate({ original: "不同原文", reportedId: stableId.computeStableId(original) });
  const decision = analysis.authorizeCandidate(registry, moved);
  assert.strictEqual(decision.result, analysis.RESULT.ORIGINAL_MISMATCH);
  assert.strictEqual(decision.reason, "ORIGINAL_FIELDS_CHANGED");

  const missing = analysis.authorizeCandidate(
    registry,
    makeCandidate({ original: "未知原文", reportedId: "ffffffffffffffff" })
  );
  assert.strictEqual(missing.result, analysis.RESULT.UNAPPROVED);
  console.log("   ✓ 原文變動失效與未知 reportedId 驗證通過！\n");
}

console.log("14. reportedId 診斷：工具升級與欄位竄改可區隔...\n");
{
  const candidate = makeCandidate();
  const oldAlgorithm = stableId.createStableId(["file", "original", "contextHash"]);
  const oldId = oldAlgorithm(candidate);

  const upgraded = { version: 1, approvals: { [oldId]: Object.assign({}, candidate) } };
  const upgradedDecision = analysis.authorizeCandidate(upgraded, makeCandidate({ reportedId: oldId }));
  assert.strictEqual(upgradedDecision.result, analysis.RESULT.INVALID_RECORD);
  assert.strictEqual(upgradedDecision.reason, "ID_ALGORITHM_CHANGED");

  const tamperedFields = { version: 1, approvals: { [oldId]: Object.assign({}, candidate, { original: "遭竄改" }) } };
  const tamperedDecision = analysis.authorizeCandidate(tamperedFields, makeCandidate({ reportedId: oldId }));
  assert.strictEqual(tamperedDecision.result, analysis.RESULT.INVALID_RECORD);
  assert.strictEqual(tamperedDecision.reason, "APPROVAL_TAMPERED");
  assert.notStrictEqual(upgradedDecision.reason, tamperedDecision.reason);
  console.log("   ✓ 工具升級與竄改診斷區隔驗證通過！\n");
}

console.log("15. 目前 ID 命中但 reportedId 衝突或建議不同...\n");
{
  const candidate = makeCandidate();
  const currentId = stableId.computeStableId(candidate);
  const reportedId = "0123456789abcdef";
  const index = {
    ok: true,
    reason: null,
    valid: new Map([
      [currentId, Object.assign({}, candidate, { suggestionSource: analysis.SOURCE_S2TW, suggestion: TRAD_XIANGMU })],
      [reportedId, Object.assign({}, candidate, { suggestionSource: analysis.SOURCE_S2TW, suggestion: TRAD_XIANGMU })]
    ]),
    invalid: new Map(),
    excluded: []
  };
  assert.strictEqual(
    analysis.authorizeCandidate(index, makeCandidate({ reportedId: currentId })).result,
    analysis.RESULT.AUTHORIZED
  );
  assert.strictEqual(
    analysis.authorizeCandidate(index, makeCandidate({ reportedId: reportedId })).result,
    analysis.RESULT.AUTHORIZED,
    "舊紀錄四欄位與建議皆相同時維持授權"
  );
  const oldAlgorithm = stableId.createStableId(["file", "original", "contextHash"]);
  const oldId = oldAlgorithm(candidate);
  const mixedValidity = {
    version: 1,
    approvals: {
      [currentId]: Object.assign({}, candidate),
      [oldId]: Object.assign({}, candidate)
    }
  };
  const mixedDecision = analysis.authorizeCandidate(mixedValidity, makeCandidate({ reportedId: oldId }));
  assert.strictEqual(mixedDecision.result, analysis.RESULT.INVALID_RECORD, "目前 ID 命中時舊紀錄失效仍須否決");
  assert.strictEqual(mixedDecision.reason, "ID_ALGORITHM_CHANGED");

  const differentSuggestion = {
    ok: true,
    reason: null,
    valid: new Map([
      [currentId, Object.assign({}, candidate, { suggestionSource: analysis.SOURCE_S2TW, suggestion: TRAD_XIANGMU })],
      [reportedId, Object.assign({}, candidate, { suggestionSource: analysis.SOURCE_S2TWP, suggestion: TRAD_ZHUANAN })]
    ]),
    invalid: new Map(),
    excluded: []
  };
  assert.strictEqual(
    analysis.authorizeCandidate(differentSuggestion, makeCandidate({ reportedId: reportedId })).reason,
    "REPORTED_ID_SUGGESTION_CONFLICT"
  );

  const differentFields = {
    ok: true,
    reason: null,
    valid: new Map([
      [currentId, Object.assign({}, candidate)],
      [reportedId, Object.assign({}, candidate, { original: "不同原文" })]
    ]),
    invalid: new Map(),
    excluded: []
  };
  assert.strictEqual(
    analysis.authorizeCandidate(differentFields, makeCandidate({ reportedId: reportedId })).reason,
    "REPORTED_ID_FIELDS_MISMATCH"
  );
  console.log("   ✓ reportedId 衝突與建議不同重新核准驗證通過！\n");
}

console.log("16. 報告中繼資料計數與報告資料組合...\n");
{
  const entries = [
    { protected: true, exempt: true, rule: analysis.RULE_HARD },
    { protected: false, exempt: true, rule: analysis.RULE_S2TWP },
    { protected: false, exempt: false, rule: analysis.RULE_S2TWP }
  ];
  const meta = analysis.buildReportMeta(entries, {
    protectedTermsStatus: analysis.PROTECTED_TERMS_UNAVAILABLE,
    violationCount: 4
  });
  assert.strictEqual(meta.candidateCount, 3);
  assert.strictEqual(meta.protectedCount, 1);
  assert.strictEqual(meta.unprotectedCount, 2);
  assert.strictEqual(meta.exemptCandidateCount, 1, "受保護且豁免者不重複計入豁免數");
  assert.deepStrictEqual(meta.tierCounts, { high: 1, pending: 2 });
  assert.strictEqual(meta.protectedTermsStatus, analysis.PROTECTED_TERMS_UNAVAILABLE);
  assert.strictEqual(meta.violationCount, 4);
  assert.ok(meta.exemptCandidateCount <= meta.unprotectedCount);
  assert.strictEqual(meta.unprotectedCount, meta.candidateCount - meta.protectedCount);

  const raw = analysis.analyzeLine(
    makeContext({ lineText: SIMPLED_XIANGMU, convertedText: TRAD_XIANGMU, s2twpText: TRAD_ZHUANAN })
  );
  const report = analysis.buildReportEntries(raw, {
    degraded: false,
    protectedTermsStatus: analysis.PROTECTED_TERMS_AVAILABLE
  });
  assert.strictEqual(report.entries.length, 1);
  assert.strictEqual(report.meta.candidateCount, 1);
  assert.strictEqual(report.entries[0].approvalState, analysis.RESULT.UNAPPROVED);
  console.log("   ✓ 中繼計數、不變式與報告資料組合驗證通過！\n");
}

console.log("17. 防禦性預設、空值與快取分支...\n");
{
  const terms = ["設備組"];
  assert.deepStrictEqual(
    analysis.findProtectedSpans("設備組", terms),
    analysis.findProtectedSpans("設備組", terms),
    "重複呼叫應命中 trie 快取"
  );
  assert.strictEqual(analysis.overlapsProtected(null, [{ start: 0, end: 1 }]), false);
  assert.strictEqual(analysis.isProtectedByText("未在清冊", null), false);
  assert.strictEqual(analysis.isProtectedByText("x", [null, "", 123]), false);
  assert.strictEqual(analysis.isProtectedByText("設備", ["設備組"]), true);
  assert.strictEqual(analysis.isProtectedByText("設備組", ["設備"]), true, "反向包含亦視為受保護");
  assert.deepStrictEqual(analysis.findAllOccurrences("abc", ""), []);
  assert.deepStrictEqual(analysis.detectHardViolations("完全正常"), []);
  assert.deepStrictEqual(
    analysis.detectHardViolations("完全正常", { mainlandTerms: [null, ["", "替代"]], simplifiedCharacters: null }),
    []
  );
  assert.strictEqual(analysis.findLongestCoveringViolation({ start: 0, end: 1 }, null), null);
  assert.deepStrictEqual(analysis.buildConversionMap("abc", null), ["a", "b", "c"]);
  assert.strictEqual(analysis.projectConvertedRange([], 5, 8), "", "超出對照表範圍回空字串");
  const emptyRaw = analysis.makeRawCandidate();
  assert.strictEqual(emptyRaw.protected, false);
  assert.deepStrictEqual(emptyRaw.suggestionOptions, []);
  assert.strictEqual(emptyRaw.reason, "");
  const emptyExempt = analysis.makeExemptCandidate();
  assert.strictEqual(emptyExempt.exempt, true);
  assert.strictEqual(emptyExempt.lineText, "");
  assert.deepStrictEqual(analysis.analyzeLine(), []);

  const unlisted = analysis.analyzeLine(
    makeContext({
      lineText: SIMPLED_JIN,
      convertedText: TRAD_JIN,
      s2twpText: TRAD_JIN,
      simplifiedCharacters: new Set(),
      mainlandTerms: []
    })
  );
  assert.strictEqual(unlisted.length, 1);
  assert.strictEqual(unlisted[0].rule, analysis.RULE_S2TWP, "未命中硬違規時 rule 為 S2TWP");
  assert.strictEqual(unlisted[0].reason, "s2tw 簡體字差異");

  const minimalEntry = analysis.candidateFromReportEntry({ id: "aaaaaaaaaaaaaaaa", column: 0 });
  assert.strictEqual(minimalEntry.lineText, "");
  assert.strictEqual(minimalEntry.end, 0);
  assert.deepStrictEqual(minimalEntry.suggestionOptions, []);
  assert.deepStrictEqual(analysis.authorizeCandidates(null, null), {
    authorized: [],
    unauthorized: [],
    invalid: [],
    mismatched: []
  });
  const approved = makeCandidate();
  const grouped = analysis.authorizeCandidates(makeRegistry(approved), [
    makeCandidate({ original: "含\0分隔" }),
    makeCandidate({ original: "不同原文", reportedId: stableId.computeStableId(approved) })
  ]);
  assert.strictEqual(grouped.invalid.length, 1);
  assert.strictEqual(grouped.mismatched.length, 1);
  const defaultEntry = analysis.toReportEntry({ id: "bbbbbbbbbbbbbbbb", file: "a", original: "x" }, false);
  assert.strictEqual(defaultEntry.approvalState, analysis.RESULT.UNAPPROVED);
  const emptyMeta = analysis.buildReportMeta();
  assert.strictEqual(emptyMeta.candidateCount, 0);
  assert.strictEqual(emptyMeta.protectedTermsStatus, analysis.PROTECTED_TERMS_AVAILABLE);
  assert.deepStrictEqual(emptyMeta.literalDrift, { drifted: false, added: [], removed: [] });
  assert.deepStrictEqual(emptyMeta.outOfScopeFiles, []);
  assert.strictEqual(analysis.buildReportEntries(null).entries.length, 0);
  console.log("   ✓ 防禦性預設與空值分支驗證通過！\n");
}

console.log("✓ 語言分析核心契約測試全數通過！\n");
