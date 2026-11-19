## 1. 共用常數與工作表初始化

- [x] 1.1 在 `gasRuntime.js` 新增並匯出 `SHEET_ACTIVITY_LOG = "操作日誌"`；以 `tests/cleanupSingleSource.test.js` 驗證新常數納入單一來源檢查。
- [x] 1.2 在 `databaseInitializer.js` 新增 `ensureActivityLogSheet_`，建立含時間戳記、請求識別碼、事件類別、動作名稱、結果、操作者 email、操作者姓名、角色、摘要、詳情 JSON、耗時（毫秒）、錯誤代碼共 12 欄的工作表，設定凍結標題列並對詳情欄位套用純文字格式 `@`；時間戳記格式使用 `Utilities.formatDate(date, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss")`；於 `initializeDatabaseSheets` 呼叫並加入建立清單；以新增 `tests/databaseInitializerActivityLog.test.js` 驗證建立、欄位、格式與既有工作表不受影響。
- [x] 1.3 在 `databaseInitializer.js` 的 `getSystemInstructionRows_()` 補充操作日誌工作表用途說明；既有試算表的說明工作表維持原樣不覆寫（沿用 `ensureXxxSheet_` 存在即返回行為），僅新試算表看到新說明；以 `npm test` 驗證無回歸。
- [x] 1.4 驗證重複初始化時日誌工作表不重複建立、既有日誌不被覆寫；以 `tests/databaseInitializerActivityLog.test.js` 的冪等情境驗證。

## 2. 動作中繼資料與摘要產生器

- [x] 2.1 在 `actionRegistry.js` 的 `ACTIONS` 為每個 action 增加 `logCategory`（`write`／`query`／`auth`）、`logLabel`、`logDetailKey`、`logEnabled` 欄位，`ping`、`getPublicConfig` 與 `getActivityLog` 設 `logEnabled: false`；新增 `getActionMeta(name)` 與必要的快取清單；以 `tests/actionRegistry.test.js` 驗證中繼資料完整且例外動作被排除。
- [x] 2.2 新增 `activityLogBuilders.js`，提供以 `logDetailKey` 為鍵的 `captureBefore(ss)` 與 `describe(before, after, payload, result)`：課程代碼匯入回傳 `{ ok, rows, stats }`，上傳筆數取 `stats.sourceRows`、展開筆數取 `rows` 或 `stats.expandedRows`，並處理驗證失敗（無 `stats`）與冪等命中（`idempotent: true`）三種形狀；系統設定與白名單回傳欄位級 before/after 明細；查詢動作僅回傳篩選、分頁與回傳筆數；`describe()` 的 payload 僅接收白名單投影（排除 `token`、`csrfToken`、`idToken`、`credential`、`rows` 與回傳內容欄位）；詳情格式含版本號；以新增 `tests/activityLogBuilders.test.js` 驗證各類明細、版本欄位與敏感欄位排除。
- [x] 2.3 驗證 `activityLogBuilders.js` 與 `actionRegistry.js` 無循環相依：以 Node 環境分別獨立 `require('activityLogBuilders.js')` 與 `require('actionRegistry.js')` 皆成功，並新增對應測試驗證（不以 `npm test` 做為循環相依的偵測手段）。

## 3. 日誌寫入模組與容量控制

- [x] 3.1 新增 `activityLogger.js`，提供 `appendActivityLog_(record, ss)`，以 `resolveDependency_` 解析工作表名稱與 Spreadsheet，內含 try/catch——寫入失敗僅 `console.error`，不拋出；以新增 `tests/activityLogger.test.js` 驗證成功寫入與失敗不阻斷。
- [x] 3.2 在 `activityLogger.js` 對 email、摘要、動作名稱等字串欄位統一截斷（上限 500 字元），並明確排除 token、原始 rows 與查詢回傳內容；以 `tests/activityLogger.test.js` 驗證超長截斷與敏感欄位不寫入。
- [x] 3.3 在 `activityLogger.js` 以 `CacheService` 計數（鍵前綴 `gas_tmpl_activitylog_`），每 100 次寫入才呼叫一次 `getLastRow()`；比照 `getOAuthNonceCache_(deps)` 提供 `deps.cache` 注入點，Node 記憶體備援不實作 TTL，過期行為由 fake cache 驗證；以 `tests/activityLogger.test.js` 驗證抽樣間隔與注入行為。
- [x] 3.4 新增每日清理函式（例如 `cleanupActivityLogRows`），於列數超過 20,000 時刪除最舊資料至 15,000，且可在 Node 測試環境注入 spreadsheet；以 `tests/activityLogger.test.js` 驗證超過上限才清理、清理數量正確、未達上限不刪除。
- [ ] 3.5 新增 `ensureActivityLogCleanupTrigger_`，以 `ScriptApp.newTrigger("cleanupActivityLogRows").timeBased().atHour(3).everyDays(1).create()` 建立每日 03:00（Asia/Taipei）觸發器，先以 `ScriptApp.getProjectTriggers()` 比對處理函式名稱避免重複建立；於初始化或部署流程呼叫；以新增 `tests/activityLogTrigger.test.js` 注入 fake `ScriptApp` 驗證首次建立與重複安裝保持冪等。

## 4. 後端攔截與讀取 API

- [ ] 4.1 在 `webApi.js` 的 `executeWebApi` 建立請求層級 log context（`requestId`、`action`、開始時間）；**將原有 try 區塊上移至 JSON 解析之前**，使解析失敗與缺少 action 亦進入 `finally`；授權由 `executeWebApi` 透過可注入的授權函式取得 session 並寫回 context（`email`、`name`、`role`），角色顯示名稱由 `getRoleDisplayName(session.role)` 取得，**不得讀取不存在的 `session.roleName`**；公開登入動作成功時從回傳結果補寫已驗證身份；以新增 `tests/webApiActivityLog.test.js` 驗證 context 建立與身份寫回，**並測試 `module.exports.routeWebApiAction` 被置換的情境**。
- [ ] 4.2 在 `executeWebApi` 最外層 `finally`、**`lock.releaseLock()` 之後**依 context 統一寫入一列日誌（日誌附加不得再次取得同一把 Script Lock），覆蓋成功、失敗、授權失敗、CSRF 失敗、JSON 解析失敗與缺少 action；失敗情境標記未驗證身份並記錄錯誤代碼；`ping`、`getPublicConfig`、`getActivityLog` 不寫入；以 `tests/webApiActivityLog.test.js` 逐一驗證各情境。
- [ ] 4.3 在攔截器中依 `getActionMeta` 呼叫 `captureBefore`（若定義）並於 handler 後呼叫 `describe`（傳入白名單投影 payload），將結果寫入詳情 JSON；以 `tests/webApiActivityLog.test.js` 驗證寫入動作含 before/after 明細、查詢動作僅含彙總指標、敏感欄位不入日誌。
- [ ] 4.4 在 `actionRegistry.js` 登錄 `getActivityLog: { roles: ["admin"], logEnabled: false }`，並於 `webApi.js` 新增 `handleGetActivityLogWebApiAction_`，僅 admin 可呼叫；回傳結構 `{ ok: true, rows, total, page, pageSize }`，時間區間預設最近 7 天（Asia/Taipei）、每頁 50 列、單次最多 500 筆，依時間戳記遞減排序；以 `tests/webApiActivityLog.test.js` 驗證管理員可讀、非管理員被拒與查詢限制。
- [ ] 4.5 註冊 `getActivityLog` handler 並確認 `registerWebApiActionHandlers_` 與 RBAC 矩陣一致；以 `tests/actionRegistry.test.js` 與 `npm test` 驗證。
- [ ] 4.6 修改 `actionRegistry.js` 的 `buildRolePermissions()`，將 admin 由 `["*"]` 通配改為明確列舉所有 action（含 `getActivityLog`），移除萬用字元；同步更新相關註解並回歸 `tests/api.test.js` 等 RBAC 測試；以 `npm test` 與 `tests/actionRegistry.test.js` 驗證管理員權限清單無 `*` 且含所有 action。

## 5. 前端操作日誌頁籤

- [ ] 5.1 在 `webapp/js/config.js` 新增操作日誌頁籤定義（名稱、圖示、僅管理員可見旗標），並同步更新 `tests/webappConfig.test.js` 中 `tabs.length === 4` 的既有斷言為 5；以新增 `tests/webappConfigTabs.test.js` 與既有 `tests/webappConfig.test.js` 驗證頁籤存在、權限旗標正確且無回退。
- [ ] 5.2 新增 `webapp/js/activityLog.js`，實作清單渲染、時間區間（Asia/Taipei 日期區間）／操作者／事件類別篩選、分頁控制與詳情 JSON 展開；表格標頭具 `scope="col"`、展開按鈕具 `aria-expanded`、篩選控制項具標籤；以新增 `tests/webappActivityLogRenderView.test.js` 驗證渲染與無障礙屬性。
- [ ] 5.3 在 `webapp/js/api.js` 新增 `getActivityLog` 呼叫（沿用 `text/plain;charset=utf-8` 避開 OPTIONS 預檢）；在 `webapp/js/mock.js` 補模擬日誌資料與 action 處理（遵循既有 `actionHandlers` 的 6 空格縮排格式以通過完整性檢查）；以 `tests/webappMockHandle.test.js` 驗證 mock 回傳格式。
- [ ] 5.4 在 `webapp/js/ui.js` 的 `renderNavbar()` 依頁籤權限旗標與 `MEA.state.user.role` 過濾頁籤，並在 `webapp/js/app.js` 的 `setTab()`／`buildBodyHtml()` 加入同一守門，防止直接竄改 state 進入管理員頁籤；以 `tests/webappUiRenderOverviewView.test.js` 與新增測試驗證角色可見性與直接竄改防護。
- [ ] 5.5 於 `webapp/styles.css` 補齊新頁籤所需 class，通過 `npm run check:ui-classes`、`npm run check:contrast`、`npm run check:a11y`。
- [ ] 5.6 在 `webapp/index.html` 的 `BUILD:JS` 區塊加入 `<script src="js/activityLog.js"></script>`，位置於 `accounts.js` 之後、`app.js` 之前；以 `npm run build:webapp` 確認內嵌順序正確。

## 6. 文件、建置與驗證

- [ ] 6.1 更新 `README.md`、`AGENTS.md` 與 `docs/architecture-guide.html`，說明操作日誌工作表、管理員頁籤、20,000 列清理閾值與每日觸發器清理機制；調整 `scripts/languageCheck.js` 的 `EXCLUDED_DIRECTORIES` 使 `openspec` 目錄納入語言檢查（或另加 CI 步驟檢查 `openspec/changes/**`），修復語言閘門對提案文件失效的漏洞；以 `npm run check:lang` 驗證全專案（含 OpenSpec 文件）皆為臺灣繁體中文與用語規範。
- [ ] 6.2 執行 `npm run build:webapp`，確認 `index.html` 內嵌 `activityLog.js` 且順序正確（依 5.6 之樣板註冊）；連續兩次建置雜湊一致；以 `sha256sum` 比對驗證。
- [ ] 6.3 執行完整品質閘門：`npm test`、`npm run format:check`、`npm run check:lang`、`npm run check:ui-classes`、`npm run check:contrast`、`npm run check:a11y`、`npm run test:coverage`、`npm run check:coverage`、`CHANGED_COVERAGE_BASE=main npm run check:changed-coverage`、`npm run check:complexity`，全部通過且不得低於基準線。
- [ ] 6.4 執行 `openspec validate "add-activity-logging" --strict`，確認 5 份產物（proposal、design、兩份 spec、tasks）與所有任務完成、規格驗證通過。
