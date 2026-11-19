## 1. 稽核工具與相依

- [x] 1.1 新增 `axe-core`、`jsdom` 開發相依並更新 `package-lock.json`，確認不影響 GAS 與前端打包。
- [x] 1.2 建立 `tests/helpers/a11yHarness.js`：以 jsdom 建立 MEA 與各模板工廠，組出登入、載入、概覽、匯入、課程、設定、權限不足與 Modal 等夾具，支援淺色／深色主題。
- [x] 1.3 建立 `scripts/checkA11y.js`：彙整 `collectFixtures`／`runAudit`，明確停用 `color-contrast` 並記錄原因，失敗時輸出規則、嚴重度與節點；`package.json` 新增 `check:a11y`。

## 2. 前端語意與鍵盤操作

- [x] 2.1 `webapp/index.html` 加 skip link；`app.js` 的 `<main>` 補 `id="main-content"` 與 `tabindex="-1"`，並讓 skip link 聚焦後可見。
- [x] 2.2 `ui.js`：`<nav>` 補 `aria-label`，目前頁籤補 `aria-current="page"`，首頁功能卡片改為可鍵盤操作的 `<button type="button">`。
- [x] 2.3 `ui.js`：裝飾 emoji 與 Toast 圖示補 `aria-hidden="true"`；登入錯誤補 `role="alert"`，載入畫面補 `role="status"`／`aria-busy`。
- [x] 2.4 `ui.js`：Modal 開啟時對背景容器設 `inert`，關閉時還原可操作性與原焦點。
- [x] 2.5 `courses.js`／`accounts.js`／`imports.js`：必填欄位補 `required`／`aria-required`，提示以 `aria-describedby` 關聯，錯誤以 `aria-invalid` 標記；匯入預覽 `<th>` 補 `scope="col"`。

## 3. 樣式與對比

- [x] 3.1 `styles.css` 新增 `.skip-link` 與 `@media (prefers-reduced-motion: reduce)`，關閉 Toast、spinner 與 transition 動畫。
- [x] 3.2 檢查並修補沒有替代提示的 `outline: none`，維持 `:focus-visible` 可見性。
- [x] 3.3 擴充 `scripts/checkContrast.js` 涵蓋深色主題文字與主要前景／背景組合，維持既有淺色與焦點環門檻。

## 4. 測試與 CI

- [x] 4.1 新增 `tests/webappA11yAudit.test.js`，驗證所有夾具在淺色／深色主題下皆無 axe 違規。
- [x] 4.2 新增結構測試：skip link、地標名稱、`aria-current`、功能卡片鍵盤操作、表單 ARIA、live region、`inert` 與 reduced motion 規則。
- [x] 4.3 更新 `tests/contrastAndToastA11y.test.js`，驗證深色對比檢查與回退偵測。
- [x] 4.4 `.github/workflows/quality-gates.yml` 在 WCAG 對比檢查後新增無障礙稽核步驟。

## 5. 文件與完整驗證

- [ ] 5.1 同步 `README.md`、`AGENTS.md` 的無障礙指令與檢查說明。
- [ ] 5.2 執行 `npm test`、`npm run check:a11y`、`npm run format:check`、`npm run check:lang`、`npm run check:ui-classes`、`npm run check:contrast`、`npm run test:coverage`、`npm run check:coverage`、`npm run check:changed-coverage`、`npm run check:complexity`、`npm run build:webapp`，並以 `index.html?mock=true` 驗證渲染。
