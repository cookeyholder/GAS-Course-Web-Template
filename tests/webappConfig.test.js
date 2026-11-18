"use strict";

/**
 * webapp/js/config.js 單元測試（G4.3）
 * 驗證前端設定解析、預設 API URL 推導與設定結構行為。
 */

const assert = require("assert");
const configModule = require("../webapp/js/config.js");

console.log("開始執行 webapp/js/config.js 測試...\n");

console.log("1. 應匯出可測試的設定建構/解析函式...");
{
  assert.strictEqual(typeof configModule.buildFrontendConfig, "function", "應匯出 buildFrontendConfig");
  assert.strictEqual(typeof configModule.resolveDefaultApiUrl, "function", "應匯出 resolveDefaultApiUrl");
  console.log("   ✓ 匯出介面驗證通過！\n");
}

function baseEnv(overrides) {
  return Object.assign(
    {
      search: "",
      protocol: "https:",
      hostname: "example.com",
      href: "https://example.com/app/index.html?x=1#hash",
      gasWebappUrl: "",
      switchAccount: false
    },
    overrides || {}
  );
}

console.log("2. resolveDefaultApiUrl：api 參數優先...");
{
  const url = configModule.resolveDefaultApiUrl(baseEnv({ search: "?api=https://api.test/exec&mock=true" }));
  assert.strictEqual(url, "https://api.test/exec");
  console.log("   ✓ api 參數優先驗證通過！\n");
}

console.log("3. resolveDefaultApiUrl：gasWebappUrl 次之（需為 http 開頭）...");
{
  assert.strictEqual(
    configModule.resolveDefaultApiUrl(
      baseEnv({ search: "", gasWebappUrl: "https://script.google.com/macros/s/abc/exec" })
    ),
    "https://script.google.com/macros/s/abc/exec"
  );
  assert.strictEqual(
    configModule.resolveDefaultApiUrl(baseEnv({ search: "", gasWebappUrl: "http://localhost:3000" })),
    "http://localhost:3000"
  );
  // 非 http 開頭不採用
  assert.strictEqual(
    configModule.resolveDefaultApiUrl(baseEnv({ search: "", gasWebappUrl: "ftp://x", protocol: "file:" })),
    ""
  );
  console.log("   ✓ gasWebappUrl 驗證通過！\n");
}

console.log("4. resolveDefaultApiUrl：file 與 googleusercontent 環境預設為空字串...");
{
  assert.strictEqual(configModule.resolveDefaultApiUrl(baseEnv({ protocol: "file:", hostname: "" })), "");
  assert.strictEqual(
    configModule.resolveDefaultApiUrl(baseEnv({ protocol: "https:", hostname: "n-abc.googleusercontent.com" })),
    ""
  );
  assert.strictEqual(
    configModule.resolveDefaultApiUrl(baseEnv({ protocol: "https:", hostname: "sub.googleusercontent.com" })),
    ""
  );
  console.log("   ✓ file/googleusercontent 驗證通過！\n");
}

console.log("5. resolveDefaultApiUrl：一般網頁環境使用去除 query/hash 的 href...");
{
  const url = configModule.resolveDefaultApiUrl(
    baseEnv({
      search: "",
      protocol: "https:",
      hostname: "example.com",
      href: "https://example.com/path/page.html?a=1&b=2#section"
    })
  );
  assert.strictEqual(url, "https://example.com/path/page.html");
  console.log("   ✓ 一般網頁 href 驗證通過！\n");
}

console.log("6. buildFrontendConfig 應正確解析 mock 與 switchAccount...");
{
  const c1 = configModule.buildFrontendConfig(baseEnv({ search: "?mock=true&switch=1", switchAccount: false }));
  assert.strictEqual(c1.mock, true);
  assert.strictEqual(c1.switchAccount, true);

  const c2 = configModule.buildFrontendConfig(baseEnv({ search: "?switch=0", switchAccount: true }));
  assert.strictEqual(c2.mock, false);
  assert.strictEqual(c2.switchAccount, true);

  const c3 = configModule.buildFrontendConfig(baseEnv({ search: "", switchAccount: false }));
  assert.strictEqual(c3.mock, false);
  assert.strictEqual(c3.switchAccount, false);

  const c4 = configModule.buildFrontendConfig(baseEnv({ search: "?mock" }));
  assert.strictEqual(c4.mock, true);

  console.log("   ✓ mock/switchAccount 驗證通過！\n");
}

console.log("7. buildFrontendConfig 應包含固定中繼資料、儲存鍵與預設樣式...");
{
  const c = configModule.buildFrontendConfig(baseEnv());
  assert.strictEqual(c.title, "Google Apps Script 應用程式範本");
  assert.strictEqual(c.version, "1.0.0");
  assert.strictEqual(c.storageKey, "gas_tmpl.session.v1");
  assert.strictEqual(c.themeKey, "gas_tmpl.theme.v1");
  assert.strictEqual(c.styleKey, "gas_tmpl.style.v1");
  assert.strictEqual(c.defaultStyle, "modern-slate");
  assert(Array.isArray(c.styles) && c.styles.length === 13, "應包含 13 種視覺風格");
  assert(Array.isArray(c.tabs) && c.tabs.length === 4, "應包含 4 個導覽頁籤");
  assert.deepStrictEqual(c.roleNames, { admin: "系統管理員", staff: "業務人員", viewer: "檢視人員" });
  console.log("   ✓ 固定設定驗證通過！\n");
}

console.log("8. styles 應包含各風格識別與名稱（確保所有視覺風格定義存在）...");
{
  const c = configModule.buildFrontendConfig(baseEnv());
  const ids = c.styles.map(function (s) {
    return s.id;
  });
  assert.deepStrictEqual(ids, [
    "modern-slate",
    "blueprint",
    "paper",
    "neobrutalism",
    "claymorphism",
    "nes",
    "happyhues2",
    "happyhues3",
    "happyhues5",
    "happyhues9",
    "happyhues10",
    "happyhues12",
    "happyhues14"
  ]);
  c.styles.forEach(function (s) {
    assert(typeof s.id === "string" && s.id.length > 0);
    assert(typeof s.name === "string" && s.name.length > 0);
    assert(typeof s.icon === "string" && s.icon.length > 0);
    assert(typeof s.desc === "string" && s.desc.length > 0);
  });
  console.log("   ✓ 視覺風格定義驗證通過！\n");
}

console.log("9. tabs 與 apiUrl 應依環境正確產生...");
{
  const c = configModule.buildFrontendConfig(
    baseEnv({
      search: "?api=https://x.test/run",
      href: "https://example.com/app?y=1#z"
    })
  );
  assert.strictEqual(c.apiUrl, "https://x.test/run");
  assert.deepStrictEqual(
    c.tabs.map(function (t) {
      return t.id;
    }),
    ["overview", "import", "courses", "settings"]
  );
  c.tabs.forEach(function (t) {
    assert(t.name && t.icon && t.desc);
  });
  console.log("   ✓ tabs 與 apiUrl 驗證通過！\n");
}

console.log("10. applyBrowserConfig 應將瀏覽器參數組裝為 MEA.config...");
{
  assert.strictEqual(typeof configModule.applyBrowserConfig, "function", "應匯出 applyBrowserConfig");
  const root = {};
  const win = {
    location: {
      search: "?mock=true&switch=1&api=https://x.test/exec",
      protocol: "https:",
      hostname: "example.com",
      href: "https://example.com/app?mock=true#h"
    },
    GAS_WEBAPP_URL: "https://script.google.com/macros/s/abc/exec",
    SWITCH_ACCOUNT: false
  };
  const config = configModule.applyBrowserConfig(root, win);
  assert.strictEqual(root.MEA.config, config);
  assert.strictEqual(config.mock, true);
  assert.strictEqual(config.switchAccount, true);
  assert.strictEqual(config.apiUrl, "https://x.test/exec");
  assert.strictEqual(config.hostname === undefined, true);

  const fallback = configModule.applyBrowserConfig({}, { GAS_WEBAPP_URL: "ftp://x", SWITCH_ACCOUNT: true });
  assert.strictEqual(fallback.apiUrl, "");
  assert.strictEqual(fallback.switchAccount, true);
  console.log("   ✓ 瀏覽器設定組裝驗證通過！\n");
}

console.log("✓ webapp/js/config.js 測試全數通過！\n");
