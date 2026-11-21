## 1. 樣式表更新與版面排版優化

- [x] 1.1 在 `webapp/styles.css` 補齊通用資料表格與分頁控制項樣式類別（`.data-table`、`.table-container`、`.table-centered`、`.table-hover`、`.table-striped`、`.pagination-bar-top`、`.pagination-bar-bottom`、紅白機主題特色 hover 反饋），以 `npm run check:ui-classes` 驗證無缺漏。
- [x] 1.2 在 `webapp/styles.css` 調升 `.panel-title`（19.5px）、`.panel-sub`（14px），新增緊湊型表單控制項（`.form-select`、`.form-input`、`.form-select-sm`、`.form-input-sm`，字級 13.5px、高度 30px），以 `npm run check:contrast` 驗證各主題色彩對比符合標準。

## 2. 通用純函式分頁與表格容器實作

- [x] 2.1 在 `webapp/js/ui.js` 實作分頁純運算器 `calculatePaginationWindow` 與雙模式雙向分頁工具列渲染器 `renderPaginationBar`（拆分 `renderPageSizeSelect_`、`renderPageJumpSelect_`、`renderPaginationNavButtons_`、`renderPaginationSummary_`），確保單一函式圈複雜度 $\le 4$，並於 UMD 工廠雙層匯出。
- [x] 2.2 在 `webapp/js/ui.js` 實作資料表格輔助純函式（`normalizeTableAlign`、`renderTableHead`、`renderTableStatusRow`、`renderTableBody`）與高階純函式組合容器 `renderPagedTable`（預設輸出 `table-responsive table-container` 容器並保護 `<td>` 單元格語意），並於 UMD 工廠雙層匯出。
- [x] 2.3 建立單元測試 `tests/paginationWindow.test.js` 與 `tests/pagedTable.test.js`，完整覆蓋邊界計算、除零防禦、雙向無障礙屬性、XSS 防禦與雙模式事件屬性，以 `npm test` 驗證通過。

## 3. 全站表格改用 paged-table-container 與補齊篩選下拉選單

- [x] 3.1 在 `webapp/js/courses.js` 將課程清冊表格換裝為使用 `MEA.ui.renderPagedTable`，支援事件委派（`data-course-action="page"`）與上下雙向導覽，並同步更新 `tests/webappCoursesRenderView.test.js` 測試斷言。
- [x] 3.2 在 `webapp/js/activityLog.js` 將操作日誌表格換裝為使用 `MEA.ui.renderPagedTable`，支援自訂詳情列展開與上下雙向導覽。
- [x] 3.3 在 `webapp/js/accounts.js` 新增「角色篩選下拉選單」（全部、系統管理員、課程編修者、一般檢視者）與過濾邏輯，並將授權成員清冊表格換裝為 `renderPagedTable` 呈現。
- [x] 3.4 在 `webapp/js/imports.js` 新增預覽科別篩選下拉選單，並將 1NF 匯入預覽表格換裝為 `renderPagedTable` 呈現。

## 4. 前端打包與完整 CI 品質閘門驗證

- [ ] 4.1 執行 `npm run build:webapp` 打包最新前端產物至根目錄 `index.html`。
- [ ] 4.2 執行本地完整 CI 閘門（`npm run format:check`、`npm run check:lang`、`npm test`、`npm run check:contrast`、`npm run check:a11y`、`npm run check:coverage`、`npm run check:complexity`、`npm run check:changed-coverage`）驗證全數通過，確認單一函式 CRAP $\le 25$、模組 MI $\ge 50$ 且無回退。
