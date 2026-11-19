## 1. 緊急安全修正

- [x] 1.1 移除 `webApi.js` 中 `routeWebApiAction` 的 `authorizationOverride` 第 4 參數，改為函式內自行呼叫授權注入點；確認 `executeWebApi` 不再傳入授權結果，並以 `node -e` 重現「偽造 admin 授權呼叫 `getActivityLog` 與 `saveSystemSettings` 皆被拒絕」後通過
- [x] 1.2 新增安全回歸測試：以 GAS RPC 角度直接呼叫三參數路由並傳入自訂 session／CSRF，斷言回傳 `missing_token` 或 `forbidden` 且未寫入任何資料，並確認 `npm test` 通過
- [x] 1.3 修正 `tests/webApiActivityLog.test.js:141–160` 中對路由第 4 參數的直接斷言（`seen[0].authorization.ok`、`session === null`），改為統計 `authorizeWebApiAction` stub 被呼叫兩次且引數一致；並確認 `tests/webApiRouteWebApiAction.test.js` 等以注入方式驗證授權的測試全數通過

## 2. 稽核明細與寫入正確性

- [x] 2.1 讓 `webApi.js` 的 `buildActivityLogRecord_` 直接將原始 `payload` 傳給 `builders.describe()`，移除呼叫前的 `projectPayload` 投影；以注入的假 `builders.describe` 斷言收到的 payload 仍含 `settings`／`accounts` 原始內容
- [x] 2.2 移除 `activityLogBuilders.js` 的 `describe()` 調度器內部第二次 `projectPayload_` 呼叫，使各產生器自行負責投影；確認 `auth`／`query` 仍各自呼叫 `projectPayload_`，`systemSettings`／`whitelist` 仍使用欄位級白名單
- [x] 2.3 一次修正 `tests/webApiActivityLog.test.js` 同一測試區塊的三處預期：「`describe` 只收到白名單投影」（約 399 行）、`captureBefore` 被呼叫兩次（約 393–394 行，`snap-0`／`snap-1`）、`calls[2][3] === "snap-1"`（約 398 行，afterSnapshot）；改為只呼叫一次且第三個引數不再傳入快照。另新增走完整 `executeWebApi` 後 `saveSystemSettings` 的 `detail.變動` 非空、`saveWhitelist` 同時含新增與移除成員的整合測試，並補 `accounts` 非陣列時不拋錯（回傳空變動）的防護與測試；確認缺陷回退時測試會失敗
- [x] 2.4 在 `databaseInitializer.js` 建立日誌工作表時，對第 1 欄與第 10 欄套用 `setNumberFormat("@")` 並放大格式化範圍；既有工作表路徑（`ensureActivityLogSheet_` 早退前）亦補上相同的純文字格式設定，不覆寫資料且保持冪等；補初始化與既有表兩條測試驗證兩欄皆設為純文字
- [x] 2.5 在 `webApi.js` 新增 `normalizeActivityLogTimestamp_(value)`：`Date` 物件優先以 `Utilities.formatDate(value, "Asia/Taipei", "yyyy-MM-dd HH:mm:ss")` 正規化，Node 缺少 `Utilities` 時改用固定 `+8` 小時偏移格式化（不仰賴測試機器時區），其餘轉字串；套用於 `getActivityLog` 的比較與排序，並補「假工作表回傳 `Date` 仍能查到且排序正確」的測試
- [x] 2.6 讓 `doPost` 保留可注入的 `parseWebApiPayload` 呼叫但移除提前回傳：解析例外轉為 `payload = null`，統一交給 `executeWebApi`；更新 `tests/webApiDoPost.test.js` 斷言兩條失敗路徑各寫入一列日誌
- [x] 2.7 在 `buildActivityLogRecord_` 序列化詳情後檢查 500 字元上限，採逐級降級：先捨棄 `變動`；仍超限時只保留數字型指標、字串型指標改為「已省略」；仍超限時則只留 `版本`／`動作`（含長度上限）／`截斷: true`，每級重新序列化驗證。`activityLogger.js` 的最後防線不得對 `detail` 直接 `slice`，改呼叫同一降級函式，或以解析失敗時的最小合法 JSON 取代；補測試覆蓋超長 `email`／`category`（驗證 `指標.篩選` 來源）與超長 `action`，斷言長度 ≤ 500 且 `JSON.parse` 成功
- [x] 2.8 於 `result && result.ok === false` 時清除 `detail.變動` 並寫入 `指標.執行 = "未執行"`，同時保留 `importCourseCodes` 的統計標記；補 CSRF 失敗不產生誤導明細的測試

## 3. 查詢驗證與讀取成本

- [x] 3.1 `resolveActivityLogDateRange_` 拒絕不存在的日期（如 `2026-13-40`）、`startDate > endDate` 與年份超出 1970–2100 的區間，並回傳錯誤代碼 `invalid_date_range` 與明確訊息，不回退預設值、不回傳空資料；`webapp/js/activityLog.js` 的錯誤處理需攔截此代碼並顯示對應訊息；補後端邏輯測試與前端錯誤顯示測試
- [x] 3.2 將 `handleGetActivityLogWebApiAction_` 改為由最後一列往前每批 500 列讀取；跨出 `range.start` 後再多讀一批才停止（容忍鎖外產生時間戳記的輕微順序錯置），或達 `ACTIVITY_LOG_MAX_SCAN_ROWS` 即終止。**僅達上限**回傳 `truncated: true`，此時 `total` 為下限並由 spec 場景固定；補測試驗證不會一次讀取整表、跨出日期下界時 `total` 精確且無 `truncated` 欄位、達上限時 `total` 語意為下限
- [x] 3.3 將 `durationMs` 缺值（`""`／`null`／`undefined`）統一回傳 `null`，修正 `tests/webApiActivityLogBranchCoverage.test.js` 中預期 `NaN` 的斷言
- [x] 3.4 將 `category` 篩選改為兩側 `toLowerCase()` 比對，並補大小寫混合的查詢測試

## 4. 孤兒元素清理

- [x] 4.1 移除 `activityLogger.js` 的 `SAMPLED_LAST_ROW_CACHE_KEY`、`WRITE_COUNT_CACHE_KEY`、`LAST_ROW_SAMPLE_INTERVAL`、`bumpWriteCount_` 及 `cleanupActivityLogRows` 中的快取更新；確認寫入路徑不再呼叫 `getLastRow()`，且每日清理仍維持 20,000／15,000 閾值
- [x] 4.2 移除 `activityLogger.js` 的 `SENSITIVE_RECORD_KEYS` 及 `buildActivityLogRow_` 中永不成立的敏感欄位判斷；以 `tests/activityLogger.test.js` 的 12 欄白名單與敏感值測試確認仍完整
- [x] 4.3 移除 `webApi.js` 的 `afterSnapshot` 擷取、`buildActivityLogRecord_` 的 `after` 參數，以及 `activityLogBuilders.js` 中所有 builder 的 `after` 參數與相關 JSDoc；對應的測試預期已於 2.3 一併修正，並以 2.3 的整合測試確認差異計算仍正常
- [x] 4.4 將 `beforeSnapshot` 擷取時點移至成功取得 Script Lock 之後（非鎖定動作則置於鎖判定之後、路由之前）；補併發情境測試：兩個連續請求共用工作表時，第二請求的「前值」等於第一請求寫入後的值，而非舊值

## 5. 測試與無障礙覆蓋補強

- [x] 5.1 在 `tests/activityLogBuilders.test.js` 與 `tests/activityLogger.test.js` 補巢狀物件、陣列與 `TOKEN`／`CsrfToken` 等大小寫變體的敏感資料外洩測試，斷言敏感字串不出現在 `JSON.stringify(detail)` 與日誌列；並於 `tests/activityLogModuleIndependence.test.js` 確認各產生器仍匯出投影所需的函式、無循環相依
- [x] 5.2 補 `lock_timeout` 與 CSRF 失敗時仍寫入日誌（含 `errorCode`）的測試，並確認 `releaseLock` 在超時情境不被呼叫
- [ ] 5.3 在 `tests/helpers/a11yHarness.js` 的 `createFrontend()` 加入 `webapp/js/activityLog.js` 的載入並註冊 `MEA.activityLog`，於 state 預設補 `activityLog` 初始值；再於 `collectFixtures()` 加入 ready、展開、空結果與非管理員守門夾具。執行 `npm run check:a11y`，並以「夾具 HTML 含日誌表格標頭」斷言確認新畫面確實被稽核，而非渲染成空字串
- [ ] 5.4 修正 `webapp/js/activityLog.js` 的 `requestId` 渲染：改用 `data-request-id` 與 `addEventListener`，移除 inline `onclick` 的 JS 字串插值，並確認 `npm run check:ui-classes` 與 `npm run check:a11y` 通過
- [ ] 5.5 於 `state.loading === true` 時禁用「重新整理」按鈕、以總頁數收斂目前頁碼、統一兩條錯誤路徑走 `resolveSafeMessage`；以 mock 模式手動驗證行為

## 6. 品質閘門與歸檔

- [ ] 6.1 執行 `npm test`、`npm run format:check`、`npm run check:lang`、`npm run check:ui-classes`、`npm run check:contrast`、`npm run check:a11y`，全數通過且無中國用語
- [ ] 6.2 執行 `npm run build:webapp`，確認 `index.html` 內嵌順序與語法正常，且 `index.html?mock=true` 可渲染日誌頁籤
- [ ] 6.3 執行 `npm run test:coverage`、`npm run check:coverage`、`npm run check:changed-coverage`、`npm run check:complexity`，確認符合門檻且不低於基準線
- [ ] 6.4 執行 `openspec validate fix-activity-logging-audit-defects --strict`，通過後依使用者指示同步 delta specs 並歸檔 change
