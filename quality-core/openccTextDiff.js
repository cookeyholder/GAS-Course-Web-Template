"use strict";

/**
 * @file openccTextDiff.js
 * @description 以共同前後綴與 LCS 找出原文與轉換結果之最小替換單元。
 *              此模組為無副作用純函式，座標一律採 UTF-16 程式碼單元，
 *              與穩定 ID 的上下文取值定義一致，且僅供 Node 工具鏈使用。
 */

/** 超過此乘積時改用前後綴單一區塊，避免超長行耗用過多記憶體 */
const MAX_LCS_CELLS = 200000;

/**
 * 計算兩字串的共同前綴長度。
 *
 * @param {string} a - 字串 A
 * @param {string} b - 字串 B
 * @returns {number} 共同前綴的 UTF-16 程式碼單元數
 */
function commonPrefixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[index] === b[index]) index += 1;
  return index;
}

/**
 * 計算兩字串的共同後綴長度。
 *
 * @param {string} a - 字串 A
 * @param {string} b - 字串 B
 * @returns {number} 共同後綴的 UTF-16 程式碼單元數
 */
function commonSuffixLength(a, b) {
  const limit = Math.min(a.length, b.length);
  let index = 0;
  while (index < limit && a[a.length - 1 - index] === b[b.length - 1 - index]) index += 1;
  return index;
}

/**
 * 建立 LCS 動態規劃表。
 *
 * @param {string} a - 原文
 * @param {string} b - 轉換結果
 * @returns {Uint32Array} 二維表格，以 b.length + 1 為 stride
 */
function buildLcsTable(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint32Array(rows * cols);
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const index = i * cols + j;
      if (a[i - 1] === b[j - 1]) {
        table[index] = table[(i - 1) * cols + (j - 1)] + 1;
      } else {
        table[index] = Math.max(table[(i - 1) * cols + j], table[i * cols + (j - 1)]);
      }
    }
  }
  return table;
}

/**
 * 將 LCS 回填結果轉為替換區塊，座標採 UTF-16 程式碼單元。
 *
 * @param {string} a - 原文
 * @param {string} b - 轉換結果
 * @param {Uint32Array} table - LCS 表格
 * @returns {Array<Object>} 替換區塊陣列
 */
function backtrackHunks(a, b, table) {
  const cols = b.length + 1;
  const ops = [];
  let i = a.length;
  let j = b.length;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      ops.push({ type: "match", oIndex: i - 1, cIndex: j - 1 });
      i -= 1;
      j -= 1;
      continue;
    }
    if (j > 0 && (i === 0 || table[i * cols + (j - 1)] >= table[(i - 1) * cols + j])) {
      ops.push({ type: "insert", oIndex: i, cIndex: j - 1 });
      j -= 1;
      continue;
    }
    ops.push({ type: "delete", oIndex: i - 1, cIndex: j });
    i -= 1;
  }
  ops.reverse();

  const hunks = [];
  let current = null;
  let gap = false;
  ops.forEach(function (op) {
    if (op.type === "match") {
      if (current) gap = true;
      return;
    }
    if (!current || gap) {
      current = {
        start: op.oIndex,
        end: op.oIndex,
        cStart: op.cIndex,
        cEnd: op.cIndex,
        hasDelete: false,
        hasInsert: false
      };
      hunks.push(current);
      gap = false;
    }
    if (op.type === "delete") {
      current.start = Math.min(current.start, op.oIndex);
      current.end = Math.max(current.end, op.oIndex + 1);
      current.hasDelete = true;
    } else {
      current.cStart = Math.min(current.cStart, op.cIndex);
      current.cEnd = Math.max(current.cEnd, op.cIndex + 1);
      current.hasInsert = true;
    }
  });

  return hunks
    .map(function (hunk) {
      return {
        start: hunk.start,
        end: hunk.end,
        original: hunk.hasDelete ? a.slice(hunk.start, hunk.end) : "",
        suggestion: hunk.hasInsert ? b.slice(hunk.cStart, hunk.cEnd) : ""
      };
    })
    .filter(function (hunk) {
      return hunk.original !== hunk.suggestion;
    });
}

/**
 * 退化路徑：僅取共同前後綴產生單一替換區塊。
 *
 * @param {string} a - 原文
 * @param {string} b - 轉換結果
 * @returns {Array<Object>} 替換區塊陣列
 */
function fallbackHunks(a, b) {
  if (a === b) return [];
  const prefix = commonPrefixLength(a, b);
  const suffix = commonSuffixLength(a.slice(prefix), b.slice(prefix));
  return [
    {
      start: prefix,
      end: a.length - suffix,
      original: a.slice(prefix, a.length - suffix),
      suggestion: b.slice(prefix, b.length - suffix)
    }
  ];
}

/**
 * 比較原文與轉換結果，回傳最小替換單元。
 *
 * @param {string} original - 原文
 * @param {string} converted - 轉換結果
 * @returns {Array<{start: number, end: number, original: string, suggestion: string}>} 替換區塊
 */
function diffTextUnits(original, converted) {
  const a = String(original);
  const b = String(converted);
  if (a === b) return [];
  if ((a.length + 1) * (b.length + 1) > MAX_LCS_CELLS) return fallbackHunks(a, b);
  return backtrackHunks(a, b, buildLcsTable(a, b));
}

module.exports = {
  MAX_LCS_CELLS: MAX_LCS_CELLS,
  commonPrefixLength: commonPrefixLength,
  commonSuffixLength: commonSuffixLength,
  buildLcsTable: buildLcsTable,
  backtrackHunks: backtrackHunks,
  fallbackHunks: fallbackHunks,
  diffTextUnits: diffTextUnits
};
