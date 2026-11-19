## 1. 工作表名稱與遷移

- [x] 1.1 將 `gasRuntime.js` 的 `SHEET_COURSE_INDEX` 改為「正規化課程代碼」，新增並匯出 `LEGACY_SHEET_COURSE_INDEX = "正規化課程索引"`；以 `cleanupSingleSource.test.js` 驗證單一來源一致。
- [x] 1.2 在 `databaseInitializer.js` 的 `ensureCourseIndexSheet_` 加入三段判斷（新表存在直接返回／舊表存在則更名／皆不存在才建立）；以 `databaseInitializerInitializeDatabaseSheets.test.js` 驗證更名、資料不重寫、不入建立清單與重複初始化冪等。
- [x] 1.3 在 `databaseInitializer.js` 匯出 `LEGACY_SHEET_COURSE_INDEX` 並更新模組註解與系統使用說明用詞；以 `npm test` 驗證無回歸。

## 2. 前端文案與術語統一

- [x] 2.1 將 `imports.js` 面板標題改為「課程代碼匯入與 1NF 正規化」，拖曳區 aria-label 與提示改為「選擇或拖曳課程代碼 Excel 檔案」，成功訊息改為「正規化課程代碼」工作表；以 `webappImportsRenderView.test.js`、`webappImportsKeyboard.test.js` 驗證。
- [x] 2.2 將 `config.js` 頁籤說明改為「上傳課程代碼 Excel 並執行 1NF 正規化」，頁籤名稱改為「正規化課程代碼」；以 `npm test` 驗證。
- [x] 2.3 將 `courses.js`、`ui.js`、`mock.js` 中「課程索引」統一改為「課程代碼」；以 `webappCoursesRenderView.test.js` 驗證標題。

## 3. 文件、設定與規格同步

- [x] 3.1 更新 `README.md`、`AGENTS.md`、`package.json`、`docs/*.html` 與現行 `openspec/specs/**` 的用詞；以 `npm run check:lang` 驗證臺灣繁體中文與用語規範。
- [x] 3.2 保留英文識別碼與封存歷史紀錄；以 `grep` 確認僅剩 `LEGACY_SHEET_COURSE_INDEX` 與封存檔案含舊工作表名稱。
- [x] 3.3 執行 `npm run build:webapp` 重建 `index.html`，並以連續兩次建置雜湊相同驗證一致性。

## 4. 全量驗證

- [x] 4.1 執行 `npm test`（97 個測試檔）、`npm run format:check`、`npm run check:lang`、`npm run check:ui-classes`、`npm run check:contrast`、`npm run check:a11y` 全數通過。
- [x] 4.2 執行 `npm run test:coverage`、`npm run check:coverage`、`npm run check:changed-coverage`（Lines 96.95%、Branches 91.26%）、`npm run check:complexity`（CRAP > 30 數 0、MI 最低 84.12）全數通過。
- [x] 4.3 執行 `openspec validate rename-course-code-terminology --strict` 通過，4/4 artifacts 完成。
