# Design

## Context

本專案已有 `scripts/languageCheck.js` 硬閘門（精簡字集＋中國用語表）、`npm run check:lang`、pre-commit hook 與 CI 強制步驟；品質量測以 `scripts/qualityConfig.js` 為單一設定來源，`scripts/checkComplexity.js` 與 `scripts/checkChangedCoverage.js` 各有寫死的範圍規則（`scripts/checkCoverage.js` 則讀取 `qualityConfig.SCOPE`，無須修改），並有 `scripts/quality-baseline.json` 的方向性 ratchet。來源專案 KSVS-Course-Information-Collector 的 OpenCC 工具以 Node 20、較寬的 CRAP 30／MI 20 門檻、`check:language` 與 `coverage-config.js` 為前提，故不可直接複製，須按本專案現況重新對應。動機與範圍見 proposal.md；行為契約見 `specs/zh-tw-language-conformance/spec.md`。

來源的 30／20 是門檻而非實測值；其實測六支核心的 Maintainability Index 皆在 90 以上，因此本專案 CRAP ≤ 25、MI ≥ 50 是可達成的，真正瓶頸在於全域覆蓋率 ratchet 與擴充後 `languageCheck.js` 的測試覆蓋，而非門檻本身。

本專案另有兩項獨特約束：根目錄 `*.js` 會被 `clasp push` 上傳至 GAS V8，而 `webapp/js/*.js` 會被打包進 `index.html`；因此原生模組只能存在於 Node 專用的子目錄。此外，本專案刻意將 `openspec/` 與 `docs/參考資料/` 納入既有硬閘門掃描，並有 `tests/languageCheckAnon4.test.js` 明確驗證此行為；`AGENTS.md` 與 `package-lock.json` 則是硬閘門既有排除檔案，報告系列模式也必須比照排除。

**關鍵實測洞察**：在 Node 24 以 `opencc@1.4.2` 直接驗證，`s2tw` 對繁體「項目」「數據」「課程代碼」「權限」與「報告項目」皆不產生差異，只對簡體 `\u9879\u76ee`、`\u6570\u636e`、`\u6743\u9650` 產生差異；`s2twp` 則把繁體「項目→專案」「數據→資料」「課程代碼→課程程式碼」「權限→許可權」，連簡體 `\u6743\u9650` 也誤改為「許可權」。因此定位與建議必須分離：以 `s2tw` 差異決定候選是否存在，以 `s2twp`／`s2tw`／專案對照表提供建議選項，由人工挑選，工具與 CI 皆不機械取代。

**第五輪壓力測試洞察**：`s2twp` 建議僅能附加在 `s2tw` 已定位的候選上。繁體「鼠標」在 `s2tw` 下無差異，故永不產生候選，其 `s2twp`「滑鼠」建議也永遠不會出現——這是刻意取捨，工具不宣稱處理純正體慣用語。另一方面，本專案 `MAINLAND_TERMS` 中「`\u652f\u6301`→支援、`\u914d\u7f6e`→設定、`\u53bb\u91cd`→避免重複、`\u54c8\u5e0c`→雜湊」四詞全由正體字組成，`s2tw` 對其無差異，故不進候選工具，仍由硬閘門回報並人工修正。CI 構件檢查須比對 `violationCount` 與 `candidateCount`：`violationCount > 0`、`candidateCount = 0` 且 `degraded` 為 false 時發出單一警告（文案以 Decision 5 與 spec「有違規但零候選須警告」場景之完整字串為單一來源；降級造成零候選時改由降級警告單獨處理，詳見 Decision 8），避免形成「硬閘門紅燈、報告零候選、工具無從介入」的死角假保險；「候選全數受保護／全數豁免」僅在 `candidateCount > 0` 時由獨立警告處理，因為零候選時兩個計數必然皆為零。`violationCount` 必須定義為與硬閘門相同範圍（含 `openspec/` 與 `docs/參考資料/`）的違規總數，由報告模式**直接呼叫 `checkProject()` 純函式並自行加總**取得，不得受限於報告系列模式的排除清冊，亦 **MUST NOT 呼叫 `main()`**、不得輸出硬閘門違規訊息或將其結束碼帶成報告模式結束碼，否則違規出現在這兩個目錄時仍會形成假保險，或使報告的固定 stdout／結束碼約定失效。

## Goals / Non-Goals

**Goals:**

- 移植官方 OpenCC，以 `s2tw` 差異做為候選定位來源、`s2twp` 做為慣用語建議來源，同時維持既有硬閘門零回退。
- 讓候選分析核心真正納入本專案嚴格的覆蓋率、CRAP、MI 與變更覆蓋率量測。
- 提供 `suggestionOptions` 多來源建議、內容定址核准與結構化報告，使人工選詞與核可可被追溯。
- 明確區分序列化層與呈現層，避免工具自身讓硬閘門由綠轉紅或讓合法核准靜默失效。
- 在既有 CI 強制步驟之外補上非阻斷、只讀不寫的報告證據，避免假綠燈。

**Non-Goals:**

- 不改變 `check:lang` 的違規判定來源、輸出格式、豁免標記、結束碼或既有排除政策，唯新增本變更才產生的 `artifacts/` 排除項。
- 不降版 Node、不改用 bun、不移除既有 CI 強制步驟，不新增 `check:language` 別名。
- 不將 OpenCC 原生套件或 `require("opencc")` 帶入 GAS 後端、前端原始檔或 `index.html`。
- 不宣稱「硬閘門零違規」等於完整語言合規；不讓工具或 CI 自動改寫任何原始檔，所有寫入皆須明確核准。
- 不重複實作 OpenCC 已處理的最長片語、多候選取值與 CJK 正規化，不內嵌詞典資料檔。
- 不以移除或下修歷史地板（`miMin >= 83.666`、`crapMax <= 30`、過期快照比較斷言）的方式通過品質閘門。

## Decisions

### 1. 官方套件、雙設定檔、精確版號與延遲載入

**決策**：新增 `opencc@1.4.2` 與 `@babel/parser@7.29.15` 為 devDependency，版本號精確鎖定，不使用 `^` 或 `~`，避免 `npm ci` 失敗回退 `npm install` 時安裝版本漂移。外殼採延遲載入、實例快取，分別建立 `s2tw` 與 `s2twp` 轉換器，並以 `OpenCcUnavailableError`（`code: "OPENCC_UNAVAILABLE"`）統一封裝載入／建構／轉換失敗。以 `--ignore-scripts` 安裝後平台二進位由 optional dependency 提供，已於 Node 24 實測：Gold case 中 `s2tw` 輸出字級正體、`s2twp` 輸出臺灣慣用語；正體「項目／數據／課程代碼／權限」在 `s2tw` 下不變。可用性 smoke 固定為 `node scripts/openccS2twp.js --smoke`，僅在兩者輸出與版本皆相符時回 0；task 1.2 只驗證相依版本與 scripts 登錄，smoke 實際執行移至 3.1 外殼完成後。

**理由**：OpenCC 要求 Node ≥ 20.17，本專案 Node 24 已符合。延遲載入確保原生二進位不可用時僅降級報告，不讓硬閘門紅燈。`@babel/parser` 漂移會改變 AST 字面值清冊結果，故同樣精確鎖定並驗證版本。

**替代方案考慮**：內嵌詞典 TSV 並自寫解析器（體積大、易與官方行為漂移）；把套件列為正式相依（可能被打包或部署流程誤帶入）；模組頂層實例化（二進位失敗會拖垮所有模式）；單用 `s2twp` 定位（會把正體「項目」誤當候選）。皆不採用。

### 2. 硬閘門與候選分離，採雙排除設定檔

**決策**：既有 `checkContent()`／`checkProject()`／`main()` 的判定與輸出維持不變；候選分析與報告只在報告／乾跑／修正模式生效。硬閘門繼續使用原有 `EXCLUDED_DIRECTORIES`（`node_modules`、`coverage`、`.git`、`dist`、`.clasp`、`.codegraph`）與 `EXCLUDED_FILES`（`AGENTS.md`、`languageCheck.js`、`package-lock.json`、`index.html`），採 basename 比對、`openspec/` 與 `docs/參考資料/` 納入掃描，僅新增 `artifacts` 一項；此為已知取捨，任何同名子目錄也將一併排除，並以測試鎖定。

報告／乾跑／修正／核准／撤銷模式另用明確注入的相對路徑前綴設定檔，排除 `node_modules/`、`coverage/`、`.git/`、`.clasp/`、`.codegraph/`、`dist/`、`build/`、`artifacts/`、`openspec/` 與 `docs/參考資料/`；檔案只排除根目錄 `AGENTS.md`、`package-lock.json`、`index.html` 與 `scripts/languageCheck.js`。`AGENTS.md` 必須排除，因其包含語言規範的禁詞示範；若掃入會產生假候選，並讓硬閘門零違規時的 `--dry-run` 誤回非零。核准與撤銷 MUST 使用同一份報告清冊。兩套設定檔 MUST 以不同注入參數傳遞，不得用單一常數分支。

**理由**：`tests/languageCheckAnon4.test.js` 明確驗證 `openspec/` 納入與 basename 排除行為，且注入 `fs` 的呼叫次數與 options 精確相等。報告必須排除 `artifacts/`，否則跑完報告後硬閘門會掃到 `language-report.md` 而由綠轉紅。spec 中「不掃描官方參考資料」僅適用報告系列模式，不得套用到硬閘門，否則與既有契約衝突。

**替代方案考慮**：統一改採來源的 `EXCLUDED_PATH_PREFIXES`（等同於放寬硬閘門且破壞既有測試）；讓報告沿用硬閘門清冊（報告被大量提案範例淹沒）；把報告寫進硬編碼忽略路徑以外的目錄（仍可能被其他工具掃到）。皆不採用。

### 3. 內容定址識別碼、`⓪` 守門與舊識別碼保留

**決策**：識別碼為 `file`、`original`、`contextHash`、`occurrenceIndex` 四個欄位依序以 `\0` 分隔串接後取 SHA-256 前 16 碼；`line` 與 `column` 只做定位，`suggestion` 不參與識別碼——候選身份是「簡體字出現的位置」，替換詞彙由核准紀錄另行綁定。`contextHash` 取**同一行內**替換處前後各 24 個 UTF-16 程式碼單元上下文（不跨行；不足處以空字串補齊，仍以 `\0` 分隔前後上下文），以確保檔案前方插入新行時核准仍有效；靠行首與靠行尾的候選須以測試鎖定其取值。`occurrenceIndex` 在同一檔案內以 `file\0original` 為鍵，由左至右、由上至下從零起算。`column` 為零起 UTF-16 程式碼單元。`isStableIdValid(id, registryEntryFields)` 的語意明確為「16 碼十六進位格式、傳入的核准紀錄四欄位不含 `\0`，**且**以目前 `computeStableId()` 重新計算**該核准紀錄自身四欄位**的結果與該識別碼相等」，兩條件皆通過才算有效；**重算主語必須是核准紀錄自身欄位，不得使用目前候選欄位**，否則同行格式化時會先回 `INVALID_RECORD`，使 `ORIGINAL_MISMATCH` 再次不可達（第八輪 B-2）。此定義使工具升級改變演算法時舊 ID 必然驗證失敗，不會產生不可達的升級分支。

`finalizeCandidates()` 產生的 `id` 是目前 ID。`--fix` 從報告載入候選時，MUST 將報告 `id` 保存為 `reportedId` 且不得覆蓋，再另行計算目前 `id`；報告僅提供定位與 `reportedId`，其 `approvalState`／`approvalReason`／`suggestion`／`suggestionSource` 一律不信任，必須由目前分析與清冊重新計算。`reportedId` 是**否決導向**欄位：不得做為正向授權來源，但 MUST 被查詢做為衝突與失效診斷，單獨不足以授權寫入，卻足以否決目前 ID 的授權。`authorizeCandidate(registry, candidate)` 為 `buildReportData()` 與 `--fix` 共用的單一計算點，決策順序如下：**步驟⓪守門**——候選或命中紀錄的任一識別欄位含 `\0` 時立即回 `INVALID_RECORD`，不進入後續判定，且優先於後續所有步驟；**步驟⓪-a 保護否決**——候選 `protected` 或 `exempt` 為真即回 `UNAPPROVED`，`approvalReason` 分別為 `PROTECTED_BY_ORIGINAL`／`EXEMPT_BY_POLICY`（`protected` 優先），即使核准紀錄有效亦不得寫入，報告 `approvalState` 如實反映，避免「報告 `AUTHORIZED` 但 `--fix` 不寫入」或誤以通過該函式為唯一寫入條件而寫入受保護候選；① 目前 ID 命中：`isStableIdValid(id, 核准紀錄自身四欄位)` 為假 → `INVALID_RECORD`（依下述判準標註）；核准紀錄四欄位與候選四欄位逐一比對不符 → `INVALID_RECORD`（遭竄改）；核准建議存在於目前 `suggestionOptions` → `AUTHORIZED`；建議漂移 → `ORIGINAL_MISMATCH`。若 `reportedId` 存在且不同，先驗證其舊紀錄四欄位與目前候選逐一相符，不符 → `ORIGINAL_MISMATCH`；相符但建議與目前 ID 紀錄不同 → `ORIGINAL_MISMATCH` 並要求重新核准，建議相同則依目前 ID 紀錄判定；② 目前 ID 未命中且 `reportedId` 不存在或舊紀錄不存在 → `UNAPPROVED`；③ 目前 ID 未命中且 `reportedId` 存在：舊紀錄 `isStableIdValid(reportedId, 舊紀錄自身四欄位)` 為真但四欄位與目前候選不同 → `ORIGINAL_MISMATCH`（同行格式化或前方插入相同字面值）；該驗證為假 → `INVALID_RECORD` 且不得寫入，診斷判準為「舊紀錄四欄位與目前候選四欄位完全相同 → `ID_ALGORITHM_CHANGED`（工具升級）；任一欄位不同 → `APPROVAL_TAMPERED`（欄位遭竄改）」。診斷在 `authorizeCandidate()` 判定，載入時僅標記無效不決定診斷代碼。為使此路徑可達，載入清冊時 **格式無效或含 `\0` 的紀錄才剔除；重新計算不符者保留但標記 `INVALID_RECORD` 且不授權**，並可經 `reportedId` 查閱診斷。第七輪 B-1：因 `isStableIdValid()` 已明確含「以目前演算法重新計算」，工具升級時舊 ID 必先於該步回 `INVALID_RECORD`，故不再保留不可達的 `ORIGINAL_MISMATCH` 升級分支；兩者同樣禁止寫入並要求重新核准，僅診斷代碼不同。查表僅用 `Map` 或 `Object.hasOwn()` 檢查自有欄位，`approvals` 非 plain object 或含 `__proto__`／`constructor`／`prototype` 鍵時 fail-closed 拒絕載入。工具為本機單一執行，README 與 AGENTS.md SHALL 明文禁止並行執行 `--approve`／`--revoke`／`--fix`，避免後寫入者以舊快照覆蓋清冊使已撤銷核准復活。來源的 `candidateFromReportEntry()` 未帶出 `id`，使 reportedId 路徑在來源是死碼；移植時 MUST 保留 `id` 為 `reportedId` 做為否決與診斷證據。

核准清冊 `version` 必須為數值 `1`（JSON `1.0` 解析為數值 `1` 故接受；字串 `"1"`、`2`、`null` 皆拒絕），不匹配時 fail-closed 拒絕授權並輸出 `APPROVALS_VERSION_UNSUPPORTED`，避免來源 `loadRegistry()` 對任意版本皆授權的 fail-open；版本檢查優先於無效紀錄標記與剔除。能直接改寫清冊檔案者等同具備核准權限（信任邊界為 PR 核閱），此限制 SHALL 文件化，避免被誤讀為可防惡意核准。空白清冊內容固定為 `{ "version": 1, "approvals": {} }`。

**已知限制（必須文件化）**：整行位置移動不影響識別碼，但同一行被 Prettier 重新格式化、前方插入相同原文與候選，或上下文改變，都會改變 `contextHash` 或 `occurrenceIndex` 而使核准失效。工具 SHALL 在報告的 `approvalState`／`approvalReason` 標示失效並要求重新核准，不再宣稱可抵抗所有格式化；工具版本升級若改變 ID 演算法，既有核准因 `isStableIdValid()` 重新計算失敗而全數回 `INVALID_RECORD`（診斷 `ID_ALGORITHM_CHANGED`），同樣須重新核准。

**替代方案考慮**：以行號＋欄位做為主鍵（脆弱）；只比對原文（同檔重複字面值無法區分）；把 `suggestion` 放進 ID（人工選詞後即失效，與新設計衝突）；正規化上下文忽略引號與空白（可能讓不同語意的字面值碰撞）。目前不採用。

### 4. 序列化層與呈現層分離，杜絕自我污染

**決策**： JSON 檔案（核准清冊與 JSONL 報告）只使用序列化層：`saveRegistry()` 與 JSONL 寫入皆先 `JSON.stringify(obj, null, 2)`，再對序列化結果字串中的所有非 ASCII 字元做 `\uXXXX` 後處理，使檔案內容為純 ASCII；後處理逐 UTF-16 程式碼單元進行（代理對兩碼元各四位十六進位，禁止 `codePointAt` 產生五位以上），且每次 JSONL 寫入前皆驗證序列化結果為純 ASCII，失敗走 `REPORT_WRITE_FAILED`。此處的 `\uXXXX` 是 JSON 標準跳脫，檔案中為單一 `\` 加 `u` 加四位十六進位；它不是字串值中以兩個反斜線字元開頭的 `\\uXXXX` 文字。`loadRegistry()` 與 JSONL 讀取僅呼叫一次 `JSON.parse` 還原分析用原始值，禁止自訂 unescape、二次解碼或解析後字串替換。`approvals` 必須為 plain object 且不得含 `__proto__`／`constructor`／`prototype` 鍵；查表僅用 `Map` 或 `Object.hasOwn()` 檢查自有欄位，嚴禁 `for...in`、原型鏈查找與 `Object.assign` 合併，遇原型相關鍵即 fail-closed 拒絕載入。所有非 ASCII 欄位含 `file`、`approvedAt`、`original`、`suggestion`、`suggestionOptions[].text`、`degradedReason`、`literalDrift` 與 `reason` 皆適用。

`saveRegistry()` 為核准清冊唯一寫入點，`--approve` 與 `--revoke` 皆走同一函式；每次寫入皆須通過「檔案內容純 ASCII」與「`JSON.parse` 後 `computeStableId()` 與原 ID 相等」雙驗證，避免撤銷後把禁詞原文寫回清冊。

Markdown 報告與工具提供的核閱表格區塊才使用呈現層：對所有可能含非 ASCII 的字串欄位，逐 UTF-16 程式碼單元將每個非 ASCII 字元一律以 `\uXXXX` 做人工可讀呈現，不逐詞比對簡體字集或中國用語表（因 `MAINLAND_TERMS` 為多字詞表，逐字元比對會讓 `\u914d\u7f6e`、`\u652f\u6301`、`\u63a5\u53e3` 等多字禁詞原樣殘留而污染硬閘門；此處即以 Unicode 跳脫自我示範）；此轉換不影響分析值與 ID。若 `original` 本身即為字面 `\uXXXX` 六字元，呈現層會顯示為 `\\uXXXX`，核閱表格 SHALL 加註說明以免人工誤讀。人工撰寫的核閱文件由 tasks 規範「呈現層跳脫紀律＋完成後再跑 `check:lang`」雙重防線。

**理由**：JavaScript 的 `JSON.stringify` 不會自動把中文轉成 `\uXXXX`；若只依賴它，第一次核准就會讓硬閘門紅燈。若把 JSON 標準跳脫誤解為「字面反斜線」而禁止，實作將陷入「寫出禁詞原文」或「自訂解碼器」兩種失敗。明確區分後才能同時滿足純 ASCII 檔案與 `JSON.parse` 唯一解碼點。

**替代方案考慮**：在 `original`／`suggestion` 寫入前先替換成六個字面字元（會讓分析值失真）；只靠 `artifacts/` 排除（無法保護自訂輸出路徑）；自訂 unescape（違反單一解碼點且易二次解碼）。皆不採用。

### 5. 結構化報告、輸出路徑安全與產物新鮮度

**決策**：報告模式輸出 `artifacts/language-report.jsonl`（首行 meta 含 `generatedAt`、`degraded`、`degradedReason`、`literalDrift`、`violationCount`、`exemptLines`、`candidateCount`、`protectedCount`、`unprotectedCount`、`exemptCandidateCount`、`tierCounts: { high, pending }`、`protectedTermsStatus: "AVAILABLE" | "PROTECTED_TERMS_UNAVAILABLE"` 與 `outOfScopeFiles`；其中 `violationCount` 由報告模式直接呼叫 `checkProject()` 純函式加總取得，步驟與硬閘門同範圍（含 `openspec/`、`docs/參考資料/`，僅排除 `artifacts/`），不受報告系列模式排除清冊影響，且不得呼叫 `main()`；`candidateCount` 為 `s2tw` 定位候選總數（含受保護與豁免），等於 `protectedCount + unprotectedCount`；`exemptCandidateCount` 為豁免候選數，屬 `unprotectedCount` 子集，供 CI 判讀「全數豁免」；計數不變式為 `exemptCandidateCount <= unprotectedCount` 且 `unprotectedCount = candidateCount - protectedCount`，`protected` 優先於 `exempt`，同一候選不得同時標記兩者。其後每筆含 `id`、`reportedId`、`file`、`line`、`column`、`original`、`suggestion`、`suggestionSource`、`suggestionOptions`、`tier`、`rule`、`approvalState`、`approvalReason`、`protected`、`exempt`、`degraded`、`contextHash` 與 `occurrenceIndex`）與 `artifacts/language-report.md`（摘要＋前 500 筆表格＋豁免區塊）。`rule` 值域為 `HARD`／`S2TWP`；`suggestionSource` 與 `suggestionOptions[].source` 值域為 `S2TW`／`S2TWP`／`MAINLAND_TERMS`。

`--output` 僅供本機除錯；CI 與 `npm run language:report` 不帶此旗標，一律寫入預設 `artifacts/`。路徑安全先以 `path.resolve()` 驗證前綴，再對最近的既有祖先目錄做 `realpath`，把剩餘不存在區段以 `path.join` 還原，因此全新 checkout 上不存在的 `artifacts/` 仍可建立。拒絕指向外部或符號連結逃逸的路徑時回成功結束碼並提示限制（此拒絕路徑亦須有測試）。寫入失敗時 stderr 輸出 `REPORT_WRITE_FAILED`，stdout 輸出固定 JSON `{"ok":false,"code":"REPORT_WRITE_FAILED","bytes":0}`，結束碼仍為 0。

CI 構件檢查解析 meta 的 `degraded`、`candidateCount`、`exemptCandidateCount`、`violationCount` 與 `generatedAt`，檔案不存在、JSONL 首行無法解析為 meta 或空檔時發出警告，不能只檢查檔案非空。`candidateCount` 為零、`degraded` 為 false 且 `violationCount` 為零時視為有效但無候選證據，不因候選收斂而誤報；`violationCount > 0`、`candidateCount = 0` 且 `degraded` 為 false 時發出 `::warning::`，文案以 spec「有違規但零候選須警告」場景之完整字串為單一來源，僅說明「無 `s2tw` 可定位候選、正體違規須人工修正」單一原因，不列舉「全數受保護／全數豁免」（第七輪 M-3：零候選時兩個計數必為零，列舉會自我矛盾；第八輪 M-6：降級造成零候選時改由降級警告處理，不重複診斷）；另在 `candidateCount > 0` 且 `protectedCount === candidateCount` 或 `exemptCandidateCount === candidateCount` 時發出獨立警告，並驗證 `exemptCandidateCount <= unprotectedCount` 且 `unprotectedCount = candidateCount - protectedCount`。既有 Language check 步驟 SHALL 宣告 `id: language-hard-gate`，構件檢查以 `steps.language-hard-gate.outcome != 'success'` 取得布林結果並命名為 `hardGateFailed`；硬閘門成敗布林與 `violationCount > 0` 採布林式比對 `hardGateFailed !== (violationCount > 0)`，不一致時警告，不以數值相等比對，亦不得對布林值使用 `!== 0`（嚴格不等式因型別不同而恆真，會在硬閘門成功且零違規時誤發警告），亦不得「讀不到就當零」。`generatedAt` 以構件檢查步驟呼叫 `date -u +%Y-%m-%dT%H:%M:%SZ` 取得的 UTC 時刻為基準，接受前 15 分鐘至後 5 分鐘（不採 60 分鐘，避免舊構件被誤判為本次掃描）。欄位缺失或降級亦發出 `::warning::` 並寫入 `$GITHUB_STEP_SUMMARY`，摘要須輸出固定錨點 `LANGUAGE_SIGNOFF_REQUIRED` 與「語言警告未處理，合併前須人工簽核」，並嘗試為 PR 加上 `language-signoff-required` 標籤（失敗不影響結束碼）；標籤新增失敗時摘要 SHALL 額外輸出「標籤新增失敗，須人工確認語言簽核」；核閱文件 SIGNOFF 欄位則標註「語言警告已處理，合併前人工簽核」並填寫核閱者與日期。CI 新增步驟不得包含 `--fix`／`--approve`／`--revoke`，僅判斷簡體字出現與候選證據。

**理由**：僅排除 `artifacts/` 只保護預設路徑；序列化層與呈現層分離才能根治自訂輸出與核閱文件的自我污染。`candidateCount` 是本專案新增的明確欄位，取代來源「由 JSONL 列數推得」的隱含做法。受保護／未保護候選數、分層數量與保護來源狀態納入 meta，才能讓 task 6.3 的核閱數字有明確資料來源。

### 6. 受保護術語、PUA 不變式與可觀測的載入失敗

**決策**：受保護清冊由已知誤改詞（原文與誤改結果雙向收錄，含實測遭 `s2twp` 誤改為「專案」的繁體「項目」——該詞在臺灣亦指正當條目或細目）、法定單位名稱、靜態解析 `gasRuntime.js` 的工作表名稱常數與角色顯示名稱、`actionRegistry.js` 的 `logLabel`／`logDetailKey` 等中文中繼資料、`databaseInitializer.js` 的行政管理字面值，以及由 `@babel/parser` 掃描 `tests/**/*.js` 產生的字面值清冊組成。這些模組只能由 `scripts/` 外殼 require，不得放進 `quality-core/`。遮蔽採隨機前綴 trie，產生後先檢查與原始內容不相交，碰撞即重試；還原後比對專用區碼位集合是否完全相等。抽取失敗時 SHALL 輸出 `PROTECTED_TERMS_UNAVAILABLE` 並記錄於報告 meta 的 `protectedTermsStatus`，且保留既有靜態清冊，不得靜默回傳空清單；需以「抽掉來源後仍保留最低抽取數量」的契約測試驗證。字面值清冊產生後亦須通過「產生前後硬閘門違規數不變」驗證。

`s2tw` 定位使繁體「項目」根本不產生候選；受保護清冊仍雙向收錄「項目」與「專案」，用以保護正體原文位置不被改寫。**保護是候選原文的屬性**：`protected` 由候選 `original` 是否命中清冊決定，不由建議文字決定；受保護候選與豁免候選一律不寫入，並在 `authorizeCandidate()` 列為否決條件（見決策 3），不做為寫入模式的事後過濾。當候選原文為真正的簡體違規（如 `\u9879\u76ee`）時，人工核准的建議即使字面為「專案」仍得寫入，因為這是修正簡體違規而非誤改正體詞；此語意與 task 4.6 的端到端測試一致。硬閘門既有 `\u9879\u76ee` 簡轉「專案」違規判定維持不改動；但因所有寫入改採明確核准，修正模式對該位置的自動寫入行為消失，此為預期並須文件化。保護不影響硬閘門回報。來源的 `isProtectedByText()` 採雙向包含，可能過度標記；核閱文件 SHALL 記錄候選總數、受保護數與未保護數，並抽樣說明誤保護情形。

**理由**：來源專案初次掃描 471 筆未保護候選全數為誤改，印證保護機制的必要性。`actionRegistry.js` 載入時會寫 `globalThis`，故必須隔離於外殼。

### 7. 純函式核心與本專案品質工具鏈

**決策**：新增 `quality-core/` 存放六支無副作用模組：`openccStableId.js`、`openccTextDiff.js`、`openccCandidates.js`、`openccProtectedTerms.js`、`openccLanguageAnalysis.js`、`openccContractDrift.js`。`authorizeCandidate()` 與 `approvalState` 計算放在 `openccLanguageAnalysis.js`，不另增檔案，避免重複範圍設定；核准狀態與 `protected`／`exempt` 保護狀態合成為同一單一計算點，寫入模式僅以回傳 `AUTHORIZED` 做為準則。同步強制調整 `scripts/qualityConfig.js` 的 `SCOPE.include`／`SCOPE.sourcePatterns`、`scripts/checkComplexity.js` 的 `collectSourceFiles()`、`scripts/checkChangedCoverage.js` 的 `isInScope()` 與 `scripts/quality-baseline.json` 的 `scope.include`，使新目錄被完整納管。

`tests/qualityConfig.test.js` 的處理 MUST 區分三類：① 更新 `SCOPE.include` 精確陣列（加入 `quality-core/*.js`）與第 5 行過期註解；② `measuredAt === "2026-11-20"` 已是現值，連同第 79–85 行的歷史地板與第 89–101 行的 2026-11-18 過期快照斷言 SHALL 完整保留，不得改寫或刪除；③ `scripts/quality-baseline.json` 更新 `scope.include`／`scope.files`／`scope.methods`，其中 `measuredAt`、`miMin`、`crapMax`、`ratchet` 與歷史快照比較全部保留。現行基準 42／900 與目前收集結果 43／990 的差異代表「加入 `quality-core/` 前」的現況，最終數字以加入核心後重新量測為準，並在 commit 訊息與核閱文件說明。

**理由**：本專案 `scripts/*.js` 已在品質量測範圍，來源「放進 scripts/ 就自動不受約束」的假設不成立。若未同步改寫兩處寫死範圍，變更覆蓋率會把新核心當成「無可量測變更」而略過，形成假象。

### 8. CI 非阻斷報告與既有強制閘門並存

**決策**：保留既有全部強制步驟，於末端新增 OpenCC 可用性 smoke、報告產生、漂移檢查、構件檢查與 `actions/upload-artifact@v4`，全部使用 `if: always()` 與 `continue-on-error: true`，構件名稱含 `github.sha`。smoke 指令固定為 `node scripts/openccS2twp.js --smoke`；既有 Language check 步驟 SHALL 宣告 `id: language-hard-gate` 供構件檢查以 `steps.language-hard-gate.outcome` 取得布林結果，避免交叉比對讀不到結束碼而空轉。診斷代碼分為 `OPENCC_BINARY_MISSING`（平台 optional 二進位缺失）、`PARSER_UNAVAILABLE`（`@babel/parser` 缺失）與 `OPENCC_UNAVAILABLE`（其他載入／建構／轉換失敗），不得把環境故障誤報為語言問題；**歸屬步驟**：`PARSER_UNAVAILABLE` 僅由使用 `@babel/parser` 的契約漂移檢查步驟輸出，smoke（`node scripts/openccS2twp.js --smoke`）與報告步驟不載入解析器，僅輸出 `OPENCC_BINARY_MISSING` 或 `OPENCC_UNAVAILABLE`，避免在該兩步驟形成死碼或讓漂移檢查故障無明確診斷；映射規則為：`ERR_DLOPEN_FAILED` 或訊息含 `@opencc/opencc-` 前綴 → `OPENCC_BINARY_MISSING`，`MODULE_NOT_FOUND` 且含 `@babel/parser` → `PARSER_UNAVAILABLE`，其餘 → `OPENCC_UNAVAILABLE`，禁止 catch-all 一律回最後者，並以注入假錯誤至各自所屬步驟的測試驗證。CI 新增步驟僅讀取與回報，不得寫入原始檔。所有新增步驟維持 `continue-on-error: true` 的非阻斷設計（使用者既定方向），但警告不得被隱藏：工作流程摘要 SHALL 輸出固定錨點 `LANGUAGE_SIGNOFF_REQUIRED` 與「語言警告未處理，合併前須人工簽核」，並嘗試為 PR 加上 `language-signoff-required` 標籤（新增標籤步驟亦為非阻斷）；核閱文件 SIGNOFF 欄位則標註「語言警告已處理，合併前人工簽核」並填寫核閱者與日期。流程面於 `AGENTS.md` 補充硬性規則：帶此標籤或錨點的 PR，SIGNOFF 空白或 Reviewer 未明確核准時不得 squash merge；合併前查核 SHALL 主動檢查工作流程摘要是否含 `LANGUAGE_SIGNOFF_REQUIRED`，不得僅依賴 PR 標籤，錨點存在即視為帶警告，不因標籤缺失而放行；此規則不改變 CI 結束碼，符合使用者「CI 非阻斷」方向。另明文禁止並行執行核准與撤銷，避免舊快照覆蓋使已撤銷核准復活。`tests/qualityGatesWorkflow.test.js` 除既有指令存在性外，SHALL 新增步驟順序、smoke 指令、診斷代碼、固定錨點與「不含寫入旗標」斷言。

**理由**：報告是決策輔助而非合併條件；構件與 meta 檢查避免「報告步驟被跳過但 CI 仍全綠」。

### 9. 命令列介面相容

**決策**：保留 `npm run check:lang` 與 `.husky/pre-commit` 對 `node scripts/languageCheck.js` 的呼叫方式完全不變；新增六個 scripts（`language:report`、`language:check`、`language:fix`、`language:approve`、`language:revoke`、`language:smoke`），不新增 `check:language` 別名。`language:check` 嚴格等同 `--dry-run`。多旗標同時出現時依 `--report` → `--dry-run` → `--fix` → `--approve` → `--revoke` 優先序解析。`--approve` 接受 `suggestionSource` 與對應建議，必須存在於候選的 `suggestionOptions`；核准紀錄綁定該選擇，`--fix` 據以寫入。零違規錨點說明只寫入 `README.md` 與 `AGENTS.md`，不進 `check:lang` 輸出。

**理由**：讓人工選詞可被追溯，且避免 `--fix` 自行挑選建議而重現 s2twp 誤改。

### 10. 契約字面值清冊範圍與漂移門檻

**決策**：沿用來源的 AST 全量收集（含中文的 `StringLiteral` 與 `RegExpLiteral`），排除豁免註解與 Unicode 跳脫負面字面值；清冊定位為「測試中文字面值聯集」而非僅限斷言。`@babel/parser@7.29.15` 用於正確區分註解、字串與正則，避免正規表達式誤收。漂移檢查新增僅警告、回 0；移除數量超過 `max(10, ceil(清冊筆數 × 0.05))` 時回非零；解析失敗亦回非零並輸出檔案與訊息。CI 非阻斷步驟需以 `::warning::` 讓警告被看見。

### 11. 提交、封存與部署策略

**決策**：依 AGENTS.md 硬性規則，提案文件先獨立提交；每完成一個 task 即驗證並原子提交。全部完成後封存變更、本地端完整 CI 預跑、發起 PR 並經雙代理審查，所有意見解決後 squash merge；於 `main` 重新建置並以固定 Deployment ID 執行部署。`.claspignore` 由 `!docs/**` 縮窄為 `!docs/**/*.html`，使 7 個 `WEB_APP_DOC_ROUTES` 白名單 HTML 仍上傳、新增 Markdown 與 PDF／CSV 不上傳，既有 `docs/quality-baseline-2026-11-20.md` 亦改為不上傳。此變更實質修改已封存的 `system-settings-and-docs` main spec，故 proposal 的 Modified Capabilities 明確宣告該能力，並新增 `specs/system-settings-and-docs/spec.md` delta 改寫部署放行 requirement，避免封裝後 main spec 與實作漂移。task 1.6 中的 `npx clasp status` 改為選擇性人工交叉驗證，需登入憑證且無憑證時可略過，忽略規則正確性以契約測試為完成條件。

### 12. s2tw 定位、多來源建議與全數核准寫入

**決策**：來源 `isWritable()` 僅檢查 `rule === HARD` 即自動寫入，且 `buildS2twpCandidates()` 在 `hasConcreteMapping === false` 時以 s2twp 建議覆寫但仍保留 `rule === HARD`；實測更顯示 s2twp 連繁體「項目」「數據」「權限」都會誤改。本專案徹底改寫此路徑：① 候選存在由 `s2tw` 差異決定，s2twp 差異不得單獨建立候選，且其建議僅附加在已定位候選上；由正體字組成的中國用語違規（`\u652f\u6301`、`\u914d\u7f6e`、`\u53bb\u91cd`、`\u54c8\u5e0c`）仍由硬閘門回報、人工修正，不進候選工具；② 每筆候選提供 `suggestionOptions`（`S2TW`／`S2TWP`／`MAINLAND_TERMS`），因候選必由 `s2tw` 定位，預設 `suggestion` 恆為最保守的 `S2TW` 字級結果；③ 所有候選含 `rule === HARD` 與 `MAINLAND_TERMS` 來源者，皆須人工挑選並以 `--approve` 明確核准，`--fix` 僅寫入核准紀錄綁定的建議；④ 核准時驗證所選建議仍在目前 `suggestionOptions`，避免建議漂移或遭竄改。`original` 粒度：命中硬違規詞時取該詞完整字面，否則取 `s2tw` 差異的最小替換單元；此規則僅適用於同時命中 `s2tw` 差異者（由正體字組成的違規不產生候選故不適用），且 SHALL 先決定 `original` 再進行最長優先重疊合併；此規則直接影響 ID、`occurrenceIndex` 鍵與建議比對，必須以 `\u9879\u76ee` 與 `\u4ec5` 對照測試鎖定。重疊候選合併僅保留最長替換單元，並沿用其 `rule`、`suggestionSource` 與 `suggestionOptions`，較短候選被丟棄不另行合併來源。分層 `high`／`pending` 僅供排序，`high` 為 s2tw 定位且命中硬閘門違規者，`pending` 為 s2tw 定位但未命中者；「有硬違規但零候選」不代表合規，CI 須警告。

**理由**：這是本變更的核心安全承諾。以 s2tw 定位根除「正體詞被當成候選」的誤判來源；以多來源建議提供人工參考（不宣稱處理純正體慣用語，因 s2tw 無差異即無候選）；以全數核准確保「項目／專案」這類上下文判斷由人負責，而非機械規則；以明確邊界避免硬閘門紅燈時工具無從介入而被誤讀為安全。

**替代方案考慮**：沿用來源「HARD＋MAINLAND_TERMS 可直接寫入」（實測「報告項目」會被誤改為「報告專案」）；只用 s2twp 定位（正體「項目」即產生候選）；把候選來源擴大為「s2tw 差異 ∪ 硬違規」（違背使用者選定的「候選改用 s2tw 定位」方向）；只提供單一建議（人工無從挑選）。皆不採用。

## Risks / Trade-offs

- [Risk] 新增 `quality-core/` 使品質量測分母與 ratchet 基準變動 → Mitigation：先補契約測試，重新量測後僅更新範圍與 `scope.files/methods`，歷史地板保持不變；任一維度惡化即先補測試或重構。
- [Risk] OpenCC 原生二進位在 Node 24 不可用、全員降級或版本漂移 → Mitigation：精確版號、延遲載入、`OPENCC_UNAVAILABLE` 降級、固定 smoke 指令，構件檢查解析 meta 並輸出警告。
- [Risk] 人工選錯 `S2TWP` 建議（例如把「報告項目」選成「報告專案」） → Mitigation：`s2tw` 定位、繁體「項目」原文位置雙向保護、`suggestionOptions` 完整呈現、核准綁定建議、核閱文件記錄挑選理由，核准清冊可為空白；真正簡體 `\u9879\u76ee` 候選核准寫入「專案」屬預期行為，以端到端測試鎖定。
- [Risk] 核准清冊或報告／核閱文件自我命中硬閘門 → Mitigation：序列化層與呈現層分離、每次寫入純 ASCII 驗證、`artifacts/` 加入硬閘門排除，並以回歸測試鎖定違規數不變。
- [Risk] 序列化被誤實作成自訂解碼或字面雙反斜線 → Mitigation：精確定義 JSON 標準跳脫、`JSON.parse` 唯一解碼點，並以純 ASCII 與序列化來回測試驗證。
- [Risk] `⓪` 守門被略過使含 `\0` 紀錄取得授權 → Mitigation：`\0` 守門列為決策表第一步且優先於①②③，並以「含 `\0` 且 ID 自洽仍回 `INVALID_RECORD`」反向回歸測試鎖定。
- [Risk] `protected`／`exempt` 僅在寫入模式事後過濾，使 `authorizeCandidate()` 回 `AUTHORIZED` 而報告與行為不一致，甚至誤以通過該函式為唯一寫入條件而寫入受保護候選 → Mitigation：第九輪 Major-2 將否決提前至決策表步驟⓪-a，回 `UNAPPROVED` 並以 `PROTECTED_BY_ORIGINAL`／`EXEMPT_BY_POLICY` 標註，報告如實反映；寫入模式僅以 `AUTHORIZED` 為準，並以「已核准但受保護或豁免仍不寫入」的端到端測試鎖定。
- [Risk] 舊識別碼 `reportedId` 路徑退化成死碼或讓失效核准復活 → Mitigation：`candidateFromReportEntry()` 保留 `id` 做為否決與診斷證據；`reportedId` 不授予正向寫入權限，但 MUST 被查詢。四欄位任一改變回 `ORIGINAL_MISMATCH`；工具版本升級使舊 ID 驗證失敗回 `INVALID_RECORD` 並標註 `ID_ALGORITHM_CHANGED`，兩者皆要求重新核准，並在 `buildReportData()` 與 `--fix` 兩條路徑驗證。
- [Risk] 穩定 ID 因同行格式化或相同字面值插入而失效 → Mitigation：文件化限制、`approvalState`／`approvalReason` 標示原因、要求重新核准，且 `reportedId` 不得使核准復活。
- [Risk] 建議選項漂移被誤判為清冊無效 → Mitigation：第五輪 B2 統一為 `ORIGINAL_MISMATCH`（內容變動）而非 `INVALID_RECORD`，並以選項遭替換的測試鎖定。
- [Risk] 由正體字組成的中國用語違規形成「硬閘門紅燈、報告零候選」假保險 → Mitigation：第五輪 B1 明文界定候選工具範圍、CI 構件檢查比對 `violationCount` 與 `candidateCount` 並輸出警告、核閱文件逐條記錄人工修正證據。
- [Risk] `s2twp` 建議被誤解為可處理純正體慣用語 → Mitigation：第五輪 M1 明文「建議僅附加在 s2tw 已定位候選」，文件與報告 meta 禁止相關宣稱，並以「鼠標」案例測試鎖定。
- [Risk] `original` 粒度不一致使 ID、`occurrenceIndex` 鍵與建議比對漂移 → Mitigation：第五輪 M2 明定「命中硬違規取完整詞、否則取最小替換單元」，並以 `\u9879\u76ee` 與 `\u4ec5` 對照測試鎖定。
- [Risk] `violationCount` 受限於報告排除清冊，使 `openspec/`／`docs/參考資料/` 違規形成假保險 → Mitigation：第六輪 B1-1 明定其為硬閘門同範圍違規總數，由報告模式直接呼叫 `checkProject()` 加總取得，不得呼叫 `main()`；第七輪 M-1 另以布林式比對硬閘門結束碼與該欄位，並以測試鎖定報告 stdout 與結束碼不受影響。
- [Risk] 竄改報告的 `approvalState`／`suggestion` 繞過核准 → Mitigation：第六輪 M-2 明定報告欄位非授權來源，`--fix` 一律重新計算，並加入竄改報告仍不得寫入的測試。
- [Risk] 目前 ID 命中但 `reportedId` 指向不同建議時寫入非所選建議 → Mitigation：第六輪 M-3 明定兩者建議不同即回 `ORIGINAL_MISMATCH` 並要求重新核准。
- [Risk] CI 警告非阻斷使未處理違規被合併 → Mitigation：第六輪 M-6 維持非阻斷承諾，工作流程摘要輸出 `LANGUAGE_SIGNOFF_REQUIRED` 錨點並標記 PR，核閱文件 SIGNOFF 欄位標註「語言警告已處理，合併前人工簽核」；第七輪 M-4 另於 `AGENTS.md` 禁合流程補充：標籤或錨點存在且 SIGNOFF 空白時不得 squash merge。
- [Risk] `contextHash` 跨行取值使核准因前方插入新行而失效 → Mitigation：第六輪 M-5 統一為「同一行內前後各 24 個 UTF-16 碼，不跨行」，並加入檔案前方插入新行仍授權的測試；第七輪 m-2 補充靠行首／行尾不足處以空字串補齊。
- [Risk] 零候選警告列舉「全數受保護／全數豁免」與計數定義自我矛盾 → Mitigation：第七輪 M-3 改為單一原因警告，另新增 `exemptCandidateCount` 並在 `candidateCount > 0` 時發出互斥的獨立警告。
- [Risk] `reportedId` 被描述為「僅供診斷」卻又必需查詢以否決授權，造成實作省略查表 → Mitigation：第七輪 M-2 改稱「否決導向」，明文 MUST 查詢但不授予正向授權，並在 ① 加入舊紀錄四欄位驗證；第八輪 B-2 另明確 `isStableIdValid()` 重算主語為紀錄自身欄位，避免格式化情境誤回 `INVALID_RECORD`。
- [Risk] 硬閘門成敗無取得來源，使布林交叉比對讀不到就當零、警告永不觸發 → Mitigation：第八輪 B-1 要求既有 Language check 步驟宣告 `id: language-hard-gate`，構件檢查以 `steps.language-hard-gate.outcome != 'success'` 取得布林結果並命名為 `hardGateFailed`；第九輪 Major-1 統一布林表徵，比對式改為 `hardGateFailed !== (violationCount > 0)`，移除 `!== 0` 以免因型別不同而恆真，並以工作流測試鎖定 id、outcome 與「硬閘門成功且零違規不誤發警告」。
- [Risk] `APPROVAL_TAMPERED` 無判準或無測試，使診斷碼不可區隔 → Mitigation：第八輪 M-1 明定診斷延遲至 `authorizeCandidate()`，舊紀錄四欄位與候選相同標 `ID_ALGORITHM_CHANGED`、不同標 `APPROVAL_TAMPERED`，載入時僅標記無效，並在三處 task 補測試。
- [Risk] 原型相關鍵讓從未核准的紀錄取得授權 → Mitigation：第八輪 M-3 要求 `approvals` 為 plain object、查表僅用 `Map` 或 `Object.hasOwn()`，含 `__proto__`／`constructor`／`prototype` 即 fail-closed，並補清冊測試。
- [Risk] 並行核准／撤銷讓已撤銷核准復活 → Mitigation：第八輪 M-4 於 README／AGENTS 明文禁止並行操作、由 PR 流程序列化，並以序列化情境測試鎖定。
- [Risk] `protected` 與 `exempt` 重疊破壞計數不變式 → Mitigation：第八輪 M-5 明定 `protected` 優先、`exempt` 僅適用未受保護候選，並驗證 `exemptCandidateCount <= unprotectedCount` 與 `unprotectedCount = candidateCount - protectedCount`。
- [Risk] 降級造成零候選時重複且矛盾的診斷 → Mitigation：第八輪 M-6 同步 design／tasks 的 `degraded === false` 條件，與 spec 一致，改由降級警告單獨處理。
- [Risk] 標籤新增失敗使 SIGNOFF 空白仍可合併 → Mitigation：第八輪 M-2 要求摘要額外警示、合併前主動檢查 `LANGUAGE_SIGNOFF_REQUIRED` 錨點，錨點存在即視為帶警告，不因標籤缺失放行。
- [Risk] 舊報告被誤判為本次有效掃描 → Mitigation：第八輪 m-2 將 `generatedAt` 容忍窗口由 60 分鐘縮短為 15 分鐘，並以 `date -u` 為基準。
- [Risk] 報告系列模式誤掃 `AGENTS.md` 造成假違規 → Mitigation：報告排除清冊補入 `AGENTS.md` 與 `package-lock.json`，並以「硬閘門零違規時 `--dry-run` 回 0」測試鎖定。
- [Risk] 受保護來源抽取失敗造成無聲失效 → Mitigation：`PROTECTED_TERMS_UNAVAILABLE` 狀態寫入 meta `protectedTermsStatus`、最低抽取數量契約測試。
- [Risk] 修正模式破壞尾端換行或部分遮蔽未還原 → Mitigation：以 `split("\n")`/`join("\n")` 互為逆運算、先全部還原再一次批次寫入，並以 hex 比對回歸測試驗證。

## Migration Plan

1. 建立獨立開發分支並先提交提案文件；安裝精確版號 devDependency，驗證 Node 24 上的 `s2tw`／`s2twp` 黃金案例與正體不變案例。task 1.2 只驗證版號與 scripts，smoke 留待 3.1。
2. 加入 `quality-core/` 與契約測試，強制更新品質設定範圍、寫死探索規則與基準可變欄位，確認完整品質閘門通過。
3. 加入 OpenCC 雙轉換器外殼、受保護清冊（含可觀測失敗狀態）、序列化層核准清冊與字面值產生器，逐項驗證測試。
4. 擴充 `languageCheck.js` 的四模式與報告輸出（含 `suggestionOptions`、`reportedId`、`approvalState`），保留舊 API 與鉤子行為，更新相關既有測試。
5. 在四模式完成後建立端到端核准寫入測試（人工選詞→核准→`--fix` 寫入指定建議）與 CI 非阻斷步驟，加入文件（README、AGENTS、SOURCES、核閱結論），執行本地完整 CI 預跑。
6. 執行全專案報告與人工核閱，從 `suggestionOptions` 逐筆挑選合適建議並記錄理由；必要時調整受保護清冊；預設不寫入任何原始檔。
7. 封存變更、PR 雙代理審查、集中修正、squash merge；於 `main` 建置並以固定 Deployment ID 部署。

回滾策略：工具引入與各批次調整各自獨立 commit，出問題可個別 revert；若已 squash merge，則以 revert 整筆 PR 處理，再重新建置與部署。

## Open Questions

無。第 1 輪至第 4 輪雙代理審查提出的爭議（核准清冊自我命中與序列化、呈現層與序列化層混淆、舊識別碼與失效狀態與決策表、HARD／s2twp 重疊授權與合併來源歸屬、`\0` 欄位碰撞與 `⓪` 守門優先序、`reportedId` 合法路徑缺測試、報告排除清冊、漂移門檻、高精度定義、品質基準連動、構件新鮮度、動態抽取失敗可見性與 meta 欄位、輸出範圍與別名語意、相依故障診斷映射與 `@opencc/opencc-` 前綴、呈現層多字詞禁詞殘留、清冊版本 fail-open 與空白清冊內容、`.claspignore` 能力漂移與 delta 宣告、`項目` 誤改保護、meta 受保護／分層統計欄位、危險輸出路徑驗證）已於上述決策定案。第 5 輪起因使用者洞察而新增的 `s2tw` 定位／多來源建議／人工選詞／全數核准寫入／CI 只報不寫方向，以及第五輪複審提出的 B1（正體違規邊界與零候選假保險）、B2（建議漂移統一為 `ORIGINAL_MISMATCH`）、B3（`reportedId` 授權僅限四欄位完全相同）、M1（`s2twp` 建議附加性）、M2（`original` 粒度）與各項 Minor，以及第六輪複審提出的 B1-1（`violationCount` 範圍）、B2/B3-1（工具升級例外不可達，改為一律失效）、M-1（`file` 比對）、M-2（報告欄位非授權來源）、M-3（建議衝突重新核准）、M-4（`candidateCount` 語意）、M-5（`contextHash` 不跨行）、M-6（非阻斷警告的人工簽核）、M-7（`--ignore-scripts` 乾淨安裝後 smoke）與各項 Minor，以及第七輪挑戰複審提出的 B-1（`isStableIdValid()` 語意明確、移除不可達升級分支）、M-1（`checkProject()` 呼叫方式與布林比對）、M-2（`reportedId` 改為否決導向）、M-3（零候選警告原因收斂與 `exemptCandidateCount`）、M-4（SIGNOFF 標籤與禁合規則），以及第七輪一致性複審提出的 B-1（受保護語意改為候選原文屬性，允許 `\u9879\u76ee` 候選核准寫入「專案」）與各項 Minor，以及第八輪挑戰複審提出的 B-1（硬閘門成敗由 `id: language-hard-gate` 與 `steps.*.outcome` 取得）、B-2（`isStableIdValid()` 重算主語為紀錄自身欄位）、M-1（`APPROVAL_TAMPERED` 判準與測試）、M-2（SIGNOFF 標籤失敗仍須查核錨點）、M-3（原型污染 fail-closed）、M-4（禁止並行核准）、M-5（`protected` 優先於 `exempt` 與計數不等式）、M-6（零候選警告補 `degraded === false`）與各項 Minor，以及第八輪一致性複審提出的 M-1（`proposal.md` 補 `exemptCandidateCount`）、M-2（`APPROVAL_TAMPERED` 測試）、m-3（診斷判準）、m-4（不等式）、m-5（報告非空），以及第九輪雙代理複審提出的 Major-1（布林表徵統一為 `hardGateFailed`，移除 `!== 0`）、Major-2（`protected`／`exempt` 否決納入 `authorizeCandidate()` 單一計算點）、Minor-1（概述段落補 `degraded === false` 並統一警告文案來源）與 Minor-2（`PARSER_UNAVAILABLE` 歸屬漂移檢查步驟），亦已完整納入。
