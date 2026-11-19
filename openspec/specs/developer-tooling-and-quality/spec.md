# developer-tooling-and-quality Specification

## Purpose

定義本範本之程式碼格式化、臺灣繁體中文語言規範檢查、測試執行與品質閘門自動化，以及建置與部署輔助流程的最低可用規範，確保開發流程一致、可重現且與 CI 相符。

## Requirements

### Requirement: 程式碼格式化與語言規範檢查工具
專案 SHALL 提供可重複執行的程式碼格式化與臺灣繁體中文語言規範檢查機制。格式化工具 MUST 定義一致的格式規則與忽略清單，避免建置產物與非目標檔案造成無意義變更；語言檢查工具 MUST 能偵測簡體字與常見中國用語並提供可操作的違規輸出，同時支援必要的豁免機制以避免誤判或測試假資料衝突。

#### Scenario: 語言檢查可辨識違規並於乾淨狀態通過
- **WHEN** 對含有簡體字或中國用語的檔案執行語言檢查
- **THEN** 工具回報違規位置與建議；當專案內容符合規範時檢查應成功通過

#### Scenario: 格式檢查可在本機與 CI 重現執行
- **WHEN** 開發者或 CI 執行格式檢查指令
- **THEN** 依專案定義規則得到一致結果且不要求修改被忽略的建置產物

### Requirement: 測試執行與品質閘門自動化基礎
專案 MUST 提供可自動探索並執行測試檔的測試入口（至少涵蓋 `tests/**/*.test.js`），使新增測試可納入標準測試流程。專案 SHALL 提供基礎品質閘門工作流程（CI）以執行格式檢查、語言檢查與測試；若導入額外品質度量（覆蓋率/複雜度/變更覆蓋率），其門檻與範圍 MUST 與本專案現況相容並可逐步強化，不得因不切實際的初始門檻導致流程永久不可用。

#### Scenario: 新增測試檔可由標準測試指令自動執行
- **WHEN** 在 `tests/` 目錄新增符合命名規則的測試檔
- **THEN** 標準測試指令可自動發現並執行該測試檔

#### Scenario: 品質閘門工作流程可執行核心檢查
- **WHEN** 觸發 CI 品質閘門流程
- **THEN** 流程依序執行已定義的核心檢查並回報成功或失敗結果

### Requirement: 建置與部署輔助流程相容性
專案 SHALL 保持 `build:webapp` 產物與 GAS 部署流程相容，並可提供輔助部署腳本以支援固定 Deployment ID 的重複部署流程。相關設定與忽略規則 MUST 避免將不必要檔案推送至 Apps Script，同時保留既有開發者常用指令的可用性或提供等效替代。

#### Scenario: 建置與部署流程可產生可用的 Web App 產物
- **WHEN** 開發者執行建置與部署相關指令
- **THEN** 產生的 `index.html` 與後端腳本可用於既有 clasp/GAS 部署流程，且不引入被忽略檔案的推送問題

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

### Requirement: 前端無障礙稽核閘門

專案 MUST 提供 `npm run check:a11y`，以 `axe-core` 搭配 `jsdom` 稽核前端主要畫面與關鍵狀態，並在 CI 中作為獨立步驟執行；同一稽核 MUST 由 `npm test` 自動涵蓋。`color-contrast` 規則因 jsdom 不計算設定樣式而 MUST 明確停用並由 CSS 對比檢查互補；其餘 WCAG 2.1 AA 規則違規 MUST 造成非零結束碼。新增前端模組 MUST 同步擴充稽核夾具。

#### Scenario: CI 攔截無障礙回退
- **WHEN** 開發者提交造成 axe 違規的前端變更
- **THEN** CI 無障礙稽核步驟失敗並阻擋合併

#### Scenario: 本機單獨稽核
- **WHEN** 開發者執行 `npm run check:a11y`
- **THEN** 輸出所有夾具的稽核結果且無違規時結束碼為 0
