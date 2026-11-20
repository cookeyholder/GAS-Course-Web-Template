# 品質基準報告（2026-11-20）

> 本報告記錄 `refactor-cohesion-and-coupling` 變更（批次 A–C 行為不變重構）完成後的完整量測結果，取代 `scripts/quality-baseline.json` 中已過期的 2026-11-18 快照。方向性 ratchet 的「既有值」以 task 1.3 的 `measurement-baseline-before-refactor.md` 為準；2026-11-18 快照僅供歷史比較。

## 量測環境

| 項目         | 內容                                                                                                                        |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 量測時間     | 2026-11-20（臺灣時間；ISO `2026-11-20T09:25:19Z`）                                                                          |
| Node.js 版本 | `v24.22.3`                                                                                                                  |
| 量測指令     | `npm test`、`npm run test:coverage`、`npm run check:complexity`、`npm run check:coverage`、`npm run check:changed-coverage` |
| 覆蓋率工具   | c8（ reporters：text、lcov、json、json-summary）                                                                            |
| 複雜度工具   | typhonjs-escomplex；CRAP 公式 `comp^2 * (1 - cov)^3 + comp`                                                                 |
| 報告來源     | `coverage/coverage-summary.json`、`coverage/coverage-final.json`、`reports/quality/complexity.json`                         |
| 納管範圍     | `*.js`、`webapp/js/*.js`、`scripts/*.js`                                                                                    |
| 排除範圍     | `tests/**`、`node_modules/**`、`coverage/**`、`reports/**`、`.nyc_output/**`、`scripts/captureGoldenLogSnapshot.js`         |
| 納管規模     | 42 個模組、900 個函式（方法）                                                                                               |

`scripts/captureGoldenLogSnapshot.js` 為純手動擷取工具，永不隨程式載入，故排除於覆蓋率分母；此口徑與 task 1.3 重構前基線一致，並非放寬門檻。

## 四大覆蓋率維度

| 維度       | 覆蓋／總數   | 現行基準 | 重構前既有值 | 方向性 ratchet   |
| ---------- | ------------ | -------- | ------------ | ---------------- |
| Lines      | 12942／13441 | 96.28%   | 94.8%        | 越高越佳，未回退 |
| Statements | 12942／13441 | 96.28%   | 94.8%        | 越高越佳，未回退 |
| Functions  | 656／696     | 94.25%   | 92.15%       | 越高越佳，未回退 |
| Branches   | 3301／3855   | 85.62%   | 83.79%       | 越高越佳，未回退 |

四維度皆同時通過現行硬門檻（Lines ≥ 30%、Statements ≥ 30%、Functions ≥ 60%、Branches ≥ 40%）與不回退政策。

## 複雜度

| 指標             | 數值   | 位置                                                          |
| ---------------- | ------ | ------------------------------------------------------------- |
| CRAP 最高值      | 30     | `databaseInitializer.js::bootstrapAdminIfNeeded`（第 662 行） |
| CRAP > 30 超標數 | 0      | —                                                             |
| MI 最低值        | 83.666 | `webapp/js/config.js`                                         |
| MI < 20 數       | 0      | —                                                             |

CRAP 最高值恰等於硬門檻 30，未超標；MI 最低值遠高於硬門檻 20。`reports/quality/complexity.json` 的 `ok` 為 `true`，`ratchet.ok` 為 `true`。

## 與重構前既有值（task 1.3）比較

| 指標              | 重構前既有值 | 現行基準（2026-11-20） | 結果                         |
| ----------------- | ------------ | ---------------------- | ---------------------------- |
| Lines 覆蓋率      | 94.8%        | 96.28%                 | 提升 1.48 個百分點           |
| Statements 覆蓋率 | 94.8%        | 96.28%                 | 提升 1.48 個百分點           |
| Functions 覆蓋率  | 92.15%       | 94.25%                 | 提升 2.10 個百分點           |
| Branches 覆蓋率   | 83.79%       | 85.62%                 | 提升 1.83 個百分點           |
| CRAP 最高值       | 30           | 30                     | 持平，未回退                 |
| CRAP > 30 超標數  | 0            | 0                      | 持平，未回退                 |
| MI 最低值         | 83.666       | 83.666                 | 持平，未回退                 |
| 分析模組數        | 34           | 42                     | 拆分後模組數增加（職責分散） |
| 分析函式數        | 808          | 900                    | 拆出 helper 與新增測試接縫   |

結論：七個 ratchet 維度（四覆蓋率、CRAP 最高值、超標數、MI 最低值）全部未回退，符合 `specs/coverage-and-complexity-gates/spec.md` 的方向性要求。

## 與 2026-11-18 過期快照的歷史比較

> 僅供歷史對照，不作為 ratchet 來源。

| 指標              | 2026-11-18 過期快照 | 重構前既有值 | 現行基準（2026-11-20） |
| ----------------- | ------------------- | ------------ | ---------------------- |
| Lines 覆蓋率      | 27.37%              | 94.8%        | 96.28%                 |
| Statements 覆蓋率 | 27.37%              | 94.8%        | 96.28%                 |
| Functions 覆蓋率  | 58.82%              | 92.15%       | 94.25%                 |
| Branches 覆蓋率   | 37.87%              | 83.79%       | 85.62%                 |
| CRAP 最高值       | 1482.0              | 30           | 30                     |
| CRAP > 30 超標數  | 56                  | 0            | 0                      |
| MI 最低值         | 69.134              | 83.666       | 83.666                 |
| 分析模組數        | 20                  | 34           | 42                     |
| 分析函式數        | 247                 | 808          | 900                    |

過期快照已另存為 `scripts/quality-baseline.2026-11-18.json`，可持續追溯但不參與任何比較判斷。

## 模組行數變化

行數以合併前的 `f019332`（PR #5）與目前 `HEAD` 比較。

### 後端（God Module 拆分）

| 模組                        | 重構前 | 目前 | 變化 |
| --------------------------- | ------ | ---- | ---- |
| `webApi.js`                 | 1888   | 1536 | -352 |
| `activityLogQuery.js`       | —      | 309  | 新增 |
| `activityLogInterceptor.js` | —      | 289  | 新增 |
| `databaseInitializer.js`    | 731    | 708  | -23  |
| `activityLogger.js`         | 327    | 270  | -57  |
| `activityLogBuilders.js`    | 388    | 394  | +6   |

`webApi.js` 由 1888 行降至 1536 行，原操作日誌查詢與寫入攔截職責分別移入 `activityLogQuery.js`（309 行）與 `activityLogInterceptor.js`（289 行）。三模組合計 2134 行，含相依注入樣板與文件註解；單一模組認知負擔顯著下降，行為契約不變。

### 前端（事件委派與最小介面注入）

| 模組                          | 重構前 | 目前 | 變化 |
| ----------------------------- | ------ | ---- | ---- |
| `webapp/js/ui.js`             | 795    | 827  | +32  |
| `webapp/js/app.js`            | 321    | 327  | +6   |
| `webapp/js/config.js`         | 238    | 239  | +1   |
| `webapp/js/accounts.js`       | 668    | 702  | +34  |
| `webapp/js/imports.js`        | 590    | 614  | +24  |
| `webapp/js/courses.js`        | 480    | 418  | -62  |
| `webapp/js/activityLog.js`    | 523    | 473  | -50  |
| `webapp/js/api.js`            | 426    | 418  | -8   |
| `webapp/js/eventBindings.js`  | —      | 91   | 新增 |
| `webapp/js/listController.js` | —      | 263  | 新增 |
| `webapp/js/wiring.js`         | —      | 84   | 新增 |
| `webapp/js/moduleHelpers.js`  | —      | 47   | 新增 |

`courses.js` 與 `activityLog.js` 的共用清單控制邏輯抽至 `listController.js`，inline 事件字串改由 `eventBindings.js` 統一委派，`wiring.js` 負責最後的依賴組裝。

## 追溯檔案

- 現行基準：`scripts/quality-baseline.json`
- 過期快照：`scripts/quality-baseline.2026-11-18.json`
- ratchet 既有值來源：`openspec/changes/archive/2026-11-20-refactor-cohesion-and-coupling/measurement-baseline-before-refactor.md`
- 覆蓋率報告：`coverage/coverage-summary.json`
- 複雜度報告：`reports/quality/complexity.json`
- 比較邏輯：`scripts/qualityConfig.js::compareWithBaseline`
