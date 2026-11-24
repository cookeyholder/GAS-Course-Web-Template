"use strict";

/**
 * 視覺風格主題契約測試。
 * 驗證新增風格的套用、持久化、下拉中繼資料，以及後續全部風格的完整可用性契約。
 */

const assert = require("assert");
const configModule = require("../webapp/js/config.js");
const helpers = require("./helpers/importsUiDeps.js");

const NEW_STYLE_IDS = ["navy-brick", "celadon-mint", "cover-lime"];

console.log("開始執行 visualStyleThemes 測試...\n");

function baseEnv() {
  return {
    search: "",
    protocol: "https:",
    hostname: "example.com",
    href: "https://example.com/app/index.html",
    gasWebappUrl: "",
    switchAccount: false
  };
}

function realConfig() {
  return configModule.buildFrontendConfig(baseEnv());
}

function createUiContext(initialStore) {
  const config = realConfig();
  const store = Object.assign({}, initialStore || {});
  const localStorage = helpers.createLocalStorage(store);
  const state = {
    view: "app",
    tab: "overview",
    user: null,
    publicConfig: null,
    loginError: "",
    loginBusy: false,
    courses: { total: 0 }
  };
  const MEA = {
    state: state,
    config: config,
    safeErrors: helpers.safeErrors || {},
    setState: function (patch) {
      Object.assign(state, patch);
    },
    auth: {
      isGasHosted: function () {
        return false;
      },
      loginMock: function () {},
      logout: function () {},
      renderGoogleButton: function () {}
    }
  };
  const ctx = helpers.createUiDeps({ MEA: MEA });
  ctx.win.localStorage = localStorage;
  return ctx;
}

function run() {
  const config = realConfig();
  assert.strictEqual(config.styles.length, 16, "真實設定應提供 16 款風格");

  NEW_STYLE_IDS.forEach(function (styleId) {
    const ctx = createUiContext({});
    assert.strictEqual(ctx.ui.applyStyle(styleId), styleId);
    assert.strictEqual(ctx.doc.documentElement.dataset.style, styleId);
    assert.strictEqual(ctx.win.localStorage.store[config.styleKey], styleId);

    ctx.ui.toggleTheme();
    assert.strictEqual(ctx.doc.documentElement.dataset.style, styleId, "切換主題不得改變風格");

    const restored = createUiContext({
      [config.styleKey]: styleId,
      [config.themeKey]: "dark"
    });
    restored.ui.initThemeAndStyle();
    assert.strictEqual(restored.doc.documentElement.dataset.style, styleId);
    assert.strictEqual(restored.ui.currentTheme(), "dark");
    console.log(`   ✓ ${styleId} 套用、持久化與主題切換驗證通過`);
  });

  const fallback = createUiContext({
    [config.styleKey]: "nonexistent-style",
    [config.themeKey]: "dark"
  });
  assert.strictEqual(fallback.ui.applyStyle("nonexistent-style"), "modern-slate");
  assert.strictEqual(fallback.win.localStorage.store[config.styleKey], "modern-slate");
  assert.strictEqual(fallback.win.localStorage.store[config.themeKey], "dark", "未知風格不得改寫其他設定");
  console.log("   ✓ 未知識別碼安全回退驗證通過");

  const html = fallback.ui.renderLoginView();
  NEW_STYLE_IDS.forEach(function (styleId) {
    const style = config.styles.filter(function (s) {
      return s.id === styleId;
    })[0];
    assert(html.indexOf('<option value="' + styleId + '"') !== -1, `下拉應含 ${styleId}`);
    assert(html.indexOf(style.icon + " " + style.name) !== -1, `下拉應含 ${styleId} 圖示與名稱`);
  });
  console.log("   ✓ 下拉選單圖示與名稱驗證通過");

  console.log("✓ visualStyleThemes 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
