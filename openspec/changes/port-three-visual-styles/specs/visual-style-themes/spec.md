# Spec Delta

## Purpose

界定本範本可選視覺風格的清單、套用與持久化，三款新風格的深淺角色與版型契約，以及全部現行風格在目前前端功能下皆完整可用之可驗證要求。

## ADDED Requirements

### Requirement: 風格清單提供三款新風格

系統 SHALL 在既有 13 款之後提供 `navy-brick`「藏青磚紅 (Navy Brick)」、`celadon-mint`「青瓷薄荷 (Celadon Mint)」與 `cover-lime`「封面檸檬 (Cover Lime)」。每一款 SHALL 具備唯一識別碼、繁體中文名稱、圖示與說明配色來源的描述；既有 13 款的識別碼、順序與預設 `modern-slate` SHALL 維持不變。

#### Scenario: 下拉選單出現新風格

- **WHEN** 開發者讀取 `buildFrontendConfig().styles` 並渲染風格下拉選單
- **THEN** 清單長度為 16，三款新風格依指定識別碼與繁體名稱出現在既有 13 款之後，且既有 13 款的識別碼與順序不變

#### Scenario: 新風格條目具備完整中繼資料

- **WHEN** 檢視任一新風格條目與對應 `<option>`
- **THEN** 該條目具備唯一 `id`、`icon`、繁體 `name` 與說明配色來源的 `desc`，且 `<option>` 文字同時包含圖示與名稱

### Requirement: 新風格可套用並持久化

系統 SHALL 接受三款新風格的識別碼作為有效值，設定頁面根元素的 `data-style`，並寫入既有風格儲存鍵。傳入未知識別碼時 SHALL 改套用並寫入預設 `modern-slate`，不得保留原無效值，也不得改寫其他既有設定；主題切換不得改變目前風格。

#### Scenario: 選擇新風格後重新載入

- **WHEN** 使用者選擇任一新風格、重新初始化並重新載入頁面
- **THEN** 頁面根元素仍標註該識別碼，風格儲存鍵保存同一識別碼，且下拉選單顯示同一款式

#### Scenario: 未知識別碼安全回退

- **WHEN** 傳入不存在的風格識別碼
- **THEN** 系統套用 `modern-slate`、風格儲存鍵改為 `modern-slate`，且主題等其他設定值維持原樣

#### Scenario: 主題切換不影響風格

- **WHEN** 使用者在任一新風格下切換淺色與深色主題
- **THEN** 目前風格識別碼維持不變，僅色彩隨該風格的深色變體更新

### Requirement: 三款風格具備完整深淺角色

系統 SHALL 在三款新風格的淺色與深色區塊各自明確宣告完整角色：`--bg`、`--paper`、`--ink`、`--ink-2`、`--ink-3`、`--line`、`--line-2`、`--fill`、`--fill-2`、`--accent`、`--accent-bg`、`--ok`、`--ok-bg`、`--err`、`--err-bg`、`--warn`、`--warn-bg`、`--radius`、`--danger`、`--shadow`、`--head-font`、`--bg-pattern`、`--bg-size`，三款另宣告 `--style-nav-bg`、`--style-nav-ink`、`--style-band-accent`，`cover-lime` 另宣告 `--cover-lime`。核心角色不得依賴 `:root` 回退。

#### Scenario: 藏青磚紅角色值

- **WHEN** 檢視 `navy-brick` 的淺色與深色區塊
- **THEN** 淺色 `--bg`／`--paper`／`--ink`／`--accent`／`--accent-bg`／`--ink-3` 分別為 `#fbf9f3`／`#ffffff`／`#1b2f47`／`#b8402d`／`#f7ece8`／`#5f6d7e`，深色分別為 `#101b28`／`#18283a`／`#eef3f9`／`#ef8a72`／`#43251f`／`#94a7bd`

#### Scenario: 青瓷薄荷角色值

- **WHEN** 檢視 `celadon-mint` 的淺色與深色區塊
- **THEN** 淺色上述六項角色分別為 `#fbfcfa`／`#ffffff`／`#17453f`／`#17453f`／`#d8e6de`／`#52746a`，深色分別為 `#101b18`／`#182923`／`#edf5f0`／`#86d8bf`／`#1b3c33`／`#91a99d`

#### Scenario: 封面檸檬角色值

- **WHEN** 檢視 `cover-lime` 的淺色與深色區塊
- **THEN** 淺色上述六項角色分別為 `#f1efe4`／`#fffdf7`／`#111111`／`#111111`／`#c7f03b`／`#63635a`，深色分別為 `#14140f`／`#1e1e17`／`#f3efe4`／`#c7f03b`／`#2b3812`／`#a9a494`

#### Scenario: 來源差異僅限次要文字

- **WHEN** 比對移植後角色值與來源 commit `56d3a1a` 的定案值
- **THEN** 唯一差異為 `navy-brick` 與 `celadon-mint` 的淺色 `--ink-3`（來源 `#6d7b8c`／`#64887e` 改為 `#5f6d7e`／`#52746a`），其餘角色與來源一致

#### Scenario: 檸檬底不出現白字

- **WHEN** 使用者在 `cover-lime` 的任一主題查看檸檬底的按鈕或頁籤
- **THEN** 文字為墨黑或等效深色，不出現白字配檸檬底

### Requirement: 重現來源字級與區塊切割

系統 SHALL 在三款新風格重現 56px 頂列、`@media (min-width: 1200px)` 下 `min-height: 232px` 的單列深色帶、`border-bottom-width: 6px` 的強調帶與米紙內容區；`cover-lime` SHALL 另外對 `.panel-title`／`.brand-title` 使用 `clamp(24px, 2vw, 28px)`、`font-weight: 800`、`letter-spacing: -0.02em`。所有新風格 SHALL 沿用本範本現有的單列頁籤排列、`aria-current` 與事件委派，不新增固定柵格，也不覆寫 `.app-nav` 的 `overflow-x: auto`。

#### Scenario: 寬螢幕區塊比例

- **WHEN** 使用者在寬度至少 1200px 套用 `navy-brick` 或 `celadon-mint`
- **THEN** `.app-header` 的 `min-height` 至少 56px、`.app-nav` 的 `min-height` 為 232px、`border-bottom-width` 為 6px，且深色帶與頂列之間無圓角或陰影中斷

#### Scenario: 頂列於深淺主題的表現

- **WHEN** 使用者在任一新風格下切換主題
- **THEN** 淺色 `.app-header` 為白底深灰字，深色跟隨該風格 `--paper`／`--ink`，高度皆不低於 56px

#### Scenario: 角色過濾後頁籤仍為單列

- **WHEN** 一般使用者看到 4 個頁籤、管理員看到 5 個頁籤
- **THEN** 深色帶內頁籤維持既有單列橫向排列與 `aria-current` 標記，不出現固定柵格造成的空格洞，且事件委派行為不變

#### Scenario: 窄螢幕不破版

- **WHEN** 使用者以 375px 可視寬度套用任一新風格
- **THEN** `.app-nav` 與表格容器可橫向捲動，頁面本體不出現非預期水平溢出，標題不遮擋內容

### Requirement: 全部風格具備明確角色契約

風格清單中的每一款風格 SHALL 在淺色與深色各有專屬的 `html[data-style="…"]` 區塊，且 `--bg`、`--paper`、`--ink`、`--ink-3`、`--line-2`、`--fill`、`--accent-bg`、`--ok-bg`、`--err-bg`、`--warn-bg` 必須在自身區塊明確宣告，不得依賴 `:root` 僅提供核心角色。`--focus-ring` 不受此限制：SHALL 依 `checkContrast.js` 的模型，由自身區塊、不含核心角色的既有焦點覆寫區塊或 `:root` 提供，且對相鄰背景至少 3:1；所有 `var()` 參考 SHALL 在兩層內解析完畢，不得形成循環。

#### Scenario: 每款風格皆有專屬深淺區塊

- **WHEN** 逐一比對 `config.styles` 的識別碼與 `styles.css`
- **THEN** 每一識別碼皆有 `html[data-style="id"]` 與 `html[data-style="id"][data-theme="dark"]` 兩組區塊，且主題總數等於 `styles.length × 2`

#### Scenario: 允許共用根元素的既有風格

- **WHEN** 契約測試解析到 selector 同時包含 `:root` 與 `html[data-style="blueprint"]` 的共用區塊
- **THEN** 該區塊視為 `blueprint` 的專屬深淺區塊，不因含 `:root` 而被誤判為缺失

#### Scenario: 核心角色不由根元素替代

- **WHEN** 以遞迴解析（含循環偵測）取得任一風格任一主題的角色值
- **THEN** 上述核心角色皆在該風格自身區塊宣告，且解析結果為可計算的十六進位顏色

#### Scenario: 焦點環解析遵循既有模型

- **WHEN** 契約測試解析焦點環
- **THEN** 依序比對該風格的既有焦點覆寫區塊與 `:root`，不要求核心角色區塊內必須宣告 `--focus-ring`，且解析結果對相鄰背景至少 3:1

#### Scenario: 既有風格身分維持

- **WHEN** 移植後切換到未被 MODIFIED requirement 明列調整的既有風格
- **THEN** 該風格原有的色彩、圓角、陰影與背景紋理特徵維持不變，未被新規則覆蓋

### Requirement: MODIFIED 既有風格明確化

`happyhues2`、`happyhues3`、`happyhues5`、`happyhues9` 的淺深區塊 SHALL 補足共用角色，並以明確色值取代通用深色或 `:root` 回退。這四款另有特異性高於共用規則的 `.btn.primary`、`.nav-tab.active` 與 `.pill` 硬編碼規則，故 SHALL 另以風格專屬明示規則修正低對比色對與警示語意，不得僅調整角色值便宣稱修復；深淺可給不同值。調整後 SHALL 維持各款原有色相與語意，不得新增 `--sans`／`--mono` 循環別名，也不得納入目前無對應 DOM 的 `.matrix-filter-pill`。

#### Scenario: 四款角色補足且無循環

- **WHEN** 以遞迴解析檢查四款的淺色與深色角色
- **THEN** 所有必要角色皆解析為十六進位顏色，且沒有任何 `var()` 循環或未解析的兩層參考

#### Scenario: 最小色值調整

- **WHEN** 比對四款修補前後的角色值
- **THEN** 僅 Adjusted Roles 附表明列的角色可變更，其餘角色值完全相同，且每款色相特徵仍可辨識

#### Scenario: 風格專屬硬編碼規則對比合格

- **WHEN** 在四款的任一主題查看 `.btn.primary` 與 `.nav-tab.active`
- **THEN** 文字與底色對比至少 4.5:1，且 `happyhues3` 淺色採 `#00214d` 配 `#3da9fc`

#### Scenario: 警示膠囊語意未被抹除

- **WHEN** 在四款的任一主題查看 `.pill.ok` 與 `.pill.err`
- **THEN** 兩者文字與底色對比至少 4.5:1、彼此可區辨，且風格專屬 `.pill` 規則未覆寫其成功／失敗語意

### Requirement: 共用元件在本次涵蓋風格皆可辨識

本次「按鈕／頁籤／膠囊對比」契約的涵蓋範圍 SHALL 限於三款新風格與 D6 的四款 Happy Hues，共七款。其餘九款既有風格（`modern-slate`、`blueprint`、`paper`、`neobrutalism`、`claymorphism`、`nes`、`happyhues10`、`happyhues12`、`happyhues14`）的既有按鈕色對屬現況基準，不在本變更授權修改範圍；本變更僅要求其角色完整、功能操作不中斷，且 `check:contrast` 不回退，不宣稱其按鈕已通過 4.5:1。

在上述七款的任一主題下，主要按鈕、啟用頁籤與警示膠囊 SHALL 維持文字對底色至少 4.5:1；任一風格的焦點環 SHALL 對其外側相鄰背景至少 3:1。「外側相鄰背景」定義為 `outline-offset` 所落上的背景，而非被聚焦元件自身的底色。禁用與載入狀態 SHALL 仍可清楚辨識。

#### Scenario: 主要按鈕對比

- **WHEN** 在七款涵蓋風格的任一主題查看 `.btn.primary`
- **THEN** 文字與按鈕底色對比至少 4.5:1；`cover-lime` 深淺皆為檸檬底墨黑字，`navy-brick` 與 `celadon-mint` 深色為深底淺字，`happyhues3` 淺色採 D6 明示色對

#### Scenario: 既有風格色彩基準不回退

- **WHEN** 檢視九款未授權調整的既有風格
- **THEN** 其按鈕、頁籤與角色的解析值與移植前完全相同，且已知低對比色對列為現況基準而非本次契約失敗

#### Scenario: 焦點環對比

- **WHEN** 以鍵盤聚焦任一風格的按鈕或頁籤
- **THEN** 焦點環與外側相鄰背景對比至少 3:1，`cover-lime` 檸檬底按鈕的焦點環因 2px `outline-offset` 落於深色紙面而可見，且焦點樣式使用既有 `:focus-visible` 的 2px 寬度

#### Scenario: 表格列懸停一致

- **WHEN** 使用者在任一新風格的任一主題將游標移至表格資料列
- **THEN** 該列沿用共用 `.table-hover tbody tr:hover td` 的 `var(--accent-bg)` 底色，文字對比至少 4.5:1，移開後復原

### Requirement: 任一風格皆不中斷現行功能操作

使用者在任一風格與任一主題下 SHALL 能完成頁籤切換、課程匯入預覽、課程搜尋與分頁、系統設定表單、授權成員管理與操作日誌篩選；切換風格或主題不得造成控制項消失、輸入焦點丟失或既有事件行為失效。

#### Scenario: 全部風格的主要控制項存在

- **WHEN** 逐一以每個風格渲染概覽、匯入、課程、設定與操作日誌畫面
- **THEN** 各頁籤內容正常渲染，且表單輸入、下拉、按鈕、表格容器與分頁控制項皆存在於 DOM 並可聚焦

#### Scenario: 輸入焦點與工作狀態保留

- **WHEN** 使用者在填寫表單或瀏覽分頁結果時切換風格或主題
- **THEN** 已輸入內容、目前頁籤與輸入焦點維持不變

#### Scenario: 結構性無障礙稽核

- **WHEN** 在以有限取樣畫面設定 `data-style` 的 jsdom 文件執行 axe 結構稽核
- **THEN** 無 wcag2a／wcag2aa／wcag21a／wcag21aa 違規；並明確記載 jsdom 不套用CSS 樣式，色彩可讀性由靜態契約與人工核閱負責

