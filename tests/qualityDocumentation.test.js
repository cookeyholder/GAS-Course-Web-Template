"use strict";

/**
 * 品質流程文件測試（G1.9）
 * 以 TDD 驗證 README/AGENTS 記載品質指令、Hook、自動格式化、門檻與基準線政策。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");
const readme = fs.readFileSync(path.join(PROJECT_ROOT, "README.md"), "utf8");
const agents = fs.readFileSync(path.join(PROJECT_ROOT, "AGENTS.md"), "utf8");

console.log("開始執行品質流程文件測試...\n");

console.log("1. 驗證 README 記載品質檢查指令...");
{
  const commands = [
    "npm run test:coverage",
    "npm run check:coverage",
    "npm run check:changed-coverage",
    "npm run check:complexity"
  ];
  commands.forEach(function (cmd) {
    assert(readme.includes(cmd), "README 應包含品質指令：" + cmd);
  });
  console.log("   ✓ README 品質指令驗證通過！\n");
}

console.log("2. 驗證 README/AGENTS 記載 Git hook 與自動格式化...");
{
  [readme, agents].forEach(function (doc, idx) {
    const name = idx === 0 ? "README" : "AGENTS";
    assert(/Husky/i.test(doc), name + " 應提及 Husky");
    assert(/lint-staged/i.test(doc), name + " 應提及 lint-staged");
    assert(/pre-commit/i.test(doc), name + " 應提及 pre-commit");
    assert(
      /prettier\s*--write|Prettier.*自動格式化|自動格式化.*Prettier/i.test(doc),
      name + " 應說明 Prettier 自動格式化"
    );
  });
  console.log("   ✓ Git hook 與自動格式化文件驗證通過！\n");
}

console.log("3. 驗證文件記載品質門檻與基準線/不回退政策...");
{
  const thresholdTokens = ["CRAP", "30", "MI", "20", "80%", "70%", "基準線"];
  thresholdTokens.forEach(function (token) {
    assert(readme.includes(token) || agents.includes(token), "README 或 AGENTS 應提及門檻/政策關鍵字：" + token);
  });
  assert(
    /不回退|ratchet|不得低於/i.test(readme) || /不回退|ratchet|不得低於/i.test(agents),
    "應說明基準線不回退（ratchet）政策"
  );
  console.log("   ✓ 門檻與基準線政策驗證通過！\n");
}

console.log("4. 驗證文件記載 Node 24 版本策略與 CI 品質閘門...");
{
  assert(
    /Node\.?js?\s*24|Node\s*24|node-version\s*[:：]?\s*["']?24/i.test(readme) ||
      /Node\.?js?\s*24|Node\s*24/i.test(agents),
    "應記載 Node 24 版本策略"
  );
  assert(
    /quality-gates\.yml|品質閘門|Quality Gates/i.test(readme) || /quality-gates\.yml|品質閘門/i.test(agents),
    "應記載 CI 品質閘門流程"
  );
  console.log("   ✓ Node 24 與 CI 文件驗證通過！\n");
}

console.log("✓ 品質流程文件測試全數通過！\n");
