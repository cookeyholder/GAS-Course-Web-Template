## ADDED Requirements

### Requirement: 大型對照字典緊湊型字串架構與載入快取
前後端共用模組（`courseNormalizationShared.js` 與 `subjectCodeTransformer.js`）中超過 50 筆項目之大型靜態對照字典，MUST 優先採用管道符號（`|`）與冒號（`:`）分隔之緊湊型字串（Compact Pipe-Separated String）進行宣告，並由純函式於模組載入期立即反序列化並快取（Eager IIFE Memoization），維持標準鍵值物件查詢效能與相容性。此架構 SHALL 降低語法樹（AST）節點數量與程式碼體積，確保全專案所有納管模組之維護性指數（Maintainability Index, MI）維持在 $\ge 50$（且不低於既有品質基準線 83.666）。

#### Scenario: 緊湊字串解析與字典查詢完全一致
- **WHEN** 模組初始化並載入緊湊格式之對照字典
- **THEN** 反序列化產生之物件與標準鍵值字典功能完全一致，單元測試逐筆驗證通過，且模組之維護性指數 MI 大於或等於 50 且不低於基準線 83.666
