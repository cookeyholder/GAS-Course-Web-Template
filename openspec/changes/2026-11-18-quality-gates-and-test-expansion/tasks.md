## 執行規則與進度追蹤

- 任務依序執行；重構/補測試目標以「**一個目標檔案或一個函數 = 一個 task**」列出（見 G2-G8）。
- 每完成一個 task：更新勾選狀態並提交一次 commit（依主變更執行規範）。
- **每完成一組相關 tasks（每個 `## Gx` 群組）後**：重新量測全專案 **LCOV/覆蓋率、MI、CRAP**，在該組下方的「量測快照」表新增一列（或更新待填列）記錄當前數值，以追蹤階段進步。
- 量測指令（工具落地後）：`npm run test:coverage`（或等效 c8 指令產出 lcov/json-summary/json）、`npm run check:complexity`（或等效 CRAP/MI 報告指令）；落地前可使用提案記錄之臨時量測方式。
- 門檻目標：每個納管函式 **CRAP MUST NOT > 30**、每個納管模組 **MI MUST >= 20**；覆蓋率遵循基準線不回退與初始/變更門檻政策（見 `proposal.md`/`design.md`）。

---

## G1. 量測基礎建設與品質防線（完成後可持續量測）

- [x] G1.1 新增品質工具 devDependencies 與 npm scripts 骨架（Husky、lint-staged、c8、複雜度分析套件，及 `test:coverage`、`check:coverage`、`check:changed-coverage`、`check:complexity`），並更新 `.gitignore`/`.prettierignore` 排除覆蓋率與品質報告產物；驗證：安裝成功且 `npm run` 可見新指令。
- [x] G1.2 建立品質設定與基準檔（納管範圍、排除規則、覆蓋率/CRAP/MI/變更覆蓋率門檻、基準線儲存與報告目錄），固化 2026-11-18 基準（LCOV/MI/CRAP）；驗證：設定可被腳本讀取且基準可追溯。
- [x] G1.3 整合 c8 與 `scripts/run-tests.js` 產出 `text/lcov/json/json-summary` 報告（含 `--all` 全量納管範圍）；驗證：`npm run test:coverage` 可重現量測。
- [x] G1.4 實作 `check:coverage`（全域門檻與基準線不回退，初始門檻 Lines>=30%、Statements>=30%、Functions>=60%、Branches>=40% 且不得低於基準線）；驗證：未達標/回退失敗、達標成功。
- [x] G1.5 實作 `check:complexity` 計算模組 MI 與函式 CRAP，輸出摘要與 JSON 報告並強制 CRAP <= 30、MI >= 20；驗證：可定位違規並正確回報狀態。
- [x] G1.6 實作 `check:changed-coverage`（diff + 覆蓋率，支援 `--base`/CI），門檻 Lines>=80%、Branches>=70%，無可量測變更時明確成功/略過；驗證：案例行為正確。
- [x] G1.7 啟用 Husky + lint-staged，`pre-commit` 對暫存檔執行 `prettier --write`（自動格式化並更新暫存）與適用語言規範檢查，確保 CI/非互動安裝安全；驗證：hook 可重現且格式化生效。
- [x] G1.8 更新 `.github/workflows/quality-gates.yml` 納入覆蓋率/變更覆蓋率/CRAP/MI 檢查與 diff 所需 checkout 設定，並對齊 Node 版本策略（本機/CI 以 Node 24 為目標，文件化）；驗證：workflow 與指令流程一致。
- [ ] G1.9 更新 `README.md`、`AGENTS.md`（及必要文件）說明品質指令、hook、自動格式化、門檻與基準線/不回退政策；驗證：可依文件重現。

#### 量測快照（完成本組後更新）

| 階段 | 時間 | Lines (LCOV) | Statements | Functions | Branches | MI 最低 | CRAP > 30 數 | CRAP 最高 | 備註 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基準 | 2026-11-18 | 27.37% (1529/5586) | 27.37% (1529/5586) | 58.82% (50/85) | 37.87% (125/330) | 69.134 (`webapp/js/config.js`) | 56 | 1482.00 (`subjectCodeTransformer.js::getNormalizedCourses`) | Node v24.16.0, c8 --all, 247 函式, MI<20=0 |
| G1 完成後 | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | 工具鏈/門檻/Hook/CI 基礎落地 |

---

## G2. 後端 Web API 核心與登入驗證（目標函式逐一收斂）

- [ ] G2.1 重構/補測試目標：`webApi.js::handleOAuthCodeCallback`（L369, Cyclomatic 25, Cov 0.0%, CRAP 650.00）；驗證：`npm test` 通過且該函式 CRAP <= 30、行為不變。
- [ ] G2.2 重構/補測試目標：`webApi.js::executeWebApi`（L649, 20, 0.0%, 420.00）；驗證同上。
- [ ] G2.3 重構/補測試目標：`webApi.js::doGet`（L692, 19, 0.0%, 380.00）；驗證同上。
- [ ] G2.4 重構/補測試目標：`webApi.js::verifyGoogleIdToken`（L233, 18, 0.0%, 342.00）；驗證同上。
- [ ] G2.5 重構/補測試目標：`webApi.js::resolveOAuthRedirectUri`（L348, 13, 0.0%, 182.00）；驗證同上。
- [ ] G2.6 重構/補測試目標：`webApi.js::routeWebApiAction`（L551, 35, 61.6%, 104.21）；驗證同上（含 action 分支與權限/CSRF 路徑測試補強）。
- [ ] G2.7 重構/補測試目標：`webApi.js::loginWithActiveUser`（L307, 9, 0.0%, 90.00）；驗證同上。
- [ ] G2.8 重構/補測試目標：`webApi.js::loginWithGoogleIdToken`（L291, 8, 0.0%, 72.00）；驗證同上。
- [ ] G2.9 重構/補測試目標：`webApi.js::doPost`（L748, 7, 0.0%, 56.00）；驗證同上。
- [ ] G2.10 補強後端公開設定/Session/CSRF 測試覆蓋（支援主變更 5.1）：`getPublicConfig`、session 核發/驗證、CSRF 保護與錯誤分支；驗證：`npm test` 通過且關鍵路徑可回歸。

#### 量測快照（完成本組後更新）

| 階段 | 時間 | Lines (LCOV) | Statements | Functions | Branches | MI 最低 | CRAP > 30 數 | CRAP 最高 | 備註 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基準 | 2026-11-18 | 27.37% (1529/5586) | 27.37% (1529/5586) | 58.82% (50/85) | 37.87% (125/330) | 69.134 (`webapp/js/config.js`) | 56 | 1482.00 (`subjectCodeTransformer.js::getNormalizedCourses`) |  |
| G2 完成後 | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | `webApi.js` 核心目標收斂 |

---

## G3. 後端資料庫初始化與工具函式（目標函式逐一收斂）

- [ ] G3.1 重構/補測試目標：`databaseInitializer.js::saveSystemSettings`（L280, 20, 0.0%, 420.00）；驗證：`npm test` 通過且 CRAP <= 30。
- [ ] G3.2 重構/補測試目標：`databaseInitializer.js::initializeDatabaseSheets`（L93, 16, 0.0%, 272.00）；驗證同上。
- [ ] G3.3 重構/補測試目標：`databaseInitializer.js::readWhitelist`（L368, 15, 22.2%, 120.86）；驗證同上。
- [ ] G3.4 重構/補測試目標：`databaseInitializer.js::saveWhitelist`（L412, 20, 46.6%, 81.07）；驗證同上。
- [ ] G3.5 重構/補測試目標：`databaseInitializer.js::readSystemSettings`（L223, 23, 69.4%, 38.18）；驗證同上。
- [ ] G3.6 重構/補測試目標：`utilities.js::safeUiAlert`（L45, 9, 0.0%, 90.00）；驗證同上。
- [ ] G3.7 重構/補測試目標：`main.js::openWebAppDialog`（L48, 8, 0.0%, 72.00）；驗證同上。
- [ ] G3.8 重構/補測試目標：`main.js::initializeDatabaseSheetsMenu`（L23, 6, 0.0%, 42.00）；驗證同上。

#### 量測快照（完成本組後更新）

| 階段 | 時間 | Lines (LCOV) | Statements | Functions | Branches | MI 最低 | CRAP > 30 數 | CRAP 最高 | 備註 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基準 | 2026-11-18 | 27.37% (1529/5586) | 27.37% (1529/5586) | 58.82% (50/85) | 37.87% (125/330) | 69.134 (`webapp/js/config.js`) | 56 | 1482.00 (`subjectCodeTransformer.js::getNormalizedCourses`) |  |
| G3 完成後 | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | `databaseInitializer.js`/`utilities.js`/`main.js` 目標收斂 |

---

## G4. 課程代碼轉換與前端設定熱點（目標函式逐一收斂）

- [ ] G4.1 重構/補測試目標：`subjectCodeTransformer.js::getNormalizedCourses`（L410, 38, 0.0%, 1482.00）；驗證：`npm test` 通過且 CRAP <= 30（優先拆分查詢/篩選/分頁邏輯）。
- [ ] G4.2 重構/補測試目標：`subjectCodeTransformer.js::importNormalizedCourseCodes`（L322, 16, 0.0%, 272.00）；驗證同上。
- [ ] G4.3 重構/補測試目標：`webapp/js/config.js::<anon method-1>`（L7, 10, 0.0%, 110.00）；驗證同上（必要時抽離可測試純函式或調整可測結構，保持行為不變）。

#### 量測快照（完成本組後更新）

| 階段 | 時間 | Lines (LCOV) | Statements | Functions | Branches | MI 最低 | CRAP > 30 數 | CRAP 最高 | 備註 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基準 | 2026-11-18 | 27.37% (1529/5586) | 27.37% (1529/5586) | 58.82% (50/85) | 37.87% (125/330) | 69.134 (`webapp/js/config.js`) | 56 | 1482.00 (`subjectCodeTransformer.js::getNormalizedCourses`) |  |
| G4 完成後 | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | 課程轉換與設定熱點收斂 |

---

## G5. 前端 API 客戶端與啟動流程（目標函式逐一收斂）

- [ ] G5.1 重構/補測試目標：`webapp/js/api.js::requestOnce`（L72, 18, 0.0%, 342.00）；驗證：`npm test` 通過且 CRAP <= 30（涵蓋 RPC/fetch、回應解析與錯誤處理）。
- [ ] G5.2 重構/補測試目標：`webapp/js/api.js::<anon method-6>`（L168, 10, 0.0%, 110.00）；驗證同上。
- [ ] G5.3 重構/補測試目標：`webapp/js/app.js::render`（L81, 9, 0.0%, 90.00）；驗證同上。
- [ ] G5.4 重構/補測試目標：`webapp/js/app.js::setTab`（L10, 7, 0.0%, 56.00）；驗證同上。
- [ ] G5.5 重構/補測試目標：`webapp/js/app.js::applyInitialAuth`（L40, 7, 0.0%, 56.00）；驗證同上（含 INITIAL_AUTH/switch/mock 分流可測分支）。
- [ ] G5.6 重構/補測試目標：`webapp/js/app.js::cleanUrlQuery`（L30, 6, 0.0%, 42.00）；驗證同上。
- [ ] G5.7 補強前端 API 客戶端測試（支援主變更 5.1）：RPC 優先與 fetch 備援、錯誤正規化、重試策略、token/CSRF 儲存與夾帶；驗證：`npm test` 通過。

#### 量測快照（完成本組後更新）

| 階段 | 時間 | Lines (LCOV) | Statements | Functions | Branches | MI 最低 | CRAP > 30 數 | CRAP 最高 | 備註 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基準 | 2026-11-18 | 27.37% (1529/5586) | 27.37% (1529/5586) | 58.82% (50/85) | 37.87% (125/330) | 69.134 (`webapp/js/config.js`) | 56 | 1482.00 (`subjectCodeTransformer.js::getNormalizedCourses`) |  |
| G5 完成後 | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | `webapp/js/api.js`、`webapp/js/app.js` 目標收斂 |

---

## G6. 前端登入與授權流程（目標函式逐一收斂）

- [ ] G6.1 重構/補測試目標：`webapp/js/auth.js::applyLoginSuccess`（L70, 19, 0.0%, 380.00）；驗證：`npm test` 通過且 CRAP <= 30。
- [ ] G6.2 重構/補測試目標：`webapp/js/auth.js::<anon method-11>`（L331, 18, 0.0%, 342.00）；驗證同上。
- [ ] G6.3 重構/補測試目標：`webapp/js/auth.js::<anon method-10>`（L300, 14, 0.0%, 210.00）；驗證同上。
- [ ] G6.4 重構/補測試目標：`webapp/js/auth.js::loginWithGoogleRedirect`（L190, 10, 0.0%, 110.00）；驗證同上。
- [ ] G6.5 重構/補測試目標：`webapp/js/auth.js::switchGoogleAccount`（L166, 9, 0.0%, 90.00）；驗證同上。
- [ ] G6.6 重構/補測試目標：`webapp/js/auth.js::renderGoogleButton`（L225, 8, 0.0%, 72.00）；驗證同上。
- [ ] G6.7 重構/補測試目標：`webapp/js/auth.js::buildAccountChooserUrl`（L152, 6, 0.0%, 42.00）；驗證同上。
- [ ] G6.8 補強前端 auth/啟動流程測試（支援主變更 5.1）：session 還原、INITIAL_AUTH、switch=1、GAS/GIS/mock 分流與登出行為；驗證：`npm test` 通過。

#### 量測快照（完成本組後更新）

| 階段 | 時間 | Lines (LCOV) | Statements | Functions | Branches | MI 最低 | CRAP > 30 數 | CRAP 最高 | 備註 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基準 | 2026-11-18 | 27.37% (1529/5586) | 27.37% (1529/5586) | 58.82% (50/85) | 37.87% (125/330) | 69.134 (`webapp/js/config.js`) | 56 | 1482.00 (`subjectCodeTransformer.js::getNormalizedCourses`) |  |
| G6 完成後 | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | `webapp/js/auth.js` 目標收斂 |

---

## G7. 前端頁面、UI 與資料互動（目標函式逐一收斂）

- [ ] G7.1 重構/補測試目標：`webapp/js/accounts.js::renderView`（L205, 24, 0.0%, 600.00）；驗證：`npm test` 通過且 CRAP <= 30。
- [ ] G7.2 重構/補測試目標：`webapp/js/accounts.js::<anon method-6>`（L119, 12, 0.0%, 156.00）；驗證同上。
- [ ] G7.3 重構/補測試目標：`webapp/js/accounts.js::<anon method-4>`（L65, 7, 0.0%, 56.00）；驗證同上。
- [ ] G7.4 重構/補測試目標：`webapp/js/accounts.js::<anon method-9>`（L187, 6, 0.0%, 42.00）；驗證同上。
- [ ] G7.5 重構/補測試目標：`webapp/js/accounts.js::saveSettings`（L37, 6, 0.0%, 42.00）；驗證同上。
- [ ] G7.6 重構/補測試目標：`webapp/js/courses.js::renderView`（L95, 18, 0.0%, 342.00）；驗證同上。
- [ ] G7.7 重構/補測試目標：`webapp/js/courses.js::fetchList`（L10, 10, 0.0%, 110.00）；驗證同上。
- [ ] G7.8 重構/補測試目標：`webapp/js/courses.js::<anon method-2>`（L27, 10, 0.0%, 110.00）；驗證同上。
- [ ] G7.9 重構/補測試目標：`webapp/js/courses.js::handleSearch`（L55, 8, 0.0%, 72.00）；驗證同上。
- [ ] G7.10 重構/補測試目標：`webapp/js/imports.js::renderView`（L247, 14, 0.0%, 210.00）；驗證同上。
- [ ] G7.11 重構/補測試目標：`webapp/js/imports.js::looksLikeCourseCodes`（L64, 8, 0.0%, 72.00）；驗證同上。
- [ ] G7.12 重構/補測試目標：`webapp/js/imports.js::pickCourseSheetRows`（L78, 7, 0.0%, 56.00）；驗證同上。
- [ ] G7.13 重構/補測試目標：`webapp/js/imports.js::<anon method-10>`（L216, 7, 0.0%, 56.00）；驗證同上。
- [ ] G7.14 重構/補測試目標：`webapp/js/ui.js::renderLoginView`（L273, 18, 0.0%, 342.00）；驗證同上。
- [ ] G7.15 重構/補測試目標：`webapp/js/ui.js::renderOverviewView`（L357, 14, 0.0%, 210.00）；驗證同上。
- [ ] G7.16 重構/補測試目標：`webapp/js/ui.js::toast`（L94, 10, 0.0%, 110.00）；驗證同上。
- [ ] G7.17 重構/補測試目標：`webapp/js/ui.js::renderHeader`（L190, 10, 0.0%, 110.00）；驗證同上。
- [ ] G7.18 重構/補測試目標：`webapp/js/ui.js::toggleTheme`（L45, 6, 0.0%, 42.00）；驗證同上。
- [ ] G7.19 補強前端頁面/匯入/課程流程測試與 mock 相容測試（支援主變更 5.1）：關鍵互動與資料流程可回歸；驗證：`npm test` 通過。

#### 量測快照（完成本組後更新）

| 階段 | 時間 | Lines (LCOV) | Statements | Functions | Branches | MI 最低 | CRAP > 30 數 | CRAP 最高 | 備註 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基準 | 2026-11-18 | 27.37% (1529/5586) | 27.37% (1529/5586) | 58.82% (50/85) | 37.87% (125/330) | 69.134 (`webapp/js/config.js`) | 56 | 1482.00 (`subjectCodeTransformer.js::getNormalizedCourses`) |  |
| G7 完成後 | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | 前端頁面/UI/互動目標收斂 |

---

## G8. Mock 與腳本品質收斂（目標函式逐一收斂）

- [ ] G8.1 重構/補測試目標：`webapp/js/mock.js::<anon method-3>`（L108, 24, 0.0%, 600.00）；驗證：`npm test` 通過且 CRAP <= 30（並維持 mock 相容行為）。
- [ ] G8.2 重構/補測試目標：`scripts/deploy.js::main`（L69, 10, 0.0%, 110.00）；驗證同上。
- [ ] G8.3 重構/補測試目標：`scripts/deploy.js::getArgValue`（L23, 6, 0.0%, 42.00）；驗證同上。
- [ ] G8.4 重構/補測試目標：`scripts/build-webapp.js::build`（L29, 7, 0.0%, 56.00）；驗證同上。
- [ ] G8.5 重構/補測試目標：`scripts/languageCheck.js::<anon method-4>`（L126, 6, 0.0%, 42.00）；驗證同上。
- [ ] G8.6 收斂剩餘品質門檻缺口：修正所有殘餘 CRAP > 30 或 MI < 20 項目（若有新增/遺漏），並提升覆蓋率至符合全域與變更門檻；驗證：`npm run check:complexity`、`npm run check:coverage`、`npm run check:changed-coverage`（具比較基準時）通過。

#### 量測快照（完成本組後更新）

| 階段 | 時間 | Lines (LCOV) | Statements | Functions | Branches | MI 最低 | CRAP > 30 數 | CRAP 最高 | 備註 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基準 | 2026-11-18 | 27.37% (1529/5586) | 27.37% (1529/5586) | 58.82% (50/85) | 37.87% (125/330) | 69.134 (`webapp/js/config.js`) | 56 | 1482.00 (`subjectCodeTransformer.js::getNormalizedCourses`) |  |
| G8 完成後 | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | Mock/腳本與剩餘違規收斂，目標達 CRAP/MI 門檻 |

---

## G9. 文件、CI 最終整合與驗證（含主變更對接）

- [ ] G9.1 完整更新文件（`README.md`、`AGENTS.md`、必要 `docs/*`）：品質指令、閘門、門檻與基準線、Git hook 自動格式化、CI 行為、Node 版本策略與排錯；驗證：文件與實作一致。
- [ ] G9.2 執行完整驗證：`npm test`、`npm run test:coverage`、`npm run check:coverage`、`npm run check:changed-coverage`（具比較基準時）、`npm run check:complexity`、`npm run format:check`、`npm run check:lang`、`npm run build:webapp`；驗證：全部成功。
- [ ] G9.3 交付一致性檢查並回寫主變更依據：確認本提案成果已涵蓋主變更 `2026-11-18-port-ksvs-gis-rpc-and-quality` 的 task 4.5 與 5.1 範圍（實作完成後回主變更勾選並依規範提交）；驗證：提案/規格/任務/實作/報告可追溯。

#### 量測快照（完成本組後更新）

| 階段 | 時間 | Lines (LCOV) | Statements | Functions | Branches | MI 最低 | CRAP > 30 數 | CRAP 最高 | 備註 |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| 基準 | 2026-11-18 | 27.37% (1529/5586) | 27.37% (1529/5586) | 58.82% (50/85) | 37.87% (125/330) | 69.134 (`webapp/js/config.js`) | 56 | 1482.00 (`subjectCodeTransformer.js::getNormalizedCourses`) |  |
| G9 完成後 | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | _待填寫_ | 最終驗證通過，可對接主變更 4.5/5.1 |
