## Context

本專案為 Google Apps Script 網頁應用程式範本，於先前的變更中已完成了全站科別下拉選單依教育部 3 碼代碼升冪排序之功能，並將教育部官方核定 CSV 檔案（`科別代碼.csv`、`科目固定編碼.csv`）納管於 `docs/參考資料/` 目錄。
然而，借鏡 `KSVS-Course-Information-Collector` 的實際運作經驗，仍有數項顯著提升使用者操作流暢度、前端防禦韌性、程式碼可維護性與文件易用性的架構實踐值得引進（詳見 proposal.md - Why）。

## Goals / Non-Goals

**Goals:**
- **提升使用者引導性**：在檔案上傳區外部下方渲染清晰的官方下載管道（教育部平臺與巨耀校務行政系統）與格式注意事項，獨立於 Dropzone 容器之外以防止事件冒泡干擾檔案選取。
- **改善空白狀態體驗**：在課程查詢清單中精準四維度（關鍵字、科別、學年度、學期）區分「資料庫無資料」與「搜尋查無結果」，分別提供「前往匯入課綱代碼」CTA（遵從宣告式事件委派至單數 `'import'` 頁籤）與「重設搜尋條件」按鈕，並擴充 `renderPagedTable` 支援 `emptyHtml` 原始 HTML 渲染，且文案相容既有單元測試。
- **鞏固前端模組防禦性**：在前端 `courses.js` 與 `imports.js` 等模組中，落實對全域相依、`safeEscapeHtml`、`safeToast` 與比較器的防禦性安全降級，杜絕未攔截的 TypeError。
- **維持高可維護性架構**：維持緊湊型字串架構與載入期立即解析快取（Eager IIFE Memoization），確保全模組 MI $\ge 50$ 且不低於基準線 83.666。
- **完善技術文件基準**：在 `docs/參考資料/` 建立臺灣繁體中文版 `README.md`，說明官方資料庫出處、UTF-8 BOM 編碼規範與 14 欄 1NF 全數展開之對齊邊界。
- **建立線上說明手冊系統**：更新 `.claspignore` 放行手冊檔案，後端 `doGet` 提供白名單安全文件路由（`?page=docs/...`），前端於頁尾提供新分頁連結（具備 `aria-label`），並於主介面提供快速操作指南 Modal 彈出視窗（無幽靈 CSS 變數）。

**Non-Goals:**
- 不更動 Web API 後端寫入通訊協議或破壞任何資料庫 Schema。
- 不改變 1NF 正規化 14 欄的核心轉換規則與欄位定義。
- 不引入外部肥大前端框架（如 React/Vue），維持純原生 JavaScript 與輕量 CSS 設計系統。

## Decisions

### 1. 匯入指引採自包含純 HTML 元件設計（`renderCourseCodeGuidanceHtml`）
- **決策**：在 `webapp/js/imports.js` 實作純函式 `renderCourseCodeGuidanceHtml()`。為杜絕點擊冒泡觸發檔案選擇對話框，該區塊**嚴格渲染於 `uploadDropzone` 外部下方**（僅在未選定檔案 `!entry` 時呈現）。樣式嚴格使用設計系統已定義之 CSS 語意變數（`--fill`、`--line-2`、`--ink-2`、`--err`）與無障礙屬性（`role="region"`、`aria-label`）。
- **替代方案考慮**：
  - *置於 Dropzone 容器內部*：點擊文字反白或選取時會向上冒泡至 `[data-import-dropzone]` 觸發檔案對話框，嚴重破壞 UX，故堅決置於外部。

### 2. 課程清單 Empty State CTA 與表格容器 raw HTML 支援
- **決策**：
  1. **UI 元件擴充**：`webapp/js/ui.js` 之 `renderPagedTable` 與 `renderTableStatusRow` 新增 `emptyHtml` 支援，優先渲染未經轉義的原始按鈕標籤（內部需已自行處理 `safeEscapeHtml`），未提供時回退至 `escapeHtml(opt.emptyText)`，防止按鈕被轉義為文字實體。
  2. **四維度篩選狀態判定**：
     ```javascript
     const hasFilters = Boolean(
       (courses.keyword || "").trim() ||
       (courses.department || "").trim() ||
       (courses.academicYear || "").trim() ||
       (courses.semester || "").trim()
     );
     const isEmptyDb = courses.total === 0 && !hasFilters;
     ```
     - **全空狀態（`isEmptyDb`）**：渲染 Empty State 卡片與按鈕 `<button type="button" class="btn primary" data-course-action="goto-import">前往匯入課綱代碼</button>`。由 `courses.js` 內部事件委派攔截，呼叫 `(MEA.navigation && MEA.navigation.setTab) || MEA.setTab` 跳轉至單數 `'import'` 頁籤；嚴禁使用 inline `onclick` 事件。
     - **篩選無相符（`!isEmptyDb`）**：呈現提示文字與按鈕 `<button type="button" class="btn secondary" data-course-action="reset">重設搜尋條件</button>`。
  3. **測試文字相容**：副標說明皆保留「目前尚無符合的課程紀錄」，確保既有單元測試（如 `tests/webappCoursesRenderView.test.js`）100% 通過。

### 3. 全面落實本地防禦性降級純函式（Local Fallbacks）
- **決策**：在 `webapp/js/courses.js`、`webapp/js/imports.js` 內部宣告本地安全防護純函式：
  - `safeEscapeHtml(str)`：優先使用 `options.MEA.ui.escapeHtml`，回退至純正則字元替換。
  - `safeToast(msg, type)`：優先使用 `options.MEA.ui.toast`，回退至安全空操作或 console 警告。
  - `safeCompare(a, b)`：優先使用 `options.compareDepartmentsByCode`，回退至 `String(a).localeCompare(String(b), "zh-TW")`。
- **替代方案考慮**：
  - *僅針對單一函式降級*：當其他全域方法未載入時依然可能觸發 TypeError，全面本地防護方能實現真正零相依穩健運作。

### 4. 緊湊字串載入期立即解析並快取（Eager IIFE Memoization）
- **決策**：大型對照字典維持管道分隔宣告，於模組載入期立即透過 IIFE 進行單次解析並保存為純物件（`Object.freeze`），後續查詢具備 $O(1)$ 速度與標準 `Object.keys()` 遍歷相容性。維持全專案納管模組 MI $\ge 50$ 且不低於基準線 83.666。

### 5. 參考資料目錄手冊納管
- **決策**：於 `docs/參考資料/README.md` 建立詳細手冊，記載教育部課綱平臺代碼發布出處、版本代號（108 課綱技術型高中）、CSV 檔案之 UTF-8 BOM 編碼注意事項，以及本專案 14 欄 1NF 全數展開演算法之對應位置。

### 6. 後端 Web App 文件路由、部署放行與前端操作手冊
- **決策**：
  - 部署放行：於根目錄 `.claspignore` 移除對 `docs/` 的忽略，明確加入 `!docs/` 與 `!docs/**`，確保 `clasp push` 時手冊同步推送至 GAS 雲端。
  - 後端路由：於 `webApi.js` 設置 `WEB_APP_DOC_ROUTE_PARAM = "page"` 與 `WEB_APP_DOC_ROUTES` 白名單，在 `doGet(e)` 優先處理合法文件請求，相容 clasp 檔案扁平化候選，回傳 `HtmlService.createHtmlOutputFromFile`；非白名單回傳安全 404。
  - 離線手冊：建立自包含離線 HTML `docs/user-guide.html`。
  - 前端整合：`webapp/js/ui.js` 實作 `getUserGuideUrl()` 與 `openUserGuide()` Modal（內聯樣式嚴格使用 `--fill`、`--line-2`，無幽靈變數）；`webapp/js/app.js` 於頁尾渲染 `<a>` 標籤手冊連結（標記 `aria-label="開啟使用者操作手冊（另開新分頁）"`），並於首頁概覽提供「📖 說明手冊」按鈕。

## Risks / Trade-offs

- **[Risk] 前端樣式在不同主題下對比度不足** → **Mitigation**：指引卡片與 Empty State 均使用設計系統已定義之 CSS 語意變數（`--fill`、`--line-2`、`--ink`、`--ink-2`），並由 `scripts/checkContrast.js` 與 `scripts/checkA11y.js` 進行自動化稽核。
- **[Risk] 頁籤跳轉因模組初始化失敗** → **Mitigation**：跳轉由 `data-course-action="goto-import"` 觸發，委派至 `(MEA.navigation && MEA.navigation.setTab) || MEA.setTab`，目標為單數 `'import'`，且在測試替身下容錯。
- **[Risk] Web App 文件路由目錄穿越攻擊（Path Traversal）** → **Mitigation**：`webApi.js` 使用嚴格精確比對之白名單字典（`WEB_APP_DOC_ROUTES.hasOwnProperty(page)`），杜絕任何 `..` 或非預期路徑存取。
- **[Risk] 雲端部署遺漏手冊檔案** → **Mitigation**：在 `.claspignore` 明確宣告白名單規則 `!docs/` 與 `!docs/**`。
