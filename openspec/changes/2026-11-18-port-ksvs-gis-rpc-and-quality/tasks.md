## 1. 後端登入、Session 與 API 入口重構

- [x] 1.1 重構 `webApi.js`：抽出共用 `executeWebApi(payload, event)`，統一 `doPost`/RPC 入口與錯誤回應格式，保留既有課程與 RBAC action 相容。
- [x] 1.2 強化登入與 token 驗證：補齊 `iss`、`email_verified`、`aud` 驗證與可選允許登入網域檢查，擴充 `getPublicConfig`（`activeEmail`、`allowedDomain`、`hasClientSecret`、`webAppUrl` 等公開欄位）。
- [x] 1.3 實作 GAS 雙軌登入支援：新增/整合 `loginWithActiveUser`，支援 `doGet` OAuth 授權碼回呼與 `INITIAL_AUTH` 注入流程（含必要狀態與錯誤處理）。
- [x] 1.4 實作 Session CSRF 防護：登入與 session 還原核發 csrfToken，寫入型 action 驗證 CSRF，並調整登出/失效流程。
- [x] 1.5 更新 `databaseInitializer.js` 與相關後端輔助邏輯：新增允許登入網域等設定鍵與預設值/讀寫相容，確保不破壞既有設定與授權資料。

## 2. 前端 API 客戶端與啟動/登入流程移植

- [x] 2.1 重構 `webapp/js/api.js`：實作 RPC 優先 + fetch 備援、回應解析、可重試錯誤指數退避、CSRF token 儲存與自動夾帶、統一錯誤結果格式。
- [ ] 2.2 重構 `webapp/js/auth.js` 與 `webapp/js/app.js`：實作多情境啟動流程（`INITIAL_AUTH`、帳號切換/`switch=1`、session 還原）、GAS AccountChooser/ActiveUser 與一般 GIS 流程分流、登入狀態與錯誤處理一致化。
- [ ] 2.3 更新 `webapp/index.html`、`webapp/js/config.js`、`webapp/js/state.js`：支援 `GAS_WEBAPP_URL`/`INITIAL_AUTH`/切換參數、csrf 與新公開設定欄位，並維持 mock 模式行為。
- [ ] 2.4 更新 `webapp/js/mock.js`、`webapp/js/ui.js`、`webapp/js/accounts.js`、`webapp/styles.css`（必要時）：補齊 mock 新 action/欄位、登入 UI 提示與按鈕、系統設定欄位（允許登入網域等）與顯示調整。

## 3. 文件重寫與部署/使用說明同步

- [ ] 3.1 重寫 `docs/gis-login-guide.html` 為本範本雙軌登入教學（GIS、GAS ActiveUser/AccountChooser、OAuth 授權碼回呼條件、網域限制、常見錯誤與排除），移除 KSVS 專屬內容。
- [ ] 3.2 視實作補充或更新相關文件/說明（如 README、部署與設定注意事項），確保與程式行為、設定鍵名與 npm scripts 一致。

## 4. 開發工具鏈與品質閘門導入

- [ ] 4.1 導入 Prettier 與忽略規則（`.prettierrc*`、`.prettierignore`），並調整腳本/流程避免建置產物干擾。
- [ ] 4.2 導入 `scripts/languageCheck.js` 與必要的測試/品質腳本基礎（含 `scripts/run-tests.js` 自動探索測試），更新 `package.json` scripts 與 devDependencies。
- [ ] 4.3 新增 `.github/workflows/quality-gates.yml`（至少包含格式檢查、語言檢查、測試），並依本專案基線設定可通過的品質門檻策略。
- [ ] 4.4 導入部署輔助改進（如 `scripts/deploy.js` 與相關設定/ignore 調整），維持與現有 clasp 流程相容並文件化使用方式。
- [ ] 4.5（可選/分階段）導入 Husky + lint-staged 與覆蓋率/複雜度/變更覆蓋率檢查腳本；若啟用需同步補充文件與確保本地/CI 可通過。

## 5. 測試、驗證與收斂

- [ ] 5.1 新增或調整測試：涵蓋後端登入/驗證/CSRF/公開設定、前端 API 客戶端 RPC/fetch 與重試行為、auth 啟動與登入情境（含 mock 相容）。
- [ ] 5.2 執行並通過驗證：`npm test`、`npm run build:webapp`、語言/格式檢查（若已導入腳本與 CI 規則），修正回歸。
- [ ] 5.3 進行最終檢查：確認無 KSVS 專屬業務邏輯誤植、文件與實作一致、`.claspignore`/建置產物與工具鏈設定合理，並整理變更內容。
