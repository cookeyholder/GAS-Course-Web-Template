## Why

目前系統中各功能頁面之「科別」下拉選單（包含「課程代碼清單」的科別搜尋選單與「匯入課程代碼」預覽表格的科別篩選器），其科別選項之排序方式未依科別代碼排序（課程頁依 JavaScript 物件鍵、匯入預覽依中文字串 Unicode 碼位排序）。

依據技術型高級中等學校行政作業習慣與教育部 108 課綱規範，各專業科別皆具備教育部核定之標準三碼科別代碼（例如 301 機械科、303 汽車科、305 資訊科、309 冷凍空調科、321 電機空調科、374 電腦機械製圖科，以及 A01 機械技術學程、B01 汽車技術學程 等實用技能學程）。行政主管與教學組同仁在檢索與檢視資料時，慣以教育部科別代碼由小到大順序進行查找。將科別下拉選單統一為「依科別代碼由小到大排序」，能有效降低同仁檢索負擔，提升排課與資料核對效率。

## What Changes

- **建立教育部標準科別代碼庫與別名對照表（`courseNormalizationShared.js`）**：
  - 納入教育部 108 課綱官方核定之標準科別代碼庫（`MINISTRY_DEPARTMENT_CODE_NAMES`，涵蓋普通與特教、農業群、工業群、商業管理群、家政群、海事水產群、藝術群、實用技能學程等 340 個標準科別代碼）。為維護模組可維護性指數（MI $\ge 50$），代碼字典採用緊湊型字串初始化結構。
  - 保留本校常設專業科別字典（`DEPARTMENT_CODE_NAMES`），使一般課程檢索之預設科別選單聚焦於本校開課範圍。
  - 建立常見科別別名池（`DEPARTMENT_ALIASES`，如「冷凍科」$\rightarrow$ 309、「空調科」$\rightarrow$ 321、「機圖科/製圖科」$\rightarrow$ 374、「圖傳科/圖巧科」$\rightarrow$ 373），防止簡寫被誤判為未知科別。
  - 建立共同科目科別代碼對照表（`COMMON_DEPARTMENT_CODES`，如 國文: CHI、英文: ENG、數學: MAT 等）。
- **實作前後端同構之四層排序鍵與科別排序純函式**：
  - 在 `courseNormalizationShared.js` 與 `webapp/js/courseData.js` 中導出 `getDepartmentCode(deptName)`、`getDepartmentSortKey(deptName)` 與 `compareDepartmentsByCode(deptA, deptB)` 純函式。
  - 完整支援 3 碼標準英數代碼（`/^[0-9A-Za-z]{3}$/`），包含純數字（`301`）、英數混合（`21B`）與字母開頭之實用技能學程（`A01`～`Y02`）。
  - 四層排序權重演算法：
    1. Tier 0：專業群科標準代碼由小到大排在最前（前綴 `"0_" + code.toUpperCase()`）；
    2. Tier 1：共同科次之（前綴 `"1_" + commonCode`）；
    3. Tier 2：未登錄之未知科別置於其後並以正體中文拼音/筆畫自然比對（前綴 `"2_" + cleanName`）；
    4. Tier 3：空值、null、undefined 或無效值排在最底端（前綴 `"3_"`）。
  - 支援前置/後置代碼萃取、全形半形括號過濾，以及官方自帶方括號科別（如 `21B:不分科[機械群]`）之 `raw` 原樣反查機制。
  - 比較純函式採分層比較：Tier 0/1 純英數採原生比對以確保跨環境一致性；Tier 2 才呼叫 `localeCompare(..., "zh-Hant")`。
- **全站科別下拉選單換裝與安全降級回退（Graceful Degradation）**：
  1. **課程代碼清單搜尋選單（`webapp/js/courses.js`）**：`renderDeptOptionsHtml` 改依 `compareDepartmentsByCode` 由小到大排序科別選項，具備安全回退墊片防止依賴遺失，`<option>` 的 `value` 維持標準科別名稱不變。
  2. **匯入預覽表格科別篩選器（`webapp/js/imports.js`）**：`extractPreviewDepartments` 改以 `compareDepartmentsByCode` 由小到大排序動態萃取之科別選項清單，亦具備安全回退墊片。
- **更新測試依賴工廠與補齊高覆蓋單元測試**：
  - 更新 `tests/helpers/accountsCoursesDeps.js` 與 `tests/helpers/importsUiDeps.js`，補齊 `compareDepartmentsByCode` 依賴。
  - 擴充 `tests/courseNormalizationShared.test.js` 與 `tests/courseCodeNormalization.test.js`，達成 100% 分支覆蓋率，確保 CRAP $\le 25$。
  - 擴充前端選單渲染測試與無障礙契約檢驗。

## Capabilities

### New Capabilities
無新增獨立能力。

### Modified Capabilities
- `frontend-rendering-and-accessibility`: 擴充「Requirement: 科別下拉選單選項依科別代碼由小到大排序」，規範全系統各處科別下拉選單之四層排序鍵演算法、代碼映射、別名正規化、實用技能學程支援、空值置底與安全降級回退規則。

## Impact

- **共用模組**：`courseNormalizationShared.js`（新增教育部代碼、別名字典與排序純函式）。
- **後端模組**：`subjectCodeTransformer.js`（同步引用共用模組新匯出常數與函式）。
- **前端模組**：
  - `webapp/js/courseData.js`（導出科別代碼查詢與比較器純函式）。
  - `webapp/js/courses.js`（更新 `renderDeptOptionsHtml` 依代碼排序並具備回退防護）。
  - `webapp/js/imports.js`（更新 `extractPreviewDepartments` 依代碼排序並具備回退防護）。
- **測試輔助模組**：`tests/helpers/accountsCoursesDeps.js`、`tests/helpers/importsUiDeps.js`（補齊排序函式依賴）。
- **向後相容性**：完全向後相容。`<option>` 元素之 `value` 與文字內容維持為科別中文名稱，不影響篩選 API 傳遞與 state 儲存。
- **品質指標維護**：採用緊湊型字串初始化代碼庫，確保模組 MI $\ge 50$；透過 100% 分支測試防護使所有函式 CRAP $\le 25$。
