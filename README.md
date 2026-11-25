# Google Apps Script 網頁應用程式範本 (GAS-Course-Web-Template)

本專案為 **Google Apps Script (GAS) 網頁應用程式全端範本**，具備五大核心架構：

1. **雙軌身分驗證與 Session 安全機制**：支援一般網頁環境之 Google Identity Services（GIS）憑證登入，以及 GAS HtmlService 容器內的 ActiveUser / AccountChooser 帳號切換流程；並可依部署條件處理 OAuth 授權碼回呼與 `INITIAL_AUTH` 還原。後端驗證 Google ID Token（`iss`、`email_verified`、`aud`）、支援可選登入網域限制，登入後核發 Session 與 CSRF Token（寫入型 API 強制驗證），並提供 `?mock=true` 本機離線測試模式。
2. **課程代碼匯入與 1NF 正規化模組**：依據教育部國民及學前教育署政策與[全國高級中等學校課程計畫平臺](https://course.k12ea.gov.tw/courseinformation/course.asp)規範，自動解析自該平臺下載之 39 欄課綱寬表 Excel，完整匯入全數課程代碼（包含不分屬性 0 與特殊需求領域 6 等所有科目），展開為三年六學期實質開課之 14 欄標準第一正規化（1NF）課程代碼表，並提供前端拖曳上傳、即時預覽統計與分頁檢索清單（全面採用 `paged-table-container` 高階純函式表格容器呈現，科別選單依教育部 3 碼科別代碼升冪排序）。
3. **多風格現代前端設計系統**：內建極簡曜藍（Modern Slate）、圖紙風格（Blueprint）、典雅紙張（Paper）、新粗獷主義（Neo-Brutalism）、黏土擬物（Claymorphism）、紅白機像素（NES）、Happy Hues 色彩盤、藏青磚紅（Navy Brick）、青瓷薄荷（Celadon Mint）、封面檸檬（Cover Lime）等 16 款視覺風格切換與深淺色模式；全面支援通用卡片元件（`.card`）、頁籤導覽列（`.app-nav`、`.nav-tab`）、統計指標網格（`.metrics-grid`、`.metric-card`）、響應式表格（`.table-responsive`）、搜尋防彈跳（`debounce`）、說明手冊指引彈窗與頁尾連結、列印防斷頁（`.print-signatures`），以及完整的 Toast 通知與 Modal 對話框。
4. **全方位資訊安全與通訊強化機制**：前端 API 客戶端採 GAS `google.script.run.executeWebApi` RPC 優先、`fetch` 備援與暫時性錯誤指數退避；後端統一 `executeWebApi` 路由入口與錯誤格式，實作 RBAC、CSRF、Web App 離線技術文件白名單安全路由（`?page=docs/...`）、HTTP GET 端點白名單、試算表公式注入防護、UUID Session 與 `LockService` 寫入保護，並強化登入授權與公開設定欄位控管。
5. **可稽核操作日誌與容量治理**：後端在最外層統一記錄每次 API 請求的事件類別、動作、操作者身分、結果、耗時與版本化詳情；僅系統管理員可透過「操作日誌」頁籤查詢與稽核。日誌工作表內建 20,000 列清理閾值與每日 03:00（Asia/Taipei）自動觸發器，避免工作表無限成長。

---

## 專案結構

```text
GAS-Course-Web-Template/
├── appsscript.json             # Google Apps Script 專案設定檔 (時區、V8 引擎、Web App 發布權限)
├── .clasp.json.example         # clasp 專案設定檔範本 (填入 scriptId)
├── .claspignore                # clasp 推送忽略規則 (僅推送後端腳本與打包後之 index.html)
├── package.json                # npm 腳本與相依套件設定
│
├── main.js                     # Google 試算表容器選單 (onOpen、初始化工作表、開啟 Web App)
├── gasRuntime.js               # GAS/Node 單一相依解析、白名單注入、工作表名稱／角色定義／API 版本號來源
├── actionRegistry.js           # Web API action 單一登錄來源（公開／寫入／鎖定清單、RBAC 矩陣與日誌中繼資料）
├── courseNormalizationShared.js # 前後端共用之 108 課綱常數與 1NF 正規化純函式
├── databaseInitializer.js      # 資料庫純資料工作表初始化（系統設定與授權、課程代碼、說明、操作日誌；含登入網域等設定欄位）
├── systemConfigCodec.js        # 系統參數工作表鍵值解析、編碼與布林/數字型別轉換純函式
├── subjectCodeTransformer.js   # 108 課綱 1NF 正規化展開、分頁查詢與試算表寫入（共用模組由 courseNormalizationShared.js 提供）
├── activityLogBuilders.js      # 操作日誌詳情產生器與 payload 白名單投影（含版本化格式）
├── activityLogInterceptor.js   # 操作日誌攔截器（log context、身分補寫、詳情捕獲、紀錄建構與最終寫入）
├── activityLogQuery.js         # 管理員操作日誌查詢（日期區間解析、篩選、分頁與 5,000 列掃描上限）
├── activityLogger.js           # 操作日誌寫入、字串截斷、容量清理與每日觸發器安裝（寫入不取樣列數）
├── webApi.js                   # API 路由總管與 executeWebApi 共用入口（RPC/doPost）、雙軌登入、OAuth 回呼、Session/CSRF、RBAC、LockService；日誌攔截與查詢拆至 activityLogInterceptor.js／activityLogQuery.js，保留 facade 轉發
├── utilities.js                # 儲存格安全格式化、公式注入防護 (sanitizeFormulaValue)、通用工具
│
├── webapp/                     # 前端原始碼目錄 (模組化開發，便於維護)
│   ├── index.html              # HTML 骨架與建置標記 (BUILD:CSS、BUILD:JS；本機 mock 開發入口)
│   ├── styles.css              # 多風格 CSS 設計系統 (16 款風格、通用卡片/導覽、深色模式高對比度校正)
│   └── js/
│       ├── config.js           # 前端全域設定、API 端點白名單、分頁導覽與樣式清單
│       ├── courseData.js       # 轉發共用正規化模組，供前端 1NF 即時預覽計算
│       ├── mock.js             # 本機離線開發測試 Mock API 模擬器（前端攔截，含登入/CSRF/公開設定相容欄位）
│       ├── errorMessages.js    # 安全錯誤訊息轉譯（resolveSafeMessage 單一來源，遮蔽原始例外文字）
│       ├── moduleHelpers.js    # 前端模組共用 Node require 相容墊片與 safeErrors 注入解析
│       ├── api.js              # API 客戶端（RPC 優先 + fetch 備援、自動夾帶 Token/CSRF、暫時性錯誤重試）
│       ├── state.js            # 響應式狀態容器 (State Store) 與訂閱發布機制
│       ├── eventBindings.js    # 共用事件委派與單一綁定守護（取代 inline 事件字串）
│       ├── listController.js   # 共用列表控制器（檢索、分頁、請求序號競態防護）
│       ├── ui.js               # UI 元件渲染器 (Header、Nav、Login、Toast、Modal、Debounce 防抖)
│       ├── auth.js             # 登入流程（GIS、ActiveUser/AccountChooser、OAuth 導向、Session 還原與登出）
│       ├── imports.js          # SheetJS 檔案讀取、拖曳上傳與 1NF 正規化預覽（paged-table-container 容器與科別排序）
│       ├── courses.js          # 正規化課程清單檢索、多條件即時防彈跳篩選與分頁控制（科別依代碼升冪排序）
│       ├── accounts.js         # 系統核心設定與白名單成員管理介面（含 OAuth/允許網域設定、RBAC、paged-table-container）
│       ├── activityLog.js      # 管理員操作日誌清單、日期／操作者／類別篩選、分頁與詳情展開（paged-table-container）
│       ├── app.js              # 前端進入點與應用程式生命週期管理（啟動流程、INITIAL_AUTH/switch 處理、頁尾手冊連結）
│       └── wiring.js           # 前端單一組裝點：建立最小介面並注入各模組工廠（最後載入）
│
├── scripts/
│   ├── build-webapp.js         # 前端打包腳本：將 webapp/styles.css 與 js/ 內嵌至根目錄 index.html
│   ├── run-tests.js            # 自動探索 tests/**/*.test.js 並以獨立子行程執行
│   ├── qualityConfig.js        # 納管範圍、門檻與基準線設定
│   ├── checkCoverage.js        # 全域覆蓋率量測（c8）與不回退檢查
│   ├── checkChangedCoverage.js # 變更覆蓋率檢查（diff + lcov）
│   ├── checkComplexity.js      # 函式 CRAP 與模組 MI 檢查
│   ├── checkUiClasses.js       # JS 使用的 class 必須存在於 CSS 之對齊檢查
│   ├── checkContrast.js        # UI 色彩對比度（WCAG）檢查（淺色／深色文字與焦點環）
│   ├── checkA11y.js            # 前端無障礙稽核（jsdom + axe-core，含主要畫面與關鍵狀態）
│   └── languageCheck.js        # 臺灣繁體中文與禁用詞檢查
│
├── docs/                       # 技術與教學文件目錄 (HTML 離線說明文件，支援 Web App 白名單安全路由)
│   ├── index.html              # 文件總覽首頁
│   ├── clasp-guide.html        # Google clasp 安裝、同步與版本化部署完全指南
│   ├── gis-login-guide.html    # Google 帳號登入 (GIS) 詳細設定教學 (GCP + 本地端)
│   ├── rbac-guide.html         # 依帳號角色管理權限 (RBAC) 實作詳細教學
│   ├── architecture-guide.html # GAS Web App 全端架構與通訊協定指南 (CORS 繞過與 LockService)
│   ├── course-normalization-guide.html # 108 課綱課程代碼 1NF 正規化工程解析 (39 欄展開與 23 碼解碼)
│   ├── user-guide.html         # 使用者操作手冊與常見問題快速指引
│   └── 參考資料/              # 官方規範文件庫
│       ├── 科別代碼.csv        # 教育部統計處高級中等學校科別代碼對照表
│       ├── 科目固定編碼.csv    # 108 課綱部定必修等固定編碼對照表
│       ├── 國教署1111118發文版介接規範.pdf # 官方課程計畫平臺介接規格書
│       └── README.md           # 參考資料檔案說明與維護規範
│
├── tests/
│   ├── courseCodeNormalization.test.js  # 108 課綱代碼 1NF 正規化與排除條件單元測試
│   ├── api.test.js                      # API 路由、Session 生命週期、RBAC 權限與公式注入防護單元測試
│   └── *.test.js                        # 依功能/函式切分之單元測試（由 run-tests.js 自動探索）
│
└── openspec/changes/                    # OpenSpec 提案、規格、設計與任務追蹤
```

---

## 快速開始

### 1. 安裝環境與相依套件

確保本機已安裝 Node.js **24**（本機與 CI 一致，`engines.node >= 24.0.0`）與 npm：

```bash
git clone https://github.com/cookeyholder/GAS-Course-Web-Template.git
cd GAS-Course-Web-Template
npm install
```

### 2. 登入 Google 與關聯 Apps Script 專案

使用 Google 官方命令列工具 `@google/clasp`：

```bash
# 登入 Google 帳號 (需開啟 Google Apps Script API: https://script.google.com/home/usersettings)
npx clasp login

# 複製設定檔範本
cp .clasp.json.example .clasp.json
```

編輯 `.clasp.json`，將 `scriptId` 替換為您的 Google Apps Script 專案代碼（可於 Apps Script 編輯器網址列或「專案設定」中取得）。

### 3. 設定 Google 帳號登入（GIS / GAS 雙軌）

本專案支援雙軌登入：一般網頁環境可使用 GIS 憑證按鈕，GAS 容器環境可使用 ActiveUser / AccountChooser 帳號切換流程；若需 OAuth 授權碼回呼備援，需額外設定 Client Secret 與重新導向 URI。

1. 前往 [Google Cloud Console](https://console.cloud.google.com/) 建立或選取專案，完成 **OAuth 同意畫面** 設定。
2. 進入 **API 和服務** → **憑證**，建立 **OAuth 用戶端 ID**（網頁應用程式）：
   - **已授權的 JavaScript 來源**：正式環境填入 `https://script.google.com`（⚠️ **請勿填寫 `googleusercontent.com`**）；本機測試依實際來源填入 `http://localhost`、`http://localhost:8080` 等。
   - **已授權的重新導向 URI**（授權碼回呼流程需要）：填入 Web App 正式部署網址 `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`（若使用學校 Workspace 專屬網域，需一併新增對應 `/a/{DOMAIN}/macros/s/{DEPLOYMENT_ID}/exec`）。
3. 取得 **Client ID**，並視需求取得 **Client Secret**（僅授權碼回呼備援需要）。
4. 於試算表「系統設定與授權」或網頁版「系統設定與授權」頁籤填入：`OAuth Client ID`、`OAuth Client Secret`（選填）、`Google 登入允許網域`（選填）與白名單限制設定。
5. 詳細流程與排除方式請參閱 [`docs/gis-login-guide.html`](docs/gis-login-guide.html)。

> **小技巧**：在本地開發或測試介面時，直接於網址列加上 `?mock=true` 即可啟用前端 Mock 模式進行測試，無需預先設定 Client ID。

### 4. 建置前端並推送至 Google Apps Script

```bash
# 1. 將 webapp/ 靜態資源打包至單一 index.html
npm run build:webapp

# 2. 推送後端 .js 檔案與 index.html 至 GAS
npm run push

# 3. 發布 Web App 新版本（預設建置 + 推送 + 部署）
npm run deploy

# 若要更新既有部署以保持 Web App 網址固定，可指定 Deployment ID：
# CLASP_DEPLOYMENT_ID=<DEPLOYMENT_ID> npm run deploy
# 或：node scripts/deploy.js -i <DEPLOYMENT_ID> -d "版本說明"
```

### 5. 初始化後端資料庫工作表

1. 開啟綁定此 Apps Script 之 Google 試算表。
2. 重新整理試算表頁面，工具列將自動出現 **課程系統管理** 選單。
3. 點選 **初始化資料庫工作表**，系統將自動建立「系統設定與授權」、「正規化課程代碼」、「系統使用說明」與「操作日誌」四張工作表，並設定保護與格式；同時安裝每日 03:00 的操作日誌清理觸發器。既有工作表已存在時保持原樣，不會覆寫。
4. 點選 **開啟 Web App 網頁** 即可取得網頁應用程式開啟連結！

---

## 本機離線開發 (Mock Mode)

本範本支援在無需連線 Google Apps Script 伺服器的情況下直接進行前端開發與樣式調整：

1. 直接在瀏覽器開啟**開發原始檔** `webapp/index.html`，並於網址列加上 `?mock=true`：
   ```text
   file:///path/to/GAS-Course-Web-Template/webapp/index.html?mock=true
   ```
   若使用本機伺服器，可改以 `http://localhost:8080/webapp/index.html?mock=true` 開啟。
2. 系統將自動啟用 `webapp/js/mock.js` 模擬器，提供完整的模擬登入、課程代碼篩選與分頁、檔案上傳預覽與設定儲存操作。所有的 Mock 身分驗證均由前端模擬器攔截，後端不留任何測試後門。
3. **正式建置產物根目錄 `index.html` 會忽略 `?mock=true`**：`scripts/build-webapp.js` 注入 `MEA_PRODUCTION_BUILD` 標記，`config.js` 據此停用 Mock 模式，避免部署後仍可切換假資料。若要在打包產物上驗證 Mock，請使用開發原始檔（上述步驟 1）。

> **提醒**：Mock 已與後端 API 回應形狀對齊（`getCourseIndex` 支援 `keyword`、`academicYear`、`semester`、`department`、`page`、`pageSize`），適合驗證介面流程；正式功能仍需在 GAS 環境完成整合驗證。

---

## 開發與品質檢查

### 執行環境與版本策略

- **Node.js**：本機與 CI（GitHub Actions `.github/workflows/quality-gates.yml`）皆以 **Node 24** 為目標版本（`package.json` `engines.node >= 24.0.0`，CI `node-version: "24"`），以確保品質檢查與測試結果一致。

### 常用指令

```bash
# 執行單元測試（自動探索 tests/**/*.test.js）
npm test

# 程式碼格式檢查 / 自動格式化（Prettier）
npm run format:check
npm run format

# 語言規範檢查（臺灣繁體中文 zh-TW）
npm run check:lang

# UI class 與 CSS 對齊、WCAG 對比度檢查
npm run check:ui-classes
npm run check:contrast

# 前端無障礙稽核（jsdom + axe-core；color-contrast 由 check:contrast 把關）
npm run check:a11y

# 測試覆蓋率量測與檢查（c8，產出 text/lcov/json/json-summary）
npm run test:coverage
npm run check:coverage

# 變更覆蓋率檢查（相對比較基準，可搭配 --base 或 CI 環境變數）
npm run check:changed-coverage

# CRAP 與 Maintainability Index（MI）複雜度檢查
npm run check:complexity

# 建置前端
npm run build:webapp

# OpenCC 可用性 smoke（非阻斷）
npm run language:smoke

# 語言檢查報告／乾跑／修正／核准／撤銷
npm run language:report
npm run language:check
npm run language:fix
npm run language:approve -- <id> [建議來源] [建議文字]
npm run language:revoke -- <id>
```

### Git Hook 與自動格式化（Prettier）

- 本專案使用 **Husky** + **lint-staged** 提供可重現的 `pre-commit` 品質防線。
- `pre-commit` 會對暫存檔執行 **Prettier 自動格式化**（`prettier --write`，並更新暫存結果）與語言規範檢查（`scripts/languageCheck.js`），確保提交內容符合格式與 `zh-TW` 規範；無法自動修正或檢查失敗時將阻擋提交。
- 安裝相依套件後可透過 `prepare` 腳本自動或依環境啟用 Husky；CI 與非互動環境會安全略過 hook 初始化以避免安裝失敗。

### 品質門檻與基準線（不回退）

品質閘門由本機指令與 CI（`.github/workflows/quality-gates.yml`，Quality Gates）共同強制執行：

- **全域覆蓋率**（`check:coverage`）：初始門檻 Lines >= 60%、Statements >= 30%、Functions >= 60%、Branches >= 60%，且**不得低於基準線（ratchet 不回退）**。
- **變更覆蓋率**（`check:changed-coverage`）：相對比較基準之 Lines >= 80%、Branches >= 80%；無可量測變更時明確成功/略過。
- **CRAP**（`check:complexity`）：每個納管函式 **CRAP MUST NOT > 25**。
- **Maintainability Index（MI）**（`check:complexity`）：每個納管模組 **MI MUST >= 50**。
- **方向性 ratchet**：覆蓋率四維度與 MI 最低值為「越高越佳」，不得低於基準；CRAP 最高值與超標數為「越低越佳」，不得高於基準。比較邏輯集中於 `scripts/qualityConfig.js::compareWithBaseline`，由 `checkCoverage.js` 與 `checkComplexity.js` 共用。
- **基準線**：現行基準（2026-11-20，Node v24.22.3）記錄於 `scripts/quality-baseline.json`，ratchet 既有值來源為 `openspec/changes/archive/2026-11-20-refactor-cohesion-and-coupling/measurement-baseline-before-refactor.md`；2026-11-18 過期快照另存為 `scripts/quality-baseline.2026-11-18.json`，僅供歷史比較，不作為 ratchet 來源。後續調整須可追溯且不得任意放寬。

#### 基準新舊比較（方向性 ratchet）

| 指標              | 2026-11-18 過期快照 | 重構前既有值（1.3） | 現行基準（2026-11-20） | 方向與結果       |
| ----------------- | ------------------- | ------------------- | ---------------------- | ---------------- |
| Lines 覆蓋率      | 27.37%              | 94.8%               | 96.28%                 | 越高越佳，未回退 |
| Statements 覆蓋率 | 27.37%              | 94.8%               | 96.28%                 | 越高越佳，未回退 |
| Functions 覆蓋率  | 58.82%              | 92.15%              | 94.25%                 | 越高越佳，未回退 |
| Branches 覆蓋率   | 37.87%              | 83.79%              | 85.62%                 | 越高越佳，未回退 |
| CRAP 最高值       | 1482.0              | 30                  | 30                     | 越低越佳，未回退 |
| CRAP > 25 超標數  | 56                  | 0                   | 0                      | 越低越佳，未回退 |
| MI 最低值         | 69.134              | 83.666              | 83.666                 | 越高越佳，未回退 |

完整量測環境、模組行數變化與新舊比較詳見 `docs/quality-baseline-2026-11-20.md`。

### CI 品質閘門行為

`.github/workflows/quality-gates.yml`（Quality Gates）在每次推送與 Pull Request 時，以 Node 24 依序執行：checkout（取得完整 Git 歷史供變更覆蓋率比對）、安裝相依（CI 環境略過 Husky 初始化）、`format:check`、`check:lang`、`check:ui-classes`、`check:contrast`、`check:a11y`（前端無障礙稽核）、建置產物一致性（`npm run build:webapp` 後 `git diff --exit-code -- index.html`）、`npm test`、`check:coverage`、`check:complexity`、`check:changed-coverage`。任一步驟失敗即阻擋合併；所有步驟都可在本機以同名 npm 指令重現。

相依套件由 `package-lock.json` 鎖定，CI 使用 `npm ci --ignore-scripts || npm install --ignore-scripts` 安裝並搭配 npm cache；SheetJS 於前端由 CDN 動態載入，故不列為 npm 相依。

在上述強制閘門之後，CI 另執行一組**非阻斷、只讀不寫**的語言證據步驟：OpenCC smoke、`npm run language:report`、契約漂移檢查、構件 meta 驗證、構件上傳（`language-report-${{ github.sha }}`）與簽核標籤嘗試，全部標記 `if: always()` 與 `continue-on-error: true`，**不得包含 `--fix`／`--approve`／`--revoke`**，故不影響合併結果。構件檢查會驗證報告檔案存在、JSONL 首行可解析為 meta、空檔視為警告，並檢查 `generatedAt` 是否落在該步驟執行時刻前 15 分鐘至後 5 分鐘（ISO 8601 UTC，`Z` 結尾），避免舊構件被誤用。凡有新步驟發出警告，工作流程摘要即輸出固定錨點 `LANGUAGE_SIGNOFF_REQUIRED` 與「語言警告未處理，合併前須人工簽核」，並嘗試為 Pull Request 加上 `language-signoff-required` 標籤；標籤新增失敗時摘要額外警示「標籤新增失敗，須人工確認語言簽核」。錨點存在即視為帶警告，合併前查核須主動檢查工作流程摘要，不得僅依賴標籤。

### 臺灣繁體語言檢查與 OpenCC 候選定位

既有 `npm run check:lang` 是**強制硬閘門**：違規只由既有精簡字集與中國用語表觸發，輸出格式、行內豁免標記（`language-check: ignore`）與結束碼維持不變，排除政策僅新增本變更新增的 `artifacts/`（仍掃描 `openspec/` 與 `docs/參考資料/`）。**零違規僅代表向後相容錨點，不代表完整語言合規**；此語意只記載於本文件與 `AGENTS.md`，不寫入 `check:lang` 輸出。

OpenCC 工具是**輔助定位與人工選詞**的第二條路徑，與硬閘門分工如下：

| 面向                                                                                     | 硬閘門 `check:lang`      | OpenCC 候選工具                                                       |
| ---------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------- |
| 定位來源                                                                                 | 既有精簡字集＋中國用語表 | 僅 `s2tw` 差異定位真正的簡體字                                        |
| 建議來源                                                                                 | 固定轉譯                 | `S2TW` 字級、`S2TWP` 臺灣慣用語、`MAINLAND_TERMS` 專案對照表          |
| 正體「項目」                                                                             | 不違規                   | `s2tw` 無差異，不產生候選；`s2twp` 會誤改為「專案」，但不據此建立候選 |
| 由正體字組成的中國用語（`\u652f\u6301`、`\u914d\u7f6e`、`\u53bb\u91cd`、`\u54c8\u5e0c`） | 回報違規，須人工修正     | `s2tw` 無差異，不進候選工具                                           |
| 寫入                                                                                     | 不寫入                   | 僅經明確核准的 `--fix` 寫入                                           |

**實測案例**：繁體「項目」在 `s2tw` 下不變，故不產生候選；簡體 `\u9879\u76ee` 才由 `s2tw` 定位，其 `suggestionOptions` 同時含 `S2TW` 的「項目」與 `S2TWP`／`MAINLAND_TERMS` 的「專案」。候選預設建議恆為最保守的 `S2TW` 字級結果；若要改用「專案」，須由人工依上下文挑選並核准。受保護語意是**候選原文**的屬性，故 `\u9879\u76ee` 候選核准寫入「專案」屬預期行為，即使「專案」在受保護清冊中亦不影響；反之正體原文位置的「項目」仍受保護不寫入。

#### 指令一覽

| 指令                                             | 用途                                            | 阻斷性       |
| ------------------------------------------------ | ----------------------------------------------- | ------------ |
| `npm run check:lang`                             | 既有強制硬閘門                                  | 阻斷         |
| `npm run language:smoke`                         | 檢查 OpenCC `s2tw`／`s2twp` 黃金案例與精確版本  | 非阻斷       |
| `npm run language:report`                        | 產生 `artifacts/language-report.jsonl` 與 `.md` | 非阻斷       |
| `npm run language:check`                         | 等同 `--dry-run`，只回報不寫入                  | 本機         |
| `npm run language:fix`                           | 僅寫入核准紀錄指定的建議                        | 本機，須核准 |
| `npm run language:approve -- <id> [來源] [建議]` | 核准指定建議並綁定至候選                        | 本機         |
| `npm run language:revoke -- <id>`                | 撤銷核准                                        | 本機         |

另有漂移檢查 `node scripts/generateOpenccS2twpContractLiterals.js --check`：契約字面值清冊由測試原始碼 AST 產生並版控；新增字面值僅警告並回 0，移除數量超過 `max(10, ceil(清冊筆數 × 0.05))` 或原始檔解析失敗時回非零結束碼。

#### 人工選詞與核准流程

1. 執行 `npm run language:report`，從 JSONL 逐筆查看 `original`、`suggestionOptions` 與核准狀態。
2. 依上下文挑選合適來源與文字，例如 `npm run language:approve -- <id> S2TWP 專案`。所選組合必須存在於 `suggestionOptions`，否則輸出 `SUGGESTION_NOT_IN_OPTIONS` 並列出可用選項且不寫入清冊。
3. 執行 `npm run language:fix`；工具只寫入核准紀錄綁定的建議，受保護、豁免與未核准候選保留原文。寫入後重新執行檢查。
4. 必要時以 `npm run language:revoke -- <id>` 撤銷；撤銷後該候選不再具備寫入授權。

核准清冊 `scripts/openccS2twpApprovals.json` 以 JSON `\uXXXX` 標準跳脫保存為純 ASCII，**直接改寫清冊等同核准，須經 Pull Request 核閱**。識別碼由 `file`、`original`、`contextHash`、`occurrenceIndex` 四欄位以 `\0` 分隔後取 SHA-256 前 16 碼，**不含行號、欄位偏移與建議文字**；故同行格式化或前方插入相同字面值會使目前 ID 改變，舊報告的 `reportedId` 只做否決與診斷。**重新核准後須重新產生報告**，否則舊報告的 `reportedId` 會回 `ORIGINAL_MISMATCH` 而不寫入。`ID_ALGORITHM_CHANGED`（工具版本升級使舊 ID 無法驗證）與 `APPROVAL_TAMPERED`（紀錄欄位遭竄改）皆為 `INVALID_RECORD` 診斷，兩者皆禁止寫入且要求重新核准。**明文禁止同時執行多個 `--approve`／`--revoke`／`--fix`**，以免後寫入者以舊快照覆蓋清冊使已撤銷核准復活；請由 Pull Request 流程序列化核准變更。

#### 降級、診斷與寫入失敗

原生套件採延遲載入且僅供 Node 工具鏈，不進入前端打包或 GAS 部署產物。相依版本精確鎖定 `opencc@1.4.2` 與 `@babel/parser@7.29.15`；套件不可用時硬閘門照常執行並在標準錯誤輸出提示下列診斷碼，結束碼仍由違規數決定，報告模式則在每筆與摘要標記降級並維持成功結束碼：

- `OPENCC_BINARY_MISSING`：平台二進位 optional dependency 缺失（`ERR_DLOPEN_FAILED` 或 `@opencc/opencc-` 前綴）。
- `OPENCC_UNAVAILABLE`：其他 OpenCC 載入、建構或轉換失敗。
- `PARSER_UNAVAILABLE`：`@babel/parser` 缺失，僅由契約漂移檢查步驟輸出。

報告寫入失敗時，stderr 出現 `REPORT_WRITE_FAILED`，stdout 輸出 `{"ok":false,"code":"REPORT_WRITE_FAILED","bytes":0}`，結束碼仍為成功；成功時則輸出 `{"ok":true,"code":"REPORT_OK","bytes":<n>}`。`--output` 僅供本機除錯，CI 與 `npm run language:report` 一律寫入預設 `artifacts/`；指向專案根目錄外或逃逸的符號連結路徑會被拒絕且結束碼仍為成功。報告 JSONL 維持純 ASCII，Markdown 採 `\uXXXX` 呈現層跳脫，故含禁詞原文亦不污染硬閘門。

### 疑難排解

- **`format:check` 失敗**：執行 `npm run format` 自動格式化後重新檢查；pre-commit 只會格式化暫存檔，CI 則檢查全部檔案。
- **`check:lang` 失敗**：依訊息將簡體字或中國用語改為臺灣繁體中文用詞（如「程式碼」「預設」「資料庫」）。
- **`check:a11y` 失敗**：依輸出的夾具、規則與節點Selector修正 DOM 語意或 ARIA 屬性；`color-contrast` 已停用，色彩對比問題請改用 `npm run check:contrast` 排查。新增前端畫面時須同步擴充 `tests/helpers/a11yHarness.js` 的夾具。
- **`check:coverage` 失敗**：先執行 `npm run test:coverage` 產生 `coverage/coverage-summary.json`，確認是否未達初始門檻或低於基準線；補測試後重新量測。
- **`check:complexity` 失敗**：查看 `reports/quality/complexity.json` 定位 CRAP > 25 或 MI < 50 的項目，以拆分函式與補測試收斂，不可直接放寬門檻或排除核心模組。
- **`check:changed-coverage` 失敗**：確認比較基準（`--base` 或 `CHANGED_COVERAGE_BASE`）是否正確，並為新增/修改的可執行行與分支補測試（Lines >= 80%、Branches >= 80%）。
- **pre-commit 阻擋提交**：查看 `npx lint-staged` 與語言檢查訊息；修正後重新暫存提交。緊急情況可暫時以 `git commit --no-verify` 略過，但 CI 仍會強制檢查，應儘速補正。
- **Node 版本不一致**：確認 `node --version` 為 24.x；版本不符可能導致 c8 或靜態分析結果與 CI 不同。

---

## 核心功能說明

### 1. 108 課綱課程代碼與課程計畫 1NF 正規化原理

108 課綱課程代碼與開課清冊為教育部推行之全國統一政策規格。依據國教署 111 年 11 月 18 日臺教國署高字第 1110159457 號函公告修訂之《**高級中等學校課程計畫資料交換規格及課程代碼介接規範**》（收錄於本專案 [docs/參考資料/](<file:///home/cookeyholder/Projects/GAS-Course-Web-Template/docs/參考資料/A_高級中等學校課程計畫資料交換規格及課程代碼介接規範1111118(發文版).pdf>)），官方資訊與開課查詢管道如下：

- **[全國高級中等學校課程計畫平臺 - 課程計畫資料查詢](https://course.k12ea.gov.tw/courseinformation/data.asp)**：可依學年度、主管機關、學校類型與學校名稱，查詢全國各高中職經教育部備查之完整課程計畫書、總體架構與各科開課清冊。
- **[全國高級中等學校課程計畫平臺 - 課程代碼查詢](https://course.k12ea.gov.tw/courseinformation/course.asp)**：提供 108 課綱 23 碼課程代碼結構（入學年3碼 + 校代碼6碼 + 課程類型1碼 + 群別2碼 + 科別3碼 + 班群1碼 + 課程類別1碼 + 開課方式1碼 + 科目屬性1碼 + 領域2碼 + 科目名稱代碼2碼）、部定/校訂必選修、群科別與科目屬性對照標準。該代碼一經備查通過編定後即永不變更，適合作為唯一識別碼（Primary Key）。

自教育部課程計畫平臺下載之原始課綱資料皆遵循此 39 欄寬表標準結構，單一資料列橫向跨越三年六學期（一上～三下）。本模組處理邏輯如下：

- **全數匯入**：完整保留所有課程代碼列，不剔除任何科目屬性（包含不分屬性 0 如團體活動時間、特殊需求領域 6 等皆全數納入展開）。
- **1NF 展開**：逐一掃描六個學期之開課學分與時數，僅保留「學分 > 0 或時數 > 0」之學期，展開為獨立紀錄列。
- **中文代碼轉譯**：
  - 群別代碼（如 `23` → 電機與電子群）
  - 科別代碼（如 `305` → 資訊科、`308` → 電機科）
  - 課程類型（如 `1` → 部定必修、`2` → 校訂必修）
  - 科目屬性（如 `1` → 一般科目、`2` → 專業科目、`3` → 實習科目）
  - 必選修（如 `1` → 必修、`2` → 選修）
- **分批寫入防護**：以 5000 筆為一個 chunk 分批寫入試算表，避免單次 `setValues()` 過大導致 GAS 逾時。

### 2. 雙軌登入、Session 與通訊機制

- **一般網頁環境**：前端載入 Google Identity Services（GIS）並取得 ID Token，呼叫後端 `login` 驗證後建立 Session。
- **GAS 容器環境**：前端可透過 AccountChooser / `switch=1` 流程呼叫 `loginWithActiveUser`，避免沙箱 `origin_mismatch` 對 GIS 彈窗的限制。
- **授權碼回呼（選用）**：`doGet` 可處理 OAuth 授權碼回呼並注入 `INITIAL_AUTH`，由前端啟動流程接手還原登入狀態（需正確設定 Client ID/Secret 與重新導向 URI）。回呼 `state` 攜帶前端產生的一次性 nonce，後端以 `CacheService` 消耗並比對 `redirectUri`，重放或不符即拒絕。
- 後端驗證 Google ID Token（`iss`、`email_verified`、`aud`、`exp`、`iat`，含合理時差容忍）並支援可選登入網域限制（大小寫一致正規化）；登入與授權仍套用白名單、停用狀態與首次管理員開通規則。首次開通僅在明確 `allowBootstrap` 且白名單為空時，於短鎖臨界區再次確認後寫入。
- 登入後核發 Session Token 與 CSRF Token（`CacheService`，預設 6 小時）；寫入型 action 需驗證 CSRF。
- 前端 API 於 GAS 容器優先使用 `google.script.run.executeWebApi`（RPC），非容器環境以 `POST text/plain;charset=utf-8` 備援並對暫時性錯誤進行重試（jitter ±20%、總上限 10 秒，大型匯入停用自動重試並以 `importId` 冪等防重複寫入）。
- 所有 action 由 `actionRegistry.js` 單一登錄來源產生公開／寫入／鎖定清單與 RBAC 矩陣；未登錄的 action 在路由層直接回傳 `unknown_action`。

### 3. 全方位資訊安全架構 (Security Hardening)

- **試算表公式注入防護 (Formula Injection)**：
  在 `utilities.js` 提供 `sanitizeFormulaValue` 與 `sanitizeRowMatrix`，於寫入系統設定與白名單等試算表儲存格前，自動檢核開頭符號（`=`、`+`、`-`、`@`、`\t`、`\r`）並加上前置單引號，杜絕 CSV/試算表公式代碼注入攻擊。
- **HTTP 方法白名單與 CSRF 防護**：
  `doGet` 僅允許唯讀檢查等公開路徑，其餘操作需經受控 API 流程；寫入型 action 需驗證 CSRF Token，並搭配 Session 權限檢查與 `LockService` 併發保護。RBAC 採明確 action 列舉（不支援 `getXxx` 通配授權），寫入動作依角色嚴格控管。
- **API 端點白名單**：
  前端僅接受同源、`GAS_WEBAPP_URL` 明確設定之端點、`https://script.google.com/macros/s/<id>/exec` 與本機開發端點；其他 `?api=` 值一律忽略，避免 Session／CSRF Token 外送至惡意站台。
- **OAuth state nonce 一次性驗證**：
  授權碼回呼的 `state` 由前端以 `sessionStorage` 保存 nonce 與 `redirectUri`；後端一次性消耗 nonce 並綁定重新導向 URI，外部 HTTP 交換權杖與 ID Token 驗證皆在取得鎖前完成，寫入鏈才進入 `LockService` 臨界區。
- **匯入邊界防護**：
  後端限制匯入列數／欄數上限，並驗證 `preNormalized` 為 14 欄二維陣列；寫入前套用 `sanitizeRowMatrix` 並設定 `@` 純文字格式，防堵公式注入與超大資料量逾時。
- **第三方資源完整性**：
  SheetJS CDN 固定單一版本 `0.20.3` 並附上 `integrity`（SRI）與 `crossorigin`，避免版本混用與CDN 內容遭竄改。
- **後端無測試後門**：
  Mock 模式僅由前端模擬器攔截，且正式建置產物忽略 `?mock=true`；後端不提供未認證之測試登入後門。
- **DOM / XSS 注入防護**：
  前端涉及使用者 Email 等動態參數之行內事件，一律使用 `decodeURIComponent(encodeURIComponent(...))` 處理，阻斷字串跳脫崩潰與 XSS。

### 4. 多風格視覺設計系統與現代元件

可在網頁右上角下拉選單即時切換風格，並支援深色／淺色模式記憶（儲存於 LocalStorage）：

- **16 款風格**：
  - `modern-slate`：極簡曜藍（預設風格 · Slate 冷灰極簡 · 曜藍高對比 · 精緻微陰影）
  - `blueprint`：圖紙風格（工程網格底紋 · 冷調科技藍）
  - `paper`：紙張風格（人文襯線字型 · 典雅米紙護眼）
  - `neobrutalism`：新粗獷主義（粗黑邊框 · 高反差硬投影）
  - `claymorphism`：黏土擬物（澎潤大圓角 · 雙層軟陰影）
  - `nes`：紅白機像素（8-bit 復古點陣 · 經典任天堂風格）
  - `happyhues*`：多款色彩調配盤（曜藍薄荷、海洋湛藍、松石暖金、黑曜暖橘、森林琥珀、午夜蜜桃、薄荷暖陽）
  - `navy-brick`：藏青磚紅（📘 · 藏青頂帶 · 磚紅強調 · 米紙標題）
  - `celadon-mint`：青瓷薄荷（🍵 · 青瓷底色 · 薄荷強調 · 米紙標題）
  - `cover-lime`：封面檸檬（🍋 · 檸檬深色帶 · 墨黑標題 · 高對比按鈕）
- **通用元件類別齊全**：全面支援 `.card`、`.app-nav`、`.nav-tab`、`.metrics-grid`、`.metric-card`、`.table-responsive` 等元件類別。
- **深色模式對比度校正**：強化深色模式下啟用態按鈕與標籤膠囊之邊框、文字色彩與外發光立體感。
- **搜尋防抖 (Debounce)**：內建 `MEA.ui.debounce` 工具函式，在課程代碼即時檢索時自動以 300ms 延遲防抖，操作體驗順暢無延遲。
- **列印樣式防斷頁**：支援 `.print-signatures` 等列印專用樣式，防止報表與簽核欄跨頁切斷。

### 5. 可稽核操作日誌與容量治理

後端在 `executeWebApi` 最外層 `finally` 統一寫入操作日誌，覆蓋成功、失敗、授權失敗、CSRF 失敗、JSON 解析失敗與缺少 action 等情境；`ping`、`getPublicConfig`、`getActivityLog` 為不寫日誌的例外。日誌寫入失敗僅記錄於主控台，不影響原本 API 回應。

- **工作表結構**：`操作日誌` 工作表共 12 欄，包含時間戳記、請求識別碼、事件類別（`auth`／`write`／`query`）、動作名稱、結果、操作者 email／姓名／角色、摘要、詳情 JSON、耗時（毫秒）與錯誤代碼；時間戳記統一採用 `Asia/Taipei` 時區的 `yyyy-MM-dd HH:mm:ss` 格式。
- **敏感資料防護**：寫入前統一對字串欄位截斷至 500 字元，並排除 `token`、`csrfToken`、`idToken`、`credential`、原始 `rows` 與查詢回傳內容；寫入動作的詳情僅保存白名單欄位的 before／after 投影，查詢動作只保存篩選、分頁與回傳筆數等彙總指標，詳情格式附版本號。
- **寫入效能**：寫入路徑不取樣、也不掃描工作表列數，容量檢查由每日清理程序獨立處理，避免每次請求都讀取工作表最後一列。
- **管理員頁籤**：前端「操作日誌」頁籤以 `adminOnly` 旗標標記，僅 `admin` 角色可見；`renderNavbar()`、`setTab()` 與 `buildBodyHtml()` 三處皆執行相同守門，即使直接竄改 `state.tab` 也無法進入該頁籤。
- **查詢限制**：預設查詢最近 7 天、每頁 50 列、單次最多 500 筆，單次最多往前掃描 5,000 列（達上限且總列數更多時回傳 `truncated: true`），依時間戳記遞減排序；支援開始／結束日期、操作者 email 與事件類別篩選，並可展開查看版本化詳情 JSON。
- **容量治理**：日誌列數超過 20,000 列時，每日清理程序刪除最舊資料至保留 15,000 列；初始化流程會安裝每日 03:00（Asia/Taipei）的 `cleanupActivityLogRows` 時間觸發器，並先比對既有觸發器避免重複建立。

---

## 如何以此範本衍生新專案

1. **擴充資料庫工作表**：
   - 在 `databaseInitializer.js` 的 `initializeDatabaseSheets` 加入新工作表名稱與預設表頭。
2. **新增後端 API Action**：
   - 在 `webApi.js` 的 `routeWebApiAction`（或共用處理流程）中加入新的 `case`。
   - 若涉及資料寫入，請於 `WEB_API_WRITE_ACTIONS` 註冊該 action 名稱，以套用 `LockService` 併發保護與 CSRF 驗證；公開免登入 action 需同步檢視 `WEB_API_PUBLIC_ACTIONS`。
   - 在 `ROLE_PERMISSIONS` 為各角色設定呼叫權限，並維持回應格式 `{ ok, ... }` 一致。
3. **擴充前端頁籤與功能模組**：
   - 在 `webapp/js/config.js` 的 `tabs` 陣列新增頁籤項目。
   - 於 `webapp/js/` 建立對應之業務邏輯檔案（如 `reports.js`），並於 `webapp/index.html` 的 `<!-- BUILD:JS -->` 區塊加入 `<script src="js/reports.js"></script>`。
   - 在 `webapp/js/app.js` 的 `render()` 加入新頁籤渲染邏輯。
   - 執行 `npm run build:webapp` 即可重新打包！

---

## 授權

MIT License
