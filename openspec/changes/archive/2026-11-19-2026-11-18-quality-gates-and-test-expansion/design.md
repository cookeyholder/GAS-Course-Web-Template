## Context

本專案已在主變更 `2026-11-18-port-ksvs-gis-rpc-and-quality` 中導入基礎品質工具：Prettier 設定與 `format:check`、`scripts/languageCheck.js`、`scripts/run-tests.js`（自動探索 `tests/**/*.test.js` 並以獨立子行程執行）、以及包含格式/語言/測試的 GitHub Actions workflow。後端與前端核心已改為雙軌登入與 RPC 優先通訊，但目前尚未建立 Husky/lint-staged 提交前防線，也尚未建立覆蓋率、變更覆蓋率、CRAP 與 Maintainability Index 的可執行門檻與報告流程；測試覆蓋亦尚未完整涵蓋新登入/CSRF/RPC/mock 分流情境（主變更 task 4.5、5.1 未完成）。

**基準量測（2026-11-18，Node v24.16.0）**：
- 測試：`node scripts/run-tests.js` 通過（2/2 檔）。
- 覆蓋率（`c8 --all --include='*.js' --include='webapp/js/*.js' --include='scripts/*.js' --exclude='tests/**' --exclude='node_modules/**' --exclude='coverage/**'`，含 LCOV/json-summary/json）：Lines **27.37%** (1529/5586)、Statements **27.37%** (1529/5586)、Functions **58.82%** (50/85)、Branches **37.88%** (125/330)，納管候選 20 檔。
- MI（`typhonjs-escomplex`）：最低 **69.134**（`webapp/js/config.js`），分析 247 個方法，**MI < 20：0**（目前符合）。
- CRAP（`comp^2*(1-cov)^3+comp`，coverage-final 對應）：最高 **1482**（`subjectCodeTransformer.js::getNormalizedCourses`），**CRAP > 30：56 個函式**（247 個函式中）；詳細逐檔與逐函式基準表見 `proposal.md`。

限制與現況：
- Node 本機版本為 v24.x，CI 目前使用 Node 20；品質腳本需在兩者可用（或明確統一版本策略）。
- 測試採純 Node 腳本（`assert` + 自建環境模擬）由 `scripts/run-tests.js` 逐檔子行程執行。
- GAS/瀏覽器 API 相依較多，覆蓋率與測試需依賴模擬與可在 Node 執行之模組化匯出；部分 UI/入口函式需透過可測試拆分或行為導向模擬提高覆蓋。
- 專案規範要求臺灣繁體中文文件與註解、避免中國用語，且建置產物 `index.html` 由 `scripts/build-webapp.js` 產生。

動機與範圍依據請見 `proposal.md`（Why / What Changes / Capabilities / Baseline）。

## Goals / Non-Goals

**Goals:**
- 建立可在本機與 CI 重現的完整品質閘門：格式化、語言規範、測試、全域覆蓋率、變更覆蓋率、CRAP 與 MI。
- 導入 Husky + lint-staged 作為提交前自動化防線，**pre-commit 對暫存檔執行 Prettier 格式化**（並重加暫存區）與適用之語言規範檢查，與 CI 規則一致且文件化。
- 明確落實使用者指定門檻：每個納管函式 CRAP **MUST NOT** 大於 30；每個納管模組 Maintainability Index **MUST** >= 20；並建立可執行的測試覆蓋率標準（全域門檻 + 變更覆蓋率門檻 + 基準線不回退）。
- 補強主變更 5.1 所需測試，確保登入/RPC/CSRF/mock 關鍵行為可回歸。
- 在達成門檻過程中，優先以「行為不變的重構 + 測試補強」處理超標熱點，避免為過門檻引入功能回歸。

**Non-Goals:**
- 不將前端改寫為框架化建置體系或引入打包器重構全專案。
- 不在本提案中擴充 KSVS 專屬業務功能或與品質治理無關的產品功能。
- 不追求一次將所有歷史程式碼重寫至理想分數；允許以基準線、文件化範圍與分階段收斂策略提升覆蓋率，但不得違反 CRAP/MI 硬門檻與已定義之覆蓋率政策。
- 不強制要求所有開發者使用相同 IDE 外掛；品質以指令與 CI 為準。

## Decisions

### 1. 提交前防線採 Husky + lint-staged，並明確包含 Prettier 格式化
- **決策**：新增 `husky`、`lint-staged` devDependencies，使用 `prepare` 腳本啟用 hooks（並確保 CI/非互動安裝安全，不因 hook 初始化失敗）。`pre-commit` 執行 lint-staged：
  - 對可格式化暫存檔執行 `prettier --write` 並自動加入暫存區（Git hook 負責提交前格式化）。
  - 對暫存之原始碼/文件檔執行語言規範檢查（優先採可傳入檔案清單或 staged 過濾之模式以控制耗時；若調整 `scripts/languageCheck.js` 介面則需保持既有全量檢查能力與 CI 相容）。
  - 不在 pre-commit 執行完整覆蓋率/複雜度分析（改由 CI 與手動指令），以控制提交延遲。
- **理由**：可快速攔截最常見的格式與語言規範問題，與既有 Prettier/語言檢查工具一致；重分析放在 CI 可兼顧開發體驗。
- **替代方案**：pre-commit 執行完整品質套件。未採用，執行時間與跨環境穩定性風險較高。

### 2. 覆蓋率採 c8 量測並納入全量候選範圍與基準線不回退
- **決策**：導入 `c8` 作為覆蓋率收集器，透過 npm 腳本包裝 `scripts/run-tests.js` 執行，輸出 `text`、`lcov`、`json` 與 `json-summary`（或等效）報告至 `coverage/`。預設納管範圍採全量候選：`*.js`、`webapp/js/*.js`、`scripts/*.js`（排除 `tests/**`、`node_modules/**`、`coverage/**` 與文件化例外）。
- **門檻與政策**：
  - **基準線**：以實作階段首次落地之量測結果建立 `coverage-baseline`（檔案或設定）作為不回退比較依據（初始基準預期接近 Lines/Statements 27.37%、Functions 58.82%、Branches 37.88%，實際以落地當下量測為準）。
  - **全域門檻（初始可執行）**：Lines >= 30%、Statements >= 30%、Functions >= 60%、Branches >= 40%，且任一維度 **MUST NOT** 低於基準線（ratchet；後續僅可調高或隨基準線上移）。
  - **變更覆蓋率門檻**：相對比較基準（CI 預設 PR base / `origin/main`；本機可參數化）之變更可執行程式碼 Lines >= 80%、Branches >= 70%。
  - **報告與檢查**：提供 `test:coverage`、`check:coverage`、`check:changed-coverage`（命名可調整但需文件化）與可機器讀取之結果。
- **理由**：從 27.37% lines 直接跳至高門檻不可行；採「基準線不回退 + 初始可達門檻 + 高變更覆蓋率 + 後續 ratchet」可立即落地且持續收斂。
- **替代方案**：僅量測已覆蓋檔案或大幅排除前端檔案。未採用為預設，會掩蓋真實缺口；必要排除須最小化且文件化。

### 3. CRAP 與 MI 採靜態分析腳本強制執行，並以行為不變重構達成硬門檻
- **決策**：新增複雜度分析腳本（例如 `scripts/checkComplexity.js`）與相依套件（如 `typhonjs-escomplex`）：
  - 解析納管檔案（與覆蓋率範圍一致，排除規則文件化）。
  - 取得每個函式 cyclomatic complexity 與模組 Maintainability Index。
  - CRAP 計算：`CRAP = comp^2 * (1 - cov)^3 + comp`。函式覆蓋率優先使用 `coverage-final.json` 之函式/語句對應；若無法精確對應，MUST 採一致且文件化的近似策略並在報告標示來源。
  - 門檻：函式 CRAP **MUST NOT** > 30；模組 MI **MUST** >= 20。
  - 輸出：主控台摘要 + JSON 報告（如 `reports/quality/complexity.json`），列出違規項目（檔案、函式/模組、分數、行號、複雜度、覆蓋率）。
- **基準對策**：目前 MI 已達標但 CRAP 超標 69 個函式，實作 MUST 透過「測試補強降低 `(1-cov)` + 拆分函式降低 `comp`」分批收斂，不以排除核心模組規避。
- **理由**：CRAP/MI 需專用分析；將規則程式化可避免主觀判斷並支援 CI 阻擋。

### 4. 變更覆蓋率採獨立腳本比對 diff 與覆蓋率報告
- **決策**：新增 `scripts/checkChangedCoverage.js`（或等效）：
  - 讀取 lcov/JSON 覆蓋率報告與 Git diff 範圍（`--base` 參數或 CI 環境變數推導；CI 需 `fetch-depth: 0` 或足夠歷史）。
  - 僅計算納管原始碼檔案之變更可執行行/分支覆蓋率。
  - 無可量測變更時回傳明確成功（exit 0）並輸出原因。
  - 門檻預設 Lines >= 80%、Branches >= 70%，集中於設定/常數管理。
- **理由**：在全域基準偏低時，變更覆蓋率可確保新增與修改程式碼具測試保護。

### 5. CI 品質閘門擴充為單一可觀測流程
- **決策**：更新 `.github/workflows/quality-gates.yml`（必要時調整 Node 版本策略以兼容工具鏈，並文件化）：
  1. Checkout（取得 diff 所需歷史）
  2. Setup Node + 安裝相依（確保 hooks 不干擾 CI）
  3. `format:check`
  4. `check:lang`
  5. 測試/覆蓋率產出（`test` 與 `test:coverage` 視重複成本整合）
  6. `check:coverage`
  7. `check:complexity`（CRAP/MI）
  8. `check:changed-coverage`
  - 失敗時保留日誌與報告 artifact（視需要）。
- **理由**：單一 workflow 易於作為分支保護依據；步驟化可快速定位失敗點。

### 6. 測試補強與重構採風險導向分批實施（對應主變更 5.1 與 CRAP 收斂）
- **決策**：依熱點分批新增/調整測試與拆分重構：
  - **後端**：`executeWebApi`/請求解析、`getPublicConfig` 欄位與遮罩、`verifyGoogleIdToken`/網域限制可測分支、`loginWithActiveUser`、Session/CSRF、OAuth redirect/state 與回呼可測路徑、`routeWebApiAction` 關鍵 action 分支。
  - **前端 API/Mock**：RPC 優先與 fetch 備援、回應解析、錯誤正規化、重試、token/CSRF 儲存與夾帶、mock 新 action/欄位/相容行為。
  - **前端 Auth/App/UI 流程**：`INITIAL_AUTH`、`switch=1`、session 還原、GAS/GIS/mock 分流；對高 CRAP render/流程函式進行可測試拆分（純函式/狀態組裝/模板片段）並補測試。
  - **資料轉換/初始化熱點**：`subjectCodeTransformer.js`、`databaseInitializer.js`、`webapp/js/courseData.js` 等以補測試與函式拆分降低複雜度。
- **理由**：優先覆蓋安全與通訊關鍵路徑，同時直接支撐 CRAP 與覆蓋率門檻達成。

## Risks / Trade-offs

- **[子行程覆蓋率彙整不完整]** → 驗證 c8 與 `scripts/run-tests.js` 子行程相容性，必要時調整執行方式或 V8 coverage 匯集；以報告交叉檢查關鍵檔案。
- **[CRAP 計算與函式級覆蓋對應困難]** → 採一致且文件化的計算策略（函式級優先，否則行/語句覆蓋近似），在報告標示方法；避免為規避計算而排除核心模組。
- **[從 27% 覆蓋率與 69 個 CRAP 超標收斂成本高]** → 以基準線不回退、初始可達全域門檻、嚴格變更覆蓋率與分批熱點重構降低一次性風險；每批次都需通過測試。
- **[pre-commit 影響提交速度]** → 僅執行快速檢查（格式化/語言），完整品質檢查交由 CI 與手動指令；文件說明例外處理但不建議常規略過。
- **[CI 與本機 Node 版本差異]** → 在 workflow 與文件中統一建議版本並驗證腳本相容性（Node 20/24）；必要時調整 CI Node 版本。
- **[測試模擬與真實 GAS 行為差異]** → 聚焦可單元驗證之契約與分支，保留 `?mock=true` 與部署後手動驗證路徑；文件說明模擬邊界。

## Migration Plan

1. **工具與設定基礎**：新增 devDependencies 與 npm scripts；建立 Prettier/lint-staged/husky 設定、覆蓋率與複雜度設定/基準檔、報告目錄與 ignore 規則。
2. **Git hook 格式化落地**：啟用 `prepare` 與 `.husky/pre-commit`，驗證暫存檔自動格式化與基礎檢查行為。
3. **量測基礎設施**：導入 c8 與 CRAP/MI/變更覆蓋率腳本，產出基準報告並固化基準線與初始門檻。
4. **測試補強（支援 5.1）**：依後端、前端 API/mock、前端 auth/app 分批新增測試並納入 `scripts/run-tests.js`。
5. **覆蓋率提升與 CRAP/MI 收斂**：針對低覆蓋與超標熱點進行行為不變重構與補測試，迭代直到全域/變更覆蓋率與 CRAP/MI 門檻達標。
6. **CI 整合與文件**：更新 workflow、README/AGENTS 與相關文件；執行完整驗證。
7. **收斂與回寫主變更**：完成本提案驗收後，回 `2026-11-18-port-ksvs-gis-rpc-and-quality` 勾選 task 4.5 與 5.1（需有對應實作與驗證證據）。

**回滾策略**：以 Git 提交分階段回退；若 hook 或 CI 閘門造成阻塞，可暫時停用特定步驟（保留腳本與設定）並於文件標註，但不得在未更新本提案/規格前宣稱品質門檻已完成。

## Open Questions

- （無）本設計已定義基準線、工具方向、初始門檻與分批收斂策略；若實作時發現特定工具在 Node 20/24 或子行程覆蓋率彙整存在相容性問題，可在不降低 CRAP/MI 與覆蓋率政策目標之前提下替換等效工具並同步更新文件與腳本介面。
