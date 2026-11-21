# coverage-and-complexity-gates 規格變更

## MODIFIED Requirements

### Requirement: Complexity and maintainability gates MUST enforce CRAP and MI limits
專案 MUST 提供可重複執行的複雜度與可維護性分析，並強制執行以下門檻：每個納管函式之 CRAP 分數 **MUST NOT** 大於 30，且每個納管模組之 Maintainability Index **MUST** 大於或等於 50。分析範圍、排除項目與計算方法 MUST 文件化。

#### Scenario: CRAP 超過門檻時檢查失敗
- **WHEN** 任一納管函式的 CRAP 分數計算結果大於 30
- **THEN** 品質檢查 MUST 失敗並報告違規函式（含檔案位置與分數）

#### Scenario: MI 低於門檻時檢查失敗
- **WHEN** 任一納管模組的 Maintainability Index 小於 50
- **THEN** 品質檢查 MUST 失敗並報告違規模組（含檔案位置與分數）

#### Scenario: 報告提供可追蹤的量測依據
- **WHEN** 開發者或 CI 檢視複雜度檢查輸出
- **THEN** 輸出 MUST 包含足以定位問題之識別資訊與門檻比較結果，並可對應至專案定義之計算規則
