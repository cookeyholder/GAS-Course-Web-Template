"use strict";

/**
 * webapp/js/imports.js::renderView 單元測試（G7.10）。
 * 驗證上傳區、預覽卡片、權限禁用狀態、數字格式化與 HTML 跳脫行為。
 */

const assert = require("assert");
const importsModule = require("../webapp/js/imports.js");
const helpers = require("./helpers/importsUiDeps.js");
const createDeps = helpers.createImportsDeps;
const escapeHtml = helpers.escapeHtml;

console.log("開始執行 webapp/js/imports.js renderView 測試...\n");

function makeEntry(overrides) {
  return Object.assign(
    {
      fileName: "課程表.xlsx",
      fileSize: 4096,
      sheetName: "課綱寬表",
      imported: false,
      payload: [["A"]],
      stats: { sourceRows: 1234, keptCourseRows: 20, expandedRows: 5678 },
      sample: [
        ["114", "1", "1", "C001", "<數學>", "數學科", "必修", "2", "2", "", "一般", "3", "0"],
        ["114", "1", "2"]
      ]
    },
    overrides || {}
  );
}

function run() {
  assert.strictEqual(typeof importsModule.createImportsModule, "function", "應匯出模組工廠");
  assert.strictEqual(typeof importsModule.renderPanelHtml, "function", "應匯出面板渲染函式");
  console.log("1. 可測試工廠與拆分函式匯出 ✓\n");

  const empty = createDeps();
  const emptyHtml = empty.imports.renderView();
  assert(emptyHtml.indexOf('id="uploadDropzone"') !== -1);
  assert(emptyHtml.indexOf('data-import-dropzone="1"') !== -1);
  assert(emptyHtml.indexOf("ondragover=") === -1, "拖曳事件應改由委派綁定");
  assert(emptyHtml.indexOf("onkeydown=") === -1, "鍵盤事件應改由委派綁定");
  assert(emptyHtml.indexOf("MEA.imports.pickFile()") === -1, "點選事件應改由委派綁定");
  assert(emptyHtml.indexOf('id="fileInput"') !== -1);
  assert(emptyHtml.indexOf("metrics-grid") === -1);
  assert(emptyHtml.indexOf("課程代碼匯入與 1NF 正規化") !== -1);
  console.log("2. 無匯入項目時應顯示拖曳上傳區 ✓\n");

  const ctx = createDeps();
  ctx.state.imports = { courseCodes: makeEntry() };
  const html = ctx.imports.renderView();
  assert(html.indexOf("檔案解析預覽：課程表.xlsx") !== -1);
  assert(html.indexOf("來源工作表：課綱寬表 · 檔案大小：4 KB") !== -1);
  assert(html.indexOf("1,234") !== -1);
  assert(html.indexOf("5,678") !== -1);
  assert(html.indexOf("20") !== -1);
  assert(html.indexOf("&lt;數學&gt;") !== -1);
  assert(html.indexOf("<strong>數學科</strong>") !== -1);
  assert(html.indexOf("<td>114</td><td>1</td><td>2</td>") !== -1);
  assert(html.indexOf("確認匯入至試算表") !== -1);
  assert(html.indexOf(" disabled") === -1);
  console.log("3. 預覽卡片統計、跳脫與可匯入按鈕 ✓\n");

  ctx.state.importBusy = true;
  const busyHtml = ctx.imports.renderView();
  assert(busyHtml.indexOf(" disabled") !== -1);
  assert(busyHtml.indexOf("匯入中...") !== -1);

  ctx.state.importBusy = false;
  ctx.state.imports.courseCodes.imported = true;
  const doneHtml = ctx.imports.renderView();
  assert(doneHtml.indexOf("✓ 已匯入完成") !== -1);
  assert(doneHtml.indexOf(" disabled") !== -1);
  console.log("4. 處理中與已匯入狀態禁用行為 ✓\n");

  const noPerm = createDeps();
  noPerm.state.user = { perms: ["getCourseIndex"] };
  noPerm.state.imports = { courseCodes: makeEntry() };
  assert(noPerm.imports.renderView().indexOf(" disabled") !== -1);

  const specificPerm = createDeps();
  specificPerm.state.user = { perms: ["importCourseCodes"] };
  specificPerm.state.imports = { courseCodes: makeEntry() };
  assert(specificPerm.imports.renderView().indexOf(" disabled") === -1);
  assert.strictEqual(specificPerm.imports.canImportCourseCodes(specificPerm.state.user), true);
  assert.strictEqual(specificPerm.imports.canImportCourseCodes({}), false);
  console.log("5. 萬用與特定匯入權限判定 ✓\n");

  const moduleSample = importsModule.renderSampleRowsHtml(
    [["114", "1", "1", "C", "A&B", "科", "必", "2", "2", "", "一", "3", "0"]],
    escapeHtml
  );
  assert(moduleSample.indexOf("A&amp;B") !== -1);
  assert(moduleSample.indexOf("<strong>科</strong>") !== -1);
  assert.strictEqual(moduleSample.split("<td>").length - 1, 9);
  console.log("6. 模組層級預覽列渲染 ✓\n");

  console.log("7. 預覽科別篩選下拉選單與過濾效果...");
  {
    const filterCtx = createDeps();
    filterCtx.state.imports = {
      courseCodes: makeEntry({
        deptFilter: "資訊科",
        sample: [
          ["114", "1", "1", "114", "C001", "微積分", "數學群", "數學科", "部定", "原班", "一般", "必修", "2", "2"],
          ["114", "1", "1", "114", "C002", "程式設計", "資訊群", "資訊科", "校訂", "原班", "專業", "必修", "3", "3"]
        ]
      })
    };
    const filterHtml = filterCtx.imports.renderView();
    assert(filterHtml.indexOf('id="importDeptFilter"') !== -1, "應存在預覽科別篩選下拉選單");
    assert(filterHtml.indexOf('data-import-action="filter-dept"') !== -1, "應綁定 filter-dept 動作");
    assert(filterHtml.indexOf('value="資訊科" selected') !== -1, "資訊科選項應為選取狀態");
    assert(
      filterHtml.indexOf('value="資訊科"') < filterHtml.indexOf('value="數學科"'),
      "資訊科 (代碼 305) 應排在數學科 (共同科 MAT) 之前"
    );
    assert(filterHtml.indexOf("程式設計") !== -1, "應顯示資訊科課程列");
    assert(filterHtml.indexOf("微積分") === -1, "數學科課程列應被篩選排除");
    console.log("   ✓ 預覽科別篩選功能驗證通過！\n");
  }

  console.log("8. handleDeptFilter 與 renderPagedTable 回退測試...");
  {
    const fbCtx = createDeps();
    fbCtx.state.imports = {
      courseCodes: makeEntry({
        sample: [["114", "1", "1", "114", "FB01", "回退科目", "群", "資訊科", "部定", "原班", "一般", "必修", "2", "2"]]
      })
    };
    fbCtx.imports.handleDeptFilter("資訊科");
    assert.strictEqual(fbCtx.state.imports.courseCodes.deptFilter, "資訊科", "應更新 deptFilter");

    fbCtx.MEA.ui = Object.assign({}, fbCtx.MEA.ui, { renderPagedTable: null });
    const fbHtml = fbCtx.imports.renderView();
    assert(fbHtml.indexOf("回退科目") !== -1, "回退表格應渲染科目名稱");
    console.log("   ✓ handleDeptFilter 與回退測試通過！\n");
  }

  console.log("9. 科別篩選純函式邊界與防禦分支測試...");
  {
    assert.deepStrictEqual(importsModule.extractPreviewDepartments(null), [], "null 應回傳空陣列");
    assert.deepStrictEqual(
      importsModule.extractPreviewDepartments([null, [], ["", "", "", "", "", "", "", ""]]),
      [],
      "空資料列應過濾"
    );

    const realCourseData = require("../webapp/js/courseData.js");
    const testRows = [
      ["", "", "", "", "", "", "", "數學科"],
      ["", "", "", "", "", "", "", "電子科"],
      ["", "", "", "", "", "", "", "機械科"],
      ["", "", "", "", "", "", "", "資訊科"]
    ];
    const sortedDepts = importsModule.extractPreviewDepartments(testRows, realCourseData.compareDepartmentsByCode);
    assert.deepStrictEqual(
      sortedDepts,
      ["機械科", "資訊科", "電子科", "數學科"],
      "extractPreviewDepartments 應依 301, 305, 306, MAT 順序排序"
    );

    const fallbackSorted = importsModule.extractPreviewDepartments(testRows, null);
    assert.strictEqual(fallbackSorted.length, 4, "降級比較器應完整保留 4 筆科別");

    const filterHtml = importsModule.renderDeptFilterHtml([null, "", "資訊科", "電子科"], "資訊科", function (v) {
      return v;
    });
    assert(filterHtml.indexOf('value="資訊科" selected') !== -1);
    assert(filterHtml.indexOf('value="電子科"') !== -1);

    assert.strictEqual(
      importsModule
        .renderDeptFilterHtml(null, "", function (v) {
          return v;
        })
        .indexOf("全部科別") !== -1,
      true
    );

    const emptyRowCells = importsModule.renderSampleRowCellsHtml(null, function (v) {
      return v;
    });
    assert.strictEqual(emptyRowCells.split("<td>").length - 1, 9);

    const emptyCtx = createDeps();
    emptyCtx.state.imports = {};
    assert.doesNotThrow(function () {
      emptyCtx.imports.handleDeptFilter("資訊科");
    });

    const nonArrayPayloadEntry = makeEntry({ payload: null });
    const nonArrayHtml = importsModule.renderPreviewCardHtml(
      nonArrayPayloadEntry,
      false,
      true,
      escapeHtml,
      function (v) {
        return v;
      }
    );
    assert(nonArrayHtml.indexOf("檔案解析預覽") !== -1);

    console.log("   ✓ 科別篩選純函式邊界驗證通過！\n");
  }

  console.log("✓ webapp/js/imports.js renderView 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
