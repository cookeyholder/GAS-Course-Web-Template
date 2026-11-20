## Context

本變更的動機與結構債清單見 `proposal.md - Why`；行為契約見 `specs/` 下三個 delta。本設計僅說明「如何」在不改變對外行為的前提下完成重構並更新基準。

現況約束：

- 後端運行於 GAS V8，根目錄 `*.js` 共享全域命名空間；Node 測試則仰賴 `module.exports` 與白名單注入。任何拆分都必須維持雙環境相容，且新增後端模組必須隨 `npm run push` 上傳、不得被 `.claspignore` 排除。
- `index.html` 為 `build-webapp.js` 依 `webapp/index.html` 的 `<script>` 順序內嵌的單一產物；新增前端模組必須更新樣板順序，建置腳本不另維護模組清單。
- 操作日誌已通過稽核測試與 RBAC 測試，拆分時必須保持日誌內容、寫入時機與錯誤不阻斷主流程的語意；既有 facade 匯出被大量測試直接使用，需保留向後相容轉發。
- 品質閘門已綠燈（CRAP > 30 為 0、MI 最低 83.666、覆蓋率 94.75／94.75／92.15／83.67），但 `scripts/quality-baseline.json` 為 2026-11-18 過期快照（CRAP 最高 1482、超標 56、MI 最低 69.134、覆蓋率 27.37／27.37／58.82／37.87）。ratchet 以重構前量測值為準，採方向性比較：CRAP／超標數取低、MI／覆蓋率取高。

## Goals / Non-Goals

**Goals:**

- 將後端相依圖從含環導向無環，並讓「相依解析」只有一個入口。
- 降低 `webApi.js` 與前端 `ui.js`／`app.js` 的職責數量，讓模組可獨立理解與測試。
- 消除重複定義（版本號、schema、角色、白名單、解析模板）與死碼。
- 前端事件改為委派綁定、依賴改為最小介面注入。
- 產出可信的新 CRAP／MI／覆蓋率基準報告，並確保符合方向性 ratchet。
- 以 4 批 Pull Request 逐步交付，每批可獨立驗證與部署。

**Non-Goals:**

- 不新增 Web API action、不改變 action 名稱、payload 結構、RBAC 結果或錯誤代碼。
- 不改變版本號對外回傳值（維持 `1.1.0`），僅改變其值來源。
- 不拆分 OAuth 交換與商務 action handler；此項列為未來變更，不計入本變更驗收。
- 不改變操作流程、無障礙行為、樣式或對外文件交互。
- 不調整品質門檻（CRAP 30、MI 20、覆蓋率門檻）本身，僅更新基準快照與比較方向。
- 不重構已屬模範的純函式模組（`courseNormalizationShared.js`、`state.js`、`api.js`、`mock.js`）。

## Decisions

### 決策 1：以「快照提供者注入」打斷三節點循環

`activityLogBuilders.js` 不再 `require("./databaseInitializer.js")`，也不解析或載入 `gasRuntime.js`。改由 `webApi.js` 在建立 log context 時，將 `readSystemSettings`／`readWhitelist` 以純函式參數傳入 `captureBefore(detailKey, ss, snapshotProvider)`。提供者讀取失敗時降級為最小合法 JSON，不得拋出錯誤影響主流程。

- **替代方案**：把共用設定讀取下沉到新的低層模組，讓兩邊都依賴它。優點是更乾淨，但會牽動 `databaseInitializer` 的公開 API 與既有多處呼叫，風險與改動成本較高。
- **選擇理由**：注入提供者僅改寫呼叫鏈的一小段，且能立即讓相依方向變單向；同時讓 `activityLogBuilders` 回到「純產生詳情」的職責。
- 獨立性測試改為在單一全新行程（fresh process）中載入完整鏈（`databaseInitializer → activityLogger → activityLogBuilders`），並加入「注入人造循環時測試必須失敗」的斷言，避免再次出現假驗證。

### 決策 2：以「依資料方向」拆分 `webApi.js`

新增兩個根目錄模組：

- `activityLogQuery.js`：承擔原 `:981-1228` 的日期驗證、工作表掃描、排序、分頁與 `_rowIndex` 移除，對外只暴露單一查詢函式。
- `activityLogInterceptor.js`：承擔原 `:1363-1661` 的 log context 建立、最終寫入與詳情捕獲，對外暴露 `createContext` 與 `finalize`。

`webApi.js` 保留 `doGet`／`doPost`／路由與 session 編排，並保留 `handleGetActivityLogWebApiAction`、`formatTaipeiDate`、`normalizeActivityLogTimestamp`、`createWebApiLogContext`、`recordWebApiIdentity`、`buildActivityLogRecord`、`appendActivityLog` 等 facade 匯出做向後相容轉發。完成條件為 `webApi.js` 不再包含 `_rowIndex`、日期區間解析、詳情產生與日誌工作表寫入邏輯。拆分採「先建立新模組並轉發、再逐步移動」的方式，每一步都跑完整測試；新模組必須隨 `npm run push` 上傳。

- **替代方案**：僅抽函式不抽檔案。缺點是 God Module 的 1,888 行問題未解決。
- **選擇理由**：檔案級拆分才能讓「改日誌排序」與「改登入流程」落在不同檔案，真正的降低變更耦合。

### 決策 3：單一解析入口、非覆寫注入與 fail-fast

`gasRuntime.js` 的 `resolveDependency_` 成為唯一解析入口，順序明確為 `overrides → globalThis → module.exports → fallback`（overrides 為呼叫端傳入的 `module.exports`，保留 `api[key] = stub` 注入接縫；全域注入優先於模組匯出，向後相容既有測試行為）：

- 刪除 `webApi.js` 的 `getOverridableApiFn_` 與 `resolveActivityLogModule_`，改呼叫 `resolveDependency_`。
- `resolveDependency_` 接受可選 overrides 參數，保留既有以 `api[key] = stub` 注入 stub 的測試接縫；移除空 catch，載入失敗時拋出含模組名稱的錯誤。
- `subjectCodeTransformer.js` 的 `resolveRouteDependency_` 已轉發單一入口，維持並補回歸測試。
- `injectGlobals_` 改為：`if (!(name in globalThis)) globalThis[name] = ...`。
- `webApi.js:25-43` 的注入白名單由 15 個修剪為實際使用的 11 個，移除 `initializeDatabaseSheets`、`safeApplySheetFontSize`、`safeSetNumberFormat`、`sanitizeRowMatrix`；新增雙向一致性檢查（注入名稱皆被呼叫、被呼叫的外部函式皆已注入）。

### 決策 4：版本號由 `package.json` 注入，對外數值維持 `1.1.0`

- `package.json` 由 `1.0.0` 升級至 `1.1.0`；`gasRuntime.js` 的 `WEB_API_VERSION` 維持 `1.1.0` 做為退回值，因此 `getPublicConfig` 與 `ping` 回傳數值不變。
- `scripts/build-webapp.js` 在打包時讀取 `package.json.version`，注入 `window.__PACKAGE_VERSION__` 至 `webapp/index.html`，並產生後端可讀取的版本來源（例如 `version.generated.js`，需隨 `npm run push` 上傳）；`config.js` 優先使用注入值、退回 `gasRuntime.WEB_API_VERSION`。
- `mock.js` 的版本字串由套件版本衍生為 `1.1.0-mock`；同步調整直接比較版本字串的既有測試。

- **替代方案**：只把 `gasRuntime.js` 改成 `1.0.0` 與 `package.json` 對齊。缺點是會改變後端對外回傳值，已排除。
- **選擇理由**：真正由 `package.json` 單一來源注入，履行既有 requirement，同時保留 GAS 環境的退回值與對外契約。

### 決策 5：action 特殊清單由 registry 明確旗標衍生

在 `actionRegistry.js` 增加：

- `listDoGetAllowedActions()`：由明確登錄的 `doGet: true` 旗標衍生，不由 `public: true` 自動放行，避免日後新增公開但敏感的 action 意外可用 GET。
- `listLogExcludedActions()`：由 `logEnabled === false` 衍生，取代 `webApi.js:1383` 的陣列。
- `listIdentityBackfillActions()`：由 `backfillIdentity: true` 標記 `login`／`loginWithActiveUser`，並驗證該旗標僅能用於公開且 `logEnabled: true` 的登入動作。
- `isActionAllowed(role, action)`：取代既有 `isRoleAllowed`，兩者不並存；角色代碼由 `gasRuntime.ROLE_CODES` 單一提供，registry 與前端衍生，移除 handler 與前端硬編碼的 `"admin"`／`"viewer"`。
- `webApi.js` 中「除 ping 與 getPublicConfig 外」錯誤訊息改由清單產生。

### 決策 6：前端最小介面注入與事件委派

- 新增獨立 `webapp/js/wiring.js`，並在 `webapp/index.html` 中列為最後載入；集中建立 `{ api, state, ui, auth, config, safeErrors, navigation }` 最小介面並傳入各 `createXxx(deps)`，其中 `navigation` 提供 `setTab`／`renderNavbar`。移除對整個 `MEA` 包裹的依賴與 `invoke(...)` 服務定位器呼叫。
- 29 處 inline 事件改為 `addEventListener` + `data-*`；綁定守衛使用單一集合（`Symbol.for("mea.bindings")`），避免各模組全文件布林旗標互相衝突。`accounts.js:482/489` 的 Email 改以 `escapeHtml` 後寫入 `data-email`；鍵盤委派需以 selector 比對目標，避免在其他輸入框按空白鍵誤觸。
- 新增 `webapp/js/listController.js`，抽出 `courses.js`／`activityLog.js` 共用的 `fetchList`／`handleSearch`／`resetSearch`／`renderPagination`，並納入請求序號競態防護；兩頁面僅提供 action 名稱與渲染回呼。
- 為維持既有 `tests/webapp*.test.js` 與 `exposeInternals`，保留公開方法名稱；直接斷言 `onclick=`／`MEA.xxx(...)` 的既有測試同步改寫為驗證 data-attribute 或觸發事件。模組順序由 `webapp/index.html` 決定，`build-webapp.js` 不需改模組清單。

### 決策 7：方向性 ratchet 與基準報告更新流程

方向性 ratchet 定義：CRAP 最大值與超標數 MUST NOT 高於既有值；MI 最小值與四項覆蓋率 MUST NOT 低於既有值。既有值為 1.3 記錄的重構前量測結果；2026-11-18 快照僅供歷史比較。

所有重構完成並通過測試後，依序執行：

1. `npm test`、`npm run format:check`、`npm run check:lang`、`npm run check:a11y`
2. `npm run test:coverage`（c8 產生 `coverage/coverage-summary.json` 等）
3. `npm run check:complexity`（產生 `reports/quality/complexity.json`）
4. `npm run check:coverage`、`npm run check:changed-coverage`
5. 調整 `scripts/checkCoverage.js` 與 `scripts/checkComplexity.js` 的比較方向，使基準比較與方向性 ratchet 一致（`checkComplexity.js` 目前未讀取基準線）
6. 以新量測值更新 `scripts/quality-baseline.json` 的 `measuredAt`、`environment`、`scope`（含 `files`／`methods`）、`coverage.totals`、`maintainability`（含 `miMinFile`）、`crap`（含 `crapMaxFunction`），保留舊版快照為歷史檔案
7. 比對新舊數值，確認無維度違反方向性 ratchet 或門檻，並在 `README.md`／`docs/` 記錄新基準與量測環境

### 決策 8：4 批交付與回滾

| 批次 | 任務 | 主題 | 獨立驗收重點 |
| --- | --- | --- | --- |
| A | 1–4 | 安全網、後端相依與拆分 | `npm test`、`build:webapp`、`check:changed-coverage`、相依圖無環、`webApi.js` 職責收斂 |
| B | 5 | 單一來源收斂 | 版本／schema／角色／解析無重複定義，`getPublicConfig` 回傳維持 `1.1.0` |
| C | 6–7 | 前端解耦與死碼清理 | 無 inline `MEA.*` 事件、`check:a11y`、離線 mock 模式、文件格式一致 |
| D | 8–9 | 基準更新與最終回歸 | 方向性 ratchet、完整品質閘門、打包與部署驗證 |

各批次皆為行為不變重構，可獨立部署，不需特性開關。回滾程序：GAS 部署版本記錄中選擇前一批次版本重新部署，部署 ID 保持不變；程式碼層面則 checkout 前一批次的相鄰 commit 後執行 `npm run push` 與 `npm run deploy`，並驗證 `getPublicConfig` 與操作日誌寫入正常。

## Risks / Trade-offs

- [GAS 全域命名空間仍存在] → 即便改為最小介面注入，GAS 仍共享全域；緩解方式是優先確保 Node 測試以最小介面執行，並以靜態掃描限制 `MEA.*` 直接引用數量。
- [拆分 `webApi.js` 可能漏掉隱性相依] → 採漸進式：先新增轉發模組、跑測試、再移動邏輯；每一小步都執行完整 `npm test` 與 `npm run check:changed-coverage`，並保留 facade 匯出。
- [紅燈測試阻斷安全網] → 1.2 的紅燈測試先置於 `scripts/fixtures/`（不符 `.test.js` 探索模式），3.3 完成後再搬入 `tests/`，期間 `npm test` 保持綠燈。
- [事件委派改寫可能破壞無障礙行為] → 保留既有 `role`、`aria-*`、`type="button"` 與鍵盤處理；`npm run check:a11y` 必通過，既有直接斷言 inline 字串的測試同步改寫。
- [版本號注入後端可讀性] → 建置同時產生後端版本來源並隨 push 上傳，避免出現「本機正確、GAS 線上退回舊值」的假單一來源。
- [新基準可能違反方向性 ratchet] → 若拆分後覆蓋率下降或 CRAP 上升，先補測試再更新基準；不得直接放寬門檻，過期快照不得拿來當作放寬依據。
- [inline 事件字串遍佈 5 個模組] → 分模組逐批轉換，每批跑前端測試與 a11y 檢查，降低一次性風險。

## Migration Plan

1. 依 `tasks.md` 的 4 批順序推進：A 安全網＋後端相依與拆分 → B 單一來源 → C 前端解耦與死碼 → D 基準與最終回歸。
2. 每一步皆為行為不變重構，透過既有測試作為安全網；新增測試先於或伴隨實作。
3. 全程不中斷 Web API 對外契約；每一批完成後重新 `npm run build:webapp` 並 `npm run push`，確認 GAS 線上 Web App 正常。
4. 回滾策略見決策 8：以 GAS 部署版本記錄退回前一批次，部署 ID 保持不變；程式碼以相鄰 commit 為回滾單位。

## Open Questions

（無阻塞性問題。下列先前歧義已依裁決寫入設計：）

- 版本號：`package.json` 升級至 `1.1.0`，後端回傳維持 `1.1.0`。
- 交付方式：分 4 批 Pull Request，每批可獨立驗證與部署。
- ratchet：CRAP／超標數不得高於既有值，MI／覆蓋率不得低於既有值；既有值為重構前量測結果。
- `doGet` 白名單採明確 `doGet: true` 旗標，不由 `public: true` 自動放行。
- `wiring.js` 獨立成檔且最後載入；模組順序由 `webapp/index.html` 決定。
- OAuth 交換與商務 action handler 拆分列為未來變更，不納入本變更驗收。
