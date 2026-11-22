## ADDED Requirements

### Requirement: 全專案文件與 JSDoc 單一事實來源同步
專案之所有核心技術文件（含 `README.md`、`AGENTS.md`、`docs/*.html`、`docs/參考資料/README.md`）與全專案 JavaScript 函式之 JSDoc 註解，MUST 100% 以實際程式碼實作現況為單一事實來源（Single Source of Truth）。
1. **JSDoc 實體對齊**：所有後端（根目錄 `*.js`，排除打包產物 `version.generated.js`）與前端（`webapp/js/*.js`）函式之 JSDoc MUST 準確描述真實參數名稱、型別、預設值、選擇性參數（Optional Parameters，如 options 內部欄位）、回傳物件結構、非同步 Promise 行為與例外拋出條件。嚴禁受歷史殘留註解影響而保留不符實作的過時說明。
2. **手冊與規章內容實況對齊**：專案說明文件 MUST 完整反映當前之 Node.js 24 支援環境、Web App 文件白名單路由機制（`WEB_APP_DOC_ROUTES`）、`paged-table-container` 前端分頁元件、四維度 Empty State CTA 智慧引導、全站安全降級防護純函式（`safeEscapeHtml`、`safeNumber`、`safeToast`）、說明手冊網址解析與頁尾外部連結規範，以及 108 課綱 1NF 正規化 14 欄寬表展開演算法。
3. **文件導覽與目錄樹完整性**：`docs/index.html` MUST 包含所有已登錄文件（至少包含 `user-guide.html`）之導覽卡片與正確超連結；`README.md` 專案目錄樹 MUST 涵蓋現有所有架構核心模組與參考資料 CSV。
4. **無障礙與品質閘門規格同步**：文件內容 MUST 正確載明 11 步本地與 CI 品質閘門指令、覆蓋率不回退原則、WCAG 2.1 AA 與 2.5.3 規範，且全篇嚴格使用臺灣繁體中文（`zh-TW`），禁止中國用語與簡體字。

#### Scenario: 檢視函式 JSDoc 與實作程式碼無落差
- **WHEN** 開發者或靜態分析工具檢核任何後端或前端函式
- **THEN** 其 JSDoc 標註的參數清單、型別定義、選擇性相依物件（如 `options.eventBindings`）與回傳結構均與函式原始碼實作 100% 吻合

#### Scenario: 檢視專案文件與架構路由現況一致
- **WHEN** 閱讀 `README.md`、`AGENTS.md` 或 `docs/` 下之任一技術指南
- **THEN** 內文記載之系統架構、模組職責劃分、Web API 路由清單、前端元件結構與日常開發指令均能對應至目前程式碼實況，無失效路徑、漏列模組或過時參數
