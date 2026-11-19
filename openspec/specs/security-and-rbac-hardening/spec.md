# security-and-rbac-hardening Specification

## Purpose
定義 Web API 的授權與安全防線，涵蓋明確 action 列舉的角色權限、首次管理員開通、OAuth state nonce 一次性驗證、API 端點白名單與寫入鎖定，防堵未授權存取與重放攻擊。

## Requirements

### Requirement: 明確 RBAC 授權與敏感欄位遮蔽
後端 MUST 以明確列舉的方式判定角色權限，不得使用 `/^get[A-Z]/` 之類的隱式通配規則授權所有讀取動作。`getSession`、`getCourseIndex`、`getSystemSettings`、`getAccounts` 與 `logout` 等動作 MUST 在角色權限表中有明確定義；移除通配規則後，staff 與 viewer 仍 MUST 能還原 session 與登出。`getSystemSettings` 回傳的系統設定 MUST 依角色遮蔽敏感欄位：`clientSecret` 僅 admin 可見，其他角色取得的設定物件不得包含該欄位或其值。

#### Scenario: viewer 讀取系統設定不得取得 Client Secret
- **WHEN** viewer 角色以有效 token 呼叫 `getSystemSettings`
- **THEN** 回傳 `ok: true` 且 `settings` 不包含 `clientSecret`，也不得包含任何等效機密欄位

#### Scenario: 新增 getXxx 動作不會被自動授權
- **WHEN** 開發者在後端新增一個未列於角色權限表的 `getSensitiveReport` 動作
- **THEN** 非 admin 角色呼叫該動作時被拒絕（`forbidden`），而非因通配規則自動通過

#### Scenario: staff 仍可還原 session 與登出
- **WHEN** staff 角色呼叫 `getSession` 與 `logout`
- **THEN** 兩項動作皆被授權並正常執行

### Requirement: 首次管理員開通安全
系統 MUST 在白名單檢查之後才判斷是否為首次管理員開通；白名單非空時，未授權帳號 MUST 被拒絕，不得寫入任何角色。白名單為空且請求明確標記為 bootstrap 情境時，才允許寫入首位管理者，且該寫入 MUST 在 LockService 短臨界區內完成並二次檢查白名單，避免並發請求互相覆寫。

#### Scenario: 白名單非空時未授權帳號不得成為管理員
- **WHEN** 白名單已有 admin 且未授權 Google 帳號首次登入
- **THEN** 登入被拒絕、不建立 session，且白名單內容不變

#### Scenario: 並發首次開通只寫入一名管理員
- **WHEN** 白名單為空且兩個請求同時觸發 bootstrap
- **THEN** 只有一個請求成功寫入管理者，另一個請求觀察到白名單已非空並依一般授權規則處理

### Requirement: OAuth state nonce 一次性驗證
前端產生 OAuth `state` 時 MUST 同時產生不可預測的 nonce（`crypto.getRandomValues` 優先），並與 `redirectUri` 一同保存；後端處理授權碼回呼時 MUST 驗證回呼帶回的 nonce 與保存值一致且尚未使用，並驗證 `redirectUri` 與設定/Web App URL 相符。nonce MUST 一次性消耗；驗證失敗時 MUST 拒絕建立 session 並回傳明確錯誤，不得寫入白名單。

#### Scenario: 重放相同 nonce 被拒絕
- **WHEN** 攻擊者重複使用已消耗的 nonce 觸發 OAuth 回呼
- **THEN** 後端拒絕請求、不建立 session，且白名單不變

#### Scenario: nonce 與 redirectUri 綁定不符被拒絕
- **WHEN** 回呼的 nonce 正確但 `redirectUri` 與設定值不符
- **THEN** 後端拒絕回呼並回傳明確錯誤

### Requirement: 授權碼回呼寫入鎖與外部 HTTP 隔離
`doGet` 的 OAuth 授權碼回呼凡是涉及白名單或 session 寫入的路徑，MUST 取得 `LockService` 鎖並在 `finally` 釋放；外部 HTTP 請求（如向 Google 換取 token）MUST 在取得鎖之前完成，不得在持有全域鎖期間執行。

#### Scenario: 回呼寫入取得鎖並正確釋放
- **WHEN** OAuth 回呼進入 `createSessionForEmail` 寫入鏈
- **THEN** 寫入在鎖保護下完成，且無論成功或拋錯都釋放鎖

#### Scenario: 外部 HTTP 不在鎖內
- **WHEN** 同時有多個登入請求進行 Google token 驗證
- **THEN** 驗證用的 `UrlFetchApp.fetch` 呼叫不被全域 Script Lock 序列化

### Requirement: API 端點與第三方腳本信任邊界
前端 MUST 拒絕將 session token 或 CSRF token 傳送到未經允許的 API 端點；`?api=` 參數不得直接覆寫端點，僅接受同源或明確設定的 GAS 端點。SheetJS CDN MUST 固定單一版本並附 `integrity` 與 `crossorigin` 屬性。正式部署的 `index.html` 產物 MUST 預設停用 mock 模式，避免 `?mock=true` 在正式環境產生管理員 session。

#### Scenario: 惡意 api 參數被拒絕
- **WHEN** 頁面網址帶有 `?api=https://attacker.example`
- **THEN** 前端拒絕覆寫端點、不傳送任何 token，並使用預設端點或顯示錯誤

#### Scenario: 正式產物無法啟用 mock
- **WHEN** 使用者在正式部署的 `index.html` 加上 `?mock=true`
- **THEN** mock 模式不被啟用，仍走真實 API 路徑

#### Scenario: CDN 腳本具備完整性驗證
- **WHEN** 瀏覽器載入 SheetJS
- **THEN** `<script>` 具備固定版本的 `src`、`integrity` 與 `crossorigin="anonymous"`

### Requirement: 匯入資料上限與公式注入防護
後端 `importCourseCodes` MUST 驗證 payload 為非空之二維陣列、列數不超過設定上限、每列欄數符合預期（一般列 39 欄、`preNormalized` 列 14 欄）。`preNormalized` 資料 MUST 驗證結構而非直接信任前端。`writeCourseIndexRowsInChunks_` 寫入前 MUST 套用 `sanitizeRowMatrix`，確保以 `=`／`+`／`-`／`@` 開頭的儲存格被視為純文字。

#### Scenario: 超出上限的匯入被拒絕
- **WHEN** 呼叫端提交超過設定列數上限的課程資料
- **THEN** 後端回傳明確錯誤且不寫入任何工作表資料

#### Scenario: preNormalized 欄數不符被拒絕
- **WHEN** `preNormalized: true` 的 payload 含非 14 欄的資料列
- **THEN** 後端拒絕匯入並回傳結構驗證錯誤

#### Scenario: 公式字串被中和
- **WHEN** 匯入資料包含 `=HYPERLINK(...)` 之類開頭值
- **THEN** 寫入工作表的內容為純文字，不觸發公式計算

### Requirement: ID Token 有效期與錯誤訊息通用化
後端 MUST 明確檢查 ID Token 的 `exp` 與 `iat` 宣告，到期或時間異常時拒絕登入（可容許合理 clock skew）。API 錯誤回應 MUST 使用通用錯誤代碼與可本地化訊息，不得直接回傳後端例外物件的 `message` 原文，避免内部路径或設定值外洩。

#### Scenario: 過期 ID Token 被拒絕
- **WHEN** `login` 收到 `exp` 已過期的 ID Token（即使 tokeninfo 端點未拒絕）
- **THEN** 後端拒絕登入並回傳明確的 `token_expired` 錯誤

#### Scenario: 例外訊息不外洩
- **WHEN** 後端處理過程拋出含檔案路徑的例外
- **THEN** 前端收到的 error 為通用代碼與本地化訊息，不含原始例外文字

### Requirement: 操作日誌讀取動作限系統管理員
`getActivityLog` MUST 在 `ACTIONS` 登錄表中明確宣告僅 `admin` 可呼叫，且 MUST NOT 被加入任何非管理員角色的授權清單。管理員角色由角色權限產生函式明確列舉所有已登錄 action，MUST NOT 使用 `["*"]` 之類的隱式通配規則；既有 `api.test.js` 等 RBAC 測試 MUST 隨此變更回歸通過。非管理員呼叫時後端 MUST 拒絕並回傳通用的禁止存取錯誤，不得回傳任何日誌內容；前端操作日誌頁籤 MUST 依角色過濾，不得僅依靠前端隱藏作為唯一防線。

#### Scenario: 管理員可讀取操作日誌
- **WHEN** 系統管理員呼叫 `getActivityLog`
- **THEN** 回傳分頁的日誌清單，含概要欄位與詳情

#### Scenario: 非管理員呼叫被拒絕
- **WHEN** `staff` 或 `viewer` 角色呼叫 `getActivityLog`
- **THEN** 後端回傳禁止存取錯誤，且不回傳任何日誌內容

#### Scenario: 前端隱藏不取代後端驗證
- **WHEN** 非管理員以任何方式繞過前端直接發送 `getActivityLog` 請求
- **THEN** 後端仍拒絕請求，不會因為前端隱藏而放行

#### Scenario: 管理員權限採明確列舉
- **WHEN** 查詢管理員角色的授權清單
- **THEN** 清單明確列出所有已登錄 action（含 `getActivityLog`），且不含 `*` 通配項目
