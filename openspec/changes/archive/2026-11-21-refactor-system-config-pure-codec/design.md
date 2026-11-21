## Context

參見 `proposal.md`。目前 `databaseInitializer.js` 混雜了試算表實體操作與資料轉換邏輯，特別是 `applySystemSettingUpdatesToRows_` 會就地變異傳入的 `updates` 參數（`delete updates[key]`），且更新設定時將已存在與不存在的列拆成兩次試算表 I/O。本設計確立將純運算抽離為獨立模組 `systemConfigCodec.js`，以落實不可變性（Zero Mutation）、高內聚與零 Mock 單元測試。

## Goals / Non-Goals

**Goals:**
- **獨立高內聚純模組**：建立獨立的 `systemConfigCodec.js`，完全不依賴 Google Apps Script 全域環境或內部狀態，具備 100% 純淨的單元測試能力。
- **絕對不可變性（Zero Mutation）**：所有資料轉換函式保證純粹無副作用，絕不修改或刪除傳入的陣列與物件（徹底消除 `delete updates[key]`）。
- **單次安全批次 I/O 與防幽靈殘留列**：設定儲存時計算出完整合併二維陣列並填補至目標範圍大小（預設 29 行），外層僅需單次呼叫 `setValues()`，消除零碎附加寫入並徹底杜絕尾端殘留列（Ghost Rows）。
- **雙軌鍵值與記憶體同構相容**：回傳之設定物件同時具備原始鍵名（中英文）與駝峰快捷鍵，且試算表列儲存與記憶體 fallback 儲存共用核心正規化邏輯。
- **既有 Mock 100% 相容與公式防禦**：外層維持呼叫既有 `sheet.getRange("A2:B30")`，不呼叫測試替身未實作的 `.offset()`，且寫入前維持 `sanitizeRowMatrix` 防禦。

**Non-Goals:**
- 不更動試算表儲存格的實體排版結構（A:B 與 D:G 的表頭、背景色、字型維持原樣）。
- 不更動 Web API 與前端呼叫的 JSON 格式與 action 流程。
- 不引入外部函數式函式庫（如 Ramda、Lodash/fp），維持純原生 JavaScript 實作。

## Decisions

### 決策 1：建立獨立純模組 `systemConfigCodec.js`
- **選擇**：比照 `courseNormalizationShared.js` 模式，將所有純編解碼與正規化邏輯抽為獨立的 `systemConfigCodec.js`（Node.js `module.exports` 與 GAS 全域雙棲相容）。
- **考量之替代方案**：留在 `databaseInitializer.js` 內部就地重構。
- **理由**：
  1. `databaseInitializer.js` 目前已長達 711 行並承載 7 種職責，抽出後可防止檔案膨脹至 850 行以上，落實單一職責原則（SRP）與高內聚。
  2. 抽離後，單元測試 `tests/systemConfigCodec.test.js` 可以純粹 `require("./systemConfigCodec.js")`，完全不觸發 `databaseInitializer.js` 的全域變數宣告與環境相依，達成真正的 100% 零 Mock、零狀態污染。

### 決策 2：雙層結構設計（純物件正規化 + 二維陣列編解碼）
為了讓「試算表實體列」與「無試算表時的記憶體 fallback 字典」共用同一套規則，模組劃分為兩個清晰層次：

1. **核心純物件正規化層**：
   - `normalizeSystemSettings(dict)`：處理布林值轉譯（支援 true/false/1/0/yes/是/啟用）、網域小寫去 `@`、預設值指派，並以單一物件同時輸出雙軌鍵名（如 `學年度` 與 `schoolYear`、`系統名稱` 與 `systemName`、以及未知的自訂鍵）。記憶體儲存與試算表讀取共用此函式。
   - `normalizeWhitelistAccount(account)`：處理單一帳號物件的 Email 小寫 trim、角色中文與代碼對應（`normalizeRole`）、啟用狀態解析。
2. **二維列矩陣編解碼層**：
   - `parseSystemSettingsRows(rawRows)`：先將 A:B 列轉為字典（自動辨識首列是否為表頭 `設定項目`），再呼叫 `normalizeSystemSettings`。
   - `mergeSystemSettingsRows(existingRows, updates, options)`：
     - 建立 `seenKeys = new Set()`。
     - 掃描 `existingRows`：先排除尾端純空列，對有效鍵列取更新值或保留原值，加入 `seenKeys`。
     - 差集追加：檢查 `updates` 中未出現在 `seenKeys` 的項目，附加於新陣列尾端。
     - 幽靈列防範填補：若提供 `targetRowCount`（預設 29 行），目標列數取 `Math.max(validRowsCount, targetRowCount)`；當合併結果不足該行數時，自動以 `["", ""]` 補齊至目標長度，確保單次 `setValues()` 徹底覆蓋舊區間，杜絕過期資料殘留。
     - 全程不更動 `updates`（不執行 `delete`）與 `existingRows`，傳回全新二維陣列。
   - `parseWhitelistRows(rawRows)` 與 `serializeWhitelistRows(accounts)`：負責 D:G 陣列與標準帳號陣列的雙向映射；白名單啟用狀態落實嚴格布林正規化（解析 `"true"`、`"是"`、`true`、`1` 為啟用，`"false"`、`"否"`、`false`、`0` 為停用），杜絕弱型別字串反轉漏洞。

### 決策 3：白名單更新維持「單次安全全清重寫」與適用邊界評估
- **權衡評估**：
  - 白名單 D:G 區塊屬於「全表取代型」設定，帳號數通常在數十至數百人範圍內。
  - 繼續採用 `clearWhitelistSheetRange_` + `writeWhitelistSheetRows_`（搭配 `sanitizeRowMatrix`），能保證被刪除的成員被徹底移除，避免差集運算因欄位錯位而殘留失效授權。
  - 若未來授權名單超過 1,000 筆以上，再行評估引進索引 Patch 機制。

### 決策 4：Imperative Shell 外層相容防線
- `databaseInitializer.js` 中的 `saveSystemSettingsToSheet_` 保持讀寫 `A2:B30` 範圍，不呼叫未被既有 Mock 支援的 `.offset()` 方法。
- 寫入前嚴格保留 `sanitizeRowMatrix`，杜絕公式注入攻擊。

## Risks / Trade-offs

- **[風險] 既有測試 Mock `makeSheet` 範圍硬編碼為 `"A2:B30"`**
  - **緩解措施**：`mergeSystemSettingsRows` 預設以 29 列為目標長度進行空白填補（A2:B30 共 29 列），使回寫長度與 Mock 期待完全吻合，既有測試無痛通過；若有效資料超過 29 列，則動態計算維度寫入。
- **[風險] 跨模組依賴載入順序與全域命名衝突**
  - **緩解措施**：在 GAS 中字母排序 `databaseInitializer.js` 先於 `systemConfigCodec.js` 載入，因此 `databaseInitializer.js` 採用**惰性解析（Lazy Resolution）**，在呼叫函式內部透過 `GAS_RUNTIME.resolveDependency_("systemConfigCodec", "./systemConfigCodec.js", null)` 動態解析，不在模組頂層靜態取用；`systemConfigCodec.js` 採 IIFE/UMD 閉包封裝，避免常數命名衝突污染全域。
