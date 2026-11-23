"use strict";

/**
 * 語言檢查兩套排除設定檔契約測試（4.4）。
 * 硬閘門以 basename 排除目錄，報告模式以相對路徑前綴排除，兩者互不共用。
 * 所有簡體負面字面值皆以 Unicode 跳脫表示，避免自我誤報。
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const approvals = require("../scripts/openccS2twpApprovals.js");
const languageCheck = require("../scripts/languageCheck.js");

/** 建立隔離的暫存專案根目錄。 */
function createRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lc-excl-"));
  return {
    root: root,
    write: function (relative, content) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    },
    cleanup: function () {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

console.log("開始執行語言檢查排除設定檔契約測試...\n");

{
  const project = createRoot();
  try {
    const bannedWord = String.fromCharCode(0x4ee3, 0x7801);
    const files = {
      "src/keep.js": 'const keep = "' + bannedWord + '";\n',
      "src/style.css": "body { color: red; }\n",
      "build/generated.js": "const generated = 1;\n",
      "artifacts/language-report.md": "# 報告\n",
      "openspec/changes/demo/proposal.md": "# " + bannedWord + "\n",
      "docs/參考資料/opencc/SOURCES.md": "# " + bannedWord + "\n",
      "node_modules/pkg/index.js": "module.exports = {};\n",
      "coverage/report.json": "{}\n",
      ".git/config.yml": "name: demo\n",
      "dist/bundle.js": "const bundle = 1;\n",
      ".clasp/appsscript.json": "{}\n",
      ".codegraph/graph.js": "const graph = 1;\n",
      "AGENTS.md": "# 規範\n",
      "package-lock.json": "{}\n",
      "index.html": "<html></html>\n",
      "scripts/languageCheck.js": "// 偵測器\n",
      "scripts/other.js": "const other = 1;\n"
    };
    Object.keys(files).forEach(function (relative) {
      project.write(relative, files[relative]);
    });

    const hardFiles = languageCheck.collectFiles(project.root);
    assert.deepStrictEqual(hardFiles, [
      "build/generated.js",
      "docs/參考資料/opencc/SOURCES.md",
      "openspec/changes/demo/proposal.md",
      "scripts/other.js",
      "src/keep.js"
    ]);

    const reportFiles = languageCheck.collectReportFiles(project.root);
    assert.deepStrictEqual(reportFiles.files, ["scripts/other.js", "src/keep.js"]);
    assert.deepStrictEqual(reportFiles.outOfScopeFiles, ["src/style.css"]);

    const registryPath = path.join(project.root, "registry.json");
    approvals.saveRegistry(approvals.emptyRegistry(), registryPath);
    const report = languageCheck.buildReportData({
      root: project.root,
      approvalsPath: registryPath,
      literalDrift: { drifted: false, added: [], removed: [] }
    });
    assert.deepStrictEqual(
      report.entries.map(function (entry) {
        return entry.file;
      }),
      ["src/keep.js"]
    );
    assert.deepStrictEqual(report.meta.outOfScopeFiles, ["src/style.css"]);
    assert.strictEqual(report.meta.violationCount, 6, "硬閘門違規數含 openspec 與 docs/參考資料");
    assert.deepStrictEqual(
      report.violations.map(function (item) {
        return item.file;
      }),
      ["docs/參考資料/opencc/SOURCES.md", "openspec/changes/demo/proposal.md", "src/keep.js"]
    );
    console.log("   ✓ 硬閘門與報告兩套排除設定檔各自套用且 violationCount 取硬閘門範圍");
  } finally {
    project.cleanup();
  }
}

console.log("✓ 語言檢查排除設定檔契約測試全數通過！\n");
