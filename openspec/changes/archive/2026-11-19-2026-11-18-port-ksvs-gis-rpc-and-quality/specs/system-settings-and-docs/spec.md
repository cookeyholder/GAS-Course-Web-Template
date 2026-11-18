## ADDED Requirements

### Requirement: 公開設定與系統設定欄位擴充
後端 `getPublicConfig` SHALL 回傳前端啟動與登入判斷所需的公開欄位，至少包含系統名稱、OAuth Client ID、允許登入網域（若有）、是否已設定 Client Secret（布林）、目前 Web App URL（若可取得）與必要版本/狀態資訊；MUST NOT 回傳 OAuth Client Secret 明文。系統設定資料層與設定介面 MUST 支援新增的登入相關設定（至少包含允許登入網域）並與既有設定鍵/白名單機制保持相容。

#### Scenario: 前端可依公開設定判斷登入選項
- **WHEN** 前端呼叫 `getPublicConfig`
- **THEN** 回應提供足以判斷 GIS/ActiveUser/OAuth 相關可用性的公開欄位且不包含敏感密鑰明文

#### Scenario: 儲存系統設定時保留既有欄位相容性
- **WHEN** 管理員更新系統設定（含新增的允許登入網域欄位）
- **THEN** 後端正確儲存新欄位並保留既有必要設定與授權資料的可用性

### Requirement: GIS 與部署文件同步更新
專案文件 MUST 反映實際支援的登入與部署模式，至少涵蓋 GAS 沙箱限制、GIS 登入、ActiveUser/AccountChooser 流程、OAuth 授權碼回呼（若支援）的前置條件與設定步驟、網域限制、mock 測試方式與常見錯誤排除。文件內容 SHALL 使用臺灣繁體中文並符合本專案用語規範，且不得包含來源專案（KSVS）專屬業務名稱、網域或流程假設。

#### Scenario: 使用者可依文件完成本範本登入設定
- **WHEN** 使用者依照更新後的 GIS/部署文件進行設定
- **THEN** 文件提供與本專案實作一致的步驟、設定欄位名稱與限制說明，足以區分各登入模式的適用情境

#### Scenario: 文件不殘留來源專案專屬內容
- **WHEN** 檢視更新後文件
- **THEN** 不出現 KSVS 專屬系統名稱、固定網域或與本範本無關的業務流程描述
