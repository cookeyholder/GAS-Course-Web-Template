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
    parseArgs: parseArgs,
    printViolations: printViolations,
    main: main
  };
}
