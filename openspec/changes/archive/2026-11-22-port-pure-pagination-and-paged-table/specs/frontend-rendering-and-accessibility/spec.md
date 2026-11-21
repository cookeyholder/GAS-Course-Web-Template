## ADDED Requirements

### Requirement: 通用純函式雙向分頁導覽元件
前端 UI 模組 MUST 提供通用無副作用之純函式分頁運算器與分頁工具列渲染器（`MEA.ui.calculatePaginationWindow` 與 `MEA.ui.renderPaginationBar`）。
運算器 MUST 支援除零防禦、負數校正、切片起訖計算與邊界校正；渲染器 MUST 支援上下雙向獨立前綴 DOM ID（如 `-top-size`, `-bottom-size`, `-top-jump`, `-bottom-jump`）、自訂每頁筆數選單、快速跳頁選單、第一頁／上一頁／下一頁／最末頁導覽按鈕，並符合 WCAG 2.1 AA 無障礙規範：具備 `role="navigation"`、依方位可區隔之 `aria-label`（如「上方分頁導覽」／「下方分頁導覽」）、統計資訊 `aria-live="polite"`、當前頁 `aria-current="page"`，並在總筆數為 0 或載入狀態（`loading`）時停用操作按鈕與下拉選單。
渲染器 MUST 同時支援集中事件委派屬性模式（`actionAttribute` 與 `data-page`）與字串樣板模式（`onPageChange`），並支援統計文字格式化（`summaryFormatter`）。

#### Scenario: 運算器防禦邊界與除零
- **WHEN** 呼叫端傳入無效或邊界引數（如 `totalItems: 0`、負數頁碼或 `pageSize: 0`）
- **THEN** 運算器安全回退，計算出合理的頁數（至少 1 頁）、夾取合法當前頁與有效切片範圍，不拋出除零或非數值異常

#### Scenario: 雙向分頁列具備唯一 ID 與區隔地標名稱
- **WHEN** 呼叫端分別以 `position: "top"` 與 `position: "bottom"` 渲染分頁工具列
- **THEN** 產出之 HTML 包含不同且唯一的控制項 ID，且具備 `role="navigation"`、包含方位之 `aria-label`、`aria-live="polite"` 與當前頁語意，不觸發重複無差別 Landmark 警告

#### Scenario: 支援事件委派與零筆或載入停用
- **WHEN** 設定 `actionAttribute: "data-course-action"` 且資料總筆數為 0 或 `loading` 為 true
- **THEN** 分頁按鈕具備 `data-course-action="page"` 與對應目標頁碼屬性，並帶有 `disabled` 屬性

### Requirement: 高階純函式資料表格組合容器
前端 UI 模組 MUST 提供高階純函式資料表格組合容器（`MEA.ui.renderPagedTable`），支援一鍵整合上下雙向分頁列與橫向捲動響應式表格容器（`<div class="table-responsive table-container" style="overflow-x:auto;">`）。
容器 MUST 支援宣告式欄位（`columns`，包含 `title`, `key`/`field`, `align`, `width`, `formatter`）與自訂列渲染回呼（`rowRenderer`）雙模式；表頭 `<th scope="col">` MUST 自動防護或補齊；對齊樣式 MUST 經白名單過濾；載入中（`loading`）與查無資料（`emptyText`）提示列 MUST 將 `role="status"` 與 `aria-live="polite"` 封裝於單元格內層容器以保護 `<td>` 之原生 table cell 語意，支援 `colspan` 防呆，且在載入中時表格 MUST 標註 `aria-busy="true"`。未提供 `pagination` 參數時 MUST 自動降級為純表格容器。

#### Scenario: 組合容器一鍵產出完整雙向分頁與表格結構
- **WHEN** 傳入資料清冊、欄位宣告與分頁參數至 `renderPagedTable`
- **THEN** 回傳之 HTML 字串依序包含頂部分頁列、橫向捲動容器、`table`、表頭 `scope="col"`、資料列以及底部分頁列，且外層標記 `table-responsive table-container`

#### Scenario: 載入中狀態保護表格單元格語意並停用分頁
- **WHEN** 傳入 `loading: true` 至 `renderPagedTable`
- **THEN** 表格標籤帶有 `aria-busy="true"`，提示列內層容器帶有 `role="status"` 與 `aria-live="polite"`，`<td>` 維持單元格結構，且上下雙向分頁按鈕皆處於 `disabled` 狀態

#### Scenario: 自訂 rowRenderer 與 colspan 防呆
- **WHEN** 傳入自訂 `rowRenderer` 函式與 `colspan` 參數
- **THEN** 容器依照回呼逐列輸出內容，且狀態列正確跨越指定欄數

### Requirement: 通用語意表格樣式與面板字級調升
樣式表 `webapp/styles.css` MUST 提供標準通用語意表格樣式類別（`.table-centered`、`.table-hover`、`.table-striped`、`.data-table`、`.table-container`）與主題特定懸停反饋（包含 NES 紅白機像素高亮）。
同時，面板標題 `.panel-title` MUST 提升至 19.5px、副標題 `.panel-sub` 提升至 14px，並新增緊湊型表單控制項樣式 `.form-select-sm` 與 `.form-input-sm`（字級 13.5px、最小高度 30px），既有 `.input` 與 `.select` 保留標準尺寸，確保各主題風格下皆符合 WCAG 對比標準（$\ge 4.5:1$）且版面不溢出。

#### Scenario: 通用表格樣式套用置中與列懸停效果
- **WHEN** 表格套用 `.table-centered` 與 `.table-hover` 類別
- **THEN** 儲存格內容呈現水平與垂直置中，且游標懸停時平滑呈現高對比背景反饋

#### Scenario: 緊湊型表單控制項排版緊湊且通過檢查
- **WHEN** 渲染分頁列與工具列小型下拉選單
- **THEN** 控制項套用 `.form-select-sm`（字級 13.5px、高度 30px），排版緊湊且全站 CSS 類別通過 `checkUiClasses`
