"use strict";

/**
 * @file openccContractDrift.js
 * @description 契約字面值清冊之漂移比對。此模組僅比較新舊字串集合，
 *              不讀寫檔案，保持確定性與無副作用，僅供 Node 工具鏈使用。
 */

/**
 * 比對新舊契約字面值集合，找出新增與移除項目。
 *
 * @param {Array<string>} previous - 前次版控清冊
 * @param {Array<string>} current - 本次掃描結果
 * @returns {{drifted: boolean, added: string[], removed: string[]}} 漂移結果
 */
function compareContractLiterals(previous, current) {
  const before = Array.isArray(previous) ? previous : [];
  const after = Array.isArray(current) ? current : [];
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const added = after.filter(function (value) {
    return !beforeSet.has(value);
  });
  const removed = before.filter(function (value) {
    return !afterSet.has(value);
  });
  return { drifted: added.length > 0 || removed.length > 0, added: added, removed: removed };
}

/**
 * 將漂移結果格式化為人讀警告字串，無漂移時回傳空字串。
 *
 * @param {{drifted: boolean, added: string[], removed: string[]}} result - 漂移結果
 * @returns {string} 警告訊息
 */
function formatDriftWarning(result) {
  if (!result || !result.drifted) return "";
  const parts = [];
  if (result.added.length > 0) parts.push("新增：" + result.added.join("、"));
  if (result.removed.length > 0) parts.push("移除：" + result.removed.join("、"));
  return "契約字面值清冊漂移警告 — " + parts.join("；");
}

module.exports = {
  compareContractLiterals: compareContractLiterals,
  formatDriftWarning: formatDriftWarning
};
