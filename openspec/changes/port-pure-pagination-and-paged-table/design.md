## Context

參見 `proposal.md`。本專案目前課程代碼清冊（`courses.js`）、操作日誌（`activityLog.js`）、授權成員清冊（`accounts.js`）與匯入預覽（`imports.js`）在資料表格渲染上各自拼接 HTML，缺乏統一的高階容器與視覺風格；同時授權成員清冊等介面缺乏即時角色過濾下拉選單。

## Goals / Non-Goals

**Goals:**

- 在 `webapp/js/ui.js` 移植並封裝通用純函式分頁運算器 `calculatePaginationWindow` 與雙模式渲染器 `renderPaginationBar`。
- 在 `webapp/js/ui.js` 封裝高階純函式組合容器 `renderPagedTable` 及配套純輔助函式（`normalizeTableAlign`、`renderTableHead`、`renderTableStatusRow`、`renderTableBody`）。
- 支援宣告式欄位（`columns`）與自訂列渲染回呼（`rowRenderer`）雙模式，內建 XSS 防禦、表頭自動防護補齊 `scope="col"`、以內層容器保護 `<td>` 單元格語意之狀態提示列（`role="status"`、`aria-live="polite"`），以及載入中 `aria-busy="true"`。
- 在 `webapp/styles.css` 抽離通用語意表格樣式（`.data-table`, `.table-container`, `.table-centered`, `.table-hover`, `.table-striped`）並適度調升面板標題字級，新增緊湊型表單控制項（`.form-select-sm`, `.form-input-sm`）。
- 全站表格全面換裝為 `renderPagedTable`：
  - `courses.js`：換裝為 `renderPagedTable`，支援事件委派與雙向分頁。
  - `activityLog.js`：換裝為 `renderPagedTable`，支援自訂詳情展開列與雙向分頁。
  - `accounts.js`：換裝為 `renderPagedTable`，並新增授權成員角色篩選下拉選單。
  - `imports.js`：匯入預覽表格換裝為 `renderPagedTable`，並新增預覽科別篩選下拉選單。
- 雙層 UMD 工廠匯出：所有純函式同時於 `createUiModule` 內部實例與外部工廠返回值完整匯出。
- 所有新函式圈複雜度嚴格控制在 4 以下，CRAP $\le 25$、模組 MI $\ge 50$，變更行覆蓋率 $\ge 80\%$。

**Non-Goals:**

- 不破壞既有 `listController.js` 之公開 API 簽章，維持既有介面相容性。
- 不縮小既有 `.input` 與 `.select` 之 15px/42px 標準尺寸。
- 不修改後端 Google Apps Script API 契約與試算表資料結構。
- 不引入外部前端框架或重量級套件，維持純 JavaScript / DOM 字串同構純函式。

## Decisions

### 1. 採「Compound / Composite Component」組合架構並多重拆分以防範 CRAP

- **決策**：
  - `renderPagedTable` 作為高階組合容器，內部呼叫底層原子元件 `renderPaginationBar`。
  - 為杜絕 KSVS 原版 160 行單一函式之高圈複雜度風險（原複雜度 12~14，覆蓋稍有不足即突破 CRAP 25 門檻），`renderPaginationBar` 嚴格拆分為單一職責純輔助函式：
    - `renderPageSizeSelect_(options, win)`：專責每頁筆數下拉選單生成（圈複雜度 $\le 3$）。
    - `renderPageJumpSelect_(options, win)`：專責跳頁下拉選單生成（圈複雜度 $\le 3$）。
    - `renderPaginationNavButtons_(options, win)`：專責前後頁按鈕群組生成（圈複雜度 $\le 4$）。
    - `renderPaginationSummary_(options, win)`：專責統計摘要字串生成（圈複雜度 $\le 2$）。
  - `renderTableBody` 亦拆分為 `renderDeclarativeRows_(items, columns)` 等純輔助函式。
- **理由**：
  - 保證所有函式圈複雜度壓在 4 以下，CRAP 穩居個位數（$\le 5$），充裕享有防禦緩衝。
  - 單元測試粒度更加純粹，可針對各子組件獨立驗證。

### 2. 雙模式事件支援（集中事件委派 + 樣板字串）

- **決策**：`renderPaginationBar` 同時相容本專案標準事件委派架構與獨立頁面樣板：
  - 若設定 `actionAttribute`（例如 `actionAttribute: "data-course-action"` 或 `"data-activity-action"`）：生成的按鈕帶有 `data-*-action="page"` 與 `data-page="..."` 屬性，不綁定 inline `onclick`，完美配合 `eventBindings.delegate`。
  - 若設定 `onPageChange`（例如 `"MEA.imports.handlePageChange({page})"`）：則產出 inline `onclick`。
- **理由**：
  - 既能維持本專案推崇的集中事件委派架構與現有測試相容性，又能兼顧未來獨立頁面的快速呼叫。

### 3. 表格橫向捲動容器相容性與主題樣式連動

- **決策**：`renderPagedTable` 輸出的橫向捲動容器類別預設為 `table-responsive table-container`。
- **理由**：
  - 本專案 7 種設計系統主題（NES 紅白機點陣邊框、Modern Slate 陰影等）皆以 `.table-responsive` 作為選取器；雙類別標記能同時相容既有主題邊框與新增的語意容器樣式。

### 4. 無障礙契約深化：地標區隔與單元格語意保護

- **決策**：
  - 地標名稱：`renderPaginationBar` 之 `navAriaLabel` 依 `position` 自動標註方位後綴（例如「課程代碼分頁導航（上方）」與「課程代碼分頁導航（下方）」），消除重複 Landmark 警告。
  - 單元格保護：提示列生成為 `<tr><td colspan="..."><div role="status" aria-live="polite">...</div></td></tr>`，維護 `<td>` 原生 table cell 語意。

### 5. 全站資料表格換裝與新增篩選下拉選單

- **決策**：
  - 課程代碼清冊（`courses.js`）：改用 `renderPagedTable`，結合原有多條件篩選表單。
  - 操作日誌清冊（`activityLog.js`）：改用 `renderPagedTable`，以自訂 `rowRenderer` 呈現日誌明細與詳情展開。
  - 授權成員清冊（`accounts.js`）：改用 `renderPagedTable`，並於標題下方新增「角色篩選下拉選單」（`data-account-filter="role"`），支援即時切換顯示全部、系統管理員、課程編修者或一般檢視者。
  - 匯入預覽表格（`imports.js`）：改用 `renderPagedTable`，並新增預覽科別篩選下拉選單。

### 6. UMD 工廠雙層匯出規範

- **決策**：在 `webapp/js/ui.js` 中，7 個新純函式（`calculatePaginationWindow`, `renderPaginationBar`, `renderPagedTable`, `renderTableHead`, `renderTableBody`, `renderTableStatusRow`, `normalizeTableAlign`）必須同時掛載於：
  - `createUiModule` 內部實例（`api` 物件，執行期供 `MEA.ui.*` 調用）。
  - 外層 UMD factory 回傳值（Node.js 環境供 `require("../webapp/js/ui.js")` 直接取用）。
- **理由**：讓單元測試無需依賴 DOM 或完整 deps 即可進行 100% 覆蓋的純粹單元測試。

## Risks / Trade-offs

- **[Risk] 既有測試嚴格字串斷言失敗**
  - **緩解**：換裝 `courses.js` 與 `activityLog.js` 時，在 Task 3.1 同步更新 `tests/webappCoursesRenderView.test.js` 與 `tests/webappActivityLog.test.js` 中的斷言期望值，確認新版語意（包含雙向導覽、無障礙屬性）均通過。
- **[Risk] CSS 類別遺漏觸發 `checkUiClasses` 失敗**
  - **緩解**：在 Task 1.1 完整補齊 `.data-table`、`.table-container`、`.pagination-bar-top`、`.pagination-bar-bottom`、`.form-select-sm` 等所有用到的類別。
