## Context

`AGENTS.md` 是 AI 代理進入此專案時首要載入的專案規範手冊。近期使用者為強化專案品質與自動化協作，擴充了嚴格的「提案雙代理兩輪審查」、「獨立分支開發與原子提交」、「PR 雙代理審查與集中修復」及「合併後自動部署」等規範。然而，目前頂部 `<!-- OPENSPEC:START -->` 區塊與底部章節出現大量重複文字，且部分標準數據與指令未與專案現行狀態同步（如 CRAP 門檻與 CI 指令），末尾更有部署章節遭截斷之瑕疵。

## Goals / Non-Goals

**Goals:**
- **建立單一權威來源（Single Source of Truth）**：消除頂部與底部的文字重複，頂部保留不可逾越的硬性規則檢查清單，底部收斂為結構化、按時序推進的 4 大完整操作指引階段。
- **指標與指令完全真實化**：修正所有殘留舊值，全面對齊專案現行門檻（CRAP $\le 25$、MI $\ge 50$、覆蓋率標準與方向性 ratchet），並替換不存在的 `npm run quality:ci` 為專案實際 CI 同構預跑指令鏈。
- **統一子代理官方職稱**：
  - 提案審查子代理：統一使用 `一致性與完整性審查代理（Completeness & Consistency Reviewer）` 與 `挑戰與詰問代理（Grilling & Challenge Reviewer）`。
  - PR 審查子代理：統一使用 `程式碼品質與規格審查代理（Code Quality & Spec Reviewer）` 與 `潛在缺陷與安全性審查代理（Defects & Security Reviewer）`。
- **補齊未完章節與部署安全防呆**：完整收尾「PR 合併後部署規範」，明確納入 `npm run deploy` 步驟並強調維持固定 Deployment ID，防止破壞正式 Web App 網址。
- **100% 完整保留使用者要求之嚴格工作流**：
  1. OpenSpec 提案必須經由「一致性與完整性審查代理」與「挑戰與詰問代理」進行嚴格的 2 輪雙代理審查與修訂。
  2. 實作必須在獨立分支進行，實作前必須先提交（commit）提案文件，且每個 task 必須各自驗證並獨立 commit 1 次。
  3. 發起 PR 前必須在本地端預跑完整 CI 檢查通過；發起 PR 後指派 2 個獨立代理審查，並集中使用 1 個 commit 修復所有意見。
  4. 必須妥善處理所有審查意見（含外部 Reviewer 或機器人之審查意見）後方可 Squash Merge；若有審查意見未處理完成，絕對嚴禁 Squash Merge。
  5. 合併後切換回 `main` 分支並同步最新程式碼，清理本地與遠端分支及對應之 git worktree。
  6. 合併至 `main` 後必須執行 `npm run build:webapp` 與以固定 Deployment ID 執行 `npm run deploy` 發布新版本至 GAS 雲端。

**Non-Goals:**
- 不變更任何後端 JavaScript 邏輯、前端模組或自動化測試腳本。
- 不放寬任何品質指標門檻或弱化審查流程。

## Decisions

### 決策 1：明確劃分頂部檢查清單與底部操作指南之職責
- **作法**：
  - **頂部 `<!-- OPENSPEC:START -->` 區塊**：定位為「不可逾越的硬性規則檢查清單（Hard Gates Checklist）」，條列 5 大核心紅線禁令與強制檢查點（包含審查代理名稱、雙輪審查、分支與 commit 鐵律、未解審查意見嚴禁 merge、固定 Deployment ID 部署）。
  - **底部章節**：提供詳盡的背景說明、實作流程、完整 Bash 指令範例與例外排查手冊。
- **理由**：既滿足部分 AI 工具僅讀取開頭區塊的即時守門需求，又避免全文重複造成的注意力分散與維護矛盾。

### 決策 2：統一子代理官方職稱
- **標準命名**：
  - **提案審查代理（Proposal Reviewers）**：
    1. `一致性與完整性審查代理（Completeness & Consistency Reviewer）`
    2. `挑戰與詰問代理（Grilling & Challenge Reviewer）`
  - **PR 審查代理（Post-PR Reviewers）**：
    1. `程式碼品質與規格審查代理（Code Quality & Spec Reviewer）`
    2. `潛在缺陷與安全性審查代理（Defects & Security Reviewer）`
- **理由**：統一名稱有助於主代理指派子代理時的提示詞一致性，建立明確的職責邊界。

### 決策 3：底部收斂為 4 大時序標準生命週期階段
- **章節架構**：
  - `### 階段一：提案規劃與雙代理雙輪審查（Proposal Planning & Two-Round Dual-Agent Review）`
  - `### 階段二：獨立分支開發、任務逐項提交與封存（Branching, Atomic Commits & Archive）`
  - `### 階段三：發起 PR、雙代理審查與集中改進（Post-PR Dual-Agent Review & Consolidated Fix）`
  - `### 階段四：Squash Merge、環境清理與版本化部署（Squash Merge, Cleanup & Production Deployment）`

### 決策 4：標準化本地 CI 預跑完整指令鏈
- **作法**：將 `npm run quality:ci` 替換為實際與 `.github/workflows/quality-gates.yml` 完全對齊的同構指令鏈：
  ```bash
  npm run format:check && npm run check:lang && npm run check:ui-classes && npm run check:contrast && npm run check:a11y && npm test && npm run check:coverage && npm run check:complexity && CHANGED_COVERAGE_BASE=origin/main npm run check:changed-coverage && npm run build:webapp && git diff --exit-code -- index.html
  ```
  確保所有靜態檢查、無障礙檢查、單元測試、覆蓋率、複雜度與打包產物一致性皆在發起 PR 前通過本機驗證。

### 決策 5：明確版本化部署之安全防呆
- **作法**：於階段四中明確註記：
  ```bash
  npm run deploy
  # 若環境變數未提供 CLASP_DEPLOYMENT_ID，須指定既有固定 ID，以防產生新網址：
  # npm run deploy -- -i <DEPLOYMENT_ID>
  ```
  確保 GAS 線上服務網址維持不變。

## Risks / Trade-offs

- **[風險] 單純依賴長指令鏈若未來 CI 變更易脫鉤**
  → **緩解措施**：在 `AGENTS.md` 清楚說明各指令對應的品質項目，未來若新增指令時需同步檢視工作流程手冊。
- **[風險] 用詞差異可能違反臺灣繁體中文規範**
  → **緩解措施**：所有變更在提交前必須執行 `npm run check:lang` 與 `npx prettier --check AGENTS.md` 進行雙重驗證。
