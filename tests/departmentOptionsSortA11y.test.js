"use strict";

/**
 * @file departmentOptionsSortA11y.test.js
 * @description 驗證全站科別下拉選單依代碼升冪排序之正確性與無障礙（A11y）契約。
 */

const assert = require("assert");
const coursesModule = require("../webapp/js/courses.js");
const importsModule = require("../webapp/js/imports.js");
const courseData = require("../webapp/js/courseData.js");
const createCoursesDeps = require("./helpers/accountsCoursesDeps.js").createCoursesDeps;
const createImportsDeps = require("./helpers/importsUiDeps.js").createImportsDeps;

console.log("開始執行科別代碼升冪排序與無障礙契約測試...\n");

function run() {
  console.log("1. 課程代碼清單科別篩選下拉選單無障礙契約與排序驗證...");
  {
    const ctx = createCoursesDeps();
    ctx.MEA.courseData = {
      DEPARTMENT_CODE_NAMES: {
        301: "機械科",
        305: "資訊科",
        308: "電機科",
        999: "神秘未知科"
      },
      compareDepartmentsByCode: courseData.compareDepartmentsByCode
    };
    ctx.state.courses = { list: [], total: 0, page: 1, totalPages: 1, loading: false };
    const courses = coursesModule.createCoursesModule(ctx.deps);
    const html = courses.renderView();

    // 無障礙契約：label 與 select id 正確對應
    assert(html.indexOf('<label class="sr-only" for="courseSearchDept">科別篩選</label>') !== -1, "必須包含無障礙標籤");
    assert(html.indexOf('<select id="courseSearchDept" class="select">') !== -1, "select 必須對應標籤 id");

    // 排序契約：301 (機械科) < 305 (資訊科) < 308 (電機科) < 999 (未知科別)
    const idxMach = html.indexOf('<option value="機械科">機械科</option>');
    const idxInfo = html.indexOf('<option value="資訊科">資訊科</option>');
    const idxElec = html.indexOf('<option value="電機科">電機科</option>');
    const idxUnk = html.indexOf('<option value="神秘未知科">神秘未知科</option>');

    assert(idxMach !== -1 && idxInfo !== -1 && idxElec !== -1 && idxUnk !== -1, "所有科別選項皆應存在");
    assert(idxMach < idxInfo, "機械科 (301) 應排在資訊科 (305) 之前");
    assert(idxInfo < idxElec, "資訊科 (305) 應排在電機科 (308) 之前");
    assert(idxElec < idxUnk, "電機科 (308) 應排在未知科別之前");
    console.log("   ✓ 課程清單科別選單無障礙與排序通過！\n");
  }

  console.log("2. 匯入預覽表格科別篩選下拉選單無障礙契約與排序驗證...");
  {
    const ctx = createImportsDeps();
    ctx.state.imports = {
      courseCodes: {
        fileName: "測試.xlsx",
        fileSize: 1024,
        sheetName: "課綱寬表",
        imported: false,
        stats: { sourceRows: 4, keptCourseRows: 4, expandedRows: 24 },
        payload: [],
        sample: [
          ["114", "1", "1", "114", "C01", "微積分", "數學群", "數學科", "部定", "原班", "一般", "必修", "2", "2"],
          ["114", "1", "1", "114", "C02", "程式設計", "電機電子群", "資訊科", "部定", "原班", "專業", "必修", "3", "3"],
          ["114", "1", "1", "114", "C03", "車床實習", "機械群", "機械科", "部定", "原班", "專業", "必修", "3", "3"],
          ["114", "1", "1", "114", "C04", "特殊領域", "其他群", "未來科技科", "部定", "原班", "專業", "選修", "2", "2"]
        ]
      }
    };
    const html = ctx.imports.renderView();

    // 無障礙契約：label for="importDeptFilter"
    assert(html.indexOf('<label for="importDeptFilter"') !== -1, "匯入預覽必須包含標籤");
    assert(html.indexOf('id="importDeptFilter"') !== -1, "select 必須對應標籤 id");

    // 排序契約：301 (機械科) < 305 (資訊科) < Tier 1 MAT (數學科) < Tier 2 (未來科技科)
    const idxMach = html.indexOf('<option value="機械科">機械科</option>');
    const idxInfo = html.indexOf('<option value="資訊科">資訊科</option>');
    const idxMath = html.indexOf('<option value="數學科">數學科</option>');
    const idxFuture = html.indexOf('<option value="未來科技科">未來科技科</option>');

    assert(idxMach !== -1 && idxInfo !== -1 && idxMath !== -1 && idxFuture !== -1, "預覽科別選項皆應存在");
    assert(idxMach < idxInfo, "Tier 0: 機械科 (301) 應排在資訊科 (305) 之前");
    assert(idxInfo < idxMath, "Tier 0: 資訊科 (305) 應排在 Tier 1: 數學科 (MAT) 之前");
    assert(idxMath < idxFuture, "Tier 1: 數學科 (MAT) 應排在 Tier 2: 未知科別 (未來科技科) 之前");
    console.log("   ✓ 匯入預覽科別選單無障礙與排序通過！\n");
  }

  console.log("3. 實用技能學程（A01-Y02）代碼排序無障礙契約驗證...");
  {
    const sampleRows = [
      ["", "", "", "", "", "", "", "機械技術學程"], // A01
      ["", "", "", "", "", "", "", "資訊科"], // 305
      ["", "", "", "", "", "", "", "水電技術學程"] // C01
    ];
    const sorted = importsModule.extractPreviewDepartments(sampleRows, courseData.compareDepartmentsByCode);
    assert.deepStrictEqual(
      sorted,
      ["資訊科", "機械技術學程", "水電技術學程"],
      "305 (資訊科) < A01 (機械技術學程) < C01 (水電技術學程)"
    );
    console.log("   ✓ 實用技能學程代碼排序通過！\n");
  }

  console.log("✓ departmentOptionsSortA11y.test.js 測試全數通過！\n");
}

run();
