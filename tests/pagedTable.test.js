/**
 * @file pagedTable.test.js
 * @description 驗證 renderPagedTable 高階純函式資料表格組合容器與各輔助函式之契約 (Task 2.3)
 */

const assert = require("assert");
const ui = require("../webapp/js/ui.js");

console.log("開始執行 renderPagedTable 與表格純函式單元測試...\n");

assert.strictEqual(typeof ui.renderPagedTable, "function", "必須提供 renderPagedTable 函式");
assert.strictEqual(typeof ui.renderTableHead, "function", "必須提供 renderTableHead 函式");
assert.strictEqual(typeof ui.renderTableBody, "function", "必須提供 renderTableBody 函式");
assert.strictEqual(typeof ui.renderTableStatusRow, "function", "必須提供 renderTableStatusRow 函式");
assert.strictEqual(typeof ui.normalizeTableAlign, "function", "必須提供 normalizeTableAlign 函式");

// 1. normalizeTableAlign 白名單驗證
console.log("1. 驗證 normalizeTableAlign 白名單過濾...");
{
  assert.strictEqual(ui.normalizeTableAlign("left"), "left");
  assert.strictEqual(ui.normalizeTableAlign("CENTER"), "center");
  assert.strictEqual(ui.normalizeTableAlign(" right "), "right");
  assert.strictEqual(ui.normalizeTableAlign("justify"), "justify");
  assert.strictEqual(ui.normalizeTableAlign("invalid-css;color:red"), "");
  assert.strictEqual(ui.normalizeTableAlign(null), "");
  assert.strictEqual(ui.normalizeTableAlign(undefined), "");
  console.log("   ✓ normalizeTableAlign 白名單驗證通過！");
}

// 2. renderTableHead 邊界與 scope="col"
console.log("2. 驗證 renderTableHead 邊界與 scope=col 標註...");
{
  assert.strictEqual(ui.renderTableHead(null), "", "null columns 應回傳空字串");
  assert.strictEqual(ui.renderTableHead([]), "", "空 columns 應回傳空字串");

  const headHtml = ui.renderTableHead([
    { title: "序號", width: "60px", align: "center" },
    { field: "courseCode", label: "課程代碼", align: "left" }
  ]);
  assert.match(headHtml, /<thead><tr>/, "應包含 thead 與 tr");
  assert.match(
    headHtml,
    /<th scope="col" style="text-align:center;" width="60px">序號<\/th>/,
    "應包含 scope 與置中樣式"
  );
  assert.match(
    headHtml,
    /<th scope="col" style="text-align:left;">課程代碼<\/th>/,
    "應支援 label 回退並標註 scope=col"
  );
  console.log("   ✓ renderTableHead 表頭產生通過！");
}

// 3. renderTableStatusRow 語意保護與 colspan 防呆
console.log("3. 驗證 renderTableStatusRow 單元格語意保護與 colspan...");
{
  const loadingRow = ui.renderTableStatusRow({ colspan: 5, loading: true, loadingText: "資料載入中..." });
  assert.match(loadingRow, /colspan="5"/, "應支援自訂 colspan");
  assert.match(loadingRow, /<div role="status" aria-live="polite">/, "role=status 應位於單元格內層 div");
  assert.match(loadingRow, /資料載入中\.\.\./, "應顯示自訂 loadingText");

  const emptyRow = ui.renderTableStatusRow({ colspan: 3, loading: false, emptyText: "查無任何課程紀錄" });
  assert.match(emptyRow, /colspan="3"/, "無資料列 colspan");
  assert.match(emptyRow, /<div role="status" aria-live="polite">/, "無資料列亦應於內層標註 role=status");
  assert.match(emptyRow, /查無任何課程紀錄/, "應顯示自訂 emptyText");
  console.log("   ✓ renderTableStatusRow 語意保護通過！");
}

// 4. renderTableBody 與 XSS 防禦
console.log("4. 驗證 renderTableBody 渲染、自訂 rowRenderer 與 XSS 防禦...");
{
  const bodyLoading = ui.renderTableBody({ loading: true, colspan: 4 });
  assert.match(bodyLoading, /<tbody>.*載入中.*<\/tbody>/, "載入狀態應回傳 status row");

  const bodyEmpty = ui.renderTableBody({ items: [], loading: false, colspan: 2 });
  assert.match(bodyEmpty, /<tbody>.*查無資料.*<\/tbody>/, "空資料應回傳無資料列");

  // 自訂 rowRenderer 回呼
  const customBody = ui.renderTableBody({
    items: [{ id: 101, name: "國語文" }],
    rowRenderer: (item, idx) => `<tr><td>#${idx}</td><td>${item.name}</td></tr>`
  });
  assert.match(customBody, /<tr><td>#0<\/td><td>國語文<\/td><\/tr>/, "應支援自訂 rowRenderer 回呼");

  // 宣告式 columns 與 XSS 防禦
  const xssItems = [{ id: "<script>alert(1)</script>", note: "<b>重點</b>" }];
  const xssCols = [
    { key: "id", title: "代碼" },
    { field: "note", title: "備註", formatter: (val) => `<span class="badge">${val}</span>` }
  ];
  const xssBody = ui.renderTableBody({ items: xssItems, columns: xssCols });
  assert.doesNotMatch(xssBody, /<script>/, "未提供 formatter 欄位必須跳脫 XSS 標籤");
  assert.match(xssBody, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/, "XSS 標籤應被正確跳脫");
  assert.match(xssBody, /<span class="badge"><b>重點<\/b><\/span>/, "自訂 formatter 應允許渲染 HTML");
  console.log("   ✓ renderTableBody 與 XSS 防禦通過！");
}

// 5. renderPagedTable 組合容器與雙向分頁
console.log("5. 驗證 renderPagedTable 高階組合容器與相容性...");
{
  const pagedHtml = ui.renderPagedTable({
    className: "custom-table",
    columns: [
      { key: "code", title: "課程代碼" },
      { key: "name", title: "科目名稱" }
    ],
    items: [{ code: "21101", name: "數學" }],
    beforeTableHtml: '<div class="alert">提示</div>',
    afterTableHtml: '<div class="footer">結尾</div>',
    pagination: {
      total: 50,
      page: 1,
      pageSize: 10,
      idPrefix: "test-table",
      itemLabel: "門課程",
      actionAttribute: "data-course-action"
    }
  });

  assert.match(pagedHtml, /class="alert"/, "應包含 beforeTableHtml 插槽");
  assert.match(pagedHtml, /class="footer"/, "應包含 afterTableHtml 插槽");
  assert.match(
    pagedHtml,
    /class="table-responsive table-container"/,
    "容器應同時包含 table-responsive 與 table-container 類別以相容主題"
  );
  assert.match(pagedHtml, /class="data-table custom-table"/, "表格應包含 data-table 與自訂 class");
  assert.match(pagedHtml, /pagination-bar-top/, "預設應產生頂部分頁工具列");
  assert.match(pagedHtml, /pagination-bar-bottom/, "預設應產生底部分頁工具列");
  assert.match(pagedHtml, /data-course-action="page"/, "分頁列應包含事件委派屬性");

  // loading 時標記 aria-busy="true" 且按鈕 disabled
  const loadingHtml = ui.renderPagedTable({
    loading: true,
    pagination: {
      total: 50,
      page: 1,
      pageSize: 10,
      actionAttribute: "data-course-action"
    }
  });
  assert.match(loadingHtml, /<table [^>]*aria-busy="true"/, "載入狀態 table 應標註 aria-busy=true");
  assert.match(loadingHtml, /disabled/, "載入狀態下分頁導覽按鈕應帶有 disabled 停用防呆");

  // 自訂 theadHtml 自動補齊 scope="col" 防呆
  const customTheadHtml = ui.renderPagedTable({
    theadHtml: '<thead><tr><th>科目</th><th scope="colgroup">年級</th></tr></thead>',
    items: []
  });
  assert.match(customTheadHtml, /<th scope="col">科目<\/th>/, "自訂 theadHtml 若無 scope 應自動補齊 scope=col");
  assert.match(customTheadHtml, /<th scope="colgroup">年級<\/th>/, "自訂 theadHtml 若已有 scope 則維持原樣");

  // 未提供 pagination 物件時純表格降級
  const plainTableHtml = ui.renderPagedTable({
    items: [{ id: 1 }],
    columns: [{ key: "id", title: "ID" }]
  });
  assert.doesNotMatch(plainTableHtml, /pagination-bar/, "未提供 pagination 時不得渲染分頁工具列");
  assert.match(plainTableHtml, /class="table-responsive table-container"/, "純表格仍應保留橫向捲動容器");
  console.log("   ✓ renderPagedTable 組合容器驗證通過！");
}

console.log("\n✓ renderPagedTable 與表格純函式測試全數通過！");
