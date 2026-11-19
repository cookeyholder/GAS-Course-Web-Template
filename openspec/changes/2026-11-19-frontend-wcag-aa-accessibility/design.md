## Context

前端目前以原生 JS 字串模板渲染，並在 `app.js:render()` 組出 `<header>`、`<nav>`、`<main>`；無障礙基礎已包含表單 `label for`、Modal 的 `role="dialog"`／焦點陷阱／Esc 關閉、上傳區鍵盤操作、Toast 的 `aria-live`／`role="alert"` 與 `scripts/checkContrast.js`。

盤點後剩餘的缺口：沒有 skip link；`<nav>` 沒有名稱且頁籤沒有 `aria-current`；首頁 `.feature-item` 為掛 `onclick` 的 `<div>`；表單沒有 `required`／`aria-required`／`aria-invalid`／`aria-describedby`；登入錯誤區塊與載入畫面沒有 live region；裝飾 emoji 會被唸出；Modal 背景未設 `inert`；沒有 `prefers-reduced-motion`；字級多為固定 `px`（瀏覽器縮放仍可用）；對比檢查只涵蓋淺色 `--ink-3` 與焦點環。

## Goals / Non-Goals

**Goals:**

- 讓所有主要畫面與關鍵狀態通過 WCAG 2.1 AA 的結構性要求，並以 axe-core 自動驗證。
- 讓鍵盤與螢幕閱讀器使用者能完成登入、概覽瀏覽、檔案上傳、課程查詢與權限設定流程。
- 建立與 `npm test` 連動的自動化閘門，防止新增畫面造成無障礙回退。
- 在既有原生 JS 與 GAS 雙棲架構內完成，不影響打包流程與部署產物。

**Non-Goals:**

- 不引入前端框架，不重構既有渲染與狀態機制。
- 不追求所有 CSS 字級改為 `rem`；瀏覽器縮放未被禁用，本次僅確保 skip link、減動態與對比。
- 不修改後端 API、RBAC 規則、1NF 正規化或資料模型。
- 不以 jsdom 模擬真實瀏覽器的色彩計算；`color-contrast` 由既有 CSS 解析腳本負責。

## Decisions

### 1. 以 jsdom 承載既有模板函式，再交給 axe-core 檢查

新增 `tests/helpers/a11yHarness.js`，以 jsdom 建立 `MEA` 與 `window`/`document`，呼叫既有 `createUiModule`、`createAppController` 等工廠產生各畫面字串，注入 `<div id="app">` 後執行 axe。好處是無需瀏覽器、可重用既有模板，且與專案既有的依賴注入測試風格一致。打包後的 `index.html` 仍由既有建置一致性檢查守護，不另做一套解析。

### 2. `color-contrast` 停用，改強化 CSS 對比檢查

jsdom 不配置 CSS 與字型，axe 的 `color-contrast` 會產生不可靠結果，因此明確停用並在輸出中標註原因。`scripts/checkContrast.js` 從「淺色 `--ink-3` + 焦點環」擴充為「淺色與深色主題的主要文字／背景／卡片／焦點環組合」，維持 4.5:1 與 3:1 門檻，並以單元測試驗證能偵測回退。

### 3. 稽核夾具涵蓋所有主要畫面與關鍵狀態

固定夾具清單：登入頁、登入錯誤、載入中、概覽、匯入、課程（含表格與分頁）、系統設定、權限不足、Modal 開啟。每則以 `data-theme="light"` 與 `data-theme="dark"` 各跑一次；結果為空陣列才算通過，失敗時印出規則編號、嚴重度與 selectors。

### 4. 單一入口同時服務測試與 CI

`scripts/checkA11y.js` 匯出 `collectFixtures`／`runAudit` 供 `tests/webappA11yAudit.test.js` 直接呼叫，命令列模式則回傳結束碼。`package.json` 新增 `check:a11y`，CI 在 WCAG 對比檢查後新增一步；`npm test` 亦包含同一稽核，避免開發者只跑測試而漏掉。

### 5. 語意修補採最小侵入

Skip link 放在 `#app` 前，目標 `<main id="main-content" tabindex="-1">`；首頁功能卡改為 `<button type="button">` 並沿用 `onclick`；必填欄位補 `required`／`aria-required`，提示與錯誤分別以 `aria-describedby`／`aria-invalid` 串接；裝飾 emoji 補 `aria-hidden="true"`；Modal 開啟時對背景容器設 `inert`，關閉時還原。所有新增 class 必須在 `styles.css` 定義，以通過既有 class 對齊檢查。

## Risks / Trade-offs

- jsdom 與真實瀏覽器的無障礙樹仍有差異；以真實瀏覽器手動驗證鍵盤 Tab 順序、螢幕閱讀器與 200% 縮放補足。
- 停用 `color-contrast` 代表 CSS 解析腳本必須涵蓋新的色彩組合，否則會出現防線空窗；此次同步擴充並加回退測試。
- 新增兩個開發相依會增加安裝體積，但不進入 GAS 執行環境與前端打包產物。
- 既有固定 `px` 字級仍不隨使用者預設字級調整；本次記錄為後續改善項目，不納入此變更驗收。
