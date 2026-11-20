## ADDED Requirements

### Requirement: Web API 路由不得信任外部傳入的授權結果
所有 Web API 路由函式 MUST 自行向伺服器端 session 完成身份驗證與角色授權，MUST NOT 接受呼叫端傳入的授權結果、session 物件或已驗證標記作為信任依據。由於 GAS 全域函式可經 `google.script.run` 直接呼叫，路由的公開參數 MUST NOT 提供繞過身份驗證或 CSRF 驗證的捷徑。CSRF 驗證 MUST 比對請求攜帶的 token 與伺服器端 session 保存的 token，MUST NOT 接受請求同時提供兩者並自行比對通過。此限制 MUST NOT 影響既有以測試注入方式驗證授權的能力，前提是注入發生於伺服器端可控的相依解析層。

#### Scenario: 偽造授權參數無法提升權限
- **WHEN** 呼叫端以 GAS RPC 直接呼叫路由函式，並傳入自訂的 `{ ok: true, session: { role: "admin" } }` 類似的授權結果
- **THEN** 路由忽略該參數並自行驗證，未通過驗證時回傳 `missing_token` 或 `forbidden`，不執行任何管理員動作

#### Scenario: 自帶 CSRF token 無法通過驗證
- **WHEN** 呼叫端同時提供自訂 session 與相符的 CSRF token，但無有效的伺服器端 session
- **THEN** 請求因缺少有效伺服器端 session 被拒絕，不寫入任何商業資料、session 或白名單，不回傳任何日誌查詢結果（稽核日誌仍依最外層攔截寫入）

#### Scenario: 合法授權路徑不受影響
- **WHEN** 使用者以有效 token 與伺服器端 session 呼叫受保護動作
- **THEN** 授權與 CSRF 驗證通過，動作正常執行，且既有角色權限規則完全適用
