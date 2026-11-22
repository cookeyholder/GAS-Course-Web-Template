## 1. 官方參考資料手冊納管與共用模組架構驗證

- [x] 1.1 建立 `docs/參考資料/README.md`，詳述教育部官方代碼 CSV 來源、版本資訊、UTF-8 BOM 編碼注意事項、欄位編碼規格與 1NF 模組關聯，並執行 `npm run check:lang` 確認無簡體字與中國用語
- [x] 1.2 驗證共用模組維持緊湊字串宣告與模組載入期立即解析快取（Eager Memoization），執行 `npm test` 與 `npm run check:complexity` 確認全專案模組維護性指數 MI $\ge 50$ 且不低於基準線 83.666，CRAP $\le 25$

## 2. 後端 Web App 文件路由、部署放行與使用者手冊建立

- [x] 2.1 於 `.claspignore` 放行 `!docs/` 與 `!docs/**`，於 `webApi.js` 實作 `WEB_APP_DOC_ROUTES` 白名單與 `doGet` 文件路由處理（`?page=docs/...`），相容路徑扁平化候選，並在 `tests/api.test.js` 擴充白名單讀取與非法路徑 404 回退測試
- [x] 2.2 建立多主題離線操作說明手冊 `docs/user-guide.html`，涵蓋登入驗證、課程代碼匯入、課程搜尋與系統設定，並通過語言檢查

## 3. 前端匯入指引與防禦性降級實作

- [x] 3.1 於 `webapp/js/imports.js` 實作 `renderCourseCodeGuidanceHtml` 純函式並置於 `uploadDropzone` 外部下方，使用既有語意變數（`--fill`、`--line-2`、`--ink-2`）與 WCAG AA 標籤，於 `tests/webappImportsRenderView.test.js` 擴充測試
- [x] 3.2 於 `webapp/js/imports.js` 與 `webapp/js/courses.js` 實作本地安全純函式 fallback（`safeEscapeHtml`、`safeToast`、`compareDepartmentsByCode`），擴充測試驗證全域相依缺失時之平順回退

## 4. 課程清單 Empty State CTA、表格容器擴充與手冊 UI 整合

- [x] 4.1 於 `webapp/js/ui.js` 擴充 `renderPagedTable` 與 `renderTableStatusRow` 支援 `emptyHtml` 原始 HTML 參數；於 `webapp/js/courses.js` 實作 `renderEmptyCoursesStateHtml`，精準以四維度篩選分流全空狀態（觸發 `data-course-action="goto-import"` 導向單數 `'import'` 頁籤）與搜尋無結果狀態（觸發 `data-course-action="reset"`），文案包含「目前尚無符合的課程紀錄」確保測試相容，於 `tests/webappCoursesRenderView.test.js` 擴充測試
- [ ] 4.2 於 `webapp/js/ui.js` 與 `webapp/js/app.js` 實作 `getUserGuideUrl()` 與 `openUserGuide()` 對話框（樣式使用 `--fill`、`--line-2`），並於頁尾加入新分頁手冊連結（標記 `aria-label`）、於首頁加入「📖 說明手冊」按鈕，擴充單元測試驗證

## 5. 打包建置與本地端 11 步完整 CI 預跑

- [ ] 5.1 執行 `npm run build:webapp` 打包前端，新增無障礙、空狀態與文件路由綜合單元測試，執行 `npm run check:ui-classes` 與 `npm run check:contrast` 確認無樣式漂移
- [ ] 5.2 執行本地端 11 步完整 CI 預跑指令鏈，確認格式、語言、樣式、無障礙、測試、全域覆蓋率、CRAP/MI、變更覆蓋率與打包產物一致性全數通過
