"use strict";

/**
 * `.claspignore` 部署放行規則契約測試。
 *
 * 驗證 Web App 離線手冊 HTML 仍可部署，而 Node 工具鏈模組、OpenCC 外殼、
 * 語言報告構件與新增 Markdown 文件不會被上傳至 GAS。
 *
 * 比對器僅支援本專案 `.claspignore` 實際使用的規則型態
 * （全域通配、否定前綴、無斜線檔名、目錄前綴、docs 目錄通配、
 * docs 下所有 HTML 與 scripts 下 OpenCC 前置檔名），
 * 並依「最後一筆符合規則勝出」的 gitignore 語意運作。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const webApi = require("../webApi.js");

const PROJECT_ROOT = path.join(__dirname, "..");
const RULES = parseIgnoreRules(fs.readFileSync(path.join(PROJECT_ROOT, ".claspignore"), "utf8"));

console.log("開始執行 clasp 部署放行規則契約測試...\n");

/**
 * 解析 `.claspignore` 為規則序列。
 *
 * @param {string} text - 檔案內容
 * @returns {Array<{negated: boolean, pattern: string}>} 規則序列
 */
function parseIgnoreRules(text) {
  return String(text)
    .split(/\r?\n/)
    .map(function (line) {
      return line.trim();
    })
    .filter(function (line) {
      return line.length > 0 && line.charAt(0) !== "#";
    })
    .map(function (line) {
      return line.charAt(0) === "!" ? { negated: true, pattern: line.slice(1) } : { negated: false, pattern: line };
    });
}

/**
 * 判斷單一規則是否比對檔案路徑。
 *
 * @param {{negated: boolean, pattern: string}} rule - 規則
 * @param {string} file - 相對路徑
 * @returns {boolean} 是否比對
 */
function matchesRule(rule, file) {
  const pattern = rule.pattern;
  const normalized = String(file).replace(/\\/g, "/");
  const base = normalized.slice(normalized.lastIndexOf("/") + 1);

  if (pattern === "**") return true;
  if (pattern === "docs/**") return normalized.indexOf("docs/") === 0;
  if (pattern === "docs/**/*.html") {
    return normalized.indexOf("docs/") === 0 && normalized.endsWith(".html");
  }
  if (pattern === "scripts/opencc*.js") {
    return normalized.indexOf("scripts/opencc") === 0 && normalized.endsWith(".js");
  }
  if (pattern.endsWith("/")) {
    const prefix = pattern.slice(0, -1);
    // 否定目錄規則僅取消目錄本身的忽略，不自動放行其內容；
    // 正向目錄規則則同時忽略目錄與其內容。
    if (rule.negated) return normalized === prefix;
    return normalized === prefix || normalized.indexOf(prefix + "/") === 0;
  }
  if (pattern.indexOf("/") === -1) {
    if (pattern.charAt(0) === "*") return base.endsWith(pattern.slice(1));
    return base === pattern;
  }
  return normalized === pattern || normalized.indexOf(pattern + "/") === 0;
}

/**
 * 依規則序列判斷檔案是否被上傳。
 *
 * @param {string} file - 相對路徑
 * @returns {boolean} 是否在上傳集合
 */
function isUploaded(file) {
  let ignored = false;
  RULES.forEach(function (rule) {
    if (matchesRule(rule, file)) {
      ignored = !rule.negated;
    }
  });
  return !ignored;
}

console.log("1. 放行規則應只包含白名單 HTML，不再放行所有 docs 檔案...");
{
  const patterns = RULES.map(function (rule) {
    return rule.pattern;
  });
  assert.ok(patterns.includes("docs/"), "應放行 docs 目錄");
  assert.ok(patterns.includes("docs/**/*.html"), "應僅放行 HTML");
  assert.ok(!patterns.includes("docs/**"), "不得放行 docs 下所有檔案");
  console.log("   ✓ 放行規則驗證通過！\n");
}

console.log("2. 七個白名單 HTML 仍在上傳集合...");
{
  const routes = Object.keys(webApi.WEB_APP_DOC_ROUTES);
  assert.strictEqual(routes.length, 7, "白名單應恰為 7 個路由");
  routes.forEach(function (route) {
    assert.ok(isUploaded(route), route + " 應在上傳集合");
  });
  console.log("   ✓ 白名單 HTML 驗證通過！\n");
}

console.log("3. Node 專用模組、OpenCC 外殼與報告構件不在上傳集合...");
{
  const excluded = [
    "quality-core/openccStableId.js",
    "scripts/openccS2twp.js",
    "scripts/openccS2twpApprovals.json",
    "artifacts/language-report.jsonl"
  ];
  excluded.forEach(function (file) {
    assert.ok(!isUploaded(file), file + " 不得在上傳集合");
  });
  console.log("   ✓ Node 專用模組排除驗證通過！\n");
}

console.log("4. Markdown、PDF、CSV 與核閱文件不在上傳集合...");
{
  const excluded = [
    "docs/參考資料/opencc/SOURCES.md",
    "docs/opencc-s2twp-review.md",
    "docs/quality-baseline-2026-11-20.md",
    "docs/manual.pdf",
    "docs/records.csv"
  ];
  excluded.forEach(function (file) {
    assert.ok(!isUploaded(file), file + " 不得在上傳集合");
  });
  console.log("   ✓ 非 HTML 文件排除驗證通過！\n");
}

console.log("5. 必要後端檔案與打包產物仍在上傳集合...");
{
  ["appsscript.json", "index.html", "main.js", "webApi.js", "scripts/build-webapp.js"].forEach(function (file) {
    assert.ok(isUploaded(file), file + " 應在上傳集合");
  });
  console.log("   ✓ 必要檔案驗證通過！\n");
}

console.log("6. 打包產物不得含 OpenCC 字樣...");
{
  const html = fs.readFileSync(path.join(PROJECT_ROOT, "index.html"), "utf8");
  assert.ok(!/opencc/i.test(html), "index.html 不得出現 OpenCC 字樣");
  console.log("   ✓ 打包產物驗證通過！\n");
}

console.log("✓ clasp 部署放行規則契約測試全數通過！\n");
