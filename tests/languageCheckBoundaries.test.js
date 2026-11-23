"use strict";

/**
 * 語言檢查外殼邊界與錯誤路徑測試（4.6 延伸）。
 * 驗證預設參數、報告寫入驗證、輸出路徑與呈現層的防禦分支。
 * 所有簡體負面字面值皆以 Unicode 跳脫表示，避免自我誤報。
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const approvals = require("../scripts/openccS2twpApprovals.js");
const languageCheck = require("../scripts/languageCheck.js");
const helpers = require("./helpers/scriptsDeps.js");

/** 建立隔離清冊與錯誤紀錄。 */
function createRegistry() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lc-bounds-"));
  const registryPath = path.join(root, "registry.json");
  approvals.saveRegistry(approvals.emptyRegistry(), registryPath);
  return {
    root: root,
    registryPath: registryPath,
    cleanup: function () {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

console.log("開始執行語言檢查外殼邊界測試...\n");

console.log("1. 預設參數與豁免行分支...");
{
  assert.throws(function () {
    languageCheck.analyzeFile();
  }, TypeError);
  const converted = languageCheck.analyzeFile("a.js", "const a = 1;", {
    convert: function (line) {
      return line;
    }
  });
  assert.strictEqual(converted.raw.length, 0);
  const exempt = languageCheck.analyzeFile("a.js", "// language-check: ignore", {
    convert: function () {
      return "";
    }
  });
  assert.strictEqual(exempt.exemptLines, 1);
  assert.strictEqual(exempt.raw.length, 1);
  assert.strictEqual(exempt.raw[0].exempt, true);
  const collected = languageCheck.collectReportFiles(undefined, {
    fs: {
      readdirSync: function () {
        return [];
      }
    }
  });
  assert.deepStrictEqual(collected, { files: [], outOfScopeFiles: [] });
  assert.strictEqual(languageCheck.getWritableDecision({ suggestion: "" }, approvals.emptyRegistry()), null);
  assert.deepStrictEqual(languageCheck.applyFileFixes(), { lines: [], applied: 0, skipped: 0 });
  assert.strictEqual(languageCheck.reportIdentityKey(), "");
  assert.strictEqual(languageCheck.isSuggestedOption(), false);
  assert.strictEqual(languageCheck.escapePresentationText(), "");
  assert.strictEqual(languageCheck.parseArgs(undefined).mode, "default");
  assert.strictEqual(languageCheck.parseArgs(["--output"]).outputDir, "");
  assert.strictEqual(languageCheck.isReportOutputDirSafe(), true);
  assert.strictEqual(languageCheck.printViolations(), 0);
  console.log("   ✓ 預設參數與豁免分支驗證通過");
}

console.log("2. 報告讀取異常分支...");
{
  const context = createRegistry();
  const captured = helpers.captureConsole();
  try {
    assert.deepStrictEqual(languageCheck.loadReportEntries(), []);
    languageCheck.buildFixCandidates({
      root: context.root,
      registry: approvals.emptyRegistry(),
      reportData: { meta: {} },
      reportEntries: [],
      error: function () {}
    });
    const reportPath = path.join(context.root, "empty.jsonl");
    fs.writeFileSync(reportPath, "", "utf8");
    assert.deepStrictEqual(languageCheck.loadReportEntries({ reportPath: reportPath, error: function () {} }), []);
    fs.writeFileSync(reportPath, "not-json\n", "utf8");
    assert.deepStrictEqual(languageCheck.loadReportEntries({ reportPath: reportPath, error: function () {} }), []);
    fs.writeFileSync(reportPath, JSON.stringify({ type: "other" }) + "\n", "utf8");
    assert.deepStrictEqual(languageCheck.loadReportEntries({ reportPath: reportPath, error: function () {} }), []);
    fs.writeFileSync(
      reportPath,
      JSON.stringify({ type: "meta" }) + "\n\n{bad\n" + JSON.stringify({ id: "abcdef0123456789" }) + "\n",
      "utf8"
    );
    assert.deepStrictEqual(
      languageCheck.loadReportEntries({ reportPath: reportPath, error: function () {} }).length,
      1
    );
  } finally {
    captured.restore();
    context.cleanup();
  }
  console.log("   ✓ 報告讀取異常分支驗證通過");
}

console.log("3. 序列化與呈現層防禦分支...");
{
  assert.strictEqual(languageCheck.verifySerializedJsonl("\u9879\u76ee", {}, []).reason, "NON_ASCII_SERIALIZATION");
  assert.strictEqual(languageCheck.verifySerializedJsonl("{}\n", {}, [{}]).reason, "JSONL_LINE_COUNT_MISMATCH");
  assert.strictEqual(
    languageCheck.verifySerializedJsonl(JSON.stringify({ a: 1 }) + "\n", { a: 2 }, []).reason,
    "JSONL_META_MISMATCH"
  );
  const empty = languageCheck.formatMarkdownReport();
  assert.ok(empty.includes("degraded: false"));
  assert.ok(empty.includes("\u7121\u6f02\u79fb") === false, "呈現層應跳脫非 ASCII");
  const degraded = languageCheck.formatMarkdownReport({
    meta: {
      degraded: true,
      degradedReason: "X",
      literalDrift: { drifted: true },
      tierCounts: {}
    },
    entries: []
  });
  assert.ok(degraded.includes("degraded: true"));
  assert.ok(degraded.includes("\\u6709\\u6f02\\u79fb"));
  const many = languageCheck.formatMarkdownReport({
    entries: Array.from({ length: 501 }, function () {
      return { file: "a.js", line: 1 };
    })
  });
  assert.ok(many.includes("\\u50c5\\u5217\\u51fa\\u524d 500 \\u7b46"));
  const exempt = languageCheck.formatMarkdownReport({ entries: [{ exempt: true, file: "a.js", line: 1 }] });
  assert.ok(exempt.includes("<details>"));
  console.log("   ✓ 序列化與呈現層防禦分支驗證通過");
}

console.log("4. 輸出路徑與寫入例外分支...");
{
  const context = createRegistry();
  try {
    const neverExists = {
      existsSync: function () {
        return false;
      },
      realpathSync: fs.realpathSync
    };
    assert.strictEqual(languageCheck.isReportOutputDirSafe("deep/path", context.root, { fs: neverExists }), false);
    const brokenRealpath = {
      existsSync: function () {
        return true;
      },
      realpathSync: function () {
        throw new Error("realpath failed");
      }
    };
    assert.strictEqual(languageCheck.isReportOutputDirSafe("artifacts", context.root, { fs: brokenRealpath }), false);

    const env = {
      root: context.root,
      approvalsPath: context.registryPath,
      literalDrift: { drifted: false, added: [], removed: [] },
      log: function () {},
      error: function () {}
    };
    const report = languageCheck.buildReportData({
      root: context.root,
      approvalsPath: context.registryPath,
      literalDrift: env.literalDrift
    });
    fs.writeFileSync(path.join(context.root, "a.js"), 'const a = "\u9879\u76ee";\n', "utf8");
    const fresh = languageCheck.buildReportData({
      root: context.root,
      approvalsPath: context.registryPath,
      literalDrift: env.literalDrift
    });
    assert.strictEqual(languageCheck.runApprovalCommand({ mode: "approve", ids: [fresh.entries[0].id] }, env), 0);
    const unreadableFs = {
      readFileSync: function () {
        throw new Error("讀取失敗");
      },
      writeFileSync: function () {
        throw new Error("不應寫入");
      }
    };
    const result = languageCheck.applyFixes(
      Object.assign({}, env, {
        reportData: fresh,
        reportEntries: [],
        registry: approvals.loadRegistry(env.approvalsPath),
        fs: unreadableFs
      })
    );
    assert.strictEqual(result.applied, 0);
    assert.ok(result.skipped > 0, "讀取失敗的檔案應計入略過");
    assert.strictEqual(languageCheck.main([], { log: function () {}, error: function () {} }), 0);
    assert.ok(report);
  } finally {
    context.cleanup();
  }
  console.log("   ✓ 輸出路徑與寫入例外分支驗證通過");
}

console.log("✓ 語言檢查外殼邊界測試全數通過！\n");
