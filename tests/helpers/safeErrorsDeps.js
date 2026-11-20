"use strict";

/**
 * @file safeErrorsDeps.js
 * @description 安全訊息依賴的單一載入點（task 6.4）：
 *              集中 require 前端共用作業失敗訊息模組，供各測試 helpers 注入 safeErrors，
 *              避免各 helper 重複撰寫 Node require 相容墊片。
 */

const safeErrors = require("../../webapp/js/errorMessages.js");

/**
 * 回傳可供 deps／MEA 注入的 safeErrors 介面。
 *
 * @returns {Object} safeErrors 介面
 */
function createSafeErrors() {
  return safeErrors;
}

module.exports = {
  safeErrors: safeErrors,
  createSafeErrors: createSafeErrors
};
