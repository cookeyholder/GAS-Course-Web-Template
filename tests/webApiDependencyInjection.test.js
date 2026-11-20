"use strict";

/**
 * webApiDependencyInjection.test.js（task 3.2）
 *
 * 以靜態掃描驗證 webApi.js 的注入白名單與實際使用雙向一致：
 * - 正向：每個注入名稱至少在 webApi.js 中被使用一次（直接呼叫或作為
 *   resolveRouteDependency_ 的 fallback），避免注入死碼。
 * - 反向：每個被呼叫的外部注入函式（databaseInitializer／
 *   subjectCodeTransformer 的匯出）皆已列入注入白名單，避免遺漏。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const webApiSource = fs.readFileSync(path.join(root, "webApi.js"), "utf8");
console.log("開始執行 webApiDependencyInjection 測試...\n");

/**
 * 從 injectGlobals_ 呼叫中抽取注入白名單。
 *
 * @param {string} source - webApi.js 原始碼
 * @returns {Array<string>} 注入名稱清單
 */
function extractInjectedNames(source) {
  const names = [];
  const re = /GAS_RUNTIME\.injectGlobals_\(\s*"[^"]+"\s*,\s*\[([\s\S]*?)\]\)/g;
  let match;
  while ((match = re.exec(source)) !== null) {
    const listRe = /"([^"]+)"/g;
    let nameMatch;
    while ((nameMatch = listRe.exec(match[1])) !== null) names.push(nameMatch[1]);
  }
  return names;
}

/**
 * 計算名稱在原始碼中被「使用」的次數，排除注入白名單宣告本身。
 * 使用形式包含：直接呼叫 name(、resolveRouteDependency_("name", name)。
 *
 * @param {string} source - webApi.js 原始碼
 * @param {string} name - 相依名稱
 * @returns {number} 使用次數
 */
function countUsages(source, name) {
  const withoutWhitelist = source.replace(/GAS_RUNTIME\.injectGlobals_\([\s\S]*?\]\)/g, "");
  // 兩種使用形式：直接呼叫 name(，以及作為 resolveRouteDependency_ 的 fallback 參數
  // resolveRouteDependency_("name", name)；後者後面接 ) 或 ,，不會被前者重複計入。
  const callRe = new RegExp("\\b" + name + "\\s*\\(", "g");
  const fallbackRe = new RegExp('resolveRouteDependency_\\(\\s*"' + name + '"\\s*,\\s*' + name + "\\b", "g");
  let count = 0;
  let match;
  while ((match = callRe.exec(withoutWhitelist)) !== null) count += 1;
  while ((match = fallbackRe.exec(withoutWhitelist)) !== null) count += 1;
  return count;
}

const injected = extractInjectedNames(webApiSource);

console.log("1. 注入白名單應恰為 11 個活躍名稱...\n");
{
  const expected = [
    "normalizeRole",
    "getRoleDisplayName",
    "readSystemSettings",
    "saveSystemSettings",
    "readWhitelist",
    "saveWhitelist",
    "getAccountRole",
    "bootstrapAdminIfNeeded",
    "importNormalizedCourseCodes",
    "getNormalizedCourses",
    "getCourseIndexStats"
  ];
  assert.deepStrictEqual(injected.slice().sort(), expected.slice().sort(), "注入白名單與預期不符");
  const removed = ["initializeDatabaseSheets", "safeApplySheetFontSize", "safeSetNumberFormat", "sanitizeRowMatrix"];
  removed.forEach(function (name) {
    assert.strictEqual(injected.indexOf(name), -1, "不應再注入死碼：" + name);
  });
  console.log("   ✓ 白名單內容驗證通過！\n");
}

console.log("2. 雙向一致性：每個注入名稱至少被使用一次...\n");
{
  const unused = injected.filter(function (name) {
    return countUsages(webApiSource, name) === 0;
  });
  assert.deepStrictEqual(unused, [], "下列注入名稱從未被使用：" + unused.join(", "));
  console.log("   ✓ 正向一致性驗證通過！\n");
}

console.log("3. 反向一致性：被呼叫的外部函式皆已注入...\n");
{
  // databaseInitializer 與 subjectCodeTransformer 中，webApi 可能呼叫的匯出
  const externalExports = require("../databaseInitializer.js");
  const transformerExports = require("../subjectCodeTransformer.js");
  const candidates = Object.keys(externalExports).concat(Object.keys(transformerExports));
  const missing = candidates.filter(function (name) {
    const usedInWebApi = countUsages(webApiSource, name) > 0;
    const isInternal = /^_/.test(name);
    const isConstant = /^[A-Z_]+$/.test(name);
    return usedInWebApi && !isInternal && !isConstant && injected.indexOf(name) === -1;
  });
  assert.deepStrictEqual(missing, [], "下列外部函式被呼叫但未注入：" + missing.join(", "));
  console.log("   ✓ 反向一致性驗證通過！\n");
}

console.log("✓ webApiDependencyInjection.test.js 測試全數通過！\n");
