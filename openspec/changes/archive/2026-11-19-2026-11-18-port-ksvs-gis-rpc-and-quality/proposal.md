## Why

本專案範本目前的 Web App 登入與通訊流程仍偏向「一般網頁環境」假設：前端僅支援 GIS credential 彈窗登入與 `fetch` POST 呼叫，後端僅驗證 ID Token 的 `aud` 與 email、缺少 GAS 沙箱友善的替代登入路徑、缺少 `google.script.run` 原生 RPC 優先策略、缺少 CSRF 與網域限制等防護。實際部署於 GAS HtmlService（`*.googleusercontent.com` 沙箱）時，容易遇到 `origin_mismatch`、跨來源/登入態不穩、授權碼回呼難以落地等問題，影響範本可直接部署性與安全性。

同時，對照 KSVS 專案 `origin/main`（含 PR 2 的 GIS/RPC 強化與 PR 3 的品質閘門與工具鏈），本專案在登入穩健性、前後端通訊韌性、文件可操作性與開發品質防線仍有明顯可移植價值。為避免直接實作造成範圍失控，本變更先以 OpenSpec 明確界定要移植的範圍、優點、風險與實作順序，再進行分批落地。

## 移植範圍總覽（所有適合移植的部分）

### A. GIS 登入與 Session 強化（PR 2 為主，功能核心）
- **A1. GAS 原生 RPC 優先 + fetch 備援的 API 客戶端**：前端在 GAS 容器內優先走 `google.script.run.executeWebApi`，非容器/本機走 `fetch`；加入回應解析相容、狀態/錯誤處理與可重試錯誤的指數退避。
  - **優點**：降低 GAS 沙箱跨來源限制影響、提升連線穩定性、減少尖峰時 `lock_timeout`/暫時性錯誤造成的失敗。
  - **預期困難**：需抽出後端共用 `executeWebApi` 入口並保持既有 action 相容；RPC 與 fetch 回應型別/錯誤格式需一致；既有測試與 mock 流程需同步調整。
- **A2. 雙軌登入流程（GIS + GAS ActiveUser/AccountChooser + OAuth 授權碼回呼）**：保留一般環境 GIS 登入，同時支援 GAS 容器以帳號選擇器切換帳號後透過 `loginWithActiveUser` 建立 session；支援授權碼回呼 `doGet` → 後端換 token → `INITIAL_AUTH` 注入前端還原登入。
  - **優點**：解決沙箱 `origin_mismatch` 與切換帳號困境，提供可部署到 GAS 的實用登入路徑；保留 mock/本機開發彈性。
  - **預期困難**：前後端需協調多個狀態（`switch=1`、`INITIAL_AUTH`、`GAS_WEBAPP_URL`、session 還原）；需小心不破壞既有 mock 與現行 GIS 流程；OAuth redirect URI/Client Secret 設定說明需清楚。
- **A3. ID Token 與登入授權驗證強化**：驗證 `iss`、`email_verified`、`aud`，支援允許登入網域（`hd`/email 網域），登入與 session 還原時維持白名單/停用/角色判斷一致。
  - **優點**：補齊常見安全驗證缺口，讓範本更適合學校/組織網域控管情境。
  - **預期困難**：設定鍵與公開欄位需與現有 `databaseInitializer`/設定頁相容；需避免誤擋既有無網域限制的使用情境。
- **A4. Session CSRF 防護與公開設定擴充**：登入/取 session 核發並驗證 CSRF token（寫入型 action 強制驗證），`getPublicConfig` 回傳前端判斷所需欄位（如 `allowedDomain`、`hasClientSecret`、`activeEmail`、`webAppUrl`）。
  - **優點**：強化寫入請求防護、讓前端可依環境與設定顯示正確登入選項與提示。
  - **預期困難**：屬跨模組變更（session 結構、api/auth/ui/mock/tests）；需維持舊 session 過期後的平滑重登行為與本機 mock 相容。

### B. 前端啟動流程、設定介面與文件同步（PR 2 為主，PR 3 排版可參考）
- **B1. 啟動流程與文件標題同步**：啟動時先取公開設定，依序處理 `INITIAL_AUTH`/帳號切換/Session 還原，並以系統設定同步瀏覽器標題；重繪時保留焦點（提升操作體驗）。
  - **優點**：登入流程一致、減少重整後狀態遺失或畫面閃爍造成的困擾。
  - **預期困難**：`app.js`/`auth.js` 狀態機需小心排序，避免重複請求或登入迴圈。
- **B2. 系統設定與授權介面擴充**：設定頁支援允許登入網域等新欄位（並沿用既有 OAuth Client ID/Secret），公開設定與儲存邏輯一致。
  - **優點**：讓新登入能力可由 UI/試算表設定驅動，不需改程式碼。
  - **預期困難**：需保持資料庫初始化/讀寫/預設值向後相容，並避免覆蓋既有設定。
- **B3. GIS/部署文件重寫與本地化**：參考 KSVS 雙軌登入文件結構，改寫為本範本通用版本（含 GAS 沙箱限制、RPC、ActiveUser/AccountChooser、授權碼回呼條件、網域限制、mock 測試），吸收 PR 3 可讀性/格式改善但去除 KSVS 專屬內容。
  - **優點**：大幅提升範本可用性與可維運性，降低部署/登入踩雷成本。
  - **預期困難**：需準確對應本專案實作與設定鍵名，避免文件與程式不一致。

### C. 開發工具鏈、品質閘門與建置部署改進（PR 3 為主，斟酌通用化後移植）
- **C1. Prettier + Husky + lint-staged**：導入格式化與提交前檢查，統一程式碼風格。
  - **優點**：減少格式化雜訊（PR 3 登入檔多為格式差異即為例證）、提升協作一致性。
  - **預期困難**：首次格式化會產生大範圍 diff；需調整 `.prettierignore`/排除 `index.html` 建置產物等；可能影響現有開發流程。
- **C2. zh-TW 語言規範檢查（`scripts/languageCheck.js`）**：自動偵測簡體字與中國用語，對齊專案 AGENTS 規範。
  - **優點**：將本專案既有語言政策自動化落實，降低審查成本。
  - **預期困難**：規則需避免誤判共用字；需定義豁免檔案與 `language-check: ignore` 機制。
- **C3. 測試執行器與品質腳本基礎建設**：將 `npm test` 改為自動探索 `tests/**/*.test.js`（獨立子行程），並移植可通用的品質腳本結構（覆蓋率/度量/變更覆蓋率可先納入腳本與 CI 設計，門檻依本專案現況調整）。
  - **優點**：未來新增登入/RPC 測試可自動納管；品質可量化。
  - **預期困難**：本專案現有測試數量與覆蓋率基線遠低於 KSVS，若直接套用高門檻會阻塞 CI；需分階段導入。
- **C4. GitHub Actions 品質閘門工作流程**：新增 `quality-gates`（格式、語言、測試，並可逐步納入覆蓋率/度量）。
  - **優點**：將品質檢查前移至 CI，避免回歸。
  - **預期困難**：需確保 Node 版本、`npm ci` 與工作流程在本倉庫可重現；門檻過高會影響可用性。
- **C5. 部署腳本與建置流程改進**：引入 `scripts/deploy.js`（固定 Deployment ID/可設定描述）、調整 npm scripts 與 `.claspignore`/建置規範以支援新工具鏈。
  - **優點**：部署更可重複、減少誤建新部署導致網址變動。
  - **預期困難**：需兼容本專案現有 `clasp deploy` 使用習慣；Deployment ID 管理方式需文件化且不洩漏敏感資訊。

### D. 測試與驗證補強（PR 2/3 相關延伸，配合 A/B/C 落地）
- **D1. 登入/API 客戶端/RPC/CSRF/公開設定相關測試**：參考 KSVS 測試情境，新增或調整本專案可適用的單元測試（auth 流程、api client/RPC fallback、session/CSRF、設定欄位）。
  - **優點**：降低登入與通訊改版回歸風險。
  - **預期困難**：需建立/調整 GAS/瀏覽器 API mock 與測試輔助；避免測試與實作環境假設不一致。

## What Changes

- 新增 OpenSpec 變更提案與規格（本變更目錄），定義登入/RPC/Session/設定/文件/工具鏈的目標行為與驗收條件。
- 依提案分階段實作：後端 API 與 session/驗證強化 → 前端 api/auth/app/index/mock/state/ui/accounts 調整 → 文件重寫 → 工具鏈與 CI/部署腳本導入 → 測試與建置驗證。
- 以「範本通用化」為原則移植：移除 KSVS 專屬業務邏輯與品牌/網域預設，僅保留可通用的登入、通訊、安全與品質能力。
- **BREAKING (行為層面)**：寫入型 API 將要求 CSRF token；`getPublicConfig` 與 session/login 回應欄位將擴充；前端啟動/登入流程將由單一路徑改為多情境流程（mock/GIS/GAS ActiveUser/OAuth 回呼）。

## Capabilities

### New Capabilities
- `web-auth-and-session`：定義 GIS 雙軌登入、OAuth 授權碼回呼、ActiveUser/AccountChooser、ID Token 驗證強化、Session 與 CSRF 行為。
- `web-api-client`：定義前端 API 客戶端（RPC 優先/fetch 備援）、重試策略、回應解析與錯誤處理契約。
- `system-settings-and-docs`：定義系統公開設定欄位、設定介面擴充與 GIS/部署文件同步要求。
- `developer-tooling-and-quality`：定義格式化、語言檢查、測試執行與品質閘門/部署輔助工具的最低可用規範。

### Modified Capabilities
- （本倉庫尚無既有 OpenSpec capability 規格；既有行為變更以上列新 capability 規範管理）

## Impact

- **後端**：`webApi.js`（路由/登入/session/CSRF/token 驗證/公開設定/executeWebApi）、`databaseInitializer.js`（設定鍵與讀寫相容）、`utilities.js`（視需要輔助）。
- **前端**：`webapp/index.html`、`webapp/js/api.js`、`webapp/js/auth.js`、`webapp/js/app.js`、`webapp/js/config.js`、`webapp/js/state.js`、`webapp/js/mock.js`、`webapp/js/ui.js`、`webapp/js/accounts.js`、`webapp/styles.css`（必要時）、`scripts/build-webapp.js`。
- **文件**：`docs/gis-login-guide.html`（重寫為雙軌登入/部署教學）、必要時補充部署與設定說明文件。
- **測試與工具鏈**：`tests/**`、`scripts/**`、`package.json`、`.github/workflows/**`、`.husky/**`、`.prettierrc*`、`.prettierignore`、`.gitignore`、`.claspignore` 等。
- **外部相依與平台**：Google Identity Services、Google OAuth tokeninfo/授權流程、GAS `google.script.run`、`ScriptApp`、`Session`、`CacheService`、`LockService`、`UrlFetchApp`。
