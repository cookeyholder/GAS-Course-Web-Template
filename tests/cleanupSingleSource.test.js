"use strict";

/**
 * cleanupSingleSource.test.js（task 4.4）
 * 驗證死碼已移除，且工作表名稱、角色定義與版本號皆來自 gasRuntime 單一來源。
 */

const assert = require("assert");
const gasRuntime = require("../gasRuntime.js");
const db = require("../databaseInitializer.js");
const transformer = require("../subjectCodeTransformer.js");
const api = require("../webApi.js");
const utils = require("../utilities.js");

function run() {
  console.log("1. 未使用的死碼匯出應已移除...");
  ["DEPARTMENT_CODES", "DEPARTMENT_NAMES", "safeTrim", "generateUniqueId"].forEach(function (name) {
    assert.strictEqual(Object.prototype.hasOwnProperty.call(utils, name), false, "utilities 不應再匯出 " + name);
  });
  assert.strictEqual(
    Object.prototype.hasOwnProperty.call(api, "webApiSuccess"),
    false,
    "webApi 不應再匯出 webApiSuccess"
  );
  console.log("   ✓ 死碼移除驗證通過！\n");

  console.log("2. 工作表名稱應共用 gasRuntime 單一來源...");
  assert.strictEqual(db.SHEET_SYSTEM_CONFIG, gasRuntime.SHEET_SYSTEM_CONFIG);
  assert.strictEqual(db.SHEET_COURSE_INDEX, gasRuntime.SHEET_COURSE_INDEX);
  assert.strictEqual(db.SHEET_SYSTEM_INSTRUCTIONS, gasRuntime.SHEET_SYSTEM_INSTRUCTIONS);
  assert.strictEqual(transformer.NORMALIZED_COURSE_SHEET_NAME, gasRuntime.SHEET_COURSE_INDEX);
  console.log("   ✓ 工作表名稱驗證通過！\n");

  console.log("3. 角色定義應共用 gasRuntime 單一來源...");
  assert.strictEqual(db.ROLE_DEFINITIONS, gasRuntime.ROLE_DEFINITIONS);
  ["admin", "staff", "viewer"].forEach(function (role) {
    assert.strictEqual(db.getRoleDisplayName(role), gasRuntime.ROLE_DEFINITIONS[role]);
    assert.strictEqual(db.normalizeRole(role), role);
    assert.strictEqual(db.normalizeRole(gasRuntime.ROLE_DEFINITIONS[role]), role);
  });
  assert.strictEqual(db.getRoleDisplayName("未知角色"), gasRuntime.ROLE_DEFINITIONS.viewer);
  assert.strictEqual(db.normalizeRole(""), "viewer");
  console.log("   ✓ 角色定義驗證通過！\n");

  console.log("4. 版本號應共用 gasRuntime 單一來源...");
  assert.strictEqual(api.WEB_API_VERSION, gasRuntime.WEB_API_VERSION);
  console.log("   ✓ 版本號驗證通過！\n");

  console.log("5. 重複的 getRequiredSystemConfigSheet_ 應已移除...");
  const dbSource = require("fs").readFileSync(require("path").join(__dirname, "..", "databaseInitializer.js"), "utf8");
  assert.strictEqual(dbSource.indexOf("getRequiredSystemConfigSheet_"), -1);
  console.log("   ✓ 重複函式移除驗證通過！\n");

  console.log("✓ cleanupSingleSource.test.js 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
