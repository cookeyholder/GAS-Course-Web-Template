"use strict";

/**
 * 表單標籤關聯測試（task 3.4）。
 * 驗證所有 label 都有 for 並指向存在的控制項，且搜尋／風格／檔案欄位具備無障礙名稱。
 */

const assert = require("assert");
const accountsModule = require("../webapp/js/accounts.js");
const coursesModule = require("../webapp/js/courses.js");
const uiModule = require("../webapp/js/ui.js");
const importsModule = require("../webapp/js/imports.js");
const accountDeps = require("./helpers/accountsCoursesDeps.js");
const uiDeps = require("./helpers/importsUiDeps.js").createUiDeps;
const importDeps = require("./helpers/importsUiDeps.js").createImportsDeps;

function collectForIds(html) {
  const ids = [];
  const pattern = /<label\b[^>]*\bfor="([^"]+)"/g;
  let match = null;
  while ((match = pattern.exec(html)) !== null) ids.push(match[1]);
  return ids;
}

function assertLabelsAssociated(html, contextName) {
  const labelCount = (html.match(/<label\b/g) || []).length;
  assert(labelCount > 0, contextName + " 應至少有一個標籤");
  const forIds = collectForIds(html);
  assert.strictEqual(forIds.length, labelCount, contextName + " 的每個標籤都應有 for 屬性");
  forIds.forEach(function (id) {
    assert(html.indexOf('id="' + id + '"') !== -1, contextName + " 的 for=" + id + " 應有對應控制項");
  });
}

async function run() {
  console.log("1. 系統設定表單的標籤應全數與控制項關聯...");
  {
    const ctx = accountDeps.createAccountsDeps();
    const accounts = accountsModule.createAccountsModule(ctx.deps);
    ctx.state.user = { role: "admin", roleName: "系統管理員" };
    ctx.state.settings = { data: {}, accounts: [], saving: false };
    const html = accounts.renderView();
    assertLabelsAssociated(html, "系統設定表單");
    [
      "cfgSystemName",
      "cfgSchoolYear",
      "cfgSemester",
      "cfgClientId",
      "cfgClientSecret",
      "cfgAllowedDomain",
      "cfgRestrictWhitelist"
    ].forEach(function (id) {
      assert(collectForIds(html).indexOf(id) !== -1, "應關聯 " + id);
    });
  }
  console.log("   ✓ 系統設定表單驗證通過！\n");

  console.log("2. 新增授權帳號對話框的標籤應全數與控制項關聯...");
  {
    const ctx = accountDeps.createAccountsDeps();
    const accounts = accountsModule.createAccountsModule(ctx.deps);
    accounts.addAccountPrompt();
    const html = ctx.calls.modal.html;
    assertLabelsAssociated(html, "新增授權帳號對話框");
    ["newAccountEmail", "newAccountName", "newAccountRole"].forEach(function (id) {
      assert(collectForIds(html).indexOf(id) !== -1, "應關聯 " + id);
    });
  }
  console.log("   ✓ 新增授權帳號對話框驗證通過！\n");

  console.log("3. 課程搜尋四欄位應具備 sr-only 標籤...");
  {
    const ctx = accountDeps.createCoursesDeps();
    const courses = coursesModule.createCoursesModule(ctx.deps);
    const html = courses.renderView();
    assertLabelsAssociated(html, "課程搜尋表單");
    ["courseSearchKeyword", "courseSearchDept", "courseSearchYear", "courseSearchSem"].forEach(function (id) {
      assert(html.indexOf('class="sr-only" for="' + id + '"') !== -1, "應有 sr-only 標籤：" + id);
    });
  }
  console.log("   ✓ 課程搜尋標籤驗證通過！\n");

  console.log("4. 頁首與登入頁的風格選單應具備 sr-only 標籤...");
  {
    const headerCtx = uiDeps();
    assertLabelsAssociated(headerCtx.ui.renderHeader(), "頁首風格選單");
    assert(headerCtx.ui.renderHeader().indexOf('for="styleSelect"') !== -1);

    const loginCtx = uiDeps();
    const loginHtml = loginCtx.ui.renderLoginView();
    assertLabelsAssociated(loginHtml, "登入頁風格選單");
    assert(loginHtml.indexOf('for="loginStyleSelect"') !== -1);
  }
  console.log("   ✓ 風格選單標籤驗證通過！\n");

  console.log("5. 檔案輸入應具備無障礙名稱...");
  {
    const ctx = importDeps();
    const html = ctx.imports.renderView();
    assert(html.indexOf('aria-label="選擇課程代碼 Excel 檔案"') !== -1);
    assert(html.indexOf('id="fileInput"') !== -1);
  }
  console.log("   ✓ 檔案輸入無障礙名稱驗證通過！\n");

  console.log("✓ 表單標籤關聯測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
