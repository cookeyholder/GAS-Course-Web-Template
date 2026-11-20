# 任務清單（4 批交付）

> 本變更分為 4 批 Pull Request：批次 A（任務 1–4，安全網與後端相依拆分）、批次 B（任務 5，單一來源收斂）、批次 C（任務 6–7，前端解耦與死碼清理）、批次 D（任務 8–9，基準更新與最終回歸）。每批皆為行為不變重構，可獨立驗證與部署；任務編號維持不變以便與 proposal／design／specs 交互參照。

## 批次 A：安全網與後端相依拆分（任務 1–4）

### 批次 A 驗收

- `npm test`、`npm run build:webapp`、`npm run check:changed-coverage`、`openspec validate refactor-cohesion-and-coupling --strict` 全數通過。
- 相依圖測試顯示後端模組無環；`webApi.js` 不再包含 `_rowIndex`、日期區間解析、詳情產生與日誌工作表寫入；`tryLock` 模板僅剩一處。
- 新增後端模組未被 `.claspignore` 排除，並隨 `npm run push` 上傳。

### 1. 建立安全網與相依分析基線

- [x] 1.1 建立後端相依圖快照測試：新增 `tests/moduleDependencyGraph.test.js`，以靜態掃描 `require()` 與 `resolveDependency_` 呼叫列出後端模組相依邊，驗證目前三節點環（`databaseInitializer → activityLogger → activityLogBuilders → databaseInitializer`）被正確偵測；並加入「人為注入一條環時測試必須失敗」的反向斷言。驗證：`node tests/moduleDependencyGraph.test.js` 通過，且注入人造環時結束碼為失敗。
- [x] 1.2 補上 OpenSpec 既有但缺失的「不覆寫同名全域」測試：紅燈測試先置於 `scripts/fixtures/gasRuntimeNoOverwrite.fixture.js`（檔名不以 `.test.js` 結尾，`scripts/run-tests.js` 只探索 `tests/**/*.test.js`，故不影響 `npm test`）。測試先定義與後端匯出同名的全域函式，再載入 `webApi.js`，證明目前會覆寫；3.3 完成後搬入 `tests/gasRuntime.test.js` 並轉為綠燈。驗證：1.2 完成至 3.3 完成期間 `npm test` 保持全綠，3.3 後該測試轉綠。
- [x] 1.3 記錄重構前量測基線與 golden snapshot：執行 `npm run check:complexity` 與 `npm run test:coverage`，記錄 `reports/quality/complexity.json` 與 `coverage/coverage-summary.json` 的量測值作為方向性 ratchet 的「既有值」（現行參考值：CRAP 最高 30、超標 0、MI 最低 83.666；覆蓋率 94.75／94.75／92.15／83.67；實際以執行結果為準）；另擷取代表性請求的日誌 golden snapshot 供 4.2 比對。驗證：兩指令結束碼為 0，報告檔存在且數值已記錄於本任務備註。
  - 量測結果（2026-11-20、Node v24.22.3）：CRAP 最高 30（超標 0）、MI 最低 83.666；覆蓋率 Lines 94.8%／Statements 94.8%／Functions 92.15%／Branches 83.79%。完整紀錄見 `measurement-baseline-before-refactor.md`。
  - Golden snapshot：`scripts/captureGoldenLogSnapshot.js` 產生 `golden-log-snapshot.json`，7 個代表性請求、5 筆日誌，重複執行結果一致。

### 2. 打斷三節點循環相依（改善 1）

- [x] 2.1 重構 `activityLogBuilders.js` 的快照取得：移除 `resolveDbFn_()`，改讓 `captureBefore(detailKey, ss, snapshotProvider)` 接受由呼叫端傳入的 `readSystemSettings`／`readWhitelist` 純函式提供者；提供者讀取失敗時降級為最小合法 JSON，不阻斷主流程。驗證：`node tests/activityLogBuilders.test.js` 與 `node tests/activityLogBuildersBranchCoverage.test.js` 通過，且檔案內不再出現 `require("./databaseInitializer.js")` 與 `require("./gasRuntime.js")`。
- [x] 2.2 調整呼叫端注入：在 `webApi.js` 建立 log context 處（原 `:1423`）傳入已解析的系統設定與白名單讀取函式，確保 `captureBefore` 取得相同資料來源。驗證：`npm test` 全數通過，特別是 `tests/activityLogModuleIndependence.test.js`、`tests/webApiActivityLog.test.js`、`tests/webApiActivityLogBranchCoverage.test.js`。
- [x] 2.3 修正假驗證的獨立性測試：改寫 `tests/activityLogModuleIndependence.test.js`，在單一全新行程中載入 `databaseInitializer → activityLogger → activityLogBuilders` 完整鏈並驗證相依方向，且能因人為注入的循環而失敗；補上提供者失敗降級的測試案例。驗證：`node tests/activityLogModuleIndependence.test.js` 通過，且 1.1 的相依圖測試顯示無環。

### 3. 合併相依解析機制（改善 3）

- [x] 3.1 統一解析入口：刪除 `webApi.js` 的 `getOverridableApiFn_` 與 `resolveActivityLogModule_`，全部改呼叫 `GAS_RUNTIME.resolveDependency_`；解析順序明確為 `module.exports → globalThis → fallback` 並接受可選 overrides 參數，保留以 `api[key] = stub` 注入的測試接縫；移除空 catch，載入失敗時 fail-fast 並拋出含模組名稱的錯誤。`subjectCodeTransformer.js` 已轉發單一入口者維持並補回歸測試。驗證：grep 確認僅剩 `gasRuntime.resolveDependency_` 一個解析實作，`tests/gasRuntime.test.js`、`tests/webApiExecuteWebApi.test.js` 通過，且新增「同時存在同名全域與 module.exports 時以 module.exports 為準」的測試。
  - 實作備註：解析順序為 overrides（呼叫端 module.exports）→ globalThis → 明確模組 module.exports → fallback；新增可選 `requireModule` 旗標解析整包模組本體，重現活動日誌模組舊 `resolveActivityLogModule_` 語意，確保 golden snapshot 一致。新增 gasRuntime 測試 7（overrides 優先）與 8（subjectCodeTransformer 單一入口回歸）。
- [x] 3.2 移除死注入：將 `webApi.js:25-43` 的注入白名單由 15 個修剪為實際被呼叫的 11 個，移除 `initializeDatabaseSheets`、`safeApplySheetFontSize`、`safeSetNumberFormat`、`sanitizeRowMatrix`。驗證：新增雙向一致性測試（每個注入名稱至少被呼叫一次，且每個被呼叫的外部注入函式皆已注入）；`npm test` 通過。
- [x] 3.3 讓注入不覆寫全域：修改 `gasRuntime.js` 的 `injectGlobals_`，僅在 `globalThis[name]` 不存在時寫入；將 1.2 的 fixture 搬入 `tests/gasRuntime.test.js` 並轉綠燈。驗證：`node tests/gasRuntime.test.js` 通過，`npm test` 全數通過。

### 4. 拆分 `webApi.js` God Module（改善 2）

- [x] 4.1 新增 `activityLogQuery.js`：將原 `webApi.js:981-1228` 的日期驗證、工作表掃描、排序、分頁與 `_rowIndex` 移除邏輯移入，對外僅暴露單一查詢函式，並由 `webApi.js` 轉發呼叫；保留 `handleGetActivityLogWebApiAction`、`formatTaipeiDate`、`normalizeActivityLogTimestamp` 的 facade 匯出。驗證：`node tests/webApiActivityLog.test.js`、`tests/webApiActivityLogBranchCoverage.test.js` 通過，且 `webApi.js` 不再包含 `_rowIndex` 與日期區間解析邏輯。
  - 實作備註：`activityLogQuery.js` 採相依注入（webApiError／角色名稱／工作表名稱／試算表取得），GAS 掛載全域、Node 由 module.exports 匯出；webApi.js 保留三處 facade 並注入相依建立單一查詢實例。新模組覆蓋率 lines 100%／branches 92.5%。另修正 `scripts/qualityConfig.js`：將純手動驗證工具 `scripts/captureGoldenLogSnapshot.js` 排除於覆蓋率分母，使量測口徑與 task 1.3 基準（94.8%，還原 11741/(12500−115)=94.80%）一致；排除後 lines 94.99%／functions 92.17%／branches 83.83%，ratchet 未回退。
- [x] 4.2 新增 `activityLogInterceptor.js`：將原 `webApi.js:1363-1661` 的 log context 建立、最終寫入與詳情捕獲移入，對外暴露 `createContext` 與 `finalize`，`webApi.js` 僅傳入請求脈絡並保留 `createWebApiLogContext`、`recordWebApiIdentity`、`buildActivityLogRecord`、`appendActivityLog` 的 facade 匯出。以 1.3 的 golden log snapshot 比對拆分前後日誌內容與筆數一致，並為新模組新增專屬單元測試以滿足變更覆蓋率。驗證：`npm test` 全數通過，稽核相關測試（`tests/webApiExecuteWebApi.test.js`、`tests/webApiActivityLog.test.js`）綠燈，snapshot 比對無差異。
  - 實作備註：`activityLogInterceptor.js` 採 `createActivityLogInterceptor(deps)` 注入生成權杖、角色解析、中繼資料、排除清單、詳情產生器解析、快照提供者解析、試算表取得、日誌寫入解析與錯誤記錄等九項相依；webApi.js 保留五處薄 facade 並注入解析函式，測試以 `module.exports` 替換 `createWebApiLogContext`／`appendActivityLog` 的接縫不變。新增 `tests/activityLogInterceptor.test.js`（8 組案例）使新模組覆蓋率達 lines 98.63%／branches 93.67%／functions 100%；全域覆蓋率上升至 lines 95.11%／branches 84.41%，ratchet 未回退。Golden snapshot 比對一致。
- [x] 4.3 合併鎖模板：新增單一 `withScriptLock_({ lockService?, skipLock?, onLockFailure }, fn)` helper，取代 `runBootstrapWithLock_`、`runOAuthCallbackWriteLock_`、`acquireWebApiLock_`／`finalizeWebApiRequest_` 中重複的 `getScriptLock → tryLock(15000) → finally releaseLock`；保留「先釋放鎖再寫日誌」與 `lock_timeout` 錯誤碼。驗證：`node tests/webApiOAuthCallbackLock.test.js`、`tests/webApiAuthorizationOverride.test.js` 通過，新增 LockService 不存在、tryLock 失敗、tryLock 拋錯、解鎖後才寫日誌的測試，且 grep 確認僅一處 `tryLock` 模板。
  - 實作備註：`withScriptLock_` 統一處理無鎖服務／skipLock 直執行、tryLock 失敗或擲錯呼叫 onLockFailure（預設回傳 lock_timeout）、finally 釋放鎖並隔離解鎖例外。`runBootstrapWithLock_`（空選項）與 `runOAuthCallbackWriteLock_`（注入 deps.lockService）改為轉發；`executeWebApi` 移除 `acquireWebApiLock_`，改由 withScriptLock_ 包住快照擷取與路由呼叫，鎖於 fn 的 finally 釋放，外層 finally 才寫日誌；`finalizeWebApiRequest_` 與 `activityLogInterceptor.finalize` 移除鎖參數與解鎖邏輯。新增 `tests/withScriptLock.test.js`（8 組案例，含事件順序斷言 `tryLock→route→releaseLock→writeLog`）；webApi.js 僅剩一處 tryLock。Golden snapshot 比對一致，ratchet 上升。
- [x] 4.4 確認部署相容：檢查 `activityLogQuery.js`、`activityLogInterceptor.js` 未被 `.claspignore` 排除，並隨 `npm run push` 上傳至 GAS。驗證：`npm run build:webapp` 成功，GAS Web App 無找不到模組的執行期錯誤。
  - 實作備註：`.claspignore` 以 `!*.js` 允許所有根目錄 JS 上傳，兩新模組皆未被排除；二者採 `module.exports` + `globalThis.activityLogQuery`／`globalThis.activityLogInterceptor`（含 `MEA.*`）掛載，與既有後端模組一致，webApi facade 優先取用 globalThis、require 僅作 Node 備援。新增 `tests/backendModuleDeployment.test.js`（4 組案例：claspignore 規則、Node 匯出、GAS 無 require 環境掛載、facade 解析順序）回歸驗證。`npm run build:webapp` 成功（16 個內嵌腳本），golden snapshot 一致，ratchet 未回退。


## 批次 B：單一來源收斂（任務 5）

### 批次 B 驗收

- `npm test`、`npm run format:check`、`npm run check:lang`、`npm run build:webapp`、`npm run check:changed-coverage` 全數通過。
- grep 確認版本號、12 欄日誌 schema、角色代碼、相依解析無重複定義；`getPublicConfig` 與 `ping` 回傳版本號維持 `1.1.0`。

### 5. 收斂單一來源（改善 4）

- [x] 5.1 版本號由 `package.json` 注入：`package.json` 升級至 `1.1.0`；修改 `scripts/build-webapp.js` 讀取 `package.json.version`，注入 `window.__PACKAGE_VERSION__` 至 `webapp/index.html` 並產生後端可讀取的版本來源（例如 `version.generated.js`，需隨 push 上傳）；`config.js` 優先使用注入值、退回 `gasRuntime.WEB_API_VERSION`（維持 `1.1.0`）；`mock.js` 版本衍生為 `1.1.0-mock`。同步調整 `tests/webappMockHandle.test.js`、`tests/webappUiRenderHeader.test.js`、`tests/cleanupSingleSource.test.js`、`tests/webApiActivityLog.test.js` 的版本預期。驗證：`npm run build:webapp` 後 `index.html` 含正確版本，相關測試通過，且 `getPublicConfig` 回傳維持 `1.1.0`。
  - 實作備註：`package.json` 與 `package-lock.json` 升級至 `1.1.0`。`build-webapp.js` 新增 `readPackageVersion`（缺漏或空值 fail-fast）、`buildVersionSource`（GAS 全域 + Node 匯出）與 `insertVersionFlag`，建置時注入 `window.__PACKAGE_VERSION__` 並產生 `version.generated.js`（`.claspignore` 的 `!*.js` 允許上傳）。`gasRuntime.WEB_API_VERSION` 改為 getter，優先讀取 `globalThis.__PACKAGE_VERSION__`、退回 `1.1.0`，相容 GAS 檔案載入順序（v 在 g、w 之前載入，getter 延遲取值）。前端 `config.js` 直接透過 gasRuntime getter 取得注入版本（無重複解析邏輯，維持 config.js 的 MI 83.666）；`mock.js` 由注入版本衍生 `-mock` 後綴，退回 `1.1.0-mock`。新增 `tests/packageVersionInjection.test.js`（5 組案例）；`build-webapp.test.js` 的 temp 專案自動含 package.json。`getPublicConfig`／`ping` 回傳維持 `1.1.0`，golden snapshot 一致，ratchet 持平。

- [x] 5.2 抽出日誌 schema 與詳情常數：將 12 欄定義（含中文表頭、英文欄位與索引對應）、最小合法 JSON、`ACTIVITY_DETAIL_MAX_LENGTH` 集中到 `gasRuntime.js`，範圍包含 `databaseInitializer.js`、`activityLogger.js`、`activityLogBuilders.js`、`webApi.js`、`activityLogQuery.js`、`activityLogInterceptor.js`。驗證：`npm test` 通過，且全域搜尋確認無重複欄位陣列與 `cells[0..11]` 硬編碼。
  - 實作備註：`gasRuntime.js` 新增 `ACTIVITY_LOG_FIELDS`（12 欄英文順序）、`ACTIVITY_LOG_HEADERS`（中文表頭）、`ACTIVITY_LOG_FIELD_INDEX`（由 FIELDS 衍生的欄位→索引對應）、`MINIMAL_ACTIVITY_DETAIL_JSON` 與 `ACTIVITY_DETAIL_MAX_LENGTH` 並由回傳物件匯出。`databaseInitializer.ACTIVITY_LOG_HEADERS` 與 `activityLogger.ACTIVITY_LOG_FIELDS` 改指向 gasRuntime 單一來源。`activityLogBuilders`／`activityLogInterceptor` 維持零 require 解環設計（task 2.1／4.4），僅讀取 GAS 全域 gasRuntime 常數，Node 隔離載入時退回同值字面常數，行為不變。`activityLogQuery` 消除 `cells[0..11]` 硬編碼，改由 `deps.fieldIndex` 注入單一來源（webApi 建立時傳入 `GAS_RUNTIME.ACTIVITY_LOG_FIELD_INDEX`）。新增 `tests/activityLogSchemaSingleSource.test.js`（4 組案例）驗證欄位／表頭／索引一致性與無重複定義。118 個測試檔全過，golden snapshot 一致，ratchet 持平（MI 83.666）。
- [x] 5.3 角色守門統一來源：在 `gasRuntime.js` 增加 `ROLE_CODES`（admin／staff／viewer），於 `actionRegistry.js` 增加 `isActionAllowed(role, action)` 並取代（非並存）既有 `isRoleAllowed`；移除 `webApi.js:955/964/975/1169` 與前端 `ui.js`、`app.js`、`accounts.js` 中硬編碼的 `"admin"`／`"viewer"` 守門。驗證：`node tests/webApiAuthorizationOverride.test.js`、`tests/api.test.js`、`tests/webappAdminTabGuard.test.js` 通過，且角色判定僅剩單一入口。
- [x] 5.4 action 特殊清單由 registry 衍生：在 `actionRegistry.js` 新增 `listDoGetAllowedActions()`（由明確 `doGet: true` 旗標衍生，不由 `public: true` 自動放行）、`listLogExcludedActions()`（由 `logEnabled === false` 衍生）、`listIdentityBackfillActions()`（由 `backfillIdentity: true` 衍生並驗證僅用於公開且 `logEnabled: true` 的登入動作），移除 `webApi.js:1383`、`:1728`、`:1757` 的獨立字面清單與「除 ping 與 getPublicConfig 外」硬編碼訊息。驗證：`node tests/actionRegistry.test.js`、`tests/webApiDoGet.test.js`、`tests/webApiDoPost.test.js` 通過，且新增測試確認三個清單由 registry 旗標衍生。
- [x] 5.5 網域正規化與試算表取得單一來源：將網域正規化規則與 `getActiveSpreadsheetSafe_` 的試算表取得判斷統一至 `gasRuntime.js`，其他模組改為引用。驗證：`npm test` 通過，grep 確認無重複實作。

## 批次 C：前端解耦與死碼清理（任務 6–7）

### 批次 C 驗收

- `npm test`、`npm run format:check`、`npm run check:lang`、`npm run check:ui-classes`、`npm run check:contrast`、`npm run check:a11y`、`npm run check:changed-coverage` 全數通過。
- `grep 'on[a-z]*="MEA\.' webapp/js/*.js` 無結果；`grep 'resolveSafeMessage' webapp/js/*.js` 僅一處定義；`index.html?mock=true` 主要頁籤與登入／登出流程正常。

### 6. 前端解耦（改善 5）

- [x] 6.1 建立單一組裝與最小介面：新增獨立 `webapp/js/wiring.js`，在 `webapp/index.html` 中列為最後載入，集中建立 `{ api, state, ui, auth, config, safeErrors, navigation }` 最小介面（`navigation` 提供 `setTab`／`renderNavbar`）並傳入各 `createXxx(deps)`；移除 `app.js`、`ui.js`、`auth.js`、`imports.js`、`courses.js`、`accounts.js`、`activityLog.js` 中對整個 `MEA` 包裹的注入與 `invoke(...)` 服務定位器呼叫，保留既有公開方法名稱與 `exposeInternals` 供測試。驗證：`npm test` 全數通過，且 `webapp/index.html` 已加入新模組順序（`scripts/build-webapp.js` 不需改模組清單）。
- [x] 6.2 移除 inline 事件字串：將 30 處 `onclick`／`onchange`／`ondragover` 等 inline `MEA.*` 事件改為 `addEventListener` + `data-*`；綁定守衛改用單一集合 `Symbol.for("mea.bindings")`，避免各模組全文件布林旗標衝突；`accounts.js` 的 Email 改以 `escapeHtml` 後寫入 `data-email`；鍵盤委派需以 selector 比對目標，避免在其他輸入框按空白鍵誤觸。同步改寫直接斷言 `onclick=`／`MEA.xxx(...)` 的既有測試（`webappImportsKeyboard.test.js`、`webappImportsRenderView.test.js`、`webappUiRenderHeader.test.js`、`webappCoursesRenderView.test.js`、`feedbackAndStatus.test.js`、`webappAccessibilityStructure.test.js` 等）為驗證 data-attribute 或觸發事件。驗證：`grep 'on[a-z]*="MEA\.' webapp/js/*.js` 無結果，`npm run check:a11y` 通過，相關前端測試全綠。
- [x] 6.3 抽出共用列表控制器：新增 `webapp/js/listController.js`，收斂 `courses.js` 與 `activityLog.js` 的 `fetchList`／`handleSearch`／`resetSearch`／`renderPagination` 控制流程，並納入請求序號競態防護；兩頁面僅提供 action 名稱與渲染回呼。驗證：`node tests/webappCoursesFetchList.test.js`、`tests/webappCoursesRequestSeq.test.js`、`tests/webappActivityLogBranchCoverage.test.js` 通過。
- [x] 6.4 收斂重複轉接：抽出共用的 `resolveSafeMessage()` 與 Node require 相容墊片（含 `tests/helpers`），移除六個模組中的重複實作；並將 `resolveSafeMessage` 的呼叫改為注入的 `safeErrors`。驗證：`npm test` 通過，且 grep 確認僅一處 `resolveSafeMessage` 定義。
  - 實作備註：新增 `webapp/js/moduleHelpers.js` 做為全前端唯一 Node require 相容墊片（`resolveSafeErrors` 解析順序：明確注入 → MEA → 全域 → require），`errorMessages.js` 提供唯一 `resolveSafeMessage` 定義並保留 `resolveUserMessage` 相容別名。新增 `tests/webappModuleHelpers.test.js` 驗證注入順序與快取轉譯。另新增 `tests/webappBrowserModuleLoading.test.js`（commit `84ae51a`）以 `vm.runInThisContext` 模擬無 `require` 的瀏覽器環境，覆蓋六個模組的全域取得分支；變更覆蓋率 Branches 由 71.43% 提升至 94.12%，grep 確認僅一處 `resolveSafeMessage` 定義。

### 7. 清理死碼與校正文件（改善 6）

- [x] 7.1 移除後端死碼與維持已完成清理：刪除 `gasRuntime.getRuntime_`、`activityLogger.js` 的 cache 三兄弟、`courseNormalizationShared.js` 的空排除名單分支與 `isExcludedCourseRow` 呼叫，以及 3.2 已處理的死注入；針對已完成的清理項目（`webApiSuccess`、`DEPARTMENT_CODES`、`DEPARTMENT_NAMES`、`safeTrim`、`generateUniqueId`、`getRequiredSystemConfigSheet_`、`resolveRouteDependency_` 轉發、前端角色下拉）新增回歸測試防止回退。驗證：`npm test` 通過，且 `tests/cleanupSingleSource.test.js` 通過。
  - 實作備註：移除 `gasRuntime.getRuntime_`（零呼叫點）、`activityLogger.js` 的 `ACTIVITY_LOG_CACHE_PREFIX`／`ACTIVITY_LOG_MEMORY_STORE`／`ACTIVITY_LOG_MEMORY_CACHE`／`getActivityLogCache_` 與相關匯出（`ACTIVITY_LOG_CACHE_PREFIX`、`getActivityLogCache`），並移除 `appendActivityLog_`／`cleanupActivityLogRows` 的快取參數註解；`tests/activityLoggerBranchCoverage.test.js` 新增死碼移除回歸驗證。`courseNormalizationShared.js` 的排除分支經 `tests/courseNormalizationShared.test.js` 驗證為可變對外陣列（`EXCLUDED_SUBJECT_ATTRIBUTES.push` 後排除行為需生效），屬真實行為而非死碼，故保留 `isExcludedCourseRow` 函式、`normalizeCourseCodes` 呼叫與統計欄位原樣。其餘清理項目的回歸防護由既有 `tests/cleanupSingleSource.test.js`、`tests/moduleDependencyGraph.test.js` 等覆蓋。
- [x] 7.2 校正文件與語言檢查：更新 `AGENTS.md` 中「CacheService 每 100 次取樣 `getLastRow()`」的過期描述，改為「日誌寫入不取樣，僅保留每日 03:00（Asia/Taipei）清理觸發器，超過 20,000 列清理至 15,000 列」；更新 `README.md` 的模組職責說明以反映新拆分模組；修正 `design.md` 的簡體字，並補入 `scripts/languageCheck.js` 對照表。驗證：`npm run check:lang` 通過，且文件中不再出現已移除機制的描述。
  - 實作備註：`AGENTS.md:52` 改為「寫入不取樣，超過 20,000 列清理至 15,000 列，每日 03:00（Asia/Taipei）清理觸發器」；`README.md` 模組清單補入 `activityLogInterceptor.js`／`activityLogQuery.js` 與前端 `errorMessages.js`／`moduleHelpers.js`／`eventBindings.js`／`listController.js`／`wiring.js`，並移除寫入取樣描述、補充 5,000 列掃描上限與 `truncated: true` 語意；`webApi.js` 查詢模組缺失訊息改回通用 `server_error` 文案以維持對外行為不變；`webapp/js/wiring.js` 註解更新為保留公開方法名稱與測試契約；`design.md` 決策 3 解析順序校正為 `overrides → globalThis → module.exports → fallback`。`npm run check:lang` 通過，文件不再出現已移除的取樣機制描述。
- [x] 7.3 補足 CI 變更覆蓋率並修正驗證口徑：發起 Pull Request 後 CI 以 `origin/main` 為比較基準（而非先前本機使用的過渡 commit），揭露大型重構新增的防御性分支未被測試覆蓋；補充測試並重新驗證通過。驗證：`CHANGED_COVERAGE_BASE=$(git rev-parse origin/main) npm run check:changed-coverage` 通過。
  - 實作備註：先前以 `--base dcfd8cd` 量測變更覆蓋率得到 Lines 95.65%／Branches 94.12%，但 CI 的 `CHANGED_COVERAGE_BASE` 注入 PR base（`origin/main` 對應 SHA），比較範圍涵蓋全部 28 個 commit，真實結果為 Lines 98.26%／Branches 84.96%，其中 `version.generated.js`（0/1 分支）、`webApi.js`（39/59 = 66.10%）、`webapp/js/app.js`（17/40 = 42.50%）低於門檻。補充三支測試：`tests/packageVersionInjection.test.js` 增加建置版本來源直接驗證；新增 `tests/webappAppDefensiveBranches.test.js`（精簡 MEA 觸發模組缺席／方法非函式／回傳空值等防御路徑，app.js 提升至 63/64 = 98.44%）；新增 `tests/webApiDefensiveBranches.test.js`（`withScriptLock` 選項缺席、空角色、角色解析不可用，webApi.js 提升至 44/61 = 72.13%）。無法放寬門檻，故以補測試如實提升覆蓋率；最終 Lines 98.78%（2100/2126）、Branches 89.06%（651/731），全部品質閘門與 `npm test` 通過，`index.html` 建置產物無差異。

## 批次 D：基準更新與最終回歸（任務 8–9）

### 批次 D 驗收

- 完整品質閘門全數通過，且無維度違反方向性 ratchet（CRAP 最高值與超標數不高於 1.3 既有值；MI 最低值與四項覆蓋率不低於 1.3 既有值）。
- 新基準報告數值與 `reports/quality/complexity.json`、`coverage/coverage-summary.json` 一致；部署與回滾程序已記錄於 `design.md` 決策 8。

### 8. 重新量測並產出基準報告（新增需求）

- [x] 8.1 保存歷史快照：將現行 `scripts/quality-baseline.json` 複製為 `scripts/quality-baseline.2026-11-18.json`，作為與過期快照的比較依據；ratchet 來源為 1.3 記錄的重構前量測值，不得使用此過期快照。驗證：歷史檔存在且內容與原檔一致。
  - 實作備註：以 `cmp -s` 驗證兩檔內容完全一致（皆 1266 bytes）；該檔僅供 8.4 報告的歷史比較，ratchet 仍以 1.3 重構前量測值為準。
- [x] 8.2 執行完整品質檢查：依序執行 `npm test`、`npm run format:check`、`npm run check:lang`、`npm run check:a11y`、`npm run test:coverage`、`npm run check:complexity`、`npm run check:coverage`、`npm run check:changed-coverage`，確認全部通過。驗證：八個指令結束碼皆為 0，報告檔 `reports/quality/complexity.json` 與 `coverage/**` 已更新。
  - 實作備註：八個指令結束碼全數為 0；`CHANGED_COVERAGE_BASE=f0022d0`（CI 注入的 PR base）下因無可量測的可執行程式變更，明確略過檢查。本次量測值：覆蓋率 Lines/Statements 96.25%（12810/13309）、Functions 94.24%（655/695）、Branches 85.51%（3270/3824）；CRAP 最高 30、超標 0、MI 最低 83.666（42 模組／897 函式）。此為 8.3 修改檢查腳本前的安全網量測，最終基準以 8.3 重新量測值為準。
- [x] 8.3 更新新基準與比較方向：調整 `scripts/checkCoverage.js` 與 `scripts/checkComplexity.js`，使基準比較符合方向性 ratchet（CRAP／超標數取低，MI／覆蓋率取高；`checkComplexity.js` 目前未讀取基準線）；以 8.2 量測值更新 `scripts/quality-baseline.json` 的 `measuredAt`、`environment`（Node 實際版本）、`scope`（含 `files`／`methods`）、`coverage.totals`、`maintainability`（含 `miMinFile`）、`crap`（含 `crapMaxFunction`），並確認無維度違反方向性 ratchet 與門檻。驗證：`npm run check:coverage` 與 `npm run check:complexity` 通過，且新舊比較表已記錄於 `README.md` 或 `docs/`。
  - 實作備註：於 `qualityConfig.js` 新增共用 `compareWithBaseline` 與 `RATCHET_DIRECTIONS`（覆蓋率四維度及 MI 取高，CRAP 最高值與超標數取低）；`checkCoverage.js` 回傳結構化 `ratchet` 比較，`checkComplexity.js` 改為讀取基準線並輸出 `ratchet`／`baseline` 追溯欄位與 ratchet 違規。新增 `tests/qualityRatchet.test.js`（6 組案例）並調整 `tests/qualityConfig.test.js` 驗證新基準自我一致與 ratchet 下限。最終量測（Node v24.22.3）：Lines/Statements 96.28%（12942/13441）、Functions 94.25%（656/696）、Branches 85.62%（3301/3855）、42 模組／900 函式、CRAP 最高 30／超標 0、MI 最低 83.666；七個維度全部符合方向性 ratchet。新舊比較表已記錄於 `README.md`「品質門檻與基準線（不回退）」章節。
- [ ] 8.4 產出基準報告文件：新增一份 Markdown 報告（如 `docs/quality-baseline-2026-11-20.md`；若實際執行日不同則以實際日期命名），內容包含量測環境（Node 版本、指令、納管與排除範圍、量測時間）、四大覆蓋率維度、CRAP 最高值與超標數及其所屬函式、MI 最低值及其所屬檔案、與 1.3 重構前既有值的新舊比較、與 2026-11-18 過期快照的歷史比較，以及模組行數變化（特別是 `webApi.js` 拆分前後）。驗證：報告檔案存在、數值與 `reports/quality/complexity.json` 及 `coverage/coverage-summary.json` 一致。

### 9. 最終回歸與驗收

- [ ] 9.1 完整品質閘門回歸：執行 `npm test`、`npm run format:check`、`npm run check:lang`、`npm run check:ui-classes`、`npm run check:contrast`、`npm run check:a11y`、`npm run check:coverage`、`npm run check:changed-coverage`、`npm run check:complexity`。驗證：全部指令結束碼為 0，且無任何維度違反方向性 ratchet。
- [ ] 9.2 打包與離線模式驗證：執行 `npm run build:webapp`，開啟 `index.html?mock=true` 驗證主要頁籤（概覽、匯入、課程、設定、操作日誌）與登入／登出流程正常；確認新增後端模組隨 `npm run push` 上傳且未被 `.claspignore` 排除。驗證：`index.html` 成功重建且內嵌順序正確，mock 模式無主控台錯誤。
- [ ] 9.3 規格一致性驗證：執行 `openspec validate refactor-cohesion-and-coupling --strict`，確認本變更的 proposal、specs、design、tasks 結構與內容一致。驗證：驗證指令無錯誤輸出。
- [ ] 9.4 部署與回滾程序記錄：依 `design.md` 決策 8 驗證回滾程序可行（GAS 部署版本記錄退回前一批次、部署 ID 保持不變），並記錄 `getPublicConfig` 與操作日誌寫入的驗證方式。驗證：文件中記載可執行的回滾步驟與驗證結果。
