# coverage-and-complexity-gates 規格變更

## MODIFIED Requirements

### Requirement: Global coverage MUST meet project thresholds and non-regression policy
專案 MUST 定義並強制執行全域測試覆蓋率門檻與不回退政策；門檻值與基準線 SHALL 可追溯且文件化。初始門檻設定為 Lines >= 60%、Statements >= 30%、Functions >= 60%、Branches >= 60%，後續 MUST 支援逐步收斂（ratchet）且不得在未經提案/文件更新下任意放寬。

#### Scenario: 全域覆蓋率低於門檻或回退時檢查失敗
- **WHEN** 量測結果顯示任一納管覆蓋率維度低於當前生效門檻（Lines < 60% 或 Branches < 60%）或低於已記錄之基準線
- **THEN** 覆蓋率檢查 MUST 以失敗狀態結束並指出未達標或回退之維度與數值

#### Scenario: 門檻與基準線具文件化依據
- **WHEN** 維護者檢視品質設定與文件
- **THEN** 專案 MUST 提供當前門檻值（Lines 60%、Branches 60%）、基準線、計算範圍與調整原則之可追溯說明

### Requirement: Changed code coverage MUST satisfy differential threshold
專案 MUST 提供變更覆蓋率（diff/changed coverage）檢查，針對相對於指定基準分支或比較範圍之變更程式碼行與分支（或等效可執行單位）強制執行不低於專案定義門檻之覆蓋要求：變更行覆蓋率（Lines）MUST >= 80%，變更分支覆蓋率（Branches）MUST >= 80%。

#### Scenario: 變更程式碼覆蓋率不足時阻擋通過
- **WHEN** CI 或本機執行變更覆蓋率檢查且變更範圍內 Lines < 80% 或 Branches < 80%
- **THEN** 檢查 MUST 失敗並列出未達標之檔案或區段摘要資訊

#### Scenario: 無可量測變更時具明確處理結果
- **WHEN** 比較範圍內不存在需計入變更覆蓋率的可量測程式碼變更
- **THEN** 檢查 MUST 以明確且一致的成功或略過結果回報，不得產生誤判失敗

### Requirement: Complexity and maintainability gates MUST enforce CRAP and MI limits
專案 MUST 提供可重複執行的複雜度與可維護性分析，並強制執行以下門檻：每個納管函式之 CRAP 分數 **MUST NOT** 大於 25，且每個納管模組之 Maintainability Index **MUST** 大於或等於 50。分析範圍、排除項目與計算方法 MUST 文件化。

#### Scenario: CRAP 超過門檻時檢查失敗
- **WHEN** 任一納管函式的 CRAP 分數計算結果大於 25
- **THEN** 品質檢查 MUST 失敗並報告違規函式（含檔案位置與分數）

#### Scenario: MI 低於門檻時檢查失敗
- **WHEN** 任一納管模組的 Maintainability Index 小於 50
- **THEN** 品質檢查 MUST 失敗並報告違規模組（含檔案位置與分數）

#### Scenario: 報告提供可追蹤的量測依據
- **WHEN** 開發者或 CI 檢視複雜度檢查輸出
- **THEN** 輸出 MUST 包含足以定位問題之識別資訊與門檻比較結果，並可對應至專案定義之計算規則
