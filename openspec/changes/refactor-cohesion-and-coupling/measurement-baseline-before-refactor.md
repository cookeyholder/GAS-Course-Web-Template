# 重構前量測基線（task 1.3）

> 本檔記錄「行為不變重構」開始前的量測值，作為方向性 ratchet 的「既有值」來源。
> 方向性 ratchet：CRAP 最大值與超標數不得高於既有值；MI 最小值與四項覆蓋率不得低於既有值。
> `scripts/quality-baseline.json` 的 2026-11-18 快照已過期，僅供歷史比較，不得作為 ratchet 來源。

## 量測環境

- 量測時間：2026-11-20（臺灣時間）
- Node.js 版本：`v24.22.3`
- 量測指令：`npm run check:complexity`、`npm run test:coverage`
- 報告來源：`reports/quality/complexity.json`、`coverage/coverage-summary.json`
- 納管範圍：`*.js`、`webapp/js/*.js`、`scripts/*.js`；排除 `tests/**`、`node_modules/**`、`coverage/**`、`reports/**`、`.nyc_output/**`

## 複雜度（既有值）

| 指標 | 重構前既有值 | 位置 |
| --- | --- | --- |
| 分析模組數 | 34 | — |
| 分析函式數 | 808 | — |
| CRAP 最高值 | 30 | `databaseInitializer.js::bootstrapAdminIfNeeded`（第 685 行） |
| CRAP > 30 超標數 | 0 | — |
| MI 最低值 | 83.666 | `webapp/js/config.js` |
| MI < 20 數 | 0 | — |

## 覆蓋率（既有值）

| 維度 | 重構前既有值 |
| --- | --- |
| Lines | 94.8% |
| Statements | 94.8% |
| Functions | 92.15% |
| Branches | 83.79% |

## Golden 日誌快照

- 擷取腳本：`scripts/captureGoldenLogSnapshot.js`
- 快照檔：`openspec/changes/refactor-cohesion-and-coupling/golden-log-snapshot.json`
- 代表性請求：7 個（含成功、失敗、不寫日誌與錯誤路徑），寫入日誌共 5 筆。
- 動態欄位 `timestamp`／`requestId`／`durationMs` 已正規化，重複執行結果一致。
- 用途：task 4.2 拆分 `activityLogInterceptor.js` 後，以相同腳本重新擷取並比對內容與筆數。

## 與 2026-11-18 過期快照的歷史比較（僅供參考，非 ratchet 來源）

| 指標 | 2026-11-18 過期快照 | 重構前既有值（本次） |
| --- | --- | --- |
| CRAP 最高值 | 1482.0 | 30 |
| CRAP > 30 超標數 | 56 | 0 |
| MI 最低值 | 69.134 | 83.666 |
| Lines 覆蓋率 | 27.37% | 94.8% |
| Functions 覆蓋率 | 58.82% | 92.15% |
| Branches 覆蓋率 | 37.87% | 83.79% |
