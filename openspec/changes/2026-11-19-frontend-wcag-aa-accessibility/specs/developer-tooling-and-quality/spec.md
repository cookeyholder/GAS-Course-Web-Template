## ADDED Requirements

### Requirement: 前端無障礙稽核閘門

專案 MUST 提供 `npm run check:a11y`，以 `axe-core` 搭配 `jsdom` 稽核前端主要畫面與關鍵狀態，並在 CI 中作為獨立步驟執行；同一稽核 MUST 由 `npm test` 自動涵蓋。`color-contrast` 規則因 jsdom 不計算配置樣式而 MUST 明確停用並由 CSS 對比檢查互補；其餘 WCAG 2.1 AA 規則違規 MUST 造成非零結束碼。新增前端模組 MUST 同步擴充稽核夾具。

#### Scenario: CI 攔截無障礙回退
- **WHEN** 開發者提交造成 axe 違規的前端變更
- **THEN** CI 無障礙稽核步驟失敗並阻擋合併

#### Scenario: 本機單獨稽核
- **WHEN** 開發者執行 `npm run check:a11y`
- **THEN** 輸出所有夾具的稽核結果且無違規時結束碼為 0
