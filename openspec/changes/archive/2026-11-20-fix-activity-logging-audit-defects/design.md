## Context

本變更針對已合併的 `add-activity-logging`（PR #4）之審查結果。詳見 `proposal.md - Why`。現行實作已具備 12 欄工作表、最外層 `finally` 寫日誌、RBAC 明確列舉與每日清理觸發器，但審查以唯讀動態重現確認了四項 Critical 與多項正確性／驗證缺口。所有問題皆因測試使用假工作表回傳字串、或直接呼叫內部函式而未被現有閘門攔截，因此本設計同時要求「實作修正」與「會在回退時失敗的回歸測試」。

關鍵約束：

- GAS 全域函式可經 `google.script.run` 直接呼叫，任何公開參數都視為不可信輸入。
- `appendRow` 採試算表值的隱含型別轉換，日期格式字串可能被轉為 `Date` 物件。
- 試算表讀取與 `getLastRow()` 皆為配額成本，查詢與寫入路徑都必須有明確上界。
- 專案語言規範為臺灣繁體中文，文件、註解、訊息與 Commit 皆須通過 `check:lang`。

## Goals / Non-Goals

**Goals:**

- 封閉 `authorizationOverride` 攻擊面，使路由的公開參數無法影響身份驗證與 CSRF 結果。
- 讓 `saveSystemSettings`／`saveWhitelist` 在正式請求路徑產生完整且正確的變動明細，同時維持敏感欄位不外洩。
- 讓管理員在任何時間戳記型別下都能查到日誌，並將單次讀取量限制在有上界的分批範圍。
- 讓 `invalid_json`／`missing_action` 兩條 HTTP 失敗路徑也寫入恰好一列日誌。
- 移除已確認的孤兒／不可達元素，降低後續維護的認知負擔。
- 補齊能在缺陷回退時失敗的測試與 a11y 夾具。

**Non-Goals:**

- 不重新設計日誌欄位、action 名稱、RBAC 角色模型或每日清理排程。
- 不遷移既有日誌資料；讀取端正規化即可向後相容。
- 不變更 `Content-Type: text/plain;charset=utf-8` 通訊協議或 GIS 登入流程。
- 不執行任何 `clasp push`／`npm run push` 部署指令。

## Decisions

### 1. 路由授權：移除第 4 參數，回到自建授權

`routeWebApiAction(action, payload, event, authorizationOverride)` 改回三參數。`executeWebApi` 仍自行呼叫一次授權以寫回 log context，但不再把結果傳給路由；路由內部再次呼叫同一個注入點取得授權。

- **理由**：這是最小且可驗證的修正；GAS 無法可靠地隱藏全域函式，任何「私有 closure 路由」仍需面對 `google.script.run` 可呼叫的現實。移除參數後，攻擊者沒有可傳入的信任錨點。
- **代價**：每次受保護請求會讀取兩次 CacheService。相較於權限提升風險，此成本可接受。
- **替代方案**：保留第 4 參數但重新向 CacheService 驗證 session token ↔ payload token。缺點是信任邊界仍模糊，且日後容易被再次誤用，故不採。
- **測試相容性**：多數測試以 `withStubbed(api, "authorizeWebApiAction", ...)` 注入授權，兩次呼叫都會用到同一個 stub；但 `tests/webApiActivityLog.test.js:141–160` 直接對路由的**第 4 個位置參數**做斷言（`seen[0].authorization.ok`、`session === null`），移除參數後必然失敗，須改為統計 stub 被呼叫兩次且引數一致。此修正已列入 tasks 1.3。
- **極端情境**：兩次授權之間存在毫秒級 TOCTOU 視窗；若 session 恰在此時過期，日誌會記錄已驗證身份但請求被拒。此情況不會提權，僅造成稽核欄位與結果不一致，將於註解說明。

### 2. 變動明細：責任單一化，由產生器自行投影

- `webApi.js` 的 `buildActivityLogRecord_` 不再呼叫 `builders.projectPayload`，直接把原始 `payload` 傳給 `describe()`。
- `activityLogBuilders.js` 的 `describe()` 調度器移除內部的第二次 `projectPayload_`，把原始 payload 交給各 builder。
- `auth`／`query` builder 已各自呼叫 `projectPayload_`；`systemSettings` 以 `SYSTEM_SETTING_LABELS` 做欄位級白名單（`SENSITIVE_SETTING_KEYS` 為日後新增標籤時的額外保險，目前標籤表本就未含敏感欄）；`whitelist` 只讀 `accounts[].email`。因此敏感欄位防護仍完整，且改由「最接近資料的產生器」負責。
- **理由**：通用投影會把 `settings`／`accounts` 折疊成 `[物件]`，正是明細消失的根因。讓每個產生器宣告自己需要哪些欄位，比在上游猜測更可靠。
- **替代方案**：建立結構化投影，明确保留 `settings`／`accounts` 並逐欄清除敏感鍵。缺點是與產生器白名單重複，兩者日後仍可能漂移，故不採。
- **配套測試**：修正 `tests/webApiActivityLog.test.js` 中「`describe` 只收到 `{ action: ... }`」的預期；新增走完整 `executeWebApi` 後 `detail.變動` 非空的整合測試。

### 3. 時間戳記：寫入前格式化 + 讀取端正規化（雙保險）

- `databaseInitializer.js` 建立工作表時，對第 1 欄與第 10 欄一併套用 `setNumberFormat("@")`，覆蓋範圍放大到既有初始化可用範圍。
- `webApi.js` 讀取日誌時，以 `normalizeActivityLogTimestamp_(value)` 處理：`value instanceof Date` 時優先使用 `Utilities.formatDate(value, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss")`；Node 測試環境缺少 `Utilities` 時，改以固定的 `+8` 小時偏移量手動格式化（不得仰賴測試機器的當地時區），否則 `String(value)`；比較與排序都使用正規化後的字串。
- **理由**：單靠工作表格式無法保證既有列或超出格式化範圍的新列不被轉換；讀取端正規化可向後相容既有已轉為 `Date` 的資料，無需遷移。明確的降級分支可讓 Node 測試驗證 Asia/Taipei 結果，不受 CI 時區影響。
- **替代方案**：改用 `Range.setValues()` 的 RAW 語意寫入。缺點是需要先取得最後一列，與「寫入路徑不掃描整表」衝突，故不採。

### 4. HTTP 入口：讓解析失敗流進最外層攔截

`doPost` 保留可注入的 `parseWebApiPayload` 呼叫，但把例外轉為 `payload = null` 後**不提前回傳**，直接交給 `executeWebApi(payload, e)`。`executeWebApi` 既有邏輯已把 `null`／非物件視為 `invalid_json`，且在 `try` 內處理、在 `finally` 寫日誌。

- **理由**：改動最小，保留注入點與既有錯誤代碼，同時讓兩條失敗路徑自然獲得日誌。
- **替代方案**：把原始字串直接交給 `executeWebApi` 解析。缺點是會繞過 `parseWebApiPayload` 注入點，破壞 `tests/webApiDoPost.test.js` 的隔離測試，故不採。
- **配套測試**：`tests/webApiDoPost.test.js` 增加「解析失敗／缺少 action 時 `appendActivityLog` 各被呼叫一次」的斷言。

### 5. 詳情截斷：序列化後檢查，降級為有效的精簡 JSON

在 `buildActivityLogRecord_` 序列化詳情後檢查長度（上限 500 字元）。採**逐級降級**且每級都重新序列化驗證：

1. 第一級：捨棄 `變動`，保留 `版本`／`動作`／`指標`，加入 `截斷: true`。
2. 第二級：對 `指標` 套用欄位級白名單——只保留數字型指標，字串型指標（例如 `query` 產生器的 `指標.篩選`，可能直接來自超長 `email`／`category`）改為固定短字串「已省略」，並重新檢查長度。
3. 第三級：只保留 `版本`／`動作`（動作字串另設長度上限）／`截斷: true`，移除全部指標。

`activityLogger.js` 的最後防線**不得**對 `detail` 直接 `slice(0, 500)`；改為呼叫同一個降級函式，或在 JSON 解析失敗時以最小合法 JSON（`{"版本":1,"動作":"","指標":{},"截斷":true}`）取代，確保任何路徑寫入的都是可解析的 JSON。

- **理由**：審查實測可產生 632–813 字元的詳情 JSON；若只捨棄 `變動`，超長 `email`／`category` 仍會讓 `指標.篩選` 超長，最後防線硬切字串反而產生不可解析 JSON，直接違反 spec。逐級降級同時處理「變動」與「指標」兩個來源。
- **代價**：超長請求的明細與字串型指標會被捨棄，查閱者只能看到 `截斷: true` 與數字型指標。取捨上優先保證「可解析且長度合規」。
- **替代方案**：在每個產生器限制字串長度。缺點是產生器眾多、易遺漏，且無法保證組合後仍低於 500 字元，故不採。

### 6. 查詢驗證與分批讀取

- `resolveActivityLogDateRange_` 增加有效曆法檢查（以 `new Date(y, m-1, d)` 比對年月日，避開時區偏移）與 `startDate <= endDate` 檢查；無效時回傳明確錯誤 `invalid_date_range`，不回退、不靜默回空。
- `handleGetActivityLogWebApiAction_` 由最後一列往前以 `ACTIVITY_LOG_READ_BATCH_SIZE`（500 列）分批 `getRange(...).getValues()`；每批正規化時間戳記後套用篩選，直到「該批最舊時間早於 `range.start`」再**多讀一批才停止**（容忍鎖外產生時間戳記造成的輕微順序錯置），或「累積掃描達 `ACTIVITY_LOG_MAX_SCAN_ROWS`」為止。**僅後者**設 `truncated: true`；前者屬正常完整讀取，不標註且 `total` 精確。
- `truncated: true` 時，`total` 的語意明確定義為「已掃描範圍內的符合筆數，屬下限」，不得宣稱精確；此語意已寫入 spec 並由場景固定。
- `durationMs` 缺值（`""`／`null`／`undefined`）一律回 `null`；`category` 比對兩側 `toLowerCase()`。
- **理由**：管理員指定的日期區間是明確意圖，靜默回退會讓查閱者誤以為查到正確結果；分批讀取則把單次最大讀取量從整表（最多 20,000×12 格）降到有界批次，同時在日期視窗內保持總數精確。多讀一批是為了彌補時間戳記在解鎖後產生、可能與列順序不完全一致的既有特性。
- **代價**：極寬日期區間若超過 `ACTIVITY_LOG_MAX_SCAN_ROWS`，`total` 為下限且分頁可能不完整；此限制透過 `truncated` 旗標與文件揭露，而非隱瞞。
- **替代方案**：(a) 改以「跨出時間區間」為唯一終止條件 — 缺點是極寬區間仍可能掃描整表；(b) 把時間戳記產生移到鎖內 — 缺點是日誌寫入必須在解鎖後執行，重構風險較高。故採「有界掃描 + 明確下限語意 + 多讀一批」的組合。

> 註：此處已裁決採用明確錯誤，`proposal.md` 的 Impact 已揭露選用回傳欄位 `truncated`，不再列為 Open Question。

### 7. 失敗請求不記載變動

`buildActivityLogRecord_` 在呼叫 `describe()` 後，若 `result && result.ok === false`，清除 `detail.變動` 並寫入 `指標.執行 = "未執行"`。此做法保留 `importCourseCodes` 既有的「統計不適用／冪等命中」標記，只移除會誤導的系統設定與授權名單變動。

- **理由**：審查發現 CSRF 失敗時 handler 根本未執行，日誌卻仍出現「新增成員／變動欄數 > 0」並與 `failure` 並存，稽核上嚴重誤導。
- **代價**：失敗請求的明細精簡為「未執行」，無法觀察到「原本打算改什麼」。考量失敗動作的意圖可由 payload 與摘要推測，且不應與實際變動混淆，此取捨可接受。
- **替代方案**：連 `beforeSnapshot` 也一併跳過。缺點是成功路徑仍須擷取快照，改成依結果條件擷取會讓時點控制更複雜，故不採。

### 8. 孤兒元素清理

- 移除 `SAMPLED_LAST_ROW_CACHE_KEY`、`WRITE_COUNT_CACHE_KEY`、`LAST_ROW_SAMPLE_INTERVAL`、`bumpWriteCount_`，以及 `cleanupActivityLogRows` 中更新該快取的程式碼。容量治理完全由每日 03:00 觸發器負責，寫入路徑不再有任何取樣或整表掃描。
- 移除 `SENSITIVE_RECORD_KEYS` 與 `buildActivityLogRow_` 中永不成立的判斷；安全性由 12 欄白名單本身提供。
- 移除 `after` 參數、`afterSnapshot` 擷取，以及描述中的相關註解；差異計算只需「前快照 + 請求新值」。
- `beforeSnapshot` 擷取時點由「取得鎖之前」移到「成功取得鎖之後」，避免併發寫入時讀到已被其他請求更新的值。

- **理由**：`saveSystemSettings`／`saveWhitelist` 屬 `locked` action；在鎖外讀取快照可能讀到另一請求已送出的新值，使「前值」失真。移入鎖內後，快照與寫入在同一臨界區，差異計算才可信。
- **代價**：非鎖定動作仍維持原有順序，不增加額外延遲；鎖定動作在等待鎖期間不讀取工作表，反而降低無效讀取。
- **替代方案**：維持鎖外擷取但標註快照可能不精確。缺點是明細可信度下降，與稽核目標抵觸，故不採。

### 9. 前端非行為性調整與 a11y 夾具

- `requestId` 改由 `data-request-id` 承載並以 `addEventListener` 綁定，移除 inline `onclick` 中的 JS 字串插值。
- 「重新整理」按鈕於 `state.loading === true` 時禁用；頁碼以總頁數收斂；兩條錯誤路徑統一走 `resolveSafeMessage`。
- `tests/helpers/a11yHarness.js` 的 `collectFixtures()` 加入 `activityLog` 的 ready／展開／空結果，以及非管理員守門夾具。

- **理由**：inline `onclick` 中的 JS 字串插值仰賴 `requestId` 字元集安全，屬脆弱模式；目前雖不可利用，但日後識別碼來源改變即形成 XSS。a11y 夾具缺口則讓 `check:a11y` 綠燈卻未稽核新畫面。
- **代價**：事件監聽器需處理渲染後重新綁定，但現有渲染為整段 HTML 重建，無重複綁定問題。
- **替代方案**：保留 inline handler 並額外跳脫單引號。缺點是 HTML 與 JS 兩層語意混用，易再次出錯，故不採。

## Risks / Trade-offs

- **[兩次授權讀取]** → 受保護請求多一次 CacheService `get`；以壓力測試確認可忽略，並在註解說明原因。
- **[移除通用投影]** → 若日後新增產生器忘了自行過濾，可能外洩敏感欄位 → 以 `activityLogModuleIndependence.test.js` 與新增的巢狀／大小寫變體外洩測試守住，並在產生器註解標明「投影責任在產生器」。
- **[讀取端正規化]** → `Utilities.formatDate` 在 Node 測試環境不存在 → 以固定 `+8` 小時偏移的降級分支處理（不仰賴測試機器時區），並補 `Date` 物件假資料測試。
- **[分批讀取提前終止]** → 極寬日期區間可能只讀到部分資料 → 回傳 `truncated: true`，文件明確說明此旗標語意。
- **[移除寫入取樣]** → 寫入當下不再有任何容量感知 → 原本取樣值也未被讀取，屬移除死碼；20,000／15,000 的清理語意不變。
- **[測試重寫]** → `tests/webApiDoPost.test.js` 與 `tests/webApiActivityLog.test.js` 的既有預期需調整 → 同步修改並確認新測試在缺陷回退時會失敗。

## Migration Plan

1. 依 tasks.md 順序修改後端模組與前端非行為性調整。
2. 更新受影響測試與 a11y 夾具，先確認新測試在舊實作下會失敗，再確認修正後全數通過。
3. 執行完整品質閘門：`npm test`、`format:check`、`check:lang`、`check:ui-classes`、`check:contrast`、`check:a11y`、`build:webapp`、`test:coverage`、`check:coverage`、`check:changed-coverage`、`check:complexity`。
4. 依 OpenSpec 流程同步 delta specs 並歸檔 change；由使用者決定是否另行 commit／開 PR。
5. 不執行任何 GAS 部署；部署與線上驗證由使用者自行安排。

## Open Questions

- `truncated: true` 是否需同步顯示於前端提示？本設計先只加回傳欄位（已於 `proposal.md` 的 Impact 揭露），前端提示列為可選跟進項目，不影響本變更的規格與任務。
