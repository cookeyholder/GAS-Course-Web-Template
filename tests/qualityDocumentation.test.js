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
  const thresholdTokens = ["CRAP", "25", "MI", "50", "60%", "80%", "基準線"];
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

console.log("5. 驗證 README 記載七個語言檢查指令與 OpenCC 分工...");
{
  const commands = [
    "npm run check:lang",
    "npm run language:smoke",
    "npm run language:report",
    "npm run language:check",
    "npm run language:fix",
    "npm run language:approve -- <id> [建議來源] [建議文字]",
    "npm run language:revoke -- <id>"
  ];
  commands.forEach(function (cmd) {
    assert(readme.includes(cmd), "README 應包含語言檢查指令：" + cmd);
  });
  ["s2tw", "s2twp", "項目", "人工選詞", "核准", "降級", "診斷", "寫入失敗", "漂移", "generatedAt", "--output"].forEach(
    function (token) {
      assert(readme.includes(token), "README 應說明語言檢查議題：" + token);
    }
  );
  assert(/零違規僅.{0,12}向後相容錨點/.test(readme), "README 應說明零違規僅為向後相容錨點");
  console.log("   ✓ README 語言檢查指令驗證通過！\n");
}

console.log("6. 驗證 README/AGENTS 記載清冊信任邊界與並行寫入禁令...");
{
  [readme, agents].forEach(function (doc, idx) {
    const name = idx === 0 ? "README" : "AGENTS";
    assert(/直接改寫.{0,60}等同核准/.test(doc), name + " 應說明直接改寫核准清冊等同核准");
    assert(/Pull Request 核閱|PR 核閱/.test(doc), name + " 應說明清冊改寫須經 Pull Request 核閱");
    assert(/--approve[^\n]{0,80}--revoke[^\n]{0,40}--fix|同時執行多個/.test(doc), name + " 應明文禁止並行核准與撤銷");
    assert(/舊快照覆蓋/.test(doc), name + " 應說明並行寫入使已撤銷核准復活的風險");
  });
  ["ID_ALGORITHM_CHANGED", "APPROVAL_TAMPERED", "重新產生報告"].forEach(function (token) {
    assert(readme.includes(token), "README 應記載診斷與重新核准紀律：" + token);
  });
  console.log("   ✓ 清冊信任邊界驗證通過！\n");
}

console.log("7. 驗證 AGENTS 記載 OpenCC 模組職責與工具紀律...");
{
  const modules = [
    "scripts/openccS2twp.js",
    "quality-core/openccStableId.js",
    "quality-core/openccLanguageAnalysis.js",
    "quality-core/openccContractDrift.js",
    "scripts/languageCheck.js",
    "scripts/openccS2twpApprovals.js",
    "scripts/openccS2twpProtectedTerms.js",
    "scripts/generateOpenccS2twpContractLiterals.js"
  ];
  modules.forEach(function (mod) {
    assert(agents.includes(mod), "AGENTS 應記載模組職責：" + mod);
  });
  [
    "差異決定",
    "人工選詞",
    "contextHash",
    "occurrenceIndex",
    "reportedId",
    "序列化層",
    "呈現層",
    "authorizeCandidate()"
  ].forEach(function (token) {
    assert(agents.includes(token), "AGENTS 應記載工具紀律：" + token);
  });
  assert(agents.includes("2026-11-20"), "AGENTS 基準線應更正為 2026-11-20");
  assert(!agents.includes("2026-11-18 基準"), "AGENTS 不得殘留 2026-11-18 基準");
  console.log("   ✓ AGENTS 模組職責與工具紀律驗證通過！\n");
}

console.log("8. 驗證 AGENTS 語言簽核禁合規則與工作流程摘要查核...");
{
  [
    "language-signoff-required",
    "LANGUAGE_SIGNOFF_REQUIRED",
    "語言警告未處理，合併前須人工簽核",
    "語言警告已處理，合併前人工簽核",
    "核閱者與日期"
  ].forEach(function (token) {
    assert(agents.includes(token), "AGENTS 應記載簽核禁合關鍵字：" + token);
  });
  assert(/不得僅依賴 PR 標籤|不因標籤缺失而放行/.test(agents), "AGENTS 應要求不得僅依賴 PR 標籤");
  assert(/錨點存在即視為帶警告/.test(agents), "AGENTS 應明文規定錨點存在即視為帶警告");
  assert(/SIGNOFF 空白|Reviewer 未明確核准/.test(agents), "AGENTS 應禁止 SIGNOFF 空白或 Reviewer 未核准時合併");
  console.log("   ✓ AGENTS 簽核禁合規則驗證通過！\n");
}

console.log("9. 驗證 README/AGENTS 記載 CI 只報不寫與診斷碼...");
{
  ["OPENCC_BINARY_MISSING", "OPENCC_UNAVAILABLE", "PARSER_UNAVAILABLE"].forEach(function (code) {
    assert(readme.includes(code), "README 應記載診斷碼：" + code);
  });
  assert(/只報不寫|不寫入/.test(readme), "README 應說明 CI 只報不寫");
  assert(/continue-on-error|非阻斷/.test(readme), "README 應說明 CI 非阻斷");
  assert(agents.includes("LANGUAGE_SIGNOFF_REQUIRED"), "AGENTS 應記載工作流程摘要錨點");
  assert(
    /if: always\(\).{0,40}continue-on-error: true|continue-on-error: true/.test(agents),
    "AGENTS 應記載非阻斷 CI 語意"
  );
  console.log("   ✓ CI 只報不寫與診斷碼驗證通過！\n");
}

console.log("✓ 品質流程文件測試全數通過！\n");
