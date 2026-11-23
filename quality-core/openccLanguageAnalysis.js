"use strict";

/**
 * @file openccLanguageAnalysis.js
 * @description 語言檢查候選分析之純函式核心。候選僅由 s2tw 差異定位，
 *              s2twp 與 MAINLAND_TERMS 僅附加建議選項；硬違規偵測、
 *              授權四態與報告中繼資料集中於此，全部無副作用且仅供 Node 工具鏈使用。
 */

const stableId = require("./openccStableId.js");
const candidateCore = require("./openccCandidates.js");
const diffCore = require("./openccTextDiff.js");
const protectedCore = require("./openccProtectedTerms.js");

/** 命中規則：既有硬閘門 */
const RULE_HARD = "HARD";

/** 命中規則：s2tw 差異但未命中硬閘門 */
const RULE_S2TWP = "S2TWP";

/** 建議來源：s2tw 字級建議 */
const SOURCE_S2TW = "S2TW";

/** 建議來源：s2twp 臺灣慣用語建議 */
const SOURCE_S2TWP = "S2TWP";

/** 建議來源：專案對照表 */
const SOURCE_MAINLAND_TERMS = "MAINLAND_TERMS";

/** 受保護清冊可用 */
const PROTECTED_TERMS_AVAILABLE = "AVAILABLE";

/** 受保護清冊不可用 */
const PROTECTED_TERMS_UNAVAILABLE = "PROTECTED_TERMS_UNAVAILABLE";

/** 授權結果代碼 */
const RESULT = Object.freeze({
  AUTHORIZED: "AUTHORIZED",
  UNAPPROVED: "UNAPPROVED",
  INVALID_RECORD: "INVALID_RECORD",
  ORIGINAL_MISMATCH: "ORIGINAL_MISMATCH"
});

/** 行內豁免標記 */
const DEFAULT_IGNORE_MARKER = "language-check: ignore";

/** trie 快取，以詞彙陣列物件為鍵，避免每行重建詞典 */
const trieCache = new WeakMap();

/**
 * 取得詞彙陣列對應之共用 trie。
 *
 * @param {Array<string>} terms - 受保護詞彙
 * @returns {Map<string, Map>} trie 根節點
 */
function getCachedTrie(terms) {
  if (!Array.isArray(terms)) return new Map();
  if (trieCache.has(terms)) return trieCache.get(terms);
  const trie = protectedCore.buildProtectedTrie(terms);
  trieCache.set(terms, trie);
  return trie;
}

/**
 * 建立受保護詞彙於該行所佔之區間。
 *
 * @param {string} lineText - 整行文字
 * @param {Array<string>} terms - 受保護詞彙
 * @returns {Array<{start: number, end: number, term: string}>} 區間陣列
 */
function findProtectedSpans(lineText, terms) {
  const text = String(lineText || "");
  const trie = getCachedTrie(terms);
  const spans = [];
  let index = 0;
  while (index < text.length) {
    const match = protectedCore.longestMatchAt(text, index, trie);
    if (match !== null) {
      spans.push({ start: index, end: index + match.length, term: match });
      index += match.length;
      continue;
    }
    index += 1;
  }
  return spans;
}

/**
 * 判斷候選區間是否與任一受保護區間重疊。
 *
 * @param {{start: number, end: number}} candidate - 候選
 * @param {Array<{start: number, end: number}>} spans - 受保護區間
 * @returns {boolean} 是否重疊
 */
function overlapsProtected(candidate, spans) {
  if (!candidate) return false;
  return (spans || []).some(function (span) {
    return candidate.start < span.end && span.start < candidate.end;
  });
}

/**
 * 判斷候選原文是否與受保護詞彙有任何包含關係。簡繁轉換後可能只取得
 * 受保護詞之前綴，故採雙向包含比對；保護對象為候選原文，非建議文字。
 *
 * @param {string} text - 候選原文
 * @param {Array<string>} terms - 受保護詞彙
 * @returns {boolean} 是否受保護
 */
function isProtectedByText(text, terms) {
  if (!text) return false;
  return (terms || []).some(function (term) {
    return typeof term === "string" && term.length > 0 && (term.indexOf(text) !== -1 || text.indexOf(term) !== -1);
  });
}

/**
 * 找出字串中所有符合位置的起始偏移。
 *
 * @param {string} text - 待搜尋文字
 * @param {string} needle - 搜尋目標
 * @returns {Array<number>} 起始偏移陣列
 */
function findAllOccurrences(text, needle) {
  const found = [];
  if (!needle) return found;
  let from = 0;
  let index = text.indexOf(needle, from);
  while (index !== -1) {
    found.push(index);
    from = index + needle.length;
    index = text.indexOf(needle, from);
  }
  return found;
}

/**
 * 偵測單行硬閘門違規，回傳含位置之紀錄。
 *
 * @param {string} lineText - 整行文字
 * @param {{simplifiedCharacters: Set<string>, mainlandTerms: Array<Array<string>>, ignoreMarker: string}} rules - 規則
 * @returns {Array<{start: number, end: number, value: string, suggestion: string, kind: string}>} 違規紀錄
 */
function detectHardViolations(lineText, rules) {
  const text = String(lineText || "");
  const settings = rules || {};
  if (settings.ignoreMarker && text.indexOf(settings.ignoreMarker) !== -1) return [];
  const found = [];
  const simplified = settings.simplifiedCharacters;
  if (simplified && typeof simplified.forEach === "function") {
    simplified.forEach(function (character) {
      findAllOccurrences(text, character).forEach(function (start) {
        found.push({
          start: start,
          end: start + character.length,
          value: character,
          suggestion: "改用繁體字",
          kind: "簡體字"
        });
      });
    });
  }
  (settings.mainlandTerms || []).forEach(function (pair) {
    if (!Array.isArray(pair) || !pair[0]) return;
    findAllOccurrences(text, pair[0]).forEach(function (start) {
      found.push({
        start: start,
        end: start + pair[0].length,
        value: pair[0],
        suggestion: pair[1],
        kind: "中國用語"
      });
    });
  });
  return found;
}

/**
 * 找出覆蓋指定位置之最長硬違規。
 *
 * @param {{start: number, end: number}} range - 候選區間
 * @param {Array<Object>} violations - 硬違規紀錄
 * @returns {?Object} 覆蓋最長之違規，無則回 null
 */
function findLongestCoveringViolation(range, violations) {
  let best = null;
  (violations || []).forEach(function (violation) {
    if (violation.start < range.end && range.start < violation.end) {
      if (!best || violation.value.length > best.value.length) best = violation;
    }
  });
  return best;
}

/**
 * 建立逐程式碼單元的轉換對照表，供任意原文區間投射轉換結果。
 *
 * @param {string} lineText - 原文
 * @param {Array<Object>} hunks - 差異區塊
 * @returns {Array<string>} 對照表
 */
function buildConversionMap(lineText, hunks) {
  const text = String(lineText || "");
  const map = text.split("");
  (hunks || []).forEach(function (hunk) {
    const size = hunk.end - hunk.start;
    if (size <= 0) return;
    const replacement = String(hunk.suggestion || "");
    for (let index = 0; index < size; index += 1) {
      map[hunk.start + index] = index < replacement.length ? replacement[index] : "";
    }
    if (replacement.length > size) map[hunk.end - 1] += replacement.slice(size);
  });
  return map;
}

/**
 * 投射原文區間的轉換結果。
 *
 * @param {Array<string>} conversionMap - 轉換對照表
 * @param {number} start - 起始偏移
 * @param {number} end - 結束偏移
 * @returns {string} 轉換結果
 */
function projectConvertedRange(conversionMap, start, end) {
  let result = "";
  for (let index = start; index < end; index += 1) {
    result += conversionMap[index] === undefined ? "" : conversionMap[index];
  }
  return result;
}

/**
 * 建立單一候選的建議選項。S2TW 恆為首項且為預設，S2TWP 僅在不同於
 * S2TW 時附加，MAINLAND_TERMS 僅在命中中國用語違規時附加。
 *
 * @param {Object} context - 含 lineText、s2twMap、s2twpMap、start、end、violation
 * @returns {Array<{source: string, text: string}>} 建議選項
 */
function buildSuggestionOptions(context) {
  const s2twText = projectConvertedRange(context.s2twMap, context.start, context.end);
  const s2twpText = projectConvertedRange(context.s2twpMap, context.start, context.end);
  const options = [{ source: SOURCE_S2TW, text: s2twText }];
  if (s2twpText !== s2twText) options.push({ source: SOURCE_S2TWP, text: s2twpText });
  const violation = context.violation;
  if (violation && violation.kind === "中國用語" && violation.suggestion) {
    options.push({ source: SOURCE_MAINLAND_TERMS, text: violation.suggestion });
  }
  return options;
}

/**
 * 建立單一原始候選。
 *
 * @param {Object} options - 候選欄位
 * @returns {Object} 原始候選
 */
function makeRawCandidate(options) {
  const settings = options || {};
  return {
    file: settings.file,
    line: settings.line,
    lineText: settings.lineText,
    start: settings.start,
    end: settings.end,
    column: settings.start,
    original: settings.original,
    suggestion: settings.suggestion,
    suggestionSource: settings.suggestionSource,
    suggestionOptions: settings.suggestionOptions || [],
    rule: settings.rule,
    protected: settings.protected === true,
    exempt: settings.exempt === true,
    s2tDiffers: settings.s2tDiffers === true,
    reason: settings.reason || ""
  };
}

/**
 * 建立豁免行候選標記，供報告計數與授權否決使用。
 *
 * @param {Object} context - 含 file、line、lineText
 * @returns {Object} 豁免候選
 */
function makeExemptCandidate(context) {
  const settings = context || {};
  return makeRawCandidate({
    file: settings.file,
    line: settings.line,
    lineText: settings.lineText || "",
    start: 0,
    end: 0,
    original: "",
    suggestion: "",
    suggestionSource: SOURCE_S2TW,
    suggestionOptions: [],
    rule: RULE_S2TWP,
    exempt: true,
    reason: "語言檢查豁免行（" + DEFAULT_IGNORE_MARKER + "）"
  });
}

/**
 * 分析單行，僅以 s2tw 差異定位候選並附加多來源建議。
 *
 * @param {Object} context - 含 file、line、lineText、convertedText、s2twpText 與規則
 * @returns {Array<Object>} 合併後之原始候選
 */
function analyzeLine(context) {
  const settings = context || {};
  const lineText = String(settings.lineText || "");
  const ignoreMarker = settings.ignoreMarker || DEFAULT_IGNORE_MARKER;
  if (lineText.indexOf(ignoreMarker) !== -1) return [];
  const s2twText = String(settings.convertedText || lineText);
  const s2twpText = String(settings.s2twpText || s2twText);
  const s2twHunks = diffCore.diffTextUnits(lineText, s2twText);
  if (s2twHunks.length === 0) return [];

  const rules = {
    simplifiedCharacters: settings.simplifiedCharacters || new Set(),
    mainlandTerms: settings.mainlandTerms || [],
    ignoreMarker: ignoreMarker
  };
  const terms = settings.protectedTerms || [];
  const spans = findProtectedSpans(lineText, terms);
  const violations = detectHardViolations(lineText, rules);
  const s2twMap = buildConversionMap(lineText, s2twHunks);
  const s2twpMap = buildConversionMap(lineText, diffCore.diffTextUnits(lineText, s2twpText));

  const raw = s2twHunks.map(function (hunk) {
    const violation = findLongestCoveringViolation(hunk, violations);
    let start = hunk.start;
    let end = hunk.end;
    let original = hunk.original;
    if (violation && violation.value.length > original.length) {
      start = violation.start;
      end = violation.end;
      original = violation.value;
    }
    const options = buildSuggestionOptions({
      lineText: lineText,
      s2twMap: s2twMap,
      s2twpMap: s2twpMap,
      start: start,
      end: end,
      violation: violation
    });
    return makeRawCandidate({
      file: settings.file,
      line: settings.line,
      lineText: lineText,
      start: start,
      end: end,
      original: original,
      suggestion: options[0].text,
      suggestionSource: options[0].source,
      suggestionOptions: options,
      rule: violation ? RULE_HARD : RULE_S2TWP,
      protected: overlapsProtected({ start: start, end: end }, spans) || isProtectedByText(original, terms),
      s2tDiffers: true,
      reason: violation ? violation.kind + "（s2tw 定位）" : "s2tw 簡體字差異"
    });
  });
  return candidateCore.mergeOverlappingSuggestions(raw);
}

/**
 * 為候選補上跨行 occurrenceIndex、contextHash、穩定 ID 與分層。
 *
 * @param {Array<Object>} rawCandidates - 原始候選
 * @returns {Array<Object>} 完整候選
 */
function finalizeCandidates(rawCandidates) {
  const indexed = stableId.assignOccurrenceIndices(rawCandidates);
  return indexed.map(function (raw) {
    const contextHash = stableId.computeContextHash(raw.lineText, raw.start, raw.original.length);
    const id = stableId.computeStableId({
      file: raw.file,
      original: raw.original,
      contextHash: contextHash,
      occurrenceIndex: raw.occurrenceIndex
    });
    return Object.assign({}, raw, {
      contextHash: contextHash,
      id: id,
      tier: candidateCore.tierCandidate(raw)
    });
  });
}

/**
 * 目前候選欄位重新計算識別碼，不信任報告帶入的 id。
 *
 * @param {Object} candidate - 候選
 * @returns {string} 目前識別碼
 */
function recomputeCandidateId(candidate) {
  return stableId.computeStableId({
    file: candidate.file,
    original: candidate.original,
    contextHash: candidate.contextHash,
    occurrenceIndex: candidate.occurrenceIndex
  });
}

/**
 * 由報告項目建立候選，保留 id 為 reportedId 做為診斷證據。
 *
 * @param {Object} entry - 報告項目
 * @returns {Object} 候選
 */
function candidateFromReportEntry(entry) {
  if (!entry || typeof entry !== "object") throw new TypeError("報告項目無效");
  return {
    file: entry.file,
    line: entry.line,
    column: entry.column,
    lineText: entry.lineText || "",
    start: Number(entry.column) || 0,
    end: (Number(entry.column) || 0) + String(entry.original || "").length,
    original: entry.original,
    suggestion: entry.suggestion,
    suggestionSource: entry.suggestionSource,
    suggestionOptions: entry.suggestionOptions || [],
    contextHash: entry.contextHash,
    occurrenceIndex: entry.occurrenceIndex,
    protected: entry.protected === true,
    exempt: entry.exempt === true,
    reportedId: entry.id
  };
}

/**
 * 產生授權判定結果。
 *
 * @param {string} result - 結果代碼
 * @param {string} reason - 原因或診斷代碼
 * @param {?Object} record - 命中紀錄
 * @returns {{result: string, reason: string, record: ?Object}} 判定結果
 */
function makeDecision(result, reason, record) {
  return { result: result, reason: reason, record: record || null };
}

/**
 * 正規化核准索引，同時接受完整清冊與已索引結果。
 *
 * @param {Object} registry - 清冊或索引結果
 * @returns {Object} 索引結果
 */
function normalizeRegistryIndex(registry) {
  if (!registry) return stableId.indexApprovals({});
  if (registry.valid && registry.invalid && registry.excluded) return registry;
  if (registry.approvals !== undefined) return stableId.indexApprovals(registry.approvals);
  return stableId.indexApprovals({});
}

/**
 * 由索引查閱核准紀錄，valid 與 invalid 皆可供否決與診斷查詢。
 *
 * @param {Object} index - 核准索引
 * @param {string} id - 識別碼
 * @returns {?{record: Object, valid: boolean}} 查閱結果
 */
function lookupIndex(index, id) {
  if (!id || typeof id !== "string") return null;
  if (index.valid.has(id)) return { record: index.valid.get(id), valid: true };
  if (index.invalid.has(id)) return { record: index.invalid.get(id), valid: false };
  return null;
}

/**
 * 逐一比對核准紀錄與目前候選的四個識別欄位。
 *
 * @param {Object} record - 核准紀錄
 * @param {Object} candidate - 目前候選
 * @returns {boolean} 四欄位是否完全相同
 */
function sameIdentifierFields(record, candidate) {
  return stableId.ID_FIELDS.every(function (field) {
    return String(record && record[field]) === String(candidate && candidate[field]);
  });
}

/**
 * 兩筆核准紀錄是否綁定相同建議。
 *
 * @param {Object} a - 紀錄 A
 * @param {Object} b - 紀錄 B
 * @returns {boolean} 建議是否相同
 */
function sameSuggestion(a, b) {
  return a.suggestionSource === b.suggestionSource && a.suggestion === b.suggestion;
}

/**
 * 在目前建議選項中查找核准紀錄綁定的選項。
 *
 * @param {Object} record - 核准紀錄
 * @param {Array<Object>} options - 目前建議選項
 * @returns {?Object} 命中選項
 */
function findApprovedOption(record, options) {
  if (!record || !Array.isArray(options)) return null;
  return (
    options.find(function (option) {
      return option && option.source === record.suggestionSource && option.text === record.suggestion;
    }) || null
  );
}

/**
 * 判定核准紀錄失效的診斷代碼。
 *
 * @param {Object} record - 舊紀錄
 * @param {Object} candidate - 目前候選
 * @returns {string} 診斷代碼
 */
function diagnoseInvalidApproval(record, candidate) {
  return stableId.classifyInvalidApproval(record, candidate);
}

/**
 * 準備授權所需的目前識別碼與舊識別碼；欄位不可用時直接回傳拒絕判定。
 *
 * @param {Object} candidate - 目前候選
 * @returns {{ready: boolean, decision: ?Object, currentId: string, reportedId: string}} 準備結果
 */
function prepareAuthorization(candidate) {
  if (!candidate || typeof candidate !== "object") {
    return { ready: false, decision: makeDecision(RESULT.UNAPPROVED, "候選項目無效"), currentId: "", reportedId: "" };
  }
  let currentId;
  try {
    currentId = recomputeCandidateId(candidate);
  } catch (error) {
    return {
      ready: false,
      decision: makeDecision(RESULT.INVALID_RECORD, "候選欄位無效"),
      currentId: "",
      reportedId: ""
    };
  }
  return {
    ready: true,
    decision: null,
    currentId: currentId,
    reportedId: typeof candidate.reportedId === "string" ? candidate.reportedId : ""
  };
}

/**
 * 判斷候選任一識別欄位是否含分隔符。
 *
 * @param {Object} candidate - 目前候選
 * @returns {boolean} 是否含分隔符
 */
function hasSeparatorInCandidate(candidate) {
  return stableId.hasIdentifierSeparator({
    file: candidate.file,
    original: candidate.original,
    contextHash: candidate.contextHash,
    occurrenceIndex: candidate.occurrenceIndex
  });
}

/**
 * 執行分隔符守門與 protected／exempt 否決，兩者皆與核准清冊內容無關。
 *
 * @param {Object} candidate - 目前候選
 * @param {Object} index - 核准索引
 * @returns {?Object} 否決判定，通過時回 null
 */
function getGateDecision(candidate, index) {
  if (hasSeparatorInCandidate(candidate)) return makeDecision(RESULT.INVALID_RECORD, "SEPARATOR_IN_IDENTIFIER");
  if (candidate.protected === true) return makeDecision(RESULT.UNAPPROVED, "PROTECTED_BY_ORIGINAL");
  if (candidate.exempt === true) return makeDecision(RESULT.UNAPPROVED, "EXEMPT_BY_POLICY");
  if (!index.ok) return makeDecision(RESULT.INVALID_RECORD, index.reason || "核准清冊無效");
  return null;
}

/**
 * 判斷識別碼是否指向被剔除的紀錄。
 *
 * @param {Object} index - 核准索引
 * @param {string} id - 識別碼
 * @returns {boolean} 是否被剔除
 */
function isExcluded(index, id) {
  return Boolean(index.excluded && index.excluded.includes(id));
}

/**
 * 判定目前識別碼命中時，舊識別碼是否造成否決或衝突。
 *
 * @param {{record: Object, valid: boolean}} reported - 舊識別碼紀錄
 * @param {{record: Object, valid: boolean}} current - 目前識別碼紀錄
 * @param {Object} candidate - 目前候選
 * @returns {?Object} 否決判定，無衝突時回 null
 */
function decideReportedConflict(reported, current, candidate) {
  if (!reported.valid) {
    return makeDecision(RESULT.INVALID_RECORD, diagnoseInvalidApproval(reported.record, candidate), reported.record);
  }
  if (!sameIdentifierFields(reported.record, candidate)) {
    return makeDecision(RESULT.ORIGINAL_MISMATCH, "REPORTED_ID_FIELDS_MISMATCH", reported.record);
  }
  if (!sameSuggestion(reported.record, current.record)) {
    return makeDecision(RESULT.ORIGINAL_MISMATCH, "REPORTED_ID_SUGGESTION_CONFLICT", reported.record);
  }
  return null;
}

/**
 * 判定目前識別碼命中清冊時的授權結果。
 *
 * @param {{record: Object, valid: boolean}} current - 目前識別碼紀錄
 * @param {?Object} reported - 舊識別碼紀錄
 * @param {Object} candidate - 目前候選
 * @returns {Object} 授權判定
 */
function decideCurrentIdHit(current, reported, candidate) {
  if (!current.valid || !sameIdentifierFields(current.record, candidate)) {
    return makeDecision(RESULT.INVALID_RECORD, diagnoseInvalidApproval(current.record, candidate), current.record);
  }
  if (!findApprovedOption(current.record, candidate.suggestionOptions)) {
    return makeDecision(RESULT.ORIGINAL_MISMATCH, "SUGGESTION_OPTION_DRIFT", current.record);
  }
  if (reported) {
    const conflict = decideReportedConflict(reported, current, candidate);
    if (conflict) return conflict;
  }
  return makeDecision(RESULT.AUTHORIZED, "已核准", current.record);
}

/**
 * 判定目前識別碼未命中清冊時，舊識別碼僅做為否決與診斷的結果。
 *
 * @param {?Object} reported - 舊識別碼紀錄
 * @param {Object} candidate - 目前候選
 * @returns {Object} 授權判定
 */
function decideReportedIdOnly(reported, candidate) {
  if (!reported) return makeDecision(RESULT.UNAPPROVED, "未核准");
  if (!reported.valid) {
    return makeDecision(RESULT.INVALID_RECORD, diagnoseInvalidApproval(reported.record, candidate), reported.record);
  }
  if (!sameIdentifierFields(reported.record, candidate)) {
    return makeDecision(RESULT.ORIGINAL_MISMATCH, "ORIGINAL_FIELDS_CHANGED", reported.record);
  }
  return makeDecision(RESULT.UNAPPROVED, "未核准");
}

/**
 * 單一授權計算點，供報告產生與修正模式共用。
 *
 * @param {Object} registry - 清冊或索引結果
 * @param {Object} candidate - 目前候選
 * @returns {{result: string, reason: string, record: ?Object}} 授權判定
 */
function authorizeCandidate(registry, candidate) {
  const prepared = prepareAuthorization(candidate);
  if (!prepared.ready) return prepared.decision;

  const index = normalizeRegistryIndex(registry);
  const gate = getGateDecision(candidate, index);
  if (gate) return gate;
  if (isExcluded(index, prepared.currentId) || isExcluded(index, prepared.reportedId)) {
    return makeDecision(RESULT.INVALID_RECORD, "SEPARATOR_IN_IDENTIFIER");
  }

  const current = lookupIndex(index, prepared.currentId);
  const reported =
    prepared.reportedId && prepared.reportedId !== prepared.currentId ? lookupIndex(index, prepared.reportedId) : null;
  if (current) return decideCurrentIdHit(current, reported, candidate);
  return decideReportedIdOnly(reported, candidate);
}

/**
 * 批次授權候選，依結果分組。
 *
 * @param {Object} registry - 清冊或索引結果
 * @param {Array<Object>} candidates - 候選陣列
 * @returns {{authorized: Array<Object>, unauthorized: Array<Object>, invalid: Array<Object>, mismatched: Array<Object>}} 分組結果
 */
function authorizeCandidates(registry, candidates) {
  const grouped = { authorized: [], unauthorized: [], invalid: [], mismatched: [] };
  (candidates || []).forEach(function (candidate) {
    const decision = authorizeCandidate(registry, candidate);
    if (decision.result === RESULT.AUTHORIZED) grouped.authorized.push(candidate);
    if (decision.result === RESULT.UNAPPROVED) grouped.unauthorized.push(candidate);
    if (decision.result === RESULT.INVALID_RECORD) grouped.invalid.push(candidate);
    if (decision.result === RESULT.ORIGINAL_MISMATCH) grouped.mismatched.push(candidate);
  });
  return grouped;
}

/**
 * 將完整候選轉為報告項目。
 *
 * @param {Object} candidate - 完整候選
 * @param {boolean} degraded - OpenCC 是否降級
 * @param {Object} [decision] - 授權判定
 * @returns {Object} 報告項目
 */
function toReportEntry(candidate, degraded, decision) {
  const result = decision || makeDecision(RESULT.UNAPPROVED, "未核定");
  return {
    id: candidate.id,
    reportedId: candidate.reportedId || "",
    file: candidate.file,
    line: candidate.line,
    column: candidate.column,
    original: candidate.original,
    suggestion: candidate.suggestion,
    suggestionSource: candidate.suggestionSource,
    suggestionOptions: candidate.suggestionOptions,
    tier: candidate.tier,
    rule: candidate.rule,
    approvalState: result.result,
    approvalReason: result.reason,
    protected: candidate.protected === true,
    exempt: candidate.exempt === true,
    degraded: degraded === true,
    contextHash: candidate.contextHash,
    occurrenceIndex: candidate.occurrenceIndex,
    reason: candidate.reason
  };
}

/**
 * 建立報告中繼資料的計數部分，保護優先於豁免且不重複計數。
 *
 * @param {Array<Object>} entries - 報告項目
 * @param {Object} [options] - 其他中繼欄位
 * @returns {Object} 中繼資料
 */
function buildReportMeta(entries, options) {
  const settings = options || {};
  const list = Array.isArray(entries) ? entries : [];
  const protectedCount = list.filter(function (entry) {
    return entry && entry.protected === true;
  }).length;
  const unprotectedCount = list.length - protectedCount;
  const exemptCandidateCount = list.filter(function (entry) {
    return entry && entry.exempt === true && entry.protected !== true;
  }).length;
  return {
    generatedAt: settings.generatedAt || "",
    degraded: settings.degraded === true,
    degradedReason: settings.degradedReason || "",
    literalDrift: settings.literalDrift || { drifted: false, added: [], removed: [] },
    violationCount: settings.violationCount || 0,
    exemptLines: settings.exemptLines || 0,
    candidateCount: list.length,
    protectedCount: protectedCount,
    unprotectedCount: unprotectedCount,
    exemptCandidateCount: exemptCandidateCount,
    tierCounts: candidateCore.countTiers(list),
    protectedTermsStatus: settings.protectedTermsStatus || PROTECTED_TERMS_AVAILABLE,
    outOfScopeFiles: settings.outOfScopeFiles || []
  };
}

/**
 * 組合原始候選、授權與報告項目，供外殼一次取得完整報告資料。
 *
 * @param {Array<Object>} rawCandidates - 原始候選
 * @param {Object} [options] - 含 registry、degraded 與其他中繼欄位
 * @returns {{candidates: Array<Object>, entries: Array<Object>, meta: Object}} 報告資料
 */
function buildReportEntries(rawCandidates, options) {
  const settings = options || {};
  const index = normalizeRegistryIndex(settings.registry);
  const candidates = finalizeCandidates(rawCandidates);
  const entries = candidates.map(function (candidate) {
    const decision = authorizeCandidate(index, candidate);
    return toReportEntry(candidate, settings.degraded === true, decision);
  });
  return { candidates: candidates, entries: entries, meta: buildReportMeta(entries, settings) };
}

module.exports = {
  RULE_HARD: RULE_HARD,
  RULE_S2TWP: RULE_S2TWP,
  SOURCE_S2TW: SOURCE_S2TW,
  SOURCE_S2TWP: SOURCE_S2TWP,
  SOURCE_MAINLAND_TERMS: SOURCE_MAINLAND_TERMS,
  PROTECTED_TERMS_AVAILABLE: PROTECTED_TERMS_AVAILABLE,
  PROTECTED_TERMS_UNAVAILABLE: PROTECTED_TERMS_UNAVAILABLE,
  RESULT: RESULT,
  DEFAULT_IGNORE_MARKER: DEFAULT_IGNORE_MARKER,
  findProtectedSpans: findProtectedSpans,
  overlapsProtected: overlapsProtected,
  isProtectedByText: isProtectedByText,
  detectHardViolations: detectHardViolations,
  findLongestCoveringViolation: findLongestCoveringViolation,
  buildConversionMap: buildConversionMap,
  projectConvertedRange: projectConvertedRange,
  buildSuggestionOptions: buildSuggestionOptions,
  makeRawCandidate: makeRawCandidate,
  makeExemptCandidate: makeExemptCandidate,
  analyzeLine: analyzeLine,
  finalizeCandidates: finalizeCandidates,
  recomputeCandidateId: recomputeCandidateId,
  candidateFromReportEntry: candidateFromReportEntry,
  authorizeCandidate: authorizeCandidate,
  authorizeCandidates: authorizeCandidates,
  toReportEntry: toReportEntry,
  buildReportMeta: buildReportMeta,
  buildReportEntries: buildReportEntries
};
