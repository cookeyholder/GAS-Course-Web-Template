## ADDED Requirements

### Requirement: 分页查询延迟映射
`getNormalizedCourses` 搜尋與篩選 MUST 先作用於原始列索引，再僅將分頁範圍內的資料列映射為 14 欄物件。系統不得為了回傳單頁資料而對整張工作表的所有列建立物件。

#### Scenario: 大量資料僅映射當頁
- **WHEN** 工作表含 100,000 筆 1NF 紀錄且請求第 1 頁、每頁 30 筆
- **THEN** 後端僅對 30 筆呼叫 `mapCourseIndexRow_`，回傳 total 與 totalPages 仍反映完整筆數

#### Scenario: 篩選結果為空
- **WHEN** 關鍵字沒有任何符合紀錄
- **THEN** 回傳空 list、total 0、totalPages 1，且不映射任何列

### Requirement: 輕量統計 API 與前端請求去重
後端 MUST 提供 `getCourseIndexStats` action，只回傳總筆數，不讀取或映射完整內容。前端概覽頁 MUST 使用該 action 顯示總筆數；課程清單 MUST 在使用者進入課程分頁時才載入，且相同查詢參數的並行請求 MUST 以 in-flight Promise 去重。

#### Scenario: 概覽頁不觸發完整查詢
- **WHEN** 使用者登入後停留在概覽頁
- **THEN** 前端只呼叫 `getCourseIndexStats`，不呼叫 `getCourseIndex`

#### Scenario: 相同參數並行請求只送出一次
- **WHEN** 短時間內兩次以相同篩選條件請求課程清單
- **THEN** 實際只送出一次 API 呼叫，兩邊 Promise 取得相同結果

### Requirement: 展開邏輯常數因子最佳化
`expandCourseRow`（後端）與 `courseData.js`（前端）MUST 在 6 個學期迴圈之外計算只與列相關的欄位（課程代碼、科目名稱、群別、科別、課程類別、科目屬性、必選修），迴圈內直接引用計算結果。兩端實作 MUST 保持同構。

#### Scenario: 每個學期重複欄位只計算一次
- **WHEN** 單一來源列展開為最多 6 筆 1NF 紀錄
- **THEN** 與學期無關的欄位只被轉譯一次，且前後端展開結果完全相同

### Requirement: 格式化範圍限縮
`writeCourseIndexHeaderAndFormat_` 與 `finalizeCourseIndexSheet_` MUST 只對實際寫入的資料範圍設定純文字格式與字型大小，不得使用 `getMaxRows()` 將歷史空列納入範圍。表頭 Range 呼叫 MUST 合併。

#### Scenario: 少量匯入不格式化歷史空列
- **WHEN** 工作表先前曾匯入 60,000 筆，本次僅匯入 10 筆
- **THEN** 格式化範圍僅涵蓋表頭加 10 筆資料，不涵蓋其餘空列

### Requirement: Excel 單次解析
`pickCourseSheetRows` MUST 對每個工作表只呼叫一次 `XLSX.utils.sheet_to_json`，並快取結果供特色表頭比對與退回邏輯使用。找不到特色表頭時 MUST 不重複解析同一工作表。

#### Scenario: 找不到特色表頭時不重複解析
- **WHEN** 上傳活頁簿的所有工作表都不符合課綱表頭特徵
- **THEN** 每個工作表的 `sheet_to_json` 恰好被呼叫一次

### Requirement: 寫入 payload 冪等與上限
大型匯入 payload MUST 有明確大小上限；`lock_timeout` 與 `network_error` 的重試 MUST 加入 jitter 與總重試時間上限，且不得對大型匯入自動重試。後端 MUST 支援以 `importId` 做冪等鍵，重複請求直接回傳前次結果而不重寫。

#### Scenario: 大型匯入不自動重試
- **WHEN** 匯入請求收到 `lock_timeout`
- **THEN** 前端不自動重送大型 payload，改提示使用者明確重試

#### Scenario: 相同 importId 不重複寫入
- **WHEN** 同一 `importId` 的請求因回應遺失而重送
- **THEN** 後端回傳前次結果，不執行第二次清除與寫入
