## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: WCAG 對比與焦點指標

淺色與深色模式一般文字對比 MUST 至少 4.5:1，UI 元件與焦點指標對比 MUST 至少 3:1。`--ink-3` MUST 調整至符合 4.5:1；`.input:focus`／`.select:focus` 的 outline MUST 使用高對比色（如 `--accent`），不得使用低對比的 `--accent-bg` 覆蓋通用 `:focus-visible`。錯誤與警告 Toast MUST 設 `role="alert"`。`scripts/checkContrast.js` MUST 同時檢查深色模式文字與主要前景／背景組合，並能偵測回退。

#### Scenario: 深色文字通過 AA
- **WHEN** 以 WCAG 公式計算深色主題主要文字對背景與卡片的對比
- **THEN** 兩者皆 ≥ 4.5:1

#### Scenario: 輸入框焦點清楚可見
- **WHEN** 鍵盤使用者聚焦搜尋框
- **THEN** focus outline 對比 ≥ 3:1
