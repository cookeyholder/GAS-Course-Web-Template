"use strict";

/**
 * @file openccContractDrift.test.js
 * @description 契約字面值清冊漂移比對之純函式契約測試。
 */

const assert = require("assert");
const drift = require("../quality-core/openccContractDrift.js");

console.log("開始執行契約字面值漂移比對契約測試...\n");

console.log("1. 集合比對與順序無關...\n");
{
  const same = drift.compareContractLiterals(["甲", "乙"], ["乙", "甲"]);
  assert.deepStrictEqual(same, { drifted: false, added: [], removed: [] });
  assert.strictEqual(drift.compareContractLiterals(null, null).drifted, false);
  assert.strictEqual(drift.compareContractLiterals(undefined, ["甲"]).drifted, true);
  console.log("   ✓ 相同集合不漂移且空值退化為空陣列驗證通過！\n");
}

console.log("2. 新增與移除診斷...\n");
{
  const changed = drift.compareContractLiterals(["甲", "乙"], ["乙", "丙"]);
  assert.strictEqual(changed.drifted, true);
  assert.deepStrictEqual(changed.added, ["丙"]);
  assert.deepStrictEqual(changed.removed, ["甲"]);
  const warning = drift.formatDriftWarning(changed);
  assert.ok(warning.includes("新增：丙"));
  assert.ok(warning.includes("移除：甲"));
  assert.ok(warning.startsWith("契約字面值清冊漂移警告"));
  console.log("   ✓ 新增移除與警告格式化驗證通過！\n");
}

console.log("3. 僅新增或僅移除與無漂移格式化...\n");
{
  const addedOnly = drift.compareContractLiterals(["甲"], ["甲", "乙"]);
  assert.deepStrictEqual(drift.formatDriftWarning(addedOnly), "契約字面值清冊漂移警告 — 新增：乙");
  const removedOnly = drift.compareContractLiterals(["甲", "乙"], ["乙"]);
  assert.deepStrictEqual(drift.formatDriftWarning(removedOnly), "契約字面值清冊漂移警告 — 移除：甲");
  assert.strictEqual(drift.formatDriftWarning(safeNull()), "");
  assert.strictEqual(drift.formatDriftWarning({ drifted: false, added: ["甲"], removed: [] }), "");
  console.log("   ✓ 單向漂移與無漂移格式化驗證通過！\n");
}

/**
 * 提供 null 值給格式化函式，明確化測試意圖。
 *
 * @returns {null} null
 */
function safeNull() {
  return null;
}

console.log("✓ 契約字面值漂移比對契約測試全數通過！\n");
