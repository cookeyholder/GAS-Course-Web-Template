"use strict";

/**
 * @file openccProtectedTerms.test.js
 * @description 受保護詞彙 trie、哨兵碰撞重試、遮蔽還原、私密使用區集合
 *              不變式與過度標記抽樣的契約測試。所有簡體範例皆以
 *              Unicode 跳脫表示，抽樣固定 20 筆以維持可重現性。
 */

const assert = require("assert");
const protectedTerms = require("../quality-core/openccProtectedTerms.js");

/** 抽樣用受保護清冊 */
const SAMPLE_TERMS = ["項目", "專案", "課程代碼", "權限", "設備組", "設備"];

/**
 * 建立固定抽樣案例。
 *
 * @returns {Array<Object>} 20 筆固定案例
 */
function buildSamplingCases() {
  return [
    { candidate: "項目", expectedExact: true },
    { candidate: "專案", expectedExact: true },
    { candidate: "課程代碼", expectedExact: true },
    { candidate: "權限", expectedExact: true },
    { candidate: "設備組", expectedExact: true },
    { candidate: "設備", expectedExact: true },
    { candidate: "報告項目", expectedExact: false },
    { candidate: "系統權限", expectedExact: false },
    { candidate: "新增設備", expectedExact: false },
    { candidate: "我的專案", expectedExact: false },
    { candidate: "課程大綱", expectedExact: false },
    { candidate: "管理權限", expectedExact: false },
    { candidate: "專案名稱", expectedExact: false },
    { candidate: "設備組別", expectedExact: false },
    { candidate: "一般項目", expectedExact: false },
    { candidate: "資料權限", expectedExact: false },
    { candidate: "代碼轉換", expectedExact: false },
    { candidate: "群組設定", expectedExact: false },
    { candidate: "清單設備", expectedExact: false },
    { candidate: "矩陣設定", expectedExact: false }
  ];
}

/**
 * 執行固定抽樣，回傳誤標紀錄。
 *
 * 判定規則：候選原文完整等於受保護詞才視為正確保護；若僅由 trie
 * 前綴命中較短詞彙，代表過度標記，必須記錄於核閱文件。
 *
 * @returns {Array<Object>} 誤標紀錄陣列
 */
function collectOverMarkingRecords() {
  const trie = protectedTerms.buildProtectedTrie(SAMPLE_TERMS);
  return buildSamplingCases()
    .map(function (sample) {
      const match = protectedTerms.longestMatchAt(sample.candidate, 0, trie);
      const marked = match !== null;
      if (marked === sample.expectedExact) return null;
      return {
        candidate: sample.candidate,
        actual: match,
        reason: sample.expectedExact ? "應保護但未命中" : "前綴命中造成過度標記"
      };
    })
    .filter(function (record) {
      return record !== null;
    });
}

console.log("開始執行受保護詞彙與專用區不變式契約測試...\n");

console.log("1. 常數與最長優先 trie...");
{
  assert.strictEqual(protectedTerms.SENTINEL_START, "\uE000");
  assert.strictEqual(protectedTerms.SENTINEL_MID, "\uE001");
  assert.strictEqual(protectedTerms.SENTINEL_END, "\uE002");
  assert.strictEqual(protectedTerms.TERMINATOR, "\0");
  assert.strictEqual(protectedTerms.PUA_MIN, 0xe000);
  assert.strictEqual(protectedTerms.PUA_MAX, 0xf8ff);
  assert.strictEqual(protectedTerms.MAX_PREFIX_ATTEMPTS, 1000);

  const trie = protectedTerms.buildProtectedTrie(["設備組", "設備", "課程代碼", 42, "", "設備組"]);
  assert.strictEqual(protectedTerms.longestMatchAt("設備組與課程代碼", 0, trie), "設備組");
  assert.strictEqual(protectedTerms.longestMatchAt("設備bill", 0, trie), "設備");
  assert.strictEqual(protectedTerms.longestMatchAt("x課程代碼", 1, trie), "課程代碼");
  assert.strictEqual(protectedTerms.longestMatchAt("無匹配", 0, trie), null);
  assert.strictEqual(protectedTerms.longestMatchAt("設備", 99, trie), null);
  assert.strictEqual(protectedTerms.buildProtectedTrie(null).size, 0);
  console.log("   ✓ 常數與最長優先比對驗證通過！\n");
}

console.log("2. 哨兵前綴碰撞重試與明確失敗...");
{
  const fixed = protectedTerms.generateSentinelPrefix("一般內容", function () {
    return 0.5;
  });
  assert.ok(fixed.startsWith(protectedTerms.SENTINEL_START));
  assert.ok(fixed.endsWith(protectedTerms.SENTINEL_MID));
  assert.strictEqual(fixed.length, 10);

  const defaultPrefix = protectedTerms.generateSentinelPrefix(null);
  assert.ok(defaultPrefix.startsWith(protectedTerms.SENTINEL_START));

  let calls = 0;
  const retrying = protectedTerms.generateSentinelPrefix(fixed + "後綴", function () {
    calls += 1;
    return calls === 1 ? 0.5 : 0.25;
  });
  assert.strictEqual(calls, 2);
  assert.notStrictEqual(retrying, fixed);
  assert.strictEqual(retrying.length, fixed.length);
  assert.ok(!(fixed + "後綴").includes(retrying));

  assert.throws(function () {
    protectedTerms.generateSentinelPrefix(fixed + "後綴", function () {
      return 0.5;
    });
  }, /碰撞/);
  console.log("   ✓ 碰撞重試與明確失敗驗證通過！\n");
}

console.log("3. 遮蔽、還原與重複詞共用哨兵...");
{
  const original = "設備組與課程代碼須保留，設備組重複一次。";
  const masked = protectedTerms.maskProtectedTerms(original, ["設備組", "課程代碼"], {
    randomSource: function () {
      return 0.1;
    }
  });
  assert.ok(masked.text.includes(masked.prefix));
  assert.ok(!masked.text.includes("設備組"));
  assert.strictEqual(masked.sentinelByTerm.size, 2);
  assert.strictEqual((masked.text.match(new RegExp(masked.prefix + "0", "g")) || []).length, 2);

  const restored = protectedTerms.restoreProtectedTerms(masked.text, masked);
  assert.strictEqual(restored, original);
  const invariant = protectedTerms.checkPuaInvariant(original, restored);
  assert.deepStrictEqual(invariant, { ok: true, missing: [], added: [] });

  const noOptions = protectedTerms.maskProtectedTerms("沒有受保護詞", ["設備組"]);
  assert.strictEqual(noOptions.text, "沒有受保護詞");
  assert.strictEqual(noOptions.sentinelByTerm.size, 0);
  const nullText = protectedTerms.maskProtectedTerms(null, ["設備組"], {
    randomSource: function () {
      return 0.3;
    }
  });
  assert.strictEqual(nullText.text, "");
  console.log("   ✓ 遮蔽還原與重複詞共用哨兵驗證通過！\n");
}

console.log("4. 還原降級、未知哨兵與正則特殊字元前綴...");
{
  assert.strictEqual(protectedTerms.restoreProtectedTerms("無哨兵", null), "無哨兵");
  assert.strictEqual(protectedTerms.restoreProtectedTerms("無哨兵", {}), "無哨兵");

  const source = "設備組";
  const masked = protectedTerms.maskProtectedTerms(source, ["設備組"], {
    randomSource: function () {
      return 0.2;
    }
  });
  const unknown = masked.text + masked.prefix + "9" + protectedTerms.SENTINEL_END;
  const restored = protectedTerms.restoreProtectedTerms(unknown, masked);
  assert.strictEqual(restored, source + masked.prefix + "9" + protectedTerms.SENTINEL_END);
  assert.strictEqual(protectedTerms.checkPuaInvariant(source, restored).ok, false);

  const unusualPrefix = ".*+?^${}()|[]\\";
  const unusualSentinel = unusualPrefix + "0" + protectedTerms.SENTINEL_END;
  const unusual = {
    prefix: unusualPrefix,
    sentinelByTerm: new Map([["特殊", unusualSentinel]])
  };
  assert.strictEqual(protectedTerms.restoreProtectedTerms(unusualSentinel, unusual), "特殊");
  console.log("   ✓ 還原降級與未知哨兵驗證通過！\n");
}

console.log("5. 既有專用區字元不被吞與集合不變式...");
{
  const withPua = "原有\uE123字元與設備組，另有\ud83d\ude00Emoji。";
  const masked = protectedTerms.maskProtectedTerms(withPua, ["設備組"], {
    randomSource: function () {
      return 0.4;
    }
  });
  const restored = protectedTerms.restoreProtectedTerms(masked.text, masked);
  assert.strictEqual(restored, withPua);
  assert.deepStrictEqual(protectedTerms.checkPuaInvariant(withPua, restored), {
    ok: true,
    missing: [],
    added: []
  });

  const puaChars = protectedTerms.collectPuaChars(withPua);
  assert.deepStrictEqual(Array.from(puaChars), ["\uE123"]);
  assert.strictEqual(protectedTerms.collectPuaChars(null).size, 0);

  const missing = protectedTerms.checkPuaInvariant("原有\uE123字元", "字元不見了");
  assert.strictEqual(missing.ok, false);
  assert.deepStrictEqual(missing.missing, ["\uE123"]);
  assert.deepStrictEqual(missing.added, []);

  const added = protectedTerms.checkPuaInvariant("原文", "原文\uE456");
  assert.strictEqual(added.ok, false);
  assert.deepStrictEqual(added.missing, []);
  assert.deepStrictEqual(added.added, ["\uE456"]);
  console.log("   ✓ 專用區集合不變式與邊界驗證通過！\n");
}

console.log("6. 過度標記固定抽樣 20 筆...");
{
  const records = collectOverMarkingRecords();
  const rate = records.length / buildSamplingCases().length;
  assert.strictEqual(buildSamplingCases().length, 20);
  assert.deepStrictEqual(records, collectOverMarkingRecords());
  assert.ok(rate <= 0.1, "誤標率不得高於 10%");
  records.forEach(function (record) {
    console.log("   [誤標抽樣紀錄] " + record.candidate + " → " + record.actual + "：" + record.reason);
  });
  console.log(
    "   ✓ 抽樣 " +
      buildSamplingCases().length +
      " 筆、誤標 " +
      records.length +
      " 筆（" +
      (rate * 100).toFixed(0) +
      "%）驗證通過！\n"
  );
}

console.log("✓ 受保護詞彙與專用區不變式契約測試全數通過！\n");
