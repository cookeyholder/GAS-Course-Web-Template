# web-auth-and-session Specification

## Purpose

定義本範本多情境登入流程（mock、GIS、GAS ActiveUser/帳號切換）、ID Token 與登入授權驗證強化，以及 Session 與 CSRF 保護行為。

## Requirements

### Requirement: 多情境登入流程（Mock / GIS / GAS ActiveUser）
系統 SHALL 依執行環境與公開設定提供可用的登入路徑：`?mock=true` 時可使用 mock 登入；一般網頁環境可使用 Google Identity Services（GIS）credential 登入；GAS HtmlService 容器環境 SHALL 提供不依賴 GIS 彈窗的帳號切換與 ActiveUser 登入流程，以避免沙箱網域 `origin_mismatch`。前端啟動時 MUST 先取得公開設定，並依序處理 OAuth 回呼初始登入結果（`INITIAL_AUTH`）與帳號切換請求（`switch=1`/設定旗標），再決定是否還原既有 session。

#### Scenario: 一般網頁環境使用 GIS 登入
- **WHEN** 使用者於非 GAS 容器且非 mock 環境開啟系統且後端已設定 OAuth Client ID
- **THEN** 前端顯示 GIS 登入按鈕並於取得 credential 後呼叫 `login` 建立 session

#### Scenario: GAS 容器環境改用帳號切換與 ActiveUser 登入
- **WHEN** 使用者於 GAS HtmlService 容器環境開啟系統並觸發 Google 帳號登入/切換
- **THEN** 前端導向帳號選擇流程並於回到 Web App 後以 `loginWithActiveUser` 建立 session，且不得要求 GIS 彈窗作為唯一登入方式

#### Scenario: 啟動時處理 OAuth 回呼初始登入結果
- **WHEN** `doGet` 以授權碼流程完成登入並注入 `INITIAL_AUTH`
- **THEN** 前端在初始化階段套用登入成功或顯示明確錯誤訊息，並清理網址上的敏感查詢參數

### Requirement: ID Token 與登入授權驗證強化
後端 MUST 驗證 Google ID Token 的有效性與身分資訊，至少包含簽發者（`iss`）、Email 驗證狀態（`email_verified`）與受眾（`aud` 與系統設定 Client ID 相符）。系統 SHALL 支援可選的允許登入網域限制；當設定網域時，僅允許符合網域的帳號登入。登入與 session 建立流程 MUST 持續套用既有授權規則（白名單限制、帳號停用、角色指派與首次管理員開通機制），不得因新流程而繞過。

#### Scenario: ID Token 驗證失敗時拒絕登入
- **WHEN** `login` 收到 issuer 不符、Email 未驗證、aud 不符或缺少必要欄位的 ID Token
- **THEN** 後端回傳 `ok: false` 與明確錯誤代碼/訊息，且不建立 session

#### Scenario: 啟用網域限制時拒絕非允許網域帳號
- **WHEN** 系統已設定允許登入網域且使用者帳號網域不符
- **THEN** 後端拒絕 `login` 或 `loginWithActiveUser` 並回傳可理解的授權錯誤

### Requirement: Session 與 CSRF 保護
系統 SHALL 為成功登入與有效 session 還原流程提供 session token 與 CSRF token。所有寫入型 Web API action MUST 驗證 CSRF token 與有效 session；驗證失敗時 MUST 拒絕請求且不得執行資料寫入。登出與 session 失效流程 MUST 清除或使對應憑證失效，避免舊憑證持續用於寫入。

#### Scenario: 寫入型請求缺少或帶錯 CSRF token
- **WHEN** 已登入使用者呼叫寫入型 action 但未提供或提供錯誤的 CSRF token
- **THEN** 後端回傳 CSRF 驗證失敗錯誤且不執行寫入操作

#### Scenario: 登入成功後前端可取得 session 與 CSRF token
- **WHEN** 使用者透過任一支援的登入路徑成功登入
- **THEN** 回應包含可用的 session token 與 csrfToken，前端可用於後續 API 呼叫與寫入驗證

### Requirement: OAuth 回呼狀態 nonce 與鎖定寫入
授權碼回呼路徑 MUST 驗證前端產生的一次性 nonce 與 `redirectUri` 綁定，驗證失敗不得建立 session 或寫入白名單。凡涉及白名單或 session 寫入的回呼鏈 MUST 在 `LockService` 保護下完成，並在 `finally` 釋放鎖；Google token 交換等外部 HTTP 呼叫 MUST 在取得鎖之前完成。

#### Scenario: 回呼 nonce 不符時拒絕建立 session
- **WHEN** OAuth 回呼的 nonce 與前端保存值不符或已使用
- **THEN** 後端拒絕請求、不建立 session，且白名單不變

#### Scenario: 回呼寫入鏈正確釋放鎖
- **WHEN** `handleOAuthCodeCallback` 寫入過程拋出例外
- **THEN** `finally` 釋放鎖，後續請求不阻塞

### Requirement: 首次管理員開通順序收緊
`createSessionForEmail` MUST 先檢查白名單，再判斷是否為首次開通情境；白名單非空時 MUST 依既有 `restrictWhitelist` 規則拒絕未授權帳號，不得自動寫入角色。首次開通寫入 MUST 在獨立短鎖臨界區完成並二次檢查白名單。

#### Scenario: 未授權帳號無法因首次登入取得管理員
- **WHEN** 白名單已有管理者，新的 Google 帳號首次登入
- **THEN** 登入被拒絕且白名單不變

### Requirement: ID Token 有效期明確檢查
`validateTokenInfoClaims_` MUST 明確驗證 `exp` 與 `iat`，拒絕過期或時間異常的 ID Token（可容許合理 clock skew），不得僅依賴 Google tokeninfo 端點的間接驗證。

#### Scenario: exp 過期但 tokeninfo 仍回傳有效時被拒絕
- **WHEN** ID Token 的 `exp` 小於目前時間
- **THEN** 後端回傳 `token_expired` 且不建立 session

### Requirement: Session 失效提示與登入錯誤處理
`getSession` 回傳 `missing_token` 或 session 遭撤銷時，前端 MUST 顯示明確的過期/重新登入訊息，不得靜默回到登入頁。`auth.js` 中所有 `MEA.api.call(...).then(...)` MUST 搭配 `.catch()`，失敗時清除 busy 狀態並顯示可理解的錯誤，不得讓「登入中...」永久卡住。登出 MUST 防重複點擊並檢查回應結果，失敗時以 Toast 告知但仍清除本機敏感資料。

#### Scenario: Session 過期顯示明確訊息
- **WHEN** `getSession` 回傳 `missing_token`
- **THEN** 登入頁顯示「工作階段已過期，請重新登入」

#### Scenario: 登入 API rejection 釋放 busy 狀態
- **WHEN** `login` 呼叫觸發 Promise rejection
- **THEN** `loginBusy` 被重設為 false 且顯示錯誤訊息

### Requirement: 登入網域正規化一致
前端與後端 MUST 以相同規則正規化允許登入網域：`trim`、移除前綴 `@`、轉小寫。前端 AccountChooser 的 `hd` 參數 MUST 使用正規化後的結果。

#### Scenario: 混合大小寫網域在前後端一致
- **WHEN** 系統設定 `@Example.EDU.TW`
- **THEN** 後端比對與前端 `hd` 參數皆使用 `example.edu.tw`
