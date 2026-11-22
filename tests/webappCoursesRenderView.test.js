"use strict";

/**
 * webapp/js/courses.js renderView 單元測試（G7.6）。
 * 驗證拆分後各情境輸出與原有行為一致。
 */

const assert = require("assert");
const coursesModule = require("../webapp/js/courses.js");
const createDeps = require("./helpers/accountsCoursesDeps.js").createCoursesDeps;

console.log("開始執行 webapp/js/courses.js renderView 測試...\n");

function run() {
  assert.strictEqual(typeof coursesModule.createCoursesModule, "function", "應匯出 createCoursesModule");
  console.log("1. 應匯出可測試的模組工廠 ✓\n");

  const ctx = createDeps();
  const courses = coursesModule.createCoursesModule(ctx.deps);

  ctx.state.courses = { list: [], total: 0, page: 1, totalPages: 1, loading: false };
  let html = courses.renderView();
  assert(html.indexOf("正規化課程代碼清單") !== -1);
  assert(html.indexOf("目前尚無符合的課程紀錄") !== -1);
  assert(html.indexOf('<option value="">所有科別</option>') !== -1);
  assert(html.indexOf('<option value="資訊管理科">資訊管理科</option>') !== -1);
  assert(html.indexOf('<option value="機械工程科">機械工程科</option>') !== -1);
  assert(
    html.indexOf('<option value="機械工程科">') < html.indexOf('<option value="資訊管理科">'),
    "機械工程科 (代碼 301) 應排在資訊管理科 (代碼 305) 之前"
  );
  assert(html.indexOf("共 0 筆紀錄 · 第 1 / 1 頁") !== -1);
  assert(html.indexOf('data-course-action="page" data-page="0"') !== -1);
  assert(html.indexOf('data-course-action="page" data-page="2"') !== -1);
  assert(html.indexOf('data-course-action="search"') !== -1);
  assert(html.indexOf("oninput=") === -1, "搜尋應由 Enter／搜尋按鈕明確觸發，不應隨輸入自動送出");
  assert(html.indexOf('type="submit" class="btn primary">搜尋') !== -1);
  assert(html.indexOf('data-course-action="reset"') !== -1);
  assert(html.indexOf('data-course-action="refresh" data-page="1"') !== -1, "重新整理按鈕應使用目前頁碼");
  console.log("2. 空清單、選項與事件掛載 ✓\n");

  ctx.state.courses = { list: [], page: 2, totalPages: 4, loading: true };
  html = courses.renderView();
  assert(html.indexOf("正在載入課程資料...") !== -1);
  assert(html.indexOf('data-page="1" disabled') !== -1, "載入中上一頁應停用");
  assert(html.indexOf('data-page="3" disabled') !== -1, "載入中下一頁應停用");
  console.log("3. 載入中狀態與分頁停用 ✓\n");

  ctx.state.courses = {
    list: [
      {
        academicYear: "114",
        semester: "1",
        grade: "一年級",
        courseCode: "A1-001",
        subjectName: "程式設計",
        department: "資訊管理科",
        subjectType: "專業科目",
        attribute: "人文",
        required: "必修",
        credits: "3",
        hours: "54"
      }
    ],
    total: 123,
    page: 3,
    pageSize: 30,
    totalPages: 5,
    loading: false,
    keyword: "程式",
    department: "資訊管理科",
    academicYear: "114",
    semester: "1"
  };
  html = courses.renderView();
  assert(html.indexOf('value="程式"') !== -1);
  assert(html.indexOf('<option value="資訊管理科" selected>資訊管理科</option>') !== -1);
  assert(html.indexOf('<option value="1" selected>') !== -1);
  assert(html.indexOf("共 123 筆紀錄 · 第 3 / 5 頁") !== -1);
  assert(html.indexOf('data-page="2"') !== -1 && html.indexOf('data-page="2" disabled') === -1);
  assert(html.indexOf('data-page="4"') !== -1 && html.indexOf('data-page="4" disabled') === -1);
  assert(html.indexOf("A1-001") !== -1);
  assert(html.indexOf("<strong>程式設計</strong>") !== -1);
  assert(html.indexOf('class="pill muted"') !== -1);
  assert(html.indexOf("3 / 54") !== -1);
  console.log("4. 完整資料、篩選選中與分頁啟用 ✓\n");

  ctx.state.courses = { list: [], page: 1, totalPages: 1, loading: false, semester: "2" };
  html = courses.renderView();
  assert(html.indexOf('<option value="2" selected>') !== -1);
  assert(html.indexOf('data-page="0" disabled') !== -1);
  assert(html.indexOf('data-page="2" disabled') !== -1);
  console.log("5. 學期選項與首頁分頁邊界 ✓\n");

  console.log("6. renderPagedTable 不可用時回退表格渲染...");
  {
    const fallbackCtx = createDeps();
    fallbackCtx.MEA.ui = Object.assign({}, fallbackCtx.MEA.ui, { renderPagedTable: null });
    fallbackCtx.state.courses = {
      list: [{ courseCode: "FB-001", subjectName: "回退課程", department: "科別", credits: "2" }],
      page: 1,
      totalPages: 1
    };
    const fbHtml = coursesModule.createCoursesModule(fallbackCtx.deps).renderView();
    assert(fbHtml.indexOf("FB-001") !== -1, "回退表格應渲染課程代碼");
    assert(fbHtml.indexOf("回退課程") !== -1, "回退表格應渲染課程名稱");
    console.log("   ✓ 回退表格渲染驗證通過！\n");
  }

  console.log("7. compareDepartmentsByCode 缺失或 depts 為無效值時應安全降級...");
  {
    const degCtx = createDeps();
    degCtx.MEA.courseData = {
      DEPARTMENT_CODE_NAMES: { 1: "電機科", 2: "化工科", 3: "電機科", 4: "" },
      compareDepartmentsByCode: null
    };
    degCtx.state.courses = { list: [], total: 0, page: 1, totalPages: 1 };
    const degHtml = coursesModule.createCoursesModule(degCtx.deps).renderView();
    assert(degHtml.indexOf('<option value="化工科">') !== -1, "降級時應包含化工科");
    assert(degHtml.indexOf('<option value="電機科">') !== -1, "降級時應包含電機科");

    const noCourseDataCtx = createDeps();
    noCourseDataCtx.MEA.courseData = null;
    noCourseDataCtx.state.courses = { list: [], total: 0, page: 1, totalPages: 1 };
    const noCourseDataHtml = coursesModule.createCoursesModule(noCourseDataCtx.deps).renderView();
    assert(noCourseDataHtml.indexOf('<option value="">所有科別</option>') !== -1, "無 courseData 時僅有預設選項");

    const nullCtx = createDeps();
    nullCtx.MEA.courseData = { DEPARTMENT_CODE_NAMES: null };
    nullCtx.state.courses = { list: [], total: 0, page: 1, totalPages: 1 };
    const nullHtml = coursesModule.createCoursesModule(nullCtx.deps).renderView();
    assert(nullHtml.indexOf('<option value="">所有科別</option>') !== -1, "depts 為 null 時僅有預設選項");
    console.log("   ✓ 安全降級、排除重複與空值防護驗證通過！\n");
  }

  // 14. 全站外部相依安全降級防護測試
  {
    console.log("14. courses 全站外部相依安全降級防護測試...");
    const noUiCtx = createDeps();
    noUiCtx.MEA.ui = null;
    noUiCtx.MEA.courseData = null;
    noUiCtx.state.courses = {
      list: [
        {
          academicYear: "114",
          semester: "1",
          grade: "1",
          courseCode: "C01",
          subjectName: "<安全科目>",
          department: "機械科",
          subjectType: "必修",
          attribute: "一般",
          required: "是",
          credits: "2",
          hours: "2"
        }
      ],
      total: 1,
      page: 1,
      totalPages: 1
    };
    const mod = coursesModule.createCoursesModule(noUiCtx.deps);
    let viewHtml = "";
    assert.doesNotThrow(function () {
      viewHtml = mod.renderView();
    }, "當 MEA.ui 與 MEA.courseData 為空時 renderView 不應拋錯");
    assert(viewHtml.indexOf("&lt;安全科目&gt;") !== -1, "safeEscapeHtml 應正確跳脫 HTML");
    console.log("   ✓ courses 外部相依安全降級防護通過！\n");
  }

  // 15. Empty State CTA 四維度分流與事件委派測試
  {
    console.log("15. Empty State CTA 四維度分流與事件委派測試...");
    const emptyCtx = createDeps();
    let switchedTab = "";
    emptyCtx.deps.navigation = {
      setTab: function (tab) {
        switchedTab = tab;
      }
    };
    emptyCtx.state.courses = {
      list: [],
      total: 0,
      keyword: "",
      department: "",
      academicYear: "",
      semester: "",
      page: 1,
      totalPages: 1
    };
    const mod = coursesModule.createCoursesModule(emptyCtx.deps);
    const emptyDbHtml = mod.renderView();

    assert(emptyDbHtml.indexOf("目前尚無符合的課程紀錄") !== -1, "全空狀態應包含相容提示文字");
    assert(emptyDbHtml.indexOf('data-course-action="goto-import"') !== -1, "全空狀態應包含前往匯入按鈕");
    assert(emptyDbHtml.indexOf('data-tab="import"') !== -1, "按鈕應標記單數 import 頁籤");

    assert.strictEqual(typeof mod.renderEmptyCoursesStateHtml, "function");
    const emptyStateHtml = mod.renderEmptyCoursesStateHtml(emptyCtx.state.courses);
    assert(emptyStateHtml.indexOf("前往匯入課綱代碼") !== -1);

    // 測試篩選條件查無結果分流
    const filteredCtx = createDeps();
    filteredCtx.state.courses = {
      list: [],
      total: 10,
      keyword: "不存在的科目",
      department: "",
      academicYear: "",
      semester: "",
      page: 1,
      totalPages: 1
    };
    const filteredMod = coursesModule.createCoursesModule(filteredCtx.deps);
    const filteredHtml = filteredMod.renderView();
    assert(filteredHtml.indexOf("目前尚無符合的課程紀錄") !== -1);
    assert(filteredHtml.indexOf('data-course-action="reset"') !== -1, "篩選無結果應包含重設按鈕");
    assert(filteredHtml.indexOf("goto-import") === -1, "篩選無結果不得顯示前往匯入按鈕");

    // 觸發 click delegate 驗證各導向分支
    const delegates = [];
    const navCtx = createDeps();
    navCtx.deps.eventBindings = {
      delegate: function (target, event, selector, handler) {
        delegates.push({ target: target, event: event, selector: selector, handler: handler });
      }
    };
    navCtx.deps.document.addEventListener = function () {};
    navCtx.deps.navigation = {
      setTab: function (tab) {
        switchedTab = tab;
      }
    };
    coursesModule.createCoursesModule(navCtx.deps);

    const clickHandler = delegates.find(function (d) {
      return d.event === "click" && d.selector === "[data-course-action]";
    });
    assert(clickHandler, "應註冊 click 委派");

    // 分支 1: opts.navigation.setTab
    clickHandler.handler(
      {},
      {
        getAttribute: function () {
          return "goto-import";
        }
      }
    );
    assert.strictEqual(switchedTab, "import", "應透過 opts.navigation 導向 import");

    function makeNavContext(setup) {
      const d = [];
      const c = createDeps();
      c.deps.eventBindings = {
        delegate: function (target, event, selector, handler) {
          d.push({ target: target, event: event, selector: selector, handler: handler });
        }
      };
      c.deps.document.addEventListener = function () {};
      setup(c);
      coursesModule.createCoursesModule(c.deps);
      return d.find(function (item) {
        return item.event === "click" && item.selector === "[data-course-action]";
      });
    }

    // 分支 2: MEA.navigation.setTab
    let meaNavTab = "";
    const click2 = makeNavContext(function (c) {
      c.MEA.navigation = {
        setTab: function (t) {
          meaNavTab = t;
        }
      };
    });
    click2.handler(
      {},
      {
        getAttribute: function () {
          return "goto-import";
        }
      }
    );
    assert.strictEqual(meaNavTab, "import");

    // 分支 3: MEA.setTab
    let meaSetTab = "";
    const click3 = makeNavContext(function (c) {
      c.MEA.setTab = function (t) {
        meaSetTab = t;
      };
    });
    click3.handler(
      {},
      {
        getAttribute: function () {
          return "goto-import";
        }
      }
    );
    assert.strictEqual(meaSetTab, "import");

    // 分支 4: MEA.app.setTab
    let appSetTab = "";
    const click4 = makeNavContext(function (c) {
      c.MEA.app = {
        setTab: function (t) {
          appSetTab = t;
        }
      };
    });
    click4.handler(
      {},
      {
        getAttribute: function () {
          return "goto-import";
        }
      }
    );
    assert.strictEqual(appSetTab, "import");

    // 分支 5: 無導向方法時安全回傳 undefined
    const click5 = makeNavContext(function () {});
    assert.strictEqual(
      click5.handler(
        {},
        {
          getAttribute: function () {
            return "goto-import";
          }
        }
      ),
      undefined
    );

    // reset 與 page 動作
    const resetResult = click5.handler(
      {},
      {
        getAttribute: function () {
          return "reset";
        }
      }
    );
    assert(resetResult && typeof resetResult.then === "function", "reset 應回傳 Promise");
    assert.strictEqual(
      click5.handler(
        {},
        {
          getAttribute: function (k) {
            return k === "data-course-action" ? "page" : "not-a-number";
          }
        }
      ),
      undefined
    );
    assert.strictEqual(
      click5.handler(
        {},
        {
          getAttribute: function () {
            return "unknown";
          }
        }
      ),
      undefined
    );

    console.log("   ✓ Empty State CTA 四維度分流與事件委派驗證通過！\n");
  }

  console.log("✓ webapp/js/courses.js renderView 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
