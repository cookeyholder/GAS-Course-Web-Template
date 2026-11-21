# 提高可維護性指數 (MI) 門檻至 50 任務清單

## 任務細分

- [x] 1. 更新品質設定與複雜度檢查腳本
  - [x] 1.1 修改 `scripts/qualityConfig.js` 中的 `THRESHOLDS.maintainability` 為 `50`
  - [x] 1.2 修改 `scripts/checkComplexity.js` 中 `evaluateComplexity` 的 fallback 預設門檻為 `50`

- [x] 2. 更新品質與複雜度相關單元測試
  - [x] 2.1 更新 `tests/qualityConfig.test.js` 斷言 `maintainability` 為 `50`
  - [x] 2.2 更新 `tests/checkComplexity.test.js` 中的預設門檻測試為 `50`，並將測試假資料 `a.js` 之 MI 值由 25 調升至 60
  - [x] 2.3 更新 `tests/qualityDocumentation.test.js` 中的文件比對斷言與預期門檻為 `50`
  - [x] 2.4 更新 `tests/qualityRatchet.test.js` 中的測試門檻設定為 `50`

- [ ] 3. 同步專案文件與規範說明
  - [ ] 3.1 更新 `AGENTS.md` 中的 MI 門檻說明為 `MI MUST >= 50`
  - [ ] 3.2 更新 `README.md` 第 223 行品質指標清單項（`MI MUST >= 50`）與第 253 行疑難排解文字（`MI < 50`）
  - [ ] 3.3 同步更新 main spec `openspec/specs/coverage-and-complexity-gates/spec.md`

- [ ] 4. 本地完整 CI 品質閘門驗證
  - [ ] 4.1 執行單元測試 `npm test` 確認全數通過
  - [ ] 4.2 執行靜態檢查 `npm run format:check`、`npm run check:lang`、`npm run check:ui-classes`、`npm run check:contrast`、`npm run check:a11y`
  - [ ] 4.3 執行品質門檻 `npm run check:coverage`、`npm run check:complexity`、`CHANGED_COVERAGE_BASE=origin/main npm run check:changed-coverage`
