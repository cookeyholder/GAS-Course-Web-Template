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
   * 將任意錯誤值轉譯為可安全顯示的訊息（全前端唯一轉譯定義，task 6.4）。
   *
   * @param {*} value - 例外、API 結果或未知值
   * @param {string} [fallback] - 無法安全顯示時使用的文案
   * @returns {string} 可顯示的錯誤訊息
   */
  function resolveSafeMessage(value, fallback) {
    const safeFallback = typeof fallback === "string" && fallback ? fallback : DEFAULT_MESSAGE;
    if (!value || typeof value !== "object") return safeFallback;
    if (typeof value.safeMessage === "string" && value.safeMessage) return value.safeMessage;
    if (value instanceof Error) return safeFallback;
    if (typeof value.message === "string" && value.message) return value.message;
    return safeFallback;
  }

  /** 相容既有呼叫端：轉發至唯一的轉譯定義。 */
  function resolveUserMessage(value, fallback) {
    return resolveSafeMessage(value, fallback);
  }

  return {
    DEFAULT_MESSAGE: DEFAULT_MESSAGE,
    createSafeError: createSafeError,
    resolveSafeMessage: resolveSafeMessage,
    resolveUserMessage: resolveUserMessage
  };
});
