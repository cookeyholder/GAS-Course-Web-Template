## Why

目前專案在後端（`subjectCodeTransformer.js`、`databaseInitializer.js`、`utilities.js`）與前端（`imports.js`、`accounts.js`、`errorMessages.js`）仍存在「純資料運算與命令式 I/O / DOM 副作用交織」、「多處重複程式碼與定義漂移」、「就地狀態突變（In-place Mutation）」之技術債。
為了讓系統核心運算遵循「函式核心、命令外殼（Functional Core, Imperative Shell）」原則，達到 100% 零 Mock / 零 DOM 之單元測試能力，並為即將擴充的「教師基本資料模組」建立可複用的查詢、驗證與匯入架構典範，有必要在進入新功能開發前進行一次系統性簡化重構。

## What Changes

- **後端課程檢索純函式化**：將 `subjectCodeTransformer.js` 內二維矩陣（Array of Arrays）之條件過濾、關鍵字比對、分頁計算與物件映射邏輯抽離為純函式 `queryCourseDataRows(dataRows, filter)`；`getNormalizedCourses` 保留為命令式薄外殼；在 `utilities.js` 實作通用純函式 `chunkArray` 並供各模組共用。
- **後端重複定義消除與白名單查表純化**：
  - `databaseInitializer.js` 的 `normalizeRole`、`getRoleDisplayName` 內部實作改為委派至 `systemConfigCodec.js` 單一事實來源，並維持模組匯出以確保既有全域注入與單元測試相容。
  - 在 `systemConfigCodec.js` 實作白名單純查表函式 `findAccountInWhitelist(accounts, email)`，具備大小寫與空白容錯防護，由 `databaseInitializer.js` 引用並轉發匯出。
- **後端安全防衛邏輯簡化**：簡化 `utilities.js` 的 `sanitizeFormulaValue`，以常數正則表達式取代冗長前綴判斷。
- **前端匯入狀態純化與冪等防護**：在 `webapp/js/imports.js` 抽出純函式 `generateImportId` 與 `buildImportSuccessPatch`，透過不可變 state patch 保存 `importId`，杜絕 `entry.importId` 就地竄改並維持後端重試冪等性快取。
- **前端帳號表單驗證與陣列操作純化**：在 `webapp/js/accounts.js` 抽出純驗證函式 `validateNewAccountInput` 與不可變陣列轉換函式（`appendAccountToList`、`removeAccountFromList`、`toggleAccountInList`），隨模組外層匯出以支援零 DOM 純單元測試。
- **前端錯誤代碼轉譯集中收斂**：擴充 `webapp/js/errorMessages.js` 的 `resolveSafeMessage` 支援自訂代碼字典注入，保留向後相容性與未知錯誤安全遮蔽。

## Capabilities

### New Capabilities
<!-- 無新增外部使用者功能，本變更為純內部架構純化與簡化 -->

### Modified Capabilities
- `course-import-and-query-performance`: 規範課程二維陣列檢索、分頁與過濾邏輯必須封裝為完全不依賴 Google Apps Script 平台 API 的純函式 `queryCourseDataRows`，精確區隔無資料（totalPages 0）與查無結果（totalPages 1）之分頁規格，以利零 Mock 單元測試。
- `maintainability-and-shared-logic`: 規範角色定義委派收斂至單一來源且保留相容匯出、通用切片與白名單查表封裝為純函式、前端表單驗證與狀態 Patch 必須採用純函式與不可變陣列操作，杜絕就地狀態突變並擴充安全錯誤轉譯字典。

## Impact

- **影響檔案**：
  - `subjectCodeTransformer.js`
  - `databaseInitializer.js`
  - `systemConfigCodec.js`
  - `utilities.js`
  - `webapp/js/imports.js`
  - `webapp/js/accounts.js`
  - `webapp/js/errorMessages.js`
  - 對應的單元測試檔案（新增純函式測試，既有測試全數保持相容）。
- **外部 API 契約**：無變更，所有 Action 名稱、參數形狀與回傳結構 100% 向後相容。
- **打包行為**：不變動 `webapp/index.html` 順序，打包產物維持完全一致。
