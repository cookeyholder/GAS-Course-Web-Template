## Purpose

定義本專案提交前品質防線（Husky + lint-staged）之安裝、執行範圍與行為契約，確保 **程式碼格式化（Prettier）** 與基礎規範檢查可在本機提交前自動執行且與 CI 規則一致。

## ADDED Requirements

### Requirement: Pre-commit hook installation MUST be reproducible
專案 MUST 提供可重現的 Git hook 安裝機制，使開發者在安裝相依套件後可自動或依文件指令啟用 Husky pre-commit hook；CI 與一般使用者環境不得因缺少互動設定而產生不可預期失敗。

#### Scenario: 安裝相依套件後可啟用 hook
- **WHEN** 開發者在乾淨工作環境執行專案定義的相依套件安裝流程
- **THEN** Husky hook 目錄與 pre-commit 設定 MUST 可用或可依文件化指令完成啟用，且後續 `git commit` 能觸發已設定之檢查

#### Scenario: 非互動環境不應誤觸發破壞性流程
- **WHEN** 相依套件安裝於 CI 或非互動環境執行
- **THEN** 安裝流程 MUST NOT 因 hook 初始化而失敗，且不得要求人工互動輸入

### Requirement: Pre-commit MUST format staged files with Prettier
pre-commit hook MUST 對符合規則的暫存檔執行 Prettier 格式化，以確保提交內容符合專案格式標準；可自動修正之格式差異 MUST 被套用並反映於提交結果（或暫存區），無法完成時 MUST 阻擋提交。

#### Scenario: 暫存檔格式不符時自動格式化
- **WHEN** 開發者提交含有不符合 Prettier 規則的暫存檔
- **THEN** pre-commit 流程 MUST 對可自動修正檔案執行格式化並更新暫存結果，使提交內容符合格式規範；若因錯誤無法完成則以非零狀態中止提交並顯示可理解訊息

#### Scenario: 已符合格式之檔案不產生不必要變更
- **WHEN** 暫存檔已符合 Prettier 規則
- **THEN** pre-commit 流程 MUST NOT 對該檔案內容產生無意義的格式變更

### Requirement: Pre-commit MUST validate staged changes against language policy when configured
pre-commit hook MUST 依專案設定對暫存檔執行適用之語言規範檢查（或等效快篩），以降低違反臺灣繁體中文與用語規範之內容進入版本庫的機率。

#### Scenario: 語言規範違規時阻擋提交
- **WHEN** 暫存檔內容違反專案語言規範檢查規則且該檢查納入 pre-commit 範圍
- **THEN** pre-commit 流程 MUST 以失敗狀態中止提交並指出違規檔案或規則資訊

### Requirement: Hook scope MUST align with repository tooling policy
lint-staged 與 hook 設定 MUST 僅涵蓋適合在提交前處理之檔案類型與路徑，並排除建置產物、第三方/二進位或明確忽略之內容，以避免誤改或不必要的提交延遲。

#### Scenario: 建置產物與忽略檔不被 hook 誤處理
- **WHEN** 工作目錄存在建置產物或被忽略檔案且未納入暫存之可檢查來源
- **THEN** pre-commit 流程 MUST NOT 修改這些檔案，且僅針對符合規則的暫存檔執行檢查

### Requirement: Developer documentation MUST describe hook behavior
專案文件 MUST 說明 pre-commit/lint-staged 的用途、安裝方式、常用指令、失敗時處理方式與（若允許）受控的略過機制注意事項，使開發流程可被新成員理解與遵循。

#### Scenario: 文件提供可操作指引
- **WHEN** 開發者查閱專案開發流程文件
- **THEN** 文件 MUST 包含啟用 hook、手動執行格式/檢查、提交失敗排錯與 CI 關聯說明
