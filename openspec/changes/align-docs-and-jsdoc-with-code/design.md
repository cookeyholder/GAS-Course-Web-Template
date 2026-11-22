## Context

請參見 `proposal.md`。本專案經過多輪重大架構重構與 KSVS 功能移植，新增了後端 Web App 文件白名單路由（`?page=docs/...`）、`paged-table-container` 通用分頁容器、科別下拉代碼排序、Empty State CTA、全站安全降級純函式（`safeEscapeHtml`、`safeNumber`、`safeToast`）等特性，同時深化了測試覆蓋率與 11 步 CI 品質閘門。現存的 `README.md`、`AGENTS.md`、`docs/*.html` 及多數模組的 JSDoc 依然停留在舊版狀態，部分函式 JSDoc 甚至殘留過時的參數名稱或缺少重要 options 欄位描述。

## Goals / Non-Goals

**Goals:**
- 完整盤點並重寫/校正後端根目錄所有 `*.js` 函式的 JSDoc，確保參數型別、預設值、回傳結構與例外拋出與實際程式碼 100% 符合。
- 完整盤點並重寫/校正前端 `webapp/js/*.js` 所有函式的 JSDoc，確保相依注入介面、DOM 參數與回傳型別與實作一致。
- 全面更新 `README.md` 與 `AGENTS.md`，完整反映最新架構、Node 24、多風格設計系統、通用分頁容器、Web App 文件路由、補正 8 個遺漏模組職責說明與品質閘門指令。
- 全面更新 `docs/` 目錄下的所有 HTML 與 Markdown 文件（`architecture-guide.html`、`clasp-guide.html`、`course-normalization-guide.html`、`gis-login-guide.html`、`rbac-guide.html`、`user-guide.html`、`index.html` 補齊 `user-guide.html` 導覽卡片、`docs/參考資料/README.md`），以最新程式碼為單一事實來源。
- 新增 `tests/docsIntegrity.test.js` 文件實體與超連結整合測試，驗證所有白名單手冊檔案存在且無死鏈。
- 全程嚴格使用臺灣繁體中文（`zh-TW`），禁止任何中國用語與簡體字。

**Non-Goals:**
- 不手動維護自動產生之建置產物（`version.generated.js` 為打包腳本產物，排除於 JSDoc 手動維護範圍）。
- 不更動歷史品質量測報告快照（`docs/quality-baseline-2026-11-20.md` 為固定歷史量測紀錄，維持不可變）。
- 不更動現有已正常運作之業務邏輯或破壞性重構功能程式碼（JSDoc 與文件校正不應引發執行期行為變更）。
- 不調整現有 CSS 設計系統的主題風格色票或 HTML 結構樣式規範。

## Decisions

### 1. 以實作程式碼為唯一事實依歸（Code-as-Truth Principle）
- **理由**：舊的 JSDoc 或文件可能存在歷史包袱或假設。所有函式在撰寫 JSDoc 前，必須由代理實際閱讀函式本體（實體參數名稱、解構引數、預設值、條件分支、例外拋出與回傳結構），不可只看舊註解微調。
- **防走馬看花機制（Anti-Skimming Mechanism）**：在執行每個 JSDoc 任務時，代理必須先檢視該檔案內所有匯出（exported）與非匯出（internal/helper）之函式名稱清單，逐一逐函式核對實作行為並完成 JSDoc 撰寫，確保無任何閉包或輔助函式被遺漏。

### 2. JSDoc 結構規範標準化
- **規範**：
  - 統一使用 `@param {type} name - 說明` 格式。
  - 物件解構或 options 參數需逐一展開子欄位（例如 `@param {Object} [options={}]`、`@param {Function} [options.eventBindings]`）。
  - 非同步函式明確標註 `@returns {Promise<type>}`。
  - 純函式需明確標記「純函式，無副作用」。
  - 命令式外殼或試算表 I/O 需註明副作用。
  - 嚴格遵守臺灣繁體中文標準詞彙（如「預設值」、「回傳」、「非同步」、「物件」、「陣列」、「設定」）。

### 3. 前端產物即時同步與打包防漂移策略
- **規範**：依據專案 CI 與品質規範，`index.html` 必須與 `webapp/` 保持完全一致（`git diff --exit-code -- index.html`）。因此，任何涉及 `webapp/` 前端原始碼 JSDoc 修改的任務，在該任務中皆必須同步執行 `npm run build:webapp`，並將更新後的 `index.html` 納入該任務的原子提交中，避免各中途 commit 出現產物漂移與 CI 檢驗中斷。

### 4. 覆蓋率與複雜度行號錯位防護
- **規範**：大規模增修 JSDoc 註解會導致函式在原始碼中的行號產生偏移。在進行覆蓋率檢查或複雜度（CRAP / MI）檢查前，必須先執行 `npm run test:coverage` 重新產生 `coverage/coverage-final.json`，確保行號與 AST 一致，杜絕 CRAP 錯位判定。

### 5. 獨立文件完整性測試（`tests/docsIntegrity.test.js`）
- **規範**：為區隔既有專門測試 `webApi.js` 路由解析與 404 容錯的 `tests/webAppDocRoutes.test.js`，本次新增獨立的 `tests/docsIntegrity.test.js`，專門測試：
  1. `WEB_APP_DOC_ROUTES` 白名單所列之所有 HTML 檔案實體確實存在於 `docs/`。
  2. `docs/index.html` 包含所有手冊的導覽卡片與連結。
  3. 各手冊內部所有相對連結（如 `href="index.html"`、`href="user-guide.html"`）皆指向真實存在的檔案，杜絕死鏈。

## Risks / Trade-offs

- **[Risk] JSDoc 註解增修導致原始碼行號偏移，引發 CRAP / MI 計算錯位**  
  → **Mitigation**：在執行任何品質檢查前先執行 `npm run test:coverage` 重建覆蓋率快照。
- **[Risk] 前端模組修改導致 `index.html` 脫節**  
  → **Mitigation**：前端 JSDoc 任務強制隨附 `npm run build:webapp` 並一同提交。
- **[Risk] JSDoc 註解過長觸發 Prettier 強制折行或無意引入中國用語**  
  → **Mitigation**：所有 JSDoc 與文件任務驗證指令皆強制納入 `npm run check:lang && npm run format:check`。
