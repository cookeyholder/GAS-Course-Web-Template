# maintainability-and-shared-logic Specification

## Purpose
定義前後端共用模組與單一登錄來源的維護原則，涵蓋正規化邏輯共用、GAS／Node 相依解析、死碼清理與工具鏈品質閘門，防止多處定義漂移。

## Requirements

### Requirement: 正規化單一事實來源與深度同構守衛
108 課綱 1NF 正規化的對照表、欄位索引常數與展開演算法 MUST 只有一份實作來源。後端與前端 MUST 引用同一份共用純 JS 模組（或由建置腳本從同一來源注入）。既有同構測試 MUST 升級為逐欄 `deepStrictEqual` 比對結果列，並逐一比對 7 張對照表與 `NORMALIZED_COURSE_HEADERS`，任何內容差異都必須讓測試失敗。

#### Scenario: 對照表內容漂移會被攔截
- **WHEN** 開發者只修改前端 `DEPARTMENT_CODE_NAMES` 中一筆對應值
- **THEN** 同構測試失敗並指出前後端對照表不一致

#### Scenario: 展開結果逐欄一致
- **WHEN** 前後端對同一來源資料執行正規化
- **THEN** `rows` 與 `stats` 以 `deepStrictEqual` 比對完全相同

### Requirement: 單一相依解析與環境相容層
後端 MUST 提供單一 `resolveDependency_`（依 module.exports → globalThis → fallback 順序）與單一 `getActiveSpreadsheetSafe_`，取代既有三套語意不一致的解析機制與重複的試算表取得判斷。Node 測試相容層 MUST 以白名單方式注入必要函式，不得使用 `Object.assign(globalThis, module)` 大量污染全域；模組載入失敗 MUST fail-fast 並輸出明確錯誤，不得以空 catch 吞掉。

#### Scenario: 載入相依失敗立即暴露
- **WHEN** `databaseInitializer.js` 載入失敗
- **THEN** `webApi.js` 在啟動時拋出含模組名稱的錯誤，而非執行期才出現 `ReferenceError`

#### Scenario: 不覆寫同名全域
- **WHEN** 測試檔事先定義與後端匯出同名的全域函式
- **THEN** 載入 `webApi.js` 不會靜默覆寫該全域

### Requirement: 死碼、重複函式與常數清理
未被呼叫的 `webApiSuccess`、`DEPARTMENT_CODES`、`DEPARTMENT_NAMES`、`safeTrim`、`generateUniqueId` MUST 移除或改為由既有對照表衍生；`getSystemConfigSheet_` 與 `getRequiredSystemConfigSheet_` MUST 合併為單一函式。角色名稱、工作表名稱與版本號 MUST 有單一來源，前端角色下拉選項 MUST 由設定產生而非硬編碼，版本號 MUST 由 `package.json` 注入。

#### Scenario: 工作表名稱只有一個定義來源
- **WHEN** 開發者修改正規化課程索引的工作表名稱
- **THEN** 初始化與匯入模組同時使用新名稱，不需兩處修改

#### Scenario: 版本號一致
- **WHEN** 讀取後端公開設定與前端 Header 顯示
- **THEN** 兩者版本號相同且與 `package.json` 一致

### Requirement: Action 單一登錄來源
所有 Web API action MUST 由單一 `ACTION_REGISTRY` 定義其 handler、是否公開、是否需要鎖、是否需要 CSRF、最低角色與 mock handler。`WEB_API_PUBLIC_ACTIONS`、`WEB_API_WRITE_ACTIONS`、`WEB_API_LOCKED_ACTIONS`、`ROLE_PERMISSIONS`、路由 switch 與 `mock.js` handler MUST 由該登錄來源產生或驗證。測試 MUST 確保每個 action 都有對應 mock handler。

#### Scenario: 新增 action 只需登錄一處
- **WHEN** 開發者在 registry 新增一個 action 與其 mock handler
- **THEN** 路由、權限、鎖與 CSRF 判定自動生效，不需修改多份清單

#### Scenario: mock 與真實後端 action 一致
- **WHEN** 執行 action 與 mock handler 一致性檢查
- **THEN** 沒有任何 action 僅存在於其中一邊

### Requirement: Mock 形狀一致與 State 測試覆蓋
Mock `getCourseIndex` MUST 接收並套用與後端相同的篩選與分頁參數，回應欄位的 `pageSize` 預設 MUST 與後端一致，且不得覆寫前端 state 的每頁筆數。`webapp/js/state.js` MUST 具備單元測試，覆蓋 setState 合併、無效 patch、listener 順序、listener 拋錯隔離與 unsubscribe。

#### Scenario: Mock 分頁與後端一致
- **WHEN** 在 mock 模式請求第 2 頁、每頁 30 筆
- **THEN** 回傳 `page: 2`、`pageSize: 30` 且 list 為對應分頁內容

#### Scenario: listener 拋錯不中斷其他 listener
- **WHEN** 第一個 listener 拋出例外
- **THEN** 後續 listener 仍被呼叫且 setState 不向外拋錯

### Requirement: 工具鏈與品質閘門改善
`npm run watch` MUST 先建置前端再執行 `clasp push --watch`。CI MUST 加入 JS class 存在於 CSS 的檢查、WCAG 對比檢查與建置產物一致性檢查。`checkChangedCoverage.js` 的 `getDiff` MUST 拆分以降低 CRAP 至 30 以下。前端 `auth.js` 六處僅有 `.then()` 的 API 呼叫 MUST 補 `.catch()`，並與後端一致地對登入網域執行小寫正規化。

#### Scenario: watch 不推送過期產物
- **WHEN** 開發者修改了 `webapp/js/` 後執行 `npm run watch`
- **THEN** 根目錄 `index.html` 先被重建，再推送至 GAS

#### Scenario: 網域大小寫一致
- **WHEN** 管理者設定 `@Example.EDU.TW`
- **THEN** 前後端正規化結果皆為 `example.edu.tw`
