# 提高可維護性指數 (MI) 門檻至 50 設計文件

## 設計背景與理論換算

### 1. Maintainability Index (MI) 計算公式與理論對應
專案採用微軟定義之歸一化 Maintainability Index（0 至 100 區間）公式：
$$MI = \max\left(0, \frac{171 - 5.2 \times \ln(V) - 0.23 \times CC - 16.2 \times \ln(LOC)}{171} \times 100\right)$$

此指標結合 Halstead 體積（$V$）、循環複雜度（$CC$）與程式碼行數（$LOC$）。

在 Coleman 與 SEI 原始文獻中，MI 原始範圍為 0 至 171：
- $MI_{orig} \ge 85$ 為高度可維護性（Green），換算歸一化公式：
  $$\frac{85}{171} \times 100 \approx 49.71$$
因此，將專案的靜態門檻訂為 `50`，在理論上恰好精確對齊 SEI 體系中進入 Green 評級的門檻，具備嚴謹客觀之學術與工程依據。

### 2. 雙軌品質防護機制（Hard Gate vs. Ratchet）
本專案具備兩道互補的品質防禦體系：
1. **靜態硬門檻（Static Hard Gate: MI >= 50）**：
   - 目的：定義全專案可接受程式碼結構的絕對底線。
   - 作用：任何單一模組若 MI < 50，即便整體平均再高，也會直接被靜態檢查判定違規。
2. **動態防退步棘輪（Dynamic Ratchet: miMin >= 83.666）**：
   - 目的：基於現有量測基準（`scripts/quality-baseline.json` 中的 `miMin: 83.666`），確保專案現狀不劣化。
   - 作用：防止整體可維護性水準滑落。若未來重構或新增模組使最低 MI 介於 50 至 83.666 之間，雖通過 Hard Gate，但會被 Ratchet 判定回退，需經過明確之架構審查並重新量測更新基準報告。

### 3. Baseline 快照處理說明
`scripts/quality-baseline.json` 中的 `maintainability` 區塊包含歷史欄位 `"miUnder20Count": 0`。
經檢視 `scripts/checkComplexity.js` 與 `scripts/qualityConfig.js`：
- 方向性 ratchet 比較僅提取 `baseline.maintainability.miMin`。
- `REQUIRED_BASELINE_PATHS` 僅驗證 `miMin` 之存在性與數值。
- 因此，`miUnder20Count` 屬於歷史量測快照之附帶資訊，不參與 CI 阻擋邏輯。為維持歷史快照之不可篡改性，本次變更不主動更動 `quality-baseline.json`，待後續大規模架構重構執行全量測時再行滾動更新。

## 架構設計與單一真理來源 (SSOT)

為確保全專案一致性與可維護性，採用集中宣告、分散消費：

1. **單一設定來源 (SSOT)**：
   - `scripts/qualityConfig.js` 中的 `THRESHOLDS.maintainability` 設定為 `50`。
   - `scripts/checkComplexity.js` 統一引入 `THRESHOLDS`，並在 `evaluateComplexity` 的防禦性 fallback 中同步使用預設值 `50`。本專案複雜度檢查由腳本設定驅動，不擴充無用之 CLI 參數解析以保持極簡。

2. **測試防護網更新策略**：
   - `tests/qualityConfig.test.js`：斷言 `THRESHOLDS.maintainability` 嚴格等於 `50`。
   - `tests/checkComplexity.test.js`：
     - 更新預設門檻斷言為 `50`。
     - 在模擬自訂評估情境中，將合格假模組 `a.js` 的 mock MI 數值由 25 調升至 60（高於門檻 50），維持「`a.js` 合格、`b.js` 違規」之單一超標統計語意。
   - `tests/qualityDocumentation.test.js`：驗證 `AGENTS.md` 與 `README.md` 記載之門檻與 SSOT 嚴格一致（比對數值 50）。
   - `tests/qualityRatchet.test.js`：更新測試案例中的門檻設定為 `50`。

3. **規範與文件同步**：
   - `AGENTS.md`：品質門檻政策摘要更新為 `MI MUST >= 50`。
   - `README.md`：更新第 223 行品質指標清單項與第 253 行疑難排解段落為 `50`。
   - `openspec/specs/coverage-and-complexity-gates/spec.md`：更新對應規格。

## 風險評估與回滾策略

- **風險評估**：極低。
  - 現行程式碼庫所有 43 個模組之實測 MI 均 >= 83.67，無任何既有模組會因此次門檻提高而違規。
  - 本次變更不涉及前端與後端業務邏輯程式碼，無功能破壞風險。
- **回滾方式**：
  - 透過 `git revert HEAD` 即可安全恢復門檻至 20。
