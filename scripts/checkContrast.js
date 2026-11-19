#!/usr/bin/env node
"use strict";

/**
 * @file checkContrast.js
 * @description 驗證 styles.css 的次要文字（--ink-3）與焦點環（--focus-ring）符合 WCAG AA 對比
 *              （task 3.5）。淺色文字對比至少 4.5:1，焦點指標至少 3:1。
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CSS_PATH = path.join(ROOT, "webapp", "styles.css");

const LIGHT_TEXT_MIN = 4.5;
const FOCUS_MIN = 3;
const HEX_PATTERN = /^#([0-9a-f]{6})$/i;
const VAR_PATTERN = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i;

/**
 * 將 6 碼十六進位色轉為相對亮度。
 *
 * @param {string} value - 十六進位顏色
 * @returns {number|null} 相對亮度或 null
 */
function relativeLuminance(value) {
  const match = HEX_PATTERN.exec(String(value || "").trim());
  if (!match) return null;
  const channels = [0, 2, 4].map(function (index) {
    return parseInt(match[1].slice(index, index + 2), 16) / 255;
  });
  const linear = channels.map(function (channel) {
    return channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * 以 WCAG 公式計算兩色對比。
 *
 * @param {string} foreground - 前景色
 * @param {string} background - 背景色
 * @returns {number|null} 對比值或 null
 */
function computeContrast(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  if (first === null || second === null) return null;
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/**
 * 解析 CSS，移除註解後取出每個區塊的選擇器與自訂屬性。
 *
 * @param {string} cssText - styles.css 內容
 * @returns {Array<{selector: string, vars: Object}>} 區塊清單
 */
function parseCssBlocks(cssText) {
  const source = String(cssText).replace(/\/\*[\s\S]*?\*\//g, "");
  const blocks = [];
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let blockMatch = null;
  while ((blockMatch = blockPattern.exec(source)) !== null) {
    const vars = {};
    const varPattern = /(--[a-z0-9-]+)\s*:\s*([^;]+);/gi;
    let varMatch = null;
    while ((varMatch = varPattern.exec(blockMatch[2])) !== null) {
      vars[varMatch[1]] = varMatch[2].trim();
    }
    if (Object.keys(vars).length === 0) continue;
    blocks.push({
      selector: blockMatch[1].trim().replace(/\s+/g, " "),
      vars: vars
    });
  }
  return blocks;
}

/**
 * 解析 var() 參考，回傳實際會使用的自訂屬性名稱。
 *
 * @param {string} value - CSS 值
 * @returns {string|null} 參考的屬性名稱或 null
 */
function resolveVarReference(value) {
  const match = VAR_PATTERN.exec(String(value || "").trim());
  return match ? match[1] : null;
}

/**
 * 從選擇器取得主題 id 與是否為深色模式。
 *
 * @param {string} selectorPart - 單一選擇器
 * @returns {{id: string, dark: boolean}|null} 主題辨識結果
 */
function identifyTheme(selectorPart) {
  const styleMatch = /html\[data-style="([^"]+)"\]/.exec(selectorPart);
  if (!styleMatch) return null;
  return {
    id: styleMatch[1],
    dark: selectorPart.indexOf('data-theme="dark"') !== -1
  };
}

/**
 * 組出主題定義與焦點覆寫資料。
 *
 * @param {Array<{selector: string, vars: Object}>} blocks - CSS 區塊
 * @returns {{themes: Object, focusOverrides: Object, rootVars: Object}} 解析結果
 */
function buildThemeMap(blocks) {
  const themes = {};
  const focusOverrides = {};
  let rootVars = {};

  blocks.forEach(function (block) {
    if (block.selector.indexOf(":root") === -1) return;
    if (!Object.prototype.hasOwnProperty.call(block.vars, "--bg")) return;
    rootVars = block.vars;
  });

  blocks.forEach(function (block) {
    const parts = block.selector.split(",").map(function (part) {
      return part.trim();
    });
    const definesTheme = Object.prototype.hasOwnProperty.call(block.vars, "--ink-3");
    const isFocusOverride = !definesTheme && Object.prototype.hasOwnProperty.call(block.vars, "--focus-ring");
    parts.forEach(function (part) {
      const theme = identifyTheme(part);
      if (!theme) return;
      if (isFocusOverride) {
        focusOverrides[theme.id] = block.vars["--focus-ring"];
        return;
      }
      if (!definesTheme) return;
      const key = theme.id + (theme.dark ? ":dark" : ":light");
      themes[key] = block.vars;
    });
  });

  return { themes: themes, focusOverrides: focusOverrides, rootVars: rootVars };
}

/**
 * 解析資源最後的實際顏色值，支援一層 var() 參考。
 *
 * @param {string} value - CSS 值
 * @param {Object} vars - 目前主題的屬性
 * @param {Object} rootVars - :root 的屬性
 * @returns {string|null} 顏色值或 null
 */
function resolveColor(value, vars, rootVars) {
  const reference = resolveVarReference(value);
  if (!reference) return value;
  if (Object.prototype.hasOwnProperty.call(vars, reference)) return vars[reference];
  if (Object.prototype.hasOwnProperty.call(rootVars, reference)) return rootVars[reference];
  return null;
}

/**
 * 評估所有主題的對比，回傳失敗清單。
 *
 * @param {string} cssText - styles.css 內容
 * @returns {Array<Object>} 失敗項目
 */
function evaluateContrast(cssText) {
  const parsed = buildThemeMap(parseCssBlocks(cssText));
  const failures = [];

  Object.keys(parsed.themes).forEach(function (key) {
    const vars = parsed.themes[key];
    const isLight = key.indexOf(":light") !== -1;
    const paper = resolveColor(vars["--paper"], vars, parsed.rootVars);
    const bg = resolveColor(vars["--bg"], vars, parsed.rootVars);
    const ink3 = resolveColor(vars["--ink-3"], vars, parsed.rootVars);

    if (isLight && ink3) {
      [
        { label: "背景", color: bg },
        { label: "卡片", color: paper }
      ].forEach(function (target) {
        if (!target.color) return;
        const value = computeContrast(ink3, target.color);
        if (value !== null && value < LIGHT_TEXT_MIN) {
          failures.push({
            theme: key,
            metric: "--ink-3/" + target.label,
            value: value,
            minimum: LIGHT_TEXT_MIN
          });
        }
      });
    }

    if (!paper) return;
    const override = parsed.focusOverrides[key.replace(/:(light|dark)$/, "")];
    const focusValue = override || parsed.rootVars["--focus-ring"] || vars["--accent"];
    const focusColor = resolveColor(focusValue, vars, parsed.rootVars);
    if (!focusColor) return;
    const focusContrast = computeContrast(focusColor, paper);
    if (focusContrast !== null && focusContrast < FOCUS_MIN) {
      failures.push({
        theme: key,
        metric: "focus-ring/卡片",
        value: focusContrast,
        minimum: FOCUS_MIN
      });
    }
  });

  return failures;
}

function main() {
  const failures = evaluateContrast(fs.readFileSync(CSS_PATH, "utf8"));
  if (failures.length === 0) {
    console.log("[checkContrast] 淺色文字與焦點環對比皆符合 WCAG AA，檢查通過。");
    return;
  }
  console.error("[checkContrast] 發現 " + failures.length + " 處對比不足：");
  failures.forEach(function (failure) {
    console.error(
      "  - " + failure.theme + " " + failure.metric + " " + failure.value.toFixed(2) + ":1 < " + failure.minimum + ":1"
    );
  });
  process.exitCode = 1;
}

if (require.main === module) {
  main();
}

module.exports = {
  relativeLuminance: relativeLuminance,
  computeContrast: computeContrast,
  parseCssBlocks: parseCssBlocks,
  buildThemeMap: buildThemeMap,
  resolveColor: resolveColor,
  evaluateContrast: evaluateContrast
};
