# Design

## Context

動機見 `proposal.md`，行為契約見 `specs/visual-style-themes/spec.md` 與 `specs/frontend-rendering-and-accessibility/spec.md`。本設計只說明在目前程式碼現況上的落地方式：

- `webapp/js/config.js` 的 `styles[]` 同時是下拉選單資料與 `applyStyle()` 的有效值白名單；`webapp/js/ui.js` 負責寫入 `gas_tmpl.style.v1` 與設定 `<html data-style>`，未知 id 回退至本範本預設 `modern-slate`（來源專案為 `nes`，移植時必須改寫）。`renderHeader()`／`renderLoginView()` 只渲染圖示與名稱，`desc` 未被顯示，故不修改 `ui.js`。
- 目標前端實際產生的元件為 `.app-header`、`.app-nav`／`.nav-tab`、`.panel-header`／`.panel-title`、`.brand-title`、`.btn.primary`、`.table-hover`；`.stage-*`／`.matrix-filter-pill`／`.panel-head` 等舊選擇器在目前 `webapp/js` 中沒有對應 DOM，新規則不為其撰寫，`checkUiClasses.js` 的單向檢查也不視為新選擇器正確性的證明。
- 共用規則：`.btn.primary` 寫死白字；`.table-hover tbody tr:hover td` 使用 `var(--accent-bg) !important`；`:focus-visible` 使用 `var(--focus-ring)` 與 2px 寬度、2px `outline-offset`，且 `nes`／`happyhues14`／`happyhues10`／`happyhues12` 另有改為 `var(--ink)` 的全域覆寫。
- `scripts/checkContrast.js` 以「自身定義或 `:root` 回退」解析角色，只把含 `--ink-3` 的區塊視為主題，`resolveColor()` 僅支援一層 `var()`；`scripts/checkA11y.js` 停用 `color-contrast`，而 `tests/helpers/a11yHarness.js` 讀取的是 `webapp/index.html` 且移除 `<link>`，jsdom 不計算計算樣式。
- 品質基準線 `scripts/quality-baseline.json` 不需更新：本次不新增納管函式，僅在 `config.js` 增加資料；`tests/**` 被 c8 與變更覆蓋率排除。

## Goals / Non-Goals

**Goals:**

- 三款新風格有一致的角色語意，深淺主題皆通過可讀性與操作驗證。
- 建立可重複執行的「全部風格」驗證，讓新增或切換任一風格時都能發現角色缺失、對比不足或功能中斷。
- 在最小變更前提下修正盤點發現的舊風格落差。

**Non-Goals:**

- 不變動既有 13 款的識別碼、順序、預設 `modern-slate`、儲存鍵、主題切換邏輯、RBAC 守門、事件委派與後端 API。四款 Happy Hues 的色值調整僅限 D6 的 Adjusted Roles 附表。
- 不修改 `webapp/js/ui.js`、`scripts/checkContrast.js`、`scripts/checkA11y.js`、`tests/helpers/a11yHarness.js`、`tests/webappUiToggleTheme.test.js`。
- 不引入外部字型、圖片或新的 CSS 框架；不做逐像素仿製。
- 不改既有 `@media (prefers-reduced-motion: reduce)` 與全域無障礙樣式。

## Decisions

### D1：以色彩角色為主、元件複寫為輔，並映射本範本現況

每款新增兩組 `html[data-style="…"]`（淺色）與 `html[data-style="…"][data-theme="dark"]`（深色）區塊，沿用既有角色名稱。另外定義 `--style-nav-bg`、`--style-nav-ink`、`--style-band-accent` 三個局部變數（三款皆有），`--cover-lime` 僅 `cover-lime` 使用。

替代方案：全面複寫共用元件或改為固定柵格。前者會放大特異性衝突，後者會破壞角色過濾後的單列頁籤與既有事件委派，故不採。新規則集中於 `styles.css` 尾端（既有最後一個 `@media (prefers-reduced-motion: reduce)` 之後）並限定 `html[data-style]`，不使用 `!important`；僅針對目前 DOM 存在的元件撰寫規則。

### D2：完整角色表與對比差異

以下為來源 commit `56d3a1a` 的定案值（來源 design D2 已把初次取樣的 `#f0e2dc` 調整為 `#f7ece8`，本提案承接定案值）。**唯一差異**是兩款淺色 `--ink-3`：來源 `#6d7b8c`／`#64887e` 改為 `#5f6d7e`／`#52746a`，其餘完全沿用。

| 角色 | navy 淺 | navy 深 | celadon 淺 | celadon 深 | cover 淺 | cover 深 |
| ---- | ------- | ------- | ---------- | ---------- | -------- | -------- |
| `--bg` | `#fbf9f3` | `#101b28` | `#fbfcfa` | `#101b18` | `#f1efe4` | `#14140f` |
| `--paper` | `#ffffff` | `#18283a` | `#ffffff` | `#182923` | `#fffdf7` | `#1e1e17` |
| `--ink` | `#1b2f47` | `#eef3f9` | `#17453f` | `#edf5f0` | `#111111` | `#f3efe4` |
| `--ink-2` | `#4a5a6d` | `#bccadc` | `#3f6a61` | `#b8ccc2` | `#3d3d36` | `#d6d1c1` |
| `--ink-3` | `#5f6d7e` | `#94a7bd` | `#52746a` | `#91a99d` | `#63635a` | `#a9a494` |
| `--line` | `#1b2f47` | `#3c5066` | `#17453f` | `#3a574e` | `#111111` | `#484636` |
| `--line-2` | `#d9d1bd` | `#26384c` | `#c8d6cd` | `#253c35` | `#cfcbbd` | `#2e2e24` |
| `--fill` | `#f5f1e7` | `#1c2c3e` | `#f2f7f4` | `#1b2e28` | `#f9ebda` | `#1d1d16` |
| `--fill-2` | `#e9e3d5` | `#24374c` | `#d8e6de` | `#22382f` | `#f6ead4` | `#26261d` |
| `--accent` | `#b8402d` | `#ef8a72` | `#17453f` | `#86d8bf` | `#111111` | `#c7f03b` |
| `--accent-bg` | `#f7ece8` | `#43251f` | `#d8e6de` | `#1b3c33` | `#c7f03b` | `#2b3812` |
| `--ok` | `#2e6b4f` | `#6fd6a6` | `#2e6b4f` | `#6fd6a6` | `#2f6b3f` | `#a3e635` |
| `--ok-bg` | `#e4f0e8` | `#173a2c` | `#e3f1e8` | `#173a2c` | `#e4f0d5` | `#1f3310` |
| `--err` | `#b3261e` | `#ff9a94` | `#b3261e` | `#ff9a94` | `#b3261e` | `#ff8f8f` |
| `--err-bg` | `#f9e4e2` | `#451d22` | `#f9e4e2` | `#451d22` | `#f9e4e2` | `#401c1c` |
| `--warn` | `#8a5a12` | `#f6c277` | `#8a5a12` | `#f6c277` | `#8a5a12` | `#ffc46b` |
| `--warn-bg` | `#f8ecda` | `#3b2a13` | `#f8ecda` | `#3b2a13` | `#f8ecda` | `#3c2a12` |
| `--radius` | `2px` | `2px` | `4px` | `4px` | `0px` | `0px` |
| `--danger` | `var(--err)` | `var(--err)` | `var(--err)` | `var(--err)` | `var(--err)` | `var(--err)` |
| `--shadow` | `none` | `none` | `none` | `none` | `none` | `none` |
| `--head-font` | `var(--sans)` | `var(--sans)` | `var(--sans)` | `var(--sans)` | `var(--sans)` | `var(--sans)` |
| `--bg-pattern` | `none` | `none` | `none` | `none` | `none` | `none` |
| `--bg-size` | `auto` | `auto` | `auto` | `auto` | `auto` | `auto` |
| `--style-nav-bg` | `#1b2f47` | `#0b1420` | `#17453f` | `#0b1613` | `#111111` | `#000000` |
| `--style-nav-ink` | `#fbf9f3` | `#eef3f9` | `#fbfcfa` | `#edf5f0` | `#f1efe4` | `#f3efe4` |
| `--style-band-accent` | `#b8402d` | `#ef8a72` | `#c8d6cd` | `#86d8bf` | `#c7f03b` | `#c7f03b` |
| `--cover-lime` | — | — | — | — | `#c7f03b` | `#c7f03b` |

`--focus-ring` 不在新風格的核心角色區塊宣告，避免與 `checkContrast.js` 的主題辨識（以是否含 `--ink-3` 判定）衝突。該解析器把不含核心角色的獨立 `--focus-ring` 區塊視為 `focusOverrides`，並依序回退至 `:root` 與 `var(--accent)`；現況 26 個主題中僅 `blueprint:light` 因 selector 為 `:root, html[data-style="blueprint"]` 而在自身區塊被解析到，`nes`／`happyhues14`／`happyhues10`／`happyhues12` 則使用 `styles.css:1891-1896` 的獨立覆寫區塊。契約測試 MUST 沿用此模型，不得要求每個核心角色區塊都重複宣告 `--focus-ring`，亦不得因 selector 含 `:root` 而誤殺 `blueprint`。新風格在 `.app-nav` 內另以 `--style-nav-ink` 覆寫 outline-color。

實測差異（以本範本 `computeContrast()`）：

| 主題 | 原值 | 對背景／卡片 | 新值 | 對背景／卡片 |
| ---- | ---- | ------------ | ---- | ------------ |
| `navy-brick:light --ink-3` | `#6d7b8c` | 4.10／4.32 | `#5f6d7e` | 5.02／5.28 |
| `celadon-mint:light --ink-3` | `#64887e` | 3.80／3.91 | `#52746a` | 5.02／5.17 |

只有調深次要文字能同時保留米紙／瓷白背景與藏青／松綠主色；調背景會大面積改變風格身分，放寬門檻則違反硬閘門。

### D3：按鈕、頁籤與焦點環採最小覆寫

- `cover-lime` 深淺主題的 `.btn.primary` 皆改為檸檬底墨黑字，避免白字配檸檬約 1.32:1。
- `navy-brick`／`celadon-mint` 深色 `.btn.primary` 改為深底淺字（背景 `var(--accent-bg)`、文字 `var(--ink)`）。
- 未啟用頁籤用 `.nav-tab:not(.active):not(:hover)` 限定範圍，避免覆蓋既有狀態色；字級規則不設 `color`／`background`。
- 焦點環以 `outline-color` 覆寫：`.app-nav :focus-visible` 用 `var(--style-nav-ink)`；`cover-lime` 檸檬底按鈕的焦點環在 2px `outline-offset` 下落於深色紙面，故深色用 `#c7f03b` 仍可見；深色 `.nav-tab.active` 背景為 `#2b3812`（非檸檬），檸檬焦點環同樣可見。「外側相鄰背景」明確定義為 outline 落點的背景，契約測試據此取色。來源對 `.nav-tab.active:focus-visible` 深淺皆寫死 `#111111`，但深色落在 `#2b3812` 僅 1.51:1，故本範本另加深色規則改用 `#c7f03b`（10.90:1）；此為 D3 明示的最小覆寫，不改變既有 `--focus-ring` 模型。
- 不為已無對應 DOM 的 `.stage-*`／`.matrix-*`／`.teacher-roster-table` 新增規則；`.panel-head` 僅保留為既有別名。不移植來源的 `prefers-contrast` 外圈，也不新增第五處 `outline: none`。

### D4：全風格可用性採「靜態契約＋結構稽核＋動態操作＋瀏覽器核閱」四層驗證

1. **靜態契約**：新增 `tests/visualStyleThemes.test.js`，以遞迴 `var()` 解析（含循環偵測）取得每款每主題的角色，並以表驅動方式分別處理兩類來源：① 三款新風格與共用 `.table-hover`／`.app-nav` 規則，直接解析角色值；② 既有風格的按鈕／頁籤／膠囊存在款式專屬硬編碼宣告（例如 `happyhues3 .btn.primary`、`nes .btn.primary`），須由測試中的「風格 id＋選擇器→前景／背景色對」對照表取得實際值，不得純靠角色解析推斷。按鈕／頁籤／膠囊的 4.5:1 契約僅套用 D6 四款與三款新風格；其餘九款既有風格僅驗證角色完整、無回退與 `checkContrast.js` 不變。`scripts/checkContrast.js` 不改。
2. **結構稽核**：共用單一 JSDOM window（axe-core 會快取首次執行的 window），呼叫 `a11yHarness.resetDocument()` 與 `app.render()` **之後**才設定 `document.documentElement.dataset.style`，並設定 `global.window`／`global.document`，沿用 `checkA11y.RUN_OPTIONS`。取樣為三款新風格 × overview／courses／settings／activity-log × 深淺，另加四款舊風格各一個畫面；管理員角色會渲染 5 個頁籤。harness 的 `createDocumentHtml()` 回傳字串且移除 `<link>`，故僅驗證 DOM 結構與語意，不宣稱 jsdom 驗證了 CSS 色彩；測試檔案須加註「僅結構稽核」。不修改 `scripts/checkA11y.js` 或 harness。
3. **動態操作**：直接呼叫 `ui.applyStyle()`、`ui.initThemeAndStyle()`、`ui.toggleTheme()` 與未知 id 回退，**不呼叫 `app.init()`**（其會由 localStorage 覆寫 `data-style`）；以一般使用者與管理員兩種角色各渲染一次，明確斷言一般 4 個、管理員 5 個頁籤且 `adminOnly` 守門生效，並確認控制項存在且可聚焦；使用真實 `buildFrontendConfig()`，不使用 `tests/helpers/importsUiDeps.js` 的精簡 stub。
4. **瀏覽器核閱**：以 `webapp/index.html?mock=true`（根目錄 `index.html?mock=true` 因 `MEA_PRODUCTION_BUILD` 會忽略 mock，不可使用）在 1440×900 與 375×812 逐一操作全部 16 款風格與深淺主題，共 64 組、每組 23 項檢查（5 個頁籤、匯入預覽、課程搜尋與分頁、設定表單、授權角色篩選、操作日誌篩選與明細展開、焦點環、操作前後水平溢出、操作期間主控台錯誤），截圖留存於 `/tmp/opencode/style-review/`，並以固定欄位檢查表（風格／主題／視窗／操作／結果／截圖路徑）記錄於 `check-report.md`。原始 `webapp/index.html` 的 GAS 樣板標記在載入時必產生一則既有解析錯誤，與風格變更無關，故於操作前清除，僅要求操作期間無新增錯誤。375px 核閱發現既有共用規則 `.filter-form > *`（`@media (max-width: 768px)`）特異性高於 `.sr-only`，使篩選表單的螢幕閱讀器專用標籤被撐成全寬並造成 25px 水平溢出；最小修正為排除該類（`.filter-form > :not(.sr-only)`），不改變表單可見控制項的全寬行為，修正後 64 組皆無水平溢出。此屬 D3／D4／D8 的可見性與設定邊界，不移植來源的額外媒體查詢。

### D5：測試、文件、產物與提交順序

- 調整 `tests/webappConfig.test.js` 的 13 款斷言為 16，新增中繼資料、順序、預設值與儲存鍵斷言；`tests/webappUiToggleTheme.test.js` 已符合未知 id 回退，標明不變。
- 按鈕文字色與焦點環斷言放在加入對應 CSS 的 task 3.x，不放進 task 2.4，確保每個 task 的驗證標的與產出一致。
- 所有中文契約字面值完成後才執行 `node scripts/generateOpenccS2twpContractLiterals.js`，並在完整 CI 指令鏈加入 `--check`；建議須人工核准，不以 `--fix` 自動寫入。本次新增 62 筆契約字面值（測試訊息與風格描述）已逐項人工核對，皆為臺灣繁體中文且無中國用語，另移除 1 筆過期字面值；逐筆結果紀錄於 `opencc-literal-signoff.md`。`--check` 顯示無漂移，OpenCC 候選報告與 `origin/main` 相比未新增候選，核准清冊維持空白，從未使用 `--fix`。
- 更新 `README.md`（7、38、381 行）與 `AGENTS.md:84`；凡觸及 `webapp/` 的 task 皆執行 `npm run build:webapp`，並把 `index.html` 納入同一原子提交。
- 工作流順序：task 0 先提交提案 → 逐 task 驗證並提交 → task 5.3 封存並提交 → task 5.4 本地完整 CI → PR。

### D6：舊風格角色斷層以明確值修補

盤點證實 `happyhues2`／`happyhues3`／`happyhues5`／`happyhues9` 仍使用上一代變數集（`--line-subtle`、`--primary`、`--primary-ink`、`--radius-panel`、`--radius-btn`、`--shadow-panel`、`--shadow-btn`、`--danger`），缺少 `--line-2`、`--fill`、`--fill-2`、`--accent-bg`、`--ok-bg`、`--err`、`--err-bg`、`--warn-bg`、`--shadow`、`--grid`、`--radius`、`--sans`、`--mono` 共 13 個角色；`--focus-ring` 依 D2 所述由既有覆寫區塊或 `:root` 提供，不列入必須補宣告的角色。其中 `--grid`、`--shadow`、`--sans`、`--mono`、`--radius` 僅為盤點記錄，已由 `:root` 正確提供，**不是本次修補目標**，不得在四款中重複宣告以免改變既有解析值。

不使用 `--sans: var(--body-font)`：四款本身已有 `--body-font: var(--sans)`，形成循環參考；`--sans`／`--mono` 已由 `:root` 正確提供。不使用兩層 `var()` 別名（例如 `--err-bg: var(--accent-bg)` 且 `--accent-bg: var(--primary)`），因為 `checkContrast.js` 只解析一層，會讓失敗被靜默略過。

**Adjusted Roles 附表**（僅下列角色與規則允許在四款中調整色值，其餘角色值必須與修補前解析結果一致）：

| 角色／規則 | 允許調整範圍 | 約束 |
| ---- | ------------ | ---- |
| `--line-2`、`--fill`、`--fill-2` | 可改為同色相的明示色值 | 邊線與填色不得使用螢光薄荷等與原風格不符的色相 |
| `--accent-bg`、`--ok-bg`、`--err-bg`、`--warn-bg` | 可改為同色相的深／淺底色 | 前景對底色 ≥4.5:1；不得與前景同色；深淺可給不同值 |
| `--err`、`--ok`、`--warn` | 可微調明度 | 維持原有警示語意與色相；深淺可給不同值 |
| `--focus-ring` | 可改為 `--ink` 或明示對比值 ≥3:1 的色值 | 必須是單一色值或一層 `var()`，不得循環 |
| `.btn.primary`、`.nav-tab.active` 風格專屬規則 | 可改前景／背景為下表明示色對 | 特異性須高於既有風格規則；深淺分別給值；≥4.5:1 |
| `.pill.ok`、`.pill.err` 風格專屬規則 | 可改前景／背景為下表明示色對 | 特異性須高於既有 `.pill` 規則（0,2,1）；深淺分別給值；≥4.5:1；成功與失敗可區辨 |

禁止變更：`--bg`、`--paper`、`--ink`、`--accent`、`--radius`、`--sans`、`--mono`、`--body-font`。`--radius` 若由 `--radius-panel` 代入會把全域 2px 改為 14px，故直接沿用既有 `--radius`。

**風格專屬硬編碼規則色對**（實測值以本範本 `computeContrast()`）：

| 風格／規則 | 主題 | 前景 | 背景 | 對比 |
| ---- | ---- | ---- | ---- | ---- |
| `happyhues3` `.btn.primary`／`.nav-tab.active` | 淺 | `#00214d` | `#3da9fc` | 6.25:1 |
| `happyhues3` `.btn.primary`／`.nav-tab.active` | 深 | `#fffffe` | `#1e3b5f` | 11.37:1 |
| `happyhues2` `.pill.ok` | 淺 | `#00214d` | `#00ebc7` | 10.35:1 |
| `happyhues2` `.pill.ok` | 深 | `#00ebc7` | `#082142` | 10.49:1 |
| `happyhues3` `.pill.ok` | 淺 | `#166534` | `#e3f3ea` | 6.20:1 |
| `happyhues3` `.pill.ok` | 深 | `#86efac` | `#164e63` | 6.49:1 |
| `happyhues5` `.pill.ok` | 淺 | `#00473e` | `#e3f3ea` | 9.27:1 |
| `happyhues5` `.pill.ok` | 深 | `#86efac` | `#00473e` | 7.59:1 |
| `happyhues9` `.pill.ok` | 淺 | `#166534` | `#e3f3ea` | 6.20:1 |
| `happyhues9` `.pill.ok` | 深 | `#86efac` | `#2a2a2a` | 10.22:1 |
| 四款 `.pill.err`（各款深淺同色對） | 淺 | `#b91c1c` | `#fee2e2` | 5.30:1 |
| 四款 `.pill.err`（各款深淺同色對） | 深 | `#fca5a5` | `#450a0a` | 8.51:1 |

`happyhues3` 深色 `.btn.primary` 現況只改 `border-color`、背景仍是 `#3da9fc`，故須連同背景改為 `#1e3b5f`。四款 `.pill` 規則特異性 (0,2,1) 高於共用 `.pill.ok`／`.pill.err` (0,2,0) 且以 `border` shorthand 覆寫框線色，因此調整 `--ok-bg`／`--err-bg` 角色值不會改善實際畫面，必須新增明確的元件規則。`.matrix-filter-pill` 在目前前端沒有對應 DOM，不新增其規則；既有死規則不刪除以免超出本變更範圍。

修補後由「全部風格」契約測試逐款逐主題驗證上表所列全部色對，並在 `design.md` 本節記錄修補前後解析值（欄位：風格／角色／原解析值／新解析值／驗證結果）。原解析值中，缺失的角色由共用 `:root`（淺）或 `html[data-theme="dark"]`（深）帶入，`--ok`／`--warn` 則原已宣告在各風格自身區塊；成對前景對底色皆 ≥4.5:1，`--grid`／`--shadow`／`--sans`／`--mono`／`--radius` 未在四款重複宣告。

| 風格 | 角色 | 原解析值（淺／深） | 新解析值（淺／深） | 驗證結果 |
| ---- | ---- | ---- | ---- | ---- |
| happyhues2 | `--line-2` | `#d6dae1`／`#23385a` | `#c8d2df`／`#1b2d45` | 通過 |
| happyhues2 | `--fill` | `#f3f5f8`／`#12253f` | `#eef2f7`／`#0d2544` | 通過 |
| happyhues2 | `--fill-2` | `#e9edf3`／`#172e4d` | `#e2e9f1`／`#001534` | 通過 |
| happyhues2 | `--accent-bg` | `#e4ecf8`／`#12253f` | `#4a1020`／`#4a1020` | 通過 |
| happyhues2 | `--ok` | `#00ebc7`／`#00ebc7` | `#00ebc7`／`#00ebc7` | 通過 |
| happyhues2 | `--ok-bg` | `#e3f3ea`／`#0e2f24` | `#004d40`／`#082142` | 通過 |
| happyhues2 | `--err` | `#c62828`／`#ff7b7b` | `#b91c1c`／`#fca5a5` | 通過 |
| happyhues2 | `--err-bg` | `#fbe7e7`／`#35141a` | `#fee2e2`／`#450a0a` | 通過 |
| happyhues2 | `--warn` | `#fde24f`／`#fde24f` | `#96570a`／`#fbbf24` | 通過 |
| happyhues2 | `--warn-bg` | `#fbf0dd`／`#33240e` | `#fff1e0`／`#3b2a13` | 通過 |
| happyhues3 | `--line-2` | `#d6dae1`／`#23385a` | `#90b4ce`／`#1e3b5f` | 通過 |
| happyhues3 | `--fill` | `#f3f5f8`／`#12253f` | `#e8f2fb`／`#162b47` | 通過 |
| happyhues3 | `--fill-2` | `#e9edf3`／`#172e4d` | `#d8eefe`／`#0b1a2d` | 通過 |
| happyhues3 | `--accent-bg` | `#e4ecf8`／`#12253f` | `#2a0810`／`#2a0810` | 通過 |
| happyhues3 | `--ok` | `#2cb67d`／`#2cb67d` | `#166534`／`#86efac` | 通過 |
| happyhues3 | `--ok-bg` | `#e3f3ea`／`#0e2f24` | `#e3f3ea`／`#164e63` | 通過 |
| happyhues3 | `--err` | `#c62828`／`#ff7b7b` | `#b91c1c`／`#fca5a5` | 通過 |
| happyhues3 | `--err-bg` | `#fbe7e7`／`#35141a` | `#fee2e2`／`#450a0a` | 通過 |
| happyhues3 | `--warn` | `#ff8e3c`／`#ff8e3c` | `#96570a`／`#fbbf24` | 通過 |
| happyhues3 | `--warn-bg` | `#fbf0dd`／`#33240e` | `#fff1e0`／`#3b2a13` | 通過 |
| happyhues5 | `--line-2` | `#d6dae1`／`#23385a` | `#b7d5cd`／`#0f4d44` | 通過 |
| happyhues5 | `--fill` | `#f3f5f8`／`#12253f` | `#e8f4f0`／`#0a3a34` | 通過 |
| happyhues5 | `--fill-2` | `#e9edf3`／`#172e4d` | `#d9ebe5`／`#00473e` | 通過 |
| happyhues5 | `--accent-bg` | `#e4ecf8`／`#12253f` | `#2a0a06`／`#2a0a06` | 通過 |
| happyhues5 | `--ok` | `#2cb67d`／`#2cb67d` | `#00473e`／`#86efac` | 通過 |
| happyhues5 | `--ok-bg` | `#e3f3ea`／`#0e2f24` | `#e3f3ea`／`#00473e` | 通過 |
| happyhues5 | `--err` | `#c62828`／`#ff7b7b` | `#b91c1c`／`#fca5a5` | 通過 |
| happyhues5 | `--err-bg` | `#fbe7e7`／`#35141a` | `#fee2e2`／`#450a0a` | 通過 |
| happyhues5 | `--warn` | `#faae2b`／`#faae2b` | `#96570a`／`#fbbf24` | 通過 |
| happyhues5 | `--warn-bg` | `#fbf0dd`／`#33240e` | `#fff1e0`／`#3b2a13` | 通過 |
| happyhues9 | `--line-2` | `#d6dae1`／`#23385a` | `#d0d2d8`／`#333333` | 通過 |
| happyhues9 | `--fill` | `#f3f5f8`／`#12253f` | `#f5f5f7`／`#202020` | 通過 |
| happyhues9 | `--fill-2` | `#e9edf3`／`#172e4d` | `#eff0f3`／`#0d0d0d` | 通過 |
| happyhues9 | `--accent-bg` | `#e4ecf8`／`#12253f` | `#0a0004`／`#0a0004` | 通過 |
| happyhues9 | `--ok` | `#2cb67d`／`#2cb67d` | `#166534`／`#86efac` | 通過 |
| happyhues9 | `--ok-bg` | `#e3f3ea`／`#0e2f24` | `#e3f3ea`／`#2a2a2a` | 通過 |
| happyhues9 | `--err` | `#c62828`／`#ff7b7b` | `#b91c1c`／`#fca5a5` | 通過 |
| happyhues9 | `--err-bg` | `#fbe7e7`／`#35141a` | `#fee2e2`／`#450a0a` | 通過 |
| happyhues9 | `--warn` | `#ff8e3c`／`#ff8e3c` | `#96570a`／`#fbbf24` | 通過 |
| happyhues9 | `--warn-bg` | `#fbf0dd`／`#33240e` | `#fff1e0`／`#3b2a13` | 通過 |

### D7：高對比媒體查詢維持目標現況

來源有 `@media (prefers-contrast: more)` 與 `forced-colors: active` 基礎規則，並在尾段為 `cover-lime` 加深色外圈；本範本目前兩類查詢都不存在。為避免引入新的全域規則而影響既有 13 款，來源尾段的高對比外圈不移植，改以既有 `:focus-visible` 2px 寬度配合 `outline-color` 覆寫達成可見性，並由對比矩陣驗證焦點環與相鄰底色 ≥3:1。來源測試中「`outline: none` 恰為 1 處」的斷言亦不沿用，改用「不新增第五處」作為回歸防護（目標現有 4 處）。

### D8：232px 深色帶的取捨

來源 232px 是為 9 頁籤設計，本範本只有 4／5 頁籤，寬螢幕會留下較多置中留白。仍移植 `min-height: 232px` 以重現封面語彙，但將其定位為「足夠高度的深色帶」而非內容填滿；頁籤固定單列 Flex、`overflow-x: auto`，角色切換不改變帶高，因此不會跳動。以 1440×900 與 375×812 截圖核閱取捨是否可接受。

## Risks / Trade-offs

- [來源沒有對比硬閘門，色票直接照抄會失敗] → 兩款淺色 `--ink-3` 依 D2 調深，並以 `check:contrast` 與契約測試雙重驗證。
- [來源與本範本預設風格、頁籤模型不同] → 回退改 `modern-slate`；`tablist`／方向鍵／1、2、9 頁籤假設改寫為 4／5 頁籤、事件委派與 `aria-current`。
- [D6 別名可能造成循環、兩層解析或視覺改變] → 改用明示色值、限制 Adjusted Roles、遞迴解析測試與修補前後對照。
- [232px 深色帶在 4／5 頁籤下留白] → 僅 `@media (min-width: 1200px)` 生效，窄螢幕回 56px 單列橫向捲動；以兩種可視尺寸截圖核閱。
- [九款既有風格的按鈕對比低於 4.5:1] → 實測 `modern-slate:dark` 3.68:1、`blueprint:dark` 2.41:1 等屬移植前既有基準，非本次變更造成；本變更不修改其色彩，契約如實排除並保留功能完整性驗證，另由既有 `check:contrast` 把關不回退。
- [新規則與既有約 7,000 行 CSS 發生特異性衝突] → 集中檔尾並限定 `html[data-style]`，不使用 `!important`；以瀏覽器逐一檢查計算樣式。
- [既有稽核盲點] → 靜態契約補足按鈕／頁籤／表格懸停，結構稽核明確標示不驗證 CSS，不以既有綠燈代表全風格可用。
- [部署產物漂移或語言檢查違規] → 每個觸及 `webapp/` 的 task 都重建並提交 `index.html`；最終執行 `check:lang` 與 OpenCC `--check`。
- [品質門檻不回退] → 每完成一項 task 即驗證並獨立提交；完成後執行 `AGENTS.md` 所列完整本地 CI 指令鏈。

## Migration Plan

無資料遷移：既有 `localStorage` 保存的風格 id 仍有效，預設仍為 `modern-slate`；未知 id 由既有防呆回退並改寫為 `modern-slate`。上線流程依 `AGENTS.md`：獨立分支先提交提案 → 逐 task 驗證提交 → 封存 change → 本地完整 CI → Pull Request 與雙代理審查 → Squash Merge → 同步 `main` → 重新建置並以固定 Deployment ID 部署。

回滾方式：還原本次 commit 並重新執行 `npm run build:webapp`；使用者若已選新風格，`applyStyle()` 的未知 id 防呆會自動回退至 `modern-slate`。
