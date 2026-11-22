## Why

經過多輪架構重構與功能擴充（包含 Web App 文件路由、`paged-table-container` 分頁容器、科別代碼排序、Empty State CTA、全站安全降級保護等），現存的專案說明文件（`README.md`、`AGENTS.md`、`docs/*.html`、`docs/參考資料/README.md` 等）及多數後端與前端核心函式之 JSDoc 註解已嚴重滯後，與程式碼實作現況產生多處斷層。為維護專案作為全端範本之高品質、可維護性與單一事實來源（Single Source of Truth），必須全面以「當前程式碼實作現況」為唯一事實依歸，徹底重新校正、檢核並同步更新所有技術文件、指引規章與函式 JSDoc。

## What Changes

- **後端函式 JSDoc 全面校正與重寫**：逐一檢視根目錄所有後端模組（`webApi.js`、`main.js`、`actionRegistry.js`、`gasRuntime.js`、`databaseInitializer.js`、`systemConfigCodec.js`、`utilities.js`、`activityLogger.js`、`activityLogBuilders.js`、`activityLogInterceptor.js`、`activityLogQuery.js`、`courseNormalizationShared.js`、`subjectCodeTransformer.js`，排除打包產物 `version.generated.js`），對齊真實參數名稱、型別、預設值、回傳值結構與例外拋出行為，徹底清除過時或不實註解。
- **前端函式 JSDoc 全面校正與重寫**：逐一檢視 `webapp/js/` 所有模組（`state.js`、`api.js`、`auth.js`、`config.js`、`errorMessages.js`、`mock.js`、`moduleHelpers.js`、`ui.js`、`listController.js`、`eventBindings.js`、`wiring.js`、`courseData.js`、`app.js`、`courses.js`、`imports.js`、`accounts.js`、`activityLog.js`），對齊相依注入介面、DOM 參數、非同步 Promise 行為與回傳型別。
- **專案根目錄指引文件實體同步**：
  - 更新 `README.md`：反映最新架構（Node 24、多風格 CSS、`paged-table-container`、1NF 正規化、文件白名單路由、完整品質閘門指令與門檻、補正目錄樹遺漏檔案）。
  - 更新 `AGENTS.md`：補齊 8 個遺漏之後端與前端模組職責說明（`activityLogInterceptor.js`、`activityLogQuery.js`、`courseNormalizationShared.js`、`systemConfigCodec.js`、`listController.js`、`eventBindings.js`、`wiring.js`、`moduleHelpers.js`）與品質基準線說明。
- **`docs/` 技術手冊全面修訂**：更新 `architecture-guide.html`、`clasp-guide.html`、`course-normalization-guide.html`、`gis-login-guide.html`、`rbac-guide.html`、`user-guide.html`、`index.html`（補齊 `user-guide.html` 導覽卡片）與 `docs/參考資料/README.md`，使其與最新程式碼、路由參數、UI 行為及安全防禦規範完全一致；明確宣告歷史快照 `docs/quality-baseline-2026-11-20.md` 為不可變檔案。
- **文件完整性整合測試防護**：新增 `tests/docsIntegrity.test.js` 單元測試，驗證所有白名單手冊實體檔案均存在，並檢核手冊間超連結無死鏈（Broken Links）。

## Capabilities

### Modified Capabilities
- `system-settings-and-docs`: 更新文件規範與驗證要求，明確規範專案文件與所有函式 JSDoc 必須 100% 以實際程式碼為單一事實來源，並涵蓋 Web App 文件路由、最新 UI 元件、專案規章（`AGENTS.md`）與完整品質閘門標準。

## Impact

- **程式碼**：全專案根目錄後端模組與 `webapp/js/` 前端模組的 JSDoc 註解更新（純註解更動，無破壞性功能變更）。
- **文件**：`README.md`、`AGENTS.md`、`docs/*.html`、`docs/參考資料/README.md` 等全數以臺灣繁體中文更新。
- **建置產物**：前端修改時同步建置根目錄 `index.html`，維持產物完全一致。
- **測試**：新增 `tests/docsIntegrity.test.js` 確保手冊實體與超連結健全性。
- **依賴與系統**：無外部套件變更，相容現行 Node.js 24 與 GAS 雲端環境。
