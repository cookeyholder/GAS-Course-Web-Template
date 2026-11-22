## ADDED Requirements

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
