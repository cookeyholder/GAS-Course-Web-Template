## Context

動作清單已由 `ACTION_REGISTRY` 單一管理，路由統一經過 `executeWebApi` → `routeWebApiAction`，寫入型動作另由 `LockService` 保護。工作表名稱集中於 `gasRuntime.js`，初始化由 `databaseInitializer.js` 的 `ensureXxxSheet_` 模式建立。詳見 proposal.md 的 Why 與 specs 的行為要求。

幾項既有事實約束了解法：（一）`executeWebApi` 的 JSON 解析與 `missing_action` 檢查位於 `try` 區塊之前，會直接 early return；（二）`routeWebApiAction` 與 `authorizeWebApiAction` 在 Node 測試中可分別由 `module.exports` 置換，測試替身回傳的 session 僅含 `role`／`csrfToken`，且 session 本身不存在 `roleName` 欄位；（三）`handleDoGetActionRequest_` 不經 `executeWebApi`，但僅放行不記錄的心跳動作；（四）專案尚無任何 `ScriptApp.newTrigger` 模式，前端 `renderNavbar` 也沒有角色過濾機制。

關鍵限制：GAS 沒有可靠的 fire-and-forget 背景寫入（觸發器最小間隔 1 分鐘且有配額），因此日誌必須在使用者請求週期內同步寫入；前端 Promise 不阻塞畫面，但回應時間會增加。此 50–200ms 延遲為已接受的取捨與預期值，非驗收條件。

## Goals / Non-Goals

**Goals:**

- 讓所有 Web API 請求（含失敗與查詢）都留下可查閱的稽核軌跡，且新增動作無須逐一改寫記錄邏輯。
- 在容量、隱私與效能之間取得已確認的平衡：20,000 列上限、離峰清理、接受同步寫入延遲。
- 保持與現有品質閘門、雙環境測試與建置流程相容。

**Non-Goals:**

- 不記錄 `ping`／`getPublicConfig` 心跳與 `getActivityLog` 日誌查閱，也不記錄原始 payload、token 或查詢回傳內容。
- 不即時刪除過期日誌（清理由獨立排程處理）。
- 不提供非管理員的日誌查閱，也不做 email 遮罩。
- 不改變既有動作的回傳格式或前端既有操作流程。

## Decisions

### 1. 統一攔截＋請求層級 log context

在 `executeWebApi` 建立 context（`requestId`、`action`、開始時間），**並將原有 try 區塊上移至 JSON 解析之前**，使解析失敗與缺少 action 也進入同一個 `finally` 統一寫一列。授權由 `executeWebApi` 透過可注入的授權函式取得 session 並寫回 context，**不得依賴可被置換的 `routeWebApiAction` 回寫**，否則測試替身會靜默漏掉身份。

- **為什麼不用各 handler 自行呼叫**：易漏記、格式不一致、新增動作需要記得補程式碼。
- **為什麼不用模組層級全域變數存放 session**：GAS 可能並發執行不同請求，全域狀態有交叉污染風險；明確傳遞 context 較安全。
- **角色顯示名稱**：session 无 `roleName` 欄位，統一由 `getRoleDisplayName(session.role)` 取得（後端單一來源 `ROLE_DEFINITIONS`）。
- **公開登入動作**：`login`／`loginWithActiveUser` 的授權回傳 `session: null`，攔截器須於 handler 成功後自回傳結果讀取 `email`／`name`／`role` 寫回 context；失敗或未取得時才標記未驗證。
- **情境**：`routeWebApiAction` 維持原有 `(action, payload, event)` 簽章，context 以第 4 個選擇性參數傳入；既有 handler 與測試替身忽略多餘參數即可，向後相容。

### 2. 中繼資料登錄與摘要產生器分離

`ACTION_REGISTRY` 的每個 action 增加 `logCategory`（`write`／`query`／`auth`）、`logLabel`、`logDetailKey`、`logEnabled` 四項宣告式欄位；`activityLogBuilders.js` 以 `logDetailKey` 為鍵提供 `captureBefore(ss)` 與 `describe(before, after, payload, result)`。

- **為什麼分離**：`actionRegistry.js` 若直接引用 `readSystemSettings`、`readWhitelist` 等後端模組會形成循環相依；登錄表只放資料，行為放在獨立模組。
- **新增動作的成本**：在 `ACTIONS` 加一列並在 builders 加一組函式；`getActionMeta(name)` 供攔截器讀取。
- **例外**：`ping`、`getPublicConfig` 與 `getActivityLog` 設 `logEnabled: false`，避免心跳與查閱行為自我增生。
- **明確列舉**：同步修改 `buildRolePermissions()`，讓 admin 由 `["*"]` 改為明確列舉所有 action，其餘角色維持原方式；需回歸 `api.test.js` 等 RBAC 測試。

### 3. Summary 與 JSON 詳情格式

詳情採版本化結構：`{ "版本": 1, "動作": "<action>", "指標": { ... }, "變動": [ { "欄位": ..., "前": ..., "後": ... } ] }`。

- **為什麼版本化**：日後欄位增減時，舊資料仍可解讀。
- **為什麼限制內容**：避免寫入 token、原始上傳列、查詢回傳內容；字串欄位統一截斷至 500 字元。傳入 `describe()` 的 payload MUST 為白名單投影，至少排除 `token`、`csrfToken`、`idToken`、`credential`、`rows` 與任何回傳內容欄位。
- **before/after**：僅需要變動明細的動作提供 `captureBefore`；攔截器在呼叫 handler 前呼叫它，handler 後再呼叫 `describe`。查詢動作只記篩選條件、分頁與回傳筆數。匯入回傳有三種形狀（成功含 `stats`、驗證失敗無 `stats`、冪等命中 `idempotent: true`），builder 需容錯並明確標記不適用或冪等。

### 4. 容量與清理

寫入時以 `CacheService` 計數（鍵前綴 `gas_tmpl_activitylog_` 避免與 session／import key 衝突），每 100 次寫入才呼叫一次 `getLastRow()`；超過 20,000 列時不在使用者請求中刪除，而是由每日 03:00（Asia/Taipei）GAS 時間驅動觸發器將最舊資料裁到 15,000 列。觸發器由初始化或部署呼叫 `ensureActivityLogCleanupTrigger_`，先以 `ScriptApp.getProjectTriggers()` 比對處理函式名稱避免重複建立。

- **為什麼不每次檢查**：`getLastRow()` 雖便宜，但每次請求都呼叫仍增加成本，且大量刪除會明顯拉長回應時間。
- **為什麼用 CacheService**：GAS 無行程內狀態可跨請求共享；CacheService 是內建且足夠輕量的方案。Node 記憶體備援不實作 TTL，故需提供 `deps.cache` 注入點（比照 `getOAuthNonceCache_`），由測試注入 fake cache 驗證過期行為。
- **風險**：cache 過期會使計數重置，可能延遲檢查；因有 20,000 閾值與每日清理，影響有限。
- **查詢成本**：`getActivityLog` 若讀取整張工作表（20,000 × 12）成本遠高於 `getLastRow()`；故預設僅回傳最近 7 天、每頁 50 列、單次最多 500 筆，並限制讀取範圍。

### 5. 寫入失敗不阻斷

`activityLogger.js` 的 append 包在 try/catch 內，失敗時 `console.error` 記錄，不拋出、不改寫回傳結果。

- **取捨**：極少數情況下日誌會遺失，但換取主流程可用性；符合稽核系統「不影響業務」的原則。
- **替代方案**：回傳警告欄位——已排除，因為會改變既有 API 回傳格式。

### 6. 前端頁籤與權限

新增 `getActivityLog` action（僅 admin，且 `logEnabled: false`），api.js／mock.js 同步支援；清單採分頁與篩選，展開時顯示詳情 JSON。前端需新增角色過濾機制：`renderNavbar()` 依頁籤權限旗標與目前角色過濾，`setTab()`／`buildBodyHtml()` 加入同一守門，防止直接竄改 state 進入管理員頁籤；角色來源統一為 `MEA.state.user.role`。

- **後端為最終防線**：前端過濾只是使用者體驗，後端 RBAC 必須獨立拒絕。
- **無障礙**：表格標頭 `scope="col"`、篩選控制項有標籤、展開按鈕有 `aria-expanded`，通過 `check:a11y` 與 `check:contrast`。
- **既有測試**：`tests/webappConfig.test.js` 寫死 `tabs.length === 4`，新增頁籤時須同步改為 5。
- **樣板註冊**：`webapp/index.html` 的 `BUILD:JS` 需加入 `<script src="js/activityLog.js">`（於 `accounts.js` 後、`app.js` 前），否則打包不會內嵌。

## Risks / Trade-offs

- **[查詢延遲上升]** 查詢動作增加約 50–200ms 同步寫入 → 已確認接受的取捨，非驗收條件；日誌詳情僅記精簡欄位以縮小 payload。
- **[並發附加]** 日誌附加統一在 `executeWebApi` 最外層 `finally`、**於 `lock.releaseLock()` 之後**執行；Script Lock 不可重入，故日誌附加不得再次取得同一把鎖 → 單列 `appendRow` 視為原子操作；若實測發生衝突，改採獨立鎖或陣列緩衝，不改變行為需求。
- **[日誌遺失]** 寫入失敗只進 console.error → 接受少數遺失；可透過每日檢查日誌最後一列時間是否異常發現。
- **[試算表體積]** 20,000 列 × 12 欄約 24 萬儲存格 → 仍在 GAS 上限內；每日清理避免無限成長。
- **[快取計數不精確]** CacheService 過期重置 → 可能延遲容量檢查；每日清理為第二道防線。
- **[向後相容]** 既有 handler 忽略新增的 context 參數 → 需確認 Node 測試的置換函式簽章仍能運作；身份寫回不得依賴可置換路由，應由可注入授權函式取得。
- **[查詢讀取成本]** `getActivityLog` 篩選與分頁若讀取整表成本極高 → 預設 7 天、每頁 50 列、單次最多 500 筆，限制讀取範圍。
- **[試算表分享風險]** email 僅在 Web API 層限制管理員可讀 → 若試算表被共享，持有連結者可見 email；需在部署指引提醒限制試算表存取權限。

## Migration Plan

1. 合併後由管理員執行「初始化資料庫工作表」，建立操作日誌工作表與每日清理觸發器。既有試算表的《系統使用說明》維持原樣不覆寫，僅新試算表會看到新增說明。
2. 觸發器安裝保持冪等；若 GAS 觸發器配額不足，先以手動執行清理一次。
3. 回滾：`git revert` 並重新建置；已寫入的日誌工作表與既有日誌資料不會被自動刪除，可選擇保留或手動清除。
4. 無需資料遷移：既有工作表不受影響。

## Implementation Constraints

- 日誌寫入統一在 `executeWebApi` 最外層 `finally`，且必須在 `lock.releaseLock()` 之後執行；日誌附加不得再次取得同一把 Script Lock。
- 所有時間戳記使用 `Utilities.formatDate(date, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss")`；前端時間篩選採同一時區。
- `activityLogBuilders.js` 與 `activityLogger.js` 不得登錄進 `ACTION_REGISTRY`，避免攔截器遞迴。

## Open Questions

- 並發附加的實測結果若顯示衝突，是否讓日誌附加改用獨立鎖或陣列緩衝——屬實作細節，不影響行為需求與任務拆分。
