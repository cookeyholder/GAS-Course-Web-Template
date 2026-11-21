## 1. 獨立純編解碼模組實作與零 Mock 單元測試

- [x] 1.1 建立 `systemConfigCodec.js` 模組骨架與雙棲匯出，實作 `normalizeSystemSettings`、`parseSystemSettingsRows` 與 `mergeSystemSettingsRows`。涵蓋雙軌鍵值（中文+駝峰）、布林正規化、不可變性（無 `delete`）與幽靈殘留列空白填補。執行 `node tests/systemConfigCodec.test.js` 驗證通過。
- [ ] 1.2 於 `systemConfigCodec.js` 實作 `normalizeWhitelistAccount`、`parseWhitelistRows` 與 `serializeWhitelistRows`。涵蓋 Email trim、角色代碼與中文名稱對照、啟用狀態轉譯與空行過濾。執行 `node tests/systemConfigCodec.test.js` 驗證通過。
- [ ] 1.3 擴充 `tests/systemConfigCodec.test.js` 極端邊界測試（空陣列、首行表頭判定、未登錄未知鍵保留、大小寫變體、全空白列填補、字串 `"false"` 或數字 `0` 啟用狀態防反轉）。執行 `node tests/systemConfigCodec.test.js` 驗證通過。

## 2. 後端資料庫初始化模組重構與相容性接入

- [ ] 2.1 重構 `databaseInitializer.js` 的系統設定讀寫（`readSystemSettings` 與 `saveSystemSettingsToSheet_`），移除 `delete updates[key]` 與二次附加寫入，以惰性解析接入 `systemConfigCodec`，保留 `sanitizeRowMatrix` 防禦。執行 `npm test` 確認全專案 131 份測試（含 1 份新測試）全數通過。
- [ ] 2.2 重構 `databaseInitializer.js` 的白名單讀寫（`readWhitelist` 與 `saveWhitelistToSheet_`），以惰性解析接入 `systemConfigCodec` 並統一記憶體模式正規化。執行 `npm test` 確認全專案 131 份測試全數通過。
- [ ] 2.3 確保 `repairSystemConfigBlockA_` 與 `bootstrapAdminIfNeeded` 之既有行為與中文鍵名相容性維持正常。執行 `node tests/databaseInitializerBootstrap.test.js && node tests/databaseInitializerInitializeDatabaseSheets.test.js` 驗證通過。

## 3. 全量整合驗證與品質閘門守門

- [ ] 3.1 執行全專案單元測試與完整回歸測試，確認 131 份測試全數通過。執行 `npm test` 驗證通過。
- [ ] 3.2 執行複雜度（CRAP <= 30, MI >= 20）與覆蓋率量測，確認無回退。執行 `npm run check:complexity && npm run check:coverage` 驗證通過。
- [ ] 3.3 執行程式碼格式檢查、臺灣繁體中文語言純淨度檢查與無障礙稽核。執行 `npm run format:check && npm run check:lang && npm run check:a11y` 驗證通過。
