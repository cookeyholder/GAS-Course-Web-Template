## Why

一輪完整的內聚／耦合審查顯示本專案呈現明顯兩極化：`courseNormalizationShared.js`、`actionRegistry.js`、`state.js`、`api.js`、`mock.js` 等底層模組已達高內聚低耦合；但請求處理與稽核上層存在結構債——`webApi.js` 達 1,888 行且承載六種職責、前端 `ui.js` 795 行的 `modal()` 單函式 99 行、一條真實的三節點循環相依（`databaseInitializer → activityLogger → activityLogBuilders → databaseInitializer`）、365 處 `MEA.` 全域引用與 29 處 inline 事件字串，以及「單一來源旁邊另留一份手寫備援」（版本號、12 欄日誌 schema、角色代碼、最小 JSON 常數、解析機制）。

重構前量測既有值為 CRAP 最高 30／超標 0、MI 最低 83.666、四項覆蓋率 94.8／94.8／92.15／83.79（見 `measurement-baseline-before-refactor.md`；早期文件的 94.75／94.75／92.15／83.67 與 MI 83.67 僅為量測前參考值，非 ratchet 來源），但 `scripts/quality-baseline.json` 仍停留在 2026-11-18 的過期快照（CRAP 最高 1482、超標 56、MI 最低 69.134、覆蓋率 27.37／27.37／58.82／37.87）。因此需要在不改變對外行為的前提下完成結構重構，並於完成後重新量測、產出可信的新基準報告，讓「品質通過」與「架構健康」不再各行其是。新基準採方向性 ratchet：CRAP 最大值與超標數不得高於重構前量測既有值，MI 最小值與四項覆蓋率不得低於重構前量測既有值；過期快照僅供歷史比較，不作為 ratchet 來源。

## What Changes

- **打斷三節點循環相依**：讓 `activityLogBuilders` 的快照取得改為接收注入的純函式提供者，不再自行 `require("./databaseInitializer.js")` 或解析相依；提供者讀取失敗時降級為最小合法 JSON，不阻斷主流程；並修正 `tests/activityLogModuleIndependence.test.js`，使其真正涵蓋並偵測該相依環。
- **拆分 `webApi.js` God Module**：將操作日誌查詢（原 `:981-1228`）與日誌攔截／寫入（原 `:1363-1661`）移至獨立模組，`webApi.js` 僅保留 HTTP 進入點與路由編排，並以 facade 匯出向後相容轉發；同時將三份重複的 `LockService` 取得／釋放模板合併為單一 helper，保留「先解鎖再寫日誌」與既有錯誤碼。OAuth 交換與商務 action handler 的拆分不在本變更範圍。
- **合併相依解析機制**：統一走 `gasRuntime.resolveDependency_`，解析順序明確為 `module.exports → globalThis → fallback` 並保留 `module.exports` 測試注入接縫；移除 `getOverridableApiFn_` 與 `resolveActivityLogModule_` 的重複實作、移除空 catch 改為 fail-fast；`injectGlobals_` 改為「僅在全域不存在時寫入」，注入清單由 15 個修剪為實際使用的 11 個並採雙向一致性檢查。
- **收斂單一來源**：`package.json` 由 `1.0.0` 升級至 `1.1.0`，後端 `getPublicConfig` 回傳維持 `1.1.0`；建置流程從 `package.json` 讀取版本並注入前端全域常數與後端可讀取的產生檔，`mock.js` 由套件版本衍生 `1.1.0-mock`；12 欄日誌 schema（含中文表頭／英文欄位／索引對應）、最小 JSON 常數、角色代碼常數集中定義；`doGet` 白名單由明確 `doGet: true` 旗標衍生、日誌排除清單與登入動作清單登錄至 `actionRegistry`，角色判定由單一 `isActionAllowed` 提供。
- **前端解耦**：將 29 處 inline `MEA.*` 事件字串改為 `addEventListener` + data-attribute 與單一 Set 冪等守衛；各 `createXxx(deps)` 由注入整個 `MEA` 包裹改為注入 `{ api, state, ui, auth, config, safeErrors, navigation }` 最小介面，並以獨立且最後載入的 `wiring.js` 單一組裝；抽出含請求序號防護的共用 `listController`，收斂 `courses.js` 與 `activityLog.js` 的重複；同步改寫直接斷言 inline 字串的既有測試。
- **清理死碼與校正文件**：移除 `gasRuntime.getRuntime_`、活動日誌 cache 三兄弟、無用全域注入與空排除名單分支；已完成的清理項目改為回歸測試防止回退；更新 `AGENTS.md` 中已不存在的「每 100 次取樣」描述與 `README.md` 模組職責，並補足語言檢查對照表盲點。
- **重新量測並產出基準報告**：重構完成後執行完整的覆蓋率與複雜度量測，產生新的 CRAP／MI／測試覆蓋率基準報告，更新 `scripts/quality-baseline.json`、`reports/quality/complexity.json` 與覆蓋率報告；新基準 MUST 遵守方向性 ratchet，並在文件中記錄新舊比較、與過期快照的差異及量測環境。
- **交付方式**：依任務 1–4、5、6–7、8–9 切成 4 批 Pull Request，每批可獨立驗證與部署，降低審查與回滾風險。

## Capabilities

### New Capabilities

- （無；本變更為既有能力之強化與基準更新，不引入新能力。）

### Modified Capabilities

- `maintainability-and-shared-logic`: 補齊既有「單一 `resolveDependency_`／`getActiveSpreadsheetSafe_`」「版本號由 `package.json` 注入」「不靜默覆寫全域」要求目前未落實之處，並新增模組間不得形成循環相依、God Module 職責拆分、inline 事件改事件委派、最小介面注入、死碼清零與方向性 ratchet 之要求；已完成的清理項目改為回歸防護。
- `activity-logging-and-auditability`: 明確日誌查詢與寫入攔截須由獨立模組承擔且保留 facade 匯出，12 欄 schema 與詳情最小 JSON 須有單一來源，並以 golden snapshot 驗證拆分後行為不變；分頁上限描述與實作一致。
- `coverage-and-complexity-gates`: 新增「結構重構完成後 MUST 重新量測並更新基準快照、產生新報告」之要求，ratchet 採方向性比較（CRAP／超標數取低、MI／覆蓋率取高），既有值以重構前量測為準。

## Impact

- **後端程式碼**：`webApi.js`（拆分後大幅縮減）、`databaseInitializer.js`、`activityLogger.js`、`activityLogBuilders.js`、`gasRuntime.js`、`actionRegistry.js`、`utilities.js`；新增 `activityLogQuery.js`、`activityLogInterceptor.js`（或等效模組）。
- **前端程式碼**：`webapp/js/ui.js`、`app.js`、`accounts.js`、`imports.js`、`courses.js`、`auth.js`、`api.js` 等之事件綁定與依賴注入方式；新增 `wiring.js` 與 `listController.js`。
- **建置與腳本**：`scripts/build-webapp.js`（版本號注入與後端產生檔，模組順序仍由 `webapp/index.html` 決定）、`scripts/checkCoverage.js`、`scripts/checkComplexity.js`（方向性 ratchet 比較）、`scripts/languageCheck.js`。
- **測試**：新增／調整循環相依偵測、全域不覆寫、版本號來源、事件委派、最小介面注入、golden snapshot 與注入清單雙向一致性測試；既有 `tests/**` 全數回歸。
- **文件與基準**：`AGENTS.md`、`README.md`、`scripts/quality-baseline.json`、`reports/quality/complexity.json`、`coverage/**` 新報告。
- **對外契約**：Web API action 名稱、payload 結構、RBAC 結果與錯誤代碼維持不變；版本號數值維持 `1.1.0`，僅來源改由 `package.json` 注入。
