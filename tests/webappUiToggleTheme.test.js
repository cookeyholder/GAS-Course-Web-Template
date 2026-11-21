"use strict";

/**
 * webapp/js/ui.js::toggleTheme 單元測試（G7.18）。
 * 驗證深淺色切換、localStorage 寫入、按鈕文字同步與樣式初始化容錯。
 */

const assert = require("assert");
const helpers = require("./helpers/importsUiDeps.js");
const createDeps = helpers.createUiDeps;
const createLocalStorage = helpers.createLocalStorage;

console.log("開始執行 webapp/js/ui.js toggleTheme 測試...\n");

function run() {
  assert.strictEqual(typeof helpers.createUiDeps, "function", "應提供依賴模擬工廠");
  console.log("1. 測試依賴工廠可用 ✓\n");

  const ctx = createDeps();
  ctx.elements.themeToggle = helpers.createElement("button");
  ctx.elements.loginThemeToggle = helpers.createElement("button");
  ctx.doc.documentElement.dataset.theme = "light";
  ctx.ui.toggleTheme();
  assert.strictEqual(ctx.doc.documentElement.dataset.theme, "dark");
  assert.strictEqual(ctx.win.localStorage.store[ctx.config.themeKey], "dark");
  assert.strictEqual(ctx.elements.themeToggle.textContent, "◑ 淺色模式");
  assert.strictEqual(ctx.elements.loginThemeToggle.textContent, "◑ 淺色");
  assert.strictEqual(ctx.ui.currentTheme(), "dark");

  ctx.ui.toggleTheme();
  assert.strictEqual(ctx.doc.documentElement.dataset.theme, "light");
  assert.strictEqual(ctx.win.localStorage.store[ctx.config.themeKey], "light");
  assert.strictEqual(ctx.elements.themeToggle.textContent, "◐ 深色模式");
  assert.strictEqual(ctx.elements.loginThemeToggle.textContent, "◐ 深色");
  console.log("2. 深淺色往返切換與兩組按鈕文字同步 ✓\n");

  const missing = createDeps();
  assert.doesNotThrow(function () {
    missing.ui.toggleTheme();
  });
  assert.strictEqual(missing.doc.documentElement.dataset.theme, "dark");
  console.log("3. 缺少主題按鈕時仍應完成切換 ✓\n");

  const storageFail = createDeps();
  storageFail.win.localStorage = {
    setItem: function () {
      throw new Error("儲存失敗");
    }
  };
  assert.doesNotThrow(function () {
    storageFail.ui.toggleTheme();
  });
  assert.strictEqual(storageFail.doc.documentElement.dataset.theme, "dark");
  console.log("4. localStorage 寫入失敗不影響畫面主題 ✓\n");

  const init = createDeps();
  const store = {};
  store[init.config.themeKey] = "dark";
  store[init.config.styleKey] = "paper";
  init.win.localStorage = createLocalStorage(store);
  init.ui.initThemeAndStyle();
  assert.strictEqual(init.doc.documentElement.dataset.theme, "dark");
  assert.strictEqual(init.doc.documentElement.dataset.style, "paper");

  assert.strictEqual(init.ui.applyStyle("不存在"), "modern-slate");
  assert.strictEqual(init.ui.currentStyle(), "modern-slate");
  assert.strictEqual(init.ui.applyTheme("其他值"), "light");
  console.log("5. 主題與風格初始化、無效風格回退 ✓\n");

  const utilCtx = createDeps();
  assert.strictEqual(typeof utilCtx.ui.debounce, "function", "應提供 debounce 函式");
  const debounced = utilCtx.ui.debounce(function () {}, 50);
  assert.strictEqual(typeof debounced, "function", "應回傳防抖函式");
  assert.strictEqual(utilCtx.ui.roleName("admin"), "系統管理員", "admin 應對應系統管理員");
  console.log("6. debounce 與 roleName 輔助函式 ✓\n");

  console.log("✓ webapp/js/ui.js toggleTheme 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
