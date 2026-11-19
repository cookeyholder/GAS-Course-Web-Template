/**
 * @file gasRuntime.js
 * @description GAS / Node.js 雙環境共用的相依解析與安全試算表取得（task 4.3）
 *
 * 統一提供三項能力：
 * - resolveDependency_：module.exports → globalThis → fallback（未提供 fallback 時 fail-fast）
 * - getActiveSpreadsheetSafe_：options.spreadsheet → SpreadsheetApp → null
 * - injectGlobals_：僅注入白名單匯出，避免 Object.assign 全域污染
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) root.gasRuntime = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * 判斷物件是否自有指定屬性。
   *
   * @param {*} value - 待檢查物件
   * @param {string} key - 屬性名稱
   * @returns {boolean} 是否為自有屬性
   */
  function hasOwn(value, key) {
    return value !== null && value !== undefined && Object.prototype.hasOwnProperty.call(value, key);
  }

  /**
   * 取得目前環境的 gasRuntime（Node.js 首次載入時自動 require）。
   *
   * @returns {Object} gasRuntime API
   */
  function getRuntime_() {
    if (typeof globalThis !== "undefined" && globalThis.gasRuntime) return globalThis.gasRuntime;
    if (typeof require === "function") return require("./gasRuntime.js");
    throw new Error("找不到 gasRuntime 共用模組");
  }

  /**
   * 解析相依：優先 module.exports，其次 globalThis，最後 fallback。
   * 未提供 fallback 時採 fail-fast，避免靜默取得 undefined。
   *
   * @param {string} name - 相依匯出名稱
   * @param {string} modulePath - Node.js require 路徑
   * @param {*} [fallback] - 選用備援值
   * @returns {*} 解析後的相依
   */
  function resolveDependency_(name, modulePath, fallback) {
    if (typeof globalThis !== "undefined" && hasOwn(globalThis, name)) return globalThis[name];
    if (typeof require === "function" && modulePath) {
      let moduleExports;
      try {
        moduleExports = require(modulePath);
      } catch (error) {
        if (arguments.length >= 3) return fallback;
        throw new Error("找不到相依匯出：" + name + "（無法載入 " + modulePath + "：" + error.message + "）");
      }
      if (hasOwn(moduleExports, name)) return moduleExports[name];
    }
    if (arguments.length >= 3) return fallback;
    throw new Error("找不到相依匯出：" + name);
  }

  /**
   * 安全取得試算表：明確傳入 > SpreadsheetApp > null。
   *
   * @param {Object} [options] - 選項
   * @param {*} [options.spreadsheet] - 明確指定的試算表
   * @returns {*} 試算表實例或 null
   */
  function getActiveSpreadsheetSafe_(options) {
    const opts = options || {};
    if (opts.spreadsheet) return opts.spreadsheet;
    if (
      typeof SpreadsheetApp !== "undefined" &&
      SpreadsheetApp &&
      typeof SpreadsheetApp.getActiveSpreadsheet === "function"
    ) {
      return SpreadsheetApp.getActiveSpreadsheet();
    }
    return null;
  }

  /**
   * 白名單注入全域（僅 Node.js 測試環境需要）。
   * 任一要求的匯出不存在即 fail-fast，避免拼字錯誤被靜默忽略。
   *
   * @param {string} modulePath - Node.js require 路徑
   * @param {Array<string>} whitelist - 允許注入的匯出名稱
   * @returns {Object} 實際注入的名稱與值
   */
  function injectGlobals_(modulePath, whitelist) {
    if (typeof require !== "function") return {};
    const moduleExports = require(modulePath);
    const names = Array.isArray(whitelist) ? whitelist : [];
    const injected = {};
    names.forEach(function (name) {
      if (!hasOwn(moduleExports, name)) {
        throw new Error("相依模組 " + modulePath + " 未匯出 " + name);
      }
      if (typeof globalThis !== "undefined") globalThis[name] = moduleExports[name];
      injected[name] = moduleExports[name];
    });
    return injected;
  }

  return {
    hasOwn: hasOwn,
    getRuntime_: getRuntime_,
    resolveDependency_: resolveDependency_,
    getActiveSpreadsheetSafe_: getActiveSpreadsheetSafe_,
    injectGlobals_: injectGlobals_
  };
});
