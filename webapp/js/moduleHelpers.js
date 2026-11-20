/**
 * @file moduleHelpers.js
 * @description 共用模組轉接層（task 6.4）：單一 Node require 相容墊片與相依解析。
 *
 * 瀏覽器環境由 errorMessages.js 之後載入並掛至 MEA.moduleHelpers；
 * Node.js 環境由各前端模組 require，避免各模組重複撰寫環境判斷與載入邏輯。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    MEA.moduleHelpers = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * 取得注入或全域可用的 safeErrors 介面。
   *
   * 解析順序：明確注入 → MEA 包裹注入 → globalThis 全域 → Node 載入共用作業失敗訊息模組。
   * 此函式為全前端唯一的 Node require 相容墊片。
   *
   * @param {Object} [options] - 模組工廠收到的 deps／options
   * @returns {Object|null} safeErrors 介面，極端環境下可能為 null
   */
  function resolveSafeErrors(options) {
    const injected = options && (options.safeErrors || (options.MEA && options.MEA.safeErrors));
    if (injected) return injected;

    const globalErrors = typeof globalThis !== "undefined" && globalThis.MEA && globalThis.MEA.safeErrors;
    if (globalErrors) return globalErrors;

    if (typeof require === "function") return require("./errorMessages.js");
    return null;
  }

  return {
    resolveSafeErrors: resolveSafeErrors
  };
});
