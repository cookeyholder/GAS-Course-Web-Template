"use strict";

/**
 * scripts/languageCheck.js 四模式契約測試（4.3）。
 * 驗證模式優先序、全數核准寫入、建議綁定、reportedId 否決與出口碼語意。
 * 所有簡體負面字面值皆以 Unicode 跳脫表示，避免自我誤報。
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const approvals = require("../scripts/openccS2twpApprovals.js");
const analysis = require("../quality-core/openccLanguageAnalysis.js");
const stableId = require("../quality-core/openccStableId.js");
const languageCheck = require("../scripts/languageCheck.js");

/** 建立隔離的暫存專案根目錄。 */
function makeRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lc-modes-"));
  return {
    root: root,
    write: function (relative, content) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
      return target;
    },
    read: function (relative) {
      return fs.readFileSync(path.join(root, relative), "utf8");
    },
    cleanup: function () {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

/** 建立含簡體候選的環境與 Options。 */
function makeEnvironment(source) {
  const project = makeRoot();
  project.write("a.js", source || 'const a = "\u9879\u76ee";\n');
  const registryPath = path.join(project.root, "registry.json");
  approvals.saveRegistry(approvals.emptyRegistry(), registryPath);
  const options = {
    root: project.root,
    approvalsPath: registryPath,
    literalDrift: { drifted: false, added: [], removed: [] },
    log: function () {},
    error: function () {}
  };
  return { project: project, options: options, registryPath: registryPath };
}

/** 取得目前報告資料。 */
function reportData(env) {
  return languageCheck.buildReportData(env.options);
}

/** 核准報告中的單一候選，可指定建議來源與文字。 */
function approve(env, entry, source, suggestion) {
  const ids = source === undefined ? [entry.id] : [entry.id, source, suggestion];
  return languageCheck.runApprovalCommand({ mode: "approve", ids: ids }, env.options);
}

console.log("開始執行語言檢查四模式契約測試...\n");

{
  assert.strictEqual(languageCheck.parseArgs(["--fix", "--approve", "--report"]).mode, "report");
  assert.strictEqual(languageCheck.parseArgs(["--revoke", "--dry-run"]).mode, "dry-run");
  assert.strictEqual(languageCheck.parseArgs(["--revoke", "--approve", "--fix"]).mode, "fix");
  assert.strictEqual(languageCheck.parseArgs(["--revoke", "--approve"]).mode, "approve");
  assert.strictEqual(languageCheck.parseArgs(["--revoke"]).mode, "revoke");
  assert.strictEqual(languageCheck.parseArgs([]).mode, "default");
  console.log("   ✓ argv 優先序 report → dry-run → fix → approve → revoke");
}

{
  const env = makeEnvironment();
  try {
    const before = env.project.read("a.js");
    const code = languageCheck.main(["--dry-run"], env.options);
    assert.strictEqual(code, 1);
    assert.strictEqual(env.project.read("a.js"), before);
    console.log("   ✓ 乾跑模式回非零且不寫入");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment();
  try {
    const before = env.project.read("a.js");
    const result = languageCheck.applyFixes(env.options);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(env.project.read("a.js"), before);
    console.log("   ✓ 未核准的 HARD＋S2TWP 候選原文不變");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment('const a = "\u652f\u6301";\n');
  try {
    const before = env.project.read("a.js");
    const data = reportData(env);
    assert.strictEqual(data.entries.length, 0);
    assert.ok(data.meta.violationCount > 0);
    const result = languageCheck.applyFixes(env.options);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(env.project.read("a.js"), before);
    console.log("   ✓ 由正體組成的中國用語違規不進候選且修正不寫入");
  } finally {
    env.project.cleanup();
  }
}

{
  const cases = [
    { source: 'const a = "\u7f51\u7edc";\n', expected: "\u7f51\u7edc" },
    { source: 'const a = "\u4ec5\u4ec5";\n', expected: "\u4ec5\u4ec5" }
  ];
  cases.forEach(function (item) {
    const env = makeEnvironment(item.source);
    try {
      const data = reportData(env);
      assert.strictEqual(data.entries.length, 1);
      assert.ok(data.entries[0].suggestionOptions.length >= 1);
      const result = languageCheck.applyFixes(env.options);
      assert.strictEqual(result.applied, 0);
      assert.ok(env.project.read("a.js").includes(item.expected));
    } finally {
      env.project.cleanup();
    }
  });
  console.log("   ✓ 未核准的 HARD＋MAINLAND_TERMS 與僅 S2TW 來源候選原文不變");
}

{
  const env = makeEnvironment();
  try {
    const data = reportData(env);
    const entry = data.entries[0];
    assert.strictEqual(approve(env, entry), 0);
    const fixed = languageCheck.applyFixes(env.options);
    assert.strictEqual(fixed.applied, 1);
    const bytes = Buffer.from(env.project.read("a.js"));
    assert.strictEqual(bytes[bytes.length - 1], 0x0a);
    assert.strictEqual(bytes[bytes.length - 2], 0x3b);
    const option = entry.suggestionOptions.find(function (item) {
      return item.source === "S2TW";
    });
    assert.ok(env.project.read("a.js").includes(option.text));
    console.log("   ✓ S2TW 核准寫入所選建議且尾端換行 hex 不變");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment();
  try {
    const data = reportData(env);
    const entry = data.entries[0];
    assert.strictEqual(approve(env, entry, "S2TWP", "\u5c08\u6848"), 0);
    const record = JSON.parse(fs.readFileSync(env.registryPath, "utf8")).approvals[entry.id];
    assert.strictEqual(record.suggestionSource, "S2TWP");
    assert.strictEqual(record.suggestion, "\u5c08\u6848");
    const fixed = languageCheck.applyFixes(env.options);
    assert.strictEqual(fixed.applied, 1);
    assert.strictEqual(env.project.read("a.js"), 'const a = "\u5c08\u6848";\n');
    console.log("   ✓ S2TWP 建議綁定寫入不受受保護清冊收錄該詞影響");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment();
  try {
    const data = reportData(env);
    const entry = data.entries[0];
    const messages = [];
    const options = Object.assign({}, env.options, {
      error: function (message) {
        messages.push(String(message));
      }
    });
    assert.strictEqual(
      languageCheck.runApprovalCommand({ mode: "approve", ids: [entry.id, "S2TWP", "\u9805\u76ee"] }, options),
      1
    );
    assert.ok(
      messages.some(function (message) {
        return message.includes("SUGGESTION_NOT_IN_OPTIONS");
      })
    );
    assert.ok(
      messages.some(function (message) {
        return message.includes("S2TWP:\u5c08\u6848");
      })
    );
    assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(env.registryPath, "utf8")).approvals).length, 0);
    console.log("   ✓ SUGGESTION_NOT_IN_OPTIONS 列出選項、不寫清冊並回非零");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment();
  try {
    const data = reportData(env);
    const entry = data.entries[0];
    assert.strictEqual(languageCheck.runApprovalCommand({ mode: "approve", ids: ["unknown-id"] }, env.options), 1);
    assert.strictEqual(approve(env, entry), 0);
    assert.strictEqual(languageCheck.runApprovalCommand({ mode: "revoke", ids: ["unknown-id"] }, env.options), 1);
    assert.strictEqual(languageCheck.runApprovalCommand({ mode: "revoke", ids: [entry.id] }, env.options), 0);
    assert.strictEqual(Object.keys(JSON.parse(fs.readFileSync(env.registryPath, "utf8")).approvals).length, 0);
    console.log("   ✓ 未知核准與撤銷識別碼回非零；撤銷後清冊為空");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment();
  try {
    const data = reportData(env);
    const entry = data.entries[0];
    approve(env, entry);
    const protectedCandidate = analysis.candidateFromReportEntry(Object.assign({}, entry, { protected: true }));
    const decision = approvals.authorizeCandidate(approvals.loadRegistry(env.registryPath), protectedCandidate);
    assert.strictEqual(decision.result, analysis.RESULT.UNAPPROVED);
    assert.strictEqual(decision.reason, "PROTECTED_BY_ORIGINAL");
    const exemptCandidate = analysis.candidateFromReportEntry(Object.assign({}, entry, { exempt: true }));
    const exemptDecision = approvals.authorizeCandidate(approvals.loadRegistry(env.registryPath), exemptCandidate);
    assert.strictEqual(exemptDecision.result, analysis.RESULT.UNAPPROVED);
    assert.strictEqual(exemptDecision.reason, "EXEMPT_BY_POLICY");
    const registry = approvals.loadRegistry(env.registryPath);
    const protectedEntry = analysis.buildReportEntries([protectedCandidate], { registry: registry }).entries[0];
    const exemptEntry = analysis.buildReportEntries([exemptCandidate], { registry: registry }).entries[0];
    assert.strictEqual(protectedEntry.approvalState, analysis.RESULT.UNAPPROVED);
    assert.strictEqual(protectedEntry.approvalReason, "PROTECTED_BY_ORIGINAL");
    assert.strictEqual(exemptEntry.approvalState, analysis.RESULT.UNAPPROVED);
    assert.strictEqual(exemptEntry.approvalReason, "EXEMPT_BY_POLICY");
    const injected = languageCheck.buildReportData(env.options);
    injected.candidates[0].protected = true;
    injected.candidates[0].exempt = true;
    const before = env.project.read("a.js");
    const result = languageCheck.applyFixes(Object.assign({}, env.options, { reportData: injected }));
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(env.project.read("a.js"), before);
    assert.strictEqual(
      languageCheck.getWritableDecision(injected.candidates[0], approvals.loadRegistry(env.registryPath)),
      null
    );
    console.log("   ✓ 已核准但受保護或豁免候選回 UNAPPROVED 且不寫入（protected 優先）");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment();
  try {
    const data = reportData(env);
    const entry = data.entries[0];
    approve(env, entry);
    const outDir = path.join(env.project.root, "artifacts");
    languageCheck.main(["--report", "--output", outDir], Object.assign({}, env.options, { reportData: data }));
    const jsonlPath = path.join(outDir, languageCheck.REPORT_JSONL);
    const lines = fs.readFileSync(jsonlPath, "utf8").trimEnd().split("\n");
    const tampered = JSON.parse(lines[1]);
    tampered.approvalState = "AUTHORIZED";
    tampered.suggestion = "\\u6a19\\u6e96";
    tampered.suggestionSource = "OTHER";
    lines[1] = JSON.stringify(tampered);
    fs.writeFileSync(jsonlPath, lines.join("\n") + "\n");
    approvals.saveRegistry(approvals.emptyRegistry(), env.registryPath);
    const before = env.project.read("a.js");
    const result = languageCheck.applyFixes(env.options);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(env.project.read("a.js"), before);
    console.log("   ✓ 竄改報告 approvalState／suggestion 不得使未核准候選寫入");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment();
  try {
    const data = reportData(env);
    const entry = data.entries[0];
    approve(env, entry);
    const outDir = path.join(env.project.root, "artifacts");
    languageCheck.main(["--report", "--output", outDir], Object.assign({}, env.options, { reportData: data }));
    env.project.write("a.js", 'const a = "\u9879\u76ee"; // format\n');
    const fixData = languageCheck.buildFixCandidates(env.options);
    assert.strictEqual(fixData.candidates[0].reportedId, entry.id);
    assert.notStrictEqual(fixData.candidates[0].id, entry.id);
    const decision = approvals.authorizeCandidate(approvals.loadRegistry(env.registryPath), fixData.candidates[0]);
    assert.strictEqual(decision.result, analysis.RESULT.ORIGINAL_MISMATCH);
    const result = languageCheck.applyFixes(env.options);
    assert.strictEqual(result.applied, 0);
    assert.strictEqual(env.project.read("a.js"), 'const a = "\u9879\u76ee"; // format\n');
    console.log("   ✓ 舊報告 reportedId 因格式化失效回 ORIGINAL_MISMATCH 且不寫入");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment();
  try {
    const data = reportData(env);
    const entry = data.entries[0];
    const candidate = analysis.candidateFromReportEntry(entry);
    const registry = approvals.loadRegistry(env.registryPath);
    assert.strictEqual(approvals.authorizeCandidate(registry, candidate).result, analysis.RESULT.UNAPPROVED);
    approve(env, entry);
    const authorized = analysis.candidateFromReportEntry(entry);
    const decision = approvals.authorizeCandidate(approvals.loadRegistry(env.registryPath), authorized);
    assert.strictEqual(decision.result, analysis.RESULT.AUTHORIZED);
    assert.strictEqual(decision.reason, "\u5df2\u6838\u51c6");
    const nulCandidate = Object.assign({}, candidate, {
      original: "\u9879\u0000\u76ee",
      contextHash: entry.contextHash
    });
    assert.strictEqual(
      approvals.authorizeCandidate(approvals.loadRegistry(env.registryPath), nulCandidate).reason,
      "SEPARATOR_IN_IDENTIFIER"
    );
    console.log("   ✓ 四態決策表 UNAPPROVED／AUTHORIZED 與分隔符守門可區隔");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment();
  try {
    const data = reportData(env);
    const entry = data.entries[0];
    const candidate = analysis.candidateFromReportEntry(entry);
    approve(env, entry);
    const registry = approvals.loadRegistry(env.registryPath);
    const currentId = stableId.computeStableId(candidate);
    const record = registry.approvals[currentId];
    assert.ok(record);
    const tamperedRegistry = {
      version: registry.version,
      approvals: Object.assign({}, registry.approvals, {
        [currentId]: Object.assign({}, record, { original: "\u4fee\u6539" })
      })
    };
    const tamperedDecision = approvals.authorizeCandidate(tamperedRegistry, candidate);
    assert.strictEqual(tamperedDecision.result, analysis.RESULT.INVALID_RECORD);
    assert.strictEqual(tamperedDecision.reason, "APPROVAL_TAMPERED");
    const upgradedRegistry = {
      version: registry.version,
      approvals: { ffffffffffffffff: Object.assign({}, record) }
    };
    const upgradedDecision = approvals.authorizeCandidate(
      upgradedRegistry,
      Object.assign({}, candidate, { reportedId: "ffffffffffffffff" })
    );
    assert.strictEqual(upgradedDecision.result, analysis.RESULT.INVALID_RECORD);
    assert.strictEqual(upgradedDecision.reason, "ID_ALGORITHM_CHANGED");
    assert.notStrictEqual(tamperedDecision.reason, upgradedDecision.reason);
    const mismatched = approvals.authorizeCandidate(
      approvals.emptyRegistry(),
      Object.assign({}, candidate, { reportedId: "ffffffffffffffff" })
    );
    assert.strictEqual(mismatched.result, analysis.RESULT.UNAPPROVED);
    console.log("   ✓ 四態決策表 INVALID_RECORD 診斷可區隔且 reportedId 無紀錄時為 UNAPPROVED");
  } finally {
    env.project.cleanup();
  }
}

{
  const env = makeEnvironment('const a = "\u9879\u76ee";\nconst b = "\u9879\u76ee";\n');
  try {
    const data = reportData(env);
    assert.strictEqual(data.entries.length, 2);
    approve(env, data.entries[0]);
    const code = languageCheck.main(["--fix"], env.options);
    assert.strictEqual(code, 1);
    const content = env.project.read("a.js");
    assert.ok(content.includes('const a = "\u9805\u76ee";'));
    assert.ok(content.includes('const b = "\u9879\u76ee";'));
    console.log("   ✓ 修正後重新檢查仍有違規時回非零");
  } finally {
    env.project.cleanup();
  }
}

{
  // 核准清冊讀取失敗時不得被空清冊覆寫（PR #19 審查意見）
  const env = makeEnvironment('const a = "\u9879\u76ee";\n');
  try {
    const entry = reportData(env).entries[0];
    assert.strictEqual(approve(env, entry), 0);
    const before = fs.readFileSync(env.registryPath, "utf8");
    const denied = Object.assign({}, env.options, {
      readFile: function () {
        throw new Error("EACCES");
      }
    });
    const revokeMessages = [];
    const revokeOptions = Object.assign({}, denied, {
      error: function (message) {
        revokeMessages.push(message);
      }
    });
    assert.strictEqual(languageCheck.runApprovalCommand({ mode: "revoke", ids: [] }, revokeOptions), 1);
    assert.strictEqual(fs.readFileSync(env.registryPath, "utf8"), before);
    assert.ok(
      revokeMessages.some(function (message) {
        return message.includes("APPROVALS_UNAVAILABLE");
      })
    );
    const approveMessages = [];
    const approveOptions = Object.assign({}, denied, {
      error: function (message) {
        approveMessages.push(message);
      }
    });
    assert.strictEqual(languageCheck.runApprovalCommand({ mode: "approve", ids: [entry.id] }, approveOptions), 1);
    assert.strictEqual(fs.readFileSync(env.registryPath, "utf8"), before);
    assert.ok(
      approveMessages.some(function (message) {
        return message.includes("APPROVALS_UNAVAILABLE");
      })
    );
    console.log("   ✓ 清冊讀取失敗時核准與撤銷皆中止且不覆寫既有紀錄");
  } finally {
    env.project.cleanup();
  }
}

console.log("✓ 語言檢查四模式契約測試全數通過！\n");
