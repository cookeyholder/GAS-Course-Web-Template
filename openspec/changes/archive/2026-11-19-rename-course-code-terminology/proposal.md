## Why

使用者回饋前端與文件中「課綱代碼匯入」「課程索引」用詞不一致，且工作表實體名稱「正規化課程索引」與功能標題「課程代碼匯入」不吻合。為統一專業術語並讓工作表名稱反映實際內容（14 欄 1NF 課程代碼），需要一次性更名並處理既有試算表的資料相容性。

## What Changes

- **BREAKING**：工作表名稱由「正規化課程索引」變更為「正規化課程代碼」；既有試算表在初始化時自動更名，保留原有資料。
- 前端功能標題「108 課綱課程代碼匯入與 1NF 正規化」改為「課程代碼匯入與 1NF 正規化」；拖曳區 aria-label 與提示同步改為「課程代碼 Excel」。
- 頁籤說明「上傳課綱 Excel」改為「上傳課程代碼 Excel」；「正規化課程索引」頁籤與清單標題改為「正規化課程代碼」。
- 其餘使用者可見文案、註解、技術文件、README／AGENTS 與現行規格中的「課程索引」統一改為「課程代碼」。
- 英文識別碼（`SHEET_COURSE_INDEX`、`COURSE_INDEX_WRITE_CHUNK_SIZE`）與封存的 OpenSpec 歷史紀錄維持原樣，避免不必要的相容風險。
- `gasRuntime.js` 新增 `LEGACY_SHEET_COURSE_INDEX` 常數，`databaseInitializer.js` 於初始化時執行一次性更名遷移。

## Capabilities

### New Capabilities

無。

### Modified Capabilities

- `maintainability-and-shared-logic`：新增工作表名稱更名遷移需求，規範初始化時以舊名稱更名取代重建，且不得重寫既有資料、重複初始化須保持冪等。

## Impact

- 後端：`gasRuntime.js`（新舊工作表名稱常數）、`databaseInitializer.js`（初始化遷移）、`subjectCodeTransformer.js`（註解）。
- 前端：`webapp/js/config.js`、`imports.js`、`courses.js`、`ui.js`、`mock.js` 與建置產物 `index.html`。
- 文件與測試：`README.md`、`AGENTS.md`、`package.json`、`docs/*.html`、現行 `openspec/specs/**`、相關 `tests/*.test.js`。
- 資料相容性：既有試算表須執行「初始化資料庫工作表」才能完成更名；未初始化前查詢會找不到新工作表。
