## ADDED Requirements

### Requirement: 資料層純化向後相容與記憶體儲存一致性
重構後之 `readSystemSettings`、`saveSystemSettings`、`readWhitelist` 與 `saveWhitelist` 函式對外呼叫簽名、回傳結構與安全防禦 MUST 保持 100% 向後相容。純轉換邏輯 MUST 提供純物件正規化函式（`normalizeSystemSettings` 與 `normalizeWhitelistAccount`），讓試算表實體儲存與無試算表物件時的記憶體儲存（In-Memory Fallback）共用同一套規則。命令式外殼在寫入試算表儲存格前，MUST 保留 `sanitizeRowMatrix` 公式注入安全防禦，並維持與既有測試替身（`A2:B30` 範圍限定）的相容性。

#### Scenario: 記憶體儲存與試算表解析結果具同構性
- **WHEN** 在無試算表環境與在試算表環境下提供相同的初始設定值
- **THEN** `readSystemSettings` 回傳之設定物件同時具備原始鍵名與駝峰便捷鍵，且在布林值判定與小寫網域正規化上完全相同

#### Scenario: 儲存系統設定與白名單之對外呼叫契約維持不變
- **WHEN** 呼叫端以既有方式呼叫 `saveSystemSettings(settings, ss)` 或 `saveWhitelist(accounts, ss)`
- **THEN** 回傳結構維持 `{ ok: true }` 或 `{ ok: true, count }`，命令式外殼執行單次安全寫入，且既有所有測試無回退通過
