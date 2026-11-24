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
const { computeContrast } = require("../scripts/checkContrast.js");

const STYLES_CSS = fs.readFileSync(path.join(__dirname, "..", "webapp", "styles.css"), "utf8");
const CSS_WITHOUT_COMMENTS = STYLES_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const NEW_STYLE_IDS = ["navy-brick", "celadon-mint", "cover-lime"];

function findRuleDeclarations(selector) {
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match = null;
  while ((match = blockPattern.exec(CSS_WITHOUT_COMMENTS)) !== null) {
    const selectors = match[1].split(",").map(function (part) {
      return part.trim();
    });
    if (selectors.indexOf(selector) !== -1) return match[2];
  }
  assert.fail(`找不到 CSS 規則：${selector}`);
}

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

// commit 56d3a1a 的六個角色區塊快照；順序為 navy 淺／深、celadon 淺／深、cover 淺／深。
// 本範本僅刻意調整兩款淺色 --ink-3，其餘角色須與此快照完全一致。
const SOURCE_ROLES = {
  "--bg": ["#fbf9f3", "#101b28", "#fbfcfa", "#101b18", "#f1efe4", "#14140f"],
  "--paper": ["#ffffff", "#18283a", "#ffffff", "#182923", "#fffdf7", "#1e1e17"],
  "--ink": ["#1b2f47", "#eef3f9", "#17453f", "#edf5f0", "#111111", "#f3efe4"],
  "--ink-2": ["#4a5a6d", "#bccadc", "#3f6a61", "#b8ccc2", "#3d3d36", "#d6d1c1"],
  "--ink-3": ["#6d7b8c", "#94a7bd", "#64887e", "#91a99d", "#63635a", "#a9a494"],
  "--line": ["#1b2f47", "#3c5066", "#17453f", "#3a574e", "#111111", "#484636"],
  "--line-2": ["#d9d1bd", "#26384c", "#c8d6cd", "#253c35", "#cfcbbd", "#2e2e24"],
  "--fill": ["#f5f1e7", "#1c2c3e", "#f2f7f4", "#1b2e28", "#f9ebda", "#1d1d16"],
  "--fill-2": ["#e9e3d5", "#24374c", "#d8e6de", "#22382f", "#f6ead4", "#26261d"],
  "--accent": ["#b8402d", "#ef8a72", "#17453f", "#86d8bf", "#111111", "#c7f03b"],
  "--accent-bg": ["#f7ece8", "#43251f", "#d8e6de", "#1b3c33", "#c7f03b", "#2b3812"],
  "--ok": ["#2e6b4f", "#6fd6a6", "#2e6b4f", "#6fd6a6", "#2f6b3f", "#a3e635"],
  "--ok-bg": ["#e4f0e8", "#173a2c", "#e3f1e8", "#173a2c", "#e4f0d5", "#1f3310"],
  "--err": ["#b3261e", "#ff9a94", "#b3261e", "#ff9a94", "#b3261e", "#ff8f8f"],
  "--err-bg": ["#f9e4e2", "#451d22", "#f9e4e2", "#451d22", "#f9e4e2", "#401c1c"],
  "--danger": ["var(--err)", "var(--err)", "var(--err)", "var(--err)", "var(--err)", "var(--err)"],
  "--warn": ["#8a5a12", "#f6c277", "#8a5a12", "#f6c277", "#8a5a12", "#ffc46b"],
  "--warn-bg": ["#f8ecda", "#3b2a13", "#f8ecda", "#3b2a13", "#f8ecda", "#3c2a12"],
  "--shadow": ["none", "none", "none", "none", "none", "none"],
  "--radius": ["2px", "2px", "4px", "4px", "0px", "0px"],
  "--head-font": ["var(--sans)", "var(--sans)", "var(--sans)", "var(--sans)", "var(--sans)", "var(--sans)"],
  "--bg-pattern": ["none", "none", "none", "none", "none", "none"],
  "--bg-size": ["auto", "auto", "auto", "auto", "auto", "auto"],
  "--style-nav-bg": ["#1b2f47", "#0b1420", "#17453f", "#0b1613", "#111111", "#000000"],
  "--style-nav-ink": ["#fbf9f3", "#eef3f9", "#fbfcfa", "#edf5f0", "#f1efe4", "#f3efe4"],
  "--style-band-accent": ["#b8402d", "#ef8a72", "#c8d6cd", "#86d8bf", "#c7f03b", "#c7f03b"],
  "--cover-lime": ["(無)", "(無)", "(無)", "(無)", "#c7f03b", "#c7f03b"]
};

const ADJUSTED_INK3 = {
  "navy-brick:light": ["#6d7b8c", "#5f6d7e"],
  "celadon-mint:light": ["#64887e", "#52746a"]
};

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

const THEMES = NEW_STYLE_IDS.reduce(function (list, styleId) {
  [
    { key: `${styleId}:light`, selector: `html[data-style="${styleId}"]`, dark: false },
    {
      key: `${styleId}:dark`,
      selector: `html[data-style="${styleId}"][data-theme="dark"]`,
      dark: true
    }
  ].forEach(function (theme) {
    list.push(theme);
  });
  return list;
}, []);

function assertContrastMatrix() {
  THEMES.forEach(function (theme) {
    const vars = readCssBlock(theme.selector);
    ["--bg", "--paper"].forEach(function (background) {
      const ratio = computeContrast(vars["--ink-3"], vars[background]);
      assert(ratio !== null && ratio >= 4.5, `${theme.key} 次要文字對 ${background} 對比不足：${ratio}`);
    });
    const navRatio = computeContrast(vars["--style-nav-ink"], vars["--style-nav-bg"]);
    assert(navRatio !== null && navRatio >= 4.5, `${theme.key} 未啟用頁籤對深色帶對比不足：${navRatio}`);
    const focusRatio = computeContrast(vars["--accent"], vars["--paper"]);
    assert(focusRatio !== null && focusRatio >= 3, `${theme.key} 焦點環對紙面對比不足：${focusRatio}`);
    assert(/^#[0-9a-f]{6}$/i.test(vars["--accent-bg"]), `${theme.key} --accent-bg 須為明確色值`);
  });
}

function assertSourceDifferencesOnlyInk3() {
  assert.strictEqual(THEMES.length, 6);
  THEMES.forEach(function (theme, index) {
    const vars = readCssBlock(theme.selector);
    const sourceRoleCount = Object.keys(SOURCE_ROLES).filter(function (role) {
      return SOURCE_ROLES[role][index] !== "(無)";
    }).length;
    assert.strictEqual(Object.keys(vars).length, sourceRoleCount, `${theme.key} 角色數與來源不同`);
    Object.keys(SOURCE_ROLES).forEach(function (role) {
      const sourceValue = SOURCE_ROLES[role][index];
      if (sourceValue === "(無)") {
        assert(!Object.prototype.hasOwnProperty.call(vars, role), `${theme.key} 不應宣告 ${role}`);
        return;
      }
      if (Object.prototype.hasOwnProperty.call(ADJUSTED_INK3, theme.key) && role === "--ink-3") {
        assert.strictEqual(sourceValue, ADJUSTED_INK3[theme.key][0], `${theme.key} 來源色值快照不符`);
        assert.strictEqual(vars[role], ADJUSTED_INK3[theme.key][1], `${theme.key} 調整後色值不符`);
        return;
      }
      assert.strictEqual(vars[role], sourceValue, `${theme.key} ${role} 與來源不同`);
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

  assertContrastMatrix();
  console.log("   ✓ 六個主題次要文字／頁籤／焦點環對比矩陣驗證通過");

  assertSourceDifferencesOnlyInk3();
  console.log("   ✓ 來源差異僅兩款淺色 --ink-3 驗證通過");

  NEW_STYLE_IDS.forEach(function (styleId) {
    const header = findRuleDeclarations(`html[data-style="${styleId}"] .app-header`);
    const darkHeader = findRuleDeclarations(`html[data-style="${styleId}"][data-theme="dark"] .app-header`);
    const nav = findRuleDeclarations(`html[data-style="${styleId}"] .app-nav`);
    const navTab = findRuleDeclarations(`html[data-style="${styleId}"] .nav-tab`);
    const inactiveTab = findRuleDeclarations(`html[data-style="${styleId}"] .nav-tab:not(.active):not(:hover)`);
    const panelHead = findRuleDeclarations(`html[data-style="${styleId}"] .panel-head`);
    const panelHeader = findRuleDeclarations(`html[data-style="${styleId}"] .panel-header`);
    assert(/min-height:\s*56px/.test(header), `${styleId} 頂列須為 56px`);
    assert(/background:\s*#ffffff/.test(header), `${styleId} 淺色頂列須為白底`);
    assert(/background:\s*var\(--paper\)/.test(darkHeader), `${styleId} 深色頂列須跟隨 --paper`);
    assert(/border-bottom:\s*6px solid var\(--style-band-accent\)/.test(nav), `${styleId} 須有 6px 強調帶`);
    assert(/background:\s*var\(--style-nav-bg\)/.test(nav), `${styleId} 導覽須用深色帶`);
    assert(/min-height:\s*56px/.test(nav), `${styleId} 導覽須為 56px`);
    assert(/font-size:\s*16px/.test(navTab) && /font-weight:\s*700/.test(navTab), `${styleId} 頁籤字級`);
    assert(/color:\s*var\(--style-nav-ink\)/.test(inactiveTab), `${styleId} 未啟用頁籤文字`);
    [panelHead, panelHeader].forEach(function (rule) {
      assert(/background:\s*var\(--fill-2\)/.test(rule), `${styleId} 標題帶須用 --fill-2`);
    });
  });
  const limeTitle = findRuleDeclarations('html[data-style="cover-lime"] .panel-title');
  const limeBrand = findRuleDeclarations('html[data-style="cover-lime"] .brand-title');
  [limeTitle, limeBrand].forEach(function (rule) {
    assert(/font-size:\s*clamp\(24px,\s*2vw,\s*28px\)/.test(rule), "標題字級須使用 clamp");
    assert(/font-weight:\s*800/.test(rule), "標題字重須為 800");
    assert(/letter-spacing:\s*-0\.02em/.test(rule), "標題字距須為 -0.02em");
  });
  const limeActiveTab = findRuleDeclarations('html[data-style="cover-lime"] .nav-tab.active');
  assert(/color:\s*var\(--accent\)/.test(limeActiveTab), "啟用頁籤文字須用 --accent");
  assert(/background:\s*var\(--accent-bg\)/.test(limeActiveTab), "啟用頁籤底色須用 --accent-bg");
  console.log("   ✓ 三款風格區塊切割與 cover-lime 標題字級驗證通過");

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
