## Why

目前系統缺少操作軌跡：管理者無法回答「誰在什麼時間匯入了多少筆課程代碼」「誰改了系統參數、改了什麼」「是否有異常的登入嘗試」。隨著班級人數匯入、配課存檔、教科書設定等功能即將加入，若不先建立可擴充的日誌骨幹，日後每個新動作都要補寫記錄邏輯，容易遺漏且格式不一致。

現在建立的好處是：`ACTION_REGISTRY` 已是動作單一來源，只要把日誌中繼資料登錄進去，新動作就能自動納入；同時讓前端第一版就具備可查閱的介面，避免日誌成為只能靠工程師手動翻試算表的隱形資料。

## What Changes

- **新增「操作日誌」工作表**：於資料庫初始化時建立 `SHEET_ACTIVITY_LOG`，含表頭、凍結列與純文字格式；既有試算表執行初始化時會自動長出該表，不影響既有工作表。
- **新增請求層級日誌攔截器**：在 `executeWebApi` 建立 log context（requestId、開始時間、action），並將 try 區塊上移至 JSON 解析之前，使解析失敗與缺少 action 亦能寫入日誌；授權成功後寫回 session 身份（角色顯示名稱由 `getRoleDisplayName(session.role)` 產生），並在最外層 `finally` 統一寫入一列。覆蓋寫入動作、登入登出、失敗嘗試與查詢動作。公開的 `login`／`loginWithActiveUser` 成功時從回傳結果補寫已驗證身份。
- **新增動作日誌中繼資料**：`ACTION_REGISTRY` 的每個 action 增加 `logCategory`（write／query／auth）、`logLabel`、`logDetailKey`、`logEnabled` 四項宣告式欄位，並提供 `getActionMeta(name)`；`ping`、`getPublicConfig` 與 `getActivityLog` 標記 `logEnabled: false`，避免心跳與日誌查閱自我增生。
- **全面明確列舉角色權限**：修改 `buildRolePermissions()` 讓 `admin` 也逐項列舉允許的 action，移除 `["*"]` 通配規則；`getActivityLog` 僅授權 `admin`。此變動需同步回歸 RBAC 相關測試。
- **新增摘要產生器模組**：`activityLogBuilders.js` 依 `logDetailKey` 提供 `captureBefore(ss)` 與 `describe(before, after, payload, result)`，產生彙總指標與結構化 before/after 變動明細。與 `actionRegistry.js` 分離以避免後端模組循環相依。
- **新增日誌寫入模組**：`activityLogger.js` 負責 append、try/catch 防護（寫日誌失敗只進 `console.error`，不阻斷主動作）、欄位字串截斷、容量抽樣檢查與滾動清理。
- **容量與清理機制**：日誌觸發閾值 20,000 列（此為清理閾值，非硬性上限，允許短暫超過直到每日清理）；以 `CacheService` 計數，每 100 次寫入才檢查一次 `getLastRow()`；實際清理交由每日 03:00（Asia/Taipei）GAS 時間驅動觸發器執行，將 20,000 列裁到 15,000，使用者請求不參與大量列刪除。
- **新增前端「操作日誌」頁籤**：僅系統管理員可見；提供依時間、操作者、動作類別篩選與分頁，並可展開單列的 JSON 明細。時間戳記與篩選統一採用 Asia/Taipei 時區；查詢預設僅回傳最近 7 天、每頁 50 列、單次最多 500 筆，以控制讀取整張工作表的成本。新增 `getActivityLog` action（僅 admin 可呼叫，且本身不寫日誌）。
- **安全與隱私底線**：不記錄 CSRF／session token、原始上傳 rows、查詢回傳內容；email 不遮罩但僅管理員可查（試算表本身的存取權限亦須限制）；寫入失敗不影響主流程。日誌工作表含 12 欄：原有十欄加上「耗時(ms)」與「錯誤代碼」。
- **文件與測試同步**：更新《系統使用說明》工作表、README／AGENTS、技術文件與 OpenSpec 主規格；新增路由覆蓋、session 寫回、失敗 JSON 解析、容量滾動、before/after diff、RBAC 過濾與前端頁籤渲染等測試。

## Capabilities

### New Capabilities

- `activity-logging-and-auditability`: 定義操作日誌的完整行為——工作表建立、請求層級攔截與身份寫回、動作中繼資料登錄、彙總與結構化變動明細、容量滾動與離峰清理、前端管理員頁籤，以及失敗防護與資料最小化原則。

### Modified Capabilities

- `security-and-rbac-hardening`: 新增 `getActivityLog` 動作的明確角色權限定義（僅 `admin` 可呼叫），並將管理員角色由 `["*"]` 通配改為明確列舉所有 action，其餘角色維持既有明確列舉方式。

## Impact

- **後端模組**：`gasRuntime.js`（新工作表名稱常數）、`actionRegistry.js`（日誌中繼資料、存取子與管理員明確列舉）、`webApi.js`（`executeWebApi` 最外層攔截點、try 區塊上移、可注入授權函式與 `getActivityLog` handler）、`databaseInitializer.js`（`ensureActivityLogSheet_`、系統使用說明與每日清理觸發器安裝）、新增 `activityLogBuilders.js` 與 `activityLogger.js`。
- **前端模組**：`webapp/js/config.js`（頁籤）、`webapp/js/api.js`（action）、`webapp/js/mock.js`（模擬資料）、`webapp/js/ui.js`（串接）、新增 `webapp/js/activityLog.js`；`webapp/styles.css` 依需要新增樣式。
- **建置產物**：重新執行 `npm run build:webapp`，確認 `index.html` 內嵌順序與一致性。
- **自動化與維運**：新增每日 GAS 觸發器清理日誌；CI 品質閘門（_format:check_、_check:lang_、_check:a11y_、_check:coverage_、_check:changed-coverage_、_check:complexity_）需全數通過。
- **效能取捨**：查詢動作因同步寫入日誌，預期增加約 50–200ms 延遲；前端 Promise 不阻塞畫面，但回應時間會略微增加。此取捨已確認接受，以換取日誌即時可查。
- **依賴**：`CacheService`（容量計數，鍵前綴 `gas_tmpl_activitylog_`）、`LockService`（既有寫入鎖）、`ScriptApp`（每日清理觸發器）、`Utilities.formatDate`（時間戳記，時區 Asia/Taipei）；無新增外部套件。
