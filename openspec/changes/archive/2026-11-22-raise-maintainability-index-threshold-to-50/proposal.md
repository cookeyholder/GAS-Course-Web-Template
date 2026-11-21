# 提高可維護性指數 (MI) 門檻至 50 提案

## 背景與問題描述

本專案於導入自動化品質閘門時，針對模組可維護性指數（Maintainability Index, MI）設定了初始防禦門檻 `MI >= 20`。該門檻在當時主要作為低限安全防護，避免出現 SEI 評級為「難以維護（0-19）」的嚴重不良模組。

經過多次架構重構（包含模組拆分、單一真理來源建立、純資料轉譯器抽離與高階函式重構），目前專案中納管的 43 個模組在複雜度與體積控制上已有大幅改善：
- 全專案 43 個模組中，MI 最低值為 `webapp/js/config.js` 的 **83.67**。
- 其餘 42 個模組之 MI 皆介於 90 至 140 以上，遠高於產業通常認定的高可維護性基準。

在此背景下，既有靜態硬門檻 `MI >= 20` 顯得過度寬鬆，無法在合規性底線上發揮適當的品質防護作用。若有開發者引入架構不良或過度肥大的模組（例如 MI 介於 20 至 49 之間），現有的靜態門檻將無法有效提供第一線警示。

## 提議解決方案

將全專案之模組可維護性指數（Maintainability Index）靜態硬門檻（Hard Gate）由 `20` 提升至 `50`。

### 指標標準與理論換算
本專案採用的計算公式為微軟常用的歸一化公式（Normalized MI, 0 至 100）：
$$MI = \max\left(0, \frac{171 - 5.2 \times \ln(V) - 0.23 \times CC - 16.2 \times \ln(LOC)}{171} \times 100\right)$$

對照 Coleman 與 Carnegie Mellon Software Engineering Institute (SEI) 原始文獻（範圍 0 至 171）：
- 原始指標 $MI_{orig} < 65$（換算歸一化約 $< 38$）：難以維護（Red）
- 原始指標 $65 \le MI_{orig} < 85$（換算歸一化約 $38 \le MI < 49.7$）：中度可維護性（Yellow）
- 原始指標 $MI_{orig} \ge 85$（換算歸一化約 $\ge 49.7$）：高度可維護性（Green）

因此，將歸一化門檻定為 `50`，精確對應 SEI 原始體系中進入「高度可維護性（Green）」的臨界標準（85/171），具備扎實的軟體工程理論支撐。

### 雙軌品質防護機制（Hard Gate + Ratchet）
本專案的品質體系採「雙軌制」：
1. **靜態硬門檻（Hard Failure Gate: 50）**：全專案任何納管模組的絕對合規底線。
2. **動態防退步棘輪（Ratchet: 83.666）**：依據基準線（`quality-baseline.json`）鎖定現況最佳水準，防止專案整體水準回退。

### 調整效益
1. **強化靜態防護底線**：杜絕 MI 低於 50 的劣質模組進入專案。
2. **零破壞與零回退**：現有 43 個模組最低值為 83.67，距離門檻 50 仍有 33.67 分安全餘裕。
3. **維持單一真理來源（SSOT）**：由 `scripts/qualityConfig.js` 統一管理，連動更新腳本 fallback、測試套件斷言、OpenSpec 規格與專案規範文件。

## 影響範疇

- **品質設定與分析腳本**：
  - `scripts/qualityConfig.js`：`THRESHOLDS.maintainability` 由 `20` 改為 `50`。
  - `scripts/checkComplexity.js`：`evaluateComplexity` 內部 fallback 預設門檻由 `20` 改為 `50`。
- **單元測試套件**：
  - `tests/qualityConfig.test.js`：更新斷言與預期門檻為 `50`。
  - `tests/checkComplexity.test.js`：更新預設門檻測試為 `50`，同步調升測試假資料 `a.js` 之 MI 數值至 60 維持測試語意。
  - `tests/qualityDocumentation.test.js`：更新文件比對 token 與情境檢查為 `50`。
  - `tests/qualityRatchet.test.js`：更新門檻定義為 `50`。
- **規格與規範文件**：
  - `openspec/specs/coverage-and-complexity-gates/spec.md`：更新 MI 門檻需求與驗證場景。
  - `AGENTS.md`：更新品質門檻政策摘要中的 MI 門檻為 `50`。
  - `README.md`：更新第 223 行品質門檻清單項與第 253 行疑難排解文字為 `50`。
