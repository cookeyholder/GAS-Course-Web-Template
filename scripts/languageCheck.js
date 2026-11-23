"use strict";

/**
 * @file languageCheck.js
 * @description 全專案語言規範檢查：偵測簡體字與中國用語，確保原始碼、文件、
 *              工作流程與測試皆遵循 AGENTS.md 之臺灣繁體中文（zh-TW）規範。
 *
 * 設計原則：
 * 1. 僅收錄「繁體使用不同字形」的簡體字，避免誤判「系統、數值、學年度」等共用字。
 * 2. 中國用語採明確詞彙比對，並提供建議替代詞。
 * 3. 支援行內 `language-check: ignore` 註解，供負面測試故意保留錯誤字串使用。
 * 4. 既有硬閘門判定不變；OpenCC s2tw 僅定位候選，s2twp 僅提供建議，皆不構成違規或寫入授權。
 */

const fs = require("fs");
const path = require("path");

const s2twp = require("./openccS2twp.js");
const protectedTermsShell = require("./openccS2twpProtectedTerms.js");
const approvals = require("./openccS2twpApprovals.js");
const analysis = require("../quality-core/openccLanguageAnalysis.js");
const candidateCore = require("../quality-core/openccCandidates.js");
const protectedCore = require("../quality-core/openccProtectedTerms.js");
const literalGenerator = require("./generateOpenccS2twpContractLiterals.js");

/** 明確簡體專用字（每一字在繁體皆有不同碼位） */
const SIMPLIFIED_CHARACTERS = new Set(
  (
    "们这该说谁么样时后来过边闭问办创删选择传输请画击战动达进还连虽总续维约给" +
    "结织终统绝纪练紧级线纸实际属类别状态异体验优视无个对尔组务网认调数据码应为" +
    "从开发现经长与义产业电脑络护监报审规单拦扩块协议驱订阅广负载复区难缩弹编废" +
    "弃迁补简构并赖库脚译释执销毁机顿迟绑额节备记录计较证许诉评课资标设户龄驾邮" +
    "话踪远让买卖测断读写处变条关语项术词诗谢识误败继细综绩纹绵绳纤纯纳纵纬" +
    "绘缝绍软轻轮车运错"
  ).split("")
);

/** 中國用語及其臺灣繁體中文建議替代詞 */
const MAINLAND_TERMS = [
  ["代码", "程式碼"],
  ["项目", "專案"],
  ["数据", "資料"],
  ["默认", "預設"],
  ["内存", "記憶體"],
  ["支持", "支援"],
  ["调用", "呼叫"],
  ["接口", "介面"],
  ["对象", "物件"],
  ["布尔", "布林值"],
  ["数组", "陣列"],
  ["服务器", "伺服器"],
  ["网络", "網路"],
  ["异步", "非同步"],
  ["去重", "避免重複"],
  ["体现", "展現"],
  ["校验", "驗證"],
  ["转义", "跳脫"],
  ["哈希", "雜湊"],
  ["配置", "設定"],
  ["运行", "執行"],
  ["优化", "最佳化"],
  ["视频", "影片"],
  ["用户", "使用者"],
  ["拉取请求", "Pull Request"],
  ["拉取", "取得"]
];

/**
 * 硬閘門略過掃描之目錄（以 basename 比對）。
 * 本專案刻意將 openspec/ 與 docs/參考資料/ 納入硬閘門掃描，故僅新增 artifacts/。
 */
const EXCLUDED_DIRECTORIES = new Set(["node_modules", "coverage", ".git", "dist", ".clasp", ".codegraph", "artifacts"]);

/**
 * 硬閘門略過掃描之檔案（以 basename 比對）。
 *
 * - AGENTS.md：語言規範本身列舉禁詞作為對照範例，非違規。
 * - languageCheck.js：偵測器本身必須內嵌禁詞與簡體字對照表。
 * - index.html：建置產物，由 webapp/ 原始檔掃描涵蓋。
 */
const EXCLUDED_FILES = new Set(["AGENTS.md", "languageCheck.js", "package-lock.json", "index.html"]);

/** 納入掃描之副檔名 */
const TARGET_EXTENSIONS = new Set([".js", ".md", ".html", ".yml", ".yaml", ".json"]);

/** 行內豁免註解 */
const IGNORE_MARKER = "language-check: ignore";

/**
 * 報告系列模式排除之相對路徑前綴（相對專案根目錄，一律以 / 分隔）。
 * 與硬閘門的 basename 排除設定檔完全分離，另排除 openspec/ 與 docs/參考資料/。
 */
const REPORT_EXCLUDED_PATH_PREFIXES = Object.freeze([
  "node_modules/",
  "coverage/",
  ".git/",
  ".clasp/",
  ".codegraph/",
  "dist/",
  "build/",
  "artifacts/",
  "openspec/",
  "docs/參考資料/"
]);

/** 報告系列模式排除之精確相對路徑（僅根目錄四個檔案） */
const REPORT_EXCLUDED_FILES = Object.freeze([
  "AGENTS.md",
  "package-lock.json",
  "index.html",
  "scripts/languageCheck.js"
]);

/** 報告預設輸出目錄 */
const DEFAULT_REPORT_DIR = "artifacts";

/** 報告檔案名稱 */
const REPORT_JSONL = "language-report.jsonl";
const REPORT_MD = "language-report.md";

/** 結構化錯誤代碼 */
const REPORT_WRITE_FAILED = "REPORT_WRITE_FAILED";
const OPENCC_UNAVAILABLE = "OPENCC_UNAVAILABLE";

/** 受保護詞彙快取 */
let cachedProtectedTerms = null;

/**
 * 判斷報告系列模式是否應排除此相對路徑。
 *
 * @param {string} relativePath - 相對專案根目錄之路徑（以 / 分隔）
 * @returns {boolean} 是否應略過
 */
function isReportExcludedPath(relativePath) {
  return REPORT_EXCLUDED_PATH_PREFIXES.some(function (prefix) {
    return relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix);
  });
}

/**
 * 檢查單一文字內容是否符合語言規範。
 *
 * @param {string} content - 檔案內容
 * @returns {Array<{line: number, kind: string, value: string, suggestion: string, text: string}>} 違規清單
 */
function checkContent(content) {
  const violations = [];
  const lines = content.split("\n");
  lines.forEach(function (line, index) {
    if (line.indexOf(IGNORE_MARKER) !== -1) return;
    const simplified = new Set();
    for (const character of line) {
      if (SIMPLIFIED_CHARACTERS.has(character)) simplified.add(character);
    }
    if (simplified.size > 0) {
      violations.push({
        line: index + 1,
        kind: "簡體字",
        value: [...simplified].join(""),
        suggestion: "改用繁體字",
        text: line.trim().slice(0, 120)
      });
    }
    MAINLAND_TERMS.forEach(function (pair) {
      if (line.indexOf(pair[0]) !== -1) {
        violations.push({
          line: index + 1,
          kind: "中國用語",
          value: pair[0],
          suggestion: pair[1],
          text: line.trim().slice(0, 120)
        });
      }
    });
  });
  return violations;
}

/**
 * 判斷目錄項目是否為應納入檢查的檔案。
 *
 * @param {Object} entry - fs.Dirent 相容項目
 * @param {Object} pathApi - 路徑處理模組
 * @returns {boolean} 是否納入
 */
function shouldIncludeFile(entry, pathApi) {
  if (!entry.isFile()) return false;
  if (EXCLUDED_FILES.has(entry.name)) return false;
  return TARGET_EXTENSIONS.has(pathApi.extname(entry.name));
}

/**
 * 處理單一目錄項目：略過排除目錄、遞迴子目錄或收集符合條件的檔案。
 *
 * @param {Object} entry - fs.Dirent 相容項目
 * @param {string} current - 目前目錄絕對路徑
 * @param {string} root - 專案根目錄
 * @param {string[]} files - 收集結果
 * @param {Object} fsApi - 檔案系統模組
 * @param {Object} pathApi - 路徑處理模組
 */
function collectEntryFile(entry, current, root, files, fsApi, pathApi) {
  if (EXCLUDED_DIRECTORIES.has(entry.name)) return;
  const full = pathApi.join(current, entry.name);
  if (entry.isDirectory()) {
    collectFromDirectory(full, root, files, fsApi, pathApi);
    return;
  }
  if (shouldIncludeFile(entry, pathApi)) {
    files.push(pathApi.relative(root, full).replace(/\\/g, "/"));
  }
}

/**
 * 走訪單一目錄並收集檔案路徑。
 *
 * @param {string} current - 目前目錄
 * @param {string} root - 專案根目錄
 * @param {string[]} files - 收集結果
 * @param {Object} fsApi - 檔案系統模組
 * @param {Object} pathApi - 路徑處理模組
 */
function collectFromDirectory(current, root, files, fsApi, pathApi) {
  const entries = fsApi.readdirSync(current, { withFileTypes: true });
  for (let index = 0; index < entries.length; index += 1) {
    collectEntryFile(entries[index], current, root, files, fsApi, pathApi);
  }
}

/**
 * 遞迴收集專案中需要檢查的檔案。
 *
 * @param {string} [directory] - 起始目錄，預設為專案根目錄
 * @param {Object} [options] - 可注入的 fs 與 path（供測試使用）
 * @returns {string[]} 相對於專案根目錄之檔案路徑
 */
function collectFiles(directory, options) {
  const settings = options || {};
  const fsApi = settings.fs || fs;
  const pathApi = settings.path || path;
  const root = directory || pathApi.join(__dirname, "..");
  const files = [];
  collectFromDirectory(root, root, files, fsApi, pathApi);
  return files.sort();
}

/**
 * 檢查整個專案的語言相容性。
 *
 * @param {string} [directory] - 專案根目錄
 * @param {Object} [options] - 可注入的 fs 與 path（供測試使用）
 * @returns {Array<{file: string, violations: Array}>} 違規檔案清單
 */
function checkProject(directory, options) {
  const settings = options || {};
  const fsApi = settings.fs || fs;
  const root = directory || path.join(__dirname, "..");
  const results = [];
  collectFiles(root, settings).forEach(function (relative) {
    const violations = checkContent(fsApi.readFileSync(path.join(root, relative), "utf8"));
    if (violations.length > 0) results.push({ file: relative, violations: violations });
  });
  return results;
}

/**
 * 取得受保護詞彙，首次抽取後快取。
 *
 * @param {Object} [options] - 可注入的 shell
 * @returns {Array<string>} 受保護詞彙
 */
function getProtectedTerms(options) {
  const settings = options || {};
  const shell = settings.shell || protectedTermsShell;
  if (cachedProtectedTerms === null) cachedProtectedTerms = shell.getProtectedTerms();
  return cachedProtectedTerms;
}

/**
 * 建立具 OpenCC 降級路徑的單行轉換器；僅辨識結構化不可用錯誤，其他例外原樣拋出。
 *
 * @param {{degraded: boolean, degradedReason: string}} state - 降級狀態（會被就地更新）
 * @param {Object} [convertModule] - 可注入的 OpenCC 模組
 * @returns {Function} (line, configName) => 轉換後文字
 */
function createLineConverter(state, convertModule) {
  const module = convertModule || s2twp;
  return function (line, configName) {
    try {
      return module.convertText(line, configName || module.CONFIG_S2TW);
    } catch (error) {
      const code = error && error.code ? String(error.code) : OPENCC_UNAVAILABLE;
      if (code !== module.CODE_UNAVAILABLE && code !== module.CODE_BINARY_MISSING) throw error;
      if (!state.degraded) console.error(code + "：" + error.message);
      state.degraded = true;
      state.degradedReason = code + "：" + error.message;
      return line;
    }
  };
}

/**
 * 以空字串探測 OpenCC 可用性，結果不影響硬閘門結束碼。
 *
 * @param {Object} [convertModule] - 可注入的 OpenCC 模組
 * @returns {{degraded: boolean, degradedReason: string}} 降級狀態
 */
function probeOpenCcAvailability(convertModule) {
  const state = { degraded: false, degradedReason: "" };
  createLineConverter(state, convertModule)("");
  return state;
}

/**
 * 分析單一檔案內容，豁免行另產生 EXEMPT 候選供報告計數與授權否決。
 *
 * @param {string} relative - 相對路徑
 * @param {string} content - 檔案內容
 * @param {Object} options - 含 convert 與 protectedTerms
 * @returns {{raw: Array, exemptLines: number}} 原始候選與豁免行數
 */
function analyzeFile(relative, content, options) {
  const settings = options || {};
  const convert = settings.convert;
  const protectedTerms = settings.protectedTerms || [];
  const lines = String(content).split("\n");
  const raw = [];
  let exemptLines = 0;
  lines.forEach(function (line, index) {
    if (line.indexOf(IGNORE_MARKER) !== -1) {
      exemptLines += 1;
      raw.push(analysis.makeExemptCandidate({ file: relative, line: index + 1, lineText: line }));
      return;
    }
    const s2twText = convert(line, s2twp.CONFIG_S2TW);
    const s2twpText = convert(line, s2twp.CONFIG_S2TWP);
    analysis
      .analyzeLine({
        file: relative,
        line: index + 1,
        lineText: line,
        convertedText: s2twText,
        s2twpText: s2twpText,
        simplifiedCharacters: SIMPLIFIED_CHARACTERS,
        mainlandTerms: MAINLAND_TERMS,
        protectedTerms: protectedTerms,
        ignoreMarker: IGNORE_MARKER
      })
      .forEach(function (candidate) {
        raw.push(candidate);
      });
  });
  return { raw: raw, exemptLines: exemptLines };
}

/**
 * 遞迴收集報告系列模式的檔案與範圍外檔案。
 *
 * @param {string} [directory] - 起始目錄
 * @param {Object} [options] - 可注入的 fs 與 path
 * @returns {{files: string[], outOfScopeFiles: string[]}} 檔案與範圍外檔案
 */
function collectReportFiles(directory, options) {
  const settings = options || {};
  const fsApi = settings.fs || fs;
  const pathApi = settings.path || path;
  const root = directory || pathApi.join(__dirname, "..");
  const files = [];
  const outOfScopeFiles = [];
  function visit(current) {
    fsApi.readdirSync(current, { withFileTypes: true }).forEach(function (entry) {
      const full = pathApi.join(current, entry.name);
      const relative = pathApi.relative(root, full).replace(/\\/g, "/");
      if (isReportExcludedPath(relative)) return;
      if (entry.isDirectory()) {
        visit(full);
        return;
      }
      if (!entry.isFile() || REPORT_EXCLUDED_FILES.indexOf(relative) !== -1) return;
      if (TARGET_EXTENSIONS.has(pathApi.extname(entry.name))) files.push(relative);
      else outOfScopeFiles.push(relative);
    });
  }
  visit(root);
  return { files: files.sort(), outOfScopeFiles: outOfScopeFiles.sort() };
}

/** 報告排序：檔案 → 高信心優先 → 行號 → 欄位。 */
function compareReportEntries(a, b) {
  if (a.file !== b.file) return a.file < b.file ? -1 : 1;
  if (a.tier !== b.tier) return a.tier === candidateCore.TIER_HIGH ? -1 : 1;
  if (a.line !== b.line) return a.line - b.line;
  return a.column - b.column;
}

/**
 * 建立完整報告資料（不寫檔）。
 *
 * @param {Object} [options] - 可注入 root、fs、path、registry、module 等
 * @returns {Object} 含 entries、meta、violations 之報告資料
 */
function buildReportData(options) {
  const settings = options || {};
  const root = settings.root || path.join(__dirname, "..");
  const state = { degraded: false, degradedReason: "" };
  const convert = createLineConverter(state, settings.module);
  const protectedTermsModule = settings.protectedTermsModule || protectedTermsShell;
  const protectedTerms = getProtectedTerms({ shell: protectedTermsModule });
  const collected = collectReportFiles(root, settings);
  const rawCandidates = [];
  let exemptLines = 0;
  collected.files.forEach(function (relative) {
    const content = (settings.fs || fs).readFileSync(path.join(root, relative), "utf8");
    const result = analyzeFile(relative, content, { convert: convert, protectedTerms: protectedTerms });
    exemptLines += result.exemptLines;
    rawCandidates.push.apply(rawCandidates, result.raw);
  });
  const registry = settings.registry || approvals.loadRegistry(settings.approvalsPath);
  const literalDrift = settings.literalDrift || literalGenerator.compareWithManifest();
  const violations = checkProject(root, settings);
  const violationCount = violations.reduce(function (total, item) {
    return total + item.violations.length;
  }, 0);
  const report = analysis.buildReportEntries(rawCandidates, {
    registry: registry,
    degraded: state.degraded,
    degradedReason: state.degradedReason,
    generatedAt: new Date().toISOString(),
    literalDrift: literalDrift,
    violationCount: violationCount,
    exemptLines: exemptLines,
    protectedTermsStatus: protectedTermsModule.getStatus(),
    outOfScopeFiles: collected.outOfScopeFiles
  });
  report.entries.sort(compareReportEntries);
  report.violations = violations;
  return report;
}

/**
 * 取得寫入授權判定；受保護、豁免、空泛建議與未核准候選一律否決。
 *
 * @param {Object} entry - 候選
 * @param {Object} registry - 核准清冊
 * @returns {?Object} 授權判定，通過時回傳
 */
function getWritableDecision(entry, registry) {
  if (!entry || entry.protected === true || entry.exempt === true) return null;
  if (!entry.suggestion || entry.suggestion === "改用繁體字") return null;
  const decision = approvals.authorizeCandidate(registry, entry);
  if (decision.result !== approvals.RESULT.AUTHORIZED) return null;
  return decision;
}

/** 判斷候選是否可寫入。 */
function isWritable(entry, registry) {
  return getWritableDecision(entry, registry) !== null;
}

/**
 * 將單檔候選由右向左套用，任一不變式失敗即略過該行。
 *
 * @param {string[]} originalLines - 原始行陣列
 * @param {Object[]} entries - 該檔候選
 * @param {Object} registry - 核准清冊
 * @param {string[]} protectedTerms - 受保護詞彙
 * @returns {{lines: string[], applied: number, skipped: number}} 套用結果
 */
function applyFileFixes(originalLines, entries, registry, protectedTerms) {
  const lines = (originalLines || []).slice();
  const byLine = new Map();
  (entries || []).forEach(function (entry) {
    const decision = getWritableDecision(entry, registry);
    if (!decision) return;
    const line = Number(entry.line) || 0;
    if (!byLine.has(line)) byLine.set(line, []);
    byLine.get(line).push({ entry: entry, decision: decision });
  });
  let applied = 0;
  let skipped = 0;
  byLine.forEach(function (list, line) {
    list.sort(function (a, b) {
      return (Number(b.entry.column) || 0) - (Number(a.entry.column) || 0);
    });
    const before = lines[line - 1];
    if (typeof before !== "string") {
      skipped += list.length;
      return;
    }
    let after = before;
    list.forEach(function (item) {
      const start = Number(item.entry.column) || 0;
      const original = String(item.entry.original || "");
      if (after.slice(start, start + original.length) !== original) return;
      const replacement = String(item.decision.record.suggestion || "");
      after = after.slice(0, start) + replacement + after.slice(start + original.length);
    });
    // 保護是候選「原文」的屬性，由 authorizeCandidate() 步驟⓪-a 否決；
    // 真正簡體原文經人工核准寫入「專案」等受保護詞屬預期，不在此處二次過濾。
    const pua = protectedCore.checkPuaInvariant(before, after);
    if (after === before || !pua.ok) {
      skipped += list.length;
      return;
    }
    lines[line - 1] = after;
    applied += list.length;
  });
  return { lines: lines, applied: applied, skipped: skipped };
}

/** 建立報告項目與目前候選共用的穩定比對鍵。 */
function reportIdentityKey(item) {
  if (!item || typeof item.file !== "string" || typeof item.original !== "string") return "";
  return [item.file, item.original, String(item.occurrenceIndex)].join("\0");
}

/**
 * 讀取既有報告 JSONL；檔案不存在或首行 meta 無法解析時回空陣列並發出警告。
 * 報告僅提供定位與舊 id 做為 reportedId，所有分析欄位一律由目前原始檔重新計算。
 *
 * @param {Object} [options] - 含 root、fs、reportPath 或 outputDir
 * @returns {Array<Object>} 報告項目
 */
function loadReportEntries(options) {
  const settings = options || {};
  const fsApi = settings.fs || fs;
  const root = settings.root || path.join(__dirname, "..");
  const outputDir = settings.outputDir || DEFAULT_REPORT_DIR;
  const reportPath = settings.reportPath || path.resolve(root, outputDir, REPORT_JSONL);
  const warn = settings.error || console.error;
  let text;
  try {
    text = fsApi.readFileSync(reportPath, "utf8");
  } catch (error) {
    warn("REPORT_READ_WARNING：無法讀取既有報告，改以目前分析結果修正：" + reportPath);
    return [];
  }
  const lines = String(text)
    .replace(/^\uFEFF/, "")
    .replace(/\n$/, "")
    .split("\n");
  if (lines.length < 2 || lines[0].trim() === "") {
    warn("REPORT_READ_WARNING：既有報告為空或缺少 meta，改以目前分析結果修正：" + reportPath);
    return [];
  }
  let meta;
  try {
    meta = JSON.parse(lines[0]);
  } catch (error) {
    warn("REPORT_READ_WARNING：既有報告 meta 無法解析，改以目前分析結果修正：" + reportPath);
    return [];
  }
  if (!meta || typeof meta !== "object" || meta.type !== "meta") {
    warn("REPORT_READ_WARNING：既有報告首行不是 meta，改以目前分析結果修正：" + reportPath);
    return [];
  }
  const entries = [];
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === "") continue;
    try {
      const entry = JSON.parse(lines[index]);
      if (entry && typeof entry.id === "string") entries.push(entry);
    } catch (error) {
      warn("REPORT_READ_WARNING：略過無法解析的報告項目：" + reportPath + "#" + (index + 1));
    }
  }
  return entries;
}

/**
 * 建立修正用候選：目前分析提供所有可信任欄位，舊報告只提供 reportedId 診斷證據。
 *
 * @param {Object} [options] - 含 root、registry、reportData 與報告路徑選項
 * @returns {{candidates: Array<Object>, entries: Array<Object>, meta: Object}} 修正用資料
 */
function buildFixCandidates(options) {
  const settings = options || {};
  const root = settings.root || path.join(__dirname, "..");
  const registry = settings.registry || approvals.loadRegistry(settings.approvalsPath);
  const data = settings.reportData || buildReportData(Object.assign({ root: root }, settings, { registry: registry }));
  const oldEntries = settings.reportEntries || loadReportEntries(settings);
  const oldByIdentity = new Map();
  oldEntries.forEach(function (entry) {
    const key = reportIdentityKey(entry);
    if (key && !oldByIdentity.has(key)) oldByIdentity.set(key, entry);
  });
  const candidates = (data.candidates || []).map(function (candidate) {
    const old = oldByIdentity.get(reportIdentityKey(candidate));
    const reportedId = old && typeof old.id === "string" && old.id !== candidate.id ? old.id : "";
    return Object.assign({}, candidate, { reportedId: reportedId });
  });
  return { candidates: candidates, entries: data.entries, meta: data.meta };
}

/**
 * 執行修正模式：僅寫入核准紀錄指定的建議。
 *
 * @param {Object} [options] - 含 root、registryPath 與其他報告選項
 * @returns {{changedFiles: string[], applied: number, skipped: number}} 修正結果
 */
function applyFixes(options) {
  const settings = options || {};
  const root = settings.root || path.join(__dirname, "..");
  const fsApi = settings.fs || fs;
  const registry = settings.registry || approvals.loadRegistry(settings.approvalsPath);
  const data = buildFixCandidates(settings);
  const protectedTerms = getProtectedTerms();
  const byFile = new Map();
  data.candidates.forEach(function (candidate) {
    if (!candidate || !candidate.file) return;
    if (!byFile.has(candidate.file)) byFile.set(candidate.file, []);
    byFile.get(candidate.file).push(candidate);
  });
  const changedFiles = [];
  let applied = 0;
  let skipped = 0;
  byFile.forEach(function (entries, relative) {
    const target = path.join(root, relative);
    let original;
    try {
      original = fsApi.readFileSync(target, "utf8");
    } catch (error) {
      skipped += entries.length;
      return;
    }
    // split("\n") 與 join("\n") 互為逆運算，尾端換行會保留為最後一個空字串元素。
    const result = applyFileFixes(original.split("\n"), entries, registry, protectedTerms);
    applied += result.applied;
    skipped += result.skipped;
    if (result.applied === 0) return;
    const next = result.lines.join("\n");
    if (next === original) return;
    fsApi.writeFileSync(target, next, "utf8");
    changedFiles.push(relative);
  });
  return { changedFiles: changedFiles, applied: applied, skipped: skipped };
}

/**
 * 驗證所選建議存在於目前建議選項。
 *
 * @param {Object} entry - 報告項目
 * @param {string} source - 建議來源
 * @param {string} suggestion - 建議文字
 * @returns {boolean} 是否為有效選項
 */
function isSuggestedOption(entry, source, suggestion) {
  return (entry && entry.suggestionOptions ? entry.suggestionOptions : []).some(function (option) {
    return option && option.source === source && option.text === suggestion;
  });
}

/**
 * 執行核准或撤銷命令。
 *
 * @param {Object} parsed - parseArgs 結果
 * @param {Object} [options] - 含 root、approvalsPath 與其他報告選項
 * @returns {number} 結束碼
 */
function runApprovalCommand(parsed, options) {
  const settings = options || {};
  const log = settings.log || console.log;
  const error = settings.error || console.error;
  const registryPath = settings.approvalsPath || approvals.APPROVALS_PATH;
  const ids = parsed.ids || [];

  if (parsed.mode === "revoke") {
    const current = approvals.loadRegistry(registryPath, settings);
    const result = approvals.revokeApprovals(current, ids);
    approvals.saveRegistry(result.registry, registryPath);
    log(approvals.formatOperationResult(result));
    return result.missing.length ? 1 : 0;
  }

  const root = settings.root || path.join(__dirname, "..");
  const reportData = buildReportData(Object.assign({ root: root }, settings));
  const byId = new Map();
  reportData.entries.forEach(function (entry) {
    byId.set(entry.id, entry);
  });
  const current = approvals.loadRegistry(registryPath, settings);
  let registry = current;
  const added = [];
  const missing = [];
  const rejected = [];
  for (let index = 0; index < ids.length; index += 1) {
    const id = ids[index];
    const entry = byId.get(id);
    if (!entry) {
      missing.push(id);
      continue;
    }
    const source = ids[index + 1];
    const suggestion = ids[index + 2];
    const hasSelection = source !== undefined || suggestion !== undefined;
    if (hasSelection) {
      if (!isSuggestedOption(entry, source, suggestion)) {
        const optionsText = entry.suggestionOptions
          .map(function (option) {
            return option.source + ":" + option.text;
          })
          .join(", ");
        error("SUGGESTION_NOT_IN_OPTIONS：" + id + "；可用選項：" + optionsText);
        rejected.push(id);
        index += 2;
        continue;
      }
      index += 2;
    }
    const candidate = approvals.candidateFromReportEntry(entry);
    const result = approvals.addApprovals(
      registry,
      [candidate],
      Object.assign({}, settings, {
        suggestionSource: hasSelection ? source : candidate.suggestionSource,
        suggestion: hasSelection ? suggestion : candidate.suggestion
      })
    );
    registry = result.registry;
    added.push(result.added[0]);
  }
  if (rejected.length === 0) approvals.saveRegistry(registry, registryPath);
  const result = { added: added, missing: missing, rejected: rejected };
  log(approvals.formatOperationResult(result));
  return missing.length || rejected.length ? 1 : 0;
}

/**
 * 呈現層跳脫：逐 UTF-16 程式碼單元將非 ASCII 字元轉為 \uXXXX。
 *
 * @param {*} value - 任意值
 * @returns {string} 純 ASCII 字串
 */
function escapePresentationText(value) {
  const text = String(value === undefined || value === null ? "" : value);
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    result += code > 0x7f ? "\\u" + code.toString(16).padStart(4, "0") : text[index];
  }
  return result;
}

/**
 * Markdown 表格儲存格呈現層跳脫；所有非 ASCII 與管線符號皆不保留原文。
 *
 * @param {*} value - 任意值
 * @returns {string} 純 ASCII 儲存格文字
 */
function escapeMarkdownCell(value) {
  return escapePresentationText(value).replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * 驗證序列化後 JSONL 為純 ASCII 且 JSON.parse 可完整還原原始值。
 *
 * @param {string} jsonl - 序列化結果
 * @param {Object} meta - 原始 meta
 * @param {Array<Object>} entries - 原始項目
 * @returns {{ok: boolean, reason: string}} 驗證結果
 */
function verifySerializedJsonl(jsonl, meta, entries) {
  if (!approvals.isPureAscii(jsonl)) return { ok: false, reason: "NON_ASCII_SERIALIZATION" };
  const lines = jsonl.replace(/\n$/, "").split("\n");
  if (lines.length !== entries.length + 1) return { ok: false, reason: "JSONL_LINE_COUNT_MISMATCH" };
  if (JSON.stringify(JSON.parse(lines[0])) !== JSON.stringify(meta))
    return { ok: false, reason: "JSONL_META_MISMATCH" };
  for (let index = 0; index < entries.length; index += 1) {
    if (JSON.stringify(JSON.parse(lines[index + 1])) !== JSON.stringify(entries[index])) {
      return { ok: false, reason: "JSONL_VALUE_MISMATCH" };
    }
  }
  return { ok: true, reason: "" };
}

/**
 * 產生人讀 Markdown 摘要；整份文件皆經呈現層跳脫，故為純 ASCII。
 *
 * @param {Object} data - 報告資料
 * @returns {string} 純 ASCII Markdown
 */
function formatMarkdownReport(data) {
  const report = data || {};
  const meta = report.meta || {};
  const entries = (report.entries || []).filter(function (entry) {
    return entry && entry.exempt !== true;
  });
  const text = function (value) {
    return escapePresentationText(value);
  };
  const cell = function (value) {
    return escapeMarkdownCell(value);
  };
  const tierCounts = meta.tierCounts || {};
  const lines = [];
  lines.push("# " + text("語言檢查報告"));
  lines.push("");
  lines.push("- " + text("產生時間") + "：" + text(meta.generatedAt));
  lines.push("- " + text("硬閘門違規數") + "：" + text(meta.violationCount));
  lines.push("- " + text("候選總數") + "：" + text(meta.candidateCount));
  lines.push("- " + text("高信心候選數") + "：" + text(tierCounts.high));
  lines.push("- " + text("待核可候選數") + "：" + text(tierCounts.pending));
  lines.push("- " + text("受保護候選數") + "：" + text(meta.protectedCount));
  lines.push("- " + text("未保護候選數") + "：" + text(meta.unprotectedCount));
  lines.push("- " + text("豁免候選數") + "：" + text(meta.exemptCandidateCount));
  lines.push("- " + text("豁免行數") + "：" + text(meta.exemptLines));
  lines.push(
    "- " +
      text("OpenCC 狀態") +
      "：" +
      (meta.degraded
        ? text(OPENCC_UNAVAILABLE) + "（degraded: true）：" + text(meta.degradedReason)
        : text("正常") + "（degraded: false）")
  );
  lines.push(
    "- " + text("契約漂移") + "：" + (meta.literalDrift && meta.literalDrift.drifted ? text("有漂移") : text("無漂移"))
  );
  lines.push("- " + text("受保護清冊狀態") + "：" + text(meta.protectedTermsStatus));
  lines.push("");
  lines.push("| " + ["檔案", "行", "欄", "原文", "建議", "分層", "規則", "保護", "狀態"].map(cell).join(" | ") + " |");
  lines.push("| " + ["---", "---", "---", "---", "---", "---", "---", "---", "---"].map(cell).join(" | ") + " |");
  entries.slice(0, 500).forEach(function (entry) {
    lines.push(
      "| " +
        [
          entry.file,
          entry.line,
          entry.column,
          entry.original,
          entry.suggestion,
          entry.tier,
          entry.rule,
          entry.protected,
          entry.approvalState
        ]
          .map(cell)
          .join(" | ") +
        " |"
    );
  });
  if (entries.length > 500) {
    lines.push("");
    lines.push(cell("僅列出前 500 筆，其餘請參閱 JSONL 報告。"));
  }
  const exempt = (report.entries || []).filter(function (entry) {
    return entry && entry.exempt === true;
  });
  if (exempt.length > 0) {
    lines.push("", "<details>", "<summary>" + cell("豁免行") + "</summary>", "");
    exempt.forEach(function (entry) {
      lines.push("- `" + cell(entry.file) + ":" + cell(entry.line) + "`");
    });
    lines.push("", "</details>");
  }
  return escapePresentationText(lines.join("\n") + "\n");
}

/**
 * 寫出 JSONL 與 Markdown 報告。
 *
 * @param {Object} data - 報告資料
 * @param {string} [outputDir] - 輸出目錄
 * @param {Object} [options] - 可注入 fs
 * @returns {{bytes: number, jsonlPath: string, mdPath: string}} 寫入結果
 * @throws {Error} 驗證或寫入失敗時拋出 REPORT_WRITE_FAILED
 */
function writeReport(data, outputDir, options) {
  const settings = options || {};
  const fsApi = settings.fs || fs;
  const dir = path.resolve(outputDir || DEFAULT_REPORT_DIR);
  try {
    fsApi.mkdirSync(dir, { recursive: true });
    const meta = Object.assign({ type: "meta" }, (data && data.meta) || {});
    const entries = (data && data.entries) || [];
    const jsonlRaw =
      [JSON.stringify(meta)]
        .concat(
          entries.map(function (entry) {
            return JSON.stringify(entry);
          })
        )
        .join("\n") + "\n";
    const jsonl = approvals.escapeNonAscii(jsonlRaw);
    const verified = verifySerializedJsonl(jsonl, meta, entries);
    if (!verified.ok) {
      const wrapped = new Error(verified.reason);
      wrapped.code = verified.reason;
      throw wrapped;
    }
    const markdown = formatMarkdownReport(data);
    if (!approvals.isPureAscii(markdown)) {
      const wrapped = new Error("NON_ASCII_MARKDOWN");
      wrapped.code = "NON_ASCII_MARKDOWN";
      throw wrapped;
    }
    const jsonlPath = path.join(dir, REPORT_JSONL);
    const mdPath = path.join(dir, REPORT_MD);
    fsApi.writeFileSync(jsonlPath, jsonl, "ascii");
    fsApi.writeFileSync(mdPath, markdown, "ascii");
    return {
      bytes: Buffer.byteLength(jsonl, "ascii") + Buffer.byteLength(markdown, "ascii"),
      jsonlPath: jsonlPath,
      mdPath: mdPath
    };
  } catch (error) {
    const wrapped = new Error("報告寫入失敗：" + error.message);
    wrapped.code = REPORT_WRITE_FAILED;
    throw wrapped;
  }
}

/**
 * 檢查報告輸出目錄是否位於專案根目錄內，且最近既有祖先解析後未逃逸。
 *
 * @param {string} outputDir - 輸出目錄
 * @param {string} root - 專案根目錄
 * @param {Object} [options] - 可注入 fs
 * @returns {boolean} 是否安全
 */
function isReportOutputDirSafe(outputDir, root, options) {
  const settings = options || {};
  const fsApi = settings.fs || fs;
  const exists = fsApi.existsSync || fs.existsSync;
  const realpath = fsApi.realpathSync || fs.realpathSync;
  const base = path.resolve(root || path.join(__dirname, ".."));
  const target = path.resolve(base, String(outputDir || ""));
  const relative = path.relative(base, target);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) return false;

  let ancestor = target;
  while (!exists(ancestor)) {
    const parent = path.dirname(ancestor);
    if (parent === ancestor) return false;
    ancestor = parent;
  }
  let realAncestor;
  let realBase;
  try {
    realAncestor = realpath(ancestor);
    realBase = realpath(base);
  } catch (error) {
    return false;
  }
  const realRelative = path.relative(realBase, realAncestor);
  if (realRelative === ".." || realRelative.startsWith(".." + path.sep) || path.isAbsolute(realRelative)) return false;
  return true;
}

/** 解析命令列參數，模式優先序固定。 */
function parseArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const mode = args.includes("--report")
    ? "report"
    : args.includes("--dry-run")
      ? "dry-run"
      : args.includes("--fix")
        ? "fix"
        : args.includes("--approve")
          ? "approve"
          : args.includes("--revoke")
            ? "revoke"
            : "default";
  let outputDir = "";
  const ids = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--output") {
      outputDir = args[index + 1] || "";
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) continue;
    ids.push(arg);
  }
  return { mode: mode, outputDir: outputDir, ids: ids };
}

/**
 * 印出既有格式違規清單，回傳違規總數。
 *
 * @param {Array} results - checkProject 結果
 * @param {Function} log - 輸出函式
 * @returns {number} 違規總數
 */
function printViolations(results, log) {
  const output = log || console.log;
  let total = 0;
  (results || []).forEach(function (item) {
    output("\n### " + item.file + "（" + item.violations.length + " 項）");
    item.violations.slice(0, 50).forEach(function (v) {
      output("  " + v.line + " 行 [" + v.kind + "] " + v.value + " → " + v.suggestion + "：「" + v.text + "」");
    });
    if (item.violations.length > 50) {
      output("  ... 其餘 " + (item.violations.length - 50) + " 項省略");
    }
    total += item.violations.length;
  });
  return total;
}

/**
 * 命令列入口：預設硬閘門，其餘模式由後續章節分派。
 *
 * @param {Array<string>} [argv] - 命令列參數
 * @param {Object} [options] - 可注入 log、error、root 等
 * @returns {number} 結束碼
 */
function main(argv, options) {
  const args = Array.isArray(argv) ? argv : process.argv.slice(2);
  const settings = options || {};
  const log = settings.log || console.log;
  const error = settings.error || console.error;
  const parsed = parseArgs(args);

  if (parsed.mode === "report") {
    const root = settings.root || path.join(__dirname, "..");
    const outputDir = parsed.outputDir || DEFAULT_REPORT_DIR;
    if (!isReportOutputDirSafe(outputDir, root, settings)) {
      error(REPORT_WRITE_FAILED + "：報告輸出目錄必須位於專案根目錄內");
      log(JSON.stringify({ ok: false, code: REPORT_WRITE_FAILED, bytes: 0 }));
      return 0;
    }
    const data = settings.reportData || buildReportData(Object.assign({ root: root }, settings));
    try {
      const written = writeReport(data, outputDir, settings);
      log(JSON.stringify({ ok: true, code: "REPORT_OK", bytes: written.bytes }));
    } catch (caught) {
      error(REPORT_WRITE_FAILED + "：" + caught.message);
      log(JSON.stringify({ ok: false, code: REPORT_WRITE_FAILED, bytes: 0 }));
    }
    return 0;
  }

  if (parsed.mode === "default" || parsed.mode === "dry-run") {
    probeOpenCcAvailability(settings.module);
    const results = checkProject(settings.root, settings);
    const total = printViolations(results, log);
    if (parsed.mode === "dry-run") log("\n[乾跑模式] 僅輸出不寫入。");
    if (total > 0) {
      error("\n✗ 語言規範檢查失敗：共 " + total + " 項違規");
      return 1;
    }
    log("✓ 全專案皆為臺灣繁體中文，未發現簡體字與中國用語。");
    return 0;
  }

  if (parsed.mode === "fix") {
    const result = applyFixes(settings);
    const remaining = checkProject(settings.root, settings);
    const total = printViolations(remaining, log);
    if (total > 0) {
      error("\n✗ 語言規範檢查失敗：共 " + total + " 項違規");
      return 1;
    }
    log("✓ 修正完成，共寫入 " + result.changedFiles.length + " 個檔案。");
    return 0;
  }

  if (parsed.mode === "approve" || parsed.mode === "revoke") {
    return runApprovalCommand(parsed, settings);
  }

  error("尚未支援的模式：" + parsed.mode);
  return 1;
}

if (require.main === module) {
  process.exitCode = main();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SIMPLIFIED_CHARACTERS: SIMPLIFIED_CHARACTERS,
    MAINLAND_TERMS: MAINLAND_TERMS,
    IGNORE_MARKER: IGNORE_MARKER,
    EXCLUDED_DIRECTORIES: EXCLUDED_DIRECTORIES,
    REPORT_EXCLUDED_PATH_PREFIXES: REPORT_EXCLUDED_PATH_PREFIXES,
    REPORT_EXCLUDED_FILES: REPORT_EXCLUDED_FILES,
    REPORT_JSONL: REPORT_JSONL,
    REPORT_MD: REPORT_MD,
    REPORT_WRITE_FAILED: REPORT_WRITE_FAILED,
    OPENCC_UNAVAILABLE: OPENCC_UNAVAILABLE,
    DEFAULT_REPORT_DIR: DEFAULT_REPORT_DIR,
    isReportExcludedPath: isReportExcludedPath,
    checkContent: checkContent,
    collectFiles: collectFiles,
    checkProject: checkProject,
    getProtectedTerms: getProtectedTerms,
    createLineConverter: createLineConverter,
    probeOpenCcAvailability: probeOpenCcAvailability,
    analyzeFile: analyzeFile,
    collectReportFiles: collectReportFiles,
    compareReportEntries: compareReportEntries,
    buildReportData: buildReportData,
    escapePresentationText: escapePresentationText,
    escapeMarkdownCell: escapeMarkdownCell,
    verifySerializedJsonl: verifySerializedJsonl,
    formatMarkdownReport: formatMarkdownReport,
    writeReport: writeReport,
    isReportOutputDirSafe: isReportOutputDirSafe,
    getWritableDecision: getWritableDecision,
    isWritable: isWritable,
    reportIdentityKey: reportIdentityKey,
    loadReportEntries: loadReportEntries,
    buildFixCandidates: buildFixCandidates,
    applyFileFixes: applyFileFixes,
    applyFixes: applyFixes,
    isSuggestedOption: isSuggestedOption,
    runApprovalCommand: runApprovalCommand,
    parseArgs: parseArgs,
    printViolations: printViolations,
    main: main
  };
}
