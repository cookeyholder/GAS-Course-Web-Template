/**
 * @file config.js
 * @description 前端全域設定與導覽功能定義
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const isFile = window.location.protocol === "file:";
  const apiParam = params.get("api");
  const isGoogleUserContent =
    typeof window.location !== "undefined" &&
    window.location.hostname &&
    window.location.hostname.indexOf("googleusercontent.com") !== -1;
  const gasUrl =
    typeof window.GAS_WEBAPP_URL === "string" && window.GAS_WEBAPP_URL.indexOf("http") === 0
      ? window.GAS_WEBAPP_URL
      : "";

  let defaultApiUrl = "";
  if (apiParam) {
    defaultApiUrl = apiParam;
  } else if (gasUrl) {
    defaultApiUrl = gasUrl;
  } else if (!isFile && !isGoogleUserContent) {
    defaultApiUrl = window.location.href.split("#")[0].split("?")[0];
  }

  MEA.config = {
    title: "Google Apps Script 應用程式範本",
    version: "1.0.0",
    mock: params.has("mock"),
    switchAccount: window.SWITCH_ACCOUNT === true || params.get("switch") === "1",
    apiUrl: defaultApiUrl,
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
      { id: "happyhues3", name: "海洋湛藍 (Happy Hues #3)", icon: "🌊", desc: "冰川淡藍底 · 湛藍按鈕 · 海軍藍高對比" },
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
      { id: "import", name: "課程代碼匯入", icon: "📥", desc: "上傳課綱 Excel 並執行 1NF 正規化" },
      { id: "courses", name: "正規化課程索引", icon: "📚", desc: "檢視與檢索已展開之課程資料" },
      { id: "settings", name: "系統設定與授權", icon: "⚙️", desc: "OAuth Client ID 與角色成員" }
    ],
    roleNames: {
      admin: "系統管理員",
      staff: "業務人員",
      viewer: "檢視人員"
    }
  };
})(window.MEA);
