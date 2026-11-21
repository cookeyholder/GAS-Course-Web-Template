# 提高專案品質門檻與重構高 CRAP 函式提案

## 背景與問題描述

本專案現已導入自動化品質閘門（包含測試覆蓋率、CRAP 複雜度、Maintainability Index、變更覆蓋率、靜態格式與無障礙稽核）。
在完成核心資料純化與 Maintainability Index (MI >= 50) 提升後，目前專案的實測數據表現優異：
- 全域行覆蓋率（Lines）：**96.72%**
- 全域分支覆蓋率（Branches）：**86.23%**
- 變更分支覆蓋率（Changed Branches）：**100.00%**
- 模組最低可維護性指數（MI）：**83.67**

然而，現行設定的品質門檻仍處於專案初期的過渡標準：
- 全域行覆蓋率初始門檻僅為 `30%`。
- 全域分支覆蓋率初始門檻僅為 `40%`。
- 變更分支覆蓋率門檻僅為 `70%`。
- 函式 CRAP 門檻為 `30`。

經分析，若將 CRAP 門檻收緊至產業推薦的嚴格標準（`CRAP <= 25`），專案內有 4 支業務與核心函式因結構過於肥大或過多回退邏輯，循環複雜度達到 20，導致 CRAP 分數處於 20 臨界點：
1. `webapp/js/config.js` 中的 `isTrustedApiEndpoint`：循環複雜度 20，CRAP 為 **20.038**（> 20）。
2. `webapp/js/listController.js` 中的 `createListController`：循環複雜度 20，CRAP 為 **20.001**（> 20）。
3. `webApi.js` 中的 `handleOAuthCodeCallback`：循環複雜度 20，CRAP 為 **20.000**。
4. `webapp/js/errorMessages.js` 中的 `resolveSafeMessage`：循環複雜度 20，CRAP 為 **20.000**。

此外，少數未受單元測試覆蓋的 CLI 腳本工具函式（如 `toRelativeFile`、`run` 等）在循環複雜度為 4 且覆蓋率 0% 時，CRAP 亦為 $4^2 + 4 =$ **20.000**。
若直接將門檻降至 20，現有程式碼庫將立刻違規導致 CI 阻擋；但若重構上述核心函式並將門檻設定為 `25`，既能消除肥大函式技術債，又能為專案提供 5 分充足的安全防護裕度。

## 提議解決方案

本變更採「先重構降複雜度、再升級品質門檻」之策略：

### 1. 拆分高複雜度函式為純輔助函式
- **`isTrustedApiEndpoint` (webapp/js/config.js)**：
  拆分為 URL 安全解析（`parseCandidateUrl_`）與網域/端點信任比對（`isMatchingTrustedHostOrOrigin_`）兩支純函式，維持閉包隔離不污染全域，單一函式循環複雜度降至 8 以下。
- **`createListController` (webapp/js/listController.js)**：
  抽離預設選項正規化純函式（`normalizeListControllerOptions_`），採用預設常數字典與映射賦值，消除 15 個 `||` 造成的語法樹分支膨脹，正確防禦 `undefined` 覆蓋，循環複雜度降至 8 以下。
- **`handleOAuthCodeCallback` (webApi.js)**：
  抽離憑證設定檢驗（`validateOAuthCredentials_`）與交換回應解析（`evaluateTokenExchangeResponse_`），定義清楚回傳介面合約，使主流程循環複雜度降至 8 以下。
- **`resolveSafeMessage` (webapp/js/errorMessages.js)**：
  抽離錯誤碼對照解析（`resolveFromCodeMap_`）與錯誤物件安全提取（`resolveFromErrorObject_`），使主函式循環複雜度降至 6 以下。

### 2. 升級品質標準門檻
- **全域行覆蓋率（Lines）**：由 `30%` 提高至 `60%`。
- **全域分支覆蓋率（Branches）**：由 `40%` 提高至 `60%`。
- **變更分支覆蓋率（Changed Branches）**：由 `70%` 提高至 `80%`。
- **CRAP 複雜度門檻**：由 `30` 調降至 `25`。

### 3. 全域單一真理來源（SSOT）與文件規格同步
- 同步更新 `scripts/qualityConfig.js`、`scripts/checkComplexity.js`。
- 維持 `crapOver30Count` 欄位命名以保證與現行 `scripts/quality-baseline.json` 及 `REQUIRED_BASELINE_PATHS` 100% 向後相容。
- 同步更新測試套件 `tests/qualityConfig.test.js`、`tests/qualityDocumentation.test.js`、`tests/checkComplexity.test.js`、`tests/qualityRatchet.test.js`。
- 同步更新規範文件 `AGENTS.md`、`README.md`（包含 6 處門檻指標與段落）與規格 `openspec/specs/coverage-and-complexity-gates/spec.md`。

## 預期效益與風險評估

- **預期效益**：
  1. 建立高標準的防禦體系，阻擋劣質、低覆蓋或高複雜度程式碼。
  2. 重構消除 4 支核心函式之技術債，循環複雜度全數腰斬。
  3. 全專案 CRAP 最高值將由 20.038 降至 20.000（CLI 腳本邊界），距新門檻 25 擁有 5 分充足緩衝。
- **風險評估**：極低。
  重構採行為不變原則，現有 136 個單元測試全面防護；全域指標提升至新門檻後，現行實測值依然擁有充足的安全餘裕。
