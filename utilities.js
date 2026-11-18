/**
 * @file utilities.js
 * @description Google Apps Script 通用工具函式與安全操作輔助
 */

// ============================================================================
// 代碼與文字對照常數
// ============================================================================

const DEPARTMENT_CODES = {
  機械: "301",
  汽車: "303",
  資訊: "305",
  電子: "306",
  電機: "308",
  冷凍: "309",
  建築: "311",
  化工: "315",
  空調: "321",
  圖傳: "373",
  電圖: "374"
};

const DEPARTMENT_NAMES = {
  機械: "機械科",
  汽車: "汽車科",
  資訊: "資訊科",
  電子: "電子科",
  電機: "電機科",
  冷凍: "冷凍空調科",
  建築: "建築科",
  化工: "化工科",
  空調: "電機空調科",
  圖傳: "圖文傳播科",
  電圖: "電腦機械製圖科"
};

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

/**
 * 試算表公式注入跳脫單一值 (Formula Immunization)
 * 若字串以 =, +, -, @, \t, \r 開頭，自動加上前置單引號跳脫
 *
 * @param {*} val - 儲存格值
 * @returns {*} 安全值
 */
function sanitizeFormulaValue(val) {
  if (typeof val !== "string") return val;
  if (!val) return val;
  const first = val.charAt(0);
  if (first === "=" || first === "+" || first === "-" || first === "@" || first === "\t" || first === "\r") {
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
 * 安全去除字串頭尾空白
 *
 * @param {*} value - 任意輸入
 * @returns {string} 去除空白後字串
 */
function safeTrim(value) {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

/**
 * 產生唯一識別碼
 *
 * @param {string} [prefix="id"] - 前綴字串
 * @returns {string} 唯一識別碼
 */
function generateUniqueId(prefix) {
  const p = prefix || "id";
  const rand = Math.random().toString(36).substring(2, 9);
  const time = Date.now().toString(36);
  return p + "_" + time + "_" + rand;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DEPARTMENT_CODES: DEPARTMENT_CODES,
    DEPARTMENT_NAMES: DEPARTMENT_NAMES,
    safeUiAlert: safeUiAlert,
    safeApplySheetFontSize: safeApplySheetFontSize,
    safeSetNumberFormat: safeSetNumberFormat,
    sanitizeFormulaValue: sanitizeFormulaValue,
    sanitizeRowMatrix: sanitizeRowMatrix,
    safeTrim: safeTrim,
    generateUniqueId: generateUniqueId
  };
}
