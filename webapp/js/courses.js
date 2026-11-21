/**
 * @file courses.js
 * @description 正規化課程代碼清單檢索、篩選與分頁瀏覽（可測試工廠）。
 *
 * 瀏覽器環境組裝 window.MEA.courses；Node.js 環境匯出 createCoursesModule 供單元測試注入依賴。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    // task 6.1：僅註冊工廠，實例由 wiring.js 集中建立並注入最小介面。
    if (!MEA.factories) {
      MEA.factories = {};
    }
    MEA.factories.courses = api.createCoursesModule;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // task 6.4：共用 Node require 相容墊片與 safeErrors 注入解析（Node 由 require 取得，瀏覽器由全域取得）。
  const moduleHelpers = typeof require === "function" ? require("./moduleHelpers.js") : globalThis.MEA.moduleHelpers;

  /**
   * 建立課程代碼模組控制器。
   *
   * @param {Object} [deps] - 依賴注入（MEA、document）
   * @returns {Object} 公開方法集合（與 MEA.courses 一致）
   */
  function createCoursesModule(deps) {
    const options = deps || {};
    const safeErrors = moduleHelpers.resolveSafeErrors(options);
    const MEA = options.MEA || (typeof window !== "undefined" ? window.MEA : null) || {};
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    // task 6.2：事件綁定守護由共用模組提供（Node 由 require 取得，瀏覽器由全域取得）。
    const bindings = typeof require === "function" ? require("./eventBindings.js") : globalThis.MEA.eventBindings;
    // task 6.3：列表控制流程由共用控制器提供（Node 由 require 取得，瀏覽器由全域取得）。
    const listControllerModule =
      typeof require === "function" ? require("./listController.js") : globalThis.MEA.listController;

    const listCtl = listControllerModule.createListController({
      apiAction: "getCourseIndex",
      getState: function () {
        return MEA.state.courses || {};
      },
      setState: function (next) {
        MEA.setState({ courses: next });
      },
      callApi: function (action, payload) {
        return MEA.api.call(action, payload);
      },
      toast: function (message, kind) {
        MEA.ui.toast(message, kind);
      },
      buildQuery: buildCourseQuery,
      buildFetchKey: buildCourseFetchKey,
      buildSuccessPatch: buildCoursesSuccessPatch,
      readFilters: readSearchFormValues,
      buildResetPatch: function () {
        return { keyword: "", department: "", academicYear: "", semester: "" };
      },
      resolveErrorMessage: normalizeErrorMessage,
      normalizePage: function (requested, state) {
        return requested || state.page || 1;
      },
      failureFallback: "讀取課程資料失敗",
      errorFallback: "讀取課程資料失敗，請稍後再試",
      pagination: {
        actionAttribute: "data-course-action",
        number: function (value) {
          return MEA.ui.number(value);
        },
        normalize: function (state) {
          return {
            total: state.total,
            currentPage: state.page || 1,
            totalPages: state.totalPages || 1
          };
        }
      }
    });

    const fetchList = listCtl.fetchList;
    const handleSearch = listCtl.handleSearch;
    const resetSearch = listCtl.resetSearch;

    /** 以 document 委派綁定搜尋表單、分頁與重設事件。 */
    function bindEventsOnce() {
      if (!bindings || !doc || typeof doc.addEventListener !== "function") return;
      bindings.delegate(doc, "submit", "[data-course-action='search']", function (event) {
        handleSearch(event);
      });
      bindings.delegate(doc, "click", "[data-course-action]", function (event, element) {
        const action = element.getAttribute("data-course-action");
        if (action === "page" || action === "refresh") {
          const page = parseInt(element.getAttribute("data-page"), 10);
          return Number.isFinite(page) ? fetchList(page) : undefined;
        }
        if (action === "reset") return resetSearch();
        return undefined;
      });
    }

    bindEventsOnce();

    /**
     * 以注入的 document 取得元素，缺損時回傳 null。
     *
     * @param {string} id - 元素識別碼
     * @returns {Object|null} 元素或 null
     */
    function getElementById(id) {
      return doc && typeof doc.getElementById === "function" ? doc.getElementById(id) : null;
    }

    /**
     * 統一錯誤訊息轉譯。
     *
     * @param {*} error - 錯誤物件或字串
     * @param {string} fallback - 原始例外不外顯時使用的文案
     * @returns {string} 可顯示的錯誤訊息
     */
    function normalizeErrorMessage(error, fallback) {
      return safeErrors.resolveSafeMessage(error, fallback);
    }

    /**
     * 由目前的課程狀態與目標頁碼建構 API 查詢參數。
     *
     * @param {Object} cur - 目前課程狀態
     * @param {number} targetPage - 目標頁碼
     * @returns {Object} API payload
     */
    function buildCourseQuery(cur, targetPage) {
      return {
        keyword: cur.keyword || "",
        department: cur.department || "",
        academicYear: cur.academicYear || "",
        semester: cur.semester || "",
        page: targetPage,
        pageSize: cur.pageSize || 30
      };
    }

    /**
     * 由查詢參數建立 in-flight Promise 避免重複鍵。
     *
     * @param {Object} query - API 查詢參數
     * @returns {string} 避免重複鍵
     */
    function buildCourseFetchKey(query) {
      return JSON.stringify([
        query.keyword || "",
        query.department || "",
        query.academicYear || "",
        query.semester || "",
        query.page || 1,
        query.pageSize || 30
      ]);
    }

    /**
     * 由成功回應建構課程狀態更新片段。
     *
     * @param {Object} state - 目前課程狀態
     * @param {Object} result - API 回應
     * @param {number} targetPage - 目標頁碼
     * @returns {Object} courses 更新片段
     */
    function buildCoursesSuccessPatch(state, result, targetPage) {
      return {
        loading: false,
        list: result.list || [],
        total: result.total || 0,
        page: result.page || targetPage,
        pageSize: result.pageSize || 30,
        totalPages: result.totalPages || 1
      };
    }

    /**
     * 處理輕量統計回應：僅更新概覽頁所需的總筆數。
     *
     * @param {Object} result - API 回應
     */
    function handleFetchStatsSuccess(result) {
      if (!result || result.ok !== true) return;
      const cur = MEA.state.courses || {};
      MEA.setState({
        courses: Object.assign({}, cur, { total: result.total || 0 })
      });
    }

    /**
     * 僅取得課程代碼總筆數，不下載完整清單；供概覽頁使用。
     *
     * @returns {Promise<Object|null>} API 回應或失敗時的 null
     */
    function fetchStats() {
      if (!MEA.api || typeof MEA.api.call !== "function") return Promise.resolve(null);
      return MEA.api
        .call("getCourseIndexStats", {})
        .then(function (result) {
          handleFetchStatsSuccess(result);
          return result;
        })
        .catch(function () {
          return null;
        });
    }

    /**
     * 讀取搜尋表單欄位。
     *
     * @returns {Object} 表單值快照
     */
    function readSearchFormValues() {
      const keywordInput = getElementById("courseSearchKeyword");
      const deptSelect = getElementById("courseSearchDept");
      const yearInput = getElementById("courseSearchYear");
      const semSelect = getElementById("courseSearchSem");

      return {
        keyword: keywordInput ? keywordInput.value.trim() : "",
        department: deptSelect ? deptSelect.value.trim() : "",
        academicYear: yearInput ? yearInput.value.trim() : "",
        semester: semSelect ? semSelect.value.trim() : ""
      };
    }

    /**
     * 產生科別下拉選單。
     *
     * @param {Object} depts - 科別對照字典
     * @param {string} selectedDepartment - 目前選中的科別名稱
     * @returns {string} HTML 字串
     */
    /**
     * 產生科別下拉選單選項 HTML（依科別代碼升冪排序）。
     *
     * @param {Object} depts - 科別代碼與名稱對照表
     * @param {string} selectedDepartment - 目前選取的科別名稱
     * @returns {string} 選項 HTML
     */
    function renderDeptOptionsHtml(depts, selectedDepartment) {
      let optionsHtml = '<option value="">所有科別</option>';
      if (!depts || typeof depts !== "object") {
        return optionsHtml;
      }
      const names = [];
      const seen = Object.create(null);
      for (const code in depts) {
        const name = depts[code];
        if (name && !seen[name]) {
          seen[name] = true;
          names.push(name);
        }
      }
      const comparator =
        MEA.courseData && typeof MEA.courseData.compareDepartmentsByCode === "function"
          ? MEA.courseData.compareDepartmentsByCode
          : function (a, b) {
              return String(a || "").localeCompare(String(b || ""), "zh-TW");
            };
      names.sort(comparator);
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const selected = selectedDepartment === name ? " selected" : "";
        optionsHtml +=
          '<option value="' + MEA.ui.escapeHtml(name) + '"' + selected + ">" + MEA.ui.escapeHtml(name) + "</option>";
      }
      return optionsHtml;
    }

    /**
     * 產生單筆課程表格列。
     *
     * @param {Object} item - 課程紀錄
     * @returns {string} HTML 字串
     */
    function renderCourseRowHtml(item) {
      return (
        "<tr>" +
        "<td>" +
        MEA.ui.escapeHtml(item.academicYear) +
        "</td>" +
        "<td>" +
        MEA.ui.escapeHtml(item.semester) +
        "</td>" +
        "<td>" +
        MEA.ui.escapeHtml(item.grade) +
        "</td>" +
        '<td class="mono font-sm">' +
        MEA.ui.escapeHtml(item.courseCode) +
        "</td>" +
        "<td><strong>" +
        MEA.ui.escapeHtml(item.subjectName) +
        "</strong></td>" +
        '<td><span class="pill muted">' +
        MEA.ui.escapeHtml(item.department) +
        "</span></td>" +
        "<td>" +
        MEA.ui.escapeHtml(item.subjectType) +
        "</td>" +
        "<td>" +
        MEA.ui.escapeHtml(item.attribute) +
        "</td>" +
        "<td>" +
        MEA.ui.escapeHtml(item.required) +
        "</td>" +
        "<td>" +
        MEA.ui.escapeHtml(item.credits) +
        " / " +
        MEA.ui.escapeHtml(item.hours) +
        "</td>" +
        "</tr>"
      );
    }

    /**
     * 產生課程表格內容。
     *
     * @param {Array<Object>} list - 課程陣列
     * @param {boolean} loading - 是否載入中
     * @returns {string} HTML 字串
     */
    function renderCourseRowsHtml(list, loading) {
      if (loading) {
        return '<tr><td colspan="10" class="text-center py-8 text-muted">正在載入課程資料...</td></tr>';
      }
      if (list.length === 0) {
        return (
          '<tr><td colspan="10" class="text-center py-8 text-muted">' +
          "目前尚無符合的課程紀錄，請至「課程代碼匯入」上傳資料或調整篩選條件。" +
          "</td></tr>"
        );
      }

      let rowsHtml = "";
      for (let i = 0; i < list.length; i++) {
        rowsHtml += renderCourseRowHtml(list[i]);
      }
      return rowsHtml;
    }

    /**
     * 產生搜尋表單。
     *
     * @param {Object} courses - 課程狀態
     * @param {string} deptOptionsHtml - 科別下拉選單 HTML
     * @returns {string} HTML 字串
     */
    function renderSearchFormHtml(courses, deptOptionsHtml) {
      return (
        '<div class="filter-bar">' +
        '  <form class="filter-form" data-course-action="search">' +
        '    <label class="sr-only" for="courseSearchKeyword">搜尋關鍵字</label>' +
        '    <input type="text" id="courseSearchKeyword" class="input" placeholder="搜尋課程代碼、科目名稱或群別..." value="' +
        MEA.ui.escapeHtml(courses.keyword || "") +
        '" />' +
        '    <label class="sr-only" for="courseSearchDept">科別篩選</label>' +
        '    <select id="courseSearchDept" class="select">' +
        deptOptionsHtml +
        "</select>" +
        '    <label class="sr-only" for="courseSearchYear">開課學年</label>' +
        '    <input type="text" id="courseSearchYear" class="input compact" style="width:100px;" placeholder="學年 (如 114)" value="' +
        MEA.ui.escapeHtml(courses.academicYear || "") +
        '" />' +
        '    <label class="sr-only" for="courseSearchSem">學期篩選</label>' +
        '    <select id="courseSearchSem" class="select compact" style="width:100px;">' +
        '      <option value="">學期</option>' +
        '      <option value="1"' +
        (courses.semester === "1" ? " selected" : "") +
        ">第 1 學期</option>" +
        '      <option value="2"' +
        (courses.semester === "2" ? " selected" : "") +
        ">第 2 學期</option>" +
        "    </select>" +
        '    <button type="submit" class="btn primary">搜尋</button>' +
        '    <button type="button" class="btn secondary" data-course-action="reset">重設</button>' +
        "  </form>" +
        "</div>"
      );
    }

    function renderView() {
      const courses = MEA.state.courses || {};
      const list = courses.list || [];
      const loading = Boolean(courses.loading);
      const depts = MEA.courseData.DEPARTMENT_CODE_NAMES || {};

      const deptOptionsHtml = renderDeptOptionsHtml(depts, courses.department);
      const currentPage = courses.page || 1;
      const totalPages = courses.totalPages !== undefined ? courses.totalPages : 1;

      const columns = [
        { title: "學年" },
        { title: "學期" },
        { title: "年級" },
        { title: "課程代碼" },
        { title: "科目名稱" },
        { title: "科別" },
        { title: "課程類別" },
        { title: "科目屬性" },
        { title: "必選修" },
        { title: "學分/時數" }
      ];

      const pagedTableHtml =
        MEA.ui && typeof MEA.ui.renderPagedTable === "function"
          ? MEA.ui.renderPagedTable({
              className: "table table-centered table-hover",
              columns: columns,
              items: list,
              rowRenderer: function (item) {
                return renderCourseRowHtml(item);
              },
              loading: loading,
              loadingText: "正在載入課程資料...",
              emptyText: "目前尚無符合的課程紀錄",
              colspan: 10,
              pagination: {
                total: courses.total || 0,
                totalPages: totalPages,
                page: currentPage,
                pageSize: courses.pageSize || 20,
                idPrefix: "course-page",
                navAriaLabel: "課程代碼分頁導覽",
                itemLabel: "筆紀錄",
                actionAttribute: "data-course-action"
              }
            })
          : '<div class="table-responsive mt-3">' +
            '  <table class="table">' +
            "    <thead>" +
            "      <tr>" +
            '        <th scope="col">學年</th><th scope="col">學期</th><th scope="col">年級</th><th scope="col">課程代碼</th><th scope="col">科目名稱</th><th scope="col">科別</th><th scope="col">課程類別</th><th scope="col">科目屬性</th><th scope="col">必選修</th><th scope="col">學分/時數</th>' +
            "      </tr>" +
            "    </thead>" +
            "    <tbody>" +
            renderCourseRowsHtml(list) +
            "</tbody>" +
            "  </table>" +
            "</div>";

      return (
        '<div class="panel">' +
        '<div class="panel-header">' +
        "  <div>" +
        '    <h2 class="panel-title">正規化課程代碼清單</h2>' +
        '    <p class="panel-sub">檢視自 39 欄課綱寬表展開後之 1NF 課程紀錄</p>' +
        "  </div>" +
        '  <button type="button" class="btn secondary compact" data-course-action="refresh" data-page="' +
        currentPage +
        '">🔄 重新整理</button>' +
        "</div>" +
        renderSearchFormHtml(courses, deptOptionsHtml) +
        pagedTableHtml +
        "</div>"
      );
    }

    return {
      fetchList: fetchList,
      fetchStats: fetchStats,
      handleSearch: handleSearch,
      resetSearch: resetSearch,
      renderView: renderView
    };
  }

  return {
    createCoursesModule: createCoursesModule
  };
});
