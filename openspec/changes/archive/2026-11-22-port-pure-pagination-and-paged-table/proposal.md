## Why

目前專案的清單與資料表格渲染分散於各業務模組（`courses.js`、`activityLog.js`、`accounts.js` 與 `imports.js`），各模組需各自處理分頁列渲染、橫向捲動容器包裝、載入中（Loading）與查無資料（Empty State）的提示列，且表格樣式缺乏統一的置中與列懸停高對比反饋，部分管理表格（如授權成員清單）亦缺乏即時過濾的角色篩選下拉選單。

為對齊並引進 `KSVS-Course-Information-Collector` 的最新現代化前端實踐，本提案將移植該專案已驗證成熟的「通用純函式分頁元件（`calculatePaginationWindow` 與 `renderPaginationBar`）」、「高階純函式資料表格組合容器（`renderPagedTable`）」與「語意表格樣式暨介面排版調升」，並將專案內所有資料表格全面改以 `paged-table-container` 呈現、補齊適當的篩選下拉選單，提供宣告式雙向分頁導覽、無障礙提示、自動化表頭 `scope="col"` 補齊、以及符合 WCAG 2.1 AA 的高對比懸停視覺體驗。

## What Changes

- **移植通用純函式分頁運算與雙模式分頁工具列渲染器（`webapp/js/ui.js`）**：
  - 新增 `calculatePaginationWindow(totalItems, currentPage, pageSize)`：提供除零防禦、負數校正、切片起訖計算與邊界夾取（Clamping）。
  - 新增 `renderPaginationBar(options)`：支援上下雙向分頁列（`position: "top" | "bottom"`）、獨立 DOM ID 前綴、自訂每頁筆數選單、快速跳頁選單、第一頁／上一頁／下一頁／最末頁導航按鈕、0 筆資料與載入中停用防呆、雙向地標可區隔命名（避免重複 Landmark 警告）、統計文字自訂格式化（相容「共 X 筆紀錄 · 第 Y / Z 頁」），並同時支援本專案之**集中事件委派（`actionAttribute` 與 `data-page`）**與**字串樣板（`onPageChange`）**雙模式。
  - 內部拆分為小純函式（`renderPageSizeSelect_`, `renderPageJumpSelect_`, `renderPaginationNavButtons_`, `renderPaginationSummary_`），確保單一函式圈複雜度 $\le 4$，CRAP 遠低於 25 門檻。
- **移植高階純函式資料表格組合容器（`renderPagedTable` 及配套小純函式）**：
  - 新增 `normalizeTableAlign(align)`：欄位對齊白名單驗證（`left` / `center` / `right` / `justify`）。
  - 新增 `renderTableHead(columns)`：自動生成 `<thead>` 並補齊 `<th scope="col">`。
  - 新增 `renderTableStatusRow(options)`：載入中（含 spinner 圖示）與查無資料提示列，將 `role="status"` 與 `aria-live="polite"` 置於內層容器以保護 `<td>` 之原生 table cell 語意，支援 `colspan` 防呆。
  - 新增 `renderTableBody(options)`：支援宣告式欄位（`columns` 搭配 XSS 自動跳脫或自訂 `formatter`）與自訂資料列渲染回呼（`rowRenderer`）雙模式。
  - 新增 `renderPagedTable(options)`：一鍵組裝前後插槽（`beforeTableHtml` / `afterTableHtml`）、頂部分頁列、橫向捲動容器（預設包含 `table-responsive table-container` 以完整相容本專案 7 大主題點陣邊框）、標準資料表格、底部分頁列，並自動於載入時標註 `aria-busy="true"` 與停用分頁導覽。
  - 雙層 UMD 工廠匯出：所有純函式同時於 `createUiModule` 內部實例與外部工廠返回值完整匯出，確保 Node.js 測試與瀏覽器執行期皆無縫存取。
- **移植通用表格樣式類別與最佳化控制項排版（`webapp/styles.css`）**：
  - 新增通用資料表格語意樣式：`.data-table`、`.table-container`、`.pagination-bar-top`、`.pagination-bar-bottom`、`.table-centered`（表頭與內容垂直水平置中）、`.table-hover`（平滑背景過渡與列懸停高對比底色）、`.table-striped`（斑馬紋底色）與紅白機（NES）等主題特色 hover 反饋。
  - 調升標題字級：`.panel-title`（由 18px 升至 19.5px）、`.panel-sub`（由 13px 升至 14px）。
  - 新增緊湊型表單控制項樣式：`.form-select`、`.form-input`、以及專供分頁與密集表格工具列使用的 `.form-select-sm`、`.form-input-sm`（字級 13.5px、最小高度 30px），既有 `.input` 與 `.select` 維持 15px/42px 標準尺寸不變。
- **全站表格改以 `paged-table-container` 呈現並補齊適當篩選下拉選單**：
  - **課程代碼清單（`webapp/js/courses.js`）**：改用 `renderPagedTable` 呈現，整合上下雙向分頁導覽與快速跳頁，並延續多條件篩選下拉選單。
  - **操作日誌清冊（`webapp/js/activityLog.js`）**：改用 `renderPagedTable` 呈現，保留自訂展開詳情之 `rowRenderer` 與期間/操作者/事件類別篩選。
  - **授權成員清冊（`webapp/js/accounts.js`）**：改用 `renderPagedTable` 呈現，並新增「角色篩選下拉選單」（全部、系統管理員、課程編修者、一般檢視者），支援即時角色過濾。
  - **匯入預覽表格（`webapp/js/imports.js`）**：改用 `renderPagedTable` 呈現，並加入「科別預覽篩選下拉選單」。

## Capabilities

### Modified Capabilities

- `frontend-rendering-and-accessibility`: 擴充通用純函式雙向分頁工具列元件（`renderPaginationBar`）、高階資料表格組合容器（`renderPagedTable`）之無障礙要求（包含 `role="navigation"`、唯一 ID、依方位命名之 `aria-label`、`scope="col"`、`aria-busy`、保護 `<td>` 單元格語意之狀態列提示），以及通用語意表格樣式、面板標題與緊湊型表單控制項規範。

## Impact

- **受影響程式碼**：
  - `webapp/js/ui.js`：新增純函式 `calculatePaginationWindow`、`renderPaginationBar`、`normalizeTableAlign`、`renderTableHead`、`renderTableStatusRow`、`renderTableBody`、`renderPagedTable`，並於 UMD 工廠雙層匯出。
  - `webapp/styles.css`：補齊 `.data-table`、`.table-container`、`.table-centered`、`.table-hover`、`.table-striped`、`.form-select-sm`、`.form-input-sm` 等類別，通過 `checkUiClasses` 與 `checkContrast`。
  - `webapp/js/courses.js`：換裝為 `MEA.ui.renderPagedTable`，支援事件委派與雙向分頁。
  - `webapp/js/activityLog.js`：換裝為 `MEA.ui.renderPagedTable`。
  - `webapp/js/accounts.js`：換裝為 `MEA.ui.renderPagedTable` 並新增角色篩選下拉選單。
  - `webapp/js/imports.js`：換裝為 `MEA.ui.renderPagedTable` 並新增科別篩選下拉選單。
  - `tests/`：新增 `tests/paginationWindow.test.js` 與 `tests/pagedTable.test.js`，更新 `tests/webappCoursesRenderView.test.js` 之斷言期望值。
- **向後相容性**：完全向後相容。`listController.js` 維持公開 API 簽章不變；`renderPagedTable` 未傳入 `pagination` 時自動降級為純表格容器。
- **品質與複雜度門檻**：各拆分函式圈複雜度嚴格控制在 5 以下，CRAP $\le 25$、模組 MI $\ge 50$，變更行覆蓋率維持 $\ge 80\%$。
