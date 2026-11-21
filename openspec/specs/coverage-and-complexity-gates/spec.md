# coverage-and-complexity-gates Specification

## Purpose

定義測試覆蓋率、CRAP、Maintainability Index 與變更覆蓋率之量測方式、門檻政策、報告與 CI/本機執行契約，確保程式碼品質要求可被客觀檢驗並持續落實。

## Requirements

### Requirement: Coverage measurement MUST be reproducible and reportable
專案 MUST 提供可在本機與 CI 執行的測試覆蓋率量測流程（含明確之納管範圍與排除規則），輸出可供人工檢視與自動化判讀之報告（至少包含 lines、statements、functions、branches 或等效維度），並能反映當前基準表現。

#### Scenario: 本機產生覆蓋率報告
- **WHEN** 開發者執行專案定義的覆蓋率檢查指令
- **THEN** 系統 MUST 執行測試並產生覆蓋率摘要與報告檔（或等效輸出），且結束碼能反映是否符合門檻

#### Scenario: CI 產生一致的覆蓋率結果
- **WHEN** CI 執行品質閘門工作流程
- **THEN** CI MUST 使用專案定義的指令與設定計算覆蓋率，並在不符合門檻時使工作失敗

### Requirement: Global coverage MUST meet project thresholds and non-regression policy
專案 MUST 定義並強制執行全域測試覆蓋率門檻與不回退政策；門檻值與基準線 SHALL 可追溯且文件化。初始門檻可依既有基準線設定為可執行值，但後續 MUST 支援逐步收斂（ratchet）且不得在未經提案/文件更新下任意放寬。

#### Scenario: 全域覆蓋率低於門檻或回退時檢查失敗
- **WHEN** 量測結果顯示任一納管覆蓋率維度低於當前生效門檻或低於已記錄之基準線
- **THEN** 覆蓋率檢查 MUST 以失敗狀態結束並指出未達標或回退之維度與數值

#### Scenario: 門檻與基準線具文件化依據
- **WHEN** 維護者檢視品質設定與文件
- **THEN** 專案 MUST 提供當前門檻值、基準線、計算範圍與調整原則之可追溯說明

### Requirement: Changed code coverage MUST satisfy differential threshold
專案 MUST 提供變更覆蓋率（diff/changed coverage）檢查，針對相對於指定基準分支或比較範圍之變更程式碼行與分支（或等效可執行單位）強制執行不低於專案定義門檻之覆蓋要求。

#### Scenario: 變更程式碼覆蓋率不足時阻擋通過
- **WHEN** CI 或本機執行變更覆蓋率檢查且變更範圍內覆蓋率低於門檻
- **THEN** 檢查 MUST 失敗並列出未達標之檔案或區段摘要資訊

#### Scenario: 無可量測變更時具明確處理結果
- **WHEN** 比較範圍內不存在需計入變更覆蓋率的可量測程式碼變更
- **THEN** 檢查 MUST 以明確且一致的成功或略過結果回報，不得產生誤判失敗

### Requirement: Complexity and maintainability gates MUST enforce CRAP and MI limits
專案 MUST 提供可重複執行的複雜度與可維護性分析，並強制執行以下門檻：每個納管函式之 CRAP 分數 **MUST NOT** 大於 25，且每個納管模組之 Maintainability Index **MUST** 大於或等於 50。分析範圍、排除項目與計算方法 MUST 文件化。

#### Scenario: CRAP 超過門檻時檢查失敗
- **WHEN** 任一納管函式的 CRAP 分數計算結果大於 25
- **THEN** 品質檢查 MUST 失敗並報告違規函式（含檔案位置與分數）

#### Scenario: MI 低於門檻時檢查失敗
- **WHEN** 任一納管模組的 Maintainability Index 小於 50
- **THEN** 品質檢查 MUST 失敗並報告違規模組（含檔案位置與分數）

#### Scenario: 報告提供可追蹤的量測依據
- **WHEN** 開發者或 CI 檢視複雜度檢查輸出
- **THEN** 輸出 MUST 包含足以定位問題之識別資訊與門檻比較結果，並可對應至專案定義之計算規則

### Requirement: Quality gate workflow MUST integrate enforceable checks in CI
GitHub Actions 品質閘門工作流程 MUST 在受保護的提交流程（push/pull request）中執行格式檢查、語言檢查、測試、覆蓋率、CRAP/MI 與變更覆蓋率檢查（依專案定義之執行順序與條件），且任一強制檢查失敗時工作流程 MUST 標記為失敗。

#### Scenario: 任一強制品質檢查失敗即阻擋 CI 通過
- **WHEN** pull request 或 push 觸發品質閘門且其中任一強制檢查未通過
- **THEN** 對應 CI 工作 MUST 失敗並保留可供診斷的日誌或報告資訊

#### Scenario: 全部強制檢查通過時 CI 成功
- **WHEN** 所有強制品質檢查皆符合門檻與規則
- **THEN** 品質閘門工作流程 MUST 以成功狀態完成

### Requirement: 結構重構後須重新量測並更新基準報告
當進行大規模行為不變重構（例如拆分 God Module、合併單一來源、消除循環相依）完成後，MUST 重新執行完整的測試覆蓋率與複雜度量測，並產出一份新的基準報告，取代過期快照。新報告 MUST 涵蓋全域覆蓋率（lines、statements、functions、branches）、每個納管函式的 CRAP 分數、每個納管模組的 Maintainability Index，以及現在生效的門檻比較結果。ratchet MUST 採方向性比較：CRAP 最大值與 CRAP 超標數為越低越佳，MUST NOT 高於既有值；MI 最小值與四項覆蓋率為越高越佳，MUST NOT 低於既有值。此處「既有值」定義為重構前最近一次完整量測結果（見 `tasks.md` 1.3）；`scripts/quality-baseline.json` 中 2026-11-18 的舊快照僅供歷史比較，不作為 ratchet 來源。若有維度不符合方向性 ratchet，MUST 先補測試或重構，不得放寬門檻或直接更新基準。新基準 MUST 記錄量測環境（Node 版本、量測指令、納管與排除範圍、量測時間）、`scope.files`、`scope.methods`、CRAP 最高值所屬函式與 MI 最低值所屬檔案，並保存可供追溯的歷史快照。

#### Scenario: 重構完成後產生新基準報告
- **WHEN** 本變更的所有重構任務完成並通過測試
- **THEN** 執行覆蓋率與複雜度量測，產生包含 CRAP、MI 與四大覆蓋率維度的新基準報告，並更新 `scripts/quality-baseline.json`、`reports/quality/complexity.json` 與覆蓋率報告檔

#### Scenario: 新基準遵守方向性 ratchet 與既有門檻
- **WHEN** 比較新量測結果與重構前既有值及現行門檻
- **THEN** CRAP 最大值與超標數不高於既有值，MI 最小值與四項覆蓋率不低於既有值，且所有維度通過現行硬門檻；新基準數值被記錄為現行版本

#### Scenario: 舊快照僅供歷史比較
- **WHEN** 檢視 2026-11-18 的過期基準快照
- **THEN** 該快照被保留為歷史檔案，但不作為方向性 ratchet 的比較來源，報告中明確標示其為過期資料

#### Scenario: 報告可追溯
- **WHEN** 維護者檢視新基準報告
- **THEN** 報告清楚記載量測時間、Node 版本、量測指令、納管範圍、CRAP 最高值所屬函式、MI 最低值所屬檔案，以及相較重構前既有值與過期快照的變化
