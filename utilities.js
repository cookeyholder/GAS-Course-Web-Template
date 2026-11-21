/**
 * @file utilities.js
 * @description Google Apps Script 通用工具函式與安全操作輔助
 */

/**
 * 安全顯示提示訊息
 *
 * @param {string} message - 提示訊息
 * @param {Object} [options] - 選項物件
 * @returns {boolean} 是否成功以 UI 顯示
 */
function safeUiAlert(message, options) {
  const text = String(message === null || message === undefined ? "" : message);

  if (options && Array.isArray(options.warnings)) {
    options.warnings.push(text);
    return false;
  }

  try {
    if (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getUi) {
      SpreadsheetApp.getUi().alert(text);
      return true;
    }
  } catch (error) {
    // 無 UI 環境
  }

  if (typeof console !== "undefined" && console.warn) {
    console.warn("[safeUiAlert] " + text);
  }
  return false;
}

/**
 * 安全設定儲存格文字大小
 *
 * @param {Range} range - 試算表範圍
 * @param {number} size - 字體大小
 */
function safeApplySheetFontSize(range, size) {
  if (!range) return;
  try {
    if (typeof range.setFontSize === "function") {
      range.setFontSize(size);
    }
  } catch (e) {
    // 忽略設定失敗
  }
}

const FORMULA_PREFIX_REGEX = /^[+=@\t\r-]/;

/**
 * 試算表公式注入跳脫單一值 (Formula Immunization)
 * 若字串以 =, +, -, @, \t, \r 開頭，自動加上前置單引號跳脫
 *
 * @param {*} val - 儲存格值
 * @returns {*} 安全值
 */
function sanitizeFormulaValue(val) {
  if (typeof val !== "string" || !val) return val;
  if (FORMULA_PREFIX_REGEX.test(val)) {
    return "'" + val;
  }
  return val;
}

/**
 * 試算表二維陣列列資料批次公式跳脫
 *
 * @param {Array<Array<*>>} matrix - 二維資料列矩陣
 * @returns {Array<Array<*>>} 跳脫後矩陣
 */
function sanitizeRowMatrix(matrix) {
  if (!Array.isArray(matrix)) return matrix;
  return matrix.map(function (row) {
    if (!Array.isArray(row)) return row;
    return row.map(sanitizeFormulaValue);
  });
}

/**
 * 安全設定儲存格格式
 *
 * @param {Range} range - 試算表範圍
 * @param {string} format - 格式字串
 */
function safeSetNumberFormat(range, format) {
  if (!range) return;
  try {
    if (typeof range.setNumberFormat === "function") {
      range.setNumberFormat(format);
    }
  } catch (e) {
    // 忽略設定失敗
  }
}

/**
 * 將陣列切分為指定大小的批次塊 (Chunking)
 *
 * @param {Array<*>} array - 來源陣列
 * @param {number} chunkSize - 每批數量（正整數）
 * @returns {Array<Array<*>>} 切分後的二維陣列
 */
function chunkArray(array, chunkSize) {
  if (!Array.isArray(array) || array.length === 0) return [];
  const size = Math.max(1, parseInt(chunkSize, 10) || 1);
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    safeUiAlert: safeUiAlert,
    safeApplySheetFontSize: safeApplySheetFontSize,
    safeSetNumberFormat: safeSetNumberFormat,
    sanitizeFormulaValue: sanitizeFormulaValue,
    sanitizeRowMatrix: sanitizeRowMatrix,
    chunkArray: chunkArray
  };
}
