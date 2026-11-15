# Google Apps Script 網頁應用程式範本 (GAS-Course-Web-Template)

本專案為獨立之 **Google Apps Script (GAS) 網頁應用程式全端範本**，衍生自 `Exam-Sections-Arranger` 並抽取其三大核心精髓：
1. **Google Identity Services (GIS) 身分驗證系統**：支援 Google One Tap、Google 登入按鈕、Google Workspace 網域登入、Google ID Token 後端憑證驗證與 CacheService Session 機制。
2. **108 課綱課程代碼匯入與 1NF 正規化模組**：自動解析巨耀等校務系統之 39 欄課綱寬表 Excel，第一時間剔除非授課科目（屬性 0 與 6），展開為三年六學期實質開課之 14 欄標準第一正規化（1NF）課程索引表，並提供前端拖曳上傳、即時預覽統計與分頁檢索清單。
3. **多風格現代前端設計系統**：內建極簡曜藍（Modern Slate）、圖紙風格（Blueprint）、典雅紙張（Paper）、新粗獷主義（Neo-Brutalism）、黏土擬物（Claymorphism）、紅白機像素（NES）、Happy Hues 等 13 款視覺風格切換與深淺色模式，具備完整的 Toast 通知、Modal 對話框、響應式導覽與卡片元件。

---

## 專案結構

```text
GAS-Course-Web-Template/
├── appsscript.json             # Google Apps Script 專案設定檔 (時區、V8 引擎、Web App 發布權限)
├── .clasp.json.example         # clasp 專案設定檔範本 (填入 scriptId)
├── .claspignore                # clasp 推送忽略規則 (僅推送後端腳本與編譯後之 index.html)
├── package.json                # npm 腳本與相依套件設定
│
├── main.js                     # Google 試算表容器選單 (onOpen、初始化工作表、開啟 Web App)
├── databaseInitializer.js     # 資料庫純資料工作表初始化 (系統設定與授權、課程索引、說明)
├── subjectCodeTransformer.js   # 108 課綱代碼對照字典、1NF 正規化展開與分頁查詢函式
├── webApi.js                   # API 路由總管、CORS 防護、Token 驗證、RBAC 角色權限、LockService
├── utilities.js                # 儲存格安全格式化、字串處理與通用工具
│
├── webapp/                     # 前端原始碼目錄 (模組化開發，便於維護)
│   ├── index.html              # HTML 骨架與建置標記 (BUILD:CSS、BUILD:JS)
│   ├── styles.css              # 多風格 CSS 設計系統 (13 款風格、深淺色模式、元件樣式)
│   └── js/
│       ├── config.js           # 前端全域設定、分頁導覽與樣式清單
│       ├── courseData.js       # 前端代碼對照字典與 1NF 正規化預覽計算
│       ├── mock.js             # 本機離線開發測試 Mock API 模擬器
│       ├── api.js              # REST API 客戶端 (自動攜帶 Token、支援 text/plain 避免 OPTIONS)
│       ├── state.js            # 響應式狀態容器 (State Store) 與訂閱發布機制
│       ├── ui.js               # UI 元件渲染器 (Header、Nav、Login、Toast、Modal)
│       ├── auth.js             # GIS 登入按鈕載入、Token 回傳、工作階段還原與登出
│       ├── imports.js          # SheetJS 檔案讀取、拖曳上傳與 1NF 正規化預覽
│       ├── courses.js          # 正規化課程清單檢索、多條件篩選與分頁控制
│       ├── accounts.js         # 系統核心設定與白名單成員管理介面 (RBAC)
│       └── app.js              # 前端進入點與應用程式生命週期管理
│
├── scripts/
│   └── build-webapp.js         # 前端打包腳本：將 webapp/styles.css 與 js/ 內嵌至根目錄 index.html
│
├── docs/                       # 技術與教學文件目錄 (HTML 離線說明文件)
│   ├── index.html              # 文件總覽首頁
│   ├── clasp-guide.html        # Google clasp 安裝、同步與版本化部署完全指南
│   ├── gis-login-guide.html    # Google 帳號登入 (GIS) 詳細設定教學 (GCP + 本地端)
│   └── rbac-guide.html         # 依帳號角色管理權限 (RBAC) 實作詳細教學
│
└── tests/
    ├── courseCodeNormalization.test.js  # 108 課綱代碼 1NF 正規化與排除條件單元測試
    └── api.test.js                      # API 路由派發、Session 生命週期與 RBAC 權限單元測試
```

---

## 快速上手與部署

### 1. 安裝環境與相依套件

請確保本機已安裝 Node.js (>= 14.0.0)：

```bash
# 複製或進入範本目錄
cd /home/cookeyholder/Projects/GAS-Course-Web-Template

# 執行單元測試驗證模組運作
npm test
```

### 2. 設定 clasp 與 Google Apps Script 專案

```bash
# 登入 Google 帳號 (需已於 Google 帳戶啟用 Apps Script API)
npx clasp login

# 建立新專案（綁定至指定 Google 試算表）：
npx clasp create --title "我的 GAS 應用程式" --type sheets --parentId "<您的試算表 ID>"

# 或者若已有現成 Apps Script 專案，複製設定檔並填入 scriptId：
cp .clasp.json.example .clasp.json
# 編輯 .clasp.json 填入實際的 scriptId
```

### 3. 設定 Google Cloud OAuth 2.0 Client ID (供 GIS 登入)

1. 開啟 [Google Cloud Console](https://console.cloud.google.com/)。
2. 建立新專案或選取現有專案。
3. 進入 **API 和服務** → **OAuth 同意畫面**，使用者類型選取「內部」（Intranet）或「外部」。
4. 進入 **API 和服務** → **憑證**，點擊 **建立憑證** → **OAuth 用戶端 ID**：
   - 應用程式類型選取：**網頁應用程式** (Web application)。
   - **已授權的 JavaScript 來源**：填入 `https://script.google.com`（⚠️ **請勿填寫 `googleusercontent.com`**，Google 後台會判定為禁止網域並報錯「來源無效：使用的網域遭到禁止」；本地測試請填入 `http://localhost:8080`）。
   - **已授權的重新導向 URI**：填入 Web App 正式部署網址 `https://script.google.com/macros/s/{DEPLOYMENT_ID}/exec`（若使用學校 Workspace 專屬網域，需一併新增 `https://script.google.com/a/{DOMAIN}/macros/s/{DEPLOYMENT_ID}/exec`）。
5. 建立後取得 **用戶端 ID (Client ID)**（格式例如：`123456789-xxxxxxxx.apps.googleusercontent.com`）。
6. 可在 Google 試算表的「系統設定與授權」工作表 B5 儲存格填入此 Client ID，或於網頁版管理介面中設定。

> **小技巧**：若尚未設定 Client ID，系統仍支援以 Google Workspace 網域登入（自動透過 `Session.getActiveUser()` 辨識身分，免 OAuth 彈窗）。

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

開啟綁定的 Google 試算表：
1. 點擊頂端工具列選單：**應用程式管理** → **初始化後端資料庫 (全套工作表與授權)**。
2. 系統將自動建立並格式化三張標準工作表：
   - `系統設定與授權`：設定學年度、學期、OAuth Client ID 與成員白名單。
   - `正規化課程索引`：儲存 14 欄標準 1NF 課程代碼資料。
   - `系統使用說明`：操作指引與欄位說明。
3. 點選 **開啟 Web App 網頁** 即可取得網頁應用程式開啟連結！

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
3. 系統將自動啟用 `webapp/js/mock.js` 模擬器，提供完整的模擬登入、課程清單瀏覽、檔案上傳與設定儲存操作。

---

## 核心功能說明

### 1. 108 課綱課程代碼 1NF 正規化原理
巨耀等校務系統匯出之原始課綱為 39 欄寬表，單一資料列橫向跨越三年六學期（一上～三下）。本模組處理邏輯如下：
- **前置篩選**：直接剔除 L 欄（`科目屬性`）為 `"0"`（不分屬性，如團體活動時間）或 `"6"`（特殊需求領域）之非實質授課列。
- **1NF 展開**：逐一掃描六個學期之開課學分與時數，僅保留「學分 > 0 或時數 > 0」之學期，展開為獨立紀錄列。
- **中文代碼轉譯**：
  - 群別代碼（如 `23` → 電機與電子群）
  - 科別代碼（如 `305` → 資訊科、`308` → 電機科）
  - 課程類型（如 `1` → 部定必修、`2` → 校訂必修）
  - 科目屬性（如 `1` → 一般科目、`2` → 專業科目、`3` → 實習科目）
  - 必選修（如 `1` → 必修、`2` → 選修）
- **分批寫入防護**：以 5000 筆為一個 chunk 分批寫入試算表，避免單次 `setValues()` 過大導致 GAS 逾時。

### 2. Google Identity Services (GIS) 與 Session 管理
- 前端非同步載入 `https://accounts.google.com/gsi/client`，自動初始化 Client ID 並渲染 Google 登入按鈕。
- 登入成功後，前端取得 ID Token (JWT)，發送至後端 `login` action。
- 後端透過 `https://oauth2.googleapis.com/tokeninfo` 驗證簽章與發行者，取得使用者 Email。
- 首次使用時，**第一位登入之使用者將自動指派為 `admin` 系統管理員**。
- 登入後產生獨立 Session Token，快取於 `CacheService`（預設有效期限 6 小時）。
- 前端以 `text/plain;charset=utf-8` 格式發送 POST 請求，杜絕瀏覽器觸發 GAS 不支援之 CORS OPTIONS 預檢錯誤。

### 3. 多風格視覺設計系統
可在網頁右上角下拉選單即時切換風格，並支援深色／淺色模式記憶（儲存於 LocalStorage）：
- `modern-slate`：極簡曜藍（Slate 冷灰極簡 · 曜藍高對比 · 精緻微陰影）
- `blueprint`：圖紙風格（工程網格底紋 · 冷調科技藍）
- `paper`：紙張風格（人文襯線字型 · 典雅米紙護眼）
- `neobrutalism`：新粗獷主義（粗黑邊框 · 高反差硬投影）
- `claymorphism`：黏土擬物（澎潤大圓角 · 雙層軟陰影）
- `nes`：紅白機像素（8-bit 復古點陣 · 經典任天堂風格）
- `happyhues*`：多款色彩調配盤（曜藍薄荷、海洋湛藍、松石暖金、黑曜暖橘、森林琥珀、午夜蜜桃、薄荷暖陽）

---

## 如何以此範本衍生新專案

1. **擴充資料庫工作表**：
   - 在 `databaseInitializer.js` 的 `initializeDatabaseSheets` 加入新工作表名稱與預設表頭。
2. **新增後端 API Action**：
   - 在 `webApi.js` 的 `routeWebApiAction` 中加入新的 `case`。
   - 若涉及資料寫入，請於頂端 `WEB_API_WRITE_ACTIONS` 陣列註冊該 action 名稱，自動取得 `LockService` 併發寫入保護。
   - 在 `ROLE_PERMISSIONS` 為各角色配置呼叫權限。
3. **擴充前端頁籤與功能模組**：
   - 在 `webapp/js/config.js` 的 `tabs` 陣列新增頁籤項目。
   - 於 `webapp/js/` 建立對應之業務邏輯檔案（如 `reports.js`），並於 `webapp/index.html` 的 `<!-- BUILD:JS -->` 區塊加入 `<script src="js/reports.js"></script>`。
   - 在 `webapp/js/app.js` 的 `render()` 加入新頁籤渲染邏輯。
   - 執行 `npm run build:webapp` 即可重新打包！

---

## 授權

MIT License
