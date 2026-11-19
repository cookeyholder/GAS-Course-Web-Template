"use strict";

/**
 * @file checkUiClasses.js
 * @description 檢查前端 JavaScript 產生的 class 是否皆有對應的 CSS 定義，
 *              避免 UI 元件的 class 與樣式表失聯而失去外觀（task 3.1）。
 *
 * 同時支援 DOM 字串（`class="..."`）、`className = "..."` 與
 * `classList.add/remove/toggle("...")` 三種來源。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CSS_RELATIVE_PATH = path.join("webapp", "styles.css");
const JS_RELATIVE_DIR = path.join("webapp", "js");
const CLASS_NAME_PATTERN = /^[A-Za-z][\w-]*$/;

/**
 * 從 CSS 文字收集所有已定義的 class 名稱。
 *
 * @param {string} cssText - styles.css 內容
 * @returns {Set<string>} 已定義 class 集合
 */
function collectDefinedClasses(cssText) {
  const withoutComments = String(cssText).replace(/\/\*[\s\S]*?\*\//g, "");
  const defined = new Set();
  const selectorPattern = /\.([A-Za-z][\w-]*)/g;
  let match = null;
  while ((match = selectorPattern.exec(withoutComments)) !== null) {
    defined.add(match[1]);
  }
  return defined;
}

/**
 * 從單一 JavaScript 檔案收集所有使用到的 class 名稱。
 *
 * @param {string} jsText - JavaScript 原始碼
 * @returns {Set<string>} 使用中的 class 集合
 */
function collectUsedClasses(jsText) {
  const used = new Set();
  const source = String(jsText);

  function addClassNames(rawValue) {
    String(rawValue)
      .split(/\s+/)
      .forEach(function (className) {
        if (CLASS_NAME_PATTERN.test(className)) used.add(className);
      });
  }

  const patterns = [
    /class=\\?["']([^"']+)['"]/g,
    /className\s*=\s*["']([^"']+)["']/g,
    /classList\.(?:add|toggle|remove)\(\s*["']([^"']+)["']/g
  ];

  patterns.forEach(function (pattern) {
    let match = null;
    while ((match = pattern.exec(source)) !== null) {
      addClassNames(match[1]);
    }
  });

  return used;
}

/**
 * 找出所有沒有 CSS 定義的前端 class。
 *
 * @param {Object} [options] - 選項（root 可覆寫專案根目錄，供測試注入）
 * @returns {Array<{className: string, files: string[]}>} 缺失項目清單
 */
function findMissingClasses(options) {
  const settings = options || {};
  const root = settings.root || ROOT;
  const cssPath = path.join(root, CSS_RELATIVE_PATH);
  const jsDir = path.join(root, JS_RELATIVE_DIR);

  const defined = collectDefinedClasses(fs.readFileSync(cssPath, "utf8"));
  const usedByClass = new Map();

  fs.readdirSync(jsDir)
    .filter(function (fileName) {
      return fileName.endsWith(".js");
    })
    .forEach(function (fileName) {
      collectUsedClasses(fs.readFileSync(path.join(jsDir, fileName), "utf8")).forEach(function (className) {
        if (!usedByClass.has(className)) usedByClass.set(className, new Set());
        usedByClass.get(className).add(fileName);
      });
    });

  return Array.from(usedByClass.entries())
    .filter(function (entry) {
      return !defined.has(entry[0]);
    })
    .map(function (entry) {
      return { className: entry[0], files: Array.from(entry[1]).sort() };
    })
    .sort(function (a, b) {
      return a.className.localeCompare(b.className);
    });
}

function main() {
  const missing = findMissingClasses();
  if (missing.length === 0) {
    console.log("[checkUiClasses] 所有前端 class 皆有 CSS 定義，檢查通過。");
    return;
  }

  console.error("[checkUiClasses] 發現 " + missing.length + " 個未定義 class：");
  missing.forEach(function (item) {
    console.error("  - " + item.className + " : " + item.files.join(", "));
  });
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  collectDefinedClasses: collectDefinedClasses,
  collectUsedClasses: collectUsedClasses,
  findMissingClasses: findMissingClasses
};
