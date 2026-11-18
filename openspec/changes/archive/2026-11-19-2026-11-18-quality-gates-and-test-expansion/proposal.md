## Why

變更 `2026-11-18-port-ksvs-gis-rpc-and-quality` 已完成 GIS 雙軌登入、RPC/CSRF、文件與基礎品質腳本（Prettier、語言檢查、測試自動探索、基礎 CI）之移植，但仍缺少可強制執行的提交前防線與完整的程式碼品質量測門檻。為達成與 KSVS PR 3 相當的品質治理目標（CRAP 門檻 30、MI 門檻 20、測試覆蓋率標準、格式化要求，以及 CI 與 Git hook 自動化），需要一個獨立且可分階段落地的 OpenSpec 提案，明確定義工具、門檻、流程、基準線與驗收條件。

本提案完成並實作後，可回到 `openspec/changes/2026-11-18-port-ksvs-gis-rpc-and-quality/`，將 task 4.5（Husky + lint-staged 與覆蓋率/複雜度/變更覆蓋率檢查腳本）與 task 5.1（補強後端登入/驗證/CSRF/公開設定及前端 RPC/auth/mock 測試）標記為完成（以前提為本提案實作成果已涵蓋對應範圍並通過驗證）。

## Baseline（2026-11-18 量測）

> 量測環境：Node.js v24.16.0（本機）、`node scripts/run-tests.js`（2 個既有測試檔全數通過）、`c8` 覆蓋率報告（`--all`，LCOV/json-summary/json）與 `typhonjs-escomplex` 靜態分析。
> 量測範圍：根目錄 `*.js`、`webapp/js/*.js`、`scripts/*.js`（排除 `tests/**`、`node_modules/**`、`coverage/**`），共 20 個檔案、247 個函式/方法。
> CRAP 計算：`CRAP = comp^2 * (1 - cov)^3 + comp`（`comp` 為 cyclomatic complexity；`cov` 為函式對應語句覆蓋率，依 `coverage/coverage-final.json` 行範圍估算；實作階段將文件化正式對應策略）。

### 基準總覽

| 指標 | 基準值 | 目標/門檻 | 差距說明 |
| --- | --- | ---: | --- |
| 全域 Lines（LCOV） | 27.37%（1529/5586） | 依基準線建立可執行門檻並逐步提升（見 design/tasks） | 落差大，需大幅補測試 |
| 全域 Statements | 27.37%（1529/5586） | 同上 | 與 Lines 同步提升 |
| 全域 Functions | 58.82%（50/85） | 同上 | 中等落差 |
| 全域 Branches | 37.88%（125/330） | 同上 | 落差大 |
| MI（Maintainability Index） | 最低 69.134（`webapp/js/config.js`），**MI < 20：0**（20 檔） | 每個納管模組 MI MUST >= 20 | 目前已達標，需防止回退 |
| CRAP | 最高 1482，**CRAP > 30：56 個函式**（247 個函式中） | 每個納管函式 CRAP MUST NOT > 30 | 落差極大，需測試補強 + 行為不變重構分批收斂 |

### 檔案層級基準（LCOV/覆蓋率 + MI）

| 檔案 | Lines | Statements | Functions | Branches | MI | 函式數 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `databaseInitializer.js` | 52.51% (292/556) | 52.51% (292/556) | 80.00% (8/10) | 28.88% (13/45) | 69.680 | 10 |
| `main.js` | 0.00% (0/82) | 0.00% (0/82) | 0.00% (0/1) | 0.00% (0/1) | 101.181 | 3 |
| `scripts/build-webapp.js` | 0.00% (0/111) | 0.00% (0/111) | 0.00% (0/1) | 0.00% (0/1) | 99.425 | 7 |
| `scripts/deploy.js` | 0.00% (0/113) | 0.00% (0/113) | 0.00% (0/1) | 0.00% (0/1) | 99.393 | 6 |
| `scripts/languageCheck.js` | 0.00% (0/199) | 0.00% (0/199) | 0.00% (0/1) | 0.00% (0/1) | 99.190 | 11 |
| `scripts/run-tests.js` | 85.58% (95/111) | 85.58% (95/111) | 100.00% (3/3) | 50.00% (6/12) | 94.261 | 5 |
| `subjectCodeTransformer.js` | 68.66% (355/517) | 68.66% (355/517) | 83.33% (10/12) | 38.57% (27/70) | 73.194 | 12 |
| `utilities.js` | 69.23% (117/169) | 69.23% (117/169) | 28.57% (2/7) | 73.33% (11/15) | 100.539 | 8 |
| `webApi.js` | 48.62% (389/800) | 48.62% (389/800) | 58.62% (17/29) | 38.61% (39/101) | 79.779 | 29 |
| `webapp/js/accounts.js` | 0.00% (0/364) | 0.00% (0/364) | 0.00% (0/1) | 0.00% (0/1) | 94.086 | 17 |
| `webapp/js/api.js` | 0.00% (0/203) | 0.00% (0/203) | 0.00% (0/1) | 0.00% (0/1) | 103.115 | 17 |
| `webapp/js/app.js` | 0.00% (0/168) | 0.00% (0/168) | 0.00% (0/1) | 0.00% (0/1) | 99.373 | 11 |
| `webapp/js/auth.js` | 0.00% (0/377) | 0.00% (0/377) | 0.00% (0/1) | 0.00% (0/1) | 92.764 | 24 |
| `webapp/js/config.js` | 0.00% (0/113) | 0.00% (0/113) | 0.00% (0/1) | 0.00% (0/1) | 69.134 | 1 |
| `webapp/js/courseData.js` | 98.25% (281/286) | 98.25% (281/286) | 100.00% (10/10) | 39.72% (29/73) | 86.118 | 12 |
| `webapp/js/courses.js` | 0.00% (0/243) | 0.00% (0/243) | 0.00% (0/1) | 0.00% (0/1) | 92.207 | 9 |
| `webapp/js/imports.js` | 0.00% (0/392) | 0.00% (0/392) | 0.00% (0/1) | 0.00% (0/1) | 99.639 | 27 |
| `webapp/js/mock.js` | 0.00% (0/230) | 0.00% (0/230) | 0.00% (0/1) | 0.00% (0/1) | 82.029 | 7 |
| `webapp/js/state.js` | 0.00% (0/68) | 0.00% (0/68) | 0.00% (0/1) | 0.00% (0/1) | 102.601 | 4 |
| `webapp/js/ui.js` | 0.00% (0/484) | 0.00% (0/484) | 0.00% (0/1) | 0.00% (0/1) | 98.525 | 27 |
| **全域合計** | **27.37% (1529/5586)** | **27.37% (1529/5586)** | **58.82% (50/85)** | **37.87% (125/330)** | **最低 69.134** | **247** |

### 函式層級基準（CRAP 全量，依 CRAP 降冪）

| # | 檔案 | 函式 | 行號 | Cyclomatic | Coverage | CRAP | 狀態 |
| ---: | --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | `subjectCodeTransformer.js` | `getNormalizedCourses` | 410 | 38 | 0.0% | 1482.00 | 需重構 |
| 2 | `webApi.js` | `handleOAuthCodeCallback` | 369 | 25 | 0.0% | 650.00 | 需重構 |
| 3 | `webapp/js/accounts.js` | `renderView` | 205 | 24 | 0.0% | 600.00 | 需重構 |
| 4 | `webapp/js/mock.js` | `<anon method-3>` | 108 | 24 | 0.0% | 600.00 | 需重構 |
| 5 | `databaseInitializer.js` | `saveSystemSettings` | 280 | 20 | 0.0% | 420.00 | 需重構 |
| 6 | `webApi.js` | `executeWebApi` | 649 | 20 | 0.0% | 420.00 | 需重構 |
| 7 | `webApi.js` | `doGet` | 692 | 19 | 0.0% | 380.00 | 需重構 |
| 8 | `webapp/js/auth.js` | `applyLoginSuccess` | 70 | 19 | 0.0% | 380.00 | 需重構 |
| 9 | `webApi.js` | `verifyGoogleIdToken` | 233 | 18 | 0.0% | 342.00 | 需重構 |
| 10 | `webapp/js/api.js` | `requestOnce` | 72 | 18 | 0.0% | 342.00 | 需重構 |
| 11 | `webapp/js/auth.js` | `<anon method-11>` | 331 | 18 | 0.0% | 342.00 | 需重構 |
| 12 | `webapp/js/courses.js` | `renderView` | 95 | 18 | 0.0% | 342.00 | 需重構 |
| 13 | `webapp/js/ui.js` | `renderLoginView` | 273 | 18 | 0.0% | 342.00 | 需重構 |
| 14 | `databaseInitializer.js` | `initializeDatabaseSheets` | 93 | 16 | 0.0% | 272.00 | 需重構 |
| 15 | `subjectCodeTransformer.js` | `importNormalizedCourseCodes` | 322 | 16 | 0.0% | 272.00 | 需重構 |
| 16 | `webapp/js/auth.js` | `<anon method-10>` | 300 | 14 | 0.0% | 210.00 | 需重構 |
| 17 | `webapp/js/imports.js` | `renderView` | 247 | 14 | 0.0% | 210.00 | 需重構 |
| 18 | `webapp/js/ui.js` | `renderOverviewView` | 357 | 14 | 0.0% | 210.00 | 需重構 |
| 19 | `webApi.js` | `resolveOAuthRedirectUri` | 348 | 13 | 0.0% | 182.00 | 需重構 |
| 20 | `webapp/js/accounts.js` | `<anon method-6>` | 119 | 12 | 0.0% | 156.00 | 需重構 |
| 21 | `databaseInitializer.js` | `readWhitelist` | 368 | 15 | 22.2% | 120.86 | 需重構 |
| 22 | `scripts/deploy.js` | `main` | 69 | 10 | 0.0% | 110.00 | 需重構 |
| 23 | `webapp/js/api.js` | `<anon method-6>` | 168 | 10 | 0.0% | 110.00 | 需重構 |
| 24 | `webapp/js/auth.js` | `loginWithGoogleRedirect` | 190 | 10 | 0.0% | 110.00 | 需重構 |
| 25 | `webapp/js/config.js` | `<anon method-1>` | 7 | 10 | 0.0% | 110.00 | 需重構 |
| 26 | `webapp/js/courses.js` | `fetchList` | 10 | 10 | 0.0% | 110.00 | 需重構 |
| 27 | `webapp/js/courses.js` | `<anon method-2>` | 27 | 10 | 0.0% | 110.00 | 需重構 |
| 28 | `webapp/js/ui.js` | `toast` | 94 | 10 | 0.0% | 110.00 | 需重構 |
| 29 | `webapp/js/ui.js` | `renderHeader` | 190 | 10 | 0.0% | 110.00 | 需重構 |
| 30 | `webApi.js` | `routeWebApiAction` | 551 | 35 | 61.6% | 104.21 | 需重構 |
| 31 | `utilities.js` | `safeUiAlert` | 45 | 9 | 0.0% | 90.00 | 需重構 |
| 32 | `webApi.js` | `loginWithActiveUser` | 307 | 9 | 0.0% | 90.00 | 需重構 |
| 33 | `webapp/js/app.js` | `render` | 81 | 9 | 0.0% | 90.00 | 需重構 |
| 34 | `webapp/js/auth.js` | `switchGoogleAccount` | 166 | 9 | 0.0% | 90.00 | 需重構 |
| 35 | `databaseInitializer.js` | `saveWhitelist` | 412 | 20 | 46.6% | 81.07 | 需重構 |
| 36 | `main.js` | `openWebAppDialog` | 48 | 8 | 0.0% | 72.00 | 需重構 |
| 37 | `webApi.js` | `loginWithGoogleIdToken` | 291 | 8 | 0.0% | 72.00 | 需重構 |
| 38 | `webapp/js/auth.js` | `renderGoogleButton` | 225 | 8 | 0.0% | 72.00 | 需重構 |
| 39 | `webapp/js/courses.js` | `handleSearch` | 55 | 8 | 0.0% | 72.00 | 需重構 |
| 40 | `webapp/js/imports.js` | `looksLikeCourseCodes` | 64 | 8 | 0.0% | 72.00 | 需重構 |
| 41 | `scripts/build-webapp.js` | `build` | 29 | 7 | 0.0% | 56.00 | 需重構 |
| 42 | `webApi.js` | `doPost` | 748 | 7 | 0.0% | 56.00 | 需重構 |
| 43 | `webapp/js/accounts.js` | `<anon method-4>` | 65 | 7 | 0.0% | 56.00 | 需重構 |
| 44 | `webapp/js/app.js` | `setTab` | 10 | 7 | 0.0% | 56.00 | 需重構 |
| 45 | `webapp/js/app.js` | `applyInitialAuth` | 40 | 7 | 0.0% | 56.00 | 需重構 |
| 46 | `webapp/js/imports.js` | `pickCourseSheetRows` | 78 | 7 | 0.0% | 56.00 | 需重構 |
| 47 | `webapp/js/imports.js` | `<anon method-10>` | 216 | 7 | 0.0% | 56.00 | 需重構 |
| 48 | `main.js` | `initializeDatabaseSheetsMenu` | 23 | 6 | 0.0% | 42.00 | 需重構 |
| 49 | `scripts/deploy.js` | `getArgValue` | 23 | 6 | 0.0% | 42.00 | 需重構 |
| 50 | `scripts/languageCheck.js` | `<anon method-4>` | 126 | 6 | 0.0% | 42.00 | 需重構 |
| 51 | `webapp/js/accounts.js` | `<anon method-9>` | 187 | 6 | 0.0% | 42.00 | 需重構 |
| 52 | `webapp/js/accounts.js` | `saveSettings` | 37 | 6 | 0.0% | 42.00 | 需重構 |
| 53 | `webapp/js/app.js` | `cleanUrlQuery` | 30 | 6 | 0.0% | 42.00 | 需重構 |
| 54 | `webapp/js/auth.js` | `buildAccountChooserUrl` | 152 | 6 | 0.0% | 42.00 | 需重構 |
| 55 | `webapp/js/ui.js` | `toggleTheme` | 45 | 6 | 0.0% | 42.00 | 需重構 |
| 56 | `databaseInitializer.js` | `readSystemSettings` | 223 | 23 | 69.4% | 38.18 | 需重構 |
| 57 | `webApi.js` | `parseWebApiPayload` | 87 | 5 | 0.0% | 30.00 | 通過 |
| 58 | `webApi.js` | `isAllowedOAuthRedirectUri` | 336 | 5 | 0.0% | 30.00 | 通過 |
| 59 | `webapp/js/accounts.js` | `<anon method-2>` | 16 | 5 | 0.0% | 30.00 | 通過 |
| 60 | `webapp/js/app.js` | `<anon method-3>` | 143 | 5 | 0.0% | 30.00 | 通過 |
| 61 | `webapp/js/auth.js` | `<anon method-2>` | 35 | 5 | 0.0% | 30.00 | 通過 |
| 62 | `webapp/js/imports.js` | `handleFileSelect` | 167 | 5 | 0.0% | 30.00 | 通過 |
| 63 | `webapp/js/imports.js` | `handleDrop` | 185 | 5 | 0.0% | 30.00 | 通過 |
| 64 | `webapp/js/imports.js` | `doImport` | 201 | 5 | 0.0% | 30.00 | 通過 |
| 65 | `webapp/js/ui.js` | `applyStyle` | 62 | 5 | 0.0% | 30.00 | 通過 |
| 66 | `webapp/js/ui.js` | `renderNavbar` | 243 | 5 | 0.0% | 30.00 | 通過 |
| 67 | `subjectCodeTransformer.js` | `expandCourseRow` | 205 | 25 | 100.0% | 25.00 | 通過 |
| 68 | `webapp/js/courseData.js` | `expandCourseRow` | 170 | 25 | 100.0% | 25.00 | 通過 |
| 69 | `scripts/deploy.js` | `run` | 58 | 4 | 0.0% | 20.00 | 通過 |
| 70 | `scripts/languageCheck.js` | `<anon method-1>` | 86 | 4 | 0.0% | 20.00 | 通過 |
| 71 | `webapp/js/accounts.js` | `<anon method-3>` | 29 | 4 | 0.0% | 20.00 | 通過 |
| 72 | `webapp/js/accounts.js` | `<anon method-5>` | 87 | 4 | 0.0% | 20.00 | 通過 |
| 73 | `webapp/js/accounts.js` | `<anon method-10>` | 197 | 4 | 0.0% | 20.00 | 通過 |
| 74 | `webapp/js/api.js` | `<anon method-3>` | 101 | 4 | 0.0% | 20.00 | 通過 |
| 75 | `webapp/js/app.js` | `syncDocumentTitle` | 23 | 4 | 0.0% | 20.00 | 通過 |
| 76 | `webapp/js/auth.js` | `isGasHosted` | 24 | 4 | 0.0% | 20.00 | 通過 |
| 77 | `webapp/js/auth.js` | `<anon method-5>` | 55 | 4 | 0.0% | 20.00 | 通過 |
| 78 | `webapp/js/auth.js` | `handleCredential` | 114 | 4 | 0.0% | 20.00 | 通過 |
| 79 | `webapp/js/state.js` | `setState` | 44 | 4 | 0.0% | 20.00 | 通過 |
| 80 | `webapp/js/ui.js` | `roleName` | 24 | 4 | 0.0% | 20.00 | 通過 |
| 81 | `webapp/js/ui.js` | `initThemeAndStyle` | 79 | 4 | 0.0% | 20.00 | 通過 |
| 82 | `subjectCodeTransformer.js` | `normalizeCourseCodes` | 258 | 18 | 90.6% | 18.27 | 通過 |
| 83 | `webapp/js/courseData.js` | `normalizeCourseCodes` | 212 | 18 | 90.6% | 18.27 | 通過 |
| 84 | `webApi.js` | `createSessionForEmail` | 173 | 14 | 84.7% | 14.70 | 通過 |
| 85 | `webApi.js` | `getPublicConfig` | 512 | 13 | 78.9% | 14.58 | 通過 |
| 86 | `utilities.js` | `safeApplySheetFontSize` | 74 | 3 | 0.0% | 12.00 | 通過 |
| 87 | `utilities.js` | `safeSetNumberFormat` | 122 | 3 | 0.0% | 12.00 | 通過 |
| 88 | `utilities.js` | `safeTrim` | 139 | 3 | 0.0% | 12.00 | 通過 |
| 89 | `webApi.js` | `jsonResponse` | 68 | 3 | 0.0% | 12.00 | 通過 |
| 90 | `webapp/js/accounts.js` | `removeAccount` | 158 | 3 | 0.0% | 12.00 | 通過 |
| 91 | `webapp/js/accounts.js` | `toggleAccount` | 166 | 3 | 0.0% | 12.00 | 通過 |
| 92 | `webapp/js/api.js` | `<anon method-1>` | 12 | 3 | 0.0% | 12.00 | 通過 |
| 93 | `webapp/js/api.js` | `setToken` | 32 | 3 | 0.0% | 12.00 | 通過 |
| 94 | `webapp/js/api.js` | `setCsrfToken` | 47 | 3 | 0.0% | 12.00 | 通過 |
| 95 | `webapp/js/api.js` | `parseApiResponse` | 58 | 3 | 0.0% | 12.00 | 通過 |
| 96 | `webapp/js/api.js` | `resolveRpcError` | 91 | 3 | 0.0% | 12.00 | 通過 |
| 97 | `webapp/js/api.js` | `<anon method-4>` | 141 | 3 | 0.0% | 12.00 | 通過 |
| 98 | `webapp/js/api.js` | `<anon method-5>` | 150 | 3 | 0.0% | 12.00 | 通過 |
| 99 | `webapp/js/api.js` | `callWithRetry` | 162 | 3 | 0.0% | 12.00 | 通過 |
| 100 | `webapp/js/app.js` | `<anon method-4>` | 152 | 3 | 0.0% | 12.00 | 通過 |
| 101 | `webapp/js/auth.js` | `<anon method-7>` | 250 | 3 | 0.0% | 12.00 | 通過 |
| 102 | `webapp/js/auth.js` | `<anon method-8>` | 273 | 3 | 0.0% | 12.00 | 通過 |
| 103 | `webapp/js/auth.js` | `restore` | 297 | 3 | 0.0% | 12.00 | 通過 |
| 104 | `webapp/js/courses.js` | `<anon method-1>` | 7 | 3 | 0.0% | 12.00 | 通過 |
| 105 | `webapp/js/courses.js` | `<anon method-3>` | 47 | 3 | 0.0% | 12.00 | 通過 |
| 106 | `webapp/js/imports.js` | `loadSheetJs` | 18 | 3 | 0.0% | 12.00 | 通過 |
| 107 | `webapp/js/imports.js` | `<anon method-9>` | 155 | 3 | 0.0% | 12.00 | 通過 |
| 108 | `webapp/js/imports.js` | `<anon method-11>` | 237 | 3 | 0.0% | 12.00 | 通過 |
| 109 | `webapp/js/ui.js` | `escapeHtml` | 10 | 3 | 0.0% | 12.00 | 通過 |
| 110 | `webapp/js/ui.js` | `currentStyle` | 58 | 3 | 0.0% | 12.00 | 通過 |
| 111 | `webapp/js/ui.js` | `modal` | 131 | 3 | 0.0% | 12.00 | 通過 |
| 112 | `scripts/run-tests.js` | `runTests` | 57 | 11 | 82.6% | 11.64 | 通過 |
| 113 | `databaseInitializer.js` | `normalizeRole` | 63 | 9 | 100.0% | 9.00 | 通過 |
| 114 | `utilities.js` | `sanitizeFormulaValue` | 92 | 9 | 100.0% | 9.00 | 通過 |
| 115 | `subjectCodeTransformer.js` | `isCourseCodeHeaderRow` | 172 | 8 | 100.0% | 8.00 | 通過 |
| 116 | `webapp/js/courseData.js` | `isCourseCodeHeaderRow` | 156 | 8 | 100.0% | 8.00 | 通過 |
| 117 | `databaseInitializer.js` | `parseConfigBoolean` | 208 | 7 | 100.0% | 7.00 | 通過 |
| 118 | `scripts/run-tests.js` | `<anon method-1>` | 32 | 5 | 58.3% | 6.81 | 通過 |
| 119 | `webApi.js` | `hasPermission` | 106 | 6 | 100.0% | 6.00 | 通過 |
| 120 | `scripts/languageCheck.js` | `<anon method-2>` | 101 | 2 | 0.0% | 6.00 | 通過 |
| 121 | `scripts/languageCheck.js` | `collectFiles` | 122 | 2 | 0.0% | 6.00 | 通過 |
| 122 | `scripts/languageCheck.js` | `checkProject` | 149 | 2 | 0.0% | 6.00 | 通過 |
| 123 | `scripts/languageCheck.js` | `<anon method-5>` | 152 | 2 | 0.0% | 6.00 | 通過 |
| 124 | `scripts/languageCheck.js` | `main` | 164 | 2 | 0.0% | 6.00 | 通過 |
| 125 | `scripts/languageCheck.js` | `<anon method-6>` | 167 | 2 | 0.0% | 6.00 | 通過 |
| 126 | `utilities.js` | `generateUniqueId` | 150 | 2 | 0.0% | 6.00 | 通過 |
| 127 | `webApi.js` | `webApiSuccess` | 75 | 2 | 0.0% | 6.00 | 通過 |
| 128 | `webapp/js/accounts.js` | `loadSettingsAndAccounts` | 10 | 2 | 0.0% | 6.00 | 通過 |
| 129 | `webapp/js/accounts.js` | `<anon method-8>` | 168 | 2 | 0.0% | 6.00 | 通過 |
| 130 | `webapp/js/accounts.js` | `saveAccountsList` | 177 | 2 | 0.0% | 6.00 | 通過 |
| 131 | `webapp/js/app.js` | `<anon method-1>` | 7 | 2 | 0.0% | 6.00 | 通過 |
| 132 | `webapp/js/app.js` | `applyAccountSwitch` | 72 | 2 | 0.0% | 6.00 | 通過 |
| 133 | `webapp/js/auth.js` | `loadGis` | 33 | 2 | 0.0% | 6.00 | 通過 |
| 134 | `webapp/js/courses.js` | `resetSearch` | 82 | 2 | 0.0% | 6.00 | 通過 |
| 135 | `webapp/js/imports.js` | `attempt` | 28 | 2 | 0.0% | 6.00 | 通過 |
| 136 | `webapp/js/imports.js` | `<anon method-3>` | 36 | 2 | 0.0% | 6.00 | 通過 |
| 137 | `webapp/js/imports.js` | `rowsOfSheet` | 53 | 2 | 0.0% | 6.00 | 通過 |
| 138 | `webapp/js/imports.js` | `previewFile` | 126 | 2 | 0.0% | 6.00 | 通過 |
| 139 | `webapp/js/imports.js` | `<anon method-8>` | 131 | 2 | 0.0% | 6.00 | 通過 |
| 140 | `webapp/js/imports.js` | `pickFile` | 162 | 2 | 0.0% | 6.00 | 通過 |
| 141 | `webapp/js/imports.js` | `handleDragOver` | 173 | 2 | 0.0% | 6.00 | 通過 |
| 142 | `webapp/js/imports.js` | `handleDragLeave` | 179 | 2 | 0.0% | 6.00 | 通過 |
| 143 | `webapp/js/state.js` | `subscribe` | 56 | 2 | 0.0% | 6.00 | 通過 |
| 144 | `webapp/js/state.js` | `unsubscribe` | 60 | 2 | 0.0% | 6.00 | 通過 |
| 145 | `webapp/js/ui.js` | `number` | 19 | 2 | 0.0% | 6.00 | 通過 |
| 146 | `webapp/js/ui.js` | `applyTheme` | 32 | 2 | 0.0% | 6.00 | 通過 |
| 147 | `webapp/js/ui.js` | `currentTheme` | 41 | 2 | 0.0% | 6.00 | 通過 |
| 148 | `webapp/js/ui.js` | `getStyleList` | 54 | 2 | 0.0% | 6.00 | 通過 |
| 149 | `webapp/js/ui.js` | `<anon method-4>` | 121 | 2 | 0.0% | 6.00 | 通過 |
| 150 | `webapp/js/ui.js` | `<anon method-5>` | 155 | 2 | 0.0% | 6.00 | 通過 |
| 151 | `webapp/js/ui.js` | `<anon method-6>` | 159 | 2 | 0.0% | 6.00 | 通過 |
| 152 | `webapp/js/ui.js` | `<anon method-7>` | 176 | 2 | 0.0% | 6.00 | 通過 |
| 153 | `webapp/js/ui.js` | `closeModal` | 181 | 2 | 0.0% | 6.00 | 通過 |
| 154 | `webapp/js/ui.js` | `debounce` | 449 | 2 | 0.0% | 6.00 | 通過 |
| 155 | `webapp/js/ui.js` | `<anon method-8>` | 452 | 2 | 0.0% | 6.00 | 通過 |
| 156 | `webApi.js` | `authorizeWebApiAction` | 493 | 5 | 71.4% | 5.58 | 通過 |
| 157 | `databaseInitializer.js` | `bootstrapAdminIfNeeded` | 513 | 5 | 95.7% | 5.00 | 通過 |
| 158 | `subjectCodeTransformer.js` | `isExcludedCourseRow` | 185 | 5 | 100.0% | 5.00 | 通過 |
| 159 | `webApi.js` | `isAllowedGoogleDomain` | 159 | 5 | 100.0% | 5.00 | 通過 |
| 160 | `webapp/js/courseData.js` | `isExcludedCourseRow` | 163 | 5 | 100.0% | 5.00 | 通過 |
| 161 | `databaseInitializer.js` | `getAccountRole` | 478 | 4 | 69.2% | 4.47 | 通過 |
| 162 | `webApi.js` | `getSessionInfo` | 450 | 4 | 89.5% | 4.02 | 通過 |
| 163 | `subjectCodeTransformer.js` | `getGroupName` | 136 | 4 | 100.0% | 4.00 | 通過 |
| 164 | `subjectCodeTransformer.js` | `getDepartmentNameByCode` | 141 | 4 | 100.0% | 4.00 | 通過 |
| 165 | `subjectCodeTransformer.js` | `getSubjectType` | 146 | 4 | 100.0% | 4.00 | 通過 |
| 166 | `subjectCodeTransformer.js` | `getOpenWay` | 151 | 4 | 100.0% | 4.00 | 通過 |
| 167 | `subjectCodeTransformer.js` | `getSubjectAttribution` | 156 | 4 | 100.0% | 4.00 | 通過 |
| 168 | `subjectCodeTransformer.js` | `isRequiredOrElective` | 161 | 4 | 100.0% | 4.00 | 通過 |
| 169 | `webapp/js/courseData.js` | `<anon method-1>` | 8 | 4 | 100.0% | 4.00 | 通過 |
| 170 | `webapp/js/courseData.js` | `getGroupName` | 126 | 4 | 100.0% | 4.00 | 通過 |
| 171 | `webapp/js/courseData.js` | `getDepartmentNameByCode` | 131 | 4 | 100.0% | 4.00 | 通過 |
| 172 | `webapp/js/courseData.js` | `getSubjectType` | 136 | 4 | 100.0% | 4.00 | 通過 |
| 173 | `webapp/js/courseData.js` | `getOpenWay` | 141 | 4 | 100.0% | 4.00 | 通過 |
| 174 | `webapp/js/courseData.js` | `getSubjectAttribution` | 146 | 4 | 100.0% | 4.00 | 通過 |
| 175 | `webapp/js/courseData.js` | `isRequiredOrElective` | 151 | 4 | 100.0% | 4.00 | 通過 |
| 176 | `scripts/run-tests.js` | `main` | 87 | 3 | 54.5% | 3.85 | 通過 |
| 177 | `scripts/run-tests.js` | `discoverTestFiles` | 25 | 3 | 68.2% | 3.29 | 通過 |
| 178 | `webApi.js` | `generateSessionToken` | 132 | 3 | 77.8% | 3.10 | 通過 |
| 179 | `webApi.js` | `generateCsrfToken` | 142 | 3 | 77.8% | 3.10 | 通過 |
| 180 | `webApi.js` | `getCacheStore` | 115 | 3 | 87.5% | 3.02 | 通過 |
| 181 | `webApi.js` | `webApiError` | 79 | 3 | 100.0% | 3.00 | 通過 |
| 182 | `webApi.js` | `getSessionState` | 470 | 3 | 100.0% | 3.00 | 通過 |
| 183 | `webApi.js` | `logoutSession` | 484 | 3 | 100.0% | 3.00 | 通過 |
| 184 | `databaseInitializer.js` | `getRoleDisplayName` | 74 | 2 | 100.0% | 2.00 | 通過 |
| 185 | `utilities.js` | `sanitizeRowMatrix` | 108 | 2 | 100.0% | 2.00 | 通過 |
| 186 | `utilities.js` | `<anon method-1>` | 110 | 2 | 100.0% | 2.00 | 通過 |
| 187 | `webApi.js` | `<anon method-1>` | 120 | 2 | 100.0% | 2.00 | 通過 |
| 188 | `webApi.js` | `normalizeAllowedDomain` | 152 | 2 | 100.0% | 2.00 | 通過 |
| 189 | `main.js` | `onOpen` | 10 | 1 | 0.0% | 2.00 | 通過 |
| 190 | `scripts/build-webapp.js` | `read` | 21 | 1 | 0.0% | 2.00 | 通過 |
| 191 | `scripts/build-webapp.js` | `escapeScript` | 25 | 1 | 0.0% | 2.00 | 通過 |
| 192 | `scripts/build-webapp.js` | `<anon method-1>` | 41 | 1 | 0.0% | 2.00 | 通過 |
| 193 | `scripts/build-webapp.js` | `<anon method-2>` | 68 | 1 | 0.0% | 2.00 | 通過 |
| 194 | `scripts/build-webapp.js` | `<anon method-3>` | 73 | 1 | 0.0% | 2.00 | 通過 |
| 195 | `scripts/build-webapp.js` | `<anon method-4>` | 86 | 1 | 0.0% | 2.00 | 通過 |
| 196 | `scripts/deploy.js` | `hasFlag` | 35 | 1 | 0.0% | 2.00 | 通過 |
| 197 | `scripts/deploy.js` | `<anon method-1>` | 36 | 1 | 0.0% | 2.00 | 通過 |
| 198 | `scripts/deploy.js` | `printHelp` | 41 | 1 | 0.0% | 2.00 | 通過 |
| 199 | `scripts/languageCheck.js` | `checkContent` | 83 | 1 | 0.0% | 2.00 | 通過 |
| 200 | `scripts/languageCheck.js` | `<anon method-3>` | 125 | 1 | 0.0% | 2.00 | 通過 |
| 201 | `scripts/languageCheck.js` | `<anon method-7>` | 169 | 1 | 0.0% | 2.00 | 通過 |
| 202 | `scripts/run-tests.js` | `<anon method-2>` | 91 | 1 | 0.0% | 2.00 | 通過 |
| 203 | `webapp/js/accounts.js` | `<anon method-1>` | 7 | 1 | 0.0% | 2.00 | 通過 |
| 204 | `webapp/js/accounts.js` | `addAccountPrompt` | 95 | 1 | 0.0% | 2.00 | 通過 |
| 205 | `webapp/js/accounts.js` | `<anon method-7>` | 160 | 1 | 0.0% | 2.00 | 通過 |
| 206 | `webapp/js/api.js` | `getToken` | 28 | 1 | 0.0% | 2.00 | 通過 |
| 207 | `webapp/js/api.js` | `getCsrfToken` | 43 | 1 | 0.0% | 2.00 | 通過 |
| 208 | `webapp/js/api.js` | `<anon method-2>` | 90 | 1 | 0.0% | 2.00 | 通過 |
| 209 | `webapp/js/api.js` | `execute` | 167 | 1 | 0.0% | 2.00 | 通過 |
| 210 | `webapp/js/api.js` | `<anon method-7>` | 176 | 1 | 0.0% | 2.00 | 通過 |
| 211 | `webapp/js/api.js` | `call` | 191 | 1 | 0.0% | 2.00 | 通過 |
| 212 | `webapp/js/app.js` | `<anon method-2>` | 102 | 1 | 0.0% | 2.00 | 通過 |
| 213 | `webapp/js/app.js` | `init` | 137 | 1 | 0.0% | 2.00 | 通過 |
| 214 | `webapp/js/auth.js` | `<anon method-1>` | 7 | 1 | 0.0% | 2.00 | 通過 |
| 215 | `webapp/js/auth.js` | `<anon method-3>` | 42 | 1 | 0.0% | 2.00 | 通過 |
| 216 | `webapp/js/auth.js` | `<anon method-4>` | 45 | 1 | 0.0% | 2.00 | 通過 |
| 217 | `webapp/js/auth.js` | `<anon method-6>` | 62 | 1 | 0.0% | 2.00 | 通過 |
| 218 | `webapp/js/auth.js` | `buildGoogleAuthUrl` | 124 | 1 | 0.0% | 2.00 | 通過 |
| 219 | `webapp/js/auth.js` | `loginActiveUser` | 220 | 1 | 0.0% | 2.00 | 通過 |
| 220 | `webapp/js/auth.js` | `loginMock` | 278 | 1 | 0.0% | 2.00 | 通過 |
| 221 | `webapp/js/auth.js` | `logout` | 283 | 1 | 0.0% | 2.00 | 通過 |
| 222 | `webapp/js/auth.js` | `<anon method-9>` | 284 | 1 | 0.0% | 2.00 | 通過 |
| 223 | `webapp/js/courses.js` | `<anon method-4>` | 77 | 1 | 0.0% | 2.00 | 通過 |
| 224 | `webapp/js/courses.js` | `<anon method-5>` | 80 | 1 | 0.0% | 2.00 | 通過 |
| 225 | `webapp/js/imports.js` | `<anon method-1>` | 7 | 1 | 0.0% | 2.00 | 通過 |
| 226 | `webapp/js/imports.js` | `<anon method-2>` | 25 | 1 | 0.0% | 2.00 | 通過 |
| 227 | `webapp/js/imports.js` | `readFileRows` | 95 | 1 | 0.0% | 2.00 | 通過 |
| 228 | `webapp/js/imports.js` | `<anon method-4>` | 96 | 1 | 0.0% | 2.00 | 通過 |
| 229 | `webapp/js/imports.js` | `<anon method-5>` | 97 | 1 | 0.0% | 2.00 | 通過 |
| 230 | `webapp/js/imports.js` | `<anon method-6>` | 99 | 1 | 0.0% | 2.00 | 通過 |
| 231 | `webapp/js/imports.js` | `<anon method-7>` | 108 | 1 | 0.0% | 2.00 | 通過 |
| 232 | `webapp/js/imports.js` | `previewCourseCodes` | 116 | 1 | 0.0% | 2.00 | 通過 |
| 233 | `webapp/js/imports.js` | `resetImport` | 194 | 1 | 0.0% | 2.00 | 通過 |
| 234 | `webapp/js/mock.js` | `<anon method-1>` | 7 | 1 | 0.0% | 2.00 | 通過 |
| 235 | `webapp/js/mock.js` | `buildLoginPayload` | 92 | 1 | 0.0% | 2.00 | 通過 |
| 236 | `webapp/js/mock.js` | `handle` | 106 | 1 | 0.0% | 2.00 | 通過 |
| 237 | `webapp/js/mock.js` | `<anon method-2>` | 107 | 1 | 0.0% | 2.00 | 通過 |
| 238 | `webapp/js/mock.js` | `<anon method-4>` | 156 | 1 | 0.0% | 2.00 | 通過 |
| 239 | `webapp/js/mock.js` | `<anon method-5>` | 213 | 1 | 0.0% | 2.00 | 通過 |
| 240 | `webapp/js/state.js` | `<anon method-1>` | 7 | 1 | 0.0% | 2.00 | 通過 |
| 241 | `webapp/js/ui.js` | `<anon method-1>` | 7 | 1 | 0.0% | 2.00 | 通過 |
| 242 | `webapp/js/ui.js` | `<anon method-2>` | 114 | 1 | 0.0% | 2.00 | 通過 |
| 243 | `webapp/js/ui.js` | `<anon method-3>` | 119 | 1 | 0.0% | 2.00 | 通過 |
| 244 | `webapp/js/ui.js` | `<anon method-9>` | 458 | 1 | 0.0% | 2.00 | 通過 |
| 245 | `webapp/js/courseData.js` | `<anon method-2>` | 15 | 1 | 98.2% | 1.00 | 通過 |
| 246 | `webApi.js` | `<anon method-2>` | 123 | 1 | 100.0% | 1.00 | 通過 |
| 247 | `webApi.js` | `<anon method-3>` | 126 | 1 | 100.0% | 1.00 | 通過 |

## What Changes

- **提交前品質防線（Git Hook + 格式化）**：導入 Husky 與 lint-staged，於 `pre-commit` 對暫存檔執行 **Prettier 程式碼格式化**（必要時自動修正並重新加入暫存區）與適用之語言規範檢查；提供可重現的安裝與初始化流程（`prepare` 腳本或等效機制），並確保 CI/非互動安裝安全。
- **格式化治理**：維持並強化 Prettier 為單一格式標準，確保本機指令、pre-commit 與 CI 皆使用一致規則與忽略清單（不格式化建置產物與不適用檔案）。
- **測試覆蓋率標準與量測工具**：導入 c8（或等效工具）建立可重複執行的覆蓋率量測與報告流程（全域與變更範圍），納入納管範圍、排除規則、報告產物與門檻檢查腳本；依基準線定義初始門檻、變更覆蓋率門檻與「不得低於基準線」不回退政策。
- **複雜度與可維護性門檻**：導入靜態分析與品質計算腳本，強制執行 **CRAP 分數門檻（每個納管函式 CRAP MUST NOT 大於 30）** 與 **Maintainability Index 門檻（每個納管模組 MI MUST 大於或等於 20）**；超標時提供可定位的報告並使檢查失敗。
- **CI 品質閘門擴充**：擴充 `.github/workflows/quality-gates.yml`，整合格式檢查、語言檢查、測試、覆蓋率、CRAP/MI 與變更覆蓋率檢查；明確比較基準、Node 版本、報告產物與失敗條件。
- **測試補強（配合主變更 5.1）**：擴充自動化測試涵蓋後端 `executeWebApi`/登入與 ID Token 驗證情境/允許網域/Session 與 CSRF/公開設定欄位、前端 API 客戶端 RPC 優先與 fetch 備援/可重試錯誤/CSRF 傳遞、前端 auth 啟動流程（`INITIAL_AUTH`、`switch=1`、session 還原、GAS/GIS/mock 分流）與 mock 相容行為。
- **品質收斂重構**：針對 CRAP 超標與低覆蓋熱點進行行為不變之拆分重構與補測試，確保達成硬門檻且不破壞既有功能。
- **文件與開發流程更新**：更新 `README.md`、`AGENTS.md` 或相關文件，說明安裝、Git hook（含格式化）行為、品質指令、門檻定義、基準線/不回退政策、例外處理原則與常見排錯方式。
- **BREAKING (開發流程層面)**：啟用 Git hook 與 CI 品質閘門後，不符合格式、語言規範、測試、覆蓋率、CRAP 或 MI 門檻的提交/變更將無法通過本機 pre-commit 或 CI。

## Capabilities

### New Capabilities
- `precommit-quality-gates`: 定義 Husky + lint-staged 提交流程、**pre-commit 自動格式化（Prettier）** 與基礎檢查範圍、安裝機制與開發者操作/例外規範。
- `coverage-and-complexity-gates`: 定義測試覆蓋率、CRAP、Maintainability Index 與變更覆蓋率的量測方法、腳本介面、門檻政策、報告格式與 CI 強制規則（含基準線與不回退）。
- `auth-rpc-test-coverage`: 定義需補強之後端登入/驗證/Session/CSRF/公開設定與前端 API/auth/mock 測試的行為覆蓋範圍與驗收條件，用以支援主變更 task 5.1 完成。

### Modified Capabilities
- （無既有 OpenSpec capability 規格；本變更以新增 capability 管理品質治理與測試擴充）

## Impact

- **開發相依與設定**：`package.json`（scripts、devDependencies、prepare/lint-staged 設定）、`.husky/**`、Prettier/忽略設定與可能新增之品質設定檔（如覆蓋率/複雜度基準與門檻設定）。
- **品質腳本**：`scripts/run-tests.js`（必要時擴充）、新增或調整覆蓋率/複雜度/變更覆蓋率檢查腳本（如 `scripts/checkCoverage.js`、`scripts/checkComplexity.js`、`scripts/checkChangedCoverage.js` 或等效整合腳本）。
- **CI**：`.github/workflows/quality-gates.yml`（新增覆蓋率與複雜度步驟、比較基準 fetch 深度、報告產物/快取策略視需求調整）。
- **測試**：`tests/**`（新增/調整後端與前端模擬測試）、測試輔助工具或共用載入方式（若需要）。
- **程式碼（為符合門檻之行為不變重構）**：`webApi.js`、`databaseInitializer.js`、`subjectCodeTransformer.js`、`webapp/js/*.js`、`scripts/*.js` 等高 CRAP/低覆蓋熱點。
- **文件**：`README.md`、`AGENTS.md`、必要時 `docs/*` 中與開發流程相關之說明。
- **外部工具與執行環境**：Node.js（本機與 CI 版本一致性）、Git hooks、GitHub Actions；c8、Husky、lint-staged、複雜度分析（如 typhonjs-escomplex）等 npm 套件。
