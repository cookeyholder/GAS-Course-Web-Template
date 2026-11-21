# maintainability-and-shared-logic Specification

## ADDED Requirements

### Requirement: 白名單帳號純查表與角色定義收斂
授權白名單查表邏輯 MUST 抽離為純函式（例如 `findAccountInWhitelist`），僅接收帳號陣列與目標電子郵件，回傳對應帳號物件或 `null`，禁止夾帶試算表 I/O，且對 `null`、`undefined` 或非字串之輸入具備安全容錯。`databaseInitializer.js` 頂層之角色正規化與顯示名稱取得函式 MUST 委派至 `systemConfigCodec.js` 單一事實來源，並保留模組匯出以維護全域注入與既有測試相容。通用陣列切片（`chunkArray`）與防衛過濾（`sanitizeFormulaValue`）MUST 實作為無外部副作用之純函式並收納於共用工具模組。

#### Scenario: 純查表精確匹配與大小寫不敏感
- **WHEN** 提供帳號物件陣列與大小寫混合或帶空白之電子郵件
- **THEN** `findAccountInWhitelist` 能自動 trim 並以不區分大小寫方式精確比對，回傳目標帳號物件，若不存在或輸入無效則回傳 `null`，且絕不拋出未捕捉例外

#### Scenario: 角色定義單一事實來源且相容匯出
- **WHEN** 檢查 `databaseInitializer.js` 與 `systemConfigCodec.js` 之原始碼與匯出
- **THEN** 角色核心邏輯僅定義於 `systemConfigCodec.js`，`databaseInitializer.js` 內部轉發呼叫並持續匯出 `normalizeRole` 與 `getRoleDisplayName`，既有依賴注入與單元測試正常通過

### Requirement: 前端表單驗證與狀態 Patch 不可變性
前端表單輸入之驗證邏輯 MUST 與 DOM 存取完全解耦，封裝為純驗證函式（例如 `validateNewAccountInput`），傳入輸入值與既有清單，回傳驗證結果與錯誤代碼，並隨模組外層匯出以利純單元測試。狀態更新物件 MUST 由純建構函式產生（例如 `buildImportSuccessPatch`），清單的增刪改查 MUST 採用不可變陣列轉換函式（如 `appendAccountToList`、`removeAccountFromList`、`toggleAccountInList`），嚴禁就地修改傳入之物件屬性（In-place Mutation）或直接竄改 state 內部陣列。匯入程序產生之 `importId` MUST 透過不可變 state patch 寫入狀態，確保重試時維持相同 ID 以觸發後端冪等快取。

#### Scenario: 帳號表單輸入純驗證
- **WHEN** 傳入格式不正確或重複之 Email
- **THEN** 純驗證函式在不存取任何 DOM 元素的情況下回傳包含具體錯誤代碼之失敗結果

#### Scenario: 匯入完成狀態 Patch 不可變性與冪等 ID 保留
- **WHEN** 匯入完成或重試時處理狀態更新
- **THEN** 產生全新更新物件，原上傳或解析物件維持原貌不被竄改，且狀態中之 `importId` 被妥善保存以支援冪等重試

### Requirement: 前端安全錯誤代碼轉譯與字典擴充
前端安全錯誤轉譯模組 `resolveSafeMessage` MUST 支援可選之代碼字典注入（例如 `resolveSafeMessage(value, fallback, codeMap)`）。當提供 `codeMap` 且輸入之錯誤包含已定義之錯誤代碼或字串鍵值時，MUST 優先回傳字典對應之安全繁體中文文案；若字典未命中或未提供字典，MUST 嚴格保持既有之已知安全訊息匹配與未知例外字串遮蔽行為，確保系統不洩漏內部除錯堆疊或敏感訊息。

#### Scenario: 注入字典優先轉譯
- **WHEN** 傳入包含已知錯誤代碼（如 `account_duplicate`）之例外物件與專屬 `codeMap`
- **THEN** 函式回傳 `codeMap` 中對應之自訂中文提示訊息

#### Scenario: 字典未命中時維持既有遮蔽防護
- **WHEN** 傳入未登錄於字典且非後端安全訊息之任意字串或例外
- **THEN** 函式忽略未識別文字並安全回傳指定之 `fallback` 備援文案
