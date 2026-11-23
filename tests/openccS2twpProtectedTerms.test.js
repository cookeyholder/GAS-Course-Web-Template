"use strict";

/**
 * `scripts/openccS2twpProtectedTerms.js` 外殼契約測試。
 *
 * 覆蓋靜態抽取、最低抽取數量、失敗可觀測性、雙向收錄、契約字面值選用
 * 與遮蔽還原不變式。所有負面字面值皆以 Unicode 跳脫表示。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const protectedTerms = require("../scripts/openccS2twpProtectedTerms.js");
const core = require("../quality-core/openccProtectedTerms.js");

const PROJECT_ROOT = path.join(__dirname, "..");
const TRADITIONAL_PROJECT = "\u9805\u76ee";
const S2TWP_PROJECT = "\u5c08\u6848";

console.log("開始執行受保護術語外殼契約測試...\n");

console.log("1. 狀態常數與靜態清冊雙向收錄...");
{
  assert.strictEqual(protectedTerms.STATUS_AVAILABLE, "AVAILABLE");
  assert.strictEqual(protectedTerms.STATUS_UNAVAILABLE, "PROTECTED_TERMS_UNAVAILABLE");
  assert.strictEqual(protectedTerms.SOURCES.length, 3);
  assert.deepStrictEqual(
    protectedTerms.SOURCES.map(function (source) {
      return source.file;
    }),
    ["gasRuntime.js", "actionRegistry.js", "databaseInitializer.js"]
  );
  assert.ok(protectedTerms.KNOWN_MISTRANSLATIONS.includes(TRADITIONAL_PROJECT));
  assert.ok(protectedTerms.KNOWN_MISTRANSLATIONS.includes(S2TWP_PROJECT));
  assert.ok(protectedTerms.KNOWN_MISTRANSLATIONS.includes("課程代碼"));
  assert.ok(protectedTerms.KNOWN_MISTRANSLATIONS.includes("課程程式碼"));
  assert.ok(protectedTerms.KNOWN_MISTRANSLATIONS.includes("權限"));
  assert.ok(protectedTerms.KNOWN_MISTRANSLATIONS.includes("許可權"));
  assert.ok(protectedTerms.LEGAL_NAMES.includes("系統管理員"));
  assert.ok(protectedTerms.LEGAL_NAMES.includes("檢視人員"));
  console.log("   ✓ 狀態常數與雙向收錄驗證通過！\n");
}

console.log("2. 靜態字面值抽取與正規化...");
{
  const source = [
    'const a = "系統設定與授權";',
    "const b = '操作日誌';",
    'const c = "負面字面值 \\u9879\\u76ee";',
    "const d = '{\"版本\":1}';",
    '// 註解中的 "操作日誌" 不得抽取',
    'const e = "English only";'
  ].join("\n");
  const extracted = protectedTerms.extractChineseLiterals(source);
  assert.deepStrictEqual(extracted, ["系統設定與授權", "操作日誌"]);
  assert.deepStrictEqual(protectedTerms.extractChineseLiterals(null), []);

  const normalized = protectedTerms.normalizeTerms(["ab", "設備組", "", "課程代碼", "設備組", 42, "a"]);
  assert.deepStrictEqual(normalized, ["課程代碼", "設備組", "ab", "a"]);
  assert.deepStrictEqual(protectedTerms.normalizeTerms(null), []);
  console.log("   ✓ 字面值抽取與正規化驗證通過！\n");
}

console.log("3. 真實來源抽取與最低數量...");
{
  const report = protectedTerms.getSourceReport();
  assert.strictEqual(report.status, protectedTerms.STATUS_AVAILABLE);
  assert.deepStrictEqual(report.failures, []);
  assert.ok(report.counts.gasRuntime >= 15, "gasRuntime 抽取量不足：" + report.counts.gasRuntime);
  assert.ok(report.counts.actionRegistry >= 10, "actionRegistry 抽取量不足：" + report.counts.actionRegistry);
  assert.ok(
    report.counts.databaseInitializer >= 20,
    "databaseInitializer 抽取量不足：" + report.counts.databaseInitializer
  );
  assert.ok(report.termCount >= 60, "完整清冊筆數不足：" + report.termCount);

  const gasTerms = protectedTerms.collectSources().terms;
  assert.ok(gasTerms.includes("系統設定與授權"), "應抽取工作表名稱");
  assert.ok(gasTerms.includes("系統管理員"), "應抽取角色顯示名稱");
  assert.ok(gasTerms.includes("心跳檢查"), "應抽取 logLabel");
  assert.ok(!gasTerms.includes("whitelist"), "logDetailKey 純英文值不計入中文清冊");
  assert.ok(gasTerms.includes("設定項目"), "應抽取行政管理字面值");

  const terms = protectedTerms.getProtectedTerms();
  assert.strictEqual(terms.length, new Set(terms).size, "清冊不得有重複項目");
  for (let index = 1; index < terms.length; index += 1) {
    assert.ok(terms[index - 1].length >= terms[index].length, "清冊應按長度遞減排序");
  }
  assert.strictEqual(protectedTerms.getStatus(), protectedTerms.STATUS_AVAILABLE);
  console.log("   ✓ 真實來源抽取與最低數量驗證通過！\n");
}

console.log("4. 受保護判定與來源失敗可觀測性...");
{
  ["系統管理員", "設備組", "課程代碼", TRADITIONAL_PROJECT, S2TWP_PROJECT, "許可權"].forEach(function (term) {
    assert.strictEqual(protectedTerms.isProtectedText(term), true, "應受保護：" + term);
  });
  assert.strictEqual(
    protectedTerms.isProtectedText("完全沒有契約意義的文字", { includeContractLiterals: false }),
    false
  );
  assert.strictEqual(protectedTerms.isProtectedText(null), false);

  const failing = protectedTerms.createProtectedTermsModule({
    readFile: function (filePath) {
      if (filePath.endsWith("actionRegistry.js")) throw new Error("人為讀取失敗");
      return fs.readFileSync(filePath, "utf8");
    }
  });
  const report = failing.getSourceReport();
  assert.strictEqual(report.status, protectedTerms.STATUS_UNAVAILABLE);
  assert.deepStrictEqual(report.failures, ["actionRegistry:READ_FAILED"]);
  assert.ok(report.counts.gasRuntime >= 15, "移除單一來源後其餘來源仍應保留");
  assert.ok(report.termCount >= 60, "移除單一來源後靜態清冊仍應完整保留");
  assert.strictEqual(failing.getStatus(), protectedTerms.STATUS_UNAVAILABLE);
  assert.strictEqual(failing.isProtectedText("系統管理員"), true);
  assert.strictEqual(
    failing.isProtectedText("心跳檢查", { includeContractLiterals: false }),
    false,
    "失敗來源的條目不應被抽入"
  );

  const emptySource = protectedTerms.createProtectedTermsModule({
    readFile: function (filePath) {
      if (filePath.endsWith("gasRuntime.js")) return 'const x = "管理";';
      return fs.readFileSync(filePath, "utf8");
    }
  });
  assert.deepStrictEqual(emptySource.collectSources().failures, ["gasRuntime:BELOW_MINIMUM"]);

  const nonString = protectedTerms.createProtectedTermsModule({
    readFile: function (filePath) {
      if (filePath.endsWith("databaseInitializer.js")) return 42;
      return fs.readFileSync(filePath, "utf8");
    }
  });
  assert.deepStrictEqual(nonString.collectSources().failures, ["databaseInitializer:READ_FAILED"]);
  console.log("   ✓ 受保護判定與失敗可觀測性驗證通過！\n");
}

console.log("5. 契約字面值清冊為選用來源...");
{
  const contractPath = "/virtual/openccS2twpContractLiterals.json";
  const withLiterals = protectedTerms.createProtectedTermsModule({
    readFile: function (filePath) {
      if (filePath === contractPath) return JSON.stringify({ literals: ["自訂契約字面值"] });
      return fs.readFileSync(filePath, "utf8");
    },
    contractLiteralsPath: contractPath
  });
  assert.strictEqual(withLiterals.isProtectedText("自訂契約字面值"), true);
  assert.strictEqual(withLiterals.isProtectedText("自訂契約字面值", { includeContractLiterals: false }), false);

  const broken = protectedTerms.createProtectedTermsModule({
    readFile: function (filePath) {
      if (filePath === contractPath) return "not json";
      return fs.readFileSync(filePath, "utf8");
    },
    contractLiteralsPath: contractPath
  });
  assert.strictEqual(broken.getStatus(), protectedTerms.STATUS_AVAILABLE);
  assert.deepStrictEqual(
    protectedTerms.loadContractLiterals({
      contractLiteralsPath: contractPath,
      readFile: function () {
        return "not json";
      }
    }),
    []
  );
  console.log("   ✓ 契約字面值清冊選用驗證通過！\n");
}

console.log("6. 遮蔽、還原與專用區不變式...");
{
  const original = "課程代碼與設備組";
  const masked = protectedTerms.protectText(original, {
    extraTerms: ["課程代碼與設備組"],
    randomSource: function () {
      return 0.25;
    }
  });
  assert.notStrictEqual(masked.text, original);
  assert.strictEqual(masked.sentinelByTerm.size, 1);
  const restored = protectedTerms.restoreText(masked.text, masked);
  assert.strictEqual(restored, original);
  assert.deepStrictEqual(core.checkPuaInvariant(original, restored), { ok: true, missing: [], added: [] });
  assert.strictEqual(protectedTerms.restoreText("無哨兵", null), "無哨兵");

  const collisionPrefix = core.SENTINEL_START + "00000000" + core.SENTINEL_MID;
  const values = [0, 0.5];
  let cursor = 0;
  const collided = protectedTerms.protectText(collisionPrefix + "課程代碼", {
    randomSource: function () {
      return values[cursor++];
    }
  });
  assert.strictEqual(cursor, 2, "前綴碰撞時應重新產生");
  assert.notStrictEqual(collided.prefix, collisionPrefix);
  assert.strictEqual(protectedTerms.restoreText(collided.text, collided), collisionPrefix + "課程代碼");
  console.log("   ✓ 遮蔽還原與不變式驗證通過！\n");
}

console.log("✓ 受保護術語外殼契約測試全數通過！\n");
