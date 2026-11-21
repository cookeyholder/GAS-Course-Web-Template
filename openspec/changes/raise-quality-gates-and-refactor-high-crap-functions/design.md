# 提高品質門檻與重構高 CRAP 函式設計文件

## 重構架構設計（消除高 CRAP 瓶頸）

為確保調降 CRAP 門檻至 25 時不會造成破壞性失敗，並將所有函式的循環複雜度控制在 10 左右，針對四支核心函式進行純輔助函式拆解，所有抽出的函式一律嚴格封裝於各自模組之閉包/工廠內部，絕不污染全域命名空間：

### 1. `isTrustedApiEndpoint` (webapp/js/config.js)
- **問題分析**：原函式約 45 行，內部同時負責 candidate 字串合法性校驗、URL 解析、通訊協定檢查、GAS Web App 路徑比對、正規表達式驗證與同源/本機比對，循環複雜度為 20。
- **重構設計**：
  1. `parseCandidateUrl_(candidate, baseHref)`（純輔助函式）：
     - 負責字串前綴校驗（非空、scheme 或根相對路徑 `/`）。
     - 封裝 `new URL()` 的安全解析與 `http:`/`https:` 協定白名單過濾，遇到例外安全回傳 `null`。
     - 若 candidate 為相對路徑且無 baseHref 時安全回傳 `null`。
  2. `isMatchingTrustedHostOrOrigin_(targetUrl, env)`（純輔助函式）：
     - 負責各項白名單比對：GAS Web App URL、`script.google.com/macros/s/...` 正規表達式、同源頁面網址、本機 `localhost` 或 `127.0.0.1`。
     - 容錯防禦：`env` 為空時仍可正確比對 `script.google.com`；`gasWebappUrl` 格式異常時吞咽例外並繼續回退比對同源網址；`file:` 協定時容許 hostname 為空比對 localhost。
  3. `isTrustedApiEndpoint(candidate, env)`（主調度函式）：
     - 僅保留高階協調邏輯：呼叫 `parseCandidateUrl_`，若解析成功則呼叫 `isMatchingTrustedHostOrOrigin_`。
- **成效預估**：主函式與輔助函式循環複雜度均降至 8 以下，CRAP 由 20.038 降至 8 以下。

### 2. `createListController` (webapp/js/listController.js)
- **問題分析**：函式開頭連續使用 15 次 `options.x || fallback` 提供預設值與回退函式，使 JavaScript AST 分支計數直接累積達 20。
- **重構設計**：
  1. `normalizeListControllerOptions_(config)`（純資料與預設值正規化函式）：
     - 採用靜態常數字典 `DEFAULT_CONTROLLER_OPTIONS` 集中定義所有預設函式與純值。
     - 透過明確屬性映射或屬性走訪指派預設值，在確保「呼叫端傳入 `undefined` 時安全回退為預設函式」的前提下，徹底消除語法樹中 15 個 `||` 運算子產生的複雜度分支。
  2. `createListController(config)`（控制項實體建立）：
     - 呼叫正規化輔助函式取得乾淨且完整的 `options`，專注於事件與資料流派發。
- **成效預估**：循環複雜度由 20 降至 8 以下，CRAP 由 20.001 降至 8 以下。

### 3. `handleOAuthCodeCallback` (webApi.js)
- **問題分析**：原函式混雜了授權碼檢查、試算表憑證設定讀取、Client ID/Secret 存在性驗證、Payload 建立、HTTP 請求封裝與 Response 狀態碼檢查，循環複雜度為 20。
- **重構設計**：
  1. `validateOAuthCredentials_(settings)`（純資料驗證）：
     - 回傳合約：`{ valid: boolean, error?: Object, clientId?: string, clientSecret?: string }`。
     - 檢驗 settings 中是否有 Client ID 與 Client Secret，缺漏時回傳對應結構化錯誤。
  2. `evaluateTokenExchangeResponse_(response, tokenData)`（純回應評估）：
     - 回傳合約：`{ valid: boolean, error?: Object }`。
     - 檢查 HTTP 狀態碼與 token 資料中的 `id_token`，失敗時回傳錯誤物件。
  3. `handleOAuthCodeCallback(code, e, deps)`（主流程函式）：
     - 專注於協調授權碼交換的主幹流程，複雜度降至 8 以下。
- **成效預估**：循環複雜度由 20 降至 8 以下，CRAP 由 20.000 降至 8 以下。

### 4. `resolveSafeMessage` (webapp/js/errorMessages.js)
- **問題分析**：原函式內部連續對 codeMap、value.code、value.safeMessage、Error 實體與 value.message 進行條件分支與型別校驗，循環複雜度為 20。
- **重構設計**：
  1. `resolveFromCodeMap_(value, codeMap)`（純對照表解析）：
     - 專注由字串或物件中提取 code 並於 codeMap 查表，成功時回傳訊息，未命中回傳 null。
  2. `resolveFromErrorObject_(value, safeFallback)`（純物件訊息解析）：
     - 專注由物件中安全提取 safeMessage 或 message，遇到 Error 實體則回退 safeFallback。
  3. `resolveSafeMessage(value, fallback, codeMap)`（主調度函式）：
     - 依序協調 codeMap 查表與物件提取，主函式循環複雜度降至 6 以下。
- **成效預估**：循環複雜度由 20 降至 6 以下，CRAP 由 20.000 降至 6 以下。

---

## 品質門檻升級與單一真理來源 (SSOT)

在完成上述 4 支核心函式重構後，全專案 927 個函式之最高 CRAP 將受約束在 20.000 以下（由少數未測試 CLI 腳本之循環複雜度 4 與部分全覆蓋函式之循環複雜度 20 所界定），具備充裕條件將門檻由 30 收緊至 25（享有 5 分充足安全緩衝）。

### 1. 門檻設定對照
| 指標項目 | 現行門檻 | 新設定門檻 | 現行專案實測值 | 安全裕度 |
| :--- | :---: | :---: | :---: | :---: |
| 全域行覆蓋率（Lines） | >= 30% | **>= 60%** | 96.72% | +36.72% |
| 全域分支覆蓋率（Branches） | >= 40% | **>= 60%** | 86.23% | +26.23% |
| 變更分支覆蓋率（Changed Branches） | >= 70% | **>= 80%** | 100.00% | +20.00% |
| CRAP 複雜度上限（CRAP Max） | <= 30 | **<= 25** | 重構後最高 20.000 | 5 分充足緩衝 |

### 2. SSOT 與配置連動
- `scripts/qualityConfig.js`：
  - `THRESHOLDS.global.lines`: 60
  - `THRESHOLDS.global.branches`: 60
  - `THRESHOLDS.changed.branches`: 80
  - `THRESHOLDS.crap`: 25
- `scripts/checkComplexity.js`：
  - `evaluateComplexity` 之 fallback `crapThreshold` 由 30 改為 25。
- **基準檔向後相容政策**：
  - `scripts/quality-baseline.json` 中的 `maintainability.crapOver30Count` 欄位維持原名，作為記錄門檻超標數的 ratchet 鍵值，以確保與現行基準檔結構及 `REQUIRED_BASELINE_PATHS` 100% 向後相容，避免破壞性斷裂。

### 3. 測試防護與文件規範
- 測試套件更新：
  - `tests/qualityConfig.test.js`：驗證上述新門檻常數。
  - `tests/checkComplexity.test.js`：更新預設門檻測試為 25，並加入未傳入 crap 門檻時 fallback 為 25 的斷言。
  - `tests/qualityDocumentation.test.js`：更新文件門檻比對 Token（包含 `"25"`, `"60%"`, `"80%"`）。
  - `tests/qualityRatchet.test.js`：更新測試案例中的門檻設定為 25。
- 專案規範更新：
  - `AGENTS.md`：品質門檻摘要更新。
  - `README.md`：更新 6 處指標清單、比較表標頭與疑難排解段落文字。
