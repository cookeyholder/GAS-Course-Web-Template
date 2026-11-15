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

## 模組職責劃分

### 後端模組（根目錄 `*.js`）
- **`main.js`**: Google 試算表工具列選單入口（`onOpen`），提供「初始化後端資料庫」與彈出視窗「開啟 Web App 網頁」功能。
- **`databaseInitializer.js`**: 試算表資料庫純資料工作表初始化（`系統設定與授權`、`正規化課程索引`、`系統使用說明`），具安全冪等性；處理系統參數讀寫與授權白名單維護，內建首次登入管理員防鎖死機制。
- **`subjectCodeTransformer.js`**: 108 課綱課程代碼對照字典（群別、科別、屬性、必選修）、39 欄寬表展開為 14 欄 1NF 紀錄演算法（剔除屬性 0/6）、5,000 筆分塊批次寫入（Chunking）與分頁檢索函式。
- **`webApi.js`**: Web App HTTP 入口（`doGet`, `doPost`）、避開 CORS OPTIONS 預檢之通訊協議、Google ID Token 驗證、`CacheService` Session 管理（6 小時 TTL）、`LockService` 併發寫入排隊防鎖，以及 `ROLE_PERMISSIONS` 角色權限矩陣。
- **`utilities.js`**: 試算表安全格式化（`safeSetNumberFormat`, `safeApplySheetFontSize`）、無 UI 環境防護（`safeUiAlert`）與通用純工具。

### 前端模組（`webapp/` 目錄）
- **`webapp/index.html`**: 前端骨架樣板，定義 `BUILD:CSS` 與 `BUILD:JS` 注入標記。
- **`webapp/styles.css`**: 多風格 CSS 設計系統（包含極簡曜藍 Modern Slate、圖紙風格 Blueprint、紙張風格 Paper、新粗獷主義 Neo-Brutalism、黏土擬物 Claymorphism、紅白機 NES、Happy Hues 色彩盤）與深淺色模式。
- **`webapp/js/config.js`**: 前端全域參數、導覽頁籤清單（概覽、匯入、課程、設定）與樣式字典。
- **`webapp/js/courseData.js`**: 前端 1NF 正規化同構運算模組（與後端規則一致，供瀏覽器即時預覽統計）。
- **`webapp/js/mock.js`**: 本地離線開發測試 Mock API 模擬器（支援 `?mock=true` 零設定測試）。
- **`webapp/js/api.js`**: REST API 客戶端（統一以 `Content-Type: text/plain;charset=utf-8` 發送 JSON，杜絕 OPTIONS 預檢）。
- **`webapp/js/state.js`**: 響應式狀態容器（State Store）與變更訂閱機制。
- **`webapp/js/ui.js`**: 共用 UI 元件渲染器（Header、Nav、LoginCard、Toast、Modal、主題切換）。
- **`webapp/js/auth.js`**: Google Identity Services (GIS) 登入整合、Session 還原與登出。
- **`webapp/js/imports.js`**: SheetJS Excel 檔案拖曳解析、1NF 展開即時預覽與匯入動作。
- **`webapp/js/courses.js`**: 正規化課程索引清單檢索、多條件篩選與分頁控制。
- **`webapp/js/accounts.js`**: 系統參數設定與授權成員管理介面（RBAC）。
- **`webapp/js/app.js`**: 前端進入點與應用程式生命週期管理。

### 建置與測試
- **`scripts/build-webapp.js`**: 純原生 Node.js 打包腳本，將 `webapp/` 內嵌為根目錄單一 `index.html`。
- **`tests/courseCodeNormalization.test.js`**: 課綱 39 欄展開、屬性 0/6 排除、前後端同構邏輯單元測試。
- **`tests/api.test.js`**: API 路由派發、Session 生命週期與 RBAC 權限矩陣單元測試。
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

---

## 開發指令與日常工作流

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

---

## 測試與變更檢驗標準

任何程式碼或功能變更前與提交前，必須通過以下檢驗標準：
1. **單元測試全數通過**：執行 `npm test`，確認代碼正規化與 API 路由權限無回退（Regression）。
2. **打包驗證無缺漏**：執行 `npm run build:webapp`，確認產生之 `index.html` 內嵌順序正常且無語法錯誤。
3. **離線 Mock 模式相容**：若變更前端介面，需確保開啟 `index.html?mock=true` 能正常運作與渲染。

---

## 提交規範 (Commit Conventions)

請採用繁體中文撰寫符合 Conventional Commits 規範的訊息：
- `feat`: 新增功能或介面模組
- `fix`: 修復錯誤或權限問題
- `docs`: 修改或新增技術手冊文件
- `refactor`: 重構程式碼（不影響外部行為）
- `test`: 新增或調整單元測試
- `chore`: 建置腳本、相依套件或設定檔微調
