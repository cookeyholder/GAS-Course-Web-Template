# system-settings-and-docs Specification

## Purpose

定義後端公開設定欄位、系統設定擴充與 GIS/部署文件同步要求，確保前端可依公開資訊判斷登入選項，且設定與文件與程式實作一致。

## Requirements

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

### Requirement: 資料層純化向後相容與記憶體儲存一致性
重構後之 `readSystemSettings`、`saveSystemSettings`、`readWhitelist` 與 `saveWhitelist` 函式對外呼叫簽名、回傳結構與安全防禦 MUST 保持 100% 向後相容。純轉換邏輯 MUST 提供純物件正規化函式（`normalizeSystemSettings` 與 `normalizeWhitelistAccount`），讓試算表實體儲存與無試算表物件時的記憶體儲存（In-Memory Fallback）共用同一套規則。命令式外殼在寫入試算表儲存格前，MUST 保留 `sanitizeRowMatrix` 公式注入安全防禦，並維持與既有測試替身（`A2:B30` 範圍限定）的相容性。

#### Scenario: 記憶體儲存與試算表解析結果具同構性
- **WHEN** 在無試算表環境與在試算表環境下提供相同的初始設定值
- **THEN** `readSystemSettings` 回傳之設定物件同時具備原始鍵名與駝峰便捷鍵，且在布林值判定與小寫網域正規化上完全相同

#### Scenario: 儲存系統設定與白名單之對外呼叫契約維持不變
- **WHEN** 呼叫端以既有方式呼叫 `saveSystemSettings(settings, ss)` 或 `saveWhitelist(accounts, ss)`
- **THEN** 回傳結構維持 `{ ok: true }` 或 `{ ok: true, count }`，命令式外殼執行單次安全寫入，且既有所有測試無回退通過

### Requirement: 教育部官方參考資料庫目錄手冊納管
專案之 `docs/參考資料/` 目錄 MUST 包含一份以臺灣繁體中文撰寫之 `README.md` 說明文件。該文件 SHALL 詳列納管之教育部官方核定 CSV 檔案（如 `科別代碼.csv`、`科目固定編碼.csv`）之資料來源出處、版本發布時間、檔案 UTF-8 BOM 編碼注意事項、欄位編碼規格（群別代碼、科別代碼、開課屬性、必選修等），以及本專案 108 課綱技術型高中 14 欄 1NF 全數展開演算法之對應關係，建立單一事實來源（Single Source of Truth）之技術參考指引。

#### Scenario: 參考資料目錄具備完整說明文件
- **WHEN** 開發者或審查者檢視 `docs/參考資料/` 目錄
- **THEN** 存在 `README.md`，內容詳列所有 CSV 檔案之來源、BOM 編碼處理、編碼定義與 1NF 模組關聯，且無簡體字或中國用語

### Requirement: 後端 Web App 文件白名單路由與部署放行支援
專案根目錄 `.claspignore` MUST 放行 `docs/` 目錄與 `docs/*.html` 檔案（加入 `!docs/` 與 `!docs/**`），確保雲端部署時手冊檔案能正確推送至 GAS 專案。
後端 `webApi.js` 的 `doGet(e)` 進入點 MUST 支援文件路由參數（`?page=docs/...`），並定義白名單路由對照表 `WEB_APP_DOC_ROUTES`：
1. **白名單安全性限制與路徑扁平化相容**：僅接受白名單完全相符的 `docs/*.html` 路由（至少包含 `docs/architecture-guide.html`、`docs/clasp-guide.html`、`docs/course-normalization-guide.html`、`docs/gis-login-guide.html`、`docs/index.html`、`docs/rbac-guide.html` 與 `docs/user-guide.html`），並相容 clasp 子目錄壓平候選（`docs/file` 與 `docs-file`）。嚴禁跳出 `docs/` 範圍或存取未授權檔案。
2. **安全回應建立**：命中白名單時透過 `HtmlService.createHtmlOutputFromFile`（或本地測試替身）建立回應，設定對應之頁面標題、Viewport 與預設 XFrameOptionsMode；若檔案不存在或參數非白名單項目，MUST 回傳安全友善的 404 HTML 回應，不得拋出未處理例外。

#### Scenario: 請求合法文件路由回傳對應手冊
- **WHEN** 呼叫端以 GET 發送請求帶有 `page=docs%2Fuser-guide.html`
- **THEN** 後端正確渲染使用者操作手冊頁面，並設定對應標題與 XFrameOptionsMode

#### Scenario: 請求非白名單文件路由回傳安全 404
- **WHEN** 呼叫端以 GET 發送請求帶有 `page=../../etc/passwd` 或未登錄之路徑
- **THEN** 後端拒絕載入並回傳安全之 404 說明頁面
