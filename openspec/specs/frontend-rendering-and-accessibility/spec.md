# frontend-rendering-and-accessibility Specification

## Purpose
定義前端介面的無障礙與操作回饋要求，涵蓋鍵盤可操作上傳區、Modal 焦點管理、表單標籤關聯、色彩對比與狀態提示，讓所有角色都能順利完成操作流程。

## Requirements

### Requirement: 差異渲染與輸入焦點保存
前端 `setState` 觸發重新渲染時 MUST 保存並還原目前焦點元素的 id 與 `selectionStart`/`selectionEnd`，不得在使用者輸入過程中摧毀正在編輯的輸入框。課程搜尋 MUST 由明確操作（Enter 或按下搜尋鈕）觸發，若保留自動搜尋則 MUST 以請求序號捨棄過期回應，且相同條件不得重複送出。

#### Scenario: 搜尋後仍保留焦點
- **WHEN** 使用者在課程關鍵字輸入框輸入文字並觸發搜尋
- **THEN** 重新渲染後輸入框仍取得焦點且游標位置不變

#### Scenario: 過期回應不覆蓋最新結果
- **WHEN** 兩次搜尋的回應順序交錯
- **THEN** 僅較新請求的結果被套用至 state

### Requirement: 鍵盤可操作檔案上傳
檔案上傳區 MUST 可由鍵盤操作：提供可聚焦元素（`tabindex="0"` + `role="button"` + `aria-label`，或可聚焦的 `<label for="fileInput">`），並支援 Enter 與 Space 觸發檔案選擇。不得以 `display:none` 隱藏唯一的檔案輸入控制項而使鍵盤使用者無法觸達。

#### Scenario: 純鍵盤選擇檔案
- **WHEN** 鍵盤使用者 Tab 到上傳區並按下 Enter 或 Space
- **THEN** 瀏覽器檔案選擇對話框被開啟

### Requirement: 對話框語意與焦點管理
Modal MUST 具備 `role="dialog"`、`aria-modal="true"` 與 `aria-labelledby`；開啟時 MUST 將焦點移入對話框內第一個可操作元素，關閉時 MUST 還原到觸發元素；MUST 支援 Esc 關閉與 Tab 焦點陷阱，避免焦點跑到背景內容。

#### Scenario: Esc 關閉並還原焦點
- **WHEN** 使用者在新增授權帳號對話框按 Esc
- **THEN** 對話框關閉且焦點回到「新增授權成員」按鈕

#### Scenario: Tab 不離開對話框
- **WHEN** 使用者在對話框內連續按 Tab
- **THEN** 焦點只在對話框內循環

### Requirement: 表單標籤與無障礙名稱
所有表單輸入與選單控制項 MUST 有關聯的可見或螢幕閱讀器可讀標籤：`<label>` 必須有對應的 `for`，或控制項必須有 `aria-label`／`aria-labelledby`。placeholder 不得作為唯一標籤。風格選單、檔案輸入與課程搜尋四欄位皆 MUST 通過此要求。

#### Scenario: 螢幕閱讀器可讀出欄位名稱
- **WHEN** 焦點移到新增帳號的 Email 欄位
- **THEN** 輔助科技可讀出「Google 電子郵件」或等效標籤，而非僅「編輯文字」

### Requirement: UI class 與樣式表對齊
前端產生的 class MUST 存在於 `webapp/styles.css`，或由明確的別名規則提供相同樣式。既有 39 個未定義 class MUST 映射到既有設計系統 class（如 `upload-dropzone→dropzone`、`modal-header→modal-head`、`modal-footer→modal-foot`、`login-container→login-wrap`、`app-layout→app-shell`），並補齊 `.table`、`.btn.secondary`、分頁與 768px 以下 RWD 規則。CI MUST 檢查 JS class 皆有對應 CSS 定義。

#### Scenario: 所有 UI class 都有樣式來源
- **WHEN** 執行 class 與 CSS 選擇器比對檢查
- **THEN** 前端 class 中沒有任何未定義且無別名的項目

#### Scenario: 行動版版面不溢出
- **WHEN** 以寬度 375px 檢視課程頁與設定頁
- **THEN** 表單、表格容器與分頁列可橫向捲動或換行，不產生水平捲動溢出

### Requirement: WCAG 對比與焦點指標

淺色與深色模式一般文字對比 MUST 至少 4.5:1，UI 元件與焦點指標對比 MUST 至少 3:1。`--ink-3` MUST 調整至符合 4.5:1；`.input:focus`／`.select:focus` 的 outline MUST 使用高對比色（如 `--accent`），不得使用低對比的 `--accent-bg` 覆蓋通用 `:focus-visible`。錯誤與警告 Toast MUST 設 `role="alert"`。`scripts/checkContrast.js` MUST 同時檢查深淺 `--ink-3` 對背景／卡片、深色模式文字與主要前景／背景組合與焦點環對卡片，並能偵測回退；本次不修改其判定邏輯與門檻。

契約 MUST 涵蓋每款風格：淺深區塊明確宣告核心角色，不以 `:root` 回退替代。按鈕、頁籤與警示膠囊的對比由 `tests/visualStyleThemes.test.js` 補足，`check:a11y` 僅驗證 DOM 結構與語意。

#### Scenario: 次要文字通過 AA
- **WHEN** 以 WCAG 公式計算淺色 `--ink-3` 對背景與卡片色的對比
- **THEN** 兩者皆 ≥ 4.5:1

#### Scenario: 深色文字通過 AA
- **WHEN** 以 WCAG 公式計算深色主題主要文字對背景與卡片的對比
- **THEN** 兩者皆 ≥ 4.5:1

#### Scenario: 輸入框焦點清楚可見
- **WHEN** 鍵盤使用者聚焦搜尋框
- **THEN** focus outline 對比 ≥ 3:1

#### Scenario: 每款風格的核心角色可解析
- **WHEN** 逐一以遞迴解析（含循環偵測）取得每一款風格淺色與深色的核心角色
- **THEN** 所有角色皆在該風格自身區塊宣告並解析為可計算的顏色，未發生 `:root` 靜默替代

#### Scenario: 共用元件對比涵蓋全部風格
- **WHEN** 在任一風格的任一主題計算主要按鈕、頁籤、警示膠囊與表格列懸停的對比
- **THEN** 文字對底色至少 4.5:1，焦點環對外側相鄰背景至少 3:1

#### Scenario: 稽核責任分界明確
- **WHEN** 執行 `check:a11y`、`check:contrast` 與 `tests/visualStyleThemes.test.js`
- **THEN** 三者分別覆蓋 DOM 結構、`--ink-3`／焦點環、其餘元件對比，且不以任一項的綠燈宣稱其他項已通過

### Requirement: 操作回饋與狀態提示
破壞性操作（刪除授權成員）MUST 先顯示確認對話框；`settings.saving` 或 `importBusy` 時相關操作按鈕 MUST 被禁用並顯示處理中狀態；Session 過期或無效時 MUST 顯示明確文案（如「工作階段已過期，請重新登入」），不得靜默回到登入頁；登出 MUST 防重複點擊並在失敗時提供回饋。非提交按鈕 MUST 標記 `type="button"`，表格標頭 MUST 標記 `scope="col"`。

#### Scenario: 刪除成員前先確認
- **WHEN** 管理員點擊刪除授權成員
- **THEN** 先顯示確認對話框，取消時不送出 `saveWhitelist`

#### Scenario: Session 過期有明確提示
- **WHEN** `getSession` 回傳 `missing_token`
- **THEN** 登入頁顯示「工作階段已過期，請重新登入」而非空白錯誤區

### Requirement: 跳過連結與地標語意

前端 MUST 在主要內容前提供可見於鍵盤聚焦的「跳至主要內容」連結，目標為具 `id` 且可程式聚焦的 `<main>`；`<nav>` MUST 有可讀名稱，目前頁籤 MUST 以 `aria-current="page"` 標示，而其他頁籤不得標示為目前頁。裝飾性圖示與 emoji MUST 設 `aria-hidden="true"`，不得成為輔助科技可讀內容。

#### Scenario: 鍵盤跳過導覽

- **WHEN** 鍵盤使用者在頁面載入後按下第一次 Tab 啟動跳過連結
- **THEN** 焦點移到主要內容區域且連結在聚焦時清楚可見

#### Scenario: 頁籤目前位置可讀

- **WHEN** 使用者位於課程頁籤
- **THEN** 該頁籤具 `aria-current="page"`，其餘頁籤沒有此屬性

### Requirement: 首頁功能卡片鍵盤操作

首頁功能卡片 MUST 使用 `<button type="button">`，並保留既有切換頁籤行為；不得僅以 `<div onclick>` 提供操作。卡片的可讀名稱 MUST 與卡片標題一致，且 Enter／Space 皆能觸發。

#### Scenario: 純鍵盤切換頁籤

- **WHEN** 鍵盤使用者聚焦功能卡片並按 Enter 或 Space
- **THEN** 切換至對應頁籤且焦點未丟失

### Requirement: 表單必填與欄位層級錯誤提示

必填控制項 MUST 標示 `required` 或 `aria-required="true"`；補充說明 MUST 以 `aria-describedby` 與控制項關聯；驗證失敗的欄位 MUST 設 `aria-invalid="true"` 並提供可讀的錯誤訊息。placeholder MUST NOT 作為唯一標籤或必填提示。

#### Scenario: 讀出必填與錯誤

- **WHEN** 新增授權成員的 Email 格式錯誤
- **THEN** 該欄位設為 `aria-invalid="true"`，且輔助科技可讀出欄位標籤與錯誤說明

### Requirement: 狀態提示與對話框背景

載入中 MUST 以 `role="status"` 或 `aria-busy` 呈現；登入錯誤 MUST 以 `role="alert"` 即時宣告；Modal 開啟時背景主要內容 MUST 設為 `inert`，關閉後 MUST 還原可操作性與原焦點。

#### Scenario: 登入錯誤即時宣告

- **WHEN** 登入失敗並顯示錯誤區塊
- **THEN** 該區塊具 `role="alert"`，輔助科技立即讀出錯誤訊息

#### Scenario: 對話框背景不可操作

- **WHEN** 新增授權成員對話框開啟
- **THEN** 背景 main 與 nav 設為 `inert`，Tab 焦點只留在對話框內

### Requirement: 減少動態效果與自動化稽核

樣式表 MUST 提供 `@media (prefers-reduced-motion: reduce)`，關閉 Toast 進場、spinner 旋轉與非必要 transition。CI MUST 以 `axe-core` 搭配 `jsdom` 稽核所有主要畫面與關鍵狀態的淺色／深色版本；除了因 jsdom 不計算樣式而明確停用的 `color-contrast`，其他 WCAG 2.1 AA 規則違規都 MUST 阻擋合併。稽核結果 MUST 可見規則編號、嚴重度與節點。

#### Scenario: 偏好減少動態

- **WHEN** 使用者系統設定為減少動態效果
- **THEN** Toast、spinner 與非必要 transition 不播放動畫

#### Scenario: 無障礙回退被攔截

- **WHEN** 開發者移除頁籤的 `aria-current` 或新增未標籤的按鈕
- **THEN** `npm test` 與 CI 無障礙稽核失敗並列出違規規則

### Requirement: 通用純函式雙向分頁導覽元件
前端 UI 模組 MUST 提供通用無副作用之純函式分頁運算器與分頁工具列渲染器（`MEA.ui.calculatePaginationWindow` 與 `MEA.ui.renderPaginationBar`）。
運算器 MUST 支援除零防禦、負數校正、切片起訖計算與邊界校正；渲染器 MUST 支援上下雙向獨立前綴 DOM ID（如 `-top-size`, `-bottom-size`, `-top-jump`, `-bottom-jump`）、自訂每頁筆數選單、快速跳頁選單、第一頁／上一頁／下一頁／最末頁導覽按鈕，並符合 WCAG 2.1 AA 無障礙規範：具備 `role="navigation"`、依方位可區隔之 `aria-label`（如「上方分頁導覽」／「下方分頁導覽」）、統計資訊 `aria-live="polite"`、當前頁 `aria-current="page"`，並在總筆數為 0 或載入狀態（`loading`）時停用操作按鈕與下拉選單。
渲染器 MUST 同時支援集中事件委派屬性模式（`actionAttribute` 與 `data-page`）與字串樣板模式（`onPageChange`），並支援統計文字格式化（`summaryFormatter`）。

#### Scenario: 運算器防禦邊界與除零
- **WHEN** 呼叫端傳入無效或邊界引數（如 `totalItems: 0`、負數頁碼或 `pageSize: 0`）
- **THEN** 運算器安全回退，計算出合理的頁數（至少 1 頁）、夾取合法當前頁與有效切片範圍，不拋出除零或非數值異常

#### Scenario: 雙向分頁列具備唯一 ID 與區隔地標名稱
- **WHEN** 呼叫端分別以 `position: "top"` 與 `position: "bottom"` 渲染分頁工具列
- **THEN** 產出之 HTML 包含不同且唯一的控制項 ID，且具備 `role="navigation"`、包含方位之 `aria-label`、`aria-live="polite"` 與當前頁語意，不觸發重複無差別 Landmark 警告

#### Scenario: 支援事件委派與零筆或載入停用
- **WHEN** 設定 `actionAttribute: "data-course-action"` 且資料總筆數為 0 或 `loading` 為 true
- **THEN** 分頁按鈕具備 `data-course-action="page"` 與對應目標頁碼屬性，並帶有 `disabled` 屬性

### Requirement: 高階純函式資料表格組合容器
前端 UI 模組 MUST 提供高階純函式資料表格組合容器（`MEA.ui.renderPagedTable`），支援一鍵整合上下雙向分頁列與橫向捲動響應式表格容器（`<div class="table-responsive table-container" style="overflow-x:auto;">`）。
容器 MUST 支援宣告式欄位（`columns`，包含 `title`, `key`/`field`, `align`, `width`, `formatter`）與自訂列渲染回呼（`rowRenderer`）雙模式；表頭 `<th scope="col">` MUST 自動防護或補齊；對齊樣式 MUST 經白名單過濾；載入中（`loading`）與查無資料（`emptyText`）提示列 MUST 將 `role="status"` 與 `aria-live="polite"` 封裝於單元格內層容器以保護 `<td>` 之原生 table cell 語意，支援 `colspan` 防呆，且在載入中時表格 MUST 標註 `aria-busy="true"`。未提供 `pagination` 參數時 MUST 自動降級為純表格容器。

#### Scenario: 組合容器一鍵產出完整雙向分頁與表格結構
- **WHEN** 傳入資料清冊、欄位宣告與分頁參數至 `renderPagedTable`
- **THEN** 回傳之 HTML 字串依序包含頂部分頁列、橫向捲動容器、`table`、表頭 `scope="col"`、資料列以及底部分頁列，且外層標記 `table-responsive table-container`

#### Scenario: 載入中狀態保護表格單元格語意並停用分頁
- **WHEN** 傳入 `loading: true` 至 `renderPagedTable`
- **THEN** 表格標籤帶有 `aria-busy="true"`，提示列內層容器帶有 `role="status"` 與 `aria-live="polite"`，`<td>` 維持單元格結構，且上下雙向分頁按鈕皆處於 `disabled` 狀態

#### Scenario: 自訂 rowRenderer 與 colspan 防呆
- **WHEN** 傳入自訂 `rowRenderer` 函式與 `colspan` 參數
- **THEN** 容器依照回呼逐列輸出內容，且狀態列正確跨越指定欄數

### Requirement: 通用語意表格樣式與面板字級調升
樣式表 `webapp/styles.css` MUST 提供標準通用語意表格樣式類別（`.table-centered`、`.table-hover`、`.table-striped`、`.data-table`、`.table-container`）與主題特定懸停反饋（包含 NES 紅白機像素高亮）。
同時，面板標題 `.panel-title` MUST 提升至 19.5px、副標題 `.panel-sub` 提升至 14px，並新增緊湊型表單控制項樣式 `.form-select-sm` 與 `.form-input-sm`（字級 13.5px、最小高度 30px），既有 `.input` 與 `.select` 保留標準尺寸，確保各主題風格下皆符合 WCAG 對比標準（$\ge 4.5:1$）且版面不溢出。

#### Scenario: 通用表格樣式套用置中與列懸停效果
- **WHEN** 表格套用 `.table-centered` 與 `.table-hover` 類別
- **THEN** 儲存格內容呈現水平與垂直置中，且游標懸停時平滑呈現高對比背景反饋

#### Scenario: 緊湊型表單控制項排版緊湊且通過檢查
- **WHEN** 渲染分頁列與工具列小型下拉選單
- **THEN** 控制項套用 `.form-select-sm`（字級 13.5px、高度 30px），排版緊湊且全站 CSS 類別通過 `checkUiClasses`

### Requirement: 科別下拉選單選項依科別代碼由小到大排序
全系統各處提供之「科別」下拉選單（包含課程代碼清單搜尋選單、課程代碼匯入預覽表格篩選器）中之科別選項，MUST 依教育部標準科別代碼由小到大（自然升冪順序）排序。選項之 `value` 與顯示文字 MUST 維持標準科別中文名稱。

排序演算法 MUST 採用四層排序鍵（Four-Tier Sort Key）：
1. **Tier 0（專業群科）**：具備教育部標準三碼代碼（純數字如 `301`、英數混合如 `21B`，以及字母開頭之實用技能學程如 `A01`～`Y02`）排在最前（前綴 `"0_" + code.toUpperCase()`）；
2. **Tier 1（共同科目）**：具備共同科代碼或別名者次之（前綴 `"1_" + commonCode`）；
3. **Tier 2（未知科別）**：未登錄之未知科別排在最後（前綴 `"2_" + cleanName`）並以正體中文拼音/筆畫自然排序；
4. **Tier 3（空值置底）**：傳入 null、undefined 或空字串時賦予最高排序鍵（`"3_"`），固定置於最底端。

解析科別代碼時 MUST 支援 3 碼英數代碼（`/^[0-9A-Za-z]{3}$/`）、前置代碼（如 `(301)機械科`）、後置代碼（如 `機械科(301)`）、全形半形括號及常見別名映射，官方自帶方括號科別（如 `21B:不分科[機械群]`）在括號過濾查無時 MUST 保留原名反查，且英數混合代碼 MUST 強制轉為大寫比對。在前端執行期環境若無排序比較函式，選單渲染 MUST 具備安全降級回退（Graceful Degradation），不得拋出例外中斷畫面呈現。

#### Scenario: 課程代碼清單科別選單依代碼排序
- **WHEN** 渲染課程代碼清單搜尋表單之科別下拉選單
- **THEN** 科別選項除預設「所有科別」外，其餘選項依科別代碼由小到大排序（例如 301 機械科 先於 303 汽車科、305 資訊科 先於 306 電子科、309 冷凍空調科 先於 321 電機空調科、373 圖文傳播科 先於 374 電腦機械製圖科）

#### Scenario: 實用技能學程代碼依英數順序升冪排序
- **WHEN** 傳入包含實用技能學程代碼之科別選項（例如 `A01` 機械技術學程、`B01` 汽車技術學程、`C01` 電子技術學程）
- **THEN** 排序器能準確識別其代碼並依英數順序排於純數字代碼之後（`"0_929" < "0_A01" < "0_B01"`），且優於共同科目與未知科別

#### Scenario: 匯入預覽表格動態科別篩選選單依代碼排序
- **WHEN** 解析使用者上傳之課程檔案並渲染預覽表格之科別篩選下拉選單
- **THEN** 從預覽資料中萃取之科別選項依科別代碼由小到大排序

#### Scenario: 別名與代碼格式容錯解析
- **WHEN** 傳入帶有別名（如「冷凍科」、「空調科」、「製圖科」）或帶有前置/後置括號代碼之科別字串進行排序比較
- **THEN** 排序器能準確識別其對應之標準教育部代碼並維持正確升冪順序

#### Scenario: 空值與無效輸入安全置底
- **WHEN** 傳入包含 `null`、`undefined` 或空字串之科別名稱進行比較
- **THEN** 排序器賦予 `"3_"` 排序鍵，將空值穩定排列於選單最後端且不拋出例外

#### Scenario: 缺少排序模組時之安全降級回退
- **WHEN** 前端執行環境未載入 `compareDepartmentsByCode` 或在未提供 mock 依賴之測試環境下
- **THEN** 選單渲染安全降級為原生正體中文排序，確保介面正常渲染且不拋出錯誤

### Requirement: 課程代碼官方來源管道與格式禁忌指引
前端匯入模組（`webapp/js/imports.js`）MUST 提供純函式 `renderCourseCodeGuidanceHtml`，於課綱 Excel 檔案上傳區塊（Dropzone）**外部下方**獨立渲染官方來源說明卡片，嚴禁置於 Dropzone 容器內部以避免點擊文字時觸發檔案選擇對話框。該卡片 SHALL 詳列教育部「高級中等學校課程計畫平臺」與「巨耀校務行政系統」之匯出路徑，並以警告樣式標示格式注意事項（勿修改欄位順序、刪除表頭或合併儲存格，以免 1NF 正規化解析失敗）。該區塊 MUST 具備 `role="region"` 與 `aria-label="108 課綱課程代碼官方來源管道指引"` 等無障礙標籤，並嚴格使用設計系統已定義之 CSS 變數（`--fill`、`--line-2`、`--ink-2`、`--err`）。

#### Scenario: 匯入頁面渲染官方來源管道與格式禁忌
- **WHEN** 使用者進入「課程代碼匯入」頁面且尚未選取檔案
- **THEN** Dropzone 外部下方顯示官方來源管道說明卡片，包含教育部平臺與巨耀校務系統之路徑及格式禁忌警示，點擊文字不觸發檔案選擇，且輔助科技可透過對應 region 朗讀

### Requirement: 表格容器 raw HTML 狀態列與課程空白狀態事件委派
前端 UI 模組（`webapp/js/ui.js`）之 `renderPagedTable` 與 `renderTableStatusRow` MUST 擴充支援 `emptyHtml` 參數：當提供 `opt.emptyHtml` 時 SHALL 直接嵌入渲染原始 HTML，未提供時回退至既有 `escapeHtml(opt.emptyText || "查無資料")`。
前端課程模組（`webapp/js/courses.js`）MUST 提供純函式 `renderEmptyCoursesStateHtml`，並依四維度篩選條件（關鍵字 `keyword`、科別 `department`、學年度 `academicYear`、學期 `semester`）精準分流：
1. **資料庫無資料（Initial Empty）**：當 `courses.total === 0` 且四維度皆無任何篩選條件時，SHALL 呈現引導卡片與「前往匯入課綱代碼」按鈕。該按鈕 MUST 遵循宣告式事件委派，標記 `type="button"`、`class="btn primary"` 與 `data-course-action="goto-import"`，並由 `courses.js` 攔截切換至單數 `'import'` 頁籤；嚴禁使用 inline `onclick` 事件處理器。
2. **搜尋篩選無相符結果（Filtered Empty）**：當 `courses.total > 0` 但 `courses.list.length === 0`（或任一篩選維度有值）時，SHALL 呈現「查無符合條件的課程紀錄」提示與「重設搜尋條件」按鈕（`data-course-action="reset"`）。
3. **既有測試相容性**：無論全空或篩選無相符結果，提示文案中 MUST 包含「目前尚無符合的課程紀錄」之說明，確保既有單元測試相容不回退。

#### Scenario: 資料庫全空時引導至匯入頁面且按鈕正常解析
- **WHEN** 課程資料庫無任何資料且未設定任何篩選條件
- **THEN** 表格透過 `emptyHtml` 呈現友善的 Empty State 卡片與按鈕，點擊「前往匯入課綱代碼」按鈕透過事件委派切換至 `'import'` 頁面，且按鈕為可點擊 DOM 元素而非轉義字串

#### Scenario: 搜尋無結果時引導重設篩選
- **WHEN** 課程資料庫有資料但搜尋條件查無相符結果
- **THEN** 表格呈現查無紀錄提示與「重設搜尋條件」按鈕，點擊後清空搜尋條件並重新載入列表

### Requirement: 全站外部相依安全降級防護
前端所有模組在存取全域物件（如 `MEA.courseData`、`MEA.ui`、`escapeHtml`、`toast`、`compareDepartmentsByCode`）時，MUST 進行防禦性檢查；模組內部 SHALL 提供本地安全純函式 fallback（包含 `safeEscapeHtml`、`safeToast` 與正體中文 `localeCompare(..., "zh-TW")`），當外部相依物件為 null、未定義或函式缺失時，MUST 安全降級，嚴禁拋出未攔截之 TypeError 導致整個 UI 崩潰。

#### Scenario: 外部相依未載入時安全降級
- **WHEN** `MEA.courseData`、`MEA.ui.escapeHtml` 或自訂比較器尚未初始化
- **THEN** 前端選單、表單與表格渲染依舊能正常顯示並回退至安全純函式，無任何未捕獲之 JavaScript 例外

### Requirement: 前端說明手冊與操作指南彈出視窗
前端介面 MUST 提供使用者操作手冊入口：
1. **Web App 手冊網址解析**：提供純/輔助函式 `getUserGuideUrl()`，依據當前部署網址或 location 自動組裝 `?page=docs%2Fuser-guide.html` 網址。
2. **操作指引 Modal 彈出視窗**：提供 `openUserGuide()` 函式，開啟具備快速指南（登入驗證、課程代碼匯入、課程搜尋與系統設定）與常見問題之對話框，樣式嚴格使用現有語意變數（`--fill`、`--line-2`、`--paper`），並包含「在新分頁開啟完整手冊」按鈕（點擊開啟 `getUserGuideUrl()`）。
3. **介面入口與無障礙**：於全站頁尾（Footer）呈現新分頁開啟之手冊連結，標記 `target="_blank"`、`rel="noopener noreferrer"` 與 `aria-label="開啟使用者操作手冊（另開新分頁）"`，並於首頁或導覽處提供觸發 `openUserGuide()` 之手冊按鈕。

#### Scenario: 點擊手冊按鈕開啟快速指南對話框
- **WHEN** 使用者點擊操作指引之「📖 說明手冊」按鈕
- **THEN** 畫面彈出使用者操作手冊 Modal，包含快速功能指南、常見問題與在新分頁開啟完整手冊之按鈕，且無未定義之 CSS 變數

#### Scenario: 頁尾包含手冊新分頁連結並具備無障礙標籤
- **WHEN** 檢視前端主版面頁尾
- **THEN** 頁尾包含連至 `getUserGuideUrl()` 的外部連結，並標記 `target="_blank"`、`rel="noopener noreferrer"` 與明確之 `aria-label`
