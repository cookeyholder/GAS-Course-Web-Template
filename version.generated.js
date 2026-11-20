/**
 * 由 scripts/build-webapp.js 從 package.json 產生，請勿直接編輯。
 * 後端可讀取的版本來源（task 5.1）；GAS 全域掛載，Node 由 module.exports 匯出。
 */
"use strict";

const PACKAGE_VERSION = "1.1.0";

if (typeof module !== "undefined" && module.exports) module.exports = { PACKAGE_VERSION: PACKAGE_VERSION };
if (typeof globalThis !== "undefined") globalThis.__PACKAGE_VERSION__ = PACKAGE_VERSION;
