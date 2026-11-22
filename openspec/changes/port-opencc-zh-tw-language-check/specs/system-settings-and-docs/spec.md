# Spec Delta

## Purpose

本 delta 調整 Web App 文件部署放行規則，使 `.claspignore` 只放行離線手冊 HTML，避免 OpenCC 移植新增的 Markdown 參考文件與核閱結論被上傳至 GAS。

## MODIFIED Requirements

### Requirement: 後端 Web App 文件白名單路由與部署放行支援

專案根目錄 `.claspignore` MUST 放行 `docs/` 與 `docs/**/*.html`（加入 `!docs/`、`!docs/**/*.html`），以 `!docs/**/*.html` 取代舊有 `!docs/**`，確保 7 個 `WEB_APP_DOC_ROUTES` 白名單 HTML 可部署而不推送新增 Markdown。後端 `webApi.js` 的 `doGet(e)` MUST 支援 `?page=docs/...` 路由與白名單對照表，僅接受完全相符路由並相容 clasp 壓平候選，禁止跳出 `docs/`；命中時以 `HtmlService` 建立含標題、Viewport、XFrameOptionsMode 的回應，未命中或非白名單回傳安全 404，不得拋出未處理例外。

#### Scenario: 請求合法文件路由回傳對應手冊
- **WHEN** 呼叫端以 GET 發送請求帶有 `page=docs%2Fuser-guide.html`
- **THEN** 後端正確渲染使用者操作手冊頁面，並設定對應標題與 XFrameOptionsMode

#### Scenario: 請求非白名單文件路由回傳安全 404
- **WHEN** 呼叫端以 GET 發送請求帶有 `page=../../etc/passwd` 或未登錄之路徑
- **THEN** 後端拒絕載入並回傳安全之 404 說明頁面

#### Scenario: 部署放行只包含白名單 HTML
- **WHEN** 檢查 `.claspignore` 對 `docs/` 的放行規則
- **THEN** 規則為 `!docs/` 與 `!docs/**/*.html`，7 個 `WEB_APP_DOC_ROUTES` HTML 在上傳集合，`docs/參考資料/**/*.md`、`docs/opencc-s2twp-review.md` 與既有 `docs/quality-baseline-2026-11-20.md` 不在上傳集合

#### Scenario: 白名單路由清單與路徑扁平化
- **WHEN** 查閱 `WEB_APP_DOC_ROUTES` 定義
- **THEN** 至少包含 `docs/architecture-guide.html`、`docs/clasp-guide.html`、`docs/course-normalization-guide.html`、`docs/gis-login-guide.html`、`docs/index.html`、`docs/rbac-guide.html`、`docs/user-guide.html`，並相容 `docs/file` 與 `docs-file` 壓平候選，嚴禁跳出 `docs/` 範圍

#### Scenario: 命中白名單建立安全回應
- **WHEN** 請求命中白名單
- **THEN** 透過 `HtmlService.createHtmlOutputFromFile`（或本地測試替身）建立回應，設定頁面標題、Viewport 與預設 XFrameOptionsMode
