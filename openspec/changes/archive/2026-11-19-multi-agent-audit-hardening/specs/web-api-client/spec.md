## ADDED Requirements

### Requirement: API 端點信任邊界
前端 API 客戶端 MUST 拒絕將 session token 或 csrfToken 發送到未經允許的端點。`?api=` 參數不得直接覆寫 `apiUrl`；僅同源 URL 或明確設定的 GAS Web App URL 可被接受。拒絕時 MUST 不傳送任何憑證並回傳明確錯誤。

#### Scenario: 外部惡意端點被拒絕
- **WHEN** 頁面帶有 `?api=https://attacker.example` 且使用者嘗試登入
- **THEN** 前端不傳送 credential 或 token 至該端點，並顯示端點不允許的錯誤

### Requirement: 錯誤訊息通用化
前端收到的後端錯誤 MUST 使用穩定錯誤代碼與本地化訊息；後端不得直接回傳例外物件的 `message` 原文。前端 MUST 將未知錯誤代碼映射到通用提示，不將原始例外文字顯示給使用者。

#### Scenario: 例外路徑不外洩
- **WHEN** 後端拋出含檔案路徑的例外
- **THEN** 前端 toast 顯示通用失敗訊息而非原始路徑

### Requirement: 大型 payload 重試策略
`callWithRetry` MUST 對 `lock_timeout` 與 `network_error` 加入 jitter 與總重試時間上限；大型匯入 payload MUST 預設停用自動重試，改由使用者明確重試。後端 MUST 支援 `importId` 幂等鍵以避免回應遺失造成重複寫入。

#### Scenario: 大型匯入不自動重送
- **WHEN** 大型 `importCourseCodes` 請求收到 `lock_timeout`
- **THEN** 前端不自動重送 payload，改提示使用者重試

#### Scenario: 重試間隔加入抖動
- **WHEN** 多個客戶端同時收到 `lock_timeout`
- **THEN** 重試時刻分散，不會在同一瞬間同時重送

### Requirement: 正式環境停用 Mock
正式建置的 `index.html` MUST 不允許 `?mock=true` 啟用 mock 客戶端；mock.js 僅供 `webapp/` 本機開發使用。建置腳本 MUST 保證正式產物沒有可觸發管理員 mock session 的路徑。

#### Scenario: 正式網址加 mock 参数無效
- **WHEN** 使用者在正式部署網址加上 `?mock=true` 參數
- **THEN** 系統仍走真實 RPC/fetch 路徑，不產生 admin mock session
