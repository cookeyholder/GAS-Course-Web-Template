"use strict";

/**
 * WCAG 對比與 Toast 無障礙角色測試（task 3.5）。
 * 驗證對比計算、styles.css 全主題符合門檻、檢查腳本可偵測回退，
 * 以及錯誤／警告 Toast 具備 role="alert"。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const contrast = require("../scripts/checkContrast.js");
const uiModule = require("../webapp/js/ui.js");
const helpers = require("./helpers/importsUiDeps.js");

const CSS_PATH = path.join(__dirname, "..", "webapp", "styles.css");

function run() {
  console.log("1. WCAG 對比公式應正確...");
  assert.strictEqual(contrast.computeContrast("#000000", "#ffffff"), 21);
  assert.strictEqual(contrast.computeContrast("#ffffff", "#ffffff"), 1);
  assert.strictEqual(contrast.computeContrast("not-a-color", "#ffffff"), null);
  assert.strictEqual(contrast.relativeLuminance("#ffffff"), 1);
  assert.strictEqual(contrast.relativeLuminance("rgb(0,0,0)"), null);
  console.log("   ✓ 對比公式驗證通過！\n");

  console.log("2. CSS 解析應涵蓋所有主題與焦點覆寫...");
  const cssText = fs.readFileSync(CSS_PATH, "utf8");
  const blocks = contrast.parseCssBlocks(cssText);
  const parsed = contrast.buildThemeMap(blocks);
  assert(Object.keys(parsed.themes).length >= 26, "應解析至少 26 個主題區塊");
  assert(Object.prototype.hasOwnProperty.call(parsed.themes, "blueprint:light"), "應含 blueprint 淺色");
  assert.strictEqual(parsed.rootVars["--focus-ring"], "var(--accent)", ":root 應定義焦點環");
  [
    ["nes", "var(--ink)"],
    ["happyhues14", "var(--ink)"],
    ["happyhues10", "var(--ink)"],
    ["happyhues12", "var(--ink)"]
  ].forEach(function (entry) {
    assert.strictEqual(parsed.focusOverrides[entry[0]], entry[1], entry[0] + " 應覆寫焦點環");
  });
  assert.strictEqual(contrast.resolveColor("var(--accent)", { "--accent": "#123456" }, {}), "#123456");
  assert.strictEqual(contrast.resolveColor("#123456", {}, {}), "#123456");
  console.log("   ✓ CSS 解析驗證通過！\n");

  console.log("3. 實際樣式表應全數通過對比檢查...");
  assert.deepStrictEqual(contrast.evaluateContrast(cssText), [], "正式樣式表不應有對比失敗");
  console.log("   ✓ 正式樣式表對比驗證通過！\n");

  console.log("4. 檢查腳本應能偵測低對比回退...");
  const badCss =
    ":root { --bg: #ffffff; --paper: #ffffff; --accent: #ffffff; --focus-ring: var(--accent); }" +
    'html[data-style="bad"] { --bg: #ffffff; --paper: #ffffff; --accent: #ffffff; --ink-3: #eeeeee; }';
  const failures = contrast.evaluateContrast(badCss);
  assert(failures.length >= 3, "應同時偵測文字與焦點對比不足");
  assert(
    failures.some(function (item) {
      return item.metric.indexOf("--ink-3") === 0;
    })
  );
  assert(
    failures.some(function (item) {
      return item.metric.indexOf("focus-ring") === 0;
    })
  );
  console.log("   ✓ 回退偵測驗證通過！\n");

  console.log("5. 深色主題低對比回退應被偵測...");
  const badDarkCss =
    ":root { --bg: #15130f; --paper: #1c1a15; --accent: #e59a7d; --focus-ring: var(--accent); }" +
    'html[data-style="paper"][data-theme="dark"] { --bg: #15130f; --paper: #1c1a15; --accent: #e59a7d; --ink-3: #7b7467; }';
  const darkFailures = contrast.evaluateContrast(badDarkCss);
  assert(
    darkFailures.some(function (item) {
      return item.theme.indexOf(":dark") !== -1 && item.metric.indexOf("--ink-3") === 0;
    }),
    "應偵測深色主題文字對比不足"
  );
  console.log("   ✓ 深色對比回退偵測驗證通過！\n");

  console.log("6. 錯誤與警告 Toast 應具備 role=alert...");
  assert.strictEqual(uiModule.resolveToastRole("err"), "alert");
  assert.strictEqual(uiModule.resolveToastRole("warn"), "alert");
  assert.strictEqual(uiModule.resolveToastRole("ok"), null);
  assert.strictEqual(uiModule.resolveToastRole("info"), null);
  ["err", "warn", "ok", "info"].forEach(function (kind) {
    const element = uiModule.createToastElement(helpers.createDocument().doc, "訊息", kind);
    const expected = kind === "err" || kind === "warn" ? "alert" : null;
    assert.strictEqual(element.getAttribute("role"), expected, kind + " 角色應為 " + expected);
  });
  console.log("   ✓ Toast 無障礙角色驗證通過！\n");

  console.log("✓ WCAG 對比與 Toast 無障礙測試全數通過！\n");
}

run();
