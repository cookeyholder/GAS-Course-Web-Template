## Context

本專案為 Google Apps Script 網頁應用程式範本，提供 108 課綱課程代碼解析與 1NF 正規化。目前系統前端兩處具備科別篩選功能：
1. `webapp/js/courses.js`：課程代碼清單搜尋列之科別下拉選單（`#courseSearchDept`）。
2. `webapp/js/imports.js`：檔案匯入預覽表格之動態科別篩選器（`#importDeptFilter`）。

在先前實作中，科別選單依物件預設鍵順序或中文字串 Unicode 碼位排序，未能符合技術型高中行政排課習慣。本設計移植 KSVS 專案之標準科別代碼庫與排序純函式，並修復來源實作在實用技能學程（`A01`）上的正規表示式缺陷與缺少安全回退的問題，提供前後端同構之科別升冪排序能力。

## Goals / Non-Goals

**Goals:**
- **標準代碼庫與前後端同構**：在前後端共用模組 `courseNormalizationShared.js` 納入教育部官方 340 筆標準科別代碼、常見別名與共同科代碼，並透過 `webapp/js/courseData.js` 導出給前端使用，`subjectCodeTransformer.js` 同步引用。
- **四層排序純函式與跨環境穩定性**：實作 `getDepartmentCode`、`getDepartmentSortKey` 與 `compareDepartmentsByCode`，支援教育部 3 碼英數代碼（含 `A01` 實用技能學程）、前置/後置代碼、全半形括號萃取、官方自帶括號反查、別名對照與四層權重排序。Tier 0/1 純英數採原生比對以確保跨環境一致性。
- **全站科別選單全面換裝與安全降級回退**：
  - `webapp/js/courses.js` 依代碼由小到大排序本校科別選項，具備安全回退。
  - `webapp/js/imports.js` 依代碼由小到大排序動態萃取之預覽科別選項，具備安全回退。
- **防禦性測試依賴工廠更新**：同步更新 `tests/helpers/accountsCoursesDeps.js` 與 `tests/helpers/importsUiDeps.js`，避免既有 17 個測試套件產生呼叫例外。
- **維護品質閘門標準**：採用緊湊型字串初始化代碼字典以維持模組 MI $\ge 50$；透過 100% 分支測試防護使所有函式 CRAP $\le 25$。

**Non-Goals:**
- 不變更 `<option>` 元素之 `value`（維持傳遞標準中文科別名稱，如 `"機械科"`，不改為代碼數字）。
- 不擴增課程搜尋選單的預設選項範圍（維持以本校開課常設科別為主，避免塞入數百個無關科別造成同仁認知負擔）。

## Decisions

### 決策 1：教育部代碼字典採用緊湊型字串初始化（Protect Maintainability Index）
- **作法**：
  將 340 筆教育部標準科別代碼以管道符號分隔之緊湊字串儲存（`"000:一般科目|099:其他|101:普通科|...|301:機械科|303:汽車科|...|A01:機械技術學程|..."`），由輕量 IIFE 執行單次字串切割載入記憶體快取。
- **理由**：
  若在 JavaScript 中以物件字面值（Object Literal）宣告 340 個鍵值對，AST 的節點數與運算元（Halstead volume）會急遽膨脹，直接將模組的維護性指數（MI）拉低至 50 門檻以下。緊湊字串解析器圈複雜度僅為 3，能同時滿足 $O(1)$ 查詢效率與維持模組 MI 在 87 以上的高分水準（高於基準線 83.666）。

### 決策 2：四層權重排序鍵（Four-Tier Sort Key）與穩定分層比對
- **排序鍵格式**：
  - **Tier 0（專業群科）**：符合教育部 3 碼標準代碼（數字、英數混合或字母開頭之實用技能學程，格式為 `/^[0-9A-Za-z]{3}$/`，如 `301`, `21B`, `A01`，且存在於教育部或常設科別代碼庫者），賦予前綴 `"0_" + code.toUpperCase()`。在 ASCII 碼位下天然達成 `"0_217" < "0_21B" < "0_301" < "0_929" < "0_A01"`。
  - **Tier 1（共同科目）**：具備共同科別名或代碼（如 國文 `CHI`, 英文 `ENG`）者，賦予前綴 `"1_" + commonCode`。代碼判定順序上，共同科優先於通用英數匹配，防止 `CHI` 等代碼被誤判為 Tier 0。
  - **Tier 2（未知/自訂科別）**：未登錄之名稱賦予前綴 `"2_" + cleanName`，透過正體中文拼音/筆畫排列於其後。
  - **Tier 3（空值置底）**：null、undefined 或空字串賦予排序鍵 `"3_"`，固定置於最底端。
- **穩定分層比對與次級平手決勝機制（Secondary Tie-Breaker）**：
  - 若兩者階層前綴不同（如 `"0_"` vs `"1_"`），直接比較前綴字串。
  - 若兩者皆為 Tier 0 或 Tier 1，因代碼全為純英數字，直接以 JavaScript 原生運算子 `<` 與 `>` 進行極速比對，杜絕舊環境 `localeCompare` 底線符號漂移問題。
  - 僅當兩者皆為 Tier 2 時，才呼叫 `localeCompare(..., "zh-Hant")` 進行正體中文拼音/筆畫自然排序。
  - 當 `keyA === keyB` 時，加入次級平手決勝機制：`String(deptA || "").localeCompare(String(deptB || ""), "zh-Hant")`，確保 Strict Weak Ordering。

### 決策 3：健壯的容錯解析純函式與正規表示式修復
- **修正致命正則缺陷**：
  來源實作（KSVS）之正則 `/^[0-9]{3}$|^[0-9]{2}[A-Za-z]$/` 無法匹配 `A01`～`Y02` 實用技能學程。本專案全面改用通用三碼英數字表示式 `/^[0-9A-Za-z]{3}$/`。
- **入口嚴格型別收斂**：
  函式入口第一行強制收斂型別（`String(deptName).trim()`），防止 Excel 數字（如 `301`）觸發 `.trim is not a function`。
- **解析優先順序**：
  `getDepartmentCode` 依序嘗試：
  1. 3 碼英數代碼直接比對（如傳入 `"301"`、`"21b"`、`"a01"` $\rightarrow$ 回傳 `"301"`, `"21B"`, `"A01"`）。
  2. 前置代碼正則萃取（如 `"(301)機械科"`、`"301 機械科"`、`"[A01]機械技術學程"` $\rightarrow$ 回傳 `"301"`, `"A01"`）。
  3. 後置代碼正則萃取（如 `"機械科(301)"`、`"冷凍空調科（309）"`、`"汽車技術學程(B01)"` $\rightarrow$ 回傳 `"309"`, `"B01"`）。
  4. 括號雜質清除與官方方括號容錯：先以 `replace(/[（(\\[].*?[）)\\]]/g, "").trim()` 得到 `cleanName`；先反查 `DEPARTMENT_ALIASES`、`DEPARTMENT_NAME_TO_CODE[cleanName]`；若查無，再以原始字串 `raw` 反查 `DEPARTMENT_NAME_TO_CODE[raw]`（此機制能精準反查官方教育部代碼庫自帶之方括號科別，如 `21B:不分科[機械群]`）；最後反查 `COMMON_DEPARTMENT_CODES`。

### 決策 4：前端與測試環境之安全降級回退（Graceful Degradation）
- **作法**：
  - 在 `courses.js` 的 `renderDeptOptionsHtml` 中：
    ```javascript
    const compareFn = (MEA.courseData && typeof MEA.courseData.compareDepartmentsByCode === "function")
      ? MEA.courseData.compareDepartmentsByCode
      : function (a, b) { return String(a).localeCompare(String(b), "zh-Hant"); };
    ```
  - 在 `imports.js` 的 `extractPreviewDepartments(rows)` 中，安全嘗試取得全域或注入之比較函式，若未定義則安全回退至正體中文自然排序。
- **理由**：
  防範在單元測試環境、未載入完全之舊版瀏覽器或離線 Mock 環境下因缺少依賴而拋出例外。

## Risks / Trade-offs

- **[風險] `getDepartmentCode` 圈複雜度約 14，若分支覆蓋率不足會導致 CRAP > 25**
  → **緩解措施**：在 `tests/courseNormalizationShared.test.js` 中撰寫 100% 完整分支覆蓋測試，涵蓋純代碼、大小寫、前置括號、後置括號、全形括號、方括號、別名、官方自帶括號反查、共同科、未知科別與空值，確保分支覆蓋率 $\ge 90\%$，使 CRAP 壓制在 15 以下。
- **[風險] 既有 17 個測試套件使用的 Mock 工廠未包含 `compareDepartmentsByCode`**
  → **緩解措施**：在 `tests/helpers/accountsCoursesDeps.js` 與 `tests/helpers/importsUiDeps.js` 中同步注入 `compareDepartmentsByCode`，並配合前端的安全降級回退雙重保險。
- **[風險] 前後端同構測試清單漂移**
  → **緩解措施**：在 Task 1.1 中同步擴充 `tests/courseNormalizationShared.test.js` 與 `tests/courseCodeNormalization.test.js` 之導出清單斷言。
