<!-- OPENSPEC:START -->

# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always check `@/openspec/` or repository documentation when the request:

- Mentions planning, architecture shifts, or proposals
- Introduces new capabilities, breaking changes, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

<!-- OPENSPEC:END -->

# Repository Guidelines

## 專案定位與架構理念

本專案為 **Google Apps Script (GAS) 網頁應用程式全端範本（GAS-Course-Web-Template）**，專為需要「Google 帳號身分驗證」、「多角色權限管控（RBAC）」、「108 課綱課程代碼 1NF 正規化」，以及「現代多風格前端介面」之 GAS 專案而設計。

前端採「**開發時模組化、發布時單一內嵌**」原則（透過 `scripts/build-webapp.js` 打包）；後端運行於 Google Apps Script V8 引擎，並相容於本地端 Node.js 測試環境。

---

## 語言與用詞規範 (Language & Terminology Guidelines)

本專案全面採用 **臺灣繁體中文 (`zh-TW`)** 作為主要溝通與撰寫語言：

1. **適用範圍**：
   - **專案文件**：包含所有 Markdown 文件（如 README、AGENTS、OpenSpec、技術手冊、規格說明等）。
   - **程式碼註解**：包含行內註解、區塊註解、JSDoc 等。
   - **版本控制訊息**：包含 Git Commit Message 與 GitHub Pull Request（PR）標題及內容描述。
   - **使用者介面**：所有前端介面文案、提示訊息（Toast/Alert）、表格標籤等。
2. **用詞規範**：
   - **嚴格使用臺灣習慣詞彙與語法**，絕對**禁止使用中國用語**。
     - 正確範例（臺灣）：程式碼、專案、資料/資料庫、預設、記憶體、支援、呼叫、介面、物件、布林值、陣列、伺服器、網路、重構、非同步。
     - 錯誤禁詞（中國）：代碼、項目、數據、默認、內存、支持、調用、接口、對象、布爾、數組、服務器、網絡、重構（有時誤作改造）、異步。
   - **專業技術術語**（如 API、Git 指令、HTTP Headers、函數/方法名稱、RFC 專有名詞、第三方服務商名稱等）除外，可維持標準英文原文。

---

## 模組職責劃分

### 後端模組（根目錄 `*.js`）

- **`main.js`**: Google 試算表工具列選單入口（`onOpen`），提供「初始化後端資料庫」與彈出視窗「開啟 Web App 網頁」功能。
- **`gasRuntime.js`**: 後端與前端共用的常數與相依解析層，提供工作表名稱、Web API 版本號、角色顯示名稱，以及 `resolveDependency_`／`injectGlobals_` 雙環境相容工具。
- **`actionRegistry.js`**: Web API action 單一登錄來源，統一產生公開／寫入／鎖定清單、RBAC 角色權限矩陣與日誌中繼資料（`logCategory`、`logLabel`、`logDetailKey`、`logEnabled`），並保存後端註冊的實際處理函式供路由派發。
- **`databaseInitializer.js`**: 試算表資料庫純資料工作表初始化（`系統設定與授權`、`正規化課程代碼`、`系統使用說明`、`操作日誌`），具安全冪等性；處理系統參數讀寫與授權白名單維護，首次登入管理員開通必須由請求明確標記，並安裝每日 03:00 的日誌清理觸發器。
- **`subjectCodeTransformer.js`**: 108 課綱課程代碼對照字典（群別、科別、屬性、必選修）、39 欄寬表全數展開為 14 欄 1NF 紀錄演算法、5,000 筆分塊批次寫入（Chunking）與分頁檢索函式。
- **`activityLogBuilders.js`**: 操作日誌詳情產生器與 payload 白名單投影，依 `logDetailKey` 產生版本化 before／after 明細，排除敏感欄位與原始回傳內容。
- **`activityLogger.js`**: 操作日誌寫入、500 字元字串截斷；寫入不取樣，超過 20,000 列清理至 15,000 列，並由初始化流程安裝每日 03:00（Asia/Taipei）清理觸發器。
- **`webApi.js`**: Web App HTTP 入口（`doGet`, `doPost`）、避開 CORS OPTIONS 預檢之通訊協議、Google ID Token 驗證、`CacheService` Session 管理（6 小時 TTL）、`LockService` 併發寫入排隊防鎖、最外層統一寫入操作日誌，以及由 `ACTION_REGISTRY` 派發之 action 處理函式與角色權限矩陣。
- **`utilities.js`**: 試算表安全格式化（`safeSetNumberFormat`, `safeApplySheetFontSize`）、無 UI 環境防護（`safeUiAlert`）與通用純工具。

### 前端模組（`webapp/` 目錄）

- **`webapp/index.html`**: 前端骨架樣板，定義 `BUILD:CSS` 與 `BUILD:JS` 注入標記。
- **`webapp/styles.css`**: 多風格 CSS 設計系統（包含極簡曜藍 Modern Slate、圖紙風格 Blueprint、紙張風格 Paper、新粗獷主義 Neo-Brutalism、黏土擬物 Claymorphism、紅白機 NES、Happy Hues 色彩盤）與深淺色模式。
- **`webapp/js/config.js`**: 前端全域參數、導覽頁籤清單（概覽、匯入、課程、設定、操作日誌）與樣式字典；操作日誌頁籤以 `adminOnly` 標記僅管理員可見；版本號與角色顯示名稱取自 `gasRuntime` 單一來源。
- **`webapp/js/courseData.js`**: 前端 1NF 正規化同構運算模組（與後端規則一致，供瀏覽器即時預覽統計）。
- **`webapp/js/mock.js`**: 本地離線開發測試 Mock API 模擬器（支援 `?mock=true` 零設定測試）。
- **`webapp/js/errorMessages.js`**: 前端安全錯誤訊息轉譯層，遮蔽原始例外文字並統一顯示後端安全訊息或明確標記的文案。
- **`webapp/js/api.js`**: REST API 客戶端（統一以 `Content-Type: text/plain;charset=utf-8` 發送 JSON，杜絕 OPTIONS 預檢），並由安全錯誤訊息層產生使用者可見的錯誤內容。
- **`webapp/js/state.js`**: 響應式狀態容器（State Store）與變更訂閱機制。
- **`webapp/js/ui.js`**: 共用 UI 元件渲染器（Header、Nav、LoginCard、Toast、Modal、主題切換）。
- **`webapp/js/auth.js`**: Google Identity Services (GIS) 登入整合、Session 還原與登出。
- **`webapp/js/imports.js`**: SheetJS Excel 檔案拖曳解析、1NF 展開即時預覽與匯入動作。
- **`webapp/js/courses.js`**: 正規化課程代碼清單檢索、多條件篩選與分頁控制。
- **`webapp/js/accounts.js`**: 系統參數設定與授權成員管理介面（RBAC）。
- **`webapp/js/activityLog.js`**: 管理員操作日誌清單、Asia/Taipei 日期區間／操作者／事件類別篩選、分頁與詳情 JSON 展開；表格標頭具 `scope="col"`、展開按鈕具 `aria-expanded`。
- **`webapp/js/app.js`**: 前端進入點與應用程式生命週期管理；`setTab()`／`buildBodyHtml()` 與 `renderNavbar()` 共用管理員頁籤守門。

### 建置與測試

- **`scripts/build-webapp.js`**: 純原生 Node.js 打包腳本，將 `webapp/` 內嵌為根目錄單一 `index.html`；`gasRuntime.js` 與 `actionRegistry.js` 亦按樣板順序一併內嵌。
- **`scripts/checkUiClasses.js`**: 檢查前端模板使用的 CSS 類別皆已定義於設計系統，避免樣式漂移。
- **`scripts/checkContrast.js`**: 檢查主要文字與背景組合符合 WCAG 對比要求。
- **`tests/courseCodeNormalization.test.js`**: 課綱 39 欄全數展開（不剔除任何科目）、前後端同構邏輯單元測試。
- **`tests/actionRegistry.test.js`**: action 登錄表、後端處理函式註冊與路由派發一致性測試。
- **`tests/api.test.js`**: API 路由派發、Session 生命週期與 RBAC 權限矩陣單元測試。
- **`tests/webApiBootstrapExplicitFlag.test.js`**: 首次管理員開通明確旗標之前後端回歸測試。
- **`tests/webappSafeErrorMessages.test.js`**: 前端安全錯誤訊息轉譯測試，確保原始例外文字不外顯。
- **`docs/`**: 自包含、離線可用之詳細 HTML 技術手冊庫（架構、1NF 正規化、clasp 部署、GIS 設定、RBAC 教學）。

---

## 程式風格與命名慣例

1. **縮排與語法**：
   - 統一使用 **2 個空格** 縮排，不使用 Tab。
   - 變數宣告統一以 `const` 與 `let` 為主，避免使用 `var`。
   - 語句末尾一律加上分號（`;`）。
2. **命名規範**：
   - 函式、方法與一般變數：純駝峰式（`camelCase`，如 `normalizeCourseCodes`, `getSessionState`）。
   - 固定配置、表頭常數與對照字典：大寫蛇形（`UPPER_SNAKE_CASE`，如 `NORMALIZED_COURSE_HEADERS`, `GROUP_CODE_NAMES`）。
   - 類別、建構子或全域命名空間：大駝峰式（`PascalCase`，如 `MEA`）。
3. **雙棲相容性（Node.js / GAS Dual-Environment）**：
   - GAS 環境下所有根目錄 `.js` 共享全域命名空間。
   - 為支援本地端 Node.js 執行單元測試，檔案底部應使用 `if (typeof module !== "undefined" && module.exports)` 匯出模組；後端引用相依檔案時應加上環境判斷相容墊片。
4. **純函式設計導向（Functional Core, Imperative Shell）**：
   - 程式碼應盡量朝**純函式（Pure Functions）**的方向撰寫與重構。
   - 業務邏輯、資料轉換、格式解析、狀態驗證與 HTML 樣板生成力求純粹無副作用（相同輸入必產生相同輸出，不修改傳入引數），以實現 100% 零 Mock 單元測試能力。
   - 試算表實體讀寫（`sheet.getRange()`, `setValues()`）、DOM 事件與焦點操作、快取（`CacheService`）與鎖定（`LockService`）等副作用應嚴格隔離於外層的命令式薄外殼（Imperative Shell）。

---

## 開發指令與日常工作流

> 執行環境：本機與 CI 以 **Node.js 24** 為目標版本（`package.json` engines 與 `.github/workflows/quality-gates.yml` 一致）。

```bash
# 1. 執行本地自動化單元測試
npm test

# 2. 將 webapp/ 打包建置至根目錄 index.html
npm run build:webapp

# 3. 推送至 Google Apps Script 雲端（自動先建置再 push）
npm run push

# 4. 監聽模式：本地存檔時自動推送
npm run watch

# 5. 從雲端拉取線上變更
npm run pull

# 6. 發布與更新 Web App 部署
npm run deploy

# 7. 查看雲端即時 StackDriver 執行日誌
npm run logs

# 8. 在預設瀏覽器中開啟雲端編輯器或 Web App
npm run open
npm run open-webapp

# 9. 格式與語言檢查 / 自動格式化
npm run format:check
npm run format
npm run check:lang

# 10. 前端樣式與無障礙檢查
npm run check:ui-classes
npm run check:contrast
npm run check:a11y

# 11. 品質量測與閘門（覆蓋率、變更覆蓋率、CRAP/MI）
npm run test:coverage
npm run check:coverage
npm run check:changed-coverage
npm run check:complexity
```

---

## 核心通訊與安全規範

1. **避開 CORS OPTIONS 預檢**：
   - 前端發送 POST 請求時，**一律使用 `Content-Type: text/plain;charset=utf-8`**，內容傳遞 JSON 字串。
   - 嚴禁使用 `application/json`，否則會觸發 GAS 不支援的 HTTP OPTIONS 預檢導致 405 錯誤。
2. **併發寫入保護 (LockService)**：
   - 所有牽涉試算表寫入或資料修改的 Action，後端一律使用 `LockService.getScriptLock().tryLock(15000)` 排隊保護，並在 `finally` 區塊確保釋放鎖定。
3. **Google Identity Services (GIS) 來源設定守則**：
   - Google Cloud Console 的「已授權 JavaScript 來源」**絕對不能填寫 `*.googleusercontent.com`**（Google 會將其視為禁止網域報錯）。
   - 線上環境只需填入：`https://script.google.com`。
   - 本地端測試填入：`http://localhost`、`http://localhost:8080` 或直接開啟 `?mock=true` 離線模式。
4. **試算表純資料庫原則**：
   - 後端工作表一律不使用公式（No Formula），所有計算與中文轉譯由後端 JS 處理，避免大量寫入時觸發連鎖重算逾時。
   - 寫入大量資料一律採用分批寫入（Chunking，預設 5,000 筆/批），並預先設定純文字格式 `@`，避免前導零消失。
5. **操作日誌與稽核守則**：
   - 後端於 `executeWebApi` 最外層 `finally` 統一寫入操作日誌；`ping`、`getPublicConfig`、`getActivityLog` 不寫入，且日誌寫入失敗不得影響 API 回應。
   - 詳情僅保存白名單欄位投影與版本化指標，嚴禁寫入 `token`、`csrfToken`、`idToken`、`credential`、原始 `rows` 與查詢回傳內容；字串欄位統一截斷至 500 字元。
   - 日誌工作表超過 20,000 列時清理至 15,000 列，每日 03:00（Asia/Taipei）觸發器由初始化流程冪等安裝。
   - 前端「操作日誌」頁籤標記 `adminOnly`，`renderNavbar()`、`setTab()` 與 `buildBodyHtml()` 皆須依 `MEA.state.user.role` 守門，防止直接竄改 state 進入管理員頁籤。

---

## 測試與變更檢驗標準

任何程式碼或功能變更前與提交前，必須通過以下檢驗標準：

1. **單元測試全數通過**：執行 `npm test`，確認課程代碼正規化與 API 路由權限無回退（Regression）。
2. **品質閘門通過（視變更範圍）**：執行 `npm run format:check`、`npm run check:lang`、`npm run check:ui-classes`、`npm run check:contrast`、`npm run check:a11y`（jsdom + axe-core 無障礙稽核；`color-contrast` 因 jsdom 不計算配置樣式而停用，由 `check:contrast` 互補），並依影響範圍執行 `npm run test:coverage`、`npm run check:coverage`、`npm run check:changed-coverage`、`npm run check:complexity`；確保符合門檻且**不得低於基準線（ratchet 不回退）**。
3. **Git Hook 與自動格式化**：`pre-commit`（Husky + lint-staged）會對暫存檔執行 Prettier 自動格式化（`prettier --write`）與語言規範檢查；提交前應確保 hook 可正常執行且變更已符合格式規範。
4. **打包驗證無缺漏**：執行 `npm run build:webapp`，確認產生之 `index.html` 內嵌順序正常且無語法錯誤。
5. **離線 Mock 模式相容**：若變更前端介面，需確保開啟 `index.html?mock=true` 能正常運作與渲染。

### 品質門檻與政策摘要

- **全域覆蓋率**：初始門檻 Lines >= 60%、Statements >= 30%、Functions >= 60%、Branches >= 60%，且不得低於基準線（不回退）。
- **變更覆蓋率**：Lines >= 80%、Branches >= 80%（無可量測變更時略過）。
- **複雜度**：每個納管函式 **CRAP MUST NOT > 25**；每個納管模組 **MI MUST >= 50**。
- **基準線與設定**：`scripts/quality-baseline.json`、`scripts/qualityConfig.js`（2026-11-18 基準）；CI 品質閘門見 `.github/workflows/quality-gates.yml`。

### CI 品質閘門與相依套件

- `.github/workflows/quality-gates.yml` 在每次推送與 Pull Request 時，以 Node 24 依序執行 `format:check`、`check:lang`、`npm test`、`check:contrast`、`check:a11y`、`check:coverage`、`check:complexity`、`check:changed-coverage`；任一步驟失敗即阻擋合併。
- 相依套件由 `package-lock.json` 鎖定，CI 以 `npm ci --ignore-scripts`（失敗時回退 `npm install --ignore-scripts`）安裝；SheetJS 於前端由 CDN 動態載入，不列為 npm 相依。
- 詳細指令、門檻說明與疑難排解見 `README.md`「開發與品質檢查」章節；量測快照與收斂紀錄見 `openspec/changes/archive/2026-11-19-2026-11-18-quality-gates-and-test-expansion/tasks.md`。

---

## 提交與 PR 規範 (Commit & PR Conventions)

所有 Git Commit 訊息與 Pull Request（PR）標題與描述，**一律使用臺灣繁體中文 (`zh-TW`)** 並遵循臺灣用詞慣例（專業術語除外）。

### Commit 訊息

請符合 Conventional Commits 規範撰寫：

- `feat`: 新增功能或介面模組
- `fix`: 修復錯誤或權限問題
- `docs`: 修改或新增技術手冊文件
- `refactor`: 重構程式碼（不影響外部行為）
- `test`: 新增或調整單元測試
- `chore`: 建置腳本、相依套件或設定檔微調

### PR 訊息架構

發起 GitHub Pull Request 時，標題與內文必須嚴格遵循 **臺灣繁體中文 (`zh-TW`)**，並採用結構化的標準 PR 訊息架構：

#### 1. PR 標題格式

格式：`<type>: <臺灣繁體中文簡短描述>`（例如：`feat: 新增課程代碼即時檢索與篩選器`、`docs: 補充 GIS 登入設定教學手冊`）。

#### 2. PR 內文標準樣板

PR 內文應包含以下五大核心區塊：

```markdown
## 變更摘要

- 本次 PR 變更以下模組：<列出主要變更模組或目錄，如 webapp/js, docs 等>
- 涵蓋 commit：
  - <commit hash 或訊息 1>
  - <commit hash 或訊息 2>

## 主要變更項目

- **<檔案路徑 1>**：<語意化變更說明，如：新增某函式、調整某邏輯>（+X/-Y 行）
- **<檔案路徑 2>**：<語意化變更說明>

## 測試與驗證

- [x] 單元測試
- [ ] 整合測試
- [x] 手動驗證
- [ ] 靜態檢查（Lint/型別檢查）

測試細節：

- 指令：`npm test`（或相關建置/驗證指令）
- 結果：所有測試通過，無任何回退錯誤

## 風險與回滾

- 潛在風險：<說明變更對現有系統之影響等級，例如：低風險，未更動對外 API 介面>
- 監控指標：<說明如何確認線上運作正常，例如：GAS 執行日誌 (StackDriver Logs)>
- 回滾方式：`git revert HEAD`

## 相關議題

- <關聯之 Issue，如 Closes #123；若無則填寫「無相關 Issue」>
```

#### 3. 撰寫與驗證守則

- **語言純淨度**：嚴禁使用中國用語（「拉取請求」應作「Pull Request」、「默認」應作「預設」、「配置」應作「設定」、「代碼」應作「程式碼」、「運行」應作「執行」、「優化」應作「最佳化」）。
- **完整性**：內文禁止殘留未填寫的占位文字（如「請填入」等標籤），且禁止包含字面的 `\n` 跳脫字串（以免 GitHub 渲染異常）。
- **實質檢驗**：測試核取清單至少需勾選並完成 2 項驗證，嚴禁在未執行測試前逕行宣稱通過。

---

## 代理協作與 OpenSpec 開發工作流程規範 (Agent & OpenSpec Workflow Guidelines)

本專案之 AI 代理協作、提案規劃、實作交付與 PR 流程，必須嚴格遵守以下工作流程規範：

### 1. 提案審查雙重雙輪機制（Two-Round, Two-Agent Proposal Review）

在執行 `openspec-ff-change` 快速建立提案文件（包含 `proposal.md`、`design.md`、`tasks.md`、`specs/**/*.md`）之後，進入實作前必須執行**兩輪、雙代理**的嚴格審查：

- **派出 2 個獨立子代理（Sub-agents）平行審查**：
  1. **完整性與一致性審查員**：比對提案、規格、設計、任務與現行程式碼，檢查是否有所遺漏、考慮不足或前後矛盾。
  2. **批判詰問專家**：對提案架構、設計決策、邊界相容性與潛在實作陷阱提出嚴格詰問與挑戰。
- **雙輪審查與整合修訂要求**：
  - 由主代理彙整 2 個子代理的審查意見並修訂提案內容。
  - **這樣的審查與修訂流程必須嚴格執行 2 輪**（第 1 輪審查 ➔ 主代理整合修改 ➔ 第 2 輪複審 ➔ 主代理二次收斂定案），確認雙方無重大疑慮且提案完整後方可放行實作。

### 2. 獨立分支開發、任務實作與提案封存流程（Branching, Task-by-Task Commit & Archive）

- **獨立開發分支與提案先行提交**：
  - 執行 `openspec-apply-change` 實作提案前，必須建立並切換至另外的獨立開發分支（或使用 git worktree 建立獨立工作區）。
  - 在開始撰寫任何實作程式碼之前，**必須先將審查定案之提案文件（包含 proposal.md、design.md、tasks.md 與 specs/**/*.md）獨立提交（Git Commit）1 次**，確保變更規劃歷程先行落盤。
- **單一任務獨立提交**：在使用 `openspec-apply-change` 實作提案時，必須嚴格遵守**每完成一個 task 就提交（Git Commit）1 次**的增量交付原則，禁止累積多個 task 一次性提交。
- **全數完成後封存與本地預跑 CI**：
  - 在完成所有 task 並通過各項檢驗後，執行提案封存（`openspec-archive-change`）。
  - **發起 PR 前必須在本地端預跑完整 CI 品質閘門**（包含 `npm run format:check`、`npm run check:lang`、`npm test`、`npm run check:contrast`、`npm run check:a11y`、`npm run check:coverage`、`npm run check:complexity`、`CHANGED_COVERAGE_BASE=origin/main npm run check:changed-coverage`），確定本地預跑 CI 全數通過後，方可將分支推送至遠端並發起 GitHub Pull Request（PR）。

### 3. PR 雙重審查與集中改進（PR Review & Consolidated Commit）

- **發起 PR 後派雙代理審查**：PR 發起後，必須派出 2 個獨立的子代理（Sub-agents）全面審查整個 PR 的程式碼品質、規範遵循與回歸風險。
- **集中改進原則**：主代理依據 2 個子代理的審查結果，並結合其他 PR 審查意見（含 CI 狀態、外部 Reviewer 意見）進行改進；所有改進**盡量濃縮為 1 個 commit 來解決**，避免零散提交污染 Git 歷程。

### 4. PR 合併與環境清理流程（Squash Merge & Cleanup）

- **壓扁合併（Squash Merge）**：確認解決所有審查發現的問題且 CI 品質閘門全數通過後，以 Squash Merge 方式合併 PR。
- **本地分支同步與清理**：
  - 合併完成後，必須立即將本地端 `main` 分支同步更新至最新狀態（`git checkout main && git pull`）。
  - 安全移除已合併的本地分支與遠端分支。
  - 移除開發時所建立的對應 git worktree（`git worktree remove`），保持乾淨的本機開發環境。
