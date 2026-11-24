# Tasks

依 `AGENTS.md`，每完成一個 task 須先驗證再獨立提交一個 commit。凡触及 `webapp/` 的 task 必須同時執行 `npm run build:webapp` 並把更新後的 `index.html` 納入同一個原子提交，以滿足 CI 的 `git diff --exit-code -- index.html`。

## 0. 提案先行落盤

- [x] 0.1 確認兩輪雙代理審查修訂皆已寫入 `openspec/changes/port-three-visual-styles/`，執行 `npm run format:check`、`openspec validate port-three-visual-styles --strict` 與 `npm run check:lang`；將整份提案獨立提交一次（commit 僅含該目錄），驗證 `git show --stat HEAD` 只列出提案檔案。**必須在 task 1 前完成。**

## 1. 註冊風格清單與持久化契約

- [x] 1.1 在 `webapp/js/config.js` 的 `styles[]` 末端加入 `navy-brick`「藏青磚紅 (Navy Brick)」`📘`、`celadon-mint`「青瓷薄荷 (Celadon Mint)」`🍵`、`cover-lime`「封面檸檬 (Cover Lime)」`🍋` 三筆（含 `desc`）；將 `tests/webappConfig.test.js` 的 13 款斷言改為 16，補上三款中繼資料、既有順序、`defaultStyle === "modern-slate"` 與 `styleKey === "gas_tmpl.style.v1"` 斷言；確認 `tests/webappUiToggleTheme.test.js` 無須變更、`git diff webapp/js/ui.js` 為空；執行 `npm run build:webapp` 並連同 `index.html` 提交；驗證 `npm test` 通過。
- [x] 1.2 新增 `tests/visualStyleThemes.test.js`，使用 `buildFrontendConfig()` 的真實設定驗證三款新 id 的 `applyStyle()`、`initThemeAndStyle()`、`toggleTheme()` 後風格不變、未知 id 回退至 `modern-slate` 且寫入風格儲存鍵、其他設定不被改寫，以及 `<option>` 同時含圖示與名稱；驗證 `npm test` 通過。

## 2. 新增三款色票與深色變體

- [x] 2.1 在 `webapp/styles.css` 檔尾加入 `navy-brick` 淺色與深色完整角色區塊，數值依 `design.md` D2（淺色 `--accent-bg` 為 `#f7ece8`、`--ink-3` 為 `#5f6d7e`），並於新測試檔加入角色斷言；執行 `npm run build:webapp` 並連同 `index.html` 提交；驗證 `npm test` 與 `npm run check:contrast` 通過。
- [x] 2.2 加入 `celadon-mint` 淺色與深色角色區塊與斷言（淺色 `--ink-3` 為 `#52746a`）；執行 `npm run build:webapp` 並連同 `index.html` 提交；驗證 `npm test` 與 `npm run check:contrast` 通過。
- [x] 2.3 加入 `cover-lime` 淺色與深色角色區塊、`--cover-lime` 局部變數、檸檬底墨黑字契約與斷言；執行 `npm run build:webapp` 並連同 `index.html` 提交；驗證 `npm test` 與 `npm run check:contrast` 通過。
- [x] 2.4 在新測試檔加入表驅動對比矩陣：次要文字對背景與卡片 ≥4.5:1、未啟用頁籤對深色帶 ≥4.5:1、焦點環對紙面 ≥3:1，以及三款 `--accent-bg` 存在性與「來源差異僅兩款 `--ink-3`」斷言；按鈕文字色與焦點環斷言留至 task 3.3；驗證 `npm test` 通過。

## 3. 重現字級與區塊切割

- [x] 3.1 為 `navy-brick` 與 `celadon-mint` 複寫 `.app-header`（56px、淺色白底深灰字、深色跟隨 `--paper`）、`.app-nav`（深色帶、6px 強調帶、`border-radius: 0`）、`.nav-tab` 字級與未啟用狀態，以及 `.panel-header`／`.panel-head` 米紙標題帶；以契約測試斷言新選擇器存在（不以 `check:ui-classes` 作為唯一證據）；執行 `npm run build:webapp` 並連同 `index.html` 提交；驗證 `npm test` 通過。
- [x] 3.2 為 `cover-lime` 複寫 `.app-header`、`.app-nav`、`.nav-tab`、`.panel-header`／`.panel-head`，加入 `.panel-title`／`.brand-title` 的 `clamp(24px, 2vw, 28px)`／字重 800／`-0.02em` 與 `.nav-tab.active` 檸檬底黑字；執行 `npm run build:webapp` 並連同 `index.html` 提交；驗證 `npm test` 通過。
- [x] 3.3 加入按鈕與焦點環覆寫：`cover-lime` 深淺 `.btn.primary` 檸檬底墨黑字、`navy-brick`／`celadon-mint` 深色 `.btn.primary` 深底淺字、`.app-nav :focus-visible` 用 `var(--style-nav-ink)`、`cover-lime` 按鈕／啟用頁籤依 D3 取色，並加入對應對比斷言（明確以 `outline-offset` 落點為背景取色）；執行 `npm run build:webapp` 並連同 `index.html` 提交；驗證 `npm test` 與 `npm run check:contrast` 通過。
- [x] 3.4 加入 `@media (min-width: 1200px)` 的 `min-height: 232px` 深色帶，其餘寬度回到 56px 單列橫向捲動；以契約測試斷言不覆寫 `.app-nav` 的 `overflow-x: auto`、不新增第五處 `outline: none`、不移植 `prefers-contrast` 外圈，並維持既有事件委派、`aria-current` 與 `<option>` 渲染；375px 下頁面本體無非預期水平溢出因 jsdom 不計算版面，僅由 task 4.5 瀏覽器核閱，不寫成自動化斷言；執行 `npm run build:webapp` 並連同 `index.html` 提交；驗證 `npm test`、`npm run check:ui-classes`（僅回歸）與 `git diff webapp/js/ui.js` 為空。

## 4. 全部風格可用性盤點與最小修補

- [x] 4.1 在新測試檔加入「全部風格」靜態契約：以遞迴 `var()` 解析（含循環偵測）逐一驗證 `config.styles` 每個 id 的淺／深專屬區塊存在、核心角色在自身區塊宣告、主題總數等於 `styles.length × 2`，且未明列調整的既有風格色值不變；焦點環依 D2 的 `checkContrast.js` 模型解析（既有覆寫區塊 → `:root`），不要求核心角色區塊重複宣告，並允許 `blueprint` 的 `:root` 共用區塊；按鈕／頁籤／膠囊的 4.5:1 契約僅套用三款新風格與 D6 四款，既有風格的款式專屬硬編碼色對由「風格 id＋選擇器→前景／背景」對照表取得，其餘九款僅驗證角色完整與不回退、如實列為現況基準；明確記載與單層解析的模型差異；驗證 `npm test` 與 `npm run check:contrast` 通過。
- [x] 4.2 在同一測試檔共用單一 JSDOM window，呼叫 `a11yHarness.resetDocument()` 與 `app.render()` 後才設定 `data-style`（避免 `app.init()` 由 localStorage 覆寫），並設定 `global.window`／`global.document`、沿用 `checkA11y.RUN_OPTIONS`；對三款新風格 × overview／courses／settings／activity-log × 深淺，以及四款舊風格各一個代表畫面執行 axe 結構稽核；測試檔案加註「僅結構稽核，jsdom 不套用 CSS，不驗證色彩」；驗證 `npm test` 通過，且 `scripts/checkA11y.js`、`tests/helpers/a11yHarness.js` 無變更。
- [x] 4.3 依 `design.md` D6 以明示色值補足 `happyhues2`／`happyhues3`／`happyhues5`／`happyhues9` 的必要角色，禁止 `--sans`／`--mono` 循環別名與兩層 `var()`；新增 `happyhues3` 的 `.btn.primary`／`.nav-tab.active` 深淺明示規則（淺 `#00214d`／`#3da9fc` 6.25:1，深 `#fffffe`／`#1e3b5f` 11.37:1），以及四款 `.pill.ok`／`.pill.err` 深淺明示規則（色對見 D6 附表，特異性須高於既有 `.pill` 的 0,2,1）；不新增 `.matrix-filter-pill` 規則；加入修補前後解析值對照與 Adjusted Roles 界限斷言；在 `design.md` D6 記錄修補清單（欄位：風格／角色／原解析值／新解析值／驗證結果）；執行 `npm run build:webapp` 並連同 `index.html` 提交；驗證 `npm test` 與 `npm run check:contrast` 通過。
- [x] 4.4 加入「全部風格」動態操作測試：直接呼叫 `ui.applyStyle()`、`ui.initThemeAndStyle()`、`ui.toggleTheme()`（不呼叫 `app.init()`，避免 localStorage 覆寫 `data-style`），遍歷所有 id 的套用、持久化、重新初始化、主題切換、未知值回退，以一般使用者與管理員兩種角色渲染並明確斷言一般 4 個、管理員 5 個頁籤且 `adminOnly` 守門生效，確認各畫面控制項存在且可聚焦，並驗證切換風格／主題時輸入內容、目前頁籤與焦點不變；驗證 `npm test` 通過。
- [x] 4.5 以 `webapp/index.html?mock=true`（不可用根目錄 `index.html?mock=true`）在 1440×900 與 375×812 逐一操作全部風格與深淺主題，檢查頁籤切換、匯入預覽、課程搜尋與分頁、設定表單、授權成員與操作日誌篩選，確認無水平溢出、按鈕／焦點環可見、瀏覽器無主控台錯誤；截圖留存於 `/tmp/opencode/style-review/`，並以固定欄位檢查表（風格／主題／視窗／操作／結果／截圖路徑）記錄；驗證結果與 D3／D4／D8 一致。

## 5. 文件、產物、封存與整合驗證

- [x] 5.1 將 `README.md`（7、38、381 行）的「13 款」更新為「16 款」並列舉三款新風格，於 `AGENTS.md:84` 的風格清單補上三款說明；驗證 `grep -rn '13 款' README.md AGENTS.md` 無輸出後提交。
- [x] 5.2 所有新增測試完成後執行 `node scripts/generateOpenccS2twpContractLiterals.js` 與 `node scripts/generateOpenccS2twpContractLiterals.js --check`；逐項人工核對 `--check` 輸出的新增字面值並顯示核准紀錄（生成器對新增僅警告不回傳失敗，不得以結束碼 0 推定已核可），不得以 `--fix` 自動寫入；再次執行 `npm run build:webapp`，確認根目錄 `index.html` 與原始檔一致、`git diff --check` 通過；逐筆核可紀錄寫入 `opencc-literal-signoff.md`（新增 62 筆、移除 1 筆過期值）；提交清冊、核可紀錄與殘留產物變更。
- [ ] 5.3 執行 `openspec-archive-change port-three-visual-styles` 並將封存成果獨立提交；驗證 change 已從 `openspec/changes/` 移至封存目錄。
- [ ] 5.4 先執行 `git rev-parse --verify origin/main` 確認變更覆蓋率基準存在（`getDiff()` 失敗會安靜略過），再執行完整本地 CI 指令鏈（`npm run format:check`、`npm run check:lang`、`npm run check:ui-classes`、`npm run check:contrast`、`npm run check:a11y`、`npm test`、`npm run check:coverage`、`npm run check:complexity`、`CHANGED_COVERAGE_BASE=origin/main npm run check:changed-coverage`、`node scripts/generateOpenccS2twpContractLiterals.js --check`、`npm run build:webapp`、`git diff --exit-code -- index.html`、`git diff --exit-code -- version.generated.js`）；驗證全部結束碼為 0、基準線不回退、品質基準線檔案無變更，且 OpenCC `--check` 輸出無未核可的新增字面值。

## Workflow follow-up（非程式碼 task）

- 發起 Pull Request 前再次預跑完整本地 CI；PR 後指派兩位審查代理並解決所有審查意見。
- CI 通過且意見全數解決後以 Squash Merge 合併、同步 `main`、清理分支，並於 `main` 重新建置後以固定 Deployment ID 執行 `npm run deploy`。
