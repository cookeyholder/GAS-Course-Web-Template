"use strict";

/**
 * courseNormalizationShared.js 單元測試（task 4.2）。
 * 驗證前後端共用同一份對照表與正規化邏輯，且 Node／GAS／瀏覽器環境皆可取得 API。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const shared = require("../courseNormalizationShared.js");
const backend = require("../subjectCodeTransformer.js");
const frontend = require("../webapp/js/courseData.js");

function createSampleRow() {
  const row = new Array(39).fill("");
  row[0] = "305101A";
  row[1] = "6";
  row[2] = "程式設計實習";
  row[3] = "114";
  row[6] = "23";
  row[7] = "305";
  row[9] = "1";
  row[10] = "0";
  row[11] = "3";
  row[15] = "1";
  row[16] = "114";
  row[17] = "115";
  row[18] = "116";
  row[19] = 3;
  row[20] = 3;
  row[25] = 3;
  row[26] = 3;
  return row;
}

function run() {
  console.log("1. 共用模組應匯出完整對照表與正規化函式...");
  const names = [
    "GROUP_CODE_NAMES",
    "DEPARTMENT_CODE_NAMES",
    "SUBJECT_TYPE_NAMES",
    "OPEN_WAY_NAMES",
    "SUBJECT_ATTRIBUTION_NAMES",
    "REQUIRED_ELECTIVE_NAMES",
    "EXCLUDED_SUBJECT_ATTRIBUTES",
    "NORMALIZED_COURSE_HEADERS"
  ];
  names.forEach(function (name) {
    assert(shared[name], "共用模組應匯出 " + name);
  });
  [
    "getGroupName",
    "getDepartmentNameByCode",
    "getSubjectType",
    "getOpenWay",
    "getSubjectAttribution",
    "isRequiredOrElective",
    "isCourseCodeHeaderRow",
    "isExcludedCourseRow",
    "expandCourseRow",
    "normalizeCourseCodes"
  ].forEach(function (name) {
    assert.strictEqual(typeof shared[name], "function", "共用模組應匯出 " + name);
  });
  console.log("   ✓ 共用模組 API 驗證通過！\n");

  console.log("2. 後端與前端應直接轉發同一來源的常數...");
  names.forEach(function (name) {
    assert.strictEqual(backend[name], shared[name], "後端 " + name + " 應共用同一物件");
    assert.strictEqual(frontend[name], shared[name], "前端 " + name + " 應共用同一物件");
  });
  console.log("   ✓ 單一來源驗證通過！\n");

  console.log("3. 後端與前端應直接轉發同一來源的函式...");
  [
    "getGroupName",
    "getDepartmentNameByCode",
    "isCourseCodeHeaderRow",
    "isExcludedCourseRow",
    "expandCourseRow",
    "normalizeCourseCodes"
  ].forEach(function (name) {
    assert.strictEqual(backend[name], shared[name], "後端 " + name + " 應共用同一函式");
    assert.strictEqual(frontend[name], shared[name], "前端 " + name + " 應共用同一函式");
  });
  console.log("   ✓ 函式來源驗證通過！\n");

  console.log("4. 瀏覽器環境應透過 MEA.courseNormalizationShared 取得 API...");
  const source = fs.readFileSync(path.join(__dirname, "..", "courseNormalizationShared.js"), "utf8");
  const browserData = fs.readFileSync(path.join(__dirname, "..", "webapp", "js", "courseData.js"), "utf8");
  const browserSandbox = { console: console };
  browserSandbox.window = browserSandbox;
  vm.createContext(browserSandbox);
  vm.runInContext(source, browserSandbox, { filename: "courseNormalizationShared.js" });
  assert(browserSandbox.MEA.courseNormalizationShared, "瀏覽器應掛載 MEA.courseNormalizationShared");
  vm.runInContext(browserData, browserSandbox, { filename: "courseData.js" });
  assert.strictEqual(
    browserSandbox.MEA.courseData.normalizeCourseCodes,
    browserSandbox.MEA.courseNormalizationShared.normalizeCourseCodes
  );
  const browserRows = browserSandbox.MEA.courseData.normalizeCourseCodes([createSampleRow()], { withStats: true });
  assert.strictEqual(browserRows.rows.length, 2);
  console.log("   ✓ 瀏覽器環境驗證通過！\n");

  console.log("5. GAS 環境應可從 globalThis 解析共用模組...");
  const gasSandbox = { console: console };
  vm.createContext(gasSandbox);
  vm.runInContext(source, gasSandbox, { filename: "courseNormalizationShared.js" });
  assert(gasSandbox.courseNormalizationShared, "GAS 應掛載 globalThis.courseNormalizationShared");
  console.log("   ✓ GAS 環境驗證通過！\n");

  console.log("6. courseData.js 應覆蓋 MEA / globalThis / require 三種相依解析...");
  const frontendPath = require.resolve("../webapp/js/courseData.js");
  const savedMea = globalThis.MEA;
  const savedShared = globalThis.courseNormalizationShared;
  function reloadFrontend() {
    delete require.cache[frontendPath];
    return require(frontendPath);
  }
  try {
    globalThis.MEA = { courseNormalizationShared: shared };
    delete globalThis.courseNormalizationShared;
    assert.strictEqual(reloadFrontend().normalizeCourseCodes, shared.normalizeCourseCodes);

    delete globalThis.MEA;
    globalThis.courseNormalizationShared = shared;
    assert.strictEqual(reloadFrontend().normalizeCourseCodes, shared.normalizeCourseCodes);

    delete globalThis.courseNormalizationShared;
    assert.strictEqual(reloadFrontend().normalizeCourseCodes, shared.normalizeCourseCodes);
  } finally {
    if (savedMea === undefined) delete globalThis.MEA;
    else globalThis.MEA = savedMea;
    if (savedShared === undefined) delete globalThis.courseNormalizationShared;
    else globalThis.courseNormalizationShared = savedShared;
    delete require.cache[frontendPath];
    require(frontendPath);
  }
  console.log("   ✓ 相依解析分支驗證通過！\n");

  console.log("7. 共用模組邊界與篩選分支應正確...");
  assert.deepStrictEqual(shared.expandCourseRow(null), []);
  assert.deepStrictEqual(shared.expandCourseRow(["短列"]), []);
  assert.strictEqual(shared.isCourseCodeHeaderRow(null), false);
  assert.strictEqual(shared.isCourseCodeHeaderRow([]), false);
  assert.strictEqual(shared.isExcludedCourseRow(null), false);
  const headerByAttr = new Array(39).fill("");
  headerByAttr[11] = "科目屬性";
  assert.strictEqual(shared.isCourseCodeHeaderRow(headerByAttr), true);
  assert.strictEqual(shared.normalizeCourseCodes(null).length, 0);
  assert.strictEqual(shared.normalizeCourseCodes([["x"]]).length, 0);

  const sample = createSampleRow();
  sample[31] = "B";
  assert.strictEqual(shared.normalizeCourseCodes([sample], { withStats: false }).length, 2);
  assert.strictEqual(shared.normalizeCourseCodes([sample], { academicYear: "999" }).length, 0);
  assert.strictEqual(shared.normalizeCourseCodes([sample], { semester: "2" }).length, 1);
  assert.strictEqual(shared.getOpenWay("Z"), "Z");

  shared.EXCLUDED_SUBJECT_ATTRIBUTES.push("3");
  try {
    const excluded = shared.normalizeCourseCodes([sample], { withStats: true });
    assert.strictEqual(excluded.rows.length, 0);
    assert.strictEqual(excluded.stats.excludedRows, 1);
  } finally {
    shared.EXCLUDED_SUBJECT_ATTRIBUTES.pop();
  }
  console.log("   ✓ 邊界與篩選分支驗證通過！\n");

  console.log("✓ courseNormalizationShared.js 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
