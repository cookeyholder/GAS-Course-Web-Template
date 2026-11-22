## 1. 後端模組 JSDoc 校正與重寫

- [x] 1.1 檢視並重寫後端路由、進入點與核心控制模組（`webApi.js`、`main.js`、`actionRegistry.js`、`gasRuntime.js`）的函式 JSDoc，排除打包產物 `version.generated.js`，並執行 `npm test && npm run check:lang && npm run format:check` 驗證通過
- [x] 1.2 檢視並重寫資料庫初始化、設定編解碼與共用工具模組（`databaseInitializer.js`、`systemConfigCodec.js`、`utilities.js`）的函式 JSDoc，並執行 `npm test && npm run check:lang && npm run format:check` 驗證通過
- [x] 1.3 檢視並重寫操作日誌子系統（`activityLogger.js`、`activityLogBuilders.js`、`activityLogInterceptor.js`、`activityLogQuery.js`）的函式 JSDoc，並執行 `npm test && npm run check:lang && npm run format:check` 驗證通過
- [x] 1.4 檢視並重寫課綱正規化與科目編碼轉換模組（`subjectCodeTransformer.js`、`courseNormalizationShared.js`）的函式 JSDoc，並執行 `npm test && npm run check:lang && npm run format:check` 驗證通過

## 2. 前端模組 JSDoc 校正與重寫

- [ ] 2.1 檢視並重寫前端狀態、網路請求、設定與輔助模組（`webapp/js/state.js`、`webapp/js/api.js`、`webapp/js/auth.js`、`webapp/js/config.js`、`webapp/js/errorMessages.js`、`webapp/js/mock.js`、`webapp/js/moduleHelpers.js`）的函式 JSDoc，同步執行 `npm run build:webapp` 更新 `index.html`，並執行 `npm test && npm run check:lang && npm run format:check` 驗證通過
- [ ] 2.2 檢視並重寫前端共用 UI 元件、清單控制器與事件裝配模組（`webapp/js/ui.js`、`webapp/js/listController.js`、`webapp/js/eventBindings.js`、`webapp/js/wiring.js`、`webapp/js/courseData.js`）的函式 JSDoc，同步執行 `npm run build:webapp` 更新 `index.html`，並執行 `npm test && npm run check:lang && npm run format:check` 驗證通過
- [ ] 2.3 檢視並重寫前端主要業務頁面與應用入口模組（`webapp/js/app.js`、`webapp/js/courses.js`、`webapp/js/imports.js`、`webapp/js/accounts.js`、`webapp/js/activityLog.js`）的函式 JSDoc，同步執行 `npm run build:webapp` 更新 `index.html`，並執行 `npm test && npm run check:lang && npm run format:check` 驗證通過

## 3. 專案文件與技術手冊實體同步

- [ ] 3.1 全面更新根目錄 `README.md` 與 `AGENTS.md`，補正目錄樹遺漏檔案、反映 Node 24、最新架構、Web App 文件白名單路由、paged-table-container 前端容器、完整品質閘門指令與門檻，補齊 8 個遺漏模組職責說明與 2026-11-20 基準日，並執行 `npm run check:lang && npm run format:check && npm test` 驗證通過
- [ ] 3.2 全面更新 `docs/architecture-guide.html` 與 `docs/clasp-guide.html`，同步後端架構、文件路由、單一登錄、6 小時快取與 clasp 部署流程，並執行 `npm run check:lang && npm run format:check && npm test` 驗證通過
- [ ] 3.3 全面更新 `docs/course-normalization-guide.html` 與 `docs/參考資料/README.md`，同步 108 課綱 14 欄 1NF 全數展開演算法、官方 CSV 規格與分塊寫入架構，並執行 `npm run check:lang && npm run format:check && npm test` 驗證通過
- [ ] 3.4 全面更新 `docs/gis-login-guide.html`、`docs/rbac-guide.html`、`docs/user-guide.html` 與 `docs/index.html`（於 index 補齊 user-guide 卡片），維持 `docs/quality-baseline-2026-11-20.md` 歷史快照不變，並執行 `npm run check:lang && npm run format:check && npm test` 驗證通過

## 4. 驗證防護、建置與完整 CI 預跑

- [ ] 4.1 新增獨立文件完整性測試（`tests/docsIntegrity.test.js`），驗證所有白名單手冊檔案存在、`docs/index.html` 導覽完整性且各手冊間超連結無死鏈，執行 `npm test && npm run check:lang && npm run format:check` 驗證全數通過
- [ ] 4.2 執行 `npm run build:webapp` 重新打包 `index.html`、執行 `npm run test:coverage` 重建覆蓋率快照，並執行本地端完整 11 步 CI 預跑指令鏈全數綠燈通過
