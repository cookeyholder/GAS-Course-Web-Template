"use strict";

/**
 * @file openccStableId.test.js
 * @description 內容定址穩定 ID 與上下文雜湊的純函式契約測試。
 *              所有簡體範例皆以 Unicode 跳脫表示，避免測試檔自身命中硬閘門。
 */

const assert = require("assert");
const crypto = require("crypto");
const stableId = require("../quality-core/openccStableId.js");

const SIMPLIFIED_PROJECT = "\u9879\u76ee";
const SIMPLIFIED_ONLY = "\u50c5";
const TRADITIONAL_DATA = "\u6578\u64da";

/**
 * 建立測試用的識別欄位。
 *
 * @param {Object} [overrides] - 覆寫欄位
 * @returns {Object} 識別欄位物件
 */
function makeEntry(overrides) {
  return Object.assign(
    {
      file: "webapp/js/config.js",
      original: SIMPLIFIED_PROJECT,
      contextHash: "0123456789abcdef",
      occurrenceIndex: 0,
      suggestion: "\u9805\u76ee",
      line: 12,
      column: 7
    },
    overrides || {}
  );
}

/**
 * 以測試端獨立計算預期上下文雜湊，驗證實作 slicing 與分隔符契約。
 *
 * @param {string} left - 替換處左側上下文
 * @param {string} right - 替換處右側上下文
 * @returns {string} 十六碼雜湊
 */
function expectedContextHash(left, right) {
  return crypto
    .createHash("sha256")
    .update(left + "\0" + right, "utf8")
    .digest("hex")
    .slice(0, 16);
}

/**
 * 產生每次轉字串時行為不同的欄位，用來覆蓋例外路徑。
 *
 * @returns {Object} 自訂轉字串物件
 */
function unreliableField() {
  let calls = 0;
  return {
    [Symbol.toPrimitive]() {
      calls += 1;
      if (calls === 1) return "safe";
      throw new Error("第二次轉換失敗");
    }
  };
}

console.log("開始執行內容定址穩定 ID 契約測試...\n");

console.log("1. 識別碼只綁定四欄位且不受建議、行號與欄位偏移影響...");
{
  assert.deepStrictEqual(Array.from(stableId.ID_FIELDS), ["file", "original", "contextHash", "occurrenceIndex"]);
  assert.strictEqual(stableId.ID_FIELDS.indexOf("suggestion"), -1);
  assert.strictEqual(stableId.STABLE_ID_LENGTH, 16);
  assert.strictEqual(stableId.CONTEXT_HASH_LENGTH, 16);
  assert.strictEqual(stableId.CONTEXT_RADIUS, 24);

  const entry = makeEntry();
  const id = stableId.computeStableId(entry);
  assert.match(id, /^[0-9a-f]{16}$/);
  assert.strictEqual(id, stableId.computeStableId(Object.assign({}, entry)));
  assert.strictEqual(id, stableId.computeStableId(makeEntry({ suggestion: "專案", line: 99, column: 42 })));
  stableId.ID_FIELDS.forEach(function (field) {
    const changed = makeEntry();
    changed[field] = "changed";
    assert.notStrictEqual(stableId.computeStableId(changed), id);
  });
  assert.throws(function () {
    stableId.computeStableId(null);
  }, TypeError);
  assert.throws(function () {
    stableId.createStableId([]);
  }, TypeError);
  assert.throws(function () {
    stableId.createStableId("file");
  }, TypeError);
  console.log("   ✓ 四欄位與版本常數驗證通過！\n");
}

console.log("2. 欄位分隔符碰撞與含 \\0 欄位皆被守門拒絕...");
{
  const left = makeEntry({ file: "a\0b", original: "c" });
  const right = makeEntry({ file: "a", original: "b\0c" });
  const collisionId = stableId.computeStableId(left);
  assert.strictEqual(stableId.hasIdentifierSeparator(left), true);
  assert.strictEqual(stableId.hasIdentifierSeparator(right), true);
  assert.strictEqual(collisionId, stableId.computeStableId(right));
  assert.strictEqual(stableId.isStableIdValid(collisionId, left), false);
  assert.strictEqual(stableId.hasIdentifierSeparator(null), false);

  const approvals = {};
  approvals[collisionId] = left;
  const indexed = stableId.indexApprovals(approvals);
  assert.strictEqual(indexed.ok, true);
  assert.strictEqual(indexed.valid.size, 0);
  assert.strictEqual(indexed.invalid.size, 0);
  assert.strictEqual(indexed.excluded.length, 1);

  stableId.ID_FIELDS.forEach(function (field) {
    const entry = makeEntry();
    entry[field] = "x\0y";
    assert.strictEqual(stableId.isStableIdValid(stableId.computeStableId(entry), entry), false);
  });
  console.log("   ✓ 欄位邊界與分隔符守門驗證通過！\n");
}

console.log("3. 上下文雜湊只取同行前後各 24 個 UTF-16 碼元...");
{
  const line = "L".repeat(30) + SIMPLIFIED_PROJECT + "R".repeat(30);
  const start = line.indexOf(SIMPLIFIED_PROJECT);
  const hash = stableId.computeContextHash(line, start, SIMPLIFIED_PROJECT.length);
  const expectedLeft = line.slice(start - 24, start);
  const expectedRight = line.slice(start + SIMPLIFIED_PROJECT.length, start + SIMPLIFIED_PROJECT.length + 24);
  assert.strictEqual(hash, expectedContextHash(expectedLeft, expectedRight));

  const extendedLeft = "Z".repeat(50) + line;
  assert.strictEqual(
    stableId.computeContextHash(extendedLeft, extendedLeft.indexOf(SIMPLIFIED_PROJECT), SIMPLIFIED_PROJECT.length),
    hash
  );
  assert.strictEqual(stableId.computeContextHash(line + "Z".repeat(50), start, SIMPLIFIED_PROJECT.length), hash);

  const inside = line.slice(0, start - 1) + "Q" + line.slice(start);
  assert.notStrictEqual(stableId.computeContextHash(inside, start, SIMPLIFIED_PROJECT.length), hash);
  assert.strictEqual(stableId.computeContextHash("Q" + line, start + 1, SIMPLIFIED_PROJECT.length), hash);

  const emoji = "\ud83d\ude00";
  const utf16Line = "a".repeat(23) + emoji + SIMPLIFIED_PROJECT + "b".repeat(30);
  const utf16Start = utf16Line.indexOf(SIMPLIFIED_PROJECT);
  const utf16Left = utf16Line.slice(utf16Start - 24, utf16Start);
  assert.strictEqual(utf16Left.length, 24);
  assert.strictEqual(utf16Left.slice(-2), emoji);
  assert.strictEqual(
    stableId.computeContextHash(utf16Line, utf16Start, SIMPLIFIED_PROJECT.length),
    expectedContextHash(
      utf16Left,
      utf16Line.slice(utf16Start + SIMPLIFIED_PROJECT.length, utf16Start + SIMPLIFIED_PROJECT.length + 24)
    )
  );
  console.log("   ✓ 上下文半徑與碼元邊界驗證通過！\n");
}

console.log("4. 上下文不跨行，前方插入新行不影響，同行格式化使 ID 失效...");
{
  const atLineStart = SIMPLIFIED_PROJECT + " suffix";
  const startHash = stableId.computeContextHash(atLineStart, 0, SIMPLIFIED_PROJECT.length);
  assert.strictEqual(startHash, expectedContextHash("", " suffix".slice(0, 24)));
  const withPreviousLine = "previous\n" + atLineStart;
  assert.strictEqual(
    stableId.computeContextHash(
      withPreviousLine,
      withPreviousLine.indexOf(SIMPLIFIED_PROJECT),
      SIMPLIFIED_PROJECT.length
    ),
    startHash
  );

  const atLineEnd = "prefix " + SIMPLIFIED_PROJECT;
  const endStart = atLineEnd.indexOf(SIMPLIFIED_PROJECT);
  const endHash = stableId.computeContextHash(atLineEnd, endStart, SIMPLIFIED_PROJECT.length);
  assert.strictEqual(endHash, expectedContextHash(atLineEnd.slice(Math.max(0, endStart - 24), endStart), ""));
  assert.strictEqual(stableId.computeContextHash(atLineEnd + "\nnext", endStart, SIMPLIFIED_PROJECT.length), endHash);
  assert.strictEqual(stableId.computeContextHash(atLineEnd + "\r\nnext", endStart, SIMPLIFIED_PROJECT.length), endHash);

  const originalText = "line one\n" + atLineEnd + "\nline three";
  const originalHash = stableId.computeContextHash(
    originalText,
    originalText.indexOf(SIMPLIFIED_PROJECT),
    SIMPLIFIED_PROJECT.length
  );
  const insertedText = "inserted line\n" + originalText;
  assert.strictEqual(
    stableId.computeContextHash(insertedText, insertedText.indexOf(SIMPLIFIED_PROJECT), SIMPLIFIED_PROJECT.length),
    originalHash
  );

  const before = "alpha " + SIMPLIFIED_PROJECT + " omega";
  const after = "alpha  " + SIMPLIFIED_PROJECT + " omega";
  const beforeHash = stableId.computeContextHash(before, before.indexOf(SIMPLIFIED_PROJECT), SIMPLIFIED_PROJECT.length);
  const afterHash = stableId.computeContextHash(after, after.indexOf(SIMPLIFIED_PROJECT), SIMPLIFIED_PROJECT.length);
  assert.notStrictEqual(afterHash, beforeHash);
  const id = stableId.computeStableId(makeEntry({ contextHash: beforeHash }));
  assert.strictEqual(stableId.isStableIdValid(id, makeEntry({ contextHash: afterHash })), false);

  assert.strictEqual(
    stableId.computeContextHash(atLineEnd, -5, SIMPLIFIED_PROJECT.length),
    stableId.computeContextHash(atLineEnd, 0, SIMPLIFIED_PROJECT.length)
  );
  assert.strictEqual(
    stableId.computeContextHash(atLineEnd, Number.NaN, SIMPLIFIED_PROJECT.length),
    stableId.computeContextHash(atLineEnd, 0, SIMPLIFIED_PROJECT.length)
  );
  assert.strictEqual(
    stableId.computeContextHash(atLineEnd, endStart, Number.NaN),
    stableId.computeContextHash(atLineEnd, endStart, 0)
  );
  console.log("   ✓ 行邊界、插入與格式化失效驗證通過！\n");
}

console.log("5. occurrenceIndex 以 file\\0original 分組且不修改傳入資料...");
{
  const entries = [
    Object.freeze({ file: "a.js", original: SIMPLIFIED_PROJECT, line: 1 }),
    Object.freeze({ file: "b.js", original: SIMPLIFIED_PROJECT, line: 2 }),
    Object.freeze({ file: "a.js", original: SIMPLIFIED_PROJECT, line: 9 }),
    Object.freeze({ file: "a.js", original: SIMPLIFIED_ONLY, line: 3 }),
    "非物件"
  ];
  const assigned = stableId.assignOccurrenceIndices(entries);
  assert.deepStrictEqual(
    assigned.map(function (entry) {
      return entry.occurrenceIndex;
    }),
    [0, 0, 1, 0, 0]
  );
  assert.ok(
    entries.every(function (entry) {
      return !entry || typeof entry !== "object" || entry.occurrenceIndex === undefined;
    })
  );
  assert.deepStrictEqual(stableId.assignOccurrenceIndices(null), []);
  console.log("   ✓ 跨行順序計數與不可變性驗證通過！\n");
}

console.log("6. isStableIdValid 僅驗證紀錄自身四欄位...");
{
  const entry = makeEntry();
  const id = stableId.computeStableId(entry);
  assert.strictEqual(stableId.isStableIdValid(id, entry), true);
  assert.strictEqual(stableId.isStableIdValid(id.toUpperCase(), entry), true);
  assert.strictEqual(stableId.isStableIdValid("abc", entry), false);
  assert.strictEqual(stableId.isStableIdValid(id, null), false);
  assert.strictEqual(stableId.isStableIdValid(id, "非物件"), false);
  assert.strictEqual(stableId.isStableIdValid(id, makeEntry({ contextHash: "changed" })), false);
  assert.strictEqual(stableId.isStableIdValid(id, makeEntry({ file: unreliableField() })), false);

  let calls = 0;
  const unstable = {
    [Symbol.toPrimitive]() {
      calls += 1;
      if (calls === 1) return "safe";
      throw new Error("第二次轉換失敗");
    }
  };
  assert.strictEqual(stableId.isStableIdValid(id, makeEntry({ file: unstable })), false);
  console.log("   ✓ 自身欄位驗證與例外降級驗證通過！\n");
}

console.log("7. 索引分類、舊版 ID 診斷與原型鍵 fail-closed...");
{
  const entry = makeEntry();
  const currentId = stableId.computeStableId(entry);
  const oldCompute = stableId.createStableId(["file", "original", "suggestion", "contextHash", "occurrenceIndex"]);
  const oldId = oldCompute(entry);
  assert.notStrictEqual(oldId, currentId);

  const mismatchedId = stableId.computeStableId(makeEntry({ contextHash: "current" }));
  const nulEntry = makeEntry({ original: "x\0y" });
  const nulId = stableId.computeStableId(nulEntry);
  const approvals = {};
  approvals[currentId] = entry;
  approvals[oldId] = Object.assign({}, entry);
  approvals[mismatchedId] = makeEntry({ contextHash: "record" });
  approvals[nulId] = nulEntry;
  approvals["格式錯誤"] = entry;

  const indexed = stableId.indexApprovals(approvals);
  assert.strictEqual(indexed.ok, true);
  assert.strictEqual(indexed.valid.has(currentId), true);
  assert.strictEqual(indexed.invalid.has(oldId), true);
  assert.strictEqual(indexed.valid.has(oldId), false);
  assert.strictEqual(indexed.invalid.has(mismatchedId), true);
  assert.strictEqual(indexed.excluded.includes("格式錯誤"), true);
  assert.strictEqual(indexed.excluded.includes(nulId), true);

  assert.strictEqual(stableId.classifyInvalidApproval(approvals[oldId], entry), "ID_ALGORITHM_CHANGED");
  assert.strictEqual(
    stableId.classifyInvalidApproval(approvals[oldId], makeEntry({ file: "other.js" })),
    "APPROVAL_TAMPERED"
  );
  assert.strictEqual(
    stableId.classifyInvalidApproval(approvals[oldId], makeEntry({ original: TRADITIONAL_DATA })),
    "APPROVAL_TAMPERED"
  );
  assert.strictEqual(stableId.classifyInvalidApproval(null, null), "ID_ALGORITHM_CHANGED");

  const selfValidRecord = makeEntry({ original: TRADITIONAL_DATA });
  const selfValidId = stableId.computeStableId(selfValidRecord);
  assert.strictEqual(stableId.isStableIdValid(selfValidId, selfValidRecord), true);
  assert.strictEqual(indexed.valid.has(selfValidId), false);
  assert.strictEqual(stableId.classifyInvalidApproval(selfValidRecord, entry), "APPROVAL_TAMPERED");

  assert.strictEqual(stableId.indexApprovals(null).reason, "APPROVALS_NOT_PLAIN_OBJECT");
  assert.strictEqual(stableId.indexApprovals([]).reason, "APPROVALS_NOT_PLAIN_OBJECT");
  assert.strictEqual(stableId.indexApprovals(Object.create({ inherited: entry })).ok, false);
  assert.strictEqual(stableId.indexApprovals(Object.create(null)).ok, true);
  assert.strictEqual(
    stableId.indexApprovals(JSON.parse('{"__proto__": {"file": "x"}}')).reason,
    "APPROVALS_PROTOTYPE_KEY"
  );

  const constructorKey = {};
  Object.defineProperty(constructorKey, "constructor", { value: entry, enumerable: false });
  assert.strictEqual(stableId.indexApprovals(constructorKey).reason, "APPROVALS_PROTOTYPE_KEY");

  const prototypeKey = {};
  Object.defineProperty(prototypeKey, "prototype", { value: entry, enumerable: false });
  assert.strictEqual(stableId.indexApprovals(prototypeKey).reason, "APPROVALS_PROTOTYPE_KEY");

  const throwingApprovals = {};
  const throwingId = "0123456789abcdef";
  throwingApprovals[throwingId] = makeEntry({ file: unreliableField() });
  const throwingIndex = stableId.indexApprovals(throwingApprovals);
  assert.strictEqual(throwingIndex.ok, true);
  assert.strictEqual(throwingIndex.valid.has(throwingId), false);
  assert.strictEqual(throwingIndex.invalid.has(throwingId), true);
  console.log("   ✓ 索引分類與診斷驗證通過！\n");
}

console.log("✓ 內容定址穩定 ID 契約測試全數通過！\n");
