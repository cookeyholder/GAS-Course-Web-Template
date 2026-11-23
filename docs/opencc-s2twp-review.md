# OpenCC 簡體轉臺灣繁體全專案掃描與核閱結論

> 本文件記錄 `port-opencc-zh-tw-language-check` 變更之全專案掃描、受保護清冊核閱、
> 逐筆建議挑選與核准寫入判定結果，作為日後查核與人工簽核依據。
> 本文件屬**只報不寫**之核閱證據，不代表已對原始檔進行自動改寫。

## 一、掃描環境與資料來源

- OpenCC 版本：`1.4.2`（精確鎖定，官方 Node 套件）。
- 解析器版本：`@babel/parser@7.29.15`（精確鎖定，僅供契約字面值清冊產生器使用）。
- 定位模式：`s2tw`（候選存在與位置**僅由此差異決定**）；`s2twp` 與 `MAINLAND_TERMS`
  僅附加建議選項，不得單獨建立候選。
- 硬閘門字典：`SIMPLIFIED_CHARACTERS` ∪ `MAINLAND_TERMS`，維持既有判定不變。
- 報告來源：`artifacts/language-report.jsonl` 首行 meta 與逐筆候選，
  由 `npm run language:report` 於 `2026-11-23T10:54:23.251Z` 產生。
- 報告掃描範圍：`TARGET_EXTENSIONS`（`.js`、`.md`、`.html`、`.yml`、`.yaml`、`.json`），
  排除 `node_modules/`、`coverage/`、`.git/`、`dist/`、`.clasp/`、`artifacts/`、`build/`
  與報告專用排除清冊；硬閘門另含 `openspec/` 與 `docs/參考資料/`，僅排除 `artifacts/`。

## 二、掃描結果摘要（與報告 meta 逐欄一致）

| 項目           | 報告欄位               | 數值                          |
| -------------- | ---------------------- | ----------------------------- |
| 硬閘門違規數   | `violationCount`       | 0                             |
| 候選總數       | `candidateCount`       | 63                            |
| 受保護候選數   | `protectedCount`       | 50                            |
| 未保護候選數   | `unprotectedCount`     | 13                            |
| 豁免候選數     | `exemptCandidateCount` | 10                            |
| 豁免行數       | `exemptLines`          | 10                            |
| 高信心候選數   | `tierCounts.high`      | 0                             |
| 待核可候選數   | `tierCounts.pending`   | 63                            |
| 降級與否       | `degraded`             | false                         |
| 降級原因       | `degradedReason`       | 空字串                        |
| 受保護清冊狀態 | `protectedTermsStatus` | `AVAILABLE`                   |
| 契約字面值漂移 | `literalDrift.drifted` | false（新增／移除皆為空陣列） |

計數不變式驗證：`exemptCandidateCount`（10）≤ `unprotectedCount`（13），且
`unprotectedCount`（13）＝ `candidateCount`（63）－ `protectedCount`（50）。兩式皆成立。

`outOfScopeFiles` 自動掃描範圍外待人工核對檔案：`.clasp.json.example`、`.claspignore`、
`.gitignore`、`.husky/pre-commit`、`.prettierignore`、`webapp/styles.css`。
前五者為點檔或殼層指令，無中文註解；`webapp/styles.css` 之人工確認證據見第七節。

## 三、同類合併判定與抽樣規則

1. **同類合併鍵**：以 `file`、呈現層跳脫後的 `original`、呈現層跳脫後的 `suggestion`、
   `reason` 四欄位相同者視為同一類；同類僅記錄一筆代表與出現次數，避免逐行重複論述。
2. **受保護抽樣規則**：50 筆受保護候選依 `original` 移除重複後共 6 類，全數抽樣核閱，
   不採隨機抽樣，確保每類皆有用語判斷依據。
3. **未保護全數規則**：未保護且非豁免候選僅 3 筆（13 減 10），全數逐筆核閱，
   不設抽樣門檻；10 筆豁免候選另於第四節獨立說明。
4. **分層規則**：`tierCounts.high` 為 0，故無高信心候選可自動寫入；63 筆全數
   `pending`，依工具紀律僅供人工挑選，不因 `rule === "HARD"` 或建議來源而自動核准。
5. **核閱完成條件**：重新產生報告後 `candidateCount` 仍為 63，未因受保護清冊調整而下降；
   3 筆未保護非豁免候選全數歸類完畢，無未分類項目，歸類結果見第五節。

## 四、豁免候選與受保護候選核閱

### 4.1 豁免候選（10 筆）

10 筆皆為原始檔中標記行內豁免標記（`language-check:` 後接 `ignore`）的行，報告以空 `original`、空
`suggestion` 與 `EXEMPT_BY_POLICY` 記錄。依工具紀律，豁免候選一律不寫入；
此 10 筆同時計入 `exemptCandidateCount`（10）與 `exemptLines`（10），數字一致。

### 4.2 受保護候選（50 筆，移除重複後 6 類）

下表 `original` 與 `suggestion` 依呈現層規則，將**所有非 ASCII 字元**一律轉為
`\uXXXX`，不逐詞比對簡體字集。此為人工全數跳脫紀律，避免核閱文件自身引入
未跳脫之候選原文而污染硬閘門。

| 呈現層原文                        | 呈現層建議                        | 出現次數 | 保護理由                                                                                  |
| --------------------------------- | --------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `\u53f0`                          | `\u81fa`                          | 17       | 臺灣慣用「平台」「後台」之「台」正當用法，非「臺」之簡體                                  |
| `\u6c61`                          | `\u6c59`                          | 11       | 臺灣慣用「污染」之「污」，「汙」為罕用異體                                                |
| `\u5fa1`                          | `\u79a6`                          | 13       | 測試註解「防禦」語境之字級契約字面值，誤改為「禦」會破壞契約                              |
| `\u8868`                          | `\u9336`                          | 4        | 「表格」「報表」之「表」正當用法，「錶」僅用於手錶                                        |
| `\u5e72`                          | `\u5e79`                          | 4        | 「若干」之「干」正當用法，「幹」語意不同                                                  |
| `\u5bb6\u5177\u6728\u5de5\u79d1…` | `\u50a2\u4ff1\u6728\u5de5\u79d1…` | 1        | 108 課綱科別代碼契約字面值，開頭「\u5bb6\u5177」誤改為「\u50a2\u4ff1」會破壞 1NF 對照字典 |

受保護清冊已含上述原文與誤改結果之雙向收錄，來源包含 `KNOWN_MISTRANSLATIONS`、
法定單位名稱，以及由 `gasRuntime.js`、`actionRegistry.js`、`databaseInitializer.js`
靜態抽取之中文契約字面值與 `tests/**/*.js` 之 AST 字面值清冊。本次核閱**未發現
新的 OpenCC 過度轉換**，故受保護清冊無需增修，`candidateCount` 維持 63。

> **呈現層誤讀提醒**：若候選 `original` 本身是字面 `\uXXXX` 六字元（反斜線加 `u`
> 加四碼十六進位），呈現層會再跳脫一層而顯示為 `\\uXXXX`（雙反斜線）。此為
> `\uXXXX` JSON 標準跳脫與呈現層逐碼元跳脫疊加的預期結果，不代表原始檔
> 含雙反斜線。本報告之科別字面值候選即屬此類，切勿據此判定為簡體違規。

## 五、未保護非豁免候選逐筆判定（3 筆）

下列 `original`／`suggestion` 同樣依呈現層全數跳脫。每筆皆記錄所選來源與理由，
並歸類為「diff 對齊工具輸出」或「已補入受保護清冊」兩類之一。

| 呈現層 ID          | 檔案位置                                      | 呈現層原文 → 建議   | 所選來源 | 歸類              | 理由                                                                                                         |
| ------------------ | --------------------------------------------- | ------------------- | -------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `cf05e2df5a78e1a3` | `docs/gis-login-guide.html:359:54`            | `\u5360` → `\u4f54` | `S2TW`   | diff 對齊工具輸出 | 上下文呈現層為「\u6436\u5360」，臺灣標準用語呈現層為「\u6436\u4f54」；工具 diff 與慣用法一致，判定為有效建議 |
| `a0a6c1420278d5ce` | `docs/rbac-guide.html:675:51`                 | `\u5360` → `\u4f54` | `S2TW`   | diff 對齊工具輸出 | 與上一筆同類同建議，上下文亦為「\u6436\u5360」，同類合併判定成立                                             |
| `5669d3aeb56257bf` | `quality-core/openccLanguageAnalysis.js:7:39` | `\u4ec5` → `\u50c5` | `S2TW`   | diff 對齊工具輸出 | 註解呈現層為「\u4ec5\u4f9b」，屬簡體字；臺灣正體呈現層為「\u50c5\u4f9b」；工具 diff 正確                     |

**核准寫入判定**：三筆所選建議皆為 `S2TW` 來源，但因核准清冊維持空白、
`tierCounts.high` 為 0，且本次核閱採「預設不寫入任何原始檔」原則，故**不核准、
不寫入**；此判定與「diff 對齊工具輸出」歸類互不衝突，後者僅說明建議本身有效，
不代表已取得寫入授權。依任務紀律，三筆全數歸類完畢即滿足完成條件，不要求歸零。

## 六、硬閘門違規但零候選之人工修正證據

由正體字組成的中國用語違規不在 `s2tw` 候選範圍，仍須由硬閘門回報並人工修正。
本次掃描 `violationCount` 為 0，表示目前原始檔已無此類違規；下列逐條記錄
「修正前（禁用）→ 修正後（臺灣用語）」配對，做為人工修正前後證據與日後對照：

| 修正前（禁用，呈現層跳脫） | 修正後（臺灣用語，呈現層跳脫） | 目前狀態                                                        |
| -------------------------- | ------------------------------ | --------------------------------------------------------------- |
| `\u652f\u6301`             | `\u652f\u63f4`                 | 原始檔僅以跳脫字面出現在文件與工具註解，非實際違規；硬閘門 0 項 |
| `\u914d\u7f6e`             | `\u8a2d\u5b9a`                 | 同上；工具和文件已改用「設定」                                  |
| `\u53bb\u91cd`             | `\u907f\u514d\u91cd\u8907`     | 同上；工具和文件已改用「避免重複」                              |
| `\u54c8\u5e0c`             | `\u96dc\u6e4a`                 | 同上；工具和文件已改用「雜湊」                                  |

不得以「候選工具未涵蓋」視為合規：上述四詞由 `MAINLAND_TERMS` 硬閘門把關，
本次 0 違規是人工修正後的結果，而非工具忽略所致。CI 構件檢查另以
`hardGateFailed !== (violationCount > 0)` 布林比對防止假保險。

## 七、自動範圍外檔案與特殊目錄人工確認

### 7.1 CSS 人工確認

`webapp/styles.css` 不在 `TARGET_EXTENSIONS` 內，另行人工確認：

- 逐一檢視檔案內之中文註解與樣式說明（含多款風格標題、對比與無障礙說明）。
- 以硬閘門字典獨立比對該檔中文內容，結果為 0 項違規。
- 結論：無需轉換，亦無簡體字或中國用語。

其餘五個 `outOfScopeFiles`（`.clasp.json.example`、`.claspignore`、`.gitignore`、
`.husky/pre-commit`、`.prettierignore`）為點檔或殼層指令，無中文標點或註解，
人工確認無需轉換。

### 7.2 `openspec/` 與 `docs/參考資料/` 人工確認

報告系列模式排除 `openspec/` 與 `docs/參考資料/`，但硬閘門仍掃描兩處。
本次 `violationCount` 由報告模式直接呼叫 `checkProject()` 取得，涵蓋上述兩處，
結果為 0。兩處文件皆以臺灣繁體中文撰寫，無需人工修正。

## 八、漂移檢查與核准寫入路徑驗證

- 漂移檢查：`node scripts/generateOpenccS2twpContractLiterals.js --check` 通過，
  `literalDrift.drifted` 為 false。
- 核准清冊：`scripts/openccS2twpApprovals.json` 維持空白
  `{ "version": 1, "approvals": {} }`。
- 寫入路徑：`npm run language:fix` 不產生任何原始檔變更。核准寫入與撤銷機制
  已由 `tests/languageCheckEndToEnd.test.js` 與 `tests/languageCheckBoundaries.test.js`
  端到端驗證，代表工具能力可用，只是本次掃描結論為「無需核准寫入」。
- 直接改寫清冊等同核准，信任邊界為 Pull Request 核閱；明文禁止同時執行
  多個 `--approve`／`--revoke`／`--fix`。

## 九、雙重防線與重現指令

1. **人工全數跳脫紀律**：引用候選原文時，所有非 ASCII 字元一律 `\uXXXX` 跳脫，
   不逐詞比對；本文件第四至六節已遵循。
2. **完成後再跑一次硬閘門**：文件完成後執行 `npm run check:lang`，確認 0 違規，
   避免呈現層或內文引入未跳脫之禁詞。

```bash
npm run check:lang
npm run language:report
node scripts/generateOpenccS2twpContractLiterals.js --check
npm run language:fix
git status --short
```

`git status --short` 除本文件與報告構件（位於已排除之 `artifacts/`）外，
無預期外異動。

## SIGNOFF

- 核閱結論：**語言警告已處理，合併前人工簽核**
- 核閱者：cookeyholder（儲存庫擁有者人工簽核）
- 日期：2026-11-23
- 與工作流程摘要之 `LANGUAGE_SIGNOFF_REQUIRED` 錨點及
  「語言警告未處理，合併前須人工簽核」語意不同：前者代表仍有警告待處理，
  本欄代表警告已由人工處理並完成簽核，兩者不得互換。合併前須查核工作流程
  摘要不再出現該錨點，且不得僅依賴 `language-signoff-required` 標籤。
