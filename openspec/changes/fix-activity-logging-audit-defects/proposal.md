# Proposal: 修復操作日誌稽核缺陷

## Why

PR #4 合併後的五軸審查發現一項可實際利用的遠端權限提升漏洞，以及多項使稽核核心失效的正確性缺陷；現有品質閘門因測試使用假工作表與直接呼叫內部函式而全數未攔截。若不及時修復，管理員將查不到任何日誌或只見空明細，且任何已登入使用者可提升為管理員讀取日誌、寫入系統設定與授權名單。

## What Changes

- **封閉授權繞過（Critical）**：`routeWebApiAction` 不再接受外部傳入的 `authorizationOverride` 參數，路由一律自行向伺服器端 session 驗證；CSRF 比對必須使用伺服器端 session 的 token，不得信任請求自帶的 session。（`webApi.js`）
- **修復變動明細（Critical）**：詳情不再於攔截器先做通用白名單投影而丟失 `settings`／`accounts`；改由詳情產生器自身的欄位級白名單處理原始 payload，並補整合測試確保正式路徑的 `detail.變動` 非空。（`webApi.js`、`activityLogBuilders.js`、`tests/`）
- **修復時間戳記型別（Critical）**：初始化時對時間戳記欄套用純文字格式，讀取端並將 `Date` 物件正規化為 Asia/Taipei 格式字串，確保日期篩選與遞減排序正常。（`databaseInitializer.js`、`webApi.js`）
- **修復 HTTP 入口漏寫日誌（Critical）**：`doPost` 不再提前回傳 `invalid_json`／`missing_action`，改由 `executeWebApi` 最外層 `try/finally` 統一處理，使這兩條失敗路徑也寫入恰好一列日誌。（`webApi.js`、`tests/webApiDoPost.test.js`）
- **詳情 JSON 納入 500 字元截斷**：截斷後仍需保持可解析的版本化 JSON 結構，並補測試鎖住上限。（`activityLogger.js`、`tests/`）
- **強化日誌查詢驗證**：`getActivityLog` 增加有效曆法日期與 `startDate <= endDate` 驗證；改由尾端分批讀取並提前終止，不再一次讀取整張工作表；`durationMs` 缺欄位回傳 `null` 而非 `NaN`；`category` 比對不分大小寫。（`webApi.js`、`tests/`）
- **失敗請求不產生誤導明細**：僅於動作結果成功時計算變動，失敗請求明確標記「未執行」，避免「變動欄數 > 0」與 `failure` 並存。（`webApi.js`、`tests/`）
- **補齊 a11y 稽核夾具**：`a11yHarness` 加入 `activityLog` 頁籤的 ready／展開／空結果，以及非管理員守門夾具，讓 `check:a11y` 真正覆蓋新畫面。（`tests/helpers/a11yHarness.js`）
- **補強敏感資料與關鍵路徑測試**：新增巢狀物件、陣列與大小寫變體的外洩測試，以及 `lock_timeout`／CSRF 失敗的日誌寫入驗證。（`tests/`）
- **移除孤兒／不可達元素**：刪除只寫不讀的 `SAMPLED_LAST_ROW_CACHE_KEY` 與寫入端抽樣機制、不可達的 `SENSITIVE_RECORD_KEYS` 判斷、未使用的 `after` 參數與 `afterSnapshot` 擷取；容量清理維持由每日排程獨立執行。（`activityLogger.js`、`webApi.js`、`activityLogBuilders.js`）
- **調整快照時點**：將變動前快照的擷取移到成功取得 Script Lock 之後，避免併發寫入時讀到已被其他請求更新的值；補併發情境的可驗證測試。（`webApi.js`、`tests/`）
- **前端非行為性調整**：`requestId` 改由 `data-*` 承載並以事件監聽器綁定，移除 inline `onclick` 的 JS 字串插值；重新整理按鈕於載入中停用；頁碼收斂至總頁數；統一錯誤訊息轉譯出口。管理員頁籤守門邏輯不變。（`webapp/js/activityLog.js`）

## Capabilities

### New Capabilities

- 無。

### Modified Capabilities

- `activity-logging-and-auditability`：修正明細完整性、時間戳記寫入型別、HTTP 入口漏寫、詳情截斷、查詢驗證與容量治理機制的行為契約。
- `security-and-rbac-hardening`：新增「路由不得信任外部授權結果」需求，封閉 `authorizationOverride` 攻擊面。

## Impact

- **後端**：`webApi.js`、`activityLogBuilders.js`、`activityLogger.js`、`databaseInitializer.js`；不新增外部相依，不變更對外 API 的 action 名稱。回傳形狀有三處向後相容的調整：`durationMs` 缺值由 `NaN` 改為 `null`（錯誤修正）；`getActivityLog` 在因讀取上限提前終止時新增選用欄位 `truncated: true`，正常完整讀取時不出現，且該情境下 `total` 的語意明確定義為已掃描範圍內的符合筆數（下限，非精確總數）；詳情 JSON 在超長降級時新增 `截斷: true` 標記，未超長時不出現。既有欄位名稱與型別維持不變，前端無需配合修改即可運作。
- **前端**：僅測試夾具與下列非行為性調整——`requestId` 移出 inline `onclick` 改採 `data-*` + `addEventListener`；重新整理按鈕於載入中停用；頁碼收斂至總頁數；統一錯誤訊息轉譯出口。不變更管理員頁籤守門邏輯。
- **資料**：既有日誌工作表的時間戳記若已被轉為 `Date`，讀取端正規化可向後相容，無需資料遷移；仰賴部署環境的 `appsscript.json` 維持 `Asia/Taipei`。
- **相容性**：`routeWebApiAction` 由 4 參數回到 3 參數，既有 3 參數呼叫不受影響；以注入方式驗證授權的既有測試仍可運作。
