## ADDED Requirements

### Requirement: 建置與監看流程一致
`npm run watch` MUST 在執行 `clasp push --watch` 之前先執行 `npm run build:webapp`，確保 `webapp/` 的原始碼變更已反映到根目錄 `index.html`。文件 MUST 說明 `push`、`watch` 與 `build:webapp` 的關係。

#### Scenario: watch 推送前先建置
- **WHEN** 開發者修改前端原始檔後執行 `npm run watch`
- **THEN** 建置腳本先更新 `index.html`，再開始監看推送

### Requirement: 品質閘門新增靜態檢查
CI MUST 在既有格式、語言、測試、覆蓋率與複雜度閘門外，新增三項檢查：(1) 前端 JS 使用的 class 必須存在於 CSS 或有別名規則；(2) 淺色模式一般文字 ≥ 4.5:1 且焦點指標 ≥ 3:1；(3) 由原始檔重建的 `index.html` 必須與版本控制中的產物逐位元組一致。任一項失敗都 MUST 阻擋合併。

#### Scenario: 新增未定義 class 被攔截
- **WHEN** 開發者在 JS 加入一個 CSS 沒有的 class 且未設別名
- **THEN** CI class 檢查失敗

#### Scenario: 建置產物漂移被攔截
- **WHEN** 開發者修改了 `webapp/js/` 但沒有重新建置 `index.html`
- **THEN** CI 建置一致性檢查失敗

### Requirement: 測試與複雜度工具改善
`checkChangedCoverage.js` 的 `getDiff` MUST 拆分為較小的純函式，使 CRAP 低於 30，維持品質基準不回退。新增功能 MUST 同時新增對應測試，變更覆蓋率不得低於 Lines 80%、Branches 70% 的門檻。

#### Scenario: CRAP 有緩衝空間
- **WHEN** 執行 `npm run check:complexity`
- **THEN** 所有納管函式的 CRAP 嚴格小於 30
