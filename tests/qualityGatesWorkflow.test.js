"use strict";

/**
 * CI 品質閘門 workflow 測試（G1.8）
 * 驗證 workflow 納入品質檢查步驟、diff 所需 checkout 設定與 Node 24 版本策略。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");
const workflowPath = path.join(PROJECT_ROOT, ".github", "workflows", "quality-gates.yml");

console.log("開始執行 CI 品質閘門 workflow 測試...\n");

const content = fs.readFileSync(workflowPath, "utf8");

console.log("1. 驗證 checkout 具備 diff 所需的完整歷史設定...");
{
  assert(/actions\/checkout@v4/.test(content), "應使用 actions/checkout@v4");
  assert(/fetch-depth\s*:\s*0/.test(content), "checkout 應設定 fetch-depth: 0 以支援變更覆蓋率 diff");
  console.log("   ✓ checkout 設定驗證通過！\n");
}

console.log("2. 驗證 Node 版本策略與 Node 24 一致...");
{
  assert(/node-version\s*:\s*["']?24/.test(content), "CI 應使用 Node 24（本機/CI 目標一致）");
  console.log("   ✓ Node 版本策略驗證通過！\n");
}

console.log("3. 驗證 workflow 納入覆蓋率、變更覆蓋率與複雜度檢查...");
{
  assert(/npm run (test:coverage|check:coverage)/.test(content), "應執行覆蓋率量測/檢查指令");
  assert(/npm run check:coverage/.test(content), "應執行覆蓋率門檻檢查（check:coverage）");
  assert(/npm run check:complexity/.test(content), "應執行 CRAP/MI 複雜度檢查（check:complexity）");
  assert(/npm run check:changed-coverage/.test(content), "應執行變更覆蓋率檢查（check:changed-coverage）");
  console.log("   ✓ 品質檢查步驟驗證通過！\n");
}

console.log("4. 驗證保留既有格式、語言與測試檢查流程...");
{
  assert(/npm run format:check/.test(content), "應保留格式檢查");
  assert(/npm run check:lang/.test(content), "應保留語言檢查");
  assert(/npm test/.test(content), "應保留測試執行");
  console.log("   ✓ 既有檢查流程驗證通過！\n");
}

console.log("✓ CI 品質閘門 workflow 測試全數通過！\n");
