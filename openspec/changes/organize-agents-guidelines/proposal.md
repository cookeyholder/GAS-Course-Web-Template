## Why

使用者近期擴充並調整了 `AGENTS.md`，新增了完整的子代理審查、分支管理、PR 處理與部署流程規範。然而，目前檔案存在以下結構與內容問題：
1. **區塊重複與贅餘**：頂部 `<!-- OPENSPEC:START -->` 區塊與底部 `## 代理協作與 OpenSpec 開發工作流程規範` 出現高達數十行的重複內容，分散代理注意力並增加維護負擔。
2. **指標與指令不同步**：新增內容中殘留過往舊標準（如提及 CRAP $\le 30$、MI $\ge 20$），與專案現行已提升之品質閘門標準（CRAP $\le 25$、MI $\ge 50$、覆蓋率門檻與方向性 ratchet 不回退）矛盾；且出現 `package.json` 中未定義之 `npm run quality:ci` 指令，亦遺漏了 `check:ui-classes` 與打包產物比對檢查。
3. **段落截斷與排版未收尾**：檔案末尾的「PR 合併後部署規範」於第 2 步中斷，漏失關鍵的 `npm run deploy` 版本化部署步驟與固定 Deployment ID 的安全防呆說明。
4. **子代理角色稱呼分歧**：頂部與底部的子代理職稱未標準化，存在兩套不同的中英文名稱，缺乏明確裁決。

藉由重新梳理與整合 `AGENTS.md`，消除重複贅述，建立結構清晰、前後一致、權責分明且精確可行的代理協作指南。

## What Changes

- **架構整併與消除重複**：
  - **頂部 `<!-- OPENSPEC:START -->` 區塊**：定位為 AI 代理**不可逾越的硬性規則檢查清單（Non-Negotiable Hard Gates Checklist）**，精要列出 5 大強制紅線（雙輪雙代理審查、獨立分支與逐項 commit、本地完整 CI 預跑、PR 雙代理審查與單一 commit 修復、未解審查意見嚴禁 merge、固定 Deployment ID 版本化部署）。
  - **底部「代理協作與 OpenSpec 開發工作流程規範」**：收斂為權威完整的**操作手冊與實作指引（Comprehensive Operational Guide）**，劃分為清晰的 4 大標準生命週期階段：
    1. **階段一：提案規劃與雙代理雙輪審查（Proposal Planning & Two-Round Dual-Agent Review）**
    2. **階段二：獨立分支開發、任務逐項提交與封存（Branching, Atomic Commits & Archive）**
    3. **階段三：發起 PR、雙代理審查與集中改進（Post-PR Dual-Agent Review & Consolidated Fix）**
    4. **階段四：Squash Merge、環境清理與版本化部署（Squash Merge, Cleanup & Production Deployment）**
- **統一子代理正式中英文職稱**：
  - 提案審查代理：統一命名為 `一致性與完整性審查代理（Completeness & Consistency Reviewer）` 與 `挑戰與詰問代理（Grilling & Challenge Reviewer）`。
  - PR 審查代理：統一命名為 `程式碼品質與規格審查代理（Code Quality & Spec Reviewer）` 與 `潛在缺陷與安全性審查代理（Defects & Security Reviewer）`。
- **同步指標與驗證指令真實性**：
  - 修正審查門檻數值，全面對齊現行基準：CRAP $\le 25$、MI $\ge 50$、全域覆蓋率初始門檻（Lines $\ge 60\%$、Statements $\ge 30\%$、Functions $\ge 60\%$、Branches $\ge 60\%$ 且依基準線方向性 ratchet 不回退）、變更行覆蓋率與變更分支覆蓋率 $\ge 80\%$。
  - 替換不存在的 `npm run quality:ci`，列出與 GitHub Actions CI 完全同構之完整預跑指令鏈（依序涵蓋格式、用語、CSS 類別、色彩對比、無障礙、單元測試、覆蓋率、複雜度、變更覆蓋率與打包產物一致性檢查）。
- **補齊並完整化合併後部署步驟**：
  - 補齊「PR 合併後部署規範」缺失之 `npm run deploy` 步驟，並明確規定必須維持固定 Deployment ID，避免產生全新網址破壞連線。
- **閱讀體驗與格式最佳化**：
  - 統一標題層級與清單縮排，強化關鍵規則標記，保持全篇臺灣繁體中文 (`zh-TW`) 純淨度。

## Capabilities

### New Capabilities
無（本變更為純文件規範梳理，不增修功能規格）。

### Modified Capabilities
無（本變更為純文件規範梳理，已於 `.openspec.yaml` 標註 `skip_specs: true`）。

## Impact

- **受影響檔案**：`AGENTS.md`。
- **程式碼與系統影響**：無任何產品程式碼、API 介面或執行期行為改變。
- **開發流程效益**：AI 代理與人類協作者可依循無歧義、無重複、步驟明確的單一指引完成提案、實作、審查、合併與部署。
