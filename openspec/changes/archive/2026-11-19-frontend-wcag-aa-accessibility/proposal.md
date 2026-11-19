## Why

前端已具備地標、表單標籤、Modal 焦點陷阱、鍵盤上傳與基礎對比檢查，但距離完整的 WCAG 2.1 AA 仍有一段明顯落差：沒有「跳至主要內容」連結、導覽頁籤缺少目前位置語意、首頁功能卡片無法用鍵盤操作、表單沒有必填與欄位層級錯誤提示、登入錯誤與載入狀態缺少 live region、沒有尊重「減少動態效果」偏好，且深色模式文字對比未被檢查。

現有防線只驗證少數固定規則，沒有 DOM 層級的自動化稽核；日後新增畫面或元件時，無障礙退化不會被 CI 攔截。本次先定義完整的修補範圍與自動化閘門，再開始程式碼變更，避免邊改邊擴張範圍。

## What Changes

- 以 WCAG 2.1 AA 為驗收目標，新增 `axe-core` 與 `jsdom` 開發相依，建立可重複執行的前端無障礙稽核。
- 稽核涵蓋登入頁、登入錯誤、載入中、概覽、匯入、課程、系統設定、權限不足與 Modal 開啟等狀態，淺色與深色主題各執行一次；`color-contrast` 規則因 jsdom 不計算設定樣式而明確停用，改由強化後的 CSS 對比檢查腳本把關。
- 補足 skip link、主要地標名稱與頁籤 `aria-current`、首頁功能卡片鍵盤操作、裝飾性內容 `aria-hidden`、表單必填與欄位錯誤 ARIA、登入錯誤與載入狀態 live region、Modal 背景 `inert`，以及 `.skip-link` 與 `@media (prefers-reduced-motion: reduce)` 樣式。
- 新增 `npm run check:a11y`，讓稽核既可隨 `npm test` 執行，也可單獨執行；CI 增加明確的無障礙稽核步驟。
- 同步更新 `README.md`、`AGENTS.md` 與主規格，讓指令與需求保持一致。

## Capabilities

### Modified Capabilities

- `frontend-rendering-and-accessibility`：新增跳過連結與地標語意、可鍵盤操作功能卡片、表單必填與欄位錯誤提示、狀態 live region、減少動態效果、深色模式對比與自動化稽核要求。
- `developer-tooling-and-quality`：新增前端無障礙稽核指令與 CI 閘門要求。

## Impact

- **前端**：`webapp/index.html`、`webapp/js/ui.js`、`webapp/js/app.js`、`webapp/js/courses.js`、`webapp/js/accounts.js`、`webapp/js/imports.js`、`webapp/styles.css`。
- **工具鏈**：`scripts/checkA11y.js`、`scripts/checkContrast.js`、`tests/webappA11yAudit.test.js`、其他無障礙結構測試、`package.json`、`package-lock.json`、`.github/workflows/quality-gates.yml`。
- **文件**：`README.md`、`AGENTS.md`、`openspec/specs/` 主規格。
- **向後相容**：僅補充 ARIA 語意、樣式與檢查工具，不變更既有 action、API 合約、RBAC 角色或 1NF 正規化規則。
