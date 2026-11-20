"use strict";

/**
 * @file scriptsDeps.js
 * @description 腳本與前端模組測試共用的依賴模擬工具。
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * 暫時接管 console.log 與 console.error，並記錄所有輸出。
 *
 * @returns {{logs: string[], errors: string[], restore: Function}} 輸出紀錄與還原函式
 */
function captureConsole() {
  const originalLog = console.log;
  const originalError = console.error;
  const logs = [];
  const errors = [];
  console.log = function () {
    logs.push(Array.prototype.slice.call(arguments).join(" "));
  };
  console.error = function () {
    errors.push(Array.prototype.slice.call(arguments).join(" "));
  };
  return {
    logs: logs,
    errors: errors,
    restore: function () {
      console.log = originalLog;
      console.error = originalError;
    }
  };
}

/**
 * 建立獨立的環境變數物件，供測試注入且不變更 process.env。
 *
 * @param {Object} [overrides] - 預設欄位
 * @returns {Object} 環境變數物件
 */
function createEnv(overrides) {
  return Object.assign({}, overrides || {});
}

/**
 * 建立附帶 webapp/js 結構的暫存專案目錄。
 *
 * @returns {{root: string, webapp: string, write: Function, cleanup: Function}} 暫存專案操作介面
 */
function createTempProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gas-quality-"));
  const webapp = path.join(root, "webapp");
  fs.mkdirSync(path.join(webapp, "js"), { recursive: true });
  // build-webapp.js 需要套件版本（task 5.1），提供測試用預設值。
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ version: "1.1.0" }), "utf8");

  return {
    root: root,
    webapp: webapp,
    write: function (relative, content) {
      const target = path.join(root, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content, "utf8");
      return target;
    },
    cleanup: function () {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

module.exports = {
  captureConsole: captureConsole,
  createEnv: createEnv,
  createTempProject: createTempProject
};
