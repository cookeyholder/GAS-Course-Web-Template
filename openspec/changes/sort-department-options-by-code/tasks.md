## 1. 擴充教育部科別代碼資料字典與排序純函式

- [x] 1.1 在 `courseNormalizationShared.js` 納入教育部 340 個標準科別代碼字典（`MINISTRY_DEPARTMENT_CODE_NAMES`，採用緊湊字串儲存以維護 MI）、常見別名池（`DEPARTMENT_ALIASES`）與共同科代碼字典（`COMMON_DEPARTMENT_CODES`），並實作 `getDepartmentCode`（支援 `/^[0-9A-Za-z]{3}$/` 與官方自帶方括號反查）、`getDepartmentSortKey`（四層排序鍵，空值賦予 `"3_"`）與 `compareDepartmentsByCode`（Tier 0/1 原生比對、Tier 2 中文比對）純函式；於 `tests/courseNormalizationShared.test.js` 擴充匯出清單與 100% 分支測試（驗證 CRAP $\le 25$ 與 MI $\ge 50$），以 `node tests/courseNormalizationShared.test.js` 驗證通過。
- [x] 1.2 在 `webapp/js/courseData.js` 中導出上述純函式與字典，更新 `subjectCodeTransformer.js` 同步引用，並在 `tests/helpers/accountsCoursesDeps.js` 與 `tests/helpers/importsUiDeps.js` 補齊 `compareDepartmentsByCode` 依賴，以 `npm test` 驗證前後端同構與既有測試無回退。

## 2. 全站科別選單全面換裝依代碼升冪排序

- [ ] 2.1 修改 `webapp/js/courses.js` 之 `renderDeptOptionsHtml`，將科別選項依代碼升冪排序並加入安全降級回退防護，更新 `tests/webappCoursesRenderView.test.js` 加入排序斷言，以 `node tests/webappCoursesRenderView.test.js` 驗證通過。
- [ ] 2.2 修改 `webapp/js/imports.js` 之 `extractPreviewDepartments`，將萃取之科別清單依代碼升冪排序並加入安全降級回退防護，更新 `tests/webappImportsRenderView.test.js`，以 `node tests/webappImportsRenderView.test.js` 驗證通過。

## 3. 打包前端、擴充單元測試與通過完整品質閘門

- [ ] 3.1 執行 `npm run build:webapp` 打包最新 `index.html`，新增科別排序單元測試與無障礙契約檢查，並以 `npm run check:a11y` 驗證。
- [ ] 3.2 執行本地端完整 11 步 CI 品質閘門指令鏈（格式化、語言、CSS 類別、對比度、無障礙、單元測試、覆蓋率、複雜度、變更覆蓋率與打包產物一致性），確認所有檢查全數通過。
