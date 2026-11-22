/**
 * @file errorMessages.js
 * @description 前端安全錯誤訊息轉譯：原始例外文字不外顯，僅顯示明確安全文案。
 *
 * 瀏覽器環境組裝 MEA.safeErrors；Node.js 環境直接匯出同一組純函式供測試使用。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  const MEA = (root.MEA = root.MEA || {});
  MEA.safeErrors = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_MESSAGE = "作業失敗，請稍後再試";

  /**
   * 建立附帶安全文案的例外，供內部明確預期顯示的錯誤使用。
   *
   * @param {string} message - 可安全顯示給使用者的訊息
   * @returns {Error} 附帶 safeMessage 屬性的例外
   */
  function createSafeError(message) {
    const error = new Error(message);
    error.safeMessage = typeof message === "string" && message ? message : DEFAULT_MESSAGE;
    return error;
  }

  /**
   * 嘗試從錯誤代碼對照表取得文案。純函式，無副作用。
   *
   * @private
   * @param {*} value - 錯誤值或物件
   * @param {Object} [codeMap] - 錯誤代碼與文案對照表
   * @returns {string|null} 對應之繁體中文文案或 null
   */
  function resolveFromCodeMap_(value, codeMap) {
    if (!codeMap || typeof codeMap !== "object") return null;
    let code = null;
    if (typeof value === "string") {
      code = value;
    } else if (value && typeof value === "object") {
      code = value.code || value.error || null;
    }
    if (code && typeof codeMap[code] === "string" && codeMap[code]) {
      return codeMap[code];
    }
    return null;
  }

  /**
   * 嘗試從物件中安全提取 safeMessage 或一般 message，排除未授權外洩的原始 Error 物件。純函式，無副作用。
   *
   * @private
   * @param {*} value - 待提取之值
   * @param {string} safeFallback - 預設備援文案
   * @returns {string} 安全錯誤文案
   */
  function resolveFromErrorObject_(value, safeFallback) {
    if (!value || typeof value !== "object") return safeFallback;
    if (typeof value.safeMessage === "string" && value.safeMessage) return value.safeMessage;
    if (value instanceof Error) return safeFallback;
    if (typeof value.message === "string" && value.message) return value.message;
    return safeFallback;
  }

  /**
   * 將任意錯誤值轉譯為可安全顯示的訊息（全前端唯一轉譯定義，task 6.4）。
   *
   * @param {*} value - 例外、API 結果或未知值
   * @param {string} [fallback] - 無法安全顯示時使用的文案
   * @param {Object} [codeMap] - 可選之錯誤代碼對照表
   * @returns {string} 可顯示的錯誤訊息
   */
  function resolveSafeMessage(value, fallback, codeMap) {
    const safeFallback = typeof fallback === "string" && fallback ? fallback : DEFAULT_MESSAGE;
    const mapped = resolveFromCodeMap_(value, codeMap);
    if (mapped) return mapped;
    return resolveFromErrorObject_(value, safeFallback);
  }

  return {
    DEFAULT_MESSAGE: DEFAULT_MESSAGE,
    createSafeError: createSafeError,
    resolveSafeMessage: resolveSafeMessage,
    // 相容既有呼叫端：直接指向唯一的轉譯定義，避免額外轉發函式。
    resolveUserMessage: resolveSafeMessage
  };
});
