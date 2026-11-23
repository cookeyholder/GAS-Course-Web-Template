"use strict";

/**
 * @file generateOpenccS2twpContractLiterals.js
 * @description 以 AST 靜態解析 tests/** 之中文字串與正規表達式字面值，
 *              產生版控契約字面值清冊。含豁免註解或 Unicode 跳脫
 *              之負面測試字面值一概排除，避免契約清冊成為萬用豁免。
 *              本模組僅供 Node 工具鏈使用。
 */

const fs = require("fs");
const path = require("path");
const parser = require("@babel/parser");
const drift = require("../quality-core/openccContractDrift.js");

/** 專案根目錄 */
const ROOT = path.join(__dirname, "..");

/** 測試目錄 */
const TESTS_DIR = path.join(ROOT, "tests");

/** 清冊輸出路徑 */
const OUTPUT_PATH = path.join(__dirname, "openccS2twpContractLiterals.json");

/** 行內豁免註解 */
const IGNORE_MARKER = "language-check: ignore";

/** 清冊格式版本 */
const VERSION = 1;

/** 中文字元範圍 */
const CJK_PATTERN = /[\u3400-\u9fff]/u;

/** Unicode／十六進位跳脫序列 */
const ESCAPE_PATTERN = /(^|[^\\])\\u[0-9a-fA-F]{4}|(^|[^\\])\\x[0-9a-fA-F]{2}/;

/** 不遍歷之 AST 欄位 */
const SKIP_KEYS = new Set(["loc", "extra", "start", "end", "leadingComments", "trailingComments", "innerComments"]);

/**
 * @description 遞迴收集測試目錄下所有 .js 檔案。
 * @param {string} [directory] - 起始目錄
 * @returns {string[]} 排序後之檔案絕對路徑
 */
function collectTestFiles(directory) {
  const root = directory || TESTS_DIR;
  if (!fs.existsSync(root)) return [];
  const files = [];
  fs.readdirSync(root, { withFileTypes: true }).forEach(function (entry) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push.apply(files, collectTestFiles(full));
      return;
    }
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(full);
  });
  return files.sort();
}

/**
 * @description 判斷字串是否含中文字元。
 * @param {string} value - 字串
 * @returns {boolean} 是否含中文
 */
function containsCjk(value) {
  return typeof value === "string" && CJK_PATTERN.test(value);
}

/**
 * @description 判斷字面值原始碼是否使用 Unicode／十六進位跳脫（負面測試字面值）。
 * @param {string} raw - 字面值原始碼
 * @returns {boolean} 是否為跳脫字面值
 */
function isEscapedLiteral(raw) {
  return typeof raw === "string" && ESCAPE_PATTERN.test(raw);
}

/**
 * @description 取得 AST 節點所在行是否標註豁免註解。
 * @param {Object} node - AST 節點
 * @param {string[]} lines - 原始碼分行陣列
 * @returns {boolean} 是否豁免
 */
function isIgnoredLine(node, lines) {
  if (!node || !node.loc || !node.loc.start) return false;
  const sourceLine = lines[node.loc.start.line - 1] || "";
  return sourceLine.includes(IGNORE_MARKER);
}

/**
 * @description 取得字面值原始碼字串。
 * @param {Object} node - AST 節點
 * @returns {string} 原始碼表示
 */
function getRaw(node) {
  return node.extra && typeof node.extra.raw === "string" ? node.extra.raw : "";
}

/**
 * @description 從單一 AST 節點遞迴提取符合條件之字面值。
 * @param {*} node - AST 節點
 * @param {string[]} lines - 原始碼分行陣列
 * @param {Set<string>} found - 收集結果
 * @returns {void}
 */
function visitNode(node, lines, found) {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    node.forEach(function (child) {
      visitNode(child, lines, found);
    });
    return;
  }
  if (typeof node.type !== "string") return;
  const raw = getRaw(node);
  if (
    node.type === "StringLiteral" &&
    !isIgnoredLine(node, lines) &&
    !isEscapedLiteral(raw) &&
    containsCjk(node.value)
  ) {
    found.add(node.value);
  }
  if (node.type === "RegExpLiteral") {
    const pattern = node.pattern || (node.regex && node.regex.pattern) || "";
    if (!isIgnoredLine(node, lines) && !isEscapedLiteral(raw) && containsCjk(pattern)) found.add(pattern);
  }
  Object.keys(node).forEach(function (key) {
    if (SKIP_KEYS.has(key)) return;
    visitNode(node[key], lines, found);
  });
}

/**
 * @description 解析單一測試檔並提取契約字面值；解析失敗時記錄至 parseFailures。
 * @param {string} file - 檔案路徑
 * @param {Array<{file: string, message: string}>} [parseFailures] - 解析失敗紀錄
 * @returns {string[]} 字面值陣列
 */
function extractFromFile(file, parseFailures) {
  const source = fs.readFileSync(file, "utf8");
  let ast;
  try {
    ast = parser.parse(source, { sourceType: "unambiguous" });
  } catch (error) {
    if (Array.isArray(parseFailures)) parseFailures.push({ file: file, message: error.message });
    return [];
  }
  const found = new Set();
  visitNode(ast, source.split(/\r?\n/), found);
  return Array.from(found);
}

/**
 * @description 收集整份測試目錄之契約字面值，去除重複後排序。
 * @param {string} [testsDir] - 測試目錄
 * @returns {string[]} 排序後字面值陣列
 */
function collectContractLiterals(testsDir) {
  return collectContractLiteralsWithStatus(testsDir).literals;
}

/**
 * @description 收集契約字面值並回報解析失敗，避免 AST 解析錯誤被靜默吞沒。
 * @param {string} [testsDir] - 測試目錄
 * @returns {{literals: string[], parseFailures: Array<{file: string, message: string}>}} 收集結果
 */
function collectContractLiteralsWithStatus(testsDir) {
  const found = new Set();
  const parseFailures = [];
  collectTestFiles(testsDir).forEach(function (file) {
    extractFromFile(file, parseFailures).forEach(function (literal) {
      found.add(literal);
    });
  });
  return { literals: Array.from(found).sort(), parseFailures: parseFailures };
}

/**
 * @description 讀取版控清冊。
 * @param {string} [outputPath] - 清冊路徑
 * @returns {string[]} 字面值陣列
 */
function readManifest(outputPath) {
  const target = outputPath || OUTPUT_PATH;
  try {
    const data = JSON.parse(fs.readFileSync(target, "utf8"));
    return Array.isArray(data.literals) ? data.literals : [];
  } catch (error) {
    return [];
  }
}

/**
 * @description 將字面值寫入版控清冊。
 * @param {string[]} literals - 字面值陣列
 * @param {string} [outputPath] - 清冊路徑
 * @returns {number} 寫入位元組數
 */
function writeManifest(literals, outputPath) {
  const target = outputPath || OUTPUT_PATH;
  const content = JSON.stringify({ version: VERSION, literals: literals }, null, 2) + "\n";
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  return Buffer.byteLength(content, "utf8");
}

/**
 * @description 比對目前字面值與版控清冊之漂移。
 * @param {string[]} [current] - 目前字面值
 * @param {string[]} [manifest] - 版控清冊
 * @returns {{drifted: boolean, added: string[], removed: string[]}} 漂移結果
 */
function compareWithManifest(current, manifest) {
  return drift.compareContractLiterals(
    manifest === undefined ? readManifest() : manifest,
    current === undefined ? collectContractLiterals() : current
  );
}

/**
 * @description 命令列入口。--check 比對漂移，解析失敗或大量移除時回非零結束碼。
 * @param {string[]} [argv] - 命令列參數
 * @param {Object} [options] - 可注入測試目錄、清冊路徑與輸出函式
 * @returns {number} 結束碼
 */
function main(argv, options) {
  const settings = options || {};
  const args = Array.isArray(argv) ? argv : process.argv.slice(2);
  const outputPath = settings.outputPath || OUTPUT_PATH;
  const log = settings.log || console.log;
  const error = settings.error || console.error;
  const status = collectContractLiteralsWithStatus(settings.testsDir || TESTS_DIR);
  const current = status.literals;
  status.parseFailures.forEach(function (failure) {
    error("::warning::契約字面值解析失敗：" + path.relative(ROOT, failure.file) + "：" + failure.message);
  });
  if (args.includes("--check")) {
    const manifest = readManifest(outputPath);
    const result = compareWithManifest(current, manifest);
    log(drift.formatDriftWarning(result) || "契約字面值清冊無漂移。");
    log("目前字面值筆數：" + current.length);
    if (status.parseFailures.length > 0) return 1;
    const removalThreshold = Math.max(10, Math.ceil(manifest.length * 0.05));
    if (result.removed.length > removalThreshold) {
      error(
        "::warning::契約字面值大量移除 " +
          result.removed.length +
          " 筆（閾值 " +
          removalThreshold +
          "），請確認測試檔是否解析異常。"
      );
      return 1;
    }
    return 0;
  }
  if (status.parseFailures.length > 0) return 1;
  const bytes = writeManifest(current, outputPath);
  log(
    "已產生契約字面值清冊：" + path.relative(ROOT, outputPath) + "（" + current.length + " 筆，" + bytes + " 位元組）"
  );
  return 0;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  OUTPUT_PATH: OUTPUT_PATH,
  IGNORE_MARKER: IGNORE_MARKER,
  VERSION: VERSION,
  collectTestFiles: collectTestFiles,
  containsCjk: containsCjk,
  isEscapedLiteral: isEscapedLiteral,
  isIgnoredLine: isIgnoredLine,
  getRaw: getRaw,
  visitNode: visitNode,
  extractFromFile: extractFromFile,
  collectContractLiterals: collectContractLiterals,
  collectContractLiteralsWithStatus: collectContractLiteralsWithStatus,
  readManifest: readManifest,
  writeManifest: writeManifest,
  compareWithManifest: compareWithManifest,
  main: main
};
