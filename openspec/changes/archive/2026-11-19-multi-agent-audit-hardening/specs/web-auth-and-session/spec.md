## ADDED Requirements

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
