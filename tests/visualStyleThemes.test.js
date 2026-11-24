"use strict";

/**
 * 視覺風格主題契約測試。
 * 驗證新增風格的套用、持久化、下拉中繼資料，以及後續全部風格的完整可用性契約。
 * 無障礙部分僅做 DOM 結構稽核：jsdom 不套用 CSS，也不驗證色彩；色彩由靜態契約與 check:contrast 把關。
 */

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const configModule = require("../webapp/js/config.js");
const helpers = require("./helpers/importsUiDeps.js");
const harness = require("./helpers/a11yHarness.js");
const checkA11y = require("../scripts/checkA11y.js");
const { buildThemeMap, computeContrast, parseCssBlocks } = require("../scripts/checkContrast.js");

const STYLES_CSS = fs.readFileSync(path.join(__dirname, "..", "webapp", "styles.css"), "utf8");
const CSS_WITHOUT_COMMENTS = STYLES_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
const UI_JS = fs.readFileSync(path.join(__dirname, "..", "webapp", "js", "ui.js"), "utf8");
const NEW_STYLE_IDS = ["navy-brick", "celadon-mint", "cover-lime"];
const D6_STYLE_IDS = ["happyhues2", "happyhues3", "happyhues5", "happyhues9"];

function findRuleDeclarations(selector, last) {
  const blockPattern = /([^{}]+)\{([^{}]*)\}/g;
  let match = null;
  let found = null;
  while ((match = blockPattern.exec(CSS_WITHOUT_COMMENTS)) !== null) {
    const selectors = match[1].split(",").map(function (part) {
      return part.trim();
    });
    if (selectors.indexOf(selector) !== -1 && (last || found === null)) found = match[2];
  }
  assert(found !== null, `找不到 CSS 規則：${selector}`);
  return found;
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

// 與 scripts/checkContrast.js 的單層解析不同：這裡遞迴拆解 var()，並以「主題自身 → :root」順序查找，
// 且偵測循環與兩層 var()；因此可涵蓋 --body-font: var(--sans) 等鏈結，也不會把 D6 禁止的別名視為合格。
const THEME_MAP = buildThemeMap(parseCssBlocks(CSS_WITHOUT_COMMENTS));
const CORE_ROLES = [
  "--bg",
  "--paper",
  "--ink",
  "--ink-2",
  "--ink-3",
  "--line",
  "--line-2",
  "--fill",
  "--fill-2",
  "--accent",
  "--accent-bg",
  "--ok",
  "--ok-bg",
  "--err",
  "--err-bg",
  "--warn-bg"
];
const UNCHANGED_BASELINE = {
  "modern-slate:light": "9dd6976d2624",
  "modern-slate:dark": "3fe17209f557",
  "blueprint:light": "38a57f99ebb5",
  "blueprint:dark": "b8c67a0dd790",
  "paper:light": "1f34a3558fbf",
  "paper:dark": "434db149c935",
  "neobrutalism:light": "7e1e6f0a7bf4",
  "neobrutalism:dark": "686a62e1f847",
  "claymorphism:light": "45f76ddb86ee",
  "claymorphism:dark": "a9fa37043c32",
  "nes:light": "d6dec599b426",
  "nes:dark": "94bbab1178ad",
  "happyhues10:light": "b21ff71dba4f",
  "happyhues10:dark": "8513aa43d073",
  "happyhues12:light": "47522d53761e",
  "happyhues12:dark": "0cc73ab01a4f",
  "happyhues14:light": "2e6f76e82c9b",
  "happyhues14:dark": "69d0ac769076"
};

// D6：四款舊風格修補前已宣告的角色；--ok／--warn 依 Adjusted Roles 調整，其餘須完全不變。
const D6_UNCHANGED_ROLES = [
  "--bg",
  "--paper",
  "--ink",
  "--ink-2",
  "--ink-3",
  "--line",
  "--line-subtle",
  "--primary",
  "--primary-ink",
  "--accent",
  "--danger",
  "--radius-panel",
  "--radius-btn",
  "--shadow-panel",
  "--shadow-btn",
  "--body-font",
  "--head-font",
  "--bg-pattern",
  "--bg-size"
];
const D6_UNCHANGED_BASELINE = {
  "happyhues2:light": "149569ac04e5",
  "happyhues2:dark": "2349f9192c60",
  "happyhues3:light": "9796db6d4fb2",
  "happyhues3:dark": "82caed0c3fa7",
  "happyhues5:light": "da766131e2f2",
  "happyhues5:dark": "0cabe167a78d",
  "happyhues9:light": "ffa1f956a3ba",
  "happyhues9:dark": "7b8a7b88721f"
};
const D6_EXPECTED_ROLES = {
  happyhues2: {
    light: {
      "--line-2": "#c8d2df",
      "--fill": "#eef2f7",
      "--fill-2": "#e2e9f1",
      "--accent-bg": "#4a1020",
      "--ok": "#00ebc7",
      "--ok-bg": "#004d40",
      "--err": "#b91c1c",
      "--err-bg": "#fee2e2",
      "--warn": "#96570a",
      "--warn-bg": "#fff1e0"
    },
    dark: {
      "--line-2": "#1b2d45",
      "--fill": "#0d2544",
      "--fill-2": "#001534",
      "--accent-bg": "#4a1020",
      "--ok": "#00ebc7",
      "--ok-bg": "#082142",
      "--err": "#fca5a5",
      "--err-bg": "#450a0a",
      "--warn": "#fbbf24",
      "--warn-bg": "#3b2a13"
    }
  },
  happyhues3: {
    light: {
      "--line-2": "#90b4ce",
      "--fill": "#e8f2fb",
      "--fill-2": "#d8eefe",
      "--accent-bg": "#2a0810",
      "--ok": "#166534",
      "--ok-bg": "#e3f3ea",
      "--err": "#b91c1c",
      "--err-bg": "#fee2e2",
      "--warn": "#96570a",
      "--warn-bg": "#fff1e0"
    },
    dark: {
      "--line-2": "#1e3b5f",
      "--fill": "#162b47",
      "--fill-2": "#0b1a2d",
      "--accent-bg": "#2a0810",
      "--ok": "#86efac",
      "--ok-bg": "#164e63",
      "--err": "#fca5a5",
      "--err-bg": "#450a0a",
      "--warn": "#fbbf24",
      "--warn-bg": "#3b2a13"
    }
  },
  happyhues5: {
    light: {
      "--line-2": "#b7d5cd",
      "--fill": "#e8f4f0",
      "--fill-2": "#d9ebe5",
      "--accent-bg": "#2a0a06",
      "--ok": "#00473e",
      "--ok-bg": "#e3f3ea",
      "--err": "#b91c1c",
      "--err-bg": "#fee2e2",
      "--warn": "#96570a",
      "--warn-bg": "#fff1e0"
    },
    dark: {
      "--line-2": "#0f4d44",
      "--fill": "#0a3a34",
      "--fill-2": "#00473e",
      "--accent-bg": "#2a0a06",
      "--ok": "#86efac",
      "--ok-bg": "#00473e",
      "--err": "#fca5a5",
      "--err-bg": "#450a0a",
      "--warn": "#fbbf24",
      "--warn-bg": "#3b2a13"
    }
  },
  happyhues9: {
    light: {
      "--line-2": "#d0d2d8",
      "--fill": "#f5f5f7",
      "--fill-2": "#eff0f3",
      "--accent-bg": "#0a0004",
      "--ok": "#166534",
      "--ok-bg": "#e3f3ea",
      "--err": "#b91c1c",
      "--err-bg": "#fee2e2",
      "--warn": "#96570a",
      "--warn-bg": "#fff1e0"
    },
    dark: {
      "--line-2": "#333333",
      "--fill": "#202020",
      "--fill-2": "#0d0d0d",
      "--accent-bg": "#0a0004",
      "--ok": "#86efac",
      "--ok-bg": "#2a2a2a",
      "--err": "#fca5a5",
      "--err-bg": "#450a0a",
      "--warn": "#fbbf24",
      "--warn-bg": "#3b2a13"
    }
  }
};
const D6_PILL_OK = {
  happyhues2: { light: ["#00214d", "#00ebc7"], dark: ["#00ebc7", "#082142"] },
  happyhues3: { light: ["#166534", "#e3f3ea"], dark: ["#86efac", "#164e63"] },
  happyhues5: { light: ["#00473e", "#e3f3ea"], dark: ["#86efac", "#00473e"] },
  happyhues9: { light: ["#166534", "#e3f3ea"], dark: ["#86efac", "#2a2a2a"] }
};
const D6_PILL_ERR = { light: ["#b91c1c", "#fee2e2"], dark: ["#fca5a5", "#450a0a"] };

function resolveValue(raw, themeVars, seen) {
  const references = String(raw).match(/var\(/g) || [];
  assert(references.length <= 1, `兩層以上 var() 無法明確解析：${raw}`);
  const single = /^var\(\s*(--[\w-]+)\s*\)$/.exec(String(raw).trim());
  if (!single) {
    assert(references.length === 0, `var() 形式不受支援：${raw}`);
    return raw;
  }
  return resolveCustomProperty(single[1], themeVars, seen || new Set());
}

function resolveCustomProperty(name, themeVars, seen) {
  assert(!seen.has(name), `角色的 var() 參考形成循環：${name}`);
  seen.add(name);
  const raw = Object.prototype.hasOwnProperty.call(themeVars, name) ? themeVars[name] : THEME_MAP.rootVars[name];
  assert(raw !== undefined, `找不到角色 ${name}`);
  return resolveValue(raw, themeVars, seen);
}

function resolvedRole(themeKey, role) {
  return resolveCustomProperty(role, THEME_MAP.themes[themeKey], new Set());
}

function themeHash(vars, roles) {
  const entries = (roles || Object.keys(vars))
    .filter(function (name) {
      return Object.prototype.hasOwnProperty.call(vars, name);
    })
    .sort()
    .map(function (name) {
      return [name, vars[name]];
    });
  return crypto.createHash("sha256").update(JSON.stringify(entries)).digest("hex").slice(0, 12);
}

function assertStaticContract(config) {
  const expectedThemeCount = config.styles.length * 2;
  assert.strictEqual(Object.keys(THEME_MAP.themes).length, expectedThemeCount, "主題總數應為風格數的兩倍");
  config.styles.forEach(function (style) {
    ["light", "dark"].forEach(function (mode) {
      const key = `${style.id}:${mode}`;
      const vars = THEME_MAP.themes[key];
      assert(vars, `缺少 ${key} 主題區塊`);
      CORE_ROLES.forEach(function (role) {
        assert(Object.prototype.hasOwnProperty.call(vars, role), `${key} 自身區塊缺少核心角色 ${role}`);
      });
      const override = THEME_MAP.focusOverrides[style.id];
      const focusValue = override || vars["--focus-ring"] || THEME_MAP.rootVars["--focus-ring"] || vars["--accent"];
      const focusColor = resolveValue(focusValue, vars, new Set());
      const focusContrast = computeContrast(focusColor, resolvedRole(key, "--paper"));
      assert(focusContrast !== null && focusContrast >= 3, `${key} 焦點環對比不足：${focusContrast}`);
      ["--ok", "--ok-bg", "--err", "--err-bg"].forEach(function (role) {
        assert(/^#[0-9a-f]{6}$/i.test(resolvedRole(key, role)), `${key} ${role} 須解析為明確色值`);
      });
    });
  });
  Object.keys(UNCHANGED_BASELINE).forEach(function (key) {
    assert.strictEqual(themeHash(THEME_MAP.themes[key]), UNCHANGED_BASELINE[key], `${key} 既有角色值被改變`);
  });
  NEW_STYLE_IDS.forEach(function (styleId) {
    ["light", "dark"].forEach(function (mode) {
      const key = `${styleId}:${mode}`;
      [
        ["--ok", "--ok-bg"],
        ["--err", "--err-bg"]
      ].forEach(function ([foreground, background]) {
        const ratio = computeContrast(resolvedRole(key, foreground), resolvedRole(key, background));
        assert(ratio !== null && ratio >= 4.5, `${key} ${foreground} 對比不足：${ratio}`);
      });
    });
  });
}

function assertComponentPair(selector, foreground, background) {
  // D6 規則刻意重複宣告以蓋過既有風格規則，取最後一筆才等同於瀏覽器套用後的結果。
  const rule = findRuleDeclarations(selector, true);
  assert(new RegExp(`background-color:\\s*${background}\\s*;`, "i").test(rule), `${selector} 背景須為 ${background}`);
  assert(new RegExp(`color:\\s*${foreground}\\s*;`, "i").test(rule), `${selector} 前景須為 ${foreground}`);
  const ratio = computeContrast(foreground, background);
  assert(ratio !== null && ratio >= 4.5, `${selector} 對比不足：${ratio}`);
}

function assertD6Contract() {
  D6_STYLE_IDS.forEach(function (styleId) {
    ["light", "dark"].forEach(function (mode) {
      const key = `${styleId}:${mode}`;
      const vars = THEME_MAP.themes[key];
      const expected = D6_EXPECTED_ROLES[styleId][mode];
      assert.strictEqual(
        themeHash(vars, D6_UNCHANGED_ROLES),
        D6_UNCHANGED_BASELINE[key],
        `${key} D6 禁止變更的角色被改動`
      );
      Object.keys(expected).forEach(function (role) {
        assert.strictEqual(vars[role], expected[role], `${key} ${role} 修補值不符`);
        assert(/^#[0-9a-f]{6}$/i.test(vars[role]), `${key} ${role} 須為明示色值`);
      });
      ["--grid", "--shadow", "--sans", "--mono", "--radius"].forEach(function (role) {
        assert(!Object.prototype.hasOwnProperty.call(vars, role), `${key} 不應重複宣告已由 :root 提供的 ${role}`);
      });
      [
        ["--accent", "--accent-bg"],
        ["--ok", "--ok-bg"],
        ["--err", "--err-bg"],
        ["--warn", "--warn-bg"]
      ].forEach(function ([foreground, background]) {
        const ratio = computeContrast(resolvedRole(key, foreground), resolvedRole(key, background));
        assert(ratio !== null && ratio >= 4.5, `${key} ${foreground} 對 ${background} 對比不足：${ratio}`);
      });
      const themeSuffix = mode === "dark" ? '[data-theme="dark"]' : "";
      const pillOk = D6_PILL_OK[styleId][mode];
      const pillErr = D6_PILL_ERR[mode];
      assertComponentPair(`html[data-style="${styleId}"]${themeSuffix} .pill.ok`, pillOk[0], pillOk[1]);
      assertComponentPair(`html[data-style="${styleId}"]${themeSuffix} .pill.err`, pillErr[0], pillErr[1]);
      assert.notStrictEqual(pillOk[0], pillErr[0], `${key} 成功與失敗前景須可區辨`);
      assert.notStrictEqual(pillOk[1], pillErr[1], `${key} 成功與失敗背景須可區辨`);
    });
  });
  [
    ['html[data-style="happyhues3"] .btn.primary', "#00214d", "#3da9fc"],
    ['html[data-style="happyhues3"][data-theme="dark"] .btn.primary', "#fffffe", "#1e3b5f"],
    ['html[data-style="happyhues3"] .nav-tab.active', "#00214d", "#3da9fc"],
    ['html[data-style="happyhues3"][data-theme="dark"] .nav-tab.active', "#fffffe", "#1e3b5f"]
  ].forEach(function ([selector, foreground, background]) {
    assertComponentPair(selector, foreground, background);
  });
  assert.strictEqual(STYLES_CSS.indexOf("--sans: var(--body-font)"), -1, "不得建立 --sans 循環別名");
  assert.strictEqual((STYLES_CSS.match(/matrix-filter-pill/g) || []).length, 45, "不得新增 .matrix-filter-pill 規則");
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

  assertStaticContract(config);
  console.log("   ✓ 全部風格角色完整、焦點環與既有色值不回退驗證通過");

  assertD6Contract();
  console.log("   ✓ D6 四款角色修補與元件色對契約驗證通過");

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

  [
    'html[data-style="cover-lime"] .btn.primary',
    'html[data-style="cover-lime"][data-theme="dark"] .btn.primary'
  ].forEach(function (selector) {
    const rule = findRuleDeclarations(selector);
    assert(/background:\s*var\(--cover-lime\)/.test(rule), `${selector} 須為檸檬底`);
    assert(/color:\s*#111111/.test(rule), `${selector} 須為墨黑字`);
  });
  ["navy-brick", "celadon-mint"].forEach(function (styleId) {
    const rule = findRuleDeclarations(`html[data-style="${styleId}"][data-theme="dark"] .btn.primary`);
    assert(/background:\s*var\(--accent-bg\)/.test(rule), `${styleId} 深色按鈕須用 --accent-bg`);
    assert(/color:\s*var\(--ink\)/.test(rule), `${styleId} 深色按鈕須用 --ink`);
    const vars = readCssBlock(`html[data-style="${styleId}"][data-theme="dark"]`);
    const ratio = computeContrast(vars["--ink"], vars["--accent-bg"]);
    assert(ratio !== null && ratio >= 4.5, `${styleId} 深色按鈕對比不足：${ratio}`);
  });
  assert.strictEqual(computeContrast("#111111", coverLight["--accent-bg"]) >= 4.5, true);
  assert.strictEqual(computeContrast("#111111", "#c7f03b") >= 4.5, true);
  NEW_STYLE_IDS.forEach(function (styleId) {
    const rule = findRuleDeclarations(`html[data-style="${styleId}"] .app-nav :focus-visible`);
    assert(/outline-color:\s*var\(--style-nav-ink\)/.test(rule), `${styleId} 深色帶焦點環須用 --style-nav-ink`);
  });
  const limeActiveFocus = findRuleDeclarations('html[data-style="cover-lime"] .nav-tab.active:focus-visible');
  const limeDarkActiveFocus = findRuleDeclarations(
    'html[data-style="cover-lime"][data-theme="dark"] .nav-tab.active:focus-visible'
  );
  assert(/outline-color:\s*#111111/.test(limeActiveFocus), "淺色啟用頁籤焦點環須為墨黑");
  assert(/outline-offset:\s*-5px/.test(limeActiveFocus), "啟用頁籤焦點環須向內 5px");
  assert(/outline-color:\s*#c7f03b/.test(limeDarkActiveFocus), "深色啟用頁籤焦點環須為檸檬色");
  const focusPairs = [
    ["#111111", coverLight["--accent-bg"], "淺色"],
    ["#c7f03b", coverDark["--accent-bg"], "深色"]
  ];
  focusPairs.forEach(function ([foreground, background, label]) {
    const ratio = computeContrast(foreground, background);
    assert(ratio !== null && ratio >= 3, `cover-lime ${label} 啟用頁籤焦點環對比不足：${ratio}`);
  });
  console.log("   ✓ 按鈕與焦點環對比契約驗證通過");

  const wideBand = /@media\s*\(min-width:\s*1200px\)\s*\{([\s\S]*?)\}/.exec(CSS_WITHOUT_COMMENTS);
  assert(wideBand, "須有 1200px 以上寬螢幕規則");
  NEW_STYLE_IDS.forEach(function (styleId) {
    assert(wideBand[1].indexOf(`html[data-style="${styleId}"] .app-nav`) !== -1, `${styleId} 須納入寬螢幕深色帶`);
  });
  assert(/min-height:\s*232px/.test(wideBand[1]), "寬螢幕深色帶高度須為 232px");
  assert(/overflow-x:\s*auto/.test(findRuleDeclarations(".app-nav")), "共用 .app-nav 仍須可橫向捲動");
  assert.strictEqual((CSS_WITHOUT_COMMENTS.match(/outline:\s*none/g) || []).length, 4, "不得新增第五處 outline: none");
  assert.strictEqual(STYLES_CSS.indexOf("prefers-contrast"), -1, "不得移植 prefers-contrast 外圈");
  assert(
    UI_JS.indexOf('bindings.delegate(doc, "change", "[data-ui-action=\'apply-style\']"') !== -1,
    "風格事件委派須保留"
  );
  assert(UI_JS.indexOf('aria-current="page"') !== -1, "頁籤 aria-current 須保留");
  assert(UI_JS.indexOf('<option value="') !== -1, "風格下拉 option 渲染須保留");
  console.log("   ✓ 寬螢幕深色帶與既有事件／無障礙行為回歸驗證通過");

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

  assertDynamicOperations(config);
}

function assertDynamicOperations(config) {
  const dom = harness.createA11yDocument("light");
  const styleIds = config.styles.map(function (style) {
    return style.id;
  });
  assert.strictEqual(styleIds.length, 16, "風格總數須為 16");

  styleIds.forEach(function (styleId) {
    harness.resetDocument(dom, "light");
    const ctx = harness.createFrontend(dom, {
      view: "ready",
      tab: "courses",
      courses: { list: [harness.COURSE_ROW], page: 1, pageSize: 30, total: 1 }
    });
    ctx.app.render();
    const keyword = ctx.document.getElementById("courseSearchKeyword");
    assert(keyword, `${styleId} 課程頁須有搜尋輸入`);
    keyword.value = `關鍵字-${styleId}`;
    keyword.focus();
    assert.strictEqual(ctx.document.activeElement, keyword, `${styleId} 搜尋輸入須可聚焦`);
    const activeTabBefore = ctx.document.querySelector(".nav-tab.active");
    assert(activeTabBefore && activeTabBefore.dataset.tab === "courses", `${styleId} 目前頁籤須為 courses`);
    const themeBefore = ctx.MEA.ui.currentTheme();

    assert.strictEqual(ctx.MEA.ui.applyStyle(styleId), styleId);
    assert.strictEqual(ctx.document.documentElement.dataset.style, styleId);
    assert.strictEqual(ctx.window.localStorage.getItem(config.styleKey), styleId);
    ctx.MEA.ui.toggleTheme();
    assert.notStrictEqual(ctx.MEA.ui.currentTheme(), themeBefore, `${styleId} 主題切換須生效`);
    assert.strictEqual(ctx.document.documentElement.dataset.style, styleId, `${styleId} 主題切換不得改變風格`);
    assert.strictEqual(ctx.document.getElementById("courseSearchKeyword").value, `關鍵字-${styleId}`);
    assert.strictEqual(ctx.document.querySelector(".nav-tab.active").dataset.tab, "courses");
    assert.strictEqual(ctx.document.activeElement, ctx.document.getElementById("courseSearchKeyword"));

    // 不呼叫 app.init()，直接以新的前端上下文讀回 localStorage，驗證重新初始化。
    harness.resetDocument(dom, "light");
    const restored = harness.createFrontend(dom, { view: "ready", tab: "overview" });
    restored.app.render();
    restored.MEA.ui.initThemeAndStyle();
    assert.strictEqual(restored.document.documentElement.dataset.style, styleId, `${styleId} 重新初始化須還原風格`);
    assert.strictEqual(restored.MEA.ui.currentTheme(), ctx.MEA.ui.currentTheme(), `${styleId} 重新初始化須還原主題`);
  });
  console.log(`   ✓ ${styleIds.length} 款風格套用、持久化、重新初始化與主題切換驗證通過`);

  dom.window.localStorage.setItem(config.styleKey, "unknown-style-for-test");
  harness.resetDocument(dom, "light");
  const fallback = harness.createFrontend(dom, { view: "ready", tab: "overview" });
  fallback.app.render();
  fallback.MEA.ui.initThemeAndStyle();
  assert.strictEqual(fallback.document.documentElement.dataset.style, config.defaultStyle);
  assert.strictEqual(dom.window.localStorage.getItem(config.styleKey), config.defaultStyle);
  console.log("   ✓ 全部風格未知值回退驗證通過");

  const controlByTab = {
    overview: "styleSelect",
    import: "fileInput",
    courses: "courseSearchKeyword",
    settings: "cfgSystemName",
    activityLog: "activityLogStartDate"
  };
  const roles = [
    {
      label: "一般使用者",
      user: { name: "測試教師", email: "teacher@example.edu.tw", role: "teacher", roleName: "授課教師" },
      expected: 4
    },
    { label: "管理員", user: harness.ADMIN_USER, expected: 5 }
  ];
  roles.forEach(function (role) {
    Object.keys(controlByTab).forEach(function (tabId) {
      harness.resetDocument(dom, "light");
      const ctx = harness.createFrontend(dom, { view: "ready", tab: tabId, user: role.user });
      ctx.app.render();
      const tabs = Array.from(ctx.document.querySelectorAll(".nav-tab"));
      assert.strictEqual(tabs.length, role.expected, `${role.label} 頁籤數不符`);
      assert.strictEqual(
        tabs.some(function (tab) {
          return tab.dataset.tab === "activityLog";
        }),
        role.expected === 5,
        `${role.label} 的 adminOnly 頁籤可見性不符`
      );
      if (role.expected === 4 && tabId === "activityLog") {
        assert(ctx.document.querySelector(".overview-panel"), "一般使用者不得進入操作日誌內容");
        assert(!ctx.document.getElementById(controlByTab.activityLog), "一般使用者不得見到操作日誌控制項");
        ctx.MEA.setTab("activityLog");
        assert.strictEqual(ctx.MEA.state.tab, "overview", "setTab 須將一般使用者導回概覽");
        return;
      }
      if (role.expected === 4 && tabId === "settings") {
        const deniedTitle = ctx.document.querySelector(".panel-title");
        assert(deniedTitle && deniedTitle.textContent.indexOf("權限不足") !== -1, "一般使用者設定頁須顯示權限不足");
        assert(ctx.document.querySelector(".alert.err"), "一般使用者設定頁須顯示權限警示");
        assert(!ctx.document.getElementById(controlByTab.settings), "一般使用者不得見到系統設定控制項");
        return;
      }
      assert(
        tabs.some(function (tab) {
          return tab.dataset.tab === tabId;
        }),
        `${role.label} 缺少 ${tabId} 頁籤`
      );
      const control = ctx.document.getElementById(controlByTab[tabId]);
      assert(control, `${role.label} ${tabId} 缺少控制項 ${controlByTab[tabId]}`);
      control.focus();
      assert.strictEqual(ctx.document.activeElement, control, `${role.label} ${tabId} 控制項須可聚焦`);
    });
  });
  console.log("   ✓ 一般使用者 4 頁籤與管理員 5 頁籤守門及控制項可聚焦驗證通過");
}

async function runA11yAudit() {
  const dom = harness.createA11yDocument("light");
  dom.window.HTMLCanvasElement.prototype.getContext = function () {
    return null;
  };
  const fixtures = harness.collectFixtures().filter(function (fixture) {
    return (
      fixture.theme === "light" && ["overview", "courses", "settings", "activity-log"].indexOf(fixture.name) !== -1
    );
  });
  assert.strictEqual(fixtures.length, 4, "須取得四個代表的已登入畫面");
  const cases = [];
  NEW_STYLE_IDS.forEach(function (styleId) {
    ["light", "dark"].forEach(function (theme) {
      fixtures.forEach(function (fixture) {
        cases.push({ styleId: styleId, theme: theme, fixture: fixture });
      });
    });
  });
  ["modern-slate", "blueprint", "nes", "happyhues9"].forEach(function (styleId) {
    cases.push({ styleId: styleId, theme: "light", fixture: fixtures[0] });
  });
  const previousWindow = global.window;
  const previousDocument = global.document;
  global.window = dom.window;
  global.document = dom.window.document;
  // axe-core 在載入時擷取全域 window，必須於設定 globals 之後才 require。
  const axe = require("axe-core");
  const failures = [];
  try {
    for (let i = 0; i < cases.length; i++) {
      const testCase = cases[i];
      const doc = checkA11y.renderFixture(Object.assign({}, testCase.fixture, { theme: testCase.theme }), dom);
      doc.documentElement.dataset.style = testCase.styleId;
      const results = await axe.run(doc, checkA11y.RUN_OPTIONS);
      results.violations.forEach(function (violation) {
        failures.push({
          style: testCase.styleId,
          theme: testCase.theme,
          fixture: testCase.fixture.name,
          rule: violation.id,
          nodes: violation.nodes.map(function (node) {
            return node.target.join(" ");
          })
        });
      });
    }
  } finally {
    global.window = previousWindow;
    global.document = previousDocument;
  }
  assert.deepStrictEqual(failures, [], `結構稽核發現違規：${JSON.stringify(failures)}`);
  console.log(`   ✓ ${cases.length} 個風格畫面結構稽核通過（僅結構，不驗證色彩）`);
}

async function main() {
  run();
  await runA11yAudit();
  console.log("✓ visualStyleThemes 測試全數通過！\n");
}

main().catch(function (error) {
  console.error(error);
  process.exit(1);
});
