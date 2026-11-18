# auth-rpc-test-coverage Specification

## Purpose

定義為支援主變更 `2026-11-18-port-ksvs-gis-rpc-and-quality` 之 task 5.1 所需補強的自動化測試覆蓋範圍，確保後端登入/驗證/Session/CSRF/公開設定與前端 API/auth/mock 關鍵行為具備可回歸驗證之測試保護。

## Requirements

### Requirement: Backend authentication and session tests MUST cover security-critical behaviors
自動化測試 MUST 涵蓋後端 Web API 與登入流程之關鍵安全行為，包括共用入口與請求格式處理、ID Token 驗證條件、可選登入網域限制、Session 與 CSRF 保護，以及公開設定欄位之正確性與敏感資訊遮罩。

#### Scenario: 驗證入口與公開設定行為
- **WHEN** 測試執行後端 API 相關案例
- **THEN** 測試 MUST 驗證 `executeWebApi`/路由對有效與無效請求之處理，以及 `getPublicConfig` 回傳必要公開欄位且不洩漏敏感密鑰明文

#### Scenario: 驗證登入限制與 CSRF 防護
- **WHEN** 測試執行登入、Session 與寫入型 action 案例
- **THEN** 測試 MUST 驗證 ID Token/網域限制（依實作支援情境）、Session 核發與還原、CSRF token 驗證失敗與成功路徑，以及未授權或不合法請求之錯誤結果

### Requirement: Frontend API client tests MUST cover RPC, fallback, retry, and CSRF propagation
自動化測試 MUST 涵蓋前端 API 客戶端在 GAS RPC 優先與 fetch 備援模式下之行為，包括回應解析、可重試錯誤之重試策略、錯誤正規化，以及 token/CSRF 之儲存與請求夾帶。

#### Scenario: RPC 與 fetch 路徑行為一致可驗證
- **WHEN** 測試分別模擬 `google.script.run` RPC 與瀏覽器 fetch 呼叫情境
- **THEN** 測試 MUST 驗證兩種傳輸路徑對成功、失敗與可重試情境之處理符合預期，且不破壞既有 action 呼叫介面

#### Scenario: CSRF 與重試策略可被驗證
- **WHEN** 測試執行需夾帶 CSRF 或遇到可重試錯誤之案例
- **THEN** 測試 MUST 驗證客戶端會保存/更新並傳遞 CSRF token，且僅對允許重試之錯誤依設定策略重試並回傳最終結果

### Requirement: Frontend auth bootstrap tests MUST cover supported login and restore flows
自動化測試 MUST 涵蓋前端啟動與登入狀態機之關鍵分支，包括 `INITIAL_AUTH` 注入結果、`switch=1` 帳號切換情境、既有 session 還原、GAS ActiveUser/OAuth 相關分流條件與 mock 模式相容行為（以可測試之介面與狀態轉移驗證）。

#### Scenario: 啟動流程可正確還原或建立登入狀態
- **WHEN** 測試模擬含 `INITIAL_AUTH`、既有 token 或無 session 之啟動情境
- **THEN** 測試 MUST 驗證應用程式能依情境進入正確狀態、保存必要 token/csrf 資訊並觸發對應後續載入行為

#### Scenario: GAS 與 mock 情境分流可被驗證
- **WHEN** 測試模擬 GAS 容器、一般網頁或 `?mock=true` 情境
- **THEN** 測試 MUST 驗證登入入口與 API 呼叫分流符合設計，且既有 mock 操作流程不因新登入/通訊機制而失效

### Requirement: Test suite integration MUST remain automated and CI-executable
新增或調整之測試 MUST 納入專案既有自動探索與執行機制（`npm test` / `scripts/run-tests.js` 或其後續等效流程），可於本機與 CI 非互動執行並提供穩定結果。

#### Scenario: 新增測試可被自動發現並執行
- **WHEN** 開發者或 CI 執行專案標準測試指令
- **THEN** 新增之相關測試檔 MUST 被自動納入執行且通過，無需手動逐檔指定
