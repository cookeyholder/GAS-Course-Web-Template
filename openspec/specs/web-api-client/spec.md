# web-api-client Specification

## Purpose

定義前端 API 客戶端在 GAS 容器以 RPC 優先、非容器以 fetch 備援的呼叫策略，以及錯誤處理、重試與請求信封格式契約。

## Requirements

### Requirement: RPC 優先與 Fetch 備援的 API 呼叫策略
前端 API 客戶端 SHALL 在 GAS HtmlService 容器且可用 `google.script.run.executeWebApi` 時優先使用原生 RPC 呼叫後端；在非容器環境或 RPC 不可用時 MUST 退回以 `fetch` 對 Web App URL 發送請求。所有請求 MUST 使用 `{ action, token?, csrfToken?, ...payload }` 信封格式；`fetch` 模式 MUST 使用 `text/plain;charset=utf-8` 以避免 CORS preflight 問題。後端 SHALL 提供可供 `doPost` 與 RPC 共用的 `executeWebApi` 處理入口並維持既有 action 相容。

#### Scenario: GAS 容器內優先使用 RPC
- **WHEN** 前端於可用 `google.script.run.executeWebApi` 的 GAS 容器中呼叫 API
- **THEN** 客戶端透過 RPC 傳送請求並正確解析字串或物件形式的回應

#### Scenario: 非容器環境使用 fetch 備援
- **WHEN** 前端於非 GAS 容器環境呼叫 API 且已設定 API URL
- **THEN** 客戶端以 `POST text/plain;charset=utf-8` 發送請求並解析 JSON 回應

### Requirement: API 錯誤處理與可重試機制
前端 API 客戶端 MUST 將網路錯誤、HTTP 非成功狀態、無效回應與後端業務錯誤轉為一致的結構化結果（至少包含 `ok` 與錯誤訊息資訊）。對可重試錯誤（包含 `network_error`、`rate_limited`、`lock_timeout`）SHALL 採用有限次數的指數退避重試；不可重試錯誤 MUST 立即回傳且不得無限重試。Mock 模式 MUST 維持本地模擬呼叫路徑，不得依賴實際網路或 GAS RPC。

#### Scenario: 暫時性錯誤觸發退避重試
- **WHEN** API 呼叫回傳 `rate_limited`、`lock_timeout` 或網路錯誤且尚未超過重試上限
- **THEN** 客戶端在退避等待後重試並於成功時回傳成功結果

#### Scenario: 回應格式無效時回傳結構化錯誤
- **WHEN** 後端回傳非預期格式或無法解析的內容
- **THEN** 客戶端回傳 `ok: false` 與可理解的錯誤代碼/訊息，不拋出未處理例外

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

#### Scenario: 正式網址加 mock 參數無效
- **WHEN** 使用者在正式部署網址加上 `?mock=true` 參數
- **THEN** 系統仍走真實 RPC/fetch 路徑，不產生 admin mock session
