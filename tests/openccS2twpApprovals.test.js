"use strict";

/**
 * `scripts/openccS2twpApprovals.js` 核准清冊外殼契約測試。
 *
 * 覆蓋純 ascii 序列化、代理對與控制字元來回、版本 fail-closed、原型鍵
 * fail-closed、載入剔除與保留策略、累加／覆寫／撤銷，以及四態授權決策表。
 * 所有簡體負面字面值皆以 Unicode 跳脫或碼位組合表示。
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const approvals = require("../scripts/openccS2twpApprovals.js");
const stableId = require("../quality-core/openccStableId.js");
const analysis = require("../quality-core/openccLanguageAnalysis.js");
const languageCheck = require("../scripts/languageCheck.js");

/** 簡體 `\u9879\u76ee` */
const SIMPLED_XIANGMU = "\u9879\u76ee";
/** 繁體「項目」 */
const TRAD_XIANGMU = "\u9805\u76ee";
/** 繁體「專案」 */
const TRAD_ZHUANAN = "\u5c08\u6848";

console.log("開始執行核准清冊外殼契約測試...\n");

/**
 * @description 建立隔離的臨時目錄。
 * @returns {string} 臨時目錄路徑
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "opencode-approvals-"));
}

/**
 * @description 建立授權測試候選。
 * @param {Object} [overrides] - 覆寫欄位
 * @returns {Object} 候選
 */
function makeCandidate(overrides) {
  return Object.assign(
    {
      file: "scripts/example.js",
      line: 10,
      column: 6,
      original: SIMPLED_XIANGMU,
      suggestion: TRAD_XIANGMU,
      suggestionSource: analysis.SOURCE_S2TW,
      suggestionOptions: [
        { source: analysis.SOURCE_S2TW, text: TRAD_XIANGMU },
        { source: analysis.SOURCE_S2TWP, text: TRAD_ZHUANAN }
      ],
      contextHash: "abc123def4567890",
      occurrenceIndex: 0,
      protected: false,
      exempt: false,
      reportedId: ""
    },
    overrides || {}
  );
}

/**
 * @description 由候選建立包含版本欄位的清冊。
 * @param {Object} candidate - 候選
 * @param {Object} [recordOverrides] - 紀錄覆寫
 * @returns {Object} 清冊
 */
function makeRegistry(candidate, recordOverrides) {
  const id = stableId.computeStableId(candidate);
  const record = Object.assign({}, candidate, { approvedAt: "2026-01-01T00:00:00.000Z" }, recordOverrides || {});
  return { version: approvals.VERSION, approvals: { [id]: record } };
}

console.log("1. 常數、空清冊與純 ascii 跳脫...");
{
  assert.strictEqual(approvals.VERSION, 1);
  assert.strictEqual(approvals.RESULT.AUTHORIZED, "AUTHORIZED");
  assert.strictEqual(approvals.RESULT.UNAPPROVED, "UNAPPROVED");
  assert.strictEqual(approvals.RESULT.INVALID_RECORD, "INVALID_RECORD");
  assert.strictEqual(approvals.RESULT.ORIGINAL_MISMATCH, "ORIGINAL_MISMATCH");
  assert.strictEqual(approvals.VERSION_UNSUPPORTED, "APPROVALS_VERSION_UNSUPPORTED");
  assert.deepStrictEqual(approvals.emptyRegistry(), { version: 1, approvals: {} });
  assert.strictEqual(approvals.escapeNonAscii("A\u9879\u76ee\uD83D\uDE00Z"), "A\\u9879\\u76ee\\ud83d\\ude00Z");
  assert.strictEqual(approvals.isPureAscii("A\\u9879Z"), true);
  assert.strictEqual(approvals.isPureAscii("A\u9879Z"), false);
  assert.strictEqual(approvals.isPureAscii(null), false);
  assert.strictEqual(
    JSON.parse('"' + approvals.escapeNonAscii("A\u9879\u76ee\uD83D\uDE00Z") + '"'),
    "A\u9879\u76ee\uD83D\uDE00Z"
  );
  assert.deepStrictEqual(approvals.normalizeRecord(null), null);
  assert.deepStrictEqual(approvals.normalizeApprovals(null), {});
  assert.deepStrictEqual(approvals.normalizeApprovals({ __proto__: {} }), {});
  console.log("   ✓ 常數、空清冊與跳脫驗證通過！\n");
}

console.log("2. 序列化來回、純 ascii 與硬閘門零違規...");
{
  const tempDir = createTempDir();
  try {
    const special = "前置 " + SIMPLED_XIANGMU + ' "反斜線\\\\ 換行\n表情\uD83D\uDE00';
    const candidate = makeCandidate({
      original: special,
      suggestion: TRAD_ZHUANAN,
      suggestionSource: analysis.SOURCE_S2TWP,
      suggestionOptions: [{ source: analysis.SOURCE_S2TWP, text: TRAD_ZHUANAN }]
    });
    const created = approvals.createApproval(candidate, { approvedAt: "2026-01-01T00:00:00.000Z" });
    assert.strictEqual(created.id, stableId.computeStableId(candidate));
    const registry = { version: approvals.VERSION, approvals: { [created.id]: created.record } };
    const content = approvals.serializeRegistry(registry);
    assert.strictEqual(approvals.isPureAscii(content), true);
    assert.ok(content.includes("\\ud83d\\ude00"), "代理對兩碼元應各以四位十六進位呈現");
    assert.ok(!content.includes("\\u1f600"), "不得產生五位以上形式");
    const parsed = JSON.parse(content);
    assert.deepStrictEqual(parsed.approvals[created.id], created.record);
    assert.strictEqual(stableId.computeStableId(parsed.approvals[created.id]), created.id);
    assert.strictEqual(stableId.isStableIdValid(created.id, parsed.approvals[created.id]), true);
    assert.strictEqual(approvals.verifySerializedRegistry(content).ok, true);

    const target = path.join(tempDir, "approvals.json");
    const bytes = approvals.saveRegistry(registry, target);
    assert.strictEqual(bytes, Buffer.byteLength(content, "ascii"));
    assert.strictEqual(fs.readFileSync(target, "utf8"), content);
    const loaded = approvals.loadRegistry(target);
    assert.strictEqual(loaded.diagnostic, null);
    assert.deepStrictEqual(loaded.approvals[created.id], created.record);
    assert.strictEqual(approvals.authorizeCandidate(loaded, candidate).result, approvals.RESULT.AUTHORIZED);
    assert.deepStrictEqual(languageCheck.checkProject(tempDir), []);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("   ✓ 序列化來回與硬閘門零違規驗證通過！\n");
}

console.log("3. 寫入前雙驗證失敗路徑...");
{
  const tempDir = createTempDir();
  try {
    const target = path.join(tempDir, "approvals.json");
    assert.throws(
      function () {
        approvals.saveRegistry({ version: 2, approvals: {} }, target);
      },
      function (error) {
        return error.code === approvals.VERSION_UNSUPPORTED;
      }
    );
    assert.strictEqual(fs.existsSync(target), false);
    assert.strictEqual(approvals.verifySerializedRegistry('{"version":1,"approvals":{}}').ok, true);
    assert.strictEqual(
      approvals.verifySerializedRegistry('{"version":1,"approvals":{"ffffffffffffffff":{"file":"a"}}}').reason,
      "APPROVALS_ID_MISMATCH"
    );
    assert.strictEqual(
      approvals.verifySerializedRegistry('{"version":"1","approvals":{}}').reason,
      approvals.VERSION_UNSUPPORTED
    );
    assert.strictEqual(
      approvals.verifySerializedRegistry('{"version":1,"approvals":{"__proto__":{}}}').reason,
      "APPROVALS_PROTOTYPE_KEY"
    );
    assert.strictEqual(
      approvals.verifySerializedRegistry('{"version":1,"approvals":{},"x":"\u9879"}').reason,
      "NON_ASCII_SERIALIZATION"
    );
    assert.strictEqual(approvals.verifySerializedRegistry("not json").reason, "APPROVALS_PARSE_FAILED");
    assert.deepStrictEqual(approvals.parseRegistryText("not json"), {
      ok: false,
      data: null,
      reason: "APPROVALS_PARSE_FAILED"
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("   ✓ 寫入前雙驗證失敗路徑驗證通過！\n");
}

console.log("4. 載入 fail-closed：版本、原型鍵與讀取失敗...");
{
  const tempDir = createTempDir();
  try {
    const candidate = makeCandidate();
    const target = path.join(tempDir, "approvals.json");
    ['"1"', "2", "null", "0"].forEach(function (version) {
      fs.writeFileSync(target, '{"version":' + version + ',"approvals":{}}', "utf8");
      const loaded = approvals.loadRegistry(target);
      assert.strictEqual(loaded.diagnostic, approvals.VERSION_UNSUPPORTED, "版本 " + version + " 應拒絕");
      assert.deepStrictEqual(loaded.approvals, {});
      const decision = approvals.authorizeCandidate(loaded, candidate);
      assert.strictEqual(decision.result, approvals.RESULT.INVALID_RECORD);
      assert.strictEqual(decision.reason, approvals.VERSION_UNSUPPORTED);
    });
    fs.writeFileSync(target, '{"version":2,"approvals":{"bad":{"file":"x"},"__proto__":{}}}', "utf8");
    assert.strictEqual(approvals.loadRegistry(target).diagnostic, approvals.VERSION_UNSUPPORTED);
    fs.writeFileSync(target, '{"version":1.0,"approvals":{}}', "utf8");
    assert.strictEqual(approvals.loadRegistry(target).diagnostic, null);
    ["[]", '"字串"', "null"].forEach(function (approvalsValue) {
      fs.writeFileSync(target, '{"version":1,"approvals":' + approvalsValue + "}", "utf8");
      assert.strictEqual(approvals.loadRegistry(target).diagnostic, "APPROVALS_NOT_PLAIN_OBJECT");
    });
    ["__proto__", "constructor", "prototype"].forEach(function (key) {
      fs.writeFileSync(target, '{"version":1,"approvals":{"' + key + '":{}}}', "utf8");
      assert.strictEqual(approvals.loadRegistry(target).diagnostic, "APPROVALS_PROTOTYPE_KEY");
    });
    fs.writeFileSync(target, "not json", "utf8");
    assert.strictEqual(approvals.loadRegistry(target).diagnostic, "APPROVALS_PARSE_FAILED");
    assert.strictEqual(approvals.loadRegistry(path.join(tempDir, "不存在.json")).diagnostic, "APPROVALS_READ_FAILED");
    assert.strictEqual(
      approvals.loadRegistry(target, {
        readFile: function () {
          throw new Error("人為失敗");
        }
      }).diagnostic,
      "APPROVALS_READ_FAILED"
    );
    const plain = approvals.loadRegistry(target, {
      readFile: function () {
        return '{"version":1,"approvals":{}}';
      }
    });
    assert.strictEqual(plain.diagnostic, null);
    assert.strictEqual(approvals.authorizeCandidate(null, candidate).result, approvals.RESULT.UNAPPROVED);
    const grouped = approvals.authorizeCandidates({ version: 2, approvals: {}, diagnostic: null }, [candidate]);
    assert.strictEqual(grouped.invalid.length, 1, "批次判定亦須通過版本 fail-closed 守門");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("   ✓ 載入 fail-closed 驗證通過！\n");
}

console.log("5. 累加、覆寫、撤銷與不復活...");
{
  const tempDir = createTempDir();
  try {
    const first = makeCandidate({ file: "scripts/a.js" });
    const second = makeCandidate({ file: "scripts/b.js" });
    const third = makeCandidate({ file: "scripts/c.js" });
    const firstId = stableId.computeStableId(first);
    const secondId = stableId.computeStableId(second);
    const target = path.join(tempDir, "approvals.json");

    const added = approvals.addApprovals(approvals.emptyRegistry(), [first, second, null], { approvedAt: "固定時間" });
    assert.strictEqual(added.added.length, 2);
    assert.deepStrictEqual(added.rejected, [""]);
    const duplicate = approvals.addApprovals(added.registry, [first], { approvedAt: "覆寫時間" });
    assert.deepStrictEqual(duplicate.added, [firstId]);
    assert.strictEqual(Object.keys(duplicate.registry.approvals).length, 2);
    assert.strictEqual(duplicate.registry.approvals[firstId].approvedAt, "覆寫時間");

    const entry = Object.assign({}, first, { id: firstId, tier: "HIGH" });
    const fromReport = approvals.approveFromReport([entry], [firstId, "找不到"], {
      registry: duplicate.registry,
      approvedAt: "報告時間"
    });
    assert.deepStrictEqual(fromReport.added, [firstId]);
    assert.deepStrictEqual(fromReport.missing, ["找不到"]);
    assert.ok(Object.hasOwn(fromReport.registry.approvals, secondId));
    assert.strictEqual(approvals.authorizeCandidate(fromReport.registry, first).result, approvals.RESULT.AUTHORIZED);
    approvals.saveRegistry(fromReport.registry, target);

    const revoked = approvals.revokeApprovals(approvals.loadRegistry(target), [firstId, "不存在"]);
    assert.deepStrictEqual(revoked.removed, [firstId]);
    assert.deepStrictEqual(revoked.missing, ["不存在"]);
    approvals.saveRegistry(revoked.registry, target);
    let current = approvals.loadRegistry(target);
    assert.strictEqual(Object.hasOwn(current.approvals, firstId), false);
    assert.strictEqual(approvals.authorizeCandidate(current, first).result, approvals.RESULT.UNAPPROVED);

    const approvedThird = approvals.approveFromReport(
      [Object.assign({}, third, { id: stableId.computeStableId(third) })],
      [stableId.computeStableId(third)],
      { registry: current }
    );
    approvals.saveRegistry(approvedThird.registry, target);
    current = approvals.loadRegistry(target);
    assert.strictEqual(Object.hasOwn(current.approvals, firstId), false, "撤銷ID不得因後續核准而復活");
    assert.strictEqual(Object.hasOwn(current.approvals, secondId), true);
    assert.strictEqual(Object.hasOwn(current.approvals, stableId.computeStableId(third)), true);
    assert.ok(approvals.formatOperationResult(fromReport).includes("找不到"));
    assert.ok(approvals.formatOperationResult({ added: [firstId], removed: [firstId] }).includes("撤銷"));
    assert.strictEqual(approvals.formatOperationResult(null), "無變更");
    assert.strictEqual(approvals.revokeApprovals(null, null).registry.version, approvals.VERSION);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
  console.log("   ✓ 累加、覆寫、撤銷與不復活驗證通過！\n");
}

console.log("6. 授權決策表：行號漂移、原文變動與否決...");
{
  const candidate = makeCandidate();
  const registry = makeRegistry(candidate);
  assert.strictEqual(approvals.authorizeCandidate(registry, candidate).result, approvals.RESULT.AUTHORIZED);
  assert.strictEqual(
    approvals.authorizeCandidate(registry, makeCandidate({ line: 999, column: 2 })).result,
    approvals.RESULT.AUTHORIZED
  );
  assert.strictEqual(
    approvals.authorizeCandidate(
      registry,
      makeCandidate({ original: "不同原文", reportedId: stableId.computeStableId(candidate) })
    ).result,
    approvals.RESULT.ORIGINAL_MISMATCH
  );
  assert.strictEqual(
    approvals.authorizeCandidate(registry, makeCandidate({ contextHash: "different000000" })).result,
    approvals.RESULT.UNAPPROVED
  );
  assert.strictEqual(approvals.authorizeCandidate(registry, null).result, approvals.RESULT.UNAPPROVED);
  assert.strictEqual(
    approvals.authorizeCandidate(registry, makeCandidate({ original: "含\0分隔" })).result,
    approvals.RESULT.INVALID_RECORD
  );
  const protectedDecision = approvals.authorizeCandidate(registry, makeCandidate({ protected: true }));
  assert.strictEqual(protectedDecision.result, approvals.RESULT.UNAPPROVED);
  assert.strictEqual(protectedDecision.reason, "PROTECTED_BY_ORIGINAL");
  const exemptDecision = approvals.authorizeCandidate(registry, makeCandidate({ exempt: true }));
  assert.strictEqual(exemptDecision.reason, "EXEMPT_BY_POLICY");
  assert.strictEqual(
    approvals.authorizeCandidate(registry, makeCandidate({ protected: true, exempt: true })).reason,
    "PROTECTED_BY_ORIGINAL"
  );
  const grouped = approvals.authorizeCandidates(registry, [
    candidate,
    makeCandidate({ file: "scripts/other.js" }),
    null
  ]);
  assert.strictEqual(grouped.authorized.length, 1);
  assert.strictEqual(grouped.unauthorized.length, 2);
  assert.deepStrictEqual(approvals.authorizeCandidates(null, null), {
    authorized: [],
    unauthorized: [],
    invalid: [],
    mismatched: []
  });
  console.log("   ✓ 授權決策表基礎分支驗證通過！\n");
}

console.log("7. 授權決策表：無效紀錄與 reportedId 診斷...");
{
  const candidate = makeCandidate();
  const currentId = stableId.computeStableId(candidate);
  const otherFields = makeCandidate({ contextHash: "other000000000000" });
  const otherId = stableId.computeStableId(otherFields);

  const tampered = makeRegistry(candidate, { original: "遭到竄改" });
  const tamperedDecision = approvals.authorizeCandidate(tampered, candidate);
  assert.strictEqual(tamperedDecision.result, approvals.RESULT.INVALID_RECORD);
  assert.strictEqual(tamperedDecision.reason, "APPROVAL_TAMPERED");

  const drifted = makeRegistry(candidate, {
    suggestion: TRAD_ZHUANAN,
    suggestionSource: analysis.SOURCE_S2TWP
  });
  const driftedCandidate = makeCandidate({
    suggestion: TRAD_XIANGMU,
    suggestionSource: analysis.SOURCE_S2TW,
    suggestionOptions: [{ source: analysis.SOURCE_S2TW, text: TRAD_XIANGMU }]
  });
  assert.strictEqual(approvals.authorizeCandidate(drifted, driftedCandidate).reason, "SUGGESTION_OPTION_DRIFT");

  const upgradedRegistry = {
    version: approvals.VERSION,
    approvals: { ffffffffffffffff: Object.assign({}, candidate, { approvedAt: "固定時間" }) }
  };
  assert.strictEqual(
    approvals.authorizeCandidate(upgradedRegistry, makeCandidate({ reportedId: "ffffffffffffffff" })).reason,
    "ID_ALGORITHM_CHANGED"
  );

  const tamperedHistoryRegistry = {
    version: approvals.VERSION,
    approvals: { ffffffffffffffff: Object.assign({}, candidate, { original: "遭到竄改", approvedAt: "固定時間" }) }
  };
  assert.strictEqual(
    approvals.authorizeCandidate(tamperedHistoryRegistry, makeCandidate({ reportedId: "ffffffffffffffff" })).reason,
    "APPROVAL_TAMPERED"
  );

  const changedFields = approvals.authorizeCandidate(makeRegistry(otherFields), makeCandidate({ reportedId: otherId }));
  assert.strictEqual(changedFields.result, approvals.RESULT.ORIGINAL_MISMATCH);
  assert.strictEqual(changedFields.reason, "ORIGINAL_FIELDS_CHANGED");

  const withSeparator = makeCandidate({ original: "含\0分隔" });
  const separatorId = stableId.computeStableId(withSeparator);
  const separatorRegistry = {
    version: approvals.VERSION,
    approvals: { [separatorId]: Object.assign({}, withSeparator, { approvedAt: "固定時間" }) }
  };
  assert.strictEqual(
    approvals.authorizeCandidate(separatorRegistry, makeCandidate({ reportedId: separatorId })).reason,
    "SEPARATOR_IN_IDENTIFIER"
  );

  const malformedIdRegistry = {
    version: approvals.VERSION,
    approvals: { bad: Object.assign({}, candidate, { approvedAt: "固定時間" }) }
  };
  const malformedDecision = approvals.authorizeCandidate(malformedIdRegistry, makeCandidate({ reportedId: "bad" }));
  assert.strictEqual(malformedDecision.result, approvals.RESULT.INVALID_RECORD, "格式無效紀錄被剔除後 fail-closed");
  assert.strictEqual(malformedDecision.reason, "SEPARATOR_IN_IDENTIFIER");

  const conflictRegistry = {
    version: approvals.VERSION,
    approvals: {
      [currentId]: Object.assign({}, candidate, {
        suggestion: TRAD_ZHUANAN,
        suggestionSource: analysis.SOURCE_S2TWP,
        approvedAt: "固定時間"
      }),
      [otherId]: Object.assign({}, otherFields, { approvedAt: "固定時間" })
    }
  };
  assert.strictEqual(
    approvals.authorizeCandidate(conflictRegistry, makeCandidate({ reportedId: otherId })).reason,
    "REPORTED_ID_FIELDS_MISMATCH"
  );

  // 目前 ID 命中時，即便 reportedId 指向另一個有效紀錄，只要其四欄位與候選不同，
  // 仍先回 REPORTED_ID_FIELDS_MISMATCH，杜絕寫入非核閱者所選建議；由於內容定址
  // ID 由四欄位決定，reportedId 有效且欄位相同時必等於 currentId，不會逕行走
  // 建議衝突分支，故此不變式由前一阻隔離鎖定，無需一個不可達的測試案例。
  const differentSuggestionRegistry = {
    version: approvals.VERSION,
    approvals: {
      [currentId]: Object.assign({}, candidate, {
        suggestion: TRAD_ZHUANAN,
        suggestionSource: analysis.SOURCE_S2TWP,
        approvedAt: "固定時間"
      }),
      [otherId]: Object.assign({}, otherFields, {
        suggestion: TRAD_XIANGMU,
        suggestionSource: analysis.SOURCE_S2TW,
        approvedAt: "固定時間"
      })
    }
  };
  const conflictCandidate = makeCandidate({ reportedId: otherId });
  assert.strictEqual(
    approvals.authorizeCandidate(differentSuggestionRegistry, conflictCandidate).reason,
    "REPORTED_ID_FIELDS_MISMATCH"
  );
  console.log("   ✓ 無效紀錄與 reportedId 診斷驗證通過！\n");
}

console.log("✓ 核准清冊外殼契約測試全數通過！\n");
