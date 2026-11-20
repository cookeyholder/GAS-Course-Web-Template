## ADDED Requirements

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
