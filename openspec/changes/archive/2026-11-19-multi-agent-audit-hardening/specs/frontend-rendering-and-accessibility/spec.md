## ADDED Requirements

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
淺色模式一般文字對比 MUST 至少 4.5:1，UI 元件與焦點指標對比 MUST 至少 3:1。`--ink-3` MUST 調整至符合 4.5:1；`.input:focus`／`.select:focus` 的 outline MUST 使用高對比色（如 `--accent`），不得使用低對比的 `--accent-bg` 覆蓋通用 `:focus-visible`。錯誤與警告 Toast MUST 設 `role="alert"`。

#### Scenario: 次要文字通過 AA
- **WHEN** 以 WCAG 公式計算淺色 `--ink-3` 對背景與卡片色的對比
- **THEN** 兩者皆 ≥ 4.5:1

#### Scenario: 輸入框焦點清楚可見
- **WHEN** 鍵盤使用者聚焦搜尋框
- **THEN** focus outline 對比 ≥ 3:1

### Requirement: 操作回饋與狀態提示
破壞性操作（刪除授權成員）MUST 先顯示確認對話框；`settings.saving` 或 `importBusy` 時相關操作按鈕 MUST 被禁用並顯示處理中狀態；Session 過期或無效時 MUST 顯示明確文案（如「工作階段已過期，請重新登入」），不得靜默回到登入頁；登出 MUST 防重複點擊並在失敗時提供回饋。非提交按鈕 MUST 標記 `type="button"`，表格標頭 MUST 標記 `scope="col"`。

#### Scenario: 刪除成員前先確認
- **WHEN** 管理員點擊刪除授權成員
- **THEN** 先顯示確認對話框，取消時不送出 `saveWhitelist`

#### Scenario: Session 過期有明確提示
- **WHEN** `getSession` 回傳 `missing_token`
- **THEN** 登入頁顯示「工作階段已過期，請重新登入」而非空白錯誤區
