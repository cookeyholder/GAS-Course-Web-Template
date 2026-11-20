## MODIFIED Requirements

### Requirement: 單一相依解析與環境相容層
後端 MUST 提供單一 `resolveDependency_`（依 `module.exports → globalThis → fallback` 順序）與單一 `getActiveSpreadsheetSafe_`，取代既有三套語意不一致的解析機制與重複的試算表取得判斷。所有模組 MUST 共用該單一解析入口；`getOverridableApiFn_`、`resolveActivityLogModule_`、`resolveRouteDependency_`（重複版本）、`resolveDbFn_` 等自建解析 MUST 移除或改為轉發至單一入口。單一解析入口 MUST 接受可選的 overrides 參數，以保留 Node 測試以 `module.exports[name]` 注入 stub 的既有接縫。Node 測試相容層 MUST 以白名單方式注入必要函式，不得使用 `Object.assign(globalThis, module)` 大量污染全域；模組載入失敗 MUST fail-fast 並輸出含模組名稱的明確錯誤，不得以空 catch 吞掉。`injectGlobals_` 在全域已有同名函式時 MUST NOT 覆寫，且注入清單 MUST 僅包含實際被呼叫的函式；檢查 MUST 為雙向：每個注入名稱至少被呼叫一次，且每個被呼叫的外部注入函式皆已注入。

#### Scenario: 載入相依失敗立即暴露
- **WHEN** `databaseInitializer.js` 載入失敗
- **THEN** `webApi.js` 在啟動時拋出含模組名稱的錯誤，而非執行期才出現 `ReferenceError`

#### Scenario: 不覆寫同名全域
- **WHEN** 測試檔事先定義與後端匯出同名的全域函式
- **THEN** 載入 `webApi.js` 不會靜默覆寫該全域，且既有全域函式保持原值

#### Scenario: 只有單一解析入口
- **WHEN** 靜態掃描後端原始碼中自訂的相依解析或全域注入函式
- **THEN** 僅存在 `gasRuntime.resolveDependency_` 與 `gasRuntime.injectGlobals_` 兩個入口，其餘模組無重複自建解析器

#### Scenario: 解析順序保留測試接縫
- **WHEN** 同一名稱同時存在於 `module.exports` 覆寫與 `globalThis` 全域
- **THEN** `resolveDependency_` 優先回傳 `module.exports` 的覆寫值，既有以 `api[key] = stub` 注入的測試維持通過

#### Scenario: 全域注入無死注入
- **WHEN** 檢查 `webApi.js` 的注入白名單與其函式呼叫
- **THEN** 白名單中每一個名稱在該檔案內至少被呼叫一次，且該檔案呼叫的每一個外部注入函式皆在白名單中；`initializeDatabaseSheets`、`safeApplySheetFontSize`、`safeSetNumberFormat`、`sanitizeRowMatrix` 不在清單內

### Requirement: 死碼、重複函式與常數清理
下列清理已於現況完成，本變更 MUST 維持並新增回歸測試防止回退：`webApiSuccess`、`DEPARTMENT_CODES`、`DEPARTMENT_NAMES`、`safeTrim`、`generateUniqueId` 已移除，`getRequiredSystemConfigSheet_` 已合併，`subjectCodeTransformer.js` 的 `resolveRouteDependency_` 已轉發單一入口，前端角色下拉已由設定產生。本變更另須移除 `gasRuntime.getRuntime_`、活動日誌 cache 三兄弟（`ACTIVITY_LOG_CACHE_PREFIX`、`ACTIVITY_LOG_MEMORY_STORE`、`getActivityLogCache_`）、`courseNormalizationShared.js` 的空排除名單分支，並將下列重複定義收斂為單一來源：12 欄操作日誌 schema（含中文表頭、英文欄位與索引對應）、最小合法日誌 JSON 常數、`ACTIVITY_DETAIL_MAX_LENGTH`、網域正規化規則、`getActiveSpreadsheetSafe_` 的試算表取得判斷。角色名稱、工作表名稱與版本號 MUST 有單一來源；角色代碼由 `gasRuntime.ROLE_CODES` 定義，其餘模組衍生。版本號 MUST 由 `package.json` 注入：`package.json` 升級至 `1.1.0`、`gasRuntime.WEB_API_VERSION` 維持 `1.1.0` 做為退回值，建置流程同時注入前端全域常數與後端可讀取來源，`getPublicConfig` 回傳值維持 `1.1.0`。文件所述的行為 MUST 與實作一致；已移除的取樣機制描述 MUST 同步更新。

#### Scenario: 工作表名稱只有一個定義來源
- **WHEN** 開發者修改正規化課程代碼的工作表名稱
- **THEN** 初始化與匯入模組同時使用新名稱，不需兩處修改

#### Scenario: 版本號一致
- **WHEN** 讀取後端公開設定與前端 Header 顯示
- **THEN** 兩者版本號相同且皆為 `1.1.0`，並與 `package.json` 一致；建置流程確實從 `package.json` 注入前端與後端來源

#### Scenario: 日誌 schema 只有一份定義
- **WHEN** 檢查工作表建立、日誌寫入、詳情產生與日誌查詢所使用欄位定義 source code
- **THEN** 四者引用同一個含中文表頭、英文欄位與索引的 schema 來源，欄位增減只需修改一處，不出現重複的欄位陣列或 `cells[0..11]` 硬編碼

#### Scenario: 無殘留死碼
- **WHEN** 執行死碼掃描
- **THEN** 本要求列舉之死碼與空分支皆不存在，且文件不再描述已移除的取樣機制

#### Scenario: 已完成清理維持不回退
- **WHEN** 掃描前述已完成的清理項目
- **THEN** 相關死碼與重複定義未重新出現，且有回歸測試保護

### Requirement: Action 單一登錄來源
所有 Web API action MUST 由單一 `ACTION_REGISTRY` 定義其 handler、是否公開、是否需要鎖、是否需要 CSRF、最低角色與 mock handler。`WEB_API_PUBLIC_ACTIONS`、`WEB_API_WRITE_ACTIONS`、`WEB_API_LOCKED_ACTIONS`、`ROLE_PERMISSIONS`、路由 switch 與 `mock.js` handler MUST 由該登錄來源產生或驗證。測試 MUST 確保每個 action 都有對應 mock handler。`doGet` 的 action 白名單 MUST 由明確登錄的 `doGet: true` 旗標衍生，不得由 `public: true` 自動放行；不寫入日誌的排除清單 MUST 由 `logEnabled === false` 衍生；需補寫登入身份的動作清單 MUST 由 `backfillIdentity: true` 旗標衍生，並驗證該旗標僅能標記於公開且 `logEnabled: true` 的登入動作。handler 內的角色的檢查 MUST 引用 registry 的角色定義；角色判定 MUST 由單一 `isActionAllowed(role, action)` 提供並取代既有 `isRoleAllowed`，兩者不得並存，亦不得再次硬編碼 `"admin"`。

#### Scenario: 新增 action 只需登錄一處
- **WHEN** 開發者在 registry 新增一個 action 與其 mock handler
- **THEN** 路由、權限、鎖與 CSRF 判定自動生效，不需修改多份清單

#### Scenario: mock 與真實後端 action 一致
- **WHEN** 執行 action 與 mock handler 一致性檢查
- **THEN** 沒有任何 action 僅存在於其中一邊

#### Scenario: 特殊清單由 registry 衍生
- **WHEN** 檢查 `doGet` 白名單、日誌排除清單與登入身份補寫清單
- **THEN** 三者皆由 `ACTION_REGISTRY` 的明確旗標或衍生函式取得，原始碼中不出現獨立宣告的 action 名稱字面清單

#### Scenario: 公開 action 不自動取得 GET 權限
- **WHEN** 登錄一個新的公開 action 但未標記 `doGet: true`
- **THEN** 該 action 不出現在 `doGet` 白名單中

#### Scenario: 角色判定只有一個入口
- **WHEN** 檢查後端與前端的角色守門實作
- **THEN** 僅存在 `isActionAllowed` 一個判定入口，`isRoleAllowed` 已移除，且無硬編碼角色字串

## ADDED Requirements

### Requirement: 後端模組不得形成循環相依
後端模組的相依圖 MUST 為有向無環圖（DAG）。具體而言，`databaseInitializer.js`、`activityLogger.js` 與 `activityLogBuilders.js` 之間不得存在循環：`activityLogBuilders` 需要讀取系統設定或白名單快照時，MUST 由呼叫端以參數注入快照提供者純函式，而非自行解析並載入 `databaseInitializer` 或 `gasRuntime`。提供者讀取失敗時 MUST 降級為最小合法 JSON 日誌詳情，不得阻斷主流程。稽核測試 MUST 同時載入完整相依鏈並能偵測循環；僅單獨載入單一模組的測試不得被視為無循環的證明。

#### Scenario: 相依圖無環
- **WHEN** 以靜態或執行期方式分析後端模組的 require／resolveDependency 關係
- **THEN** 不存在任何從某模組出發回到該模組的相依路徑，特別是初始化、寫日誌與產生詳情三者之間

#### Scenario: 獨立性測試涵蓋完整相依鏈
- **WHEN** 執行模組獨立性測試
- **THEN** 測試確實載入並驗證初始化、寫日誌與詳情產生三個模組之間的相依方向，且能因人為匯入循環而失敗

#### Scenario: 快照提供者失敗不阻斷
- **WHEN** 注入的快照提供者讀取系統設定或白名單時拋出錯誤
- **THEN** 日誌詳情降級為最小合法 JSON，請求主流程不受影響

### Requirement: 請求處理與稽核上層模組須職責單一
Web API 進入點模組 MUST 僅負責 HTTP 進入與請求編排，不得同時承擔操作日誌查詢或日誌寫入攔截。操作日誌查詢與寫入攔截 MUST 由各自獨立的模組承擔，並在進入點保留 facade 匯出做向後相容轉發。寫入鎖的取得與釋放 MUST 由單一共用 helper 處理，helper 合約 MUST 支援可選 `lockService` 注入、`skipLock` 與 `onLockFailure`，並保留「先釋放鎖再寫日誌」的既有順序與 `lock_timeout` 錯誤碼。OAuth 交換與商務 action handler 的拆分不在本變更範圍，列為未來變更。函式層級 MUST 避免單一函式同時橫跨超過一個職責邊界（例如建立工作階段同時寫入首位管理員），此類跨職責寫入 MUST 以明確旗標或獨立函式區隔。

#### Scenario: 進入點模組職責收斂
- **WHEN** 檢視 Web API 進入點模組的原始碼
- **THEN** 該模組不包含日誌查詢的日期解析、分頁、排序與工作表掃描邏輯，也不包含日誌攔截的詳情產生邏輯；既有匯出仍可轉發至新模組

#### Scenario: 鎖 helper 單一化
- **WHEN** 搜尋後端取得指令碼鎖與釋放鎖的實作
- **THEN** 僅存在單一共用 helper，其餘寫入路徑均呼叫該 helper，不再出現重複的 tryLock／releaseLock 模板，且解鎖先於寫日誌

### Requirement: 前端事件綁定與依賴注入須降低全域耦合
前端模組 MUST NOT 在 HTML 字串中使用 inline `MEA.*` 事件處理器；所有事件 MUST 透過 `addEventListener` 搭配 data-attribute 綁定，並具備重複渲染時的冪等守衛。守衛 MUST 使用單一集合（例如 `Symbol.for("mea.bindings")`）記錄已綁定元素，不得讓各模組各自建立全文件布林旗標。各模組的工廠函式 MUST 接收完成該職責所需的最小介面（至少含 `api`、`state`、`ui`、`auth` 中實際使用者，並可包含設定、安全錯誤轉譯與導航函式 `setTab`／`renderNavbar`），不得直接接收整個 `MEA` 包裹；模組組裝 MUST 集中於單一獨立且最後載入的進入檔案。列表查詢、搜尋、重設與分頁的控制流程在多個頁面重複時 MUST 抽取為共用控制器，並納入請求序號競態防護。含有特殊字元的資料（例如 Email）改為 data-attribute 時 MUST 經 HTML 跳脫後寫入。直接斷言 inline 事件字串的既有測試 MUST 同步改寫為驗證 data-attribute 或觸發事件。

#### Scenario: 無 inline 事件字串
- **WHEN** 掃描 `webapp/js/**/*.js` 的 HTML 產生字串
- **THEN** 不存在任何 `onclick`、`onchange`、`ondragover` 等 attr 直接參考 `MEA.` 的事件處理器

#### Scenario: 最小介面注入
- **WHEN** 檢查各模組工廠函式的依賴參數
- **THEN** 參數為所需功能的明確集合，而非單一 `MEA` 全域包裹；組裝集中在單一檔案，且不再使用 `invoke(...)` 服務定位器

#### Scenario: 事件重複綁定冪等
- **WHEN** 同一畫面因狀態更新而多次重新渲染
- **THEN** 事件處理器只綁定一次，不產生重複觸發，且鍵盤與滑鼠操作皆維持原有行為；鍵盤委派需以 selector 比對目標，避免在其他輸入框按空白鍵誤觸
