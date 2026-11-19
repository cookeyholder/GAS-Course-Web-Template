## Why

`main`（commit `4040541`）雖已通過既有六道品質閘門（格式、語言、68 個測試檔、覆蓋率、變更覆蓋率、複雜度），但四個獨立審查面向仍發現多項**已查證屬實**的結構性問題：管理者機密可被一般角色讀取、首位登入者可搶占管理員、OAuth 狀態值未驗證、全域鎖橫跨外部 HTTP、每次狀態更新即重建整個 DOM、39 個 UI class 沒有對應 CSS、前後端正規化邏輯完整重複且同構測試只比筆數。

這些問題不是風格偏好，而是可重現的安全與維運風險：

- 以真實 session 重現：`viewer` 角色呼叫 `getSystemSettings` 可取得 `clientSecret` 明文，但同一 token 呼叫 `getAccounts` 會被拒絕——代表 RBAC 存在**隐蔽的通配授權規則**與敏感欄位未遮蔽的雙重缺陷。
- 空白白名單下，任何可存取 Web App 的 Google 帳號首次登入即被寫入為 `admin`（`appsscript.json` 為 `access: ANYONE`），管理員防鎖死機制同時成為**權限搶占入口**。
- 前端 100 個 class 中 39 個在 `styles.css` 沒有定義，上傳區、表格、分頁、Modal 失去預期樣式；同時 `--ink-3` 對比實算 3.49:1、輸入框 focus outline 1.19:1，均未達 WCAG AA。

本變更先將四份審查報告與主代理逐項查證結果整理為完整 OpenSpec 提案，明確定義範圍、驗收條件與分階段實作順序，再進行程式碼變更，以避免「邊改邊發現」造成範圍失控或回歸。

## 審查來源與查證方法

| 面向 | 審查報告（暫存） | 主代理查證紀錄（暫存） | 結果 |
|---|---|---|---|
| 安全性 | `/tmp/opencode/audit-security.md` | `/tmp/opencode/verification-security.md` | High 2、Medium 8 屬實；Low/需部署驗證另列 |
| 效能 | `/tmp/opencode/audit-performance.md` | `/tmp/opencode/verification-performance.md` | High 3、Medium 1～2/6 屬實；量化探針 `/tmp/opencode/perf-probe.js` |
| UI/UX | `/tmp/opencode/audit-uiux.md` | `/tmp/opencode/verification-uiux.md` | High 5、Medium 4/5 屬實；class 比對 `/tmp/opencode/check-classes.js` |
| 可維護性 | `/tmp/opencode/audit-maintainability.md` | `/tmp/opencode/verification-maintainability.md` | High 3、Medium 2/3/4/5/10 屬實 |

查證方式包含：比對 `file:line` 原始碼、Node 執行期重現（RBAC、bootstrap、對照表）、WCAG 對比度實算、class 與 CSS 選擇器自動比對、覆蓋率報告讀取與建置產物逐位元組比對。**報告中標註「需部署驗證」的項目不納入本提案的硬性驗收**，僅列為風險追蹤。

## 已查證發現摘要

### 安全性（全部屬實）

- **SEC-H1**：`webApi.js:106-113` 的 `hasPermission` 以 `/^get[A-Z]/` + `read` 通配授權所有 `getXxx`；`webApi.js:704-708` `getSystemSettings` 無角色檢查且回傳 `readSystemSettings(ss)` 全量結果（含 `clientSecret`）。已端到端重現 `viewer` 可讀取機密。
- **SEC-H2**：`webApi.js:184` `bootstrapAdminIfNeeded` 早於 `webApi.js:195` `restrictWhitelist`；`databaseInitializer.js:602-624` 白名單為空即寫入首位登入者為 `admin`，搭配 `appsscript.json` 的 `access: ANYONE` 形成搶占風險。
- **SEC-M1**：`webapp/js/config.js:39` 直接接受 `?api=` 覆寫端點，`webapp/js/api.js` 會將 token/csrfToken 送向該端點。
- **SEC-M2**：`webapp/js/imports.js:28-32,291-302` 三個 SheetJS CDN 未設定 `integrity`／`crossorigin`，且版本混用 0.20.3 與 0.18.5。
- **SEC-M3**：`webapp/js/auth.js:107-128` 產生 OAuth `state` nonce，但 `webApi.js:387-401` `resolveOAuthRedirectUri` 完全忽略 `nonce`，無一次性驗證。
- **SEC-M4**：`webApi.js:309-311,798-800,829-831,841-844` 直接回傳 `err.message`。
- **SEC-M5**：`webApi.js:834-845` `doGet` 授權碼回呼寫入路徑繞過 `executeWebApi` 的 `tryLock`。
- **SEC-M6**：`webApi.js:692-699` 匯入只檢查非空陣列，無筆數/欄數上限；`subjectCodeTransformer.js:337-352` `preNormalized` 直接 `slice()`，信任前端。
- **SEC-M7**：`subjectCodeTransformer.js:386-391` 寫入未經 `sanitizeRowMatrix`（有 `setNumberFormat("@")` 緩解，但一致性不足）。
- **SEC-M8**：`webapp/js/config.js:54` 允許 `?mock=true`，`webapp/js/mock.js:135-147` 直接給 admin／`perms:["*"]`，且 `webapp/index.html:24` 將 mock.js 內嵌進正式產物。
- **SEC-V1**（需部署驗證）：`webApi.js:254-271` 未明確檢查 `exp`／`iat`，目前依賴 Google tokeninfo 端點間接拒絕過期 token。

### 效能（已查證屬實）

- **PERF-H1**：`subjectCodeTransformer.js:456-463,512-520,529-533` 每次分頁先讀取整表並對全部 N 列建立 14 欄物件，只為回傳 1 頁；N=100,000 時本機探針配置約 32.5 MB、61.6 ms（GAS 會更慢），且無 CacheService。
- **PERF-H2**（與 UX-H5 同一缺陷）：`webapp/js/state.js:44-54` 無差異通知，`webapp/js/app.js:174-182` 每次 `setState` 對 `#app` 做完整 `innerHTML` 重寫；單次搜尋造成 3 次重繪，且全目錄無 `activeElement`／`selectionStart` 保存，輸入焦點遺失。
- **PERF-H3**：`webApi.js:43-49` 將 `login`／`loginWithActiveUser` 納入全域 Script Lock，`webApi.js:664-670 → 233-244 → 240-242` 使外部 `UrlFetchApp.fetch` 在鎖內執行，高併發登入被序列化。
- **PERF-M1**：`subjectCodeTransformer.js:212-243` 與 `webapp/js/courseData.js:170-210` 在 `for (s<6)` 內重複計算 7 個只與列相關的欄位（最多 6 倍冗餘）。
- **PERF-M2**：`subjectCodeTransformer.js:378-401` 以 `max(getMaxRows(), total+1)` 對整張工作表做兩次大範圍格式化；60,000 筆時約 840,014 格。**實作約束**：`tests/subjectCodeTransformerImportNormalizedCourseCodes.test.js:298` 對範圍有斷言，需同步調整。
- **PERF-M6**：`webapp/js/imports.js:64-93,311-326` 找不到特色表頭時，同一工作表被 `sheet_to_json` 解析兩次。

### UI/UX（已查證屬實）

- **UX-H1**：`webapp/js/imports.js:111-123` 上傳區為無 `tabindex`／`role`／`onkeydown` 的 `div`，檔案輸入用 `display:none`，鍵盤完全無法上傳。
- **UX-H2**：`webapp/js/ui.js:256-311` Modal 無 `role="dialog"`／`aria-modal`／`aria-labelledby`，無初始焦點、焦點陷阱、Esc 關閉與焦點還原。
- **UX-H3**：`webapp/js/accounts.js:267-483` 等表單 `<label>` 全無 `for`，控制項無 `aria-label`；課程搜尋僅有 placeholder。
- **UX-H4**：自動比對 100 個 UI class，**39 個沒有 CSS 定義**（如 `app-layout`、`upload-dropzone`、`table`、`modal-close`、`secondary`、`pagination-bar`）；CSS 實際定義的是 `.app-shell`／`.dropzone`／`.modal-head`／`.modal-foot`／`.login-wrap`。
- **UX-H5**：同 PERF-H2，完整重繪造成焦點與游標位置丟失，對 IME 與輔助科技使用者影響嚴重。
- **UX-M4**：`webapp/styles.css:15` `--ink-3: #7a8494`，實算 3.49:1（背景）／3.78:1（卡片），低於 4.5:1。
- **UX-M5**：`webapp/styles.css:2697-2701` `.input:focus` 覆蓋通用 `:focus-visible`，`--accent-bg` 實算 1.19:1，低於 3:1。

### 可維護性（已查證屬實）

- **MNT-H1**：`subjectCodeTransformer.js:18-130,136-310` 與 `webapp/js/courseData.js:18-124,126-264` 完整重複 7 張對照表與 10 個函式；`tests/courseCodeNormalization.test.js:95-111` 只比筆數與統計，**內容漂移不會被攔截**。
- **MNT-H2**：`webApi.js:642-650,793-796,812-817` 存在三套語意不一致的 dependency resolver；取得試算表邏輯重複 5 處。
- **MNT-H3**：`webApi.js:17-31` 以 `Object.assign(globalThis, ...)` 注入 44 個匯出並以三個空 catch 吞掉載入失敗。
- **MNT-M2/M3**：`utilities.js` 的 `DEPARTMENT_CODES`／`DEPARTMENT_NAMES`／`safeTrim`／`generateUniqueId` 與 `webApi.js` 的 `webApiSuccess` 為死碼；`databaseInitializer.js:369-373` 與 `:521-525` 兩個函式逐字相同。
- **MNT-M4**：`webApi.js:152-157` 有 `.toLowerCase()`，`webapp/js/auth.js:154-158` 沒有，網域正規化行為不一致。
- **MNT-M5**：`webapp/js/mock.js:203-212` `getCourseIndex` 忽略篩選/分頁，回傳 `pageSize:50`；`state.js:26` 前端預設 30，`subjectCodeTransformer.js:525` 後端預設 50。
- **MNT-M10**：`package.json:12` `watch` 直接 `clasp push --watch`，未先建置，可能推送過期 `index.html`。

## What Changes

- 先提交本提案文件（proposal／design／tasks／7 份 spec delta），**再**開始任何程式碼實作。
- 依「安全 → 效能與渲染 → UI/UX 與無障礙 → 可維護性與測試防線」四個階段實作已查證發現；需部署驗證的項目僅補文件或觀測指標，不強制變更行為。
- 新增 4 個 capability 规格，並對 3 個既有 capability 補充 ADDED Requirements；archive 時再同步回 main specs。
- **BREAKING（行為層面）**：`getSystemSettings` 對非管理員遮蔽 `clientSecret`；移除 `/^get[A-Z]/` 通配授權並明確列舉讀取動作；首次管理員開通需在白名單檢查與明確旗標後才寫入；`?api=` 改為白名單；`?mock=true` 在正式部署產物預設停用（本機 `webapp/` 仍可用）。
- 每階段結束執行完整驗證：`npm test`、`npm run format:check`、`npm run check:lang`、`npm run test:coverage`、`npm run check:coverage`、`npm run check:changed-coverage`、`npm run check:complexity`、`npm run build:webapp`，並確認 Mock 模式渲染正常。

## Capabilities

### New Capabilities

- `security-and-rbac-hardening`：定義敏感欄位遮蔽、明確 RBAC 授權、首次管理員開通安全、OAuth state nonce 一次性驗證、回呼寫入鎖、匯入上限與公式注入防護、API 端點白名單、CDN SRI 與正式環境 mock 停用。
- `course-import-and-query-performance`：定義分頁延遲映射、輕量統計 API、不變欄位提升、格式化範圍限縮、大型 payload 幂等與分段上傳、Excel 工作表單次解析。
- `frontend-rendering-and-accessibility`：定義差異渲染與焦點保存、鍵盤可操作上傳區、對話框語意與焦點管理、表單標籤關聯、class/CSS 對齊、WCAG 對比與 focus 指標、載入/確認/錯誤回饋與行動版版面。
- `maintainability-and-shared-logic`：定義正規化單一事實來源與深度同構測試、單一相依解析層、移除全域污染與死碼、action registry、常數單一來源、mock 形狀一致、state.js 測試與相依工具改善。

### Modified Capabilities

- `web-auth-and-session`：補充 OAuth state nonce 驗證、首次管理員開通順序、ID Token exp 明確檢查、登入網域大小寫一致、Session 過期提示與登出防重複。
- `web-api-client`：補充 API 端點白名單、大型 payload 重試/幂等策略、後端錯誤訊息通用化與正式環境 mock 停用。
- `developer-tooling-and-quality`：補充 `watch` 先建置、JS class 必須存在於 CSS 的 CI 檢查、對比度檢查與建置產物一致性檢查。

## Impact

- **後端**：`webApi.js`（RBAC、getSystemSettings、bootstrap 順序、OAuth state/鎖、路由 registry、resolver 統一、錯誤訊息、鎖粒度、快取/統計 action）、`databaseInitializer.js`（bootstrap 順序與常數、重複函式、設定讀取範圍）、`subjectCodeTransformer.js`（延遲映射、hoist、格式化範圍、sanitizer、寫入上限）、`utilities.js`（死碼清理）。
- **前端**：`webapp/js/config.js`（api 白名單、mock 開關）、`api.js`（端點驗證、重試/幂等、錯誤訊息）、`auth.js`（nonce、網域大小寫、catch、登出、session 提示）、`state.js`（差異訂閱支援與測試）、`app.js`（差異渲染）、`ui.js`（Modal a11y、class 對齊、toast、對比）、`imports.js`（鍵盤上傳、SRI、單次解析）、`courses.js`（輕量統計、請求去重、焦點）、`accounts.js`（label、確認、loading）、`mock.js`（分頁/篩選與後端一致）、`styles.css`（class 對齊、對比、RWD）、`index.html`（正式產物 mock 處理）。
- **測試與工具链**：`tests/**`（新增 RBAC/bootstrap/nonce/上限/延遲映射/state.js/深度同構/mock 形狀等測試；調整 `subjectCodeTransformerImportNormalizedCourseCodes.test.js:298` 格式化範圍斷言）、`package.json`（watch/新增 scripts）、`.github/workflows/quality-gates.yml`（class/CSS、對比度、建置一致性）、`scripts/build-webapp.js`（正式產物 mock 排除）。
- **文件**：`README.md` 與 `docs/` 中涉及 RBAC、首次管理員開通、API 端點、mock 模式與部署設定的章節需同步更新。
- **外部相依與平台**：Google Identity Services、Google OAuth tokeninfo、GAS `UrlFetchApp`／`CacheService`／`LockService`／`google.script.run`、SheetJS CDN（SRI）。
