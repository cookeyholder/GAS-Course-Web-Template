# course-import-and-query-performance Specification

## MODIFIED Requirements

### Requirement: 分頁查詢延遲映射
`getNormalizedCourses` 搜尋與篩選 MUST 先作用於原始列索引，再僅將分頁範圍內的資料列映射為 14 欄物件。系統不得為了回傳單頁資料而對整張工作表的所有列建立物件。核心檢索、篩選、分頁計算與物件映射運算 MUST 封裝為完全不依賴 Google Apps Script 或試算表物件的純函式（例如 `queryCourseDataRows`），接收純二維資料矩陣與篩選參數，並傳回符合分頁規格之結果物件；試算表資料讀取（如 `sheet.getDataRange().getValues()`）MUST 隔離於外層命令式外殼。當傳入之資料列矩陣為空或無有效資料列時，分頁結果之 `totalPages` MUST 為 0；當資料庫存在有效列但篩選條件查無吻合項目時，分頁結果之 `totalPages` MUST 為 1。

#### Scenario: 大量資料僅映射當頁
- **WHEN** 工作表含 100,000 筆 1NF 紀錄且請求第 1 頁、每頁 30 筆
- **THEN** 後端僅對 30 筆呼叫 `mapCourseIndexRow_`，回傳 total 與 totalPages 仍反映完整筆數

#### Scenario: 篩選結果為空
- **WHEN** 資料庫存在資料列但關鍵字沒有任何符合紀錄
- **THEN** 回傳空 list、total 0、totalPages 1，且不映射任何列

#### Scenario: 空工作表或無資料傳入
- **WHEN** 傳入純函式之資料矩陣為空陣列、null、undefined 或僅有表頭
- **THEN** 回傳空 list、total 0、totalPages 0，且不拋出任何未捕捉例外

#### Scenario: 純函式零 Mock 驗證
- **WHEN** 直接以純 JavaScript 陣列呼叫 `queryCourseDataRows` 傳入測試資料與篩選條件
- **THEN** 函式在無需任何 SpreadsheetApp、工作表或服務 Mock 的情況下精確回傳過濾後的分頁結果與總筆數
