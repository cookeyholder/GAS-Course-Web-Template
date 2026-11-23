"use strict";

/**
 * @file openccS2twpProtectedTerms.js
 * @description 受保護術語清冊之命令式外殼：以純文字靜態解析取得後端模組的
 *              中文契約字面值，合併已知誤改詞與法定單位名稱後，交由
 *              quality-core 進行最長優先遮蔽。僅豁免 s2twp 建議與候選，
 *              不豁免硬閘門回報。本模組僅供 Node 工具鏈使用。
 */

const fs = require("fs");
const path = require("path");
const core = require("../quality-core/openccProtectedTerms.js");

/** 專案根目錄 */
const PROJECT_ROOT = path.join(__dirname, "..");

/** 來源抽取成功狀態 */
const STATUS_AVAILABLE = "AVAILABLE";

/** 來源抽取失敗狀態（報告 meta 的 protectedTermsStatus 值域之一） */
const STATUS_UNAVAILABLE = "PROTECTED_TERMS_UNAVAILABLE";

/** 契約字面值清冊路徑（由 task 3.3 產生，缺失時不影響本清冊） */
const CONTRACT_LITERALS_PATH = path.join(__dirname, "openccS2twpContractLiterals.json");

/** 靜態來源定義與最低抽取數量 */
const SOURCES = Object.freeze([
  { id: "gasRuntime", file: "gasRuntime.js", minimum: 15 },
  { id: "actionRegistry", file: "actionRegistry.js", minimum: 10 },
  { id: "databaseInitializer", file: "databaseInitializer.js", minimum: 20 }
]);

/**
 * 已知 OpenCC s2twp 誤改之專案用語（黃金反面案例）。
 *
 * 每組同時收錄「臺灣原文」與「s2twp 誤改結果」：原文用於在原行建立受保護區間，
 * 誤改結果用於比對零長度插入候選。兩側皆為繁體字串，不會引入簡體字或中國用語。
 * 繁體「項目」在臺灣亦指正當條目或細目，故與「專案」雙向收錄。
 */
const KNOWN_MISTRANSLATIONS = Object.freeze([
  "高級工業職業學校",
  "高雄高工",
  "課程代碼",
  "設備組",
  "權限",
  "實例",
  "參數",
  "高級",
  "冊次",
  "出版者",
  "高階",
  "課程程式碼",
  "許可權",
  "映射",
  "對映",
  "類型",
  "型別",
  "視圖",
  "檢視",
  "局部",
  "區域性",
  "綁定",
  "繫結",
  "前綴",
  "字首",
  "循環",
  "迴圈",
  "拋出",
  "丟擲",
  "框",
  "方塊",
  "註冊表",
  "登錄檔",
  "鎖死",
  "防鎖宕",
  "污染",
  "汙染",
  "表格",
  "報表",
  "錶",
  "托",
  "託",
  "干預",
  "幹預",
  "項目",
  "專案"
]);

/** 法定公文與單位名稱 */
const LEGAL_NAMES = Object.freeze([
  "附件1",
  "附件3",
  "附件4",
  "附件5",
  "教學組",
  "註冊組",
  "科主任",
  "學科召集人",
  "系統管理員",
  "業務人員",
  "檢視人員",
  "主計",
  "人事"
]);

/** 中文字碼範圍（含擴充區），用於篩出契約字面值 */
const CJK_PATTERN = /[\u3400-\u9fff]/u;

/** 字串字面值比對：同字串排除換行與跳脫引號 */
const STRING_LITERAL_PATTERN = /"((?:[^"\\\r\n]|\\.)*)"|'((?:[^'\\\r\n]|\\.)*)'/g;

/**
 * @description 從原始碼文字抽取含中文字的字串字面值，略過註解、跳脫負面字面值和結構符號。
 * @param {string} source - 原始碼文字
 * @returns {Array<string>} 中文字串陣列（保留原順序）
 */
function extractChineseLiterals(source) {
  if (typeof source !== "string") return [];
  const code = source
    .split("\n")
    .filter(function (line) {
      return !/^\s*(\/\/|\/\*|\*)/.test(line);
    })
    .join("\n");
  const result = [];
  STRING_LITERAL_PATTERN.lastIndex = 0;
  let match = STRING_LITERAL_PATTERN.exec(code);
  while (match !== null) {
    const literal = match[1] || match[2] || "";
    if (
      CJK_PATTERN.test(literal) &&
      literal.indexOf("\\u") === -1 &&
      literal.indexOf("{") === -1 &&
      literal.indexOf("}") === -1 &&
      literal.length <= 40
    ) {
      result.push(literal);
    }
    match = STRING_LITERAL_PATTERN.exec(code);
  }
  return result;
}

/**
 * @description 以字串長度遞減排序並去除重複與空白項目。
 * @param {Array<string>} terms - 詞彙陣列
 * @returns {Array<string>} 正規化後詞彙陣列
 */
function normalizeTerms(terms) {
  const seen = new Set();
  return (Array.isArray(terms) ? terms : [])
    .filter(function (term) {
      return typeof term === "string" && term.length > 0;
    })
    .sort(function (a, b) {
      return b.length - a.length;
    })
    .filter(function (term) {
      if (seen.has(term)) return false;
      seen.add(term);
      return true;
    });
}

/**
 * @description 預設讀檔函式。
 * @param {string} filePath - 絕對路徑
 * @returns {string} 檔案內容
 */
function defaultReadFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

/**
 * @description 讀取選用契約字面值清冊，檔案不存在或內容無效時回傳空陣列。
 * @param {{readFile?: Function, contractLiteralsPath?: string}} [options] - 選項
 * @returns {Array<string>} 契約字面值陣列
 */
function loadContractLiterals(options) {
  const settings = options || {};
  const readFile = settings.readFile || defaultReadFile;
  const filePath = settings.contractLiteralsPath || CONTRACT_LITERALS_PATH;
  try {
    const data = JSON.parse(readFile(filePath));
    return Array.isArray(data.literals) ? data.literals : [];
  } catch (error) {
    return [];
  }
}

/**
 * @description 建立可注入讀檔來源之受保護清冊模組，供契約測試模擬抽取失敗。
 * @param {{readFile?: Function, projectRoot?: string, randomSource?: Function}} [options] - 選項
 * @returns {Object} 受保護清冊模組
 */
function createProtectedTermsModule(options) {
  const settings = options || {};
  const readFile = settings.readFile || defaultReadFile;
  const projectRoot = settings.projectRoot || PROJECT_ROOT;

  /**
   * @description 逐一抽取靜態來源，失敗來源僅標記不接受，不靜默回傳空清冊。
   * @param {Object} [params] - 覆寫選項
   * @returns {{terms: Array<string>, status: string, failures: Array<string>, counts: Object}} 抽取結果
   */
  function collectSources(params) {
    const effective = Object.assign({}, settings, params || {});
    const reader = effective.readFile || readFile;
    const root = effective.projectRoot || projectRoot;
    const terms = [];
    const failures = [];
    const counts = {};

    SOURCES.forEach(function (source) {
      let content;
      try {
        content = reader(path.join(root, source.file));
      } catch (error) {
        failures.push(source.id + ":READ_FAILED");
        return;
      }
      if (typeof content !== "string") {
        failures.push(source.id + ":READ_FAILED");
        return;
      }
      const extracted = extractChineseLiterals(content);
      counts[source.id] = extracted.length;
      if (extracted.length < source.minimum) {
        failures.push(source.id + ":BELOW_MINIMUM");
        return;
      }
      terms.push.apply(terms, extracted);
    });

    return {
      terms: terms,
      status: failures.length === 0 ? STATUS_AVAILABLE : STATUS_UNAVAILABLE,
      failures: failures,
      counts: counts
    };
  }

  /**
   * @description 取得完整受保護詞彙清冊。
   * @param {{extraTerms?: Array<string>, includeContractLiterals?: boolean}} [params] - 選項
   * @returns {Array<string>} 最長優先排序之受保護詞彙
   */
  function getProtectedTerms(params) {
    const effective = Object.assign({}, settings, params || {});
    const sources = collectSources(effective);
    const parts = [KNOWN_MISTRANSLATIONS, LEGAL_NAMES, sources.terms];
    if (effective.includeContractLiterals !== false) {
      parts.push(loadContractLiterals(effective));
    }
    if (Array.isArray(effective.extraTerms)) parts.push(effective.extraTerms);
    return normalizeTerms(
      parts.reduce(function (all, group) {
        return all.concat(group);
      }, [])
    );
  }

  /**
   * @description 取得來源抽取狀態，供報告 meta 的 protectedTermsStatus 使用。
   * @param {Object} [params] - 覆寫選項
   * @returns {string} AVAILABLE 或 PROTECTED_TERMS_UNAVAILABLE
   */
  function getStatus(params) {
    return collectSources(params).status;
  }

  /**
   * @description 取得可觀測的抽取報告。
   * @param {Object} [params] - 覆寫選項
   * @returns {{status: string, failures: Array<string>, counts: Object, termCount: number}} 抽取報告
   */
  function getSourceReport(params) {
    const sources = collectSources(params);
    return {
      status: sources.status,
      failures: sources.failures,
      counts: sources.counts,
      termCount: getProtectedTerms(params).length
    };
  }

  /**
   * @description 遮蔽文字中所有受保護詞彙，回傳可供 s2twp 安全轉換之結果。
   * @param {string} text - 原始文字
   * @param {Object} [params] - 選項
   * @returns {{text: string, prefix: string, sentinelByTerm: Map<string, string>}} 遮蔽結果
   */
  function protectText(text, params) {
    const effective = Object.assign({}, settings, params || {});
    return core.maskProtectedTerms(text, getProtectedTerms(effective), { randomSource: effective.randomSource });
  }

  /**
   * @description 將遮蔽後文字還原為原詞彙。
   * @param {string} maskedText - 遮蔽後文字
   * @param {Object} maskResult - protectText 回傳之遮蔽結果
   * @returns {string} 還原後文字
   */
  function restoreText(maskedText, maskResult) {
    return core.restoreProtectedTerms(maskedText, maskResult);
  }

  /**
   * @description 判斷文字開頭是否命中受保護詞彙。
   * @param {string} text - 文字
   * @param {Object} [params] - 選項
   * @returns {boolean} 是否受保護
   */
  function isProtectedText(text, params) {
    const trie = core.buildProtectedTrie(getProtectedTerms(params));
    return core.longestMatchAt(String(text === undefined || text === null ? "" : text), 0, trie) !== null;
  }

  return {
    collectSources: collectSources,
    getProtectedTerms: getProtectedTerms,
    getStatus: getStatus,
    getSourceReport: getSourceReport,
    protectText: protectText,
    restoreText: restoreText,
    isProtectedText: isProtectedText
  };
}

const defaultModule = createProtectedTermsModule();

module.exports = {
  STATUS_AVAILABLE: STATUS_AVAILABLE,
  STATUS_UNAVAILABLE: STATUS_UNAVAILABLE,
  CONTRACT_LITERALS_PATH: CONTRACT_LITERALS_PATH,
  SOURCES: SOURCES,
  KNOWN_MISTRANSLATIONS: KNOWN_MISTRANSLATIONS,
  LEGAL_NAMES: LEGAL_NAMES,
  extractChineseLiterals: extractChineseLiterals,
  normalizeTerms: normalizeTerms,
  loadContractLiterals: loadContractLiterals,
  createProtectedTermsModule: createProtectedTermsModule,
  collectSources: defaultModule.collectSources,
  getProtectedTerms: defaultModule.getProtectedTerms,
  getStatus: defaultModule.getStatus,
  getSourceReport: defaultModule.getSourceReport,
  protectText: defaultModule.protectText,
  restoreText: defaultModule.restoreText,
  isProtectedText: defaultModule.isProtectedText
};
