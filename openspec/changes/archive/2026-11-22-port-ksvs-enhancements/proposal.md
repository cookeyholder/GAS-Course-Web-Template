## Why

為強化本範本專案之使用者引導體驗、架構防禦韌性、長期可維護性與文件易用性，本提案將自 `KSVS-Course-Information-Collector` 專案中經實戰驗證之 6 大架構亮點移植至本專案：
1. **課程代碼官方來源管道與格式禁忌指引**：在匯入頁面提供教育部與巨耀校務系統的確切下載路徑，並列出常見格式禁忌（如避免合併儲存格、保留標頭），降低使用者操作門檻並防止 1NF 正規化解析失敗。
2. **緊湊型字串架構（Compact String Architecture）**：維持大型靜態字典之管道符號分隔緊湊字串儲存與模組載入期立即解析快取，降低語法樹（AST）節點數，穩固全模組維護性指數（MI $\ge 50$，且不低於基準線 83.666）。
3. **空白資料庫友善引導與一鍵跳轉（Empty State CTA）**：精準結合四維度篩選（關鍵字、科別、學年度、學期）區分「資料庫無資料」與「搜尋查無結果」，在無資料時呈現直觀的 Empty State 卡片與導向匯入頁籤之 CTA 按鈕（遵從宣告式事件委派，導向單數 `'import'` 頁籤，並相容既有測試斷言）。
4. **全站外部相依安全降級防護（Graceful Degradation）**：在前端各模組強化安全純函式 fallback（包含 `safeEscapeHtml`、`safeToast`、`compareDepartmentsByCode`），杜絕未攔截之 TypeError。
5. **教育部官方參考資料目錄手冊納管（Single Source of Truth Documentation）**：在 `docs/參考資料/` 目錄建立臺灣繁體中文手冊，詳述教育部官方代碼 CSV 來源、版本代碼、UTF-8 BOM 編碼規範、1NF 全數展開邊界與對應演算法。
6. **前端說明手冊與 Web App 文件路由系統（User Guide & Web App Doc Routes）**：更新 `.claspignore` 放行 `docs/`，後端 `doGet` 提供白名單安全文件路由（`?page=docs/...`），前端在頁尾提供新分頁開啟連結，並於介面提供「📖 說明手冊」快速指引 Modal。

## What Changes

- **前端匯入指引（Imports Guidance）**：
  - 於 `webapp/js/imports.js` 實作純函式 `renderCourseCodeGuidanceHtml()`，置於 `uploadDropzone` 外部下方，避免點擊冒泡干擾檔案選擇對話框。
  - 符合 WCAG AA 無障礙標準（具備 `role="region"` 與 `aria-label`），並嚴格採用既有 CSS 變數（`--fill`、`--line-2`、`--ink-2`、`--err`）。
- **課程清單空白狀態友善引導（Empty State CTA）**：
  - 擴充 `webapp/js/ui.js` 之 `renderPagedTable` 與 `renderTableStatusRow`，新增 `emptyHtml` 參數支援原始 HTML 按鈕渲染，避免轉義為文字實體。
  - 於 `webapp/js/courses.js` 實作純函式 `renderEmptyCoursesStateHtml()`，四維度判定（`keyword`、`department`、`academicYear`、`semester`）：全空時呈現「前往匯入課綱代碼」按鈕（綁定 `data-course-action="goto-import"`，導向 `'import'` 頁籤）；若為篩選無結果則呈現「重設搜尋條件」按鈕（`data-course-action="reset"`）。內容包含既有提示文字以維持單元測試相容。
- **全站外部相依安全降級（Defensive Fallbacks）**：
  - 在 `webapp/js/courses.js` 與 `webapp/js/imports.js` 內部實作 `safeEscapeHtml`、`safeToast` 與比較器 fallback，確保在無外部相依或測試替身下不拋出例外。
- **緊湊型字串字典架構與快取驗證（Compact String Dictionary）**：
  - 驗證共用模組維持模組載入期立即解析並快取之緊湊字串架構，維持全專案模組 MI $\ge 50$ 且高於基準線 83.666。
- **官方參考資料手冊納管（Reference Documentation）**：
  - 於 `docs/參考資料/README.md` 建立教育部官方核定代碼庫出處、UTF-8 BOM 編碼規範、欄位架構與 108 課綱 14 欄 1NF 全數展開之對應說明。
- **前端說明手冊與文件路由（Manual & Web App Doc Routes）**：
  - 更新 `.claspignore` 加入放行規則（`!docs/` 與 `!docs/*.html`），確保雲端部署時包含手冊檔案。
  - 後端 `webApi.js` 新增 `WEB_APP_DOC_ROUTES` 白名單與子目錄壓平容錯，在 `doGet` 中支援 `?page=docs/...` 安全文件路由。
  - 新增 `docs/user-guide.html` 提供多主題離線操作說明。
  - 前端 `webapp/js/ui.js` 與 `webapp/js/app.js` 新增 `getUserGuideUrl()` 與 `openUserGuide()` Modal（樣式使用 `--fill`、`--line-2`，連結標記 `aria-label`），並於頁尾與首頁加入操作手冊入口。

## Capabilities

### New Capabilities
無（本變更全面深化現有規格架構）。

### Modified Capabilities
- `frontend-rendering-and-accessibility`: 擴充規範前端匯入官方指引卡片、課程查詢空白狀態導向卡片（Empty State CTA）、`renderPagedTable` 擴充 `emptyHtml` 支援、全站外部相依之安全降級防護契約，以及說明手冊 Modal 與頁尾連結（含 WCAG 另開視窗提示）。
- `maintainability-and-shared-logic`: 規範共用字典與大型對照表全面採用緊湊型字串架構，確保全專案模組維護性指數 MI $\ge 50$（且不低於基準線 83.666）。
- `system-settings-and-docs`: 規範 `docs/參考資料/` 目錄之版本控制、官方來源出處與欄位對齊說明手冊，以及後端 Web App 文件白名單路由、`.claspignore` 部署放行與 `docs/user-guide.html` 整合。

## Impact

- **前端模組**：
  - `webapp/js/imports.js`：新增 `renderCourseCodeGuidanceHtml` 並於上傳卡片外部下方渲染。
  - `webapp/js/ui.js`：`renderPagedTable` / `renderTableStatusRow` 支援 `emptyHtml`，新增 `getUserGuideUrl`、`openUserGuide`。
  - `webapp/js/courses.js`：新增 `renderEmptyCoursesStateHtml`，四維度篩選狀態分流，支援 `goto-import` 與 `reset` 宣告式委派事件，增強相依降級。
  - `webapp/js/app.js`：於頁尾渲染另開新分頁操作手冊連結（含無障礙屬性）。
- **後端模組與部署設定**：
  - `.claspignore`：加入 `!docs/` 與 `!docs/**` 放行規則。
  - `webApi.js`：`doGet` 支援 `?page=docs/...` 白名單安全文件路由與路徑扁平相容。
- **文件庫**：
  - 新增 `docs/參考資料/README.md`。
  - 新增 `docs/user-guide.html`。
- **測試庫**：
  - 新增並更新前端渲染、無障礙、文件路由與純函式單元測試。
- **API 與外部介面**：不更動既有 Web API 寫入協議，100% 向後相容。
