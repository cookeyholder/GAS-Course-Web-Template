/**
 * @file config.js
 * @description 前端全域設定與導覽功能定義
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    api.applyBrowserConfig(root, window);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** 版本號與角色顯示名稱共用 gasRuntime 單一來源；瀏覽器由建置腳本先嵌入 gasRuntime。 */
  const gasRuntime = globalThis.gasRuntime || require("../../gasRuntime.js");

  function getSearchParams(search) {
    try {
      return new URLSearchParams(search || "");
    } catch (e) {
      return new URLSearchParams("");
    }
  }

  function isLocalHostname(hostname) {
    const value = String(hostname || "").toLowerCase();
    return value === "localhost" || value === "127.0.0.1";
  }

  /**
   * 僅接受同源、明確設定的 GAS/代理端點、script.google.com Web App 網址，
   * 以及本機開發頁面對應的本機端點；其餘 ?api= 值一律視為不可信。
   */
  function isTrustedApiEndpoint(candidate, env) {
    const raw = String(candidate || "").trim();
    if (!raw) return false;
    // 僅接受絕對 URL 或根相對路徑，避免模糊字串被 URL 解析成同源路徑。
    const hasScheme = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw);
    if (!hasScheme && raw.charAt(0) !== "/") return false;
    const source = env || {};
    let target;
    try {
      target = source.href ? new URL(raw, source.href) : new URL(raw);
    } catch (e) {
      return false;
    }
    if (target.protocol !== "http:" && target.protocol !== "https:") return false;

    const gasUrl = String(source.gasWebappUrl || "").trim();
    if (gasUrl) {
      try {
        const gas = gasUrl.indexOf("://") === -1 ? new URL(gasUrl, source.href) : new URL(gasUrl);
        if (target.origin === gas.origin && target.pathname.indexOf(gas.pathname) === 0) return true;
      } catch (e) {
        // 設定值異常時略過，改用下列規則判斷
      }
    }

    if (/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:[/?#]|$)/.test(target.href)) {
      return true;
    }

    if (source.href) {
      try {
        const page = new URL(source.href);
        if (target.origin === page.origin) return true;
      } catch (e) {
        // 頁面網址異常時略過
      }
    }

    if (source.protocol === "file:" || isLocalHostname(source.hostname)) {
      if (isLocalHostname(target.hostname)) return true;
    }

    return false;
  }

  function resolveDefaultApiUrl(env) {
    const source = env || {};
    const params = getSearchParams(source.search);
    const apiParam = params.get("api");
    const gasUrl =
      typeof source.gasWebappUrl === "string" && source.gasWebappUrl.indexOf("http") === 0 ? source.gasWebappUrl : "";
    const isFile = source.protocol === "file:";
    const hostname = source.hostname || "";
    const isGoogleUserContent = hostname.indexOf("googleusercontent.com") !== -1;
    const href = source.href || "";

    if (apiParam) {
      // 不受信任的 ?api= 直接忽略，避免 session/CSRF token 外送至惡意端點。
      return isTrustedApiEndpoint(apiParam, source) ? apiParam : "";
    }
    if (gasUrl) return gasUrl;
    if (!isFile && !isGoogleUserContent) {
      return href.split("#")[0].split("?")[0];
    }
    return "";
  }

  function buildFrontendConfig(env) {
    const source = env || {};
    const params = getSearchParams(source.search);
    const switchFromParam = params.get("switch") === "1";
    // 正式建置產物（build-webapp.js 注入 MEA_PRODUCTION_BUILD）忽略 ?mock=true。
    const isProduction = source.production === true;
    return {
      title: "Google Apps Script 應用程式範本",
      version: gasRuntime.WEB_API_VERSION,
      mock: !isProduction && params.has("mock"),
      switchAccount: source.switchAccount === true || switchFromParam,
      apiUrl: resolveDefaultApiUrl(source),
      storageKey: "gas_tmpl.session.v1",
      themeKey: "gas_tmpl.theme.v1",
      styleKey: "gas_tmpl.style.v1",
      defaultStyle: "modern-slate",
      styles: [
        {
          id: "modern-slate",
          name: "極簡曜藍 (Modern Slate)",
          icon: "✨",
          desc: "Slate 冷灰極簡 · 曜藍高對比 · 圓潤卡片與精緻微陰影"
        },
        { id: "blueprint", name: "圖紙風格 (Blueprint)", icon: "📐", desc: "工程圖紙 · 網格底紋 · 冷調科技" },
        { id: "paper", name: "紙張風格 (Paper)", icon: "📄", desc: "典雅米紙 · 襯線標題 · 人文護眼" },
        {
          id: "neobrutalism",
          name: "新粗獷主義 (Neo-Brutalism)",
          icon: "⚡",
          desc: "粗黑邊框 · 高反差硬投影 · 鮮明搶眼"
        },
        {
          id: "claymorphism",
          name: "黏土擬物 (Claymorphism)",
          icon: "🧸",
          desc: "澎潤大圓角 · 雙層內外陰影 · 立體膨脹感"
        },
        { id: "nes", name: "紅白機像素 (NES.css)", icon: "🎮", desc: "8-bit 像素框 · 復古點陣 · 經典任天堂紅白機" },
        {
          id: "happyhues2",
          name: "曜藍薄荷 (Happy Hues #2)",
          icon: "🐬",
          desc: "冷霧灰白底 · 螢光薄荷青按鈕 · 曜藍高對比"
        },
        {
          id: "happyhues3",
          name: "海洋湛藍 (Happy Hues #3)",
          icon: "🌊",
          desc: "冰川淡藍底 · 湛藍按鈕 · 海軍藍高對比"
        },
        {
          id: "happyhues5",
          name: "松石暖金 (Happy Hues #5)",
          icon: "💎",
          desc: "白露冷杉底 · 暖橘金按鈕 · 松石深綠高對比"
        },
        {
          id: "happyhues9",
          name: "黑曜暖橘 (Happy Hues #9)",
          icon: "🍊",
          desc: "極簡霧白底 · 活力亮橘按鈕 · 黑曜石極致對比"
        },
        {
          id: "happyhues10",
          name: "森林琥珀 (Happy Hues #10)",
          icon: "🌲",
          desc: "深邃森林綠 · 暖杏金按鈕 · 鼠尾草灰綠"
        },
        {
          id: "happyhues12",
          name: "午夜蜜桃 (Happy Hues #12)",
          icon: "🍑",
          desc: "夜空靛藍底 · 蜜桃柔粉按鈕 · 丁香紫藍優雅"
        },
        {
          id: "happyhues14",
          name: "薄荷暖陽 (Happy Hues #14)",
          icon: "☀️",
          desc: "清爽薄荷底 · 陽光亮黃按鈕 · 深墨藍高對比"
        }
      ],
      tabs: [
        { id: "overview", name: "概覽儀表板", icon: "📊", desc: "系統狀態與快速入口" },
        { id: "import", name: "課程代碼匯入", icon: "📥", desc: "上傳課程代碼 Excel 並執行 1NF 正規化" },
        { id: "courses", name: "正規化課程代碼", icon: "📚", desc: "檢視與檢索已展開之課程資料" },
        { id: "settings", name: "系統設定與授權", icon: "⚙️", desc: "OAuth Client ID 與角色成員" },
        {
          id: "activityLog",
          name: "操作日誌",
          icon: "📜",
          desc: "查詢操作日誌、篩選與稽核詳情",
          adminOnly: true
        }
      ],
      roleNames: Object.assign({}, gasRuntime.ROLE_DEFINITIONS)
    };
  }

  /**
   * 將瀏覽器環境參數組裝為 MEA.config（從 UMD 外層抽出以便測試）。
   *
   * @param {Object} root - 全域命名空間物件（通常為 window）
   * @param {Object} win - 瀏覽器 window 物件
   * @returns {Object} 產生的前端設定
   */
  function applyBrowserConfig(root, win) {
    const namespace = root || {};
    const browser = win || {};
    const MEA = (namespace.MEA = namespace.MEA || {});
    const location = browser.location || {};
    const search = location.search || "";
    const gasWebappUrl = typeof browser.GAS_WEBAPP_URL === "string" ? browser.GAS_WEBAPP_URL : "";
    const config = buildFrontendConfig({
      search: search,
      protocol: location.protocol || "",
      hostname: location.hostname || "",
      href: location.href || "",
      gasWebappUrl: gasWebappUrl,
      switchAccount: browser.SWITCH_ACCOUNT === true,
      production: browser.MEA_PRODUCTION_BUILD === true
    });
    MEA.config = config;
    return config;
  }

  return {
    isTrustedApiEndpoint: isTrustedApiEndpoint,
    resolveDefaultApiUrl: resolveDefaultApiUrl,
    buildFrontendConfig: buildFrontendConfig,
    applyBrowserConfig: applyBrowserConfig
  };
});
