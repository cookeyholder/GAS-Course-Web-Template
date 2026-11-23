"use strict";

/**
 * pre-commit 品質防線測試（G1.7）
 * 驗證 Husky + lint-staged 設定與 hook 可重現，且符合自動格式化規範。
 */

const assert = require("assert");
const { execFileSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const languageCheck = require("../scripts/languageCheck.js");

const PROJECT_ROOT = path.join(__dirname, "..");

console.log("開始執行 pre-commit 品質防線測試...\n");

console.log("1. 驗證 lint-staged 設定包含暫存檔 Prettier 自動格式化...");
{
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
  assert(pkg["lint-staged"], "package.json 應包含 lint-staged 設定");
  const entries = Object.entries(pkg["lint-staged"]);
  assert(entries.length > 0, "lint-staged 應至少有一組規則");
  const hasPrettierWrite = entries.some(function (pair) {
    const cmds = Array.isArray(pair[1]) ? pair[1] : [pair[1]];
    return cmds.some(function (cmd) {
      return /prettier\b/.test(String(cmd)) && /--write/.test(String(cmd));
    });
  });
  assert(hasPrettierWrite, "lint-staged 規則應對暫存檔執行 prettier --write");
  console.log("   ✓ lint-staged Prettier 格式化設定驗證通過！\n");
}

console.log("2. 驗證 prepare 腳本在 CI/非互動環境安全且可啟用 Husky...");
{
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, "package.json"), "utf8"));
  const prepare = pkg.scripts && pkg.scripts.prepare ? String(pkg.scripts.prepare) : "";
  assert(prepare.length > 0, "應提供 prepare 腳本以重現 Git hook 安裝");
  assert(/CI/.test(prepare), "prepare 應偵測 CI 環境以避免非互動失敗");
  assert(/husky/.test(prepare), "prepare 應嘗試啟用 Husky");
  console.log("   ✓ prepare 腳本安全性驗證通過！\n");
}

console.log("3. 驗證 .husky/pre-commit 存在且執行 lint-staged 與語言規範檢查...");
{
  const hookPath = path.join(PROJECT_ROOT, ".husky", "pre-commit");
  assert(fs.existsSync(hookPath), ".husky/pre-commit 應存在以供重現");
  const content = fs.readFileSync(hookPath, "utf8");
  assert(/lint-staged/.test(content), "pre-commit 應執行 lint-staged 以格式化暫存檔");
  assert(/node\s+scripts\/languageCheck\.js/.test(content), "pre-commit 應以 node scripts/languageCheck.js 呼叫硬閘門");
  assert(!/language:fix|--fix|--approve|--revoke/.test(content), "pre-commit 僅執行硬閘門，不得自動寫入");
  console.log("   ✓ pre-commit hook 內容驗證通過！\n");
}

console.log("4. 驗證暫存檔格式化後語言檢查仍可執行...");
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gas-precommit-"));
  try {
    const bannedWord = String.fromCharCode(0x4ee3, 0x7801);
    const target = path.join(root, "staged.js");
    fs.writeFileSync(target, 'const value="' + bannedWord + '"\n', "utf8");
    execFileSync(process.execPath, [require.resolve("prettier/bin/prettier.cjs"), "--write", target], {
      cwd: PROJECT_ROOT,
      stdio: "ignore"
    });
    const formatted = fs.readFileSync(target, "utf8");
    assert.ok(formatted.includes(";\n"), "Prettier 應補上分號");
    const results = languageCheck.checkProject(root);
    assert.strictEqual(results.length, 1, "格式化後仍應偵測到違規，語言檢查可執行");
    assert.strictEqual(results[0].file, "staged.js");
    execFileSync(process.execPath, [path.join(PROJECT_ROOT, "scripts", "languageCheck.js")], {
      cwd: PROJECT_ROOT,
      stdio: "ignore"
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  console.log("   ✓ 暫存檔格式化後語言檢查仍可執行驗證通過！\n");
}

console.log("✓ pre-commit 品質防線測試全數通過！\n");
