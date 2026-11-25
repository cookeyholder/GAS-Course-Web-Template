# Spec Delta

## Purpose

補充 `frontend-rendering-and-accessibility` 在「每一款可選視覺風格」上的對比與稽核責任分界，使風格切換後的可讀性與操作完整性能被驗證，而非僅依賴單一全域主題檢查。

## MODIFIED Requirements

### Requirement: WCAG 對比與焦點指標

淺色與深色模式一般文字對比 MUST 至少 4.5:1，UI 元件與焦點指標對比 MUST 至少 3:1。`--ink-3` MUST 調整至符合 4.5:1；`.input:focus`／`.select:focus` 的 outline MUST 使用高對比色，不得用低對比 `--accent-bg` 覆蓋 `:focus-visible`。錯誤與警告 Toast MUST 設 `role="alert"`。`checkContrast.js` MUST 同時檢查深淺 `--ink-3` 對背景／卡片與焦點環對卡片，並能偵測回退；本次不修改其判定邏輯與門檻。

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

#### Scenario: 共用元件對比涵蓋七款風格
- **WHEN** 在 `visual-style-themes` 所定七款涵蓋風格的任一主題計算主要按鈕、頁籤、警示膠囊與表格列懸停的對比
- **THEN** 文字對底色至少 4.5:1，焦點環對外側相鄰背景（向內偏移者為頁籤底色）至少 3:1；其餘九款既有風格的按鈕色對為現況基準，本契約不宣稱其已通過 4.5:1

#### Scenario: 稽核責任分界明確
- **WHEN** 執行 `check:a11y`、`check:contrast` 與 `tests/visualStyleThemes.test.js`
- **THEN** 三者分別覆蓋 DOM 結構、`--ink-3`／焦點環、其餘元件對比，且不以任一項的綠燈宣稱其他項已通過
