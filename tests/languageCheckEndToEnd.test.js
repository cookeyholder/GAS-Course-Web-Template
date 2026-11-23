"use strict";

/**
 * 語言檢查端到端整合測試（4.6）。
 * 於暫存目錄注入 root 與清冊路徑，涵蓋報告→核准→修正→撤銷→再核准全生命週期，
 * 並驗證所有寫入皆由清冊核准決定，報告與寫入行為一致。
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

/** 建立隔離專案並注入清冊路徑與輸出紀錄。 */
function createEnvironment(source) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "lc-e2e-"));
  const registryPath = path.join(root, "registry.json");
  approvals.saveRegistry(approvals.emptyRegistry(), registryPath);
  const messages = { logs: [], errors: [] };
  const options = {
    root: root,
    approvalsPath: registryPath,
    literalDrift: { drifted: false, added: [], removed: [] },
    log: function (message) {
      messages.logs.push(String(message));
    },
    error: function (message) {
      messages.errors.push(String(message));
    }
  };
  const env = {
    root: root,
    registryPath: registryPath,
    options: options,
    messages: messages,
    write: function (relative, content) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
    },
    read: function (relative) {
      return fs.readFileSync(path.join(root, relative), "utf8");
    },
    cleanup: function () {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
  if (source !== undefined) env.write("a.js", source);
  return env;
}

/** 取得目前報告資料。 */
function reportData(env) {
  return languageCheck.buildReportData(env.options);
}

/** 核准指定 ID，可綁定建議來源與文字。 */
function approve(env, id, source, suggestion) {
  const ids = source === undefined ? [id] : [id, source, suggestion];
  return languageCheck.runApprovalCommand({ mode: "approve", ids: ids }, env.options);
}

/** 撤銷指定 ID。 */
function revoke(env, id) {
  return languageCheck.runApprovalCommand({ mode: "revoke", ids: [id] }, env.options);
}

/** 讀取清冊中指定 ID 的紀錄。 */
function recordOf(env, id) {
  return approvals.loadRegistry(env.registryPath).approvals[id];
}

/** 取得報告候選的建議選項。 */
function optionOf(entry, source) {
  return entry.suggestionOptions.find(function (option) {
    return option.source === source;
  });
}

console.log("開始執行語言檢查端到端整合測試...\n");

console.log("1. 報告→覆寫核准→修正→撤銷→再核准→舊報告失效生命週期...");
{
  const env = createEnvironment('const a = "\u9879\u76ee";\n');
  try {
    const report = reportData(env);
    assert.strictEqual(report.entries.length, 1);
    const entry = report.entries[0];
    const id = entry.id;
    const s2twText = optionOf(entry, analysis.SOURCE_S2TW).text;
    const s2twpText = optionOf(entry, analysis.SOURCE_S2TWP).text;

    assert.strictEqual(approve(env, id, analysis.SOURCE_S2TW, s2twText), 0);
    assert.strictEqual(recordOf(env, id).suggestion, s2twText);
    assert.strictEqual(approve(env, id, analysis.SOURCE_S2TWP, s2twpText), 0);
    assert.strictEqual(Object.keys(approvals.loadRegistry(env.registryPath).approvals).length, 1);
    assert.strictEqual(recordOf(env, id).suggestionSource, analysis.SOURCE_S2TWP);
    assert.strictEqual(recordOf(env, id).suggestion, s2twpText);

    const outputDir = path.join(env.root, "artifacts");
    assert.strictEqual(
      languageCheck.main(["--report", "--output", outputDir], Object.assign({}, env.options, { reportData: report })),
      0
    );
    const jsonlPath = path.join(outputDir, languageCheck.REPORT_JSONL);
    assert.ok(fs.existsSync(jsonlPath), "報告應寫入 artifacts");

    const fixed = languageCheck.applyFixes(env.options);
    assert.strictEqual(fixed.applied, 1);
    assert.strictEqual(env.read("a.js"), 'const a = "\u5c08\u6848";\n');
    assert.deepStrictEqual(languageCheck.checkProject(env.root), [], "清冊不污染硬閘門");

    assert.strictEqual(revoke(env, id), 0);
    assert.strictEqual(Object.keys(approvals.loadRegistry(env.registryPath).approvals).length, 0);
    assert.ok(/^[\x00-\x7f]*$/.test(fs.readFileSync(env.registryPath, "utf8")), "撤銷後清冊仍為純 ASCII");

    env.write("a.js", 'const a = "\u9879\u76ee";\n');
    assert.strictEqual(languageCheck.applyFixes(env.options).applied, 0, "撤銷後不得寫入");
    assert.strictEqual(env.read("a.js"), 'const a = "\u9879\u76ee";\n');

    // 文件化：重新核准後必須重新產生報告；舊報告仍帶 reportedId 時，
    // 目前欄位一經格式化即失效，authorizeCandidate() 回 ORIGINAL_MISMATCH 且拒絕寫入。
    assert.strictEqual(approve(env, id, analysis.SOURCE_S2TWP, s2twpText), 0);
    env.write("a.js", 'const a = "\u9879\u76ee"; // format\n');
    const fixData = languageCheck.buildFixCandidates(env.options);
    assert.strictEqual(fixData.candidates[0].reportedId, id);
    assert.notStrictEqual(fixData.candidates[0].id, id);
    const staleDecision = approvals.authorizeCandidate(approvals.loadRegistry(env.registryPath), fixData.candidates[0]);
    assert.strictEqual(staleDecision.result, analysis.RESULT.ORIGINAL_MISMATCH);
    assert.strictEqual(languageCheck.applyFixes(env.options).applied, 0);
    console.log("   ✓ 生命週期、純 ASCII 清冊與舊報告 reportedId 失效驗證通過");
  } finally {
    env.cleanup();
  }
}

console.log("2. 從未核准的 HARD＋S2TWP 與 HARD＋MAINLAND_TERMS 候選原文不變...");
{
  const env = createEnvironment('const a = "\u7f51\u7edc";\n');
  try {
    const entry = reportData(env).entries[0];
    assert.ok(optionOf(entry, analysis.SOURCE_S2TWP));
    assert.ok(optionOf(entry, analysis.SOURCE_MAINLAND_TERMS));
    const before = env.read("a.js");
    assert.strictEqual(languageCheck.applyFixes(env.options).applied, 0);
    assert.strictEqual(env.read("a.js"), before);
    console.log("   ✓ 未核准候選不寫入驗證通過");
  } finally {
    env.cleanup();
  }
}

console.log("3. 已核准但受保護或豁免候選回 UNAPPROVED 且修正不寫入...");
{
  const env = createEnvironment('const a = "\u9879\u76ee";\n');
  try {
    const entry = reportData(env).entries[0];
    assert.strictEqual(approve(env, entry.id), 0);
    const registry = approvals.loadRegistry(env.registryPath);
    const protectedCandidate = analysis.candidateFromReportEntry(Object.assign({}, entry, { protected: true }));
    const exemptCandidate = analysis.candidateFromReportEntry(Object.assign({}, entry, { exempt: true }));
    const decisions = [
      analysis.buildReportEntries([protectedCandidate], { registry: registry }).entries[0],
      analysis.buildReportEntries([exemptCandidate], { registry: registry }).entries[0]
    ];
    assert.deepStrictEqual(
      decisions.map(function (item) {
        return item.approvalState;
      }),
      [analysis.RESULT.UNAPPROVED, analysis.RESULT.UNAPPROVED]
    );
    assert.deepStrictEqual(
      decisions.map(function (item) {
        return item.approvalReason;
      }),
      ["PROTECTED_BY_ORIGINAL", "EXEMPT_BY_POLICY"]
    );
    const injected = reportData(env);
    injected.candidates[0].protected = true;
    injected.candidates[0].exempt = true;
    const before = env.read("a.js");
    assert.strictEqual(languageCheck.applyFixes(Object.assign({}, env.options, { reportData: injected })).applied, 0);
    assert.strictEqual(env.read("a.js"), before);
    console.log("   ✓ 報告與寫入對受保護／豁免候選一致驗證通過");
  } finally {
    env.cleanup();
  }
}

console.log("4. 原文變動輸出 ORIGINAL_MISMATCH 且所選建議漂移亦回 ORIGINAL_MISMATCH...");
{
  const env = createEnvironment('const a = "\u9879\u76ee";\n');
  try {
    const report = reportData(env);
    const entry = report.entries[0];
    assert.strictEqual(approve(env, entry.id), 0);
    languageCheck.main(
      ["--report", "--output", path.join(env.root, "artifacts")],
      Object.assign({}, env.options, { reportData: report })
    );
    const registry = approvals.loadRegistry(env.registryPath);
    const normalized = approvals.normalizeRecord(registry.approvals[entry.id]);
    const drifted = Object.assign({}, normalized, { suggestion: "\u6a19\u6e96" });
    const driftedRegistry = { version: approvals.VERSION, approvals: { [entry.id]: drifted } };
    const driftedDecision = approvals.authorizeCandidate(driftedRegistry, analysis.candidateFromReportEntry(entry));
    assert.strictEqual(driftedDecision.result, analysis.RESULT.ORIGINAL_MISMATCH);
    assert.strictEqual(driftedDecision.reason, "SUGGESTION_OPTION_DRIFT");
    const driftedEntry = analysis.buildReportEntries([analysis.candidateFromReportEntry(entry)], {
      registry: driftedRegistry
    }).entries[0];
    assert.strictEqual(driftedEntry.approvalState, analysis.RESULT.ORIGINAL_MISMATCH);

    env.write("a.js", 'const a = "\u9879\u76ee"; // format\n');
    const changed = languageCheck.buildFixCandidates(env.options);
    assert.strictEqual(changed.candidates[0].reportedId, entry.id);
    const changedDecision = approvals.authorizeCandidate(
      approvals.loadRegistry(env.registryPath),
      changed.candidates[0]
    );
    assert.strictEqual(changedDecision.result, analysis.RESULT.ORIGINAL_MISMATCH);
    assert.strictEqual(
      analysis.buildReportEntries([changed.candidates[0]], { registry: registry }).entries[0].approvalReason,
      "ORIGINAL_FIELDS_CHANGED"
    );
    assert.strictEqual(languageCheck.applyFixes(env.options).applied, 0);
    console.log("   ✓ 原文變動與建議漂移均回 ORIGINAL_MISMATCH 驗證通過");
  } finally {
    env.cleanup();
  }
}

console.log("5. 含 \\0 候選或紀錄回 INVALID_RECORD...");
{
  const env = createEnvironment('const a = "\u9879\u76ee";\n');
  try {
    const entry = reportData(env).entries[0];
    const candidate = analysis.candidateFromReportEntry(entry);
    assert.strictEqual(approve(env, entry.id), 0);
    const withSeparator = Object.assign({}, candidate, { original: "\u542b\u0000\u5206\u9694" });
    assert.strictEqual(
      approvals.authorizeCandidate(approvals.loadRegistry(env.registryPath), withSeparator).result,
      analysis.RESULT.INVALID_RECORD
    );
    assert.strictEqual(
      approvals.authorizeCandidate(approvals.loadRegistry(env.registryPath), withSeparator).reason,
      "SEPARATOR_IN_IDENTIFIER"
    );
    const separatorId = stableId.computeStableId(withSeparator);
    const separatorRegistry = {
      version: approvals.VERSION,
      approvals: { [separatorId]: Object.assign({}, withSeparator, { approvedAt: "固定時間" }) }
    };
    const decision = approvals.authorizeCandidate(
      separatorRegistry,
      Object.assign({}, candidate, { reportedId: separatorId })
    );
    assert.strictEqual(decision.result, analysis.RESULT.INVALID_RECORD);
    assert.strictEqual(decision.reason, "SEPARATOR_IN_IDENTIFIER");
    console.log("   ✓ 分隔符候選與紀錄守門驗證通過");
  } finally {
    env.cleanup();
  }
}

console.log("6. 工具版本升級與欄位遭竄改診斷可區隔...");
{
  const env = createEnvironment('const a = "\u9879\u76ee";\n');
  try {
    const entry = reportData(env).entries[0];
    assert.strictEqual(approve(env, entry.id), 0);
    const candidate = analysis.candidateFromReportEntry(entry);
    const record = recordOf(env, entry.id);
    const tamperedRegistry = {
      version: approvals.VERSION,
      approvals: {
        [entry.id]: Object.assign({}, record, { original: "\u4fee\u6539" })
      }
    };
    const tampered = approvals.authorizeCandidate(tamperedRegistry, candidate);
    assert.strictEqual(tampered.result, analysis.RESULT.INVALID_RECORD);
    assert.strictEqual(tampered.reason, "APPROVAL_TAMPERED");
    const upgradedRegistry = {
      version: approvals.VERSION,
      approvals: { ffffffffffffffff: Object.assign({}, record) }
    };
    const upgraded = approvals.authorizeCandidate(
      upgradedRegistry,
      Object.assign({}, candidate, { reportedId: "ffffffffffffffff" })
    );
    assert.strictEqual(upgraded.result, analysis.RESULT.INVALID_RECORD);
    assert.strictEqual(upgraded.reason, "ID_ALGORITHM_CHANGED");
    assert.notStrictEqual(tampered.reason, upgraded.reason);
    console.log("   ✓ INVALID_RECORD 兩類診斷驗證通過");
  } finally {
    env.cleanup();
  }
}

console.log("7. 目前 ID 命中但 reportedId 舊紀錄欄位不符回 ORIGINAL_MISMATCH...");
{
  const env = createEnvironment('const a = "\u9879\u76ee";\n');
  try {
    const entry = reportData(env).entries[0];
    assert.strictEqual(approve(env, entry.id), 0);
    const candidate = analysis.candidateFromReportEntry(entry);
    const record = approvals.normalizeRecord(recordOf(env, entry.id));
    const otherFields = Object.assign({}, candidate, { contextHash: "other000000000000" });
    const otherId = stableId.computeStableId(otherFields);
    const conflictRegistry = {
      version: approvals.VERSION,
      approvals: {
        [entry.id]: record,
        [otherId]: approvals.normalizeRecord(Object.assign({}, otherFields, { approvedAt: "固定時間" }))
      }
    };
    const decision = approvals.authorizeCandidate(
      conflictRegistry,
      Object.assign({}, candidate, { reportedId: otherId })
    );
    assert.strictEqual(decision.result, analysis.RESULT.ORIGINAL_MISMATCH);
    assert.strictEqual(decision.reason, "REPORTED_ID_FIELDS_MISMATCH");
    // 內容定址 ID 由四欄位決定，reportedId 有效且欄位相同時必等於 currentId，
    // 故 REPORTED_ID_SUGGESTION_CONFLICT 分支不可達，以本不變式隔離鎖定。
    console.log("   ✓ reportedId 欄位衝突診斷驗證通過");
  } finally {
    env.cleanup();
  }
}

console.log("8. 竄改報告 approvalState 仍不得寫入...");
{
  const env = createEnvironment('const a = "\u9879\u76ee";\n');
  try {
    const report = reportData(env);
    const entry = report.entries[0];
    assert.strictEqual(approve(env, entry.id), 0);
    const outputDir = path.join(env.root, "artifacts");
    languageCheck.main(["--report", "--output", outputDir], Object.assign({}, env.options, { reportData: report }));
    const jsonlPath = path.join(outputDir, languageCheck.REPORT_JSONL);
    const lines = fs.readFileSync(jsonlPath, "utf8").trimEnd().split("\n");
    const tampered = JSON.parse(lines[1]);
    tampered.approvalState = "AUTHORIZED";
    tampered.suggestion = "\\u6a19\\u6e96";
    lines[1] = JSON.stringify(tampered);
    fs.writeFileSync(jsonlPath, lines.join("\n") + "\n");
    approvals.saveRegistry(approvals.emptyRegistry(), env.registryPath);
    const before = env.read("a.js");
    assert.strictEqual(languageCheck.applyFixes(env.options).applied, 0);
    assert.strictEqual(env.read("a.js"), before);
    console.log("   ✓ 竄改報告不寫入驗證通過");
  } finally {
    env.cleanup();
  }
}

console.log("9. 序列化撤銷後再核准不得復活已撤銷 ID...");
{
  const env = createEnvironment('const a = "\u9879\u76ee";\nconst b = "\u7f51\u7edc";\n');
  try {
    const entries = reportData(env).entries;
    assert.strictEqual(entries.length, 2);
    assert.strictEqual(approve(env, entries[0].id), 0);
    assert.strictEqual(approve(env, entries[1].id), 0);
    const revokedId = entries[0].id;
    assert.strictEqual(revoke(env, revokedId), 0);
    assert.ok(/^[\x00-\x7f]*$/.test(fs.readFileSync(env.registryPath, "utf8")), "撤銷後序列化仍為純 ASCII");
    assert.strictEqual(approve(env, entries[1].id), 0);
    const finalRegistry = approvals.loadRegistry(env.registryPath);
    assert.strictEqual(Object.hasOwn(finalRegistry.approvals, revokedId), false, "撤銷 ID 不得因再核准而復活");
    assert.strictEqual(Object.hasOwn(finalRegistry.approvals, entries[1].id), true);
    console.log("   ✓ 撤銷不復活驗證通過");
  } finally {
    env.cleanup();
  }
}

console.log("✓ 語言檢查端到端整合測試全數通過！\n");
