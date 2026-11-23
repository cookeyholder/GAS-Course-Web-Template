"use strict";

/**
 * scripts/languageCheck.js 報告模式契約測試（4.2）。
 * 驗證 JSONL 純 ASCII 序列化、meta 統計、Markdown 呈現層跳躍與輸出路徑防護。
 * 所有簡體負面字面值皆以 Unicode 跳脫表示，避免自我誤報。
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const helpers = require("./helpers/scriptsDeps.js");
const languageCheck = require("../scripts/languageCheck.js");

/** 建立隔離的暫存專案根目錄。 */
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lc-report-"));
  return {
    root: root,
    write: function (relative, content) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
      return target;
    },
    cleanup: function () {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

/** 建立不寫入實際清冊的報告選項。 */
function reportOptions(project) {
  return {
    root: project.root,
    approvalsPath: path.join(project.root, "no-registry.json"),
    literalDrift: { drifted: false, added: [], removed: [] }
  };
}

/** 產生含簡體定位與正體違規之報告資料。 */
function buildSample(project) {
  project.write("a.js", 'const a = "\u9879\u76ee";\n');
  project.write("styles.css", "body { color: red; }\n");
  return languageCheck.buildReportData(reportOptions(project));
}

console.log("開始執行語言檢查報告模式契約測試...\n");

{
  const project = makeRoot();
  try {
    const meta = buildSample(project).meta;
    assert.strictEqual(meta.candidateCount, meta.protectedCount + meta.unprotectedCount);
    assert.strictEqual(meta.unprotectedCount, meta.candidateCount - meta.protectedCount);
    assert.ok(meta.exemptCandidateCount <= meta.unprotectedCount);
    const hardCount = languageCheck.checkProject(project.root).reduce(function (total, item) {
      return total + item.violations.length;
    }, 0);
    assert.strictEqual(meta.violationCount, hardCount);
    assert.ok(meta.violationCount > 0);
    console.log("   ✓ meta 統計滿足計數不等式且 violationCount 取自硬閘門");
  } finally {
    project.cleanup();
  }
}

{
  const project = makeRoot();
  try {
    const data = buildSample(project);
    assert.ok(data.entries.length > 0);
    const entry = data.entries[0];
    [
      "id",
      "reportedId",
      "file",
      "line",
      "column",
      "original",
      "suggestion",
      "suggestionSource",
      "suggestionOptions",
      "tier",
      "rule",
      "approvalState",
      "approvalReason",
      "protected",
      "exempt",
      "degraded",
      "contextHash",
      "occurrenceIndex"
    ].forEach(function (key) {
      assert.ok(Object.prototype.hasOwnProperty.call(entry, key), "缺少欄位：" + key);
    });
    assert.ok(["HARD", "S2TWP"].includes(entry.rule));
    assert.ok(
      entry.suggestionOptions.every(function (option) {
        return ["S2TW", "S2TWP", "MAINLAND_TERMS"].includes(option.source);
      })
    );
    assert.ok(data.meta.outOfScopeFiles.includes("styles.css"));
    console.log("   ✓ 報告項目欄位、值域與 outOfScopeFiles 完整");
  } finally {
    project.cleanup();
  }
}

{
  const project = makeRoot();
  try {
    const data = buildSample(project);
    const written = languageCheck.writeReport(data, path.join(project.root, "artifacts"));
    const jsonl = fs.readFileSync(written.jsonlPath, "utf8");
    assert.ok(/^[\x00-\x7f]*$/.test(jsonl));
    const lines = jsonl.replace(/\n$/, "").split("\n").map(JSON.parse);
    assert.strictEqual(lines[0].type, "meta");
    assert.deepStrictEqual(lines.slice(1), data.entries);
    assert.strictEqual(lines[1].original, "\u9879\u76ee");
    assert.strictEqual(
      languageCheck.verifySerializedJsonl('{"type":"meta"}\n{}\n', { type: "meta" }, [{ original: "\u9879\u76ee" }]).ok,
      false
    );
    assert.strictEqual(
      languageCheck.verifySerializedJsonl('{"type":"meta"}\n{"original":"\\u9879\\u76ee"}\n', { type: "meta" }, [
        { original: "\u9879\u76ee" }
      ]).ok,
      true
    );
    console.log("   ✓ JSONL 為純 ASCII 且 JSON.parse 完整還原原始值");
  } finally {
    project.cleanup();
  }
}

{
  const project = makeRoot();
  try {
    const markdown = languageCheck.formatMarkdownReport(buildSample(project));
    assert.ok(/^[\x00-\x7f]*$/.test(markdown));
    ["\u914d\u7f6e", "\u652f\u6301", "\u63a5\u53e3"].forEach(function (term) {
      assert.strictEqual(markdown.includes(term), false);
    });
    console.log("   ✓ Markdown 所有非 ASCII 皆跳脫且不殘留多字禁詞");
  } finally {
    project.cleanup();
  }
}

{
  const project = makeRoot();
  try {
    const data = buildSample(project);
    const captured = helpers.captureConsole();
    let code;
    try {
      code = languageCheck.main(["--report", "--output", path.join(project.root, "artifacts")], reportOptions(project));
    } finally {
      captured.restore();
    }
    assert.strictEqual(code, 0);
    assert.strictEqual(captured.logs.length, 1);
    const result = JSON.parse(captured.logs[0]);
    assert.strictEqual(result.ok, true);
    assert.ok(result.bytes > 0);
    assert.ok(data.meta.violationCount > 0);
    console.log("   ✓ 硬閘門失敗時報告 stdout 仍為約定格式且結束碼為零");
  } finally {
    project.cleanup();
  }
}

{
  const project = makeRoot();
  try {
    const captured = helpers.captureConsole();
    let code;
    try {
      code = languageCheck.main(
        ["--report", "--output", path.join(project.root, "artifacts")],
        Object.assign(reportOptions(project), {
          reportData: { meta: {}, entries: [] },
          fs: {
            mkdirSync: function () {
              throw new Error("simulated failure");
            }
          }
        })
      );
    } finally {
      captured.restore();
    }
    assert.strictEqual(code, 0);
    assert.deepStrictEqual(JSON.parse(captured.logs[0]), {
      ok: false,
      code: "REPORT_WRITE_FAILED",
      bytes: 0
    });
    assert.ok(
      captured.errors.some(function (text) {
        return text.includes("REPORT_WRITE_FAILED");
      })
    );
    console.log("   ✓ 寫入失敗輸出 REPORT_WRITE_FAILED 且結束碼仍為零");
  } finally {
    project.cleanup();
  }
}

{
  const project = makeRoot();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "lc-report-out-"));
  try {
    assert.strictEqual(
      languageCheck.isReportOutputDirSafe(path.join(project.root, "new", "nested"), project.root),
      true
    );
    assert.strictEqual(languageCheck.isReportOutputDirSafe(outside, project.root), false);
    fs.symlinkSync(outside, path.join(project.root, "escape"));
    assert.strictEqual(
      languageCheck.isReportOutputDirSafe(path.join(project.root, "escape", "nested"), project.root),
      false
    );
    const captured = helpers.captureConsole();
    let code;
    try {
      code = languageCheck.main(
        ["--report", "--output", outside],
        Object.assign(reportOptions(project), { reportData: { meta: {}, entries: [] } })
      );
    } finally {
      captured.restore();
    }
    assert.strictEqual(code, 0);
    assert.strictEqual(JSON.parse(captured.logs[0]).code, "REPORT_WRITE_FAILED");
    console.log("   ✓ 輸出路徑不存在可建立而根目錄外與逃逸符號連結皆被拒絕");
  } finally {
    fs.rmSync(outside, { recursive: true, force: true });
    project.cleanup();
  }
}

{
  const base = { file: "a.js", tier: "pending", line: 1, column: 0 };
  assert.strictEqual(
    languageCheck.compareReportEntries(base, { file: "b.js", tier: "pending", line: 1, column: 0 }) < 0,
    true
  );
  assert.strictEqual(
    languageCheck.compareReportEntries({ file: "b.js", tier: "pending", line: 1, column: 0 }, base) > 0,
    true
  );
  assert.strictEqual(
    languageCheck.compareReportEntries(base, { file: "a.js", tier: "high", line: 1, column: 0 }) > 0,
    true
  );
  assert.strictEqual(
    languageCheck.compareReportEntries({ file: "a.js", tier: "high", line: 1, column: 0 }, base) < 0,
    true
  );
  assert.strictEqual(
    languageCheck.compareReportEntries(base, { file: "a.js", tier: "pending", line: 2, column: 0 }) < 0,
    true
  );
  assert.strictEqual(
    languageCheck.compareReportEntries(base, { file: "a.js", tier: "pending", line: 1, column: 3 }) < 0,
    true
  );
  console.log("   ✓ 報告排序比較器涵蓋檔案、分層、行號與欄位");
}

console.log("✓ 語言檢查報告模式契約測試全數通過！\n");
