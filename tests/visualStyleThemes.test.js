"use strict";

/**
 * 視覺風格主題契約測試。
 * 驗證新增風格的套用、持久化、下拉中繼資料，以及後續全部風格的完整可用性契約。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const configModule = require("../webapp/js/config.js");
const helpers = require("./helpers/importsUiDeps.js");

const STYLES_CSS = fs.readFileSync(path.join(__dirname, "..", "webapp", "styles.css"), "utf8");
const NEW_STYLE_IDS = ["navy-brick", "celadon-mint", "cover-lime"];

function parseDeclarations(body) {
  const vars = {};
  body.split(";").forEach(function (line) {
    const match = /^\s*(--[\w-]+)\s*:\s*([^;]+?)\s*$/.exec(line);
    if (match) vars[match[1]] = match[2];
  });
  return vars;
}

function readCssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(escaped + "\\s*\\{([^}]*)\\}").exec(STYLES_CSS);
  assert(match, `找不到 CSS 區塊：${selector}`);
  return parseDeclarations(match[1]);
}

const REQUIRED_ROLES = [
  "--line",
  "--line-2",
  "--fill",
  "--fill-2",
  "--ok",
  "--ok-bg",
  "--err",
  "--err-bg",
  "--warn",
  "--warn-bg",
  "--radius",
  "--danger",
  "--shadow",
  "--head-font",
  "--bg-pattern",
  "--bg-size",
  "--style-nav-bg",
  "--style-nav-ink",
  "--style-band-accent"
];

function assertStyleRoles(styleId, lightExpected, darkExpected) {
  const light = readCssBlock(`html[data-style="${styleId}"]`);
  const dark = readCssBlock(`html[data-style="${styleId}"][data-theme="dark"]`);
  [light, dark].forEach(function (vars, index) {
    const expected = index === 0 ? lightExpected : darkExpected;
    Object.keys(expected).forEach(function (name) {
      assert.strictEqual(vars[name], expected[name], `${styleId} ${name} 值不符`);
    });
    REQUIRED_ROLES.forEach(function (name) {
      assert(Object.prototype.hasOwnProperty.call(vars, name), `${styleId} 缺少角色 ${name}`);
    });
  });
}

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

  const navyLight = readCssBlock('html[data-style="navy-brick"]');
  const navyDark = readCssBlock('html[data-style="navy-brick"][data-theme="dark"]');
  assert.deepStrictEqual(
    {
      bg: navyLight["--bg"],
      paper: navyLight["--paper"],
      ink: navyLight["--ink"],
      accent: navyLight["--accent"],
      accentBg: navyLight["--accent-bg"],
      ink3: navyLight["--ink-3"]
    },
    {
      bg: "#fbf9f3",
      paper: "#ffffff",
      ink: "#1b2f47",
      accent: "#b8402d",
      accentBg: "#f7ece8",
      ink3: "#5f6d7e"
    }
  );
  assert.deepStrictEqual(
    {
      bg: navyDark["--bg"],
      paper: navyDark["--paper"],
      ink: navyDark["--ink"],
      accent: navyDark["--accent"],
      accentBg: navyDark["--accent-bg"],
      ink3: navyDark["--ink-3"]
    },
    {
      bg: "#101b28",
      paper: "#18283a",
      ink: "#eef3f9",
      accent: "#ef8a72",
      accentBg: "#43251f",
      ink3: "#94a7bd"
    }
  );
  [
    "--line",
    "--line-2",
    "--fill",
    "--fill-2",
    "--ok",
    "--ok-bg",
    "--err",
    "--err-bg",
    "--warn",
    "--warn-bg",
    "--radius",
    "--danger",
    "--shadow",
    "--head-font",
    "--bg-pattern",
    "--bg-size",
    "--style-nav-bg",
    "--style-nav-ink",
    "--style-band-accent"
  ].forEach(function (name) {
    assert(Object.prototype.hasOwnProperty.call(navyLight, name), `淺色缺少角色 ${name}`);
    assert(Object.prototype.hasOwnProperty.call(navyDark, name), `深色缺少角色 ${name}`);
  });
  console.log("   ✓ navy-brick 深淺角色宣告驗證通過");

  assertStyleRoles(
    "celadon-mint",
    {
      "--bg": "#fbfcfa",
      "--paper": "#ffffff",
      "--ink": "#17453f",
      "--accent": "#17453f",
      "--accent-bg": "#d8e6de",
      "--ink-3": "#52746a"
    },
    {
      "--bg": "#101b18",
      "--paper": "#182923",
      "--ink": "#edf5f0",
      "--accent": "#86d8bf",
      "--accent-bg": "#1b3c33",
      "--ink-3": "#91a99d"
    }
  );
  console.log("   ✓ celadon-mint 深淺角色宣告驗證通過");

  assertStyleRoles(
    "cover-lime",
    {
      "--bg": "#f1efe4",
      "--paper": "#fffdf7",
      "--ink": "#111111",
      "--ink-3": "#63635a",
      "--accent-bg": "#c7f03b",
      "--cover-lime": "#c7f03b"
    },
    {
      "--bg": "#14140f",
      "--paper": "#1e1e17",
      "--ink": "#f3efe4",
      "--ink-3": "#a9a494",
      "--accent-bg": "#2b3812",
      "--cover-lime": "#c7f03b"
    }
  );
  const coverLight = readCssBlock('html[data-style="cover-lime"]');
  const coverDark = readCssBlock('html[data-style="cover-lime"][data-theme="dark"]');
  assert.strictEqual(coverLight["--ink"], "#111111", "檸檬底按鈕的墨黑字取自淺色 --ink");
  assert.strictEqual(coverDark["--cover-lime"], "#c7f03b", "深色仍保留檸檬色票供按鈕使用");
  console.log("   ✓ cover-lime 深淺角色與檸檬色票驗證通過");

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
