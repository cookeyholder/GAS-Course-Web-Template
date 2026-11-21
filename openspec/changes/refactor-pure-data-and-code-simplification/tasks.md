## 1. 後端資料轉換純化與重複定義消除

- [x] 1.1 在 `utilities.js` 實作通用純函式 `chunkArray`，並在 `subjectCodeTransformer.js` 實作純檢索函式 `queryCourseDataRows`（精確區隔無資料 totalPages 0 與查無結果 totalPages 1），於 `tests/courseDataPureQuery.test.js` 建立 100% 零 Mock 單元測試驗證通過
- [x] 1.2 重構 `subjectCodeTransformer.js` 的 `getNormalizedCourses` 與分批寫入邏輯轉發至純函式核心，確認 `tests/subjectCodeTransformerGetNormalizedCourses.test.js` 與 `tests/subjectCodeTransformerFormulaInjection.test.js` 全數通過
- [x] 1.3 在 `systemConfigCodec.js` 實作純函式 `findAccountInWhitelist`（具備容錯防護），`databaseInitializer.js` 的 `getAccountRole` 改用純查表並委派 `normalizeRole` 與 `getRoleDisplayName`（保留匯出相容性），於 `tests/findAccountInWhitelist.test.js`、`tests/cleanupSingleSource.test.js` 與 `tests/webApiDependencyInjection.test.js` 驗證通過
- [x] 1.4 簡化 `utilities.js` 的 `sanitizeFormulaValue` 防衛判斷為常數正則檢測，新建 `tests/utilitiesSanitizeFormulaValue.test.js` 驗證公式注入防範與普通文字不受影響

## 2. 前端狀態不可變性與純表單驗證

- [x] 2.1 在 `webapp/js/imports.js` 實作純函式 `generateImportId` 與 `buildImportSuccessPatch`，透過不可變 state patch 保存 `importId` 以防護重試冪等快取，於 `tests/webappImportsPure.test.js` 驗證不可變性通過
- [x] 2.2 在 `webapp/js/accounts.js` 實作純驗證函式 `validateNewAccountInput` 與陣列操作純函式（`appendAccountToList`、`removeAccountFromList`、`toggleAccountInList`）並隨外層匯出，於 `tests/webappAccountsPure.test.js` 驗證零 DOM 測試通過
- [x] 2.3 在 `webapp/js/errorMessages.js` 擴充 `resolveSafeMessage(value, fallback, codeMap)` 支援代碼字典注入與優先轉譯，於 `tests/webappSafeErrorMessages.test.js` 驗證既有安全遮蔽與自訂代碼轉譯通過

## 3. 前端打包與全專案品質閘門驗證

- [x] 3.1 執行 `npm run build:webapp`，確認打包產物 `index.html` 正常更新，且 `npm run check:ui-classes` 與 `npm run check:a11y` 檢查通過
- [ ] 3.2 本地預跑完整 CI 品質驗證（`format:check`、`check:lang`、`test`、`check:contrast`、`check:a11y`、`check:coverage`、`check:complexity`、`check:changed-coverage`）確認全數綠燈
