# Proposal

## Why

KSVS-Course-Information-Collector 已新增藏青磚紅、青瓷薄荷與封面檸檬三款視覺風格，而本範本仍只提供 13 款；行政使用者無法在既有系統內直接切換到熟悉的米紙、藏青、青瓷與檸檬封面語彙。此外，風格是陸續加入的，舊風格未必跟上目前前端現況；盤點已證實 `happyhues2`／`happyhues3`／`happyhues5`／`happyhues9` 仍使用上一代變數集，且現有 `check:a11y` 夾具不套用 `data-style`、`checkContrast.js` 只驗 `--ink-3` 與焦點環、`checkUiClasses.js` 只做單向 class 比對，形成「檢查全綠但風格破版」的盲點。因此必須以目前程式碼為基準建立可驗證契約，而非僅移植色票。

## What Changes

- 於 `webapp/js/config.js` 的樣式清單末端新增 `navy-brick`「藏青磚紅 (Navy Brick)」、`celadon-mint`「青瓷薄荷 (Celadon Mint)」、`cover-lime`「封面檸檬 (Cover Lime)」三款，保留圖示、繁體名稱與配色來源描述；不改下拉渲染、`defaultStyle`（`modern-slate`）與風格儲存鍵。
- 於 `webapp/styles.css` 檔尾新增三款各自的淺色與深色**完整角色宣告**與小範圍元件複寫，重現 56px 頂列、寬螢幕 232px 深色帶、約 6px 強調帶與米紙內容區。規則限定 `html[data-style]`，契合本範本現有 `.app-header`、`.app-nav`／`.nav-tab`、`.panel-header`／`.panel-title`、`.brand-title`、`.btn.primary`、`.table-hover`，維持單列排列、`aria-current` 與事件委派、角色過濾結果與窄螢幕捲動。
- **修正來源與硬閘門的落差**：來源專案沒有 `check:contrast`，實測照抄會使 `navy-brick:light`（`--ink-3` 對背景 4.10:1、對卡片 4.32:1）與 `celadon-mint:light`（3.80:1／3.91:1）低於本範本 4.5:1 門檻；移植時將兩款淺色 `--ink-3` 分別調深為 `#5f6d7e`（5.02:1／5.28:1）與 `#52746a`（5.02:1／5.17:1），其餘角色沿用來源 commit `56d3a1a` 的定案值（含已由來源調整過的 `#f7ece8`）。
- 建立可驗證的「全部風格完整可用」契約：每一個 `config.styles[].id` 都必須有專屬的淺/深角色區塊，且核心角色在自身區塊明確宣告、不得以 `:root` 回退替代；由新增契約測試以遞迴 `var()` 解析（含循環偵測）驗證角色完整性，並以同一 WCAG 公式檢查主要按鈕、啟用/未啟用頁籤、焦點環、表格列懸停的對比；按鈕／頁籤／膠囊的 4.5:1 契約限於本次三款新風格與 D6 四款 Happy Hues，其餘九款既有風格的既有色對列為現況基準、不修改也不宣稱已達標。`--focus-ring` 依 `checkContrast.js` 既有模型由焦點覆寫區塊或 `:root` 提供，不要求核心角色區塊重複宣告。`scripts/checkContrast.js` 的判定邏輯與門檻不作變更。
- **既有風格的明確化**：`happyhues2`／`happyhues3`／`happyhues5`／`happyhues9` 少了 13 個共用角色。修補方式為在四款自己的淺/深區塊補上明確色值（不使用會形成兩層 `var()` 或循環參考的別名），必要時微調既有色值以符合對比門檻，但維持各款原有色相與視覺身分。另因四款已有特異性較高的 `.btn.primary`／`.nav-tab.active`／`.pill` 硬編碼規則，僅改角色值無法修復實際畫面，故新增明確的風格專屬元件規則（含 `happyhues3` 淺色 `#00214d` 配 `#3da9fc` 6.25:1，以及四款 `.pill.ok`／`.pill.err` 深淺色對）；調整清單與容許範圍寫入 `design.md` D6 與 `specs/visual-style-themes/spec.md` 的 MODIFIED requirement。
- 無障礙稽核：不修改 `scripts/checkA11y.js` 或 `tests/helpers/a11yHarness.js`；改於新增契約測試中共用單一 JSDOM、在 `app.render()` 後直接設定 `data-style`，以有限取樣畫面執行結構性 axe 稽核。明確記載 jsdom 不套用CSS 樣式，故色彩可讀性由靜態契約與人工瀏覽器核閱負責，不宣稱 axe 驗證了 CSS。
- 新增 `tests/visualStyleThemes.test.js` 集中放置色票、對比矩陣、按鈕文字色、持久化、未知 id 回退、全部風格角色與功能操作契約；使用真實 `buildFrontendConfig()` 而非 `tests/helpers/importsUiDeps.js` 的精簡 stub。既有 `tests/webappConfig.test.js` 的 13 款斷言改為 16，並補上中繼資料與順序斷言。
- 重新產生 `scripts/openccS2twpContractLiterals.json` 並以 `--check` 驗證；所有中文契約字面值須人工依上下文審核，不以 `--fix` 自動寫入。
- 更新 `README.md`（7、38、381 行）為 16 款並列舉三款，於 `AGENTS.md:84` 的風格清單補上說明；凡触及 `webapp/` 的任務皆同時執行 `npm run build:webapp`，並將更新後的 `index.html` 納入同一個原子提交，以滿足 CI 的 `git diff --exit-code -- index.html`。
- 既有 13 款的識別碼、順序、預設風格、儲存鍵、主題切換、RBAC 頁籤守門與後端 API 維持不變；四款 Happy Hues 的色值調整僅限於 MODIFIED requirement 明列的範圍。

## Capabilities

### New Capabilities

- `visual-style-themes`: 可選視覺風格的清單、套用與持久化、三款新風格的深淺角色與版型契約，以及所有風格在現行前端功能下皆完整可用之驗證要求。

### Modified Capabilities

- `frontend-rendering-and-accessibility`: 補充「樣式作用域內的渲染與稽核契約」，明確每款風格的專屬角色區塊、結構性稽核的套用方式，以及色彩驗證與 jsdom 稽核的責任分界。

## Impact

- 前端：`webapp/js/config.js`、`webapp/styles.css`；`webapp/js/ui.js` 的 `applyStyle()`／`initThemeAndStyle()`／`toggleTheme()` 與 `<option>` 渲染沿用現況，不新增函式。
- 測試：新增 `tests/visualStyleThemes.test.js`；調整 `tests/webappConfig.test.js`；`tests/webappUiToggleTheme.test.js` 已驗證未知 id 回退 `modern-slate`，無須變更；不修改 `scripts/checkContrast.js`、`scripts/checkA11y.js`、`tests/helpers/a11yHarness.js`。新增測試完成後才重新產生 `scripts/openccS2twpContractLiterals.json`。
- 文件與產物：`README.md`、`AGENTS.md`、根目錄 `index.html`（由 `npm run build:webapp` 產生，隨每次 `webapp/` 變更提交）。
- 品質閘門：`check:lang`、`check:ui-classes`、`check:contrast`、`check:a11y`、`npm test`、覆蓋率與複雜度、建置一致性、OpenCC 清冊漂移；不以 `check:a11y` 取代 CSS 對比驗證，也不因 `check:ui-classes` 綠燈宣稱新選擇器正確。
