## ADDED Requirements

### Requirement: 課程代碼官方來源管道與格式禁忌指引
前端匯入模組（`webapp/js/imports.js`）MUST 提供純函式 `renderCourseCodeGuidanceHtml`，於課綱 Excel 檔案上傳區塊（Dropzone）**外部下方**獨立渲染官方來源說明卡片，嚴禁置於 Dropzone 容器內部以避免點擊文字時觸發檔案選擇對話框。該卡片 SHALL 詳列教育部「高級中等學校課程計畫平臺」與「巨耀校務行政系統」之匯出路徑，並以警告樣式標示格式注意事項（勿修改欄位順序、刪除表頭或合併儲存格，以免 1NF 正規化解析失敗）。該區塊 MUST 具備 `role="region"` 與 `aria-label="108 課綱課程代碼官方來源管道指引"` 等無障礙標籤，並嚴格使用設計系統已定義之 CSS 變數（`--fill`、`--line-2`、`--ink-2`、`--err`）。

#### Scenario: 匯入頁面渲染官方來源管道與格式禁忌
- **WHEN** 使用者進入「課程代碼匯入」頁面且尚未選取檔案
- **THEN** Dropzone 外部下方顯示官方來源管道說明卡片，包含教育部平臺與巨耀校務系統之路徑及格式禁忌警示，點擊文字不觸發檔案選擇，且輔助科技可透過對應 region 朗讀

### Requirement: 表格容器 raw HTML 狀態列與課程空白狀態事件委派
前端 UI 模組（`webapp/js/ui.js`）之 `renderPagedTable` 與 `renderTableStatusRow` MUST 擴充支援 `emptyHtml` 參數：當提供 `opt.emptyHtml` 時 SHALL 直接嵌入渲染原始 HTML，未提供時回退至既有 `escapeHtml(opt.emptyText || "查無資料")`。
前端課程模組（`webapp/js/courses.js`）MUST 提供純函式 `renderEmptyCoursesStateHtml`，並依四維度篩選條件（關鍵字 `keyword`、科別 `department`、學年度 `academicYear`、學期 `semester`）精準分流：
1. **資料庫無資料（Initial Empty）**：當 `courses.total === 0` 且四維度皆無任何篩選條件時，SHALL 呈現引導卡片與「前往匯入課綱代碼」按鈕。該按鈕 MUST 遵循宣告式事件委派，標記 `type="button"`、`class="btn primary"` 與 `data-course-action="goto-import"`，並由 `courses.js` 攔截切換至單數 `'import'` 頁籤；嚴禁使用 inline `onclick` 事件處理器。
2. **搜尋篩選無相符結果（Filtered Empty）**：當 `courses.total > 0` 但 `courses.list.length === 0`（或任一篩選維度有值）時，SHALL 呈現「查無符合條件的課程紀錄」提示與「重設搜尋條件」按鈕（`data-course-action="reset"`）。
3. **既有測試相容性**：無論全空或篩選無相符結果，提示文案中 MUST 包含「目前尚無符合的課程紀錄」之說明，確保既有單元測試相容不回退。

#### Scenario: 資料庫全空時引導至匯入頁面且按鈕正常解析
- **WHEN** 課程資料庫無任何資料且未設定任何篩選條件
- **THEN** 表格透過 `emptyHtml` 呈現友善的 Empty State 卡片與按鈕，點擊「前往匯入課綱代碼」按鈕透過事件委派切換至 `'import'` 頁面，且按鈕為可點擊 DOM 元素而非轉義字串

#### Scenario: 搜尋無結果時引導重設篩選
- **WHEN** 課程資料庫有資料但搜尋條件查無相符結果
- **THEN** 表格呈現查無紀錄提示與「重設搜尋條件」按鈕，點擊後清空搜尋條件並重新載入列表

### Requirement: 全站外部相依安全降級防護
前端所有模組在存取全域物件（如 `MEA.courseData`、`MEA.ui`、`escapeHtml`、`toast`、`compareDepartmentsByCode`）時，MUST 進行防禦性檢查；模組內部 SHALL 提供本地安全純函式 fallback（包含 `safeEscapeHtml`、`safeToast` 與正體中文 `localeCompare(..., "zh-TW")`），當外部相依物件為 null、未定義或函式缺失時，MUST 安全降級，嚴禁拋出未攔截之 TypeError 導致整個 UI 崩潰。

#### Scenario: 外部相依未載入時安全降級
- **WHEN** `MEA.courseData`、`MEA.ui.escapeHtml` 或自訂比較器尚未初始化
- **THEN** 前端選單、表單與表格渲染依舊能正常顯示並回退至安全純函式，無任何未捕獲之 JavaScript 例外

### Requirement: 前端說明手冊與操作指南彈出視窗
前端介面 MUST 提供使用者操作手冊入口：
1. **Web App 手冊網址解析**：提供純/輔助函式 `getUserGuideUrl()`，依據當前部署網址或 location 自動組裝 `?page=docs%2Fuser-guide.html` 網址。
2. **操作指引 Modal 彈出視窗**：提供 `openUserGuide()` 函式，開啟具備快速指南（登入驗證、課程代碼匯入、課程搜尋與系統設定）與常見問題之對話框，樣式嚴格使用現有語意變數（`--fill`、`--line-2`、`--paper`），並包含「在新分頁開啟完整手冊」按鈕（點擊開啟 `getUserGuideUrl()`）。
3. **介面入口與無障礙**：於全站頁尾（Footer）呈現新分頁開啟之手冊連結，標記 `target="_blank"`、`rel="noopener noreferrer"` 與 `aria-label="開啟使用者操作手冊（另開新分頁）"`，並於首頁或導覽處提供觸發 `openUserGuide()` 之手冊按鈕。

#### Scenario: 點擊手冊按鈕開啟快速指南對話框
- **WHEN** 使用者點擊操作指引之「📖 說明手冊」按鈕
- **THEN** 畫面彈出使用者操作手冊 Modal，包含快速功能指南、常見問題與在新分頁開啟完整手冊之按鈕，且無未定義之 CSS 變數

#### Scenario: 頁尾包含手冊新分頁連結並具備無障礙標籤
- **WHEN** 檢視前端主版面頁尾
- **THEN** 頁尾包含連至 `getUserGuideUrl()` 的外部連結，並標記 `target="_blank"`、`rel="noopener noreferrer"` 與明確之 `aria-label`
