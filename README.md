# Google Apps Script 網頁應用程式範本 (GAS-Course-Web-Template)

本專案為 **Google Apps Script (GAS) 網頁應用程式全端範本**，具備四大核心架構：

1. **雙軌身分驗證與 Session 安全機制**：支援一般網頁環境之 Google Identity Services（GIS）憑證登入，以及 GAS HtmlService 容器內的 ActiveUser / AccountChooser 帳號切換流程；並可依部署條件處理 OAuth 授權碼回呼與 `INITIAL_AUTH` 還原。後端驗證 Google ID Token（`iss`、`email_verified`、`aud`）、支援可選登入網域限制，登入後核發 Session 與 CSRF Token（寫入型 API 強制驗證），並提供 `?mock=true` 本機離線測試模式。
2. **108 課綱課程代碼匯入與 1NF 正規化模組**：依據教育部國民及學前教育署政策與[全國高級中等學校課程計畫平臺](https://course.k12ea.gov.tw/courseinformation/course.asp)規範，自動解析自該平臺下載之 39 欄課綱寬表 Excel，完整匯入全數課程代碼（包含不分屬性 0 與特殊需求領域 6 等所有科目），展開為三年六學期實質開課之 14 欄標準第一正規化（1NF）課程索引表，並提供前端拖曳上傳、即時預覽統計與分頁檢索清單。
3. **多風格現代前端設計系統**：內建極簡曜藍（Modern Slate）、圖紙風格（Blueprint）、典雅紙張（Paper）、新粗獷主義（Neo-Brutalism）、黏土擬物（Claymorphism）、紅白機像素（NES）、Happy Hues 等 13 款視覺風格切換與深淺色模式；全面支援通用卡片元件（`.card`）、頁籤導覽列（`.app-nav`、`.nav-tab`）、統計指標網格（`.metrics-grid`、`.metric-card`）、響應式表格（`.table-responsive`）、搜尋防抖（`debounce`）、列印防斷頁（`.print-signatures`），以及完整的 Toast 通知與 Modal 對話框。
4. **全方位資訊安全與通訊強化機制**：前端 API 客戶端採 GAS `google.script.run.executeWebApi` RPC 優先、`fetch` 備援與暫時性錯誤指數退避；後端統一 `executeWebApi` 路由入口與錯誤格式，實作 RBAC、CSRF、HTTP GET 端點白名單、試算表公式注入防護、UUID Session 與 `LockService` 寫入保護，並強化登入授權與公開設定欄位控管。

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
├── databaseInitializer.js     # 資料庫純資料工作表初始化（系統設定與授權、課程索引、說明；含登入網域等設定欄位）
├── subjectCodeTransformer.js   # 108 課綱代碼對照字典、1NF 正規化展開與分頁查詢函式
├── webApi.js                   # API 路由總管與 executeWebApi 共用入口（RPC/doPost）、雙軌登入、OAuth 回呼、Session/CSRF、RBAC、LockService
├── utilities.js                # 儲存格安全格式化、公式注入防護 (sanitizeFormulaValue)、通用工具
│
├── webapp/                     # 前端原始碼目錄 (模組化開發，便於維護)
│   ├── index.html              # HTML 骨架與建置標記 (BUILD:CSS、BUILD:JS)
│   ├── styles.css              # 多風格 CSS 設計系統 (13 款風格、通用卡片/導覽、深色模式高對比度校正)
│   └── js/
│       ├── config.js           # 前端全域設定、分頁導覽與樣式清單
│       ├── courseData.js       # 前端代碼對照字典與 1NF 正規化預覽計算
│       ├── mock.js             # 本機離線開發測試 Mock API 模擬器（前端攔截，含登入/CSRF/公開設定相容欄位）
│       ├── api.js              # API 客戶端（RPC 優先 + fetch 備援、自動夾帶 Token/CSRF、暫時性錯誤重試）
│       ├── state.js            # 響應式狀態容器 (State Store) 與訂閱發布機制
│       ├── ui.js               # UI 元件渲染器 (Header、Nav、Login、Toast、Modal、Debounce 防抖)
│       ├── auth.js             # 登入流程（GIS、ActiveUser/AccountChooser、OAuth 導向、Session 還原與登出）
│       ├── imports.js          # SheetJS 檔案讀取、拖曳上傳與 1NF 正規化預覽
│       ├── courses.js          # 正規化課程清單檢索、多條件即時防抖篩選與分頁控制
│       ├── accounts.js         # 系統核心設定與白名單成員管理介面（含 OAuth/允許網域設定、RBAC）
│       └── app.js              # 前端進入點與應用程式生命週期管理（啟動流程、INITIAL_AUTH/switch 處理）
│
├── scripts/
│   └── build-webapp.js         # 前端打包腳本：將 webapp/styles.css 與 js/ 內嵌至根目錄 index.html
│
├── docs/                       # 技術與教學文件目錄 (HTML 離線說明文件)
│   ├── index.html              # 文件總覽首頁
│   ├── clasp-guide.html        # Google clasp 安裝、同步與版本化部署完全指南
│   ├── gis-login-guide.html    # Google 帳號登入 (GIS) 詳細設定教學 (GCP + 本地端)
│   ├── rbac-guide.html         # 依帳號角色管理權限 (RBAC) 實作詳細教學
│   ├── architecture-guide.html # GAS Web App 全端架構與通訊協定指南 (CORS 繞過與 LockService)
│   ├── course-normalization-guide.html # 108 課綱課程代碼 1NF 正規化工程解析 (39 欄展開與 23 碼解碼)
│   └── 參考資料/              # 官方規範文件庫 (含國教署 1111118 發文版介接規範 PDF)
│
└── tests/
    ├── courseCodeNormalization.test.js  # 108 課綱代碼 1NF 正規化與排除條件單元測試
    └── api.test.js                      # API 路由、Session 生命週期、RBAC 權限與公式注入防護單元測試
```

---

## 快速開始

### 1. 安裝環境與相依套件

確保本機已安裝 Node.js (v16+) 與 npm：

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

# 3. 發布 Web App 新版本 (或於 Apps Script 網頁介面發布)
npm run deploy
```

### 5. 初始化後端資料庫工作表

1. 開啟綁定此 Apps Script 之 Google 試算表。
2. 重新整理試算表頁面，工具列將自動出現 **課程系統管理** 選單。
3. 點選 **初始化資料庫工作表**，系統將自動建立「系統設定與授權」、「正規化課程索引」與「系統使用說明」三張工作表，並設定保護與格式。
4. 點選 **開啟 Web App 網頁** 即可取得網頁應用程式開啟連結！

---

## 本機離線開發 (Mock Mode)

本範本支援在無需連線 Google Apps Script 伺服器的情況下直接進行前端開發與樣式調整：

1. 執行打包：
   ```bash
   npm run build:webapp
   ```
2. 直接在任何瀏覽器開啟根目錄之 `index.html`，並於網址列加上 `?mock=true`：
   ```text
   file:///path/to/GAS-Course-Web-Template/index.html?mock=true
   ```
3. 系統將自動啟用 `webapp/js/mock.js` 模擬器，提供完整的模擬登入、課程清單瀏覽、檔案上傳與設定儲存操作。所有的 Mock 身分驗證均由前端模擬器攔截，線上後端環境不留任何測試後門。

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
- **授權碼回呼（選用）**：`doGet` 可處理 OAuth 授權碼回呼並注入 `INITIAL_AUTH`，由前端啟動流程接手還原登入狀態（需正確設定 Client ID/Secret 與重新導向 URI）。
- 後端驗證 Google ID Token（`iss`、`email_verified`、`aud`）並支援可選登入網域限制；登入與授權仍套用白名單、停用狀態與首次管理員開通規則。
- 登入後核發 Session Token 與 CSRF Token（`CacheService`，預設 6 小時）；寫入型 action 需驗證 CSRF。
- 前端 API 於 GAS 容器優先使用 `google.script.run.executeWebApi`（RPC），非容器環境以 `POST text/plain;charset=utf-8` 備援並對暫時性錯誤進行重試。

### 3. 全方位資訊安全架構 (Security Hardening)

- **試算表公式注入防護 (Formula Injection)**：
  在 `utilities.js` 提供 `sanitizeFormulaValue` 與 `sanitizeRowMatrix`，於寫入系統設定與白名單等試算表儲存格前，自動檢核開頭符號（`=`、`+`、`-`、`@`、`\t`、`\r`）並加上前置單引號，杜絕 CSV/試算表公式代碼注入攻擊。
- **HTTP 方法白名單與 CSRF 防護**：
  `doGet` 僅允許唯讀檢查等公開路徑，其餘操作需經受控 API 流程；寫入型 action 需驗證 CSRF Token，並搭配 Session 權限檢查與 `LockService` 併發保護。
- **後端無測試後門**：
  Mock 模式僅由前端模擬器攔截（`?mock=true`），後端不提供未認證之測試登入後門。
- **DOM / XSS 注入防護**：
  前端涉及使用者 Email 等動態參數之行內事件，一律使用 `decodeURIComponent(encodeURIComponent(...))` 處理，阻斷字串跳脫崩潰與 XSS。

### 4. 多風格視覺設計系統與現代元件

可在網頁右上角下拉選單即時切換風格，並支援深色／淺色模式記憶（儲存於 LocalStorage）：

- **13 款風格**：
  - `modern-slate`：極簡曜藍（預設風格 · Slate 冷灰極簡 · 曜藍高對比 · 精緻微陰影）
  - `blueprint`：圖紙風格（工程網格底紋 · 冷調科技藍）
  - `paper`：紙張風格（人文襯線字型 · 典雅米紙護眼）
  - `neobrutalism`：新粗獷主義（粗黑邊框 · 高反差硬投影）
  - `claymorphism`：黏土擬物（澎潤大圓角 · 雙層軟陰影）
  - `nes`：紅白機像素（8-bit 復古點陣 · 經典任天堂風格）
  - `happyhues*`：多款色彩調配盤（曜藍薄荷、海洋湛藍、松石暖金、黑曜暖橘、森林琥珀、午夜蜜桃、薄荷暖陽）
- **通用元件類別齊全**：全面支援 `.card`、`.app-nav`、`.nav-tab`、`.metrics-grid`、`.metric-card`、`.table-responsive` 等元件類別。
- **深色模式對比度校正**：強化深色模式下啟用態按鈕與標籤膠囊之邊框、文字色彩與外發光立體感。
- **搜尋防抖 (Debounce)**：內建 `MEA.ui.debounce` 工具函式，在課程代碼即時檢索時自動以 300ms 延遲防抖，操作體驗順暢無延遲。
- **列印樣式防斷頁**：支援 `.print-signatures` 等列印專用樣式，防止報表與簽核欄跨頁切斷。

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
