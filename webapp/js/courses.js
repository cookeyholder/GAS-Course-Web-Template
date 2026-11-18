/**
 * @file courses.js
 * @description 正規化課程索引清單檢索、篩選與分頁瀏覽（可測試工廠）。
 *
 * 瀏覽器環境組裝 window.MEA.courses；Node.js 環境匯出 createCoursesModule 供單元測試注入依賴。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    MEA.courses = api.createCoursesModule({
      MEA: MEA,
      document: window.document
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * 建立課程索引模組控制器。
   *
   * @param {Object} [deps] - 依賴注入（MEA、document）
   * @returns {Object} 公開方法集合（與 MEA.courses 一致）
   */
  function createCoursesModule(deps) {
    const options = deps || {};
    const MEA = options.MEA || (typeof window !== "undefined" ? window.MEA : null) || {};
    const doc = options.document || (typeof document !== "undefined" ? document : null);

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
     * @returns {string} 可顯示的錯誤訊息
     */
    function normalizeErrorMessage(error) {
      return String(error && error.message ? error.message : error);
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
     * 由成功回應建構課程狀態更新片段。
     *
     * @param {number} targetPage - 目標頁碼
     * @param {Object} result - API 回應
     * @returns {Object} courses 更新片段
     */
    function buildCoursesSuccessPatch(targetPage, result) {
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
     * 處理課程清單讀取結果（原 fetchList 的 then 回呼）。
     *
     * @param {Object} cur - 請求前的課程狀態快照
     * @param {Object} result - API 回應
     * @param {number} targetPage - 目標頁碼
     */
    function handleFetchListSuccess(cur, result, targetPage) {
      if (!result || result.ok !== true) {
        MEA.setState({
          courses: Object.assign({}, cur, { loading: false })
        });
        MEA.ui.toast((result && result.message) || "讀取課程資料失敗", "err");
        return;
      }

      MEA.setState({
        courses: Object.assign({}, cur, buildCoursesSuccessPatch(targetPage, result))
      });
    }

    function fetchList(page) {
      const targetPage = page || (MEA.state.courses && MEA.state.courses.page) || 1;
      const cur = MEA.state.courses || {};

      MEA.setState({
        courses: Object.assign({}, cur, { loading: true, page: targetPage })
      });

      MEA.api
        .call("getCourseIndex", buildCourseQuery(cur, targetPage))
        .then(function (result) {
          handleFetchListSuccess(cur, result, targetPage);
        })
        .catch(function (error) {
          MEA.setState({
            courses: Object.assign({}, cur, { loading: false })
          });
          MEA.ui.toast(normalizeErrorMessage(error), "err");
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

    function handleSearch(e) {
      if (e && e.preventDefault) e.preventDefault();
      const cur = MEA.state.courses || {};
      MEA.setState({
        courses: Object.assign({}, cur, readSearchFormValues())
      });

      fetchList(1);
    }

    const onKeywordInput =
      MEA.ui && typeof MEA.ui.debounce === "function"
        ? MEA.ui.debounce(function () {
            handleSearch();
          }, 300)
        : function () {};

    function resetSearch() {
      const cur = MEA.state.courses || {};
      MEA.setState({
        courses: Object.assign({}, cur, {
          keyword: "",
          department: "",
          academicYear: "",
          semester: ""
        })
      });
      fetchList(1);
    }

    /**
     * 產生科別下拉選單。
     *
     * @param {Object} depts - 科別對照字典
     * @param {string} selectedDepartment - 目前選中的科別名稱
     * @returns {string} HTML 字串
     */
    function renderDeptOptionsHtml(depts, selectedDepartment) {
      let optionsHtml = '<option value="">所有科別</option>';
      for (const code in depts) {
        const name = depts[code];
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
     * 產生分頁列。
     *
     * @param {Object} courses - 課程狀態
     * @param {boolean} loading - 是否載入中
     * @returns {string} HTML 字串
     */
    function renderPaginationHtml(courses, loading) {
      const totalPages = courses.totalPages || 1;
      const currentPage = courses.page || 1;
      return (
        '<div class="pagination-bar">' +
        '  <span class="pagination-info">共 ' +
        MEA.ui.number(courses.total) +
        " 筆紀錄 · 第 " +
        currentPage +
        " / " +
        totalPages +
        " 頁</span>" +
        '  <div class="pagination-buttons">' +
        '    <button class="btn secondary compact" onclick="MEA.courses.fetchList(' +
        (currentPage - 1) +
        ')"' +
        (currentPage <= 1 || loading ? " disabled" : "") +
        ">上一頁</button>" +
        '    <button class="btn secondary compact" onclick="MEA.courses.fetchList(' +
        (currentPage + 1) +
        ')"' +
        (currentPage >= totalPages || loading ? " disabled" : "") +
        ">下一頁</button>" +
        "  </div>" +
        "</div>"
      );
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
        '  <form class="filter-form" onsubmit="MEA.courses.handleSearch(event)">' +
        '    <input type="text" id="courseSearchKeyword" class="input" oninput="MEA.courses.onKeywordInput()" placeholder="搜尋課程代碼、科目名稱或群別..." value="' +
        MEA.ui.escapeHtml(courses.keyword || "") +
        '" />' +
        '    <select id="courseSearchDept" class="select">' +
        deptOptionsHtml +
        "</select>" +
        '    <input type="text" id="courseSearchYear" class="input compact" style="width:100px;" placeholder="學年 (如 114)" value="' +
        MEA.ui.escapeHtml(courses.academicYear || "") +
        '" />' +
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
        '    <button type="button" class="btn secondary" onclick="MEA.courses.resetSearch()">重設</button>' +
        "  </form>" +
        "</div>"
      );
    }

    function renderView() {
      const courses = MEA.state.courses || {};
      const list = courses.list || [];
      const loading = courses.loading;
      const depts = MEA.courseData.DEPARTMENT_CODE_NAMES || {};

      const deptOptionsHtml = renderDeptOptionsHtml(depts, courses.department);
      const rowsHtml = renderCourseRowsHtml(list, loading);
      const paginationHtml = renderPaginationHtml(courses, loading);
      const currentPage = courses.page || 1;

      return (
        '<div class="panel">' +
        '<div class="panel-header">' +
        "  <div>" +
        '    <h2 class="panel-title">正規化課程索引清單</h2>' +
        '    <p class="panel-sub">檢視自 39 欄課綱寬表展開後之 1NF 課程紀錄</p>' +
        "  </div>" +
        '  <button class="btn secondary compact" onclick="MEA.courses.fetchList(' +
        currentPage +
        ')">🔄 重新整理</button>' +
        "</div>" +
        renderSearchFormHtml(courses, deptOptionsHtml) +
        '<div class="table-responsive mt-3">' +
        '  <table class="table">' +
        "    <thead>" +
        "      <tr>" +
        "        <th>學年</th><th>學期</th><th>年級</th><th>課程代碼</th><th>科目名稱</th><th>科別</th><th>課程類別</th><th>科目屬性</th><th>必選修</th><th>學分/時數</th>" +
        "      </tr>" +
        "    </thead>" +
        "    <tbody>" +
        rowsHtml +
        "</tbody>" +
        "  </table>" +
        "</div>" +
        paginationHtml +
        "</div>"
      );
    }

    return {
      fetchList: fetchList,
      handleSearch: handleSearch,
      onKeywordInput: onKeywordInput,
      resetSearch: resetSearch,
      renderView: renderView
    };
  }

  return {
    createCoursesModule: createCoursesModule
  };
});
