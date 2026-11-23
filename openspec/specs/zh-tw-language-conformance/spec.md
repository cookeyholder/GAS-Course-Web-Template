# zh-tw-language-conformance Specification
## Purpose

本能力提供有別於既有硬閘門的臺灣繁體用語合規輔助：以官方 OpenCC 的 `s2tw` 差異**定位真正的簡體字**、以 `s2twp` 與專案對照表**對已定位候選提供多來源建議**、由人工判斷上下文挑選合適詞彙，保護專案資料契約字面值、記錄核准與掃描證據，並確保 CI 只回報不取代、工具失敗時不影響原有檢查流程。候選工具僅處理 `s2tw` 可定位的簡體字；既有由正體字組成的中國用語違規（例如 `\u652f\u6301`、`\u914d\u7f6e`、`\u53bb\u91cd`、`\u54c8\u5e0c`）仍由硬閘門回報並由人工修正，不納入 OpenCC 候選範圍，且 CI 構件檢查須標示此類「有違規但無候選」情境以避免假保險。

## Requirements
### Requirement: 官方 OpenCC 套件來源可追溯且僅限 Node 工具鏈

語言工具 SHALL 使用官方 OpenCC 的 `s2tw.json` 做為**候選定位來源**、`s2twp.json` 做為**慣用語建議來源**，並記錄套件名稱、版本、兩份設定檔與適用環境中繼資料。`s2twp` MUST NOT 單獨產生候選。套件 MUST 僅做為開發用相依，不得進入 GAS 後端執行環境、前端打包產物或執行期網路下載；其版本、授權與來源 SHALL 有版控文件可供查閱。套件版本 MUST 精確鎖定為 `1.4.2`，`@babel/parser` MUST 精確鎖定為 `7.29.15`，不得使用插入符號或波浪符號範圍。工具 SHALL 在 Node 24 可載入，且 CI SHALL 執行非阻斷可用性 smoke `node scripts/openccS2twp.js --smoke`：僅當 `s2tw`／`s2twp` 黃金案例輸出正確且版本相符時回成功結束碼。

#### Scenario: 來源與中繼資料可查閱
- **WHEN** 開發者查閱來源註記文件或呼叫中繼資料查詢
- **THEN** 可取得套件名稱 `opencc`、精確版本 `1.4.2`、定位設定 `s2tw.json`、建議設定 `s2twp.json`、授權 Apache-2.0、僅限 Node 工具鏈的標記與 Node 24 實測記錄

#### Scenario: 解析器版本可查閱
- **WHEN** 查閱相依版本或執行版本驗證
- **THEN** 可取得 `@babel/parser` 精確版本 `7.29.15`，且驗證 `require("@babel/parser/package.json").version === "7.29.15"`

#### Scenario: 不進入部署產物
- **WHEN** 執行前端打包或 GAS 推送
- **THEN** OpenCC 原生二進位與其 JavaScript 封裝不會出現在 `index.html` 或上傳至 Apps Script 的檔案集合中

#### Scenario: 可用性檢查為非阻斷
- **WHEN** 執行 `node scripts/openccS2twp.js --smoke` 失敗
- **THEN** 失敗被明確記錄，但既有強制閘門的通過與否不受影響

### Requirement: 既有硬閘門契約向後相容

新增能力 MUST 與既有 `npm run check:lang` 完全共存，不得改變其違規判定來源、違規輸出格式、行內豁免標記或結束碼。OpenCC 差異 SHALL 只產生候選建議，不得單獨造成硬閘門違規；既有排除規則與禁用詞表亦 MUST 維持不變，唯一例外是將本變更新增的 `artifacts/` 加入排除（採現行 basename 比對，可接受同名子目錄一併排除，並以測試鎖定）。既有硬閘門 SHALL 繼續納入 `openspec/` 與 `docs/參考資料/` 掃描。`language:check` SHALL 等同 `--dry-run`，不得被誤解為取代 `check:lang`，亦不得自動合併報告模式。「零違規僅為向後相容錨點」的語意 SHALL 記載於 `README.md` 與 `AGENTS.md`，不得寫入 `check:lang` 的標準輸出。

#### Scenario: 既有入口維持原行為
- **WHEN** 執行 `npm run check:lang`
- **THEN** 違規仍只由既有簡體字集與中國用語表觸發，輸出格式與結束碼與移植前完全一致

#### Scenario: 慣用語差異不誤報為違規
- **WHEN** 原始碼含「權限」「實例」「設備組」「高級工業職業學校」等 `s2twp` 會誤改的臺灣慣用語
- **THEN** 既有硬閘門不產生違規；因 `s2tw` 對這些正體字不產生差異，這些位置亦不產生候選

#### Scenario: 未收錄簡體字僅列候選
- **WHEN** 原始碼含既有精簡字集未收錄的簡體字（例如 `\u4ec5`）
- **THEN** 硬閘門不因而紅燈，該位置由 `s2tw` 差異定位為候選，再由 `s2tw`／`s2twp`／專案對照表提供建議供人工挑選

#### Scenario: 錨點語意記載於文件
- **WHEN** 開發者查閱 `README.md` 或 `AGENTS.md`
- **THEN** 文件明確說明零違規僅代表向後相容錨點而非完整合規，且 `check:lang` 輸出不受此說明影響

#### Scenario: 產生報告不污染硬閘門
- **WHEN** 先製造一項違規、產生結構化報告、再執行硬閘門
- **THEN** 硬閘門違規數與產生報告前完全相同，`artifacts/` 內檔案不被掃描

### Requirement: 語言分析核心為可度量之純函式

穩定 ID 計算、候選比對與分層、受保護詞彙遮蔽與還原、文字差異比對、授權狀態判定與契約漂移比對 SHALL 由無副作用的純函式提供，相同輸入 MUST 產生相同輸出且不修改傳入引數。原生套件呼叫、檔案讀寫、命令列解析與報告寫入 MUST 隔離於外層。核心 SHALL 納入覆蓋率、CRAP、MI 與變更覆蓋率的量測範圍；既有基準所記錄的歷史地板（`miMin >= 83.666`、`crapMax <= 30`）MUST 視為不可變常數，不得下修以通過檢查。

#### Scenario: 核心出現在品質量測報告
- **WHEN** 執行覆蓋率與複雜度量測
- **THEN** 分析核心的純函式檔案出現在量測範圍，且符合專案的 CRAP 與 MI 門檻

#### Scenario: 變更覆蓋率正確納管核心
- **WHEN** 變更的核心模組含有未測試的新增行或分支
- **THEN** 變更覆蓋率檢查將其視為可量測變更並依門檻判定，不得因範圍判定遺漏而略過

#### Scenario: 歷史地板不被下修
- **WHEN** 量測結果低於既有基準所記錄的歷史地板
- **THEN** 先補測試或重構程式碼，不得放寬門檻或下修地板以通過檢查

#### Scenario: 核心不被上傳至 GAS
- **WHEN** 執行 GAS 推送或檢查忽略規則
- **THEN** 核心純函式目錄被排除於上傳集合之外

### Requirement: s2tw 定位與多來源建議標記

候選**存在與位置** SHALL 由 `s2tw` 差異決定：僅當原文含真正的簡體字時才產生候選；`s2twp` 差異 MUST NOT 單獨建立候選，且其建議 SHALL 僅附加在 `s2tw` 已定位的候選上，純正體慣用語因 `s2tw` 無差異而不產生候選。由正體字組成的既有中國用語違規（例如 `\u652f\u6301`、`\u914d\u7f6e`、`\u53bb\u91cd`、`\u54c8\u5e0c`）不屬候選工具範圍，仍由硬閘門回報並由人工修正。每個候選 SHALL 提供 `suggestionOptions` 陣列，逐項列出 `{ source, text }`，來源值域為 `S2TW`（字級）、`S2TWP`（臺灣慣用語）與 `MAINLAND_TERMS`（專案對照表）；`suggestion` 與 `suggestionSource` 代表目前預設選項，因候選必由 `s2tw` 差異定位，故預設 MUST 為 `S2TW` 的字級建議（最保守、不帶片語推測）。`original` 粒度 SHALL 依下列規則：候選命中既有硬違規詞時取該違規詞的完整字面，否則取 `s2tw` 差異的最小替換單元；此規則僅適用於同時命中 `s2tw` 差異者，由正體字組成的違規因不產生候選而不適用，且 SHALL 先決定 `original` 再進行最長優先重疊合併。`rule` 獨立判定：該位置命中既有硬閘門違規時為 `HARD`，否則為 `S2TWP`。所有建議 SHALL 由人工判斷上下文挑選，工具 MUST NOT 自動套用 `S2TWP` 或 `MAINLAND_TERMS` 建議。

#### Scenario: 正體字不產生候選
- **WHEN** 原文為繁體「項目」「數據」「課程代碼」「權限」，或含「報告項目」等正體片語
- **THEN** `s2tw` 轉換結果與原文相同，該位置不產生候選；即使 `s2twp` 會誤改為「專案」「資料」「課程程式碼」「許可權」，亦不得據此建立候選

#### Scenario: 簡體字由 s2tw 定位
- **WHEN** 原文含 `\u9879\u76ee` 或 `\u6743\u9650`
- **THEN** `s2tw` 差異定位該簡體字並產生候選，`original` 命中硬違規詞時取該詞完整字面、否則取最小替換單元，`s2twp` 差異不得獨立建立新候選

#### Scenario: original 粒度規則明確
- **WHEN** `\u9879\u76ee` 命中硬違規詞「`\u9879\u76ee`→專案」，而 `\u4ec5` 僅命中 `s2tw` 字級差異
- **THEN** 前者 `original` 為完整詞 `\u9879\u76ee`，後者 `original` 為最小替換單元 `\u4ec5`；ID 與 `occurrenceIndex` 鍵皆以該 `original` 計算

#### Scenario: 純正體慣用語不產生 s2twp 建議
- **WHEN** 原文為繁體「鼠標」，`s2twp` 可轉換為「滑鼠」
- **THEN** `s2tw` 對「鼠標」無差異，故不產生候選、也不附帶 `S2TWP` 的「滑鼠」建議；工具文件與報告 meta 不得宣稱可自動處理純正體慣用語，此類詞須由人工直接判斷

#### Scenario: 正體違規詞由硬閘門負責而非候選工具
- **WHEN** 原始碼含 `\u652f\u6301`、`\u914d\u7f6e`、`\u53bb\u91cd`、`\u54c8\u5e0c` 等由正體字組成的中國用語違規
- **THEN** `s2tw` 對其無差異，不產生候選；既有硬閘門仍回報違規並計入 `violationCount`，須人工修正；CI 構件檢查在 `violationCount > 0`、`candidateCount = 0` 且 `degraded` 為 false 時輸出警告，文案以「有違規但零候選須警告」場景之完整字串為單一來源（降級造成零候選時改由降級警告單獨處理）；「候選全數受保護」與「候選全數豁免」僅在 `candidateCount > 0` 時由獨立警告處理，不判定為「有效但無候選證據」

#### Scenario: 建議選項完整呈現
- **WHEN** 候選 `original` 為 `\u9879\u76ee`
- **THEN** `suggestionOptions` 至少含 `S2TW` 的「項目」、`S2TWP` 的「專案」與 `MAINLAND_TERMS` 的「專案」；`suggestion` 預設為「項目」且 `suggestionSource` 為 `S2TW`

#### Scenario: 人工挑選後才寫入
- **WHEN** 核閱者判斷上下文後選用 `S2TWP` 的「專案」
- **THEN** 該選擇 MUST 經 `--approve` 明確記錄於核准清冊，未被核准前 `--fix` 保留原文；工具不得因該選項來自 `S2TWP` 或 `MAINLAND_TERMS` 而自動套用

#### Scenario: CI 只判斷不取代
- **WHEN** CI 執行語言報告與構件檢查
- **THEN** 僅回報簡體字出現位置與建議選項，絕不呼叫 `--fix` 或寫入任何原始檔；候選數改變不影響硬閘門結果

#### Scenario: 重疊候選合併
- **WHEN** 同一行出現「取得」「取得請求」「請求」等重疊命中
- **THEN** 僅保留最長的替換單元，較短者不再單獨輸出；合併後沿用保留候選的 `rule` 與 `suggestionSource`，其 `suggestionOptions` 亦以保留候選為準，較短候選的來源不另行合併

### Requirement: 內容定址核准清冊契約

核准清冊 SHALL 以 `file`、`original`、`contextHash`、`occurrenceIndex` 四個欄位依序以 `\0` 分隔串接，取 SHA-256 前 16 碼做為識別碼，且 MUST NOT 包含行號、欄位偏移或 `suggestion` 做為識別輸入；候選身份即「簡體字出現的位置」，替換詞彙則由核准紀錄另行綁定。`--fix` 必須保留報告舊識別碼，並以單一授權純函式計算 `approvalState`；序列化與解碼流程由場景規範。

#### Scenario: 內容定址欄位定義
- **WHEN** 計算候選或核准紀錄的識別碼
- **THEN** `contextHash` 為替換處所在行前後各 24 個 UTF-16 程式碼單元上下文（不跨行；不足處以空字串補齊，仍以 `\0` 分隔前後上下文）後取 SHA-256 前 16 碼；`occurrenceIndex` 為同一檔案內以 `file\0original` 為鍵，由左至右、由上至下從零起算的序號；`column` 為相對行首、從零起算的 UTF-16 程式碼單元位置；靠行首與靠行尾的候選 SHALL 分別有測試鎖定其上下文取值

#### Scenario: occurrenceIndex 鍵語意明確
- **WHEN** 同一檔案出現相同 `original` 的多個候選，且核閱者對不同位置的候選挑選不同建議
- **THEN** 相同 `original` 依 `occurrenceIndex` 產生不同 ID，可分別核准不同建議；`file\0original` 僅做為序號計數鍵，不做為候選身份，故不造成語意合併；端到端測試中對同一候選先後核准不同建議屬覆寫同一 ID，與此鍵無衝突；工具為本機單一執行，不另處理併發寫入競態；README 與 AGENTS.md SHALL 明文禁止同時執行多個 `--approve`／`--revoke`／`--fix`，避免後寫入者以舊快照覆蓋清冊使已撤銷核准復活；替代做法為由 PR 核閱流程序列化核准變更，並以序列化情境測試鎖定「撤銷後再核准不得復活已撤銷 ID」

#### Scenario: 核准後原文與建議皆相符才授權寫入
- **WHEN** 候選識別碼存在於核准清冊且原文、上下文與所選建議相符
- **THEN** 該候選被判定為授權寫入，且寫入內容為核准紀錄的 `suggestion` 與 `suggestionSource`，不是報告預設建議

#### Scenario: 所選建議不再是有效選項
- **WHEN** 核准紀錄的 `suggestionSource` 與 `suggestion` 無法在目前候選的 `suggestionOptions` 中找到完全相符的選項
- **THEN** 該候選回 `ORIGINAL_MISMATCH`，不寫入，並要求重新核准

#### Scenario: 欄位邊界不碰撞
- **WHEN** 兩組欄位在未分隔串接時會產生相同字串
- **THEN** 因 `\0` 分隔符而使兩者識別碼不同

#### Scenario: 含分隔符的欄位值視為無效
- **WHEN** 核准紀錄或候選的任一識別欄位值本身含 `\0` 字元
- **THEN** 該紀錄被標記為 `INVALID_RECORD` 而不參與授權判斷，候選不得寫入

#### Scenario: 原文或上下文變動即失效
- **WHEN** 原文或上下文雜湊改變導致重新計算的識別碼與清冊不符
- **THEN** 該候選被標記為 `ORIGINAL_MISMATCH`（原文或上下文已變動），核准失效且不寫入

#### Scenario: 行號漂移不影響核准
- **WHEN** 檔案其他位置新增行造成候選行號與欄位改變，但內容與上下文不變
- **THEN** 既有核准仍然有效

#### Scenario: 同行格式化或同字面值插入使核准失效
- **WHEN** 候選所在行被重新格式化，或前方插入相同原文與建議的候選
- **THEN** `contextHash` 或 `occurrenceIndex` 改變使目前 `id` 改變，既有核准失效；即使 `reportedId` 命中舊紀錄，仍因四欄位不一致回 `ORIGINAL_MISMATCH` 且不得寫入；報告的 `approvalState` 標示失效狀態且 `approvalReason` 說明原因

#### Scenario: 舊識別碼為否決導向欄位
- **WHEN** `--fix` 從報告載入候選，或報告產生階段查核核准清冊
- **THEN** 從報告載入候選時，`candidateFromReportEntry()` MUST 保留報告項目的 `id` 為 `reportedId` 不得覆蓋，並另行計算目前 `id`；`reportedId` **不得做為正向授權來源**，但 **MUST 被查詢** 做為衝突與失效診斷：單獨不足以授權寫入，但足以否決目前 `id` 的授權。`authorizeCandidate()` 僅以目前 `id` 判定正向授權，另查 `reportedId` 舊紀錄做為否決與診斷，此函式為 `buildReportData()` 與 `--fix` 共用的單一計算點

#### Scenario: 報告欄位非授權來源
- **WHEN** `--fix` 從報告載入候選，且報告項目的 `approvalState` 遭竄改為 `AUTHORIZED`，或 `suggestion`／`suggestionSource` 遭竄改
- **THEN** 報告僅提供 `reportedId` 與定位欄位；`approvalState`、`approvalReason`、`suggestion` 與 `suggestionSource` MUST 全部由目前分析與核准清冊重新計算，不得採用報告值；遭竄改的報告不得使未核准候選寫入

#### Scenario: 穩定 ID 驗證語意明確
- **WHEN** 呼叫 `isStableIdValid(id, registryEntryFields)` 判定任一核准紀錄的識別碼
- **THEN** 其簽名為 `isStableIdValid(id, registryEntryFields)`，定義為「識別碼為 16 碼十六進位字串，且傳入的核准紀錄四個識別欄位皆不含 `\0`」**並且**「以目前 `computeStableId()` 重新計算**該核准紀錄自身四欄位**所得結果與該識別碼完全相等」；重算主語必須是核准紀錄自身欄位，**不得使用目前候選欄位**，否則同行格式化或前方插入相同字面值時會先回 `INVALID_RECORD`，使 `ORIGINAL_MISMATCH` 路徑再次不可達。兩條件皆成立才算有效

#### Scenario: 候選欄位改變但紀錄未變仍走原文比對
- **WHEN** 核准紀錄自身四欄位未變且 ID 自洽，但候選四欄位因同行格式化或前方插入相同字面值而改變
- **THEN** `isStableIdValid(reportedId, 舊紀錄自身四欄位)` 仍為真，不回 `INVALID_RECORD`；接續四欄位比對發現與候選不同，回 `ORIGINAL_MISMATCH` 且不得寫入

#### Scenario: 授權四態決策表與 protected/exempt 否決
- **WHEN** `authorizeCandidate()` 判定任一候選
- **THEN** 先執行步驟⓪分隔符守門：候選或命中紀錄的任一識別欄位（`file`／`original`／`contextHash`／`occurrenceIndex`）含 `\0` 時立即回 `INVALID_RECORD`，不進入後續判定；候選本身含 `\0` 時即使未命中清冊亦回 `INVALID_RECORD` 而非 `UNAPPROVED`。通過分隔符守門後執行步驟⓪-a 否決：候選 `protected` 為真 → 回 `UNAPPROVED` 且 `approvalReason` 為 `PROTECTED_BY_ORIGINAL`；候選 `exempt` 為真 → 回 `UNAPPROVED` 且 `approvalReason` 為 `EXEMPT_BY_POLICY`（`protected` 優先於 `exempt`）；兩者皆不得寫入。此否決與核准清冊無關，即使該候選已有有效核准紀錄亦不授予寫入權限，報告 `approvalState` 須如實反映否決態，避免報告顯示 `AUTHORIZED` 而 `--fix` 不寫入，或誤以「通過 `authorizeCandidate()`」做為唯一寫入條件而寫入受保護候選。接著依序執行：① 目前 `id` 命中清冊：`isStableIdValid(id, 核准紀錄自身四欄位)` 為假 → `INVALID_RECORD`（依下述診斷判準標註）；核准紀錄四欄位與候選四欄位逐一比對不符 → `INVALID_RECORD`（遭竄改）；核准建議存在於目前 `suggestionOptions` → `AUTHORIZED`；核准建議不存在於目前 `suggestionOptions`（建議選項漂移）→ `ORIGINAL_MISMATCH`。若 `reportedId` 存在且與目前 `id` 不同，先驗證 `reportedId` 舊紀錄四欄位與目前候選逐一相符，不符 → `ORIGINAL_MISMATCH`；相符且其核准建議與目前 `id` 紀錄的核准建議不同 → `ORIGINAL_MISMATCH` 並要求重新核准，建議相同則依目前 `id` 紀錄判定。② 目前 `id` 未命中且 `reportedId` 不存在 → `UNAPPROVED`。③ 目前 `id` 未命中且 `reportedId` 存在：`reportedId` 舊紀錄不存在 → `UNAPPROVED`；舊紀錄 `isStableIdValid(reportedId, 舊紀錄自身四欄位)` 為真但四欄位與目前候選不同 → `ORIGINAL_MISMATCH`（含同行格式化改變 `contextHash`、前方插入相同字面值改變 `occurrenceIndex`）；該驗證為假 → `INVALID_RECORD` 且不得寫入，診斷判準為「舊紀錄四欄位與目前候選四欄位完全相同 → `ID_ALGORITHM_CHANGED`（工具版本升級使舊 ID 無法通過目前演算法驗證）；任一欄位不同 → `APPROVAL_TAMPERED`（欄位遭竄改）」。診斷在 `authorizeCandidate()` 判定，載入清冊時僅標記無效不決定診斷代碼，以確保兩碼可區隔且皆非 fail-open。工具版本升級與竄改皆禁止寫入並要求重新核准；`reportedId` 在任何情況下皆不授予寫入權限；`\0` 守門與 `protected`／`exempt` 否決皆優先於①②③，杜絕含分隔符且 ID 自洽的紀錄或受保護候選取得授權

#### Scenario: reportedId 不使核准復活
- **WHEN** 目前 `id` 未命中、`reportedId` 命中舊紀錄，且 `file`／`original`／`contextHash`／`occurrenceIndex` 任一因同行格式化、前方插入相同字面值或檔案竄改而不同
- **THEN** 舊紀錄 ID 自洽時回 `ORIGINAL_MISMATCH` 且不得寫入；若差異來自工具版本升級使舊 ID 驗證失敗，則回 `INVALID_RECORD` 且診斷標註 `ID_ALGORITHM_CHANGED`；若舊紀錄欄位本身遭竄改則回 `INVALID_RECORD` 且診斷標註 `APPROVAL_TAMPERED`。三者同樣不得寫入並要求重新核准。`reportedId` 僅做為否決與診斷，不提供任何寫入授權，杜絕核准因格式化、竄改或工具升級而復活

#### Scenario: 目前 id 與 reportedId 指向不同建議時重新核准
- **WHEN** 目前 `id` 命中清冊，`reportedId` 存在且不同
- **THEN** 先驗證 `reportedId` 舊紀錄四欄位與目前候選逐一相符，不符即回 `ORIGINAL_MISMATCH`；相符但兩筆紀錄的核准建議不同時亦回 `ORIGINAL_MISMATCH` 並要求重新核准，不得逕行寫入目前 `id` 紀錄的建議，避免寫入非核閱者所選建議或竄改 `reportedId` 繞過衝突檢查

#### Scenario: 序列化機制明確
- **WHEN** 寫入或載入核准清冊
- **THEN** `saveRegistry()` 必須先執行 `JSON.stringify(obj, null, 2)`，再對序列化結果字串中的所有非 ASCII 字元做 `\uXXXX` 後處理，使檔案內容為純 ASCII；後處理 MUST 逐 UTF-16 程式碼單元處理，代理對的兩個代理各自輸出四位十六進位，嚴禁使用 `codePointAt` 產生超過四位的 `\u1f600` 形式。此 `\uXXXX` 是 JSON 標準跳脫（檔案中為單一 `\` 加 `u` 加四位十六進位），不是字串值中以兩個反斜線字元開頭的 `\\uXXXX` 文字。`loadRegistry()` 必須僅呼叫一次 `JSON.parse` 還原原始值，禁止自訂 unescape、二次解碼或解析後字串替換。`approvals` 必須為 plain object 且不得含 `__proto__`／`constructor`／`prototype` 等原型相關鍵；查表僅得使用 `Map` 或 `Object.hasOwn()` 檢查自有欄位，嚴禁 `for...in`、原型鏈查找或 `Object.assign` 合併，遇上述鍵即 fail-closed 拒絕載入並輸出診斷，避免從未執行 `--approve` 的紀錄取得授權

#### Scenario: 序列化來回一致
- **WHEN** 對含非 ASCII 字元的核准紀錄執行「核准→寫入→載入→驗證」
- **THEN** 清冊檔案符合純 ASCII，`JSON.parse` 後 `computeStableId()` 與原 ID 相等，`isStableIdValid()` 為真且 `authorizeCandidate()` 回 `AUTHORIZED`

#### Scenario: 每次寫入皆通過不變式
- **WHEN** 執行 `--approve`、`--revoke` 或任何改寫核准清冊的操作
- **THEN** 所有寫入皆經過同一 `saveRegistry()`，且通過「檔案內容純 ASCII」與「`JSON.parse` 後識別碼相符」雙驗證；撤銷一筆後重新執行 `check:lang` 仍回報零違規

#### Scenario: 清冊內容不命中硬閘門
- **WHEN** 核准紀錄的原文含既有簡體字或中國用語
- **THEN** 清冊檔以 JSON `\uXXXX` 標準跳脫保存，執行 `check:lang` 仍回報零違規

#### Scenario: 核准為累加且未知識別碼有明確結果
- **WHEN** 對已有清冊新增核准，或指定不存在與重複的識別碼
- **THEN** 既有核准不被清空，未知識別碼被列出並回非零結束碼，重複識別碼以覆寫處理

#### Scenario: 核准時綁定所選建議
- **WHEN** 核閱者以 `--approve` 指定 `suggestionSource` 與對應建議
- **THEN** 該來源與建議必須存在於候選的 `suggestionOptions`，核准紀錄保存兩者；`--fix` 寫入時使用核准紀錄的建議，而非報告預設的 `S2TW` 建議

#### Scenario: 核准建議不在選項時明確拒絕
- **WHEN** `--approve` 指定的 `suggestionSource` 與建議的組合不存在於候選的 `suggestionOptions`
- **THEN** 工具拒絕核准、不寫入清冊，輸出診斷 `SUGGESTION_NOT_IN_OPTIONS` 並列出該候選可用的 `suggestionOptions`，回非零結束碼

#### Scenario: 撤銷核准
- **WHEN** 開發者對既有識別碼執行撤銷，或指定不存在的識別碼
- **THEN** 既有識別碼自清冊移除且該候選不再具備寫入授權；未知識別碼被列出並回非零結束碼

#### Scenario: 無效清冊紀錄的剔除與保留
- **WHEN** 載入清冊時發現紀錄的識別碼格式無效、任一識別欄位含 `\0`，或 `approvals` 非 plain object 或含原型相關鍵
- **THEN** 格式無效或含 `\0` 的紀錄被剔除且不參與任何授權判斷或診斷查詢；`approvals` 非 plain object 或含原型相關鍵時則整份清冊 fail-closed 拒絕載入，不授權任何候選

#### Scenario: 重新計算不符的紀錄保留供診斷
- **WHEN** 載入清冊時紀錄格式有效，但以目前 `computeStableId()` 重新計算**該紀錄自身四欄位**的結果與其識別碼不符
- **THEN** 該紀錄 **不被剔除**，而是保留於清冊並標記 `INVALID_RECORD`、不授予任何寫入權限，且可經 `reportedId` 查閱；載入階段 **不決定** `ID_ALGORITHM_CHANGED` 或 `APPROVAL_TAMPERED`，診斷延遲至 `authorizeCandidate()` 依舊紀錄四欄位與目前候選是否相同決定，以確保兩碼可區隔。如此 ③ 才能查到舊紀錄並回 `INVALID_RECORD`，而非因查無紀錄降為 `UNAPPROVED`

#### Scenario: 不支援的清冊版本拒絕授權
- **WHEN** 載入清冊時其 `version` 不等於目前支援版本 `1`
- **THEN** 拒絕載入該清冊、不授權任何候選寫入，並輸出明確診斷 `APPROVALS_VERSION_UNSUPPORTED`；僅接受數值 `1`（JSON `1.0` 解析為數值 `1` 故接受），字串 `"1"`、`2`、`null` 皆拒絕；不得因版本不匹配而 fail-open 放行；此檢查 SHALL 優先於無效紀錄標記與剔除，即使紀錄同時無效仍先回版本不支援診斷

### Requirement: 結構化報告與快速定位

工具 SHALL 在報告模式輸出可機器讀取的 JSONL 與可人工閱讀的 Markdown 摘要，提供逐筆候選定位、`suggestionOptions`、核准狀態與混合命中拆分。報告之序列化層跳脫、呈現層跳脫、輸出路徑安全與寫入失敗處理 MUST 不改變硬閘門結果。

#### Scenario: 逐筆定位候選
- **WHEN** 執行報告模式
- **THEN** 產生可供機器讀取的 JSONL 與可供人工閱讀的 Markdown；每筆至少含 `id`、`reportedId`、`file`、`line`、`column`、`original`、`suggestion`、`suggestionSource`、`suggestionOptions`、`tier`、`rule`、`approvalState`、`approvalReason`、`protected`、`exempt`、`degraded`、`contextHash` 與 `occurrenceIndex`，兩者皆能定位檔案、行、欄、建議選項與寫入來源

#### Scenario: 規則值域明確
- **WHEN** 讀取報告項目或分析候選
- **THEN** `rule` 的值域為 `HARD` 與 `S2TWP`；`suggestionSource` 與 `suggestionOptions[].source` 的值域為 `S2TW`、`S2TWP` 與 `MAINLAND_TERMS`，兩者不得互相取代

#### Scenario: Meta 可供自動化判讀
- **WHEN** 讀取 JSONL 首行
- **THEN** 可取得 `generatedAt`、`degraded`、`degradedReason`、`literalDrift`、`violationCount`、`exemptLines`、`candidateCount`、`protectedCount`、`unprotectedCount`、`exemptCandidateCount`、`tierCounts`（含 `high` 與 `pending`）、`protectedTermsStatus`（值域 `AVAILABLE` 或 `PROTECTED_TERMS_UNAVAILABLE`）與 `outOfScopeFiles`（自動掃描範圍外、待人工核對的檔案路徑陣列）；`violationCount` SHALL 為與既有硬閘門相同掃描範圍（含 `openspec/` 與 `docs/參考資料/`，僅排除 `artifacts/`）的違規總數，由報告模式直接呼叫 `checkProject()` 純函式並自行加總取得，MUST NOT 呼叫 `main()`、MUST NOT 輸出硬閘門違規訊息、MUST NOT 將其結束碼做為報告模式結束碼；`candidateCount` SHALL 為 `s2tw` 定位的候選總數，含受保護與豁免候選，且等於 `protectedCount` 與 `unprotectedCount` 之和；`exemptCandidateCount` 為豁免候選數，屬 `unprotectedCount` 的子集，供 CI 判讀「候選全數豁免」警告；計數不變式為 `exemptCandidateCount <= unprotectedCount` 且 `unprotectedCount = candidateCount - protectedCount`，同時 `protected` 優先於 `exempt`：同一候選不得同時標記兩者，`exempt` 僅適用於未受保護候選，避免重疊計數破壞總和

#### Scenario: 核准狀態可判讀
- **WHEN** 候選分別處於已核准、未核准、清冊紀錄無效與原文已變動四種情況
- **THEN** 報告的 `approvalState` 分別為 `AUTHORIZED`、`UNAPPROVED`、`INVALID_RECORD` 與 `ORIGINAL_MISMATCH`，且 `approvalReason` 反映對應原因；受保護與豁免候選即使有有效核准紀錄，亦回 `UNAPPROVED` 且 `approvalReason` 為 `PROTECTED_BY_ORIGINAL`／`EXEMPT_BY_POLICY`；此欄位由 `authorizeCandidate()` 單一計算（含保護狀態）並由 `buildReportData()` 填入

#### Scenario: 混合命中拆分
- **WHEN** 同一行同時命中不同規則與不同分層的候選
- **THEN** 報告依替換單元拆分為多筆，各自保留規則、分層與建議來源

#### Scenario: JSONL 採序列化層跳脫
- **WHEN** 寫入 JSONL 報告
- **THEN** 所有字串欄位（含 `original`、`suggestion`、`suggestionOptions[].text`、`degradedReason`、`literalDrift` 與 `reason`）採 `JSON.stringify` 後非 ASCII 跳脫後處理；`JSON.parse` 還原的是分析用原始值，解析後不得再做字串替換

#### Scenario: JSONL 寫入前驗證純 ASCII
- **WHEN** 每次寫入 JSONL 報告
- **THEN** 寫入前比照 `saveRegistry()` 驗證序列化結果為純 ASCII 且 `JSON.parse` 後分析用原始值完整；驗證失敗時不寫入，走 `REPORT_WRITE_FAILED` 路徑

#### Scenario: Markdown 採呈現層跳脫
- **WHEN** 寫入 Markdown 報告或工具提供的核閱表格區塊
- **THEN** 所有可能含非 ASCII 的字串欄位中，每個非 ASCII 字元（逐 UTF-16 程式碼單元）一律以 `\uXXXX` 呈現，不逐詞比對簡體字集或中國用語表；此轉換僅供人工閱讀，不影響分析、識別碼計算與核准比對的原始值

#### Scenario: 任意輸出路徑不污染硬閘門
- **WHEN** 含禁詞原文的候選被寫入專案根目錄內任意位置的報告或工具產生文件
- **THEN** JSONL 維持純 ASCII 且 Markdown 採呈現層跳脫，硬閘門違規數與產生文件前完全相同

#### Scenario: 不污染工作區
- **WHEN** 報告寫入預設目錄 `artifacts/`
- **THEN** 報告檔案不在版本控制狀態中出現為未追蹤變更

#### Scenario: 寫入失敗不影響結束碼
- **WHEN** 報告目錄不可寫入
- **THEN** stderr 出現 `REPORT_WRITE_FAILED`，stdout 輸出 `{"ok":false,"code":"REPORT_WRITE_FAILED","bytes":0}`，結束碼仍為成功

#### Scenario: 拒絕危險輸出路徑
- **WHEN** `--output` 指向專案根目錄外，或指向根目錄內但 `realpath` 指向外部的符號連結
- **THEN** 工具接受根目錄內路徑，但拒絕上述路徑並提示限制，結束碼仍為成功

#### Scenario: 不存在目錄仍可建立
- **WHEN** `--output` 指向尚不存在但祖先目錄位於專案根目錄內的路徑
- **THEN** 工具先以 `path.resolve` 驗證前綴，再對最近的既有祖先目錄做 `realpath`，把剩餘區段以 `path.join` 還原後接受並建立該目錄

#### Scenario: 輸出路徑僅供本機除錯
- **WHEN** 執行 CI 報告步驟或 `npm run language:report`
- **THEN** 不帶 `--output`，一律寫入預設 `artifacts/`；`--output` 僅供本機除錯使用

### Requirement: 受保護術語與資料契約完整性

工具 SHALL 以最長優先比對保護本專案的工作表名稱常數、`gasRuntime.js` 的角色顯示名稱、`actionRegistry.js` 的 `logLabel` 與 `logDetailKey` 等 Action 中文中繼資料、`databaseInitializer.js` 的行政管理字面值、法定單位與已知誤改詞，以及由測試原始碼靜態產生的契約字面值；此清冊產生結果 SHALL 通過「產生後硬閘門違規數不變」驗證。**保護的作用對象為候選原文位置**：`protected` 標記由候選 `original` 是否命中清冊決定，而非由建議文字決定；受保護候選一律不寫入、保留原文，豁免候選亦 MUST NOT 被修正模式寫入；`protected` 優先於 `exempt`，同一候選不得同時標記兩者，`exempt` 僅適用於未受保護候選。當候選原文本身是真正的簡體字違規（如 `\u9879\u76ee`）時，人工核准的建議即便字面與受保護清冊中的正體詞相同（如「專案」）仍得寫入，因為此為修正簡體違規而非誤改正體詞；此語意 SHALL 與 `suggestionOptions` 人工選詞及核准的流程一致。保護不影響硬閘門回報。遮蔽機制 SHALL 使用不與原始內容碰撞的哨兵前綴，碰撞時重試，並在還原後驗證專用區碼位集合不變且無殘留哨兵。受保護來源抽取失敗時 SHALL 輸出 `PROTECTED_TERMS_UNAVAILABLE` 狀態並記錄於報告 meta，但 MUST 保留既有靜態清冊，不得靜默降為空清單。

#### Scenario: 受保護字面值不被改寫
- **WHEN** `s2twp` 會誤改「課程代碼」「權限」「設備組」等受保護術語
- **THEN** 這些字面值在報告中標記為受保護，且不會被修正模式寫入

#### Scenario: 臺灣正當慣用語遭 s2twp 誤改亦受保護
- **WHEN** `s2twp` 會將繁體「項目」誤改為「專案」，但該字在臺灣亦指正當的條目或細目
- **THEN** `s2tw` 定位使繁體「項目」不產生候選；受保護清冊雙向收錄「項目」與「專案」，用以確保正體原文位置不被改寫。硬閘門既有的簡轉「專案」違規判定維持不改動；但 `\u9879\u76ee` 候選為真實簡體違規，人工依 `suggestionOptions` 挑選「專案」並核准後，`--fix` SHALL 寫入該建議，不受「專案」存在於受保護清冊影響。此區別以候選 `original` 為準，並以端到端測試鎖定

#### Scenario: 負面測試字面值永不寫入
- **WHEN** 字面值含語言檢查豁免註記或以 Unicode 跳脫表示的簡體字
- **THEN** 即使出現在報告中，修正模式亦不寫入該位置

#### Scenario: 哨兵前綴碰撞重試
- **WHEN** 產生的哨兵前綴已存在於原始內容
- **THEN** 工具重新產生前綴直到完全不相交，否則明確失敗

#### Scenario: 專用區集合不變式
- **WHEN** 完成遮蔽與還原
- **THEN** 還原結果的專用區碼位集合與原文完全相同，且沒有殘留哨兵

#### Scenario: 保護來源載入失敗可見
- **WHEN** 工作表名稱、角色或 Action 中繼資料的動態抽取失敗
- **THEN** 輸出 `PROTECTED_TERMS_UNAVAILABLE`，報告 meta 記錄該狀態，靜態保護清冊仍完整保留

#### Scenario: 保護不豁免硬閘門
- **WHEN** 受保護字面值同時命中既有硬閘門違規
- **THEN** 硬閘門仍然回報該違規，但修正模式不得寫入該位置

### Requirement: 報告、乾跑、修正與核准模式

工具 SHALL 提供預設檢查、`--report`、`--dry-run`、`--fix` 四種模式，以及 `--approve`／`--revoke` 核准操作；同時指定模式旗標時依固定優先序解析。各模式的掃描範圍、結束碼與寫入授權 MUST 明確區分；**所有候選寫入 MUST 經明確核准**，工具不得因規則、分層或建議來源而自動寫入任何原始檔。

#### Scenario: 旗標優先序明確
- **WHEN** 同時指定多種模式旗標
- **THEN** 工具依 `--report`、`--dry-run`、`--fix`、`--approve`、`--revoke` 的優先序解析；同時指定 `--report` 與 `--fix` 時執行報告模式且不寫入檔案

#### Scenario: 硬閘門掃描範圍維持
- **WHEN** 執行既有硬閘門
- **THEN** 維持原有 basename 排除，僅新增 `artifacts/`，並繼續掃描 `openspec/` 與 `docs/參考資料/`

#### Scenario: 報告系列模式排除清冊
- **WHEN** 執行報告、乾跑、修正、核准或撤銷模式
- **THEN** 使用另一套相對路徑前綴清冊排除 `node_modules/`、`coverage/`、`.git/`、`.clasp/`、`.codegraph/`、`dist/`、`build/`、`artifacts/`、`openspec/` 與 `docs/參考資料/`；檔案排除根目錄 `AGENTS.md`、`package-lock.json`、`index.html` 與 `scripts/languageCheck.js`，且只排除這些檔案

#### Scenario: 所有建議皆須核准後寫入
- **WHEN** 候選的 `rule` 為 `HARD` 且來源為 `MAINLAND_TERMS`，或來源為 `S2TWP`、`S2TW`
- **THEN** 未經核准時一律不得寫入；不得因 `rule === "HARD"`、屬 `high` 層或建議來自專案對照表而繞過核准

#### Scenario: 報告模式不影響閘門
- **WHEN** 專案存在既有硬閘門違規並執行報告模式
- **THEN** 報告照常產出且結束碼為成功

#### Scenario: 報告模式取得違規數的方式明確
- **WHEN** 報告模式需要產生 meta 的 `violationCount`
- **THEN** MUST 直接呼叫 `checkProject()` 純函式並自行加總違規數，MUST NOT 呼叫 `main()`、MUST NOT 輸出硬閘門違規原文或摘要、MUST NOT 將硬閘門結束碼做為報告模式結束碼；硬閘門失敗時報告 stdout 仍為約定格式、結束碼仍為成功，且 `violationCount` 大於零。此約束以測試鎖定，避免呼叫 `main()` 造成固定 stdout 被汙染或結束碼被帶成非零

#### Scenario: 乾跑維持閘門語意
- **WHEN** 執行乾跑模式且存在違規
- **THEN** 工具不寫入任何檔案並回失敗結束碼

#### Scenario: 修正僅寫入已核准範圍
- **WHEN** 執行修正模式
- **THEN** 只有 `authorizeCandidate()` 回 `AUTHORIZED` 的候選被寫入，且寫入內容為核准時所選建議；受保護與豁免候選在該函式內即回 `UNAPPROVED`，不得寫入；其餘候選保留原狀，並在寫入後重新檢查

#### Scenario: 修正後仍有違規
- **WHEN** 修正完成後重新檢查仍有違規
- **THEN** 工具回失敗結束碼並列出殘留違規

#### Scenario: 核准範圍與報告一致
- **WHEN** 候選位於報告模式排除的目錄，或執行 `--approve`／`--revoke`
- **THEN** 該候選不出現在報告中，也無法被核准寫入；核准與撤銷使用與報告模式相同的排除清冊，確保只能操作使用者可見的候選

#### Scenario: 別名語意明確
- **WHEN** 分別執行既有硬閘門指令與 `language:check` 別名
- **THEN** 前者維持原有檢查行為，後者等同 `--dry-run` 且不會自動合併報告模式

### Requirement: 套件不可用之優雅降級

原生套件 MUST 採延遲載入，不得在模組頂層直接實例化；`s2tw` 與 `s2twp` 兩個轉換器 SHALL 各自延遲建立；載入、建構或轉換失敗 SHALL 轉為結構化錯誤並標記降級。套件不可用時，既有硬閘門 MUST 照常執行，並在標準錯誤輸出提示不可用程式碼，結束碼仍由違規數決定；報告模式 SHALL 在每筆紀錄與摘要標記降級，並維持成功結束碼。CI SHALL 提供獨立的非阻斷可用性檢查。

#### Scenario: 硬閘門不受套件失敗影響
- **WHEN** OpenCC 原生模組載入失敗
- **THEN** 既有硬閘門仍完成掃描，結束碼只取決於違規數

#### Scenario: 降級狀態可被觀察
- **WHEN** 套件不可用時執行報告模式
- **THEN** 標準錯誤輸出出現不可用提示，報告每筆與摘要標記降級

### Requirement: 候選分層與人工核可

轉換候選 SHALL 分為 `high` 與 `pending` 兩層：`high` 為 `s2tw` 定位的簡體字同時命中既有硬閘門違規者，`pending` 為 `s2tw` 定位但未命中硬閘門違規者。所有候選皆由 `s2tw` 差異產生，分層僅做為排序與人工核對的呈現，MUST NOT 做為授權寫入的依據；所有候選 SHALL 經明確核准才得寫入。

#### Scenario: 高信心候選仍需核准
- **WHEN** 候選因命中硬閘門違規被歸類為 high
- **THEN** 報告優先顯示該候選，但未核准前不得寫入

#### Scenario: 未命中硬閘門的簡體字列為待核可
- **WHEN** `s2tw` 定位到既有精簡字集未收錄的簡體字
- **THEN** 候選被歸類為 pending，且未核准前不得寫入

### Requirement: 契約字面值清冊漂移檢查

契約字面值清冊 SHALL 由測試原始碼的 AST 靜態產生並版本控管，含豁免註解或 Unicode 跳脫負面字面值 MUST 被排除。工具 SHALL 提供 `--check` 比對目前字面值與清冊，新增漂移僅提出警告並維持成功結束碼；移除數量超過 `max(10, ceil(清冊筆數 × 0.05))` 時 SHALL 提出明確警告並回非零結束碼。原始檔解析失敗時 SHALL 輸出可見警告並回非零結束碼。

#### Scenario: 無漂移
- **WHEN** 目前字面值與清冊一致
- **THEN** 檢查輸出無漂移訊息並回成功結束碼

#### Scenario: 新增字面值僅警告
- **WHEN** 測試新增中文字面值但未大量移除
- **THEN** 漂移警告列出新增項目，結束碼仍為成功

#### Scenario: 大量移除回失敗
- **WHEN** 移除數量超過門檻
- **THEN** 檢查列出警告並回非零結束碼

#### Scenario: 解析失敗可見
- **WHEN** 測試原始檔無法解析
- **THEN** 警告指出檔案與訊息，檢查回非零結束碼

### Requirement: CI 非阻斷整合

CI 工作流程 SHALL 在既有強制品質閘門之外執行 OpenCC 可用性 smoke、語言報告產生、契約漂移檢查、報告構件檢查與構件上傳，且全部 MUST 為非阻斷。報告步驟 SHALL 在硬閘門失敗時仍執行且不改變其結果；構件檢查 MUST 驗證報告檔案存在且 JSONL 首行可解析為 meta（空檔視為警告）、降級狀態、候選計數欄位與產生時間；既有 Language check 步驟 SHALL 宣告 `id: language-hard-gate`，構件檢查以 `${{ steps.language-hard-gate.outcome != 'success' }}` 取得布林結果並命名為 `hardGateFailed`，MUST NOT 以讀不到就當零的方式實踐，並 SHALL 以布林式 `hardGateFailed !== (violationCount > 0)` 比對硬閘門成敗與報告 meta 的 `violationCount`，不一致時發出警告，MUST NOT 以數值相等比對，亦 MUST NOT 對布林值使用 `!== 0`（嚴格不等式因型別不同而恆真，會在硬閘門成功且零違規時誤發警告）。即使警告為非阻斷，工作流程摘要 SHALL 標註固定錨點 `LANGUAGE_SIGNOFF_REQUIRED` 與字串「語言警告未處理，合併前須人工簽核」，並嘗試為 PR 加上 `language-signoff-required` 標籤（失敗不影響結束碼）；標籤新增失敗時 SHALL 於摘要額外輸出「標籤新增失敗，須人工確認語言簽核」警示；核閱文件 SIGNOFF 欄位 SHALL 標註「語言警告已處理，合併前人工簽核」並填寫核閱者與日期。CI SHALL NOT 執行任何寫入模式，僅判斷簡體字出現與候選證據。

#### Scenario: 硬閘門失敗仍產出報告
- **WHEN** 語言硬閘門失敗
- **THEN** 報告步驟仍執行並產出構件，且不覆蓋硬閘門的失敗結果

#### Scenario: 報告故障不影響 CI 結果
- **WHEN** 契約漂移檢查或報告上傳失敗
- **THEN** CI 整體結果不由這些步驟決定

#### Scenario: CI 不自動取代詞彙
- **WHEN** 檢查 CI 工作流程定義
- **THEN** 新增步驟不包含 `--fix`、`--approve` 或 `--revoke`，亦不寫入任何原始檔；僅執行 smoke、報告、漂移與構件檢查

#### Scenario: 全員降級被看見
- **WHEN** 報告 meta 標記降級或 `candidateCount` 欄位缺失
- **THEN** 構件檢查輸出警告並記錄於工作流程摘要

#### Scenario: 零候選且零違規不誤報
- **WHEN** 報告 meta 的 `candidateCount` 為零、`degraded` 為 false 且 `violationCount` 為零
- **THEN** 構件檢查將其視為有效但無候選證據，不因候選收斂為零而發出降級警告；硬閘門成功時 `hardGateFailed` 為 false、`violationCount > 0` 為 false，交叉比對亦 MUST NOT 發出警告或 `LANGUAGE_SIGNOFF_REQUIRED` 錨點

#### Scenario: 有違規但零候選須警告
- **WHEN** 報告 meta 的 `violationCount` 大於零、`candidateCount` 為零且 `degraded` 為 false
- **THEN** 構件檢查輸出警告並記錄於工作流程摘要，說明「無 `s2tw` 可定位候選；由正體字組成的中國用語違規不在 OpenCC 候選範圍，須依硬閘門輸出人工修正」；因 `candidateCount` 為零時 `protectedCount` 與 `unprotectedCount` 必然皆為零，MUST NOT 同時列舉「候選全數受保護」或「候選全數豁免」做為可能原因，避免警告與可觀測資料不符

#### Scenario: 候選全數受保護或全數豁免須另行警告
- **WHEN** 報告 meta 的 `candidateCount` 大於零，且 `protectedCount === candidateCount` 或 `exemptCandidateCount === candidateCount`
- **THEN** 構件檢查輸出獨立警告並記錄於工作流程摘要，分別說明「候選全數受保護，工具不寫入」或「候選全數豁免，工具不寫入」；此警告與「有違規但零候選」警告互斥；構件檢查 SHALL 驗證 `exemptCandidateCount <= unprotectedCount` 且 `unprotectedCount = candidateCount - protectedCount`，不符時輸出警告，且 `protected` 優先於 `exempt`，同一候選不得同時標記兩者

#### Scenario: 硬閘門結束碼與 violationCount 不一致須警告
- **WHEN** 布林式 `hardGateFailed !== (violationCount > 0)` 為真
- **THEN** 構件檢查輸出警告並記錄於工作流程摘要，指出兩者掃描範圍或統計不一致，不得將報告視為本次有效掃描證據；`hardGateFailed` 必須由既有 Language check 步驟的 `id: language-hard-gate` 搭配 `${{ steps.language-hard-gate.outcome != 'success' }}` 取得布林值，MUST NOT 以讀不到就當零的方式實踐，MUST NOT 對布林值使用 `!== 0`（因嚴格不等式恆真），亦 MUST NOT 以 `hardGateFailed === violationCount` 之類的數值相等比對判斷；硬閘門成功且 `violationCount` 為零時 `hardGateFailed` 與 `violationCount > 0` 皆為 false，比對結果必為 false，MUST NOT 發出警告

#### Scenario: 非阻斷警告仍須人工簽核
- **WHEN** 任何新增 CI 步驟輸出警告
- **THEN** 工作流程摘要輸出固定錨點 `LANGUAGE_SIGNOFF_REQUIRED` 與字串「語言警告未處理，合併前須人工簽核」，並嘗試為 PR 加上 `language-signoff-required` 標籤；核閱文件 SIGNOFF 欄位則標註「語言警告已處理，合併前人工簽核」並填寫核閱者與日期。兩處字串語意不同且皆須出現；警告本身不改變 CI 結束碼，以維持非阻斷承諾，但合併前的風險不得被隱藏，帶此標籤或錨點的 PR 在 SIGNOFF 空白時不得 squash merge；標籤新增失敗時摘要須額外警示，且合併前查核 SHALL 主動檢查工作流程摘要是否含 `LANGUAGE_SIGNOFF_REQUIRED`，不得僅依賴 PR 標籤，錨點存在即視為帶警告，不因標籤缺失而放行

#### Scenario: 舊報告不被誤用
- **WHEN** 報告的 `generatedAt` 不屬於本次執行
- **THEN** `generatedAt` SHALL 為 ISO 8601 UTC 格式（以 `Z` 結尾）；構件檢查以該步驟執行時呼叫 `date -u +%Y-%m-%dT%H:%M:%SZ` 取得的 UTC 時刻為基準，接受「基準時刻前 15 分鐘至基準時刻後 5 分鐘」的有效區間（容忍上傳與時鐘偏差；不採較寬的 60 分鐘，避免舊構件被誤判為本次有效掃描），區間外不視為本次有效掃描證據並輸出警告，不得採嚴格相等比對，亦不得需要時區換算

#### Scenario: 相依故障代碼可區隔
- **WHEN** 平台二進位 optional dependency 安裝失敗、`@babel/parser` 缺失或其他 OpenCC 載入失敗
- **THEN** smoke 與報告步驟僅輸出 `OPENCC_BINARY_MISSING` 或 `OPENCC_UNAVAILABLE` 診斷代碼（兩步驟不載入 `@babel/parser`），`PARSER_UNAVAILABLE` 僅由使用該解析器的契約漂移檢查步驟輸出，避免環境故障被呈現為單純語言報告異常，亦避免在不需要解析器的步驟形成死碼或讓漂移檢查故障無明確診斷

#### Scenario: 診斷代碼映射規則明確
- **WHEN** 將原生套件載入例外映射至診斷代碼
- **THEN** 依序判定：① 錯誤碼為 `ERR_DLOPEN_FAILED`，或訊息含 `@opencc/opencc-` 前綴的平台二進位套件名稱 → `OPENCC_BINARY_MISSING`；② 錯誤碼為 `MODULE_NOT_FOUND` 且訊息含 `@babel/parser` → `PARSER_UNAVAILABLE`（僅適用於契約漂移檢查步驟）；③ 其餘 OpenCC 載入、建構或轉換失敗 → `OPENCC_UNAVAILABLE`。MUST NOT 以 catch-all 將所有例外一律映射為 `OPENCC_UNAVAILABLE`；測試 SHALL 將三種假錯誤分別注入各自所屬步驟驗證映射

#### Scenario: 構件名稱可追溯
- **WHEN** 上傳語言報告構件
- **THEN** 構件名稱包含提交 SHA，且所有新增步驟使用 `if: always()` 與 `continue-on-error: true`

### Requirement: 全專案掃描證據與範圍標示

工具 SHALL 支援全專案候選掃描，並在報告 meta 提供與硬閘門同範圍的違規數（`violationCount`）、`s2tw` 定位的候選總數（含受保護與豁免）、受保護與未保護候選數、豁免候選數（`exemptCandidateCount`，為 `unprotectedCount` 子集）、各分層數量與豁免行數；SHALL 標示自動掃描範圍外的檔案清單，供人工核對。工具 MUST NOT 自動改寫未核准、受保護或豁免的候選。人工判定方式與核閱文件撰寫屬使用流程，由任務清單規範，不屬本能力的工具契約。

#### Scenario: 產生分層核閱證據
- **WHEN** 執行全專案報告
- **THEN** 輸出依檔案與分層排序的候選清單，且 meta 含各類統計數字，每筆含可供人工挑選的 `suggestionOptions`

#### Scenario: 範圍外檔案被標示
- **WHEN** 檔案類型不在自動掃描範圍
- **THEN** 報告列出該檔案路徑做為待人工核對項目

#### Scenario: 範圍外違規需人工處理
- **WHEN** `openspec/` 或 `docs/參考資料/` 存在硬閘門違規
- **THEN** 這些違規仍由硬閘門回報並計入 `violationCount`，但不計入 `candidateCount`；報告系列模式與修正模式不處理該位置，須由開發者人工修正後重新執行檢查

#### Scenario: 未授權候選不被寫入
- **WHEN** 候選未被核准、受保護或標記豁免
- **THEN** 修正模式保留其原文，不產生任何變更

### Requirement: 確定性、冪等與輸入驗證

所有分析與報告 SHALL 具備確定性：相同輸入產生相同輸出；相同文字重複轉換 MUST 不再產生差異。工具 MUST NOT 重複實作官方套件已處理的最長片語、多候選取值與 CJK 正規化。非字串輸入 SHALL 原值回傳且不觸發套件載入；寫入時 MUST 先完成全部替換與防護驗證，再一次批次寫回，並完整保留原有尾端換行。

#### Scenario: 重複執行無差異
- **WHEN** 對同一文字或同一專案狀態重複執行分析與轉換
- **THEN** 輸出完全一致，重複轉換不產生新候選

#### Scenario: 黃金案例輸出正確
- **WHEN** 以官方黃金案例簡體輸入進行轉換
- **THEN** `s2tw` 輸出字級正體結果，`s2twp` 輸出符合官方預期的臺灣慣用語結果；兩者差異僅供建議選項，不得互相覆蓋

#### Scenario: s2tw 與 s2twp 差異可區隔
- **WHEN** 輸入 `\u9879\u76ee`
- **THEN** `s2tw` 輸出「項目」，`s2twp` 輸出「專案」，兩者分別成為 `S2TW` 與 `S2TWP` 建議選項；輸入繁體「項目」時兩者差異皆為空，不產生候選

#### Scenario: 非字串輸入原值回傳
- **WHEN** 轉換函式收到數字、空值或陣列
- **THEN** 回傳原值且不載入原生套件

#### Scenario: 尾端換行完整保留
- **WHEN** 修正模式寫入含尾端換行的檔案
- **THEN** 寫入前後尾端換行位元組完全相同
