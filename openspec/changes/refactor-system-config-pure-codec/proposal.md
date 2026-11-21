## Why

後端資料庫初始化與存取模組 `databaseInitializer.js`（711 行）目前承載了 7 種異質職責，混雜了 Google Apps Script 試算表實體 I/O（`sheet.getRange()`, `setValues()`）與資料格式轉換邏輯。在「系統設定」（區塊 A）與「授權白名單」（區塊 B）的讀寫過程中，存在明顯的架構缺陷與副作用：

1. **參數引數變異副作用**：在 `applySystemSettingUpdatesToRows_` 中，遍歷試算表二維陣列時直接對外部傳入的 `updates` 物件執行 `delete updates[key]`。此舉破壞了輸入參數的不可變性（Immutability），若呼叫端在後續流程仍需引用該物件將引發不可預期的錯誤。
2. **多重試算表 I/O 碎片化與幽靈殘留列（Ghost Rows）風險**：更新設定時，已存在的列透過 `range.setValues()` 寫入，不存在的列又經由 `appendRemainingSystemSettings_` 額外觸發一次寫入；且若合併後資料列數減少，未清空尾端區間將導致過期設定永久殘留。
3. **單元測試過度依賴 Mock**：目前測試 `readSystemSettings`、`saveSystemSettings`、`readWhitelist` 與 `saveWhitelist` 時，必須在測試前置中模擬完整的試算表、工作表、Range 物件與其呼叫鏈，使得測試笨重且無法以零成本窮舉各種邊界格式。

因此，本變更旨在將試算表二維矩陣（`2D Row Array`）與系統設定／白名單領域物件（`Domain Objects`）之間的轉換抽離為獨立的純編解碼器模組 `systemConfigCodec.js`（無副作用純函式），徹底解耦資料轉換與試算表 I/O 薄外殼，消除引數變異、杜絕殘留列，並建立 100% 零 Mock 的高強度純運算測試。

## What Changes

- **建立獨立純編解碼器模組 `systemConfigCodec.js`**：
  - 比照 `courseNormalizationShared.js` 模式，建立無外部環境依賴的純 JavaScript 模組（Node.js `module.exports` 與 GAS 全域雙棲相容）。
  - **系統設定純編解碼（System Settings Codec）**：
    - `normalizeSystemSettings(dict)`：純物件正規化函式，統一布林旗標解析（`parseConfigBoolean`）、網域小寫化與預設值補齊，並同時掛載「雙軌鍵值」（中文原始鍵 + 駝峰快捷鍵），供試算表與記憶體 fallback 模式共用。
    - `parseSystemSettingsRows(rawRows)`：純函式，接收 A:B 二維矩陣（自動辨識首列表頭），轉換為標準系統設定物件，不修改輸入陣列。
    - `mergeSystemSettingsRows(existingRows, updates, options)`：純函式，接收既有二維矩陣與更新物件，產出**全新合併後的二維矩陣**（舊項目更新、新項目差集追加、支援指定固定行數空白填補以防範幽靈殘留列）。**完全消除 `delete updates[key]` 引數變異**，使外層 I/O 僅需單次寫入。
  - **授權白名單純編解碼（Whitelist Accounts Codec）**：
    - `normalizeWhitelistAccount(account)`：帳號物件純正規化函式（Email 小寫 trim、角色代碼與中文名稱解析、啟用狀態布林解析）。
    - `parseWhitelistRows(rawRows)`：純函式，接收 D:G 二維矩陣，過濾空行與無效 Email 列，回傳標準化帳號物件陣列。
    - `serializeWhitelistRows(accounts)`：純函式，接收帳號物件陣列，回傳對應 D:G 欄位之二維字串矩陣 `[['email', '姓名', '角色顯示名稱', '是'|'否']]`。
- **重構 `databaseInitializer.js` 為命令式薄外殼（Imperative Shell）**：
  - `databaseInitializer.js` 的 `readSystemSettings`、`saveSystemSettings`、`readWhitelist`、`saveWhitelist` 內部改為呼叫 `systemConfigCodec` 執行純運算。
  - 試算表實體寫入維持 `sanitizeRowMatrix` 公式注入防禦，並以既有 `A2:B30` 範圍覆蓋機制確保與現行測試替身（Mock）100% 相容。
  - 確保現有匯出 API 與對外呼叫契約 100% 向後相容，既有呼叫端（`main.js`、`webApi.js`、測試檔案）無須調整。
- **新增純函式單元測試套件 `tests/systemConfigCodec.test.js`**：
  - 在純 Node.js 環境中直接傳遞二維陣列與物件進行多種極端邊界測試（空陣列、空白列、大小寫、布林變體、不可變性驗證），完全無須建立任何 Spreadsheet 或 Sheet Mock。

## Capabilities

### New Capabilities

- （無；本變更為後端資料層轉換之內部重構與純函式抽離，不引入新的使用者或系統能力。）

### Modified Capabilities

- `maintainability-and-shared-logic`: 新增「系統設定與授權資料純轉換器（Pure System Data Codec）」要求，規範試算表二維矩陣與領域物件雙向轉換必須為獨立純模組 `systemConfigCodec.js`、禁止對輸入參數進行屬性刪除或就地變異、合併結果必須產生全新矩陣且支援防範幽靈殘留列，並具備無須 Mock 試算表物件的獨立單元測試保護。
- `system-settings-and-docs`: 明確規範系統設定與白名單之讀寫契約保持 100% 向後相容，回傳物件必須維持雙軌鍵值（中文原始鍵 + 駝峰快捷鍵），且純轉換函式需同時相容試算表實體儲存與記憶體 fallback 字典。

## Impact

- **後端模組**：新增 `systemConfigCodec.js`；重構 `databaseInitializer.js`（簡化讀寫函式、消除 `delete updates[key]` 與二次 I/O，接入新純模組）。
- **測試套件**：新增 `tests/systemConfigCodec.test.js`；既有 130 個測試檔案全數回歸通過。
- **品質指標**：模組與函式複雜度維持在門檻內（CRAP <= 30, MI >= 20），測試覆蓋率不低於既有基準（Ratchet 守護）。
- **對外相容性**：前端 Web App、REST API、Action Registry、試算表格式（A:B 與 D:G 表頭及儲存格式）完全不受影響。
