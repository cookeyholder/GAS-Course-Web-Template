/**
 * @file courses.js
 * @description 正規化課程索引清單檢索、篩選與分頁瀏覽
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  function fetchList(page) {
    const targetPage = page || (MEA.state.courses && MEA.state.courses.page) || 1;
    const cur = MEA.state.courses || {};

    MEA.setState({
      courses: Object.assign({}, cur, { loading: true, page: targetPage })
    });

    MEA.api
      .call("getCourseIndex", {
        keyword: cur.keyword || "",
        department: cur.department || "",
        academicYear: cur.academicYear || "",
        semester: cur.semester || "",
        page: targetPage,
        pageSize: cur.pageSize || 30
      })
      .then(function (result) {
        if (!result || result.ok !== true) {
          MEA.setState({
            courses: Object.assign({}, cur, { loading: false })
          });
          MEA.ui.toast((result && result.message) || "讀取課程資料失敗", "err");
          return;
        }

        MEA.setState({
          courses: Object.assign({}, cur, {
            loading: false,
            list: result.list || [],
            total: result.total || 0,
            page: result.page || targetPage,
            pageSize: result.pageSize || 30,
            totalPages: result.totalPages || 1
          })
        });
      })
      .catch(function (error) {
        MEA.setState({
          courses: Object.assign({}, cur, { loading: false })
        });
        MEA.ui.toast(String(error && error.message ? error.message : error), "err");
      });
  }

  function handleSearch(e) {
    if (e && e.preventDefault) e.preventDefault();
    const keywordInput = document.getElementById("courseSearchKeyword");
    const deptSelect = document.getElementById("courseSearchDept");
    const yearInput = document.getElementById("courseSearchYear");
    const semSelect = document.getElementById("courseSearchSem");

    const cur = MEA.state.courses || {};
    MEA.setState({
      courses: Object.assign({}, cur, {
        keyword: keywordInput ? keywordInput.value.trim() : "",
        department: deptSelect ? deptSelect.value.trim() : "",
        academicYear: yearInput ? yearInput.value.trim() : "",
        semester: semSelect ? semSelect.value.trim() : ""
      })
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

  function renderView() {
    const courses = MEA.state.courses || {};
    const list = courses.list || [];
    const loading = courses.loading;
    const depts = MEA.courseData.DEPARTMENT_CODE_NAMES || {};

    let deptOptionsHtml = '<option value="">所有科別</option>';
    for (const code in depts) {
      const name = depts[code];
      const selected = courses.department === name ? " selected" : "";
      deptOptionsHtml +=
        '<option value="' + MEA.ui.escapeHtml(name) + '"' + selected + ">" + MEA.ui.escapeHtml(name) + "</option>";
    }

    let rowsHtml = "";
    if (loading) {
      rowsHtml = '<tr><td colspan="10" class="text-center py-8 text-muted">正在載入課程資料...</td></tr>';
    } else if (list.length === 0) {
      rowsHtml =
        '<tr><td colspan="10" class="text-center py-8 text-muted">' +
        "目前尚無符合的課程紀錄，請至「課程代碼匯入」上傳資料或調整篩選條件。" +
        "</td></tr>";
    } else {
      for (let i = 0; i < list.length; i++) {
        const item = list[i];
        rowsHtml +=
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
          "</tr>";
      }
    }

    // 分頁按鈕
    const totalPages = courses.totalPages || 1;
    const currentPage = courses.page || 1;
    let paginationHtml =
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
      "</div>";

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
      "</div>" +
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

  MEA.courses = {
    fetchList: fetchList,
    handleSearch: handleSearch,
    onKeywordInput: onKeywordInput,
    resetSearch: resetSearch,
    renderView: renderView
  };
})(window.MEA);
