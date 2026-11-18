## Context

本專案為 GAS Web App 範本（前端 `webapp/` 以 build script 內嵌為根目錄 `index.html`，後端為 Apps Script `.js` 全域腳本，並透過 Node 相容匯出支援本機測試）。現況：
- 前端 API 僅 `fetch` 呼叫 `MEA.config.apiUrl`，無 RPC、無重試、無 CSRF；mock 僅走 `MEA.mock.handle`。
- 前端登入僅 GIS credential 彈窗 + `login` action；啟動流程簡單（`getPublicConfig` 後 `restore`）。
- 後端僅 `doGet`/`doPost` JSON 路由，公開 action 僅 `ping/getPublicConfig/login`；`verifyGoogleIdToken` 僅驗 `aud` 與 email；session 無 CSRF；無 `loginWithActiveUser`/OAuth code callback/`executeWebApi` 共用入口。
- 專案目前無 `.github/workflows`、無 Prettier/Husky、測試為固定兩檔指令，`deploy` 為 `clasp push && clasp deploy`。

KSVS `origin/main` 已驗證可行的方向（PR 2）包含：GAS 容器 RPC 優先、ActiveUser/AccountChooser 與 OAuth 授權碼回呼雙軌登入、`INITIAL_AUTH` 注入與 URL 清理、ID token 驗證強化（issuer/email_verified/網域）、CSRF、API 重試與回應解析、公開設定擴充與文件更新。PR 3 則補上格式化、語言檢查、品質閘門與相關腳本。移植時需去除 KSVS 業務邏輯（班級/配課/報表等）並保留本範本的課程匯入與 RBAC 範圍。

## Goals / Non-Goals

**Goals:**
- 將 GAS 部署情境下的登入與通訊可靠性提升到可作為範本預設（RPC 優先、雙軌登入、明確公開設定）。
- 在不破壞既有 `?mock=true` 與基本 GIS 流程前提下，補齊安全性（issuer/email_verified/網域/CSRF）與韌性（重試/錯誤解析）。
- 補齊可操作文件與可執行品質防線（語言/格式/測試自動化與 CI 基礎）。
- 以最小必要變更擴充現有模組，維持範本結構簡潔與可理解性。

**Non-Goals:**
- 不移植 KSVS 專屬業務功能與資料模型（班級清冊匯入流程、教師/配課/報表/採購等 action 與 UI）。
- 不重寫整個前端框架或後端架構；不引入外部建置框架（維持原生 JS + 現有 build script）。
- 不在本次強制達成與 KSVS 相同的覆蓋率/複雜度高門檻；品質門檻採分階段可通過策略。
- 不變更固定 GAS 部署網址策略本身（僅改善部署輔助腳本與流程）。

## Decisions

### 1. 採「共用 executeWebApi + RPC 優先/fetch 備援」通訊架構
- **做法**：後端抽出 `executeWebApi(payload, event)` 作為核心處理入口，`doPost` 與 `google.script.run`（前端 RPC）共用；`doGet` 僅保留有限唯讀 action 與 HTML 服務/授權碼回呼處理。前端 `api.js` 在偵測到 `google.script.run.executeWebApi` 且非 mock 時優先 RPC，否則走 `fetch`。
- **理由**：直接對應 GAS 部署現實，並可集中錯誤處理/回應序列化；避免前後端行為分叉。
- **替代方案**：僅改善 fetch/CORS 設定。未採用，因沙箱環境限制與登入態問題無法根本解決。

### 2. 登入採多情境狀態機，而非單一 GIS 彈窗
- **做法**：啟動時先 `getPublicConfig`；依序處理 `INITIAL_AUTH`（OAuth 回呼結果）→ `switchAccount`/`?switch=1`（清舊 session 後 `loginWithActiveUser`）→ `restore`（既有 token）。登入 UI 依環境提供：mock 登入、一般環境 GIS、GAS 容器 AccountChooser/ActiveUser（及可選 OAuth redirect 按鈕，視設定完整度顯示）。
- **理由**：兼顧本機/mock、一般網頁與 GAS 沙箱三種常見使用情境，提升範本可移植性。
- **替代方案**：只保留 GIS。未採用，因 GAS 沙箱常見 `origin_mismatch`；只保留 ActiveUser 則不利一般網頁環境。

### 3. 安全強化採「向後相容預設 + 可設定收斂」
- **做法**：ID token 驗證增加 `iss`、`email_verified`、`aud`；新增可選允許登入網域（未設定時不限制網域，維持相容）。Session 寫入 action 驗證 CSRF（token 由登入/session 發放並由前端保存傳遞）。`getPublicConfig` 僅回傳必要公開資訊（含 `hasClientSecret` 布林，不回傳 secret 明文於公開端點）。
- **理由**：提升安全性同時避免破壞現有專案立即可用性。
- **替代方案**：一次強制網域白名單與嚴格部署條件。未採用，會降低範本通用性與首次使用成功率。

### 4. 系統設定與資料層採增量擴充
- **做法**：沿用 `databaseInitializer.js` 現有「系統設定與授權」結構，增補允許登入網域等設定鍵與讀寫/預設值相容邏輯；前端設定頁僅擴充必要欄位與提示，不改動既有 RBAC 管理核心流程。
- **理由**：降低遷移風險，保留既有試算表資料相容性。
- **替代方案**：重構設定表結構。未採用，風險與範圍過大。

### 5. 文件以「本範本語境重寫」而非複製貼上
- **做法**：參考 KSVS 雙軌登入文件章節結構與說明重點，重寫 `docs/gis-login-guide.html`（與必要相關文件）為本專案用語、設定鍵名、部署流程；移除 KSVS 專屬系統名稱/網域/角色情境。
- **理由**：文件價值在於可操作且與實作一致，直接複製會造成誤導。
- **替代方案**：僅小修現有文件。未採用，無法涵蓋新登入模式與排錯重點。

### 6. 品質工具鏈採分階段導入，先求「可用且不阻塞」
- **做法**：
  - 必導：Prettier 設定與忽略檔、語言檢查腳本、測試自動探索執行器、基礎品質 workflow（格式/語言/測試）。
  - 選配落地順序：Husky/lint-staged 與覆蓋率/複雜度/變更覆蓋率腳本可納入，但門檻與範圍以本專案現況調整（避免因基線不足導致 CI 永久失敗）。
  - 部署腳本改為可讀取固定 Deployment ID（環境變數或設定檔）並保留相容入口。
- **理由**：平衡「品質提升」與「範本可維護性/可上手性」；避免一次導入過多門檻造成阻塞。
- **替代方案**：完整照搬 KSVS 所有門檻與腳本。未採用，對目前測試/程式規模不成比例。

## Risks / Trade-offs

- **[風險] 跨模組登入狀態機改動導致回歸** → 以 OpenSpec 分 capability 實作，先補齊/調整測試（auth/api/session/設定），並保留 mock 與既有 GIS 路徑驗證。
- **[風險] CSRF 導入破壞既有前端呼叫或舊 session** → session 回應統一提供 csrfToken，前端集中附帶；過期/無效時回傳明確錯誤並引導重新登入。
- **[風險] OAuth 授權碼流程需額外 GCP 設定** → 設計為可選路徑（依 `hasClientSecret`/環境顯示），文件明確標示必要條件與替代方案（GIS/ActiveUser）。
- **[風險] 全域格式化造成大型 diff** → 將格式化與功能提交分步管理（同一變更內有序執行），並限制忽略建置產物/第三方內容。
- **[風險] CI 品質門檻過嚴造成阻塞** → 初版門檻以可通過為原則，覆蓋率/複雜度採漸進式提升。
- **[取捨] 增加程式與設定複雜度** ↔ 換取 GAS 實際部署可用性、安全性與可維運性（對範本專案整體效益正向）。

## Migration Plan

1. **提案與規格定稿（本階段）**：建立 proposal/design/tasks 與 capability specs，確認移植範圍與驗收基準。
2. **後端核心移植**：重構 `webApi.js`（`executeWebApi`、公開設定、token 驗證、ActiveUser/OAuth callback、session+CSRF、路由相容），同步 `databaseInitializer.js` 設定欄位。
3. **前端核心移植**：更新 `webapp/index.html` 與 `js/config|api|auth|app|state|mock|ui|accounts`，完成雙軌登入、RPC、狀態還原與設定 UI。
4. **文件同步**：重寫 GIS/部署登入文件並校對實作與設定名稱。
5. **工具鏈與 CI**：加入格式化/語言檢查/測試執行器/品質 workflow/部署輔助腳本與 npm scripts，調整 ignore 與必要設定檔。
6. **驗證與收斂**：執行 `npm test`、`npm run build:webapp`、`node scripts/languageCheck.js`（若導入）與 mock/流程檢查；修正回歸後整理提交。

**Rollback 策略**：以 git 分支/提交逐步回退；若 CSRF 或新登入流程造成阻塞，可先保留 RPC 與驗證強化並暫時停用高風險路徑（需同步調整前端與文件），但最終以完整通過規格為目標。

## Open Questions

- 覆蓋率/複雜度/變更覆蓋率門檻是否於本次即啟用硬性 CI 阻擋（建議：先落地腳本與 workflow，門檻採保守值或分階段開啟）。
- 是否同步導入 Husky pre-commit（會改變本機提交流程）；若導入需在 README/AGENTS 補充安裝與跳過規範。
- OAuth 授權碼回呼流程是否作為本範本預設建議路徑之一，或僅作進階選項（取決於目標使用者對 GCP 設定熟悉度）。
