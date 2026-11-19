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

console.log("2. resolveDefaultApiUrl：可信 api 參數優先...");
{
  const url = configModule.resolveDefaultApiUrl(
    baseEnv({ search: "?api=https://script.google.com/macros/s/DEPLOY/exec&mock=true" })
  );
  assert.strictEqual(url, "https://script.google.com/macros/s/DEPLOY/exec");
  console.log("   ✓ 可信 api 參數優先驗證通過！\n");
}

console.log("2.1 惡意 ?api= 端點應被拒絕且不回傳任何端點...");
{
  const env = baseEnv({ search: "?api=https://attacker.example/steal" });
  assert.strictEqual(configModule.resolveDefaultApiUrl(env), "");
  assert.strictEqual(configModule.isTrustedApiEndpoint("https://attacker.example/steal", env), false);
  assert.strictEqual(configModule.isTrustedApiEndpoint("javascript:alert(1)", env), false);
  assert.strictEqual(configModule.isTrustedApiEndpoint("not a url", env), false);
  console.log("   ✓ 惡意端點拒絕驗證通過！\n");
}

console.log("2.2 isTrustedApiEndpoint 應接受同源、GAS、明確設定與本機端點...");
{
  const gasUrl = "https://script.google.com/macros/s/DEPLOY/exec";
  const sameOrigin = baseEnv({ href: "https://example.com/app?x=1", gasWebappUrl: "" });
  assert.strictEqual(configModule.isTrustedApiEndpoint("https://example.com/other/exec", sameOrigin), true);
  assert.strictEqual(configModule.isTrustedApiEndpoint("/relative/exec", sameOrigin), true);
  assert.strictEqual(configModule.isTrustedApiEndpoint(gasUrl, sameOrigin), true);
  assert.strictEqual(configModule.isTrustedApiEndpoint(gasUrl + "?x=1", sameOrigin), true);

  const configured = baseEnv({ gasWebappUrl: "https://proxy.example.com/gas/exec" });
  assert.strictEqual(configModule.isTrustedApiEndpoint("https://proxy.example.com/gas/exec", configured), true);
  assert.strictEqual(configModule.isTrustedApiEndpoint("https://proxy.example.com/other", configured), false);

  const localPage = baseEnv({ protocol: "http:", hostname: "localhost", href: "http://localhost:8080/" });
  assert.strictEqual(configModule.isTrustedApiEndpoint("http://127.0.0.1:3000/exec", localPage), true);
  assert.strictEqual(configModule.isTrustedApiEndpoint("https://attacker.example/exec", localPage), false);

  const filePage = baseEnv({ protocol: "file:", hostname: "", href: "file:///tmp/index.html" });
  assert.strictEqual(configModule.isTrustedApiEndpoint("http://localhost:8080/exec", filePage), true);
  assert.strictEqual(configModule.isTrustedApiEndpoint("https://attacker.example/exec", filePage), false);
  console.log("   ✓ 可信端點白名單驗證通過！\n");
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

  const c5 = configModule.buildFrontendConfig(baseEnv({ search: "?mock=true", production: true }));
  assert.strictEqual(c5.mock, false, "正式建置不得啟用 mock");

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
      search: "?api=https://script.google.com/macros/s/DEPLOY/exec",
      href: "https://example.com/app?y=1#z"
    })
  );
  assert.strictEqual(c.apiUrl, "https://script.google.com/macros/s/DEPLOY/exec");
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
      search: "?mock=true&switch=1&api=https://script.google.com/macros/s/DEPLOY/exec",
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
  assert.strictEqual(config.apiUrl, "https://script.google.com/macros/s/DEPLOY/exec");
  assert.strictEqual(config.hostname === undefined, true);

  const productionWin = {
    location: { search: "?mock=true", protocol: "https:", hostname: "example.com", href: "https://example.com/app" },
    MEA_PRODUCTION_BUILD: true
  };
  const productionConfig = configModule.applyBrowserConfig({}, productionWin);
  assert.strictEqual(productionConfig.mock, false, "正式建置忽略 ?mock=true");

  const malicious = configModule.applyBrowserConfig(
    {},
    {
      location: {
        search: "?api=https://attacker.example/steal",
        protocol: "https:",
        hostname: "example.com",
        href: "https://example.com/app"
      }
    }
  );
  assert.strictEqual(malicious.apiUrl, "", "惡意端點不得成為 API URL");

  const fallback = configModule.applyBrowserConfig({}, { GAS_WEBAPP_URL: "ftp://x", SWITCH_ACCOUNT: true });
  assert.strictEqual(fallback.apiUrl, "");
  assert.strictEqual(fallback.switchAccount, true);
  console.log("   ✓ 瀏覽器設定組裝驗證通過！\n");
}

console.log("✓ webapp/js/config.js 測試全數通過！\n");
