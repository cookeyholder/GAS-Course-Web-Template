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
 */

const fs = require("fs");
const path = require("path");

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

/** 略過掃描之目錄 */
const EXCLUDED_DIRECTORIES = new Set(["node_modules", "coverage", ".git", "dist", ".clasp", ".codegraph", "openspec"]);

/**
 * 略過掃描之檔案。
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
 * 遞迴收集專案中需要檢查的檔案。
 *
 * @param {string} [directory] - 起始目錄，預設為專案根目錄
 * @returns {string[]} 相對於專案根目錄之檔案路徑
 */
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
 * 命令列入口：印出所有違規並以結束碼 1 表示失敗。
 *
 * @returns {number} 結束碼
 */
function main() {
  const results = checkProject();
  let total = 0;
  results.forEach(function (item) {
    console.log("\n### " + item.file + "（" + item.violations.length + " 項）");
    item.violations.slice(0, 50).forEach(function (v) {
      console.log("  " + v.line + " 行 [" + v.kind + "] " + v.value + " → " + v.suggestion + "：「" + v.text + "」");
    });
    if (item.violations.length > 50) {
      console.log("  ... 其餘 " + (item.violations.length - 50) + " 項省略");
    }
    total += item.violations.length;
  });
  if (total > 0) {
    console.error("\n✗ 語言規範檢查失敗：共 " + total + " 項違規");
    return 1;
  }
  console.log("✓ 全專案皆為臺灣繁體中文，未發現簡體字與中國用語。");
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    SIMPLIFIED_CHARACTERS: SIMPLIFIED_CHARACTERS,
    MAINLAND_TERMS: MAINLAND_TERMS,
    IGNORE_MARKER: IGNORE_MARKER,
    checkContent: checkContent,
    collectFiles: collectFiles,
    checkProject: checkProject,
    main: main
  };
}
