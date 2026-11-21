## Context

專案目前遵循「函式核心、命令外殼（Functional Core, Imperative Shell）」的架構演進方向，在先前重構中已成功將系統設定（區塊 A）與授權白名單（區塊 B）的資料讀寫抽出為純轉換模組 `systemConfigCodec.js`。
然而，在核心課程代碼檢索（`subjectCodeTransformer.js`）、資料庫初始化管理（`databaseInitializer.js`）、通用工具（`utilities.js`）、前端檔案匯入流程（`webapp/js/imports.js`）、前端帳號管理（`webapp/js/accounts.js`）以及錯誤訊息轉譯（`webapp/js/errorMessages.js`）中，仍存在下列問題：
1. **資料檢索與試算表 I/O 耦合**：`getNormalizedCourses` 內部直接從試算表讀取二維矩陣並同時進行條件過濾、索引比對與分頁映射，導致無法進行純陣列的單元測試。
2. **重複定義與全域注入相依**：`databaseInitializer.js` 保留了早期定義的 `normalizeRole`、`getRoleDisplayName`、`normalizeLowerTrim_`；白名單查表邏輯混在主流程中。此外，`webApi.js` 在 Node.js 環境高度依賴這些匯出以完成 `injectGlobals_`，不可貿然刪除匯出。
3. **物件就地突變（In-place Mutation）與冪等快取風險**：`webapp/js/imports.js` 在發送匯入請求前，直接將生成的 `importId` 賦值至傳入的 `entry` 物件（`entry.importId = ...`），既破壞不可變性，又缺乏明確的狀態流規範來保證重試時的冪等識別碼一致性。
4. **前端表單驗證混雜 DOM 與狀態**：`webapp/js/accounts.js` 的 `handleAddAccountClick` 同時處理 DOM 讀取、Email 格式驗證、重複比對、API 呼叫與狀態更新，缺乏可獨立單元測試的純函式。
5. **錯誤代碼轉譯彈性不足**：`webapp/js/errorMessages.js` 的 `resolveSafeMessage` 僅能匹配後端 `safeMessage` 欄位或硬編碼白名單，各前端模組若有特定錯誤代碼轉譯需求易演變為私有備援邏輯。

## Goals / Non-Goals

**Goals:**
- **純函式核心**：將後端課程二維矩陣檢索運算抽出為 `queryCourseDataRows(dataRows, filter)`，精確區隔無資料（totalPages 0）與查無結果（totalPages 1），達到 100% 零 Mock 純資料單元測試能力。
- **單一事實來源與相容委派**：在 `systemConfigCodec.js` 實作白名單純查表函式 `findAccountInWhitelist`；`databaseInitializer.js` 消除重複實作改採委派模式，並完整保留模組匯出以維護全域注入與既有單元測試相容。
- **通用工具獨立化**：在 `utilities.js` 實作通用純函式 `chunkArray`，並以編譯好的常數正則表達式簡化 `sanitizeFormulaValue`。
- **狀態不可變性與冪等防護**：前端匯入流程抽出 `generateImportId` 與 `buildImportSuccessPatch`，透過不可變 state patch 儲存 `importId` 以確保重試冪等性快取不失效。
- **零 DOM 驗證與不可變陣列操作**：前端帳號輸入驗證抽出為純函式 `validateNewAccountInput`，陣列增刪改抽為純函式並隨外層模組匯出，支援零 DOM 純單元測試。
- **可擴充之安全錯誤轉譯**：擴充 `resolveSafeMessage` 支援代碼字典注入，確保優先轉譯專屬代碼同時維持未識別例外之安全遮蔽。
- **100% 向後相容**：維持所有 Web API Action 合約、參數形狀與前端介面行為不變。

**Non-Goals:**
- 不變更 Web API 通訊協議（仍維持 `Content-Type: text/plain;charset=utf-8` 與 JSON payload）。
- 不更動現有資料庫工作表架構（4 張工作表欄位結構維持原樣）。
- 本重構不更動 `webapp/js/courses.js`，亦不包含「教師基本資料模組」的新增功能，該功能待本變更封存後另啟 OpenSpec 提案。

## Decisions

### 1. 後端課程檢索分層（Functional Core vs Imperative Shell）

- **決策**：在 `subjectCodeTransformer.js` 抽出純函式 `queryCourseDataRows(dataRows, filter)`，負責所有純運算：
  - 輸入防衛與正規化（處理 `null`、`undefined`、非陣列情況，若無有效列回傳 `total: 0, totalPages: 0, list: []`）。
  - 欄位索引過濾與關鍵字模糊比對（`isCourseIndexRowMatched_`）。
  - 滿足條件列之索引收集（若有資料列但無吻合結果，回傳 `total: 0, totalPages: 1, list: []`）。
  - 延遲分頁切割與 14 欄物件映射（`buildPagedCourseResultFromIndexes_`）。
- **外殼職責**：`getNormalizedCourses` 僅保留兩項 I/O 操作：
  1. 呼叫 `getCourseIndexSheetSafe_()` 取得工作表並透過 `sheet.getDataRange().getValues()` 讀取二維矩陣。
  2. 將矩陣傳入 `queryCourseDataRows` 取得結果並回傳。

### 2. 資料庫初始化模組消除重複與委派重匯出（Delegation & Single Source of Truth）

- **決策**：
  - 在 `systemConfigCodec.js` 定義純查表函式 `findAccountInWhitelist(accounts, email)`，具備安全小寫與前後空白修剪容錯。
  - `databaseInitializer.js` 的 `getAccountRole` 委派呼叫 `findAccountInWhitelist`，並精確組裝既有包含 `found: true/false`、`role`、`roleName`、`enabled`、`name` 之標準領域物件，杜絕白名單授權漏洞。
  - `databaseInitializer.js` 的 `normalizeRole` 與 `getRoleDisplayName` 內部實作改為直接轉發呼叫 `systemConfigCodec.js`，**並完整維持模組與全域匯出**，確保 `webApi.js` 之 `injectGlobals_` 與現有單元測試（如 `cleanupSingleSource.test.js`）零回退。

### 3. 通用切片與公式防衛簡化收納於工具模組

- **決策**：
  - 在通用純工具模組 `utilities.js` 實作純函式 `chunkArray(array, chunkSize)`，並於 `subjectCodeTransformer.js` 引用且轉發匯出，供課綱寫入與未來批次作業共用。
  - 簡化 `utilities.js` 中的 `sanitizeFormulaValue`，以常數正則表達式 `/^[+=@\t\r-]/` 進行前綴檢測，完整涵蓋常見公式開頭與定位/換行字元，兼顧 O(1) 效能與程式碼簡潔性。

### 4. 前端匯入狀態不可變性與冪等識別碼保護

- **決策**：
  - 統一命名為 `generateImportId()` 與 `buildImportSuccessPatch(entry, result)`。
  - 在 `webapp/js/imports.js` 的 `doImport` 流程中：
    1. 若當前 `entry` 未具備 `importId`，透過 `generateImportId()` 產生新識別碼。
    2. 透過不可變方式以 `MEA.state.imports.map(...)` 將包含該 `importId` 的更新副本寫回狀態，嚴禁就地執行 `entry.importId = ...`。
    3. 發送 API 請求時使用該不可變物件上的 `importId`。當發生逾時或網路錯誤時，使用者點擊重試將自然沿用既有之 `importId`，確保後端冪等快取保護機制穩定觸發。

### 5. 前端表單驗證與陣列操作純化及外層匯出

- **決策**：
  - 在 `webapp/js/accounts.js` 檔案頂層定義純驗證函式 `validateNewAccountInput({ email, role, enabled }, existingAccounts)`，回傳 `{ valid: boolean, errorCode?: string }`。
  - 抽出陣列操作純函式：
    - `appendAccountToList(accounts, newAccount)`
    - `removeAccountFromList(accounts, email)`
    - `toggleAccountInList(accounts, email)`
  - **外層匯出**：模組外層 IIFE 回傳物件包含 `{ createAccountsModule, validateNewAccountInput, appendAccountToList, removeAccountFromList, toggleAccountInList }`，使 Node.js 單元測試可直接 `require("./accounts.js").validateNewAccountInput` 進行零 DOM、零工廠實例化純測試。

### 6. 安全錯誤代碼轉譯字典擴充

- **決策**：
  - 在 `webapp/js/errorMessages.js` 擴充簽名為 `resolveSafeMessage(value, fallback, codeMap = null)`。
  - 判定優先權：
    1. 若傳入有效之 `codeMap` 且匹配到對應代碼，優先回傳字典定義之中文提示。
    2. 若未匹配字典，則依循既有安全邏輯（匹配已識別之後端安全訊息）。
    3. 若皆未命中且輸入為未識別例外或字串，一律安全回傳 `fallback`，絕不外顯原始未知例外。

## Risks / Trade-offs

- **[Risk] 純函式拆分導致既有後端相依注入（Stub）失效**
  - → **Mitigation**: `subjectCodeTransformer.js` 與 `databaseInitializer.js` 完整保留所有原有匯出名稱，既有 API 測試與整合測試無需修改即可平滑運作。
- **[Risk] 前端打包後的內嵌順序受影響**
  - → **Mitigation**: 新增純函式皆定義在各自模組內部並隨外層物件匯出，不更動檔案載入順序與 HTML 結構。
- **[Risk] 重試匯入時冪等快取失效**
  - → **Mitigation**: 透過不可變 state patch 提前將 `generateImportId()` 寫入狀態陣列，保證重試時沿用同一個 ID。
- **[Risk] 覆蓋率門檻受新程式碼影響**
  - → **Mitigation**: 為所有抽出的純函式編寫專屬單元測試，達成 100% 分支覆蓋率，帶動專案整體品質指標向上 ratchet。
