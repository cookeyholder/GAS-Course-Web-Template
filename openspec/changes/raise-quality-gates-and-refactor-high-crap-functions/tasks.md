# 提高品質門檻與重構高 CRAP 函式任務清單

## 任務細分

- [x] 1. 拆分高複雜度函式為純輔助函式（消除 CRAP 瓶頸）
  - [x] 1.1 重構 `webapp/js/config.js` 中的 `isTrustedApiEndpoint`：抽出 `parseCandidateUrl_` 與 `isMatchingTrustedHostOrOrigin_`，確保循環複雜度 <= 8
  - [x] 1.2 重構 `webapp/js/listController.js` 中的 `createListController`：抽出 `normalizeListControllerOptions_` 集中預設選項正規化，確保循環複雜度 <= 8
  - [x] 1.3 重構 `webApi.js` 中的 `handleOAuthCodeCallback`：抽出 `validateOAuthCredentials_` 與 `evaluateTokenExchangeResponse_`，確保循環複雜度 <= 8
  - [x] 1.4 重構 `webapp/js/errorMessages.js` 中的 `resolveSafeMessage`：抽出 `resolveFromCodeMap_` 與 `resolveFromErrorObject_`，確保循環複雜度 <= 6
  - [x] 1.5 重新建置前端打包產物 `npm run build:webapp` 並執行單元測試確認行為不變

- [ ] 2. 升級品質門檻設定與檢查腳本
  - [ ] 2.1 修改 `scripts/qualityConfig.js`：`THRESHOLDS.global.lines` 改為 `60`、`THRESHOLDS.global.branches` 改為 `60`、`THRESHOLDS.changed.branches` 改為 `80`、`THRESHOLDS.crap` 改為 `25`
  - [ ] 2.2 修改 `scripts/checkComplexity.js`：更新 JSDoc 說明與 `evaluateComplexity` fallback 之 `crapThreshold` 為 `25`

- [ ] 3. 更新品質相關單元測試套件
  - [ ] 3.1 更新 `tests/qualityConfig.test.js`：斷言 Lines 60、Branches 60、Changed Branches 80、CRAP 25
  - [ ] 3.2 更新 `tests/checkComplexity.test.js`：更新 CRAP 門檻為 25，並加入未提供 crap 門檻時 fallback 為 25 的斷言
  - [ ] 3.3 更新 `tests/qualityDocumentation.test.js`：更新文件關鍵字比對 Token（包含 `"25"`, `"60%"`, `"80%"`）
  - [ ] 3.4 更新 `tests/qualityRatchet.test.js`：更新測試案例門檻設定

- [ ] 4. 同步專案手冊、OpenSpec 規格與本地完整 CI 驗證
  - [ ] 4.1 更新 `AGENTS.md` 品質門檻摘要（Lines >= 60%、Branches >= 60%、Changed Branches >= 80%、CRAP MUST NOT > 25）
  - [ ] 4.2 更新 `README.md` 的 6 處門檻指標與說明文字（第 220 行、第 221 行、第 222 行、第 236 行標題、第 253 行與第 254 行疑難排解段落）
  - [ ] 4.3 同步更新 main spec `openspec/specs/coverage-and-complexity-gates/spec.md`
  - [ ] 4.4 執行本地完整 CI 品質閘門預跑（格式、語言、測試、無障礙、覆蓋率、CRAP/MI 複雜度、變更覆蓋率）全數綠燈
