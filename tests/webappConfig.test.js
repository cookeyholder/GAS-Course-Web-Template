"use strict";

/**
 * webapp/js/config.js 單元測試（G4.3）
 * 驗證前端設定解析、預設 API URL 推導與設定結構行為。
 */

const assert = require("assert");
const configModule = require("../webapp/js/config.js");
const gasRuntime = require("../gasRuntime.js");

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
  assert.strictEqual(c.version, gasRuntime.WEB_API_VERSION);
  assert.strictEqual(c.storageKey, "gas_tmpl.session.v1");
  assert.strictEqual(c.themeKey, "gas_tmpl.theme.v1");
  assert.strictEqual(c.styleKey, "gas_tmpl.style.v1");
  assert.strictEqual(c.defaultStyle, "modern-slate");
  assert(Array.isArray(c.styles) && c.styles.length === 16, "應包含 16 種視覺風格");
  assert(Array.isArray(c.tabs) && c.tabs.length === 5, "應包含 5 個導覽頁籤");
  assert.deepStrictEqual(c.roleNames, gasRuntime.ROLE_DEFINITIONS);
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
    "happyhues14",
    "navy-brick",
    "celadon-mint",
    "cover-lime"
  ]);
  assert.deepStrictEqual(
    c.styles
      .filter(function (s) {
        return ["navy-brick", "celadon-mint", "cover-lime"].indexOf(s.id) !== -1;
      })
      .map(function (s) {
        return [s.id, s.name, s.icon, s.desc];
      }),
    [
      ["navy-brick", "藏青磚紅 (Navy Brick)", "📘", "米紙底色 · 藏青導覽 · 磚紅強調"],
      ["celadon-mint", "青瓷薄荷 (Celadon Mint)", "🍵", "瓷白底色 · 松綠導覽 · 薄荷強調"],
      ["cover-lime", "封面檸檬 (Cover Lime)", "🍋", "暖米封面 · 墨黑粗體 · 檸檬螢光"]
    ]
  );
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
    ["overview", "import", "courses", "settings", "activityLog"]
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

console.log("11. isTrustedApiEndpoint 應處理缺值、相對網址與異常設定...");
{
  const endpoint = configModule.isTrustedApiEndpoint;
  assert.strictEqual(endpoint("", {}), false, "空白端點應拒絕");
  assert.strictEqual(endpoint("http://[", {}), false, "無效網址應拒絕");
  assert.strictEqual(endpoint("https://script.google.com/macros/s/DEPLOY/exec"), true, "缺少環境參數仍應接受 GAS 網址");
  assert.strictEqual(
    endpoint("https://example.com/webapp/api", {
      href: "https://example.com/app",
      gasWebappUrl: "/webapp"
    }),
    true,
    "相對 GAS 路徑應解析為同源端點"
  );
  assert.strictEqual(
    endpoint("https://example.com/api", {
      href: "https://example.com/app",
      gasWebappUrl: "bad://["
    }),
    true,
    "異常 GAS 設定應略過並續用同源規則"
  );
  assert.strictEqual(
    endpoint("https://localhost/api", { href: "https://example.com/app", protocol: "file:", hostname: "" }),
    true,
    "本機端點於空主機名稱環境仍應接受"
  );
  console.log("   ✓ API 端點邊界驗證通過！\n");
}

console.log("12. 前端設定應優先使用已嵌入的 gasRuntime...");
{
  const originalRuntime = globalThis.gasRuntime;
  const configPath = require.resolve("../webapp/js/config.js");
  globalThis.gasRuntime = gasRuntime;
  delete require.cache[configPath];
  const embeddedConfigModule = require("../webapp/js/config.js");
  const embedded = embeddedConfigModule.buildFrontendConfig(baseEnv());
  assert.strictEqual(embedded.version, gasRuntime.WEB_API_VERSION);
  assert.deepStrictEqual(embedded.roleNames, gasRuntime.ROLE_DEFINITIONS);
  delete require.cache[configPath];
  globalThis.gasRuntime = originalRuntime;
  console.log("   ✓ 內嵌共用模組驗證通過！\n");
}

console.log("✓ webapp/js/config.js 測試全數通過！\n");
