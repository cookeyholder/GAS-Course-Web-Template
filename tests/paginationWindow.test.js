/**
 * @file paginationWindow.test.js
 * @description 驗證通用分頁純運算函式 calculatePaginationWindow 與雙向工具列 renderPaginationBar 之契約 (Task 2.3)
 */

const assert = require("assert");
const ui = require("../webapp/js/ui.js");

console.log("開始執行 calculatePaginationWindow 與 renderPaginationBar 單元測試...\n");

const calculatePaginationWindow = ui.calculatePaginationWindow;
assert.strictEqual(typeof calculatePaginationWindow, "function", "必須提供 calculatePaginationWindow 函式");

// 1. 正常分頁情境驗證
console.log("1. 驗證正常筆數分頁切片與翻頁狀態...");
{
  const result = calculatePaginationWindow(55, 1, 20);
  assert.strictEqual(result.totalItems, 55);
  assert.strictEqual(result.pageSize, 20);
  assert.strictEqual(result.totalPages, 3);
  assert.strictEqual(result.currentPage, 1);
  assert.strictEqual(result.startIndex, 0);
  assert.strictEqual(result.endIndex, 20);
  assert.strictEqual(result.hasPrev, false);
  assert.strictEqual(result.hasNext, true);

  const page2 = calculatePaginationWindow(55, 2, 20);
  assert.strictEqual(page2.currentPage, 2);
  assert.strictEqual(page2.startIndex, 20);
  assert.strictEqual(page2.endIndex, 40);
  assert.strictEqual(page2.hasPrev, true);
  assert.strictEqual(page2.hasNext, true);

  const page3 = calculatePaginationWindow(55, 3, 20);
  assert.strictEqual(page3.currentPage, 3);
  assert.strictEqual(page3.startIndex, 40);
  assert.strictEqual(page3.endIndex, 55);
  assert.strictEqual(page3.hasPrev, true);
  assert.strictEqual(page3.hasNext, false);

  // 驗證陣列切片
  const items = Array.from({ length: 55 }, (_, i) => "item_" + i);
  const sliced = items.slice(page3.startIndex, page3.endIndex);
  assert.strictEqual(sliced.length, 15);
  assert.strictEqual(sliced[0], "item_40");
  assert.strictEqual(sliced[14], "item_54");
  console.log("   ✓ 正常分頁計算與切片驗證通過！");
}

// 2. 邊界：0 筆資料
console.log("2. 驗證 0 筆資料極限邊界...");
{
  const zero = calculatePaginationWindow(0, 1, 20);
  assert.strictEqual(zero.totalItems, 0);
  assert.strictEqual(zero.totalPages, 1, "0 筆資料總頁數應保底為 1");
  assert.strictEqual(zero.currentPage, 1);
  assert.strictEqual(zero.startIndex, 0);
  assert.strictEqual(zero.endIndex, 0);
  assert.strictEqual(zero.hasPrev, false);
  assert.strictEqual(zero.hasNext, false);
  console.log("   ✓ 0 筆資料邊界驗證通過！");
}

// 3. 邊界：除零防禦與 pageSize 異常
console.log("3. 驗證 pageSize <= 0 或非數字之除零防禦...");
{
  const pZero = calculatePaginationWindow(50, 1, 0);
  assert.strictEqual(pZero.pageSize, 20, "pageSize 為 0 應保底為預設 20");
  assert.strictEqual(pZero.totalPages, 3);

  const pNeg = calculatePaginationWindow(50, 1, -5);
  assert.strictEqual(pNeg.pageSize, 20, "pageSize 為負數應保底為預設 20");

  const pNaN = calculatePaginationWindow(50, 1, "invalid");
  assert.strictEqual(pNaN.pageSize, 20, "pageSize 為非數值字串應保底為預設 20");
  console.log("   ✓ pageSize 異常與除零防禦驗證通過！");
}

// 4. 邊界：頁碼小於 1 或大於總頁數
console.log("4. 驗證頁碼超出上下限之校正...");
{
  const underPage = calculatePaginationWindow(50, -3, 20);
  assert.strictEqual(underPage.currentPage, 1, "頁碼小於 1 應強制校正為 1");
  assert.strictEqual(underPage.startIndex, 0);
  assert.strictEqual(underPage.endIndex, 20);

  const overPage = calculatePaginationWindow(50, 999, 20);
  assert.strictEqual(overPage.currentPage, 3, "頁碼超出總頁數應強制校正為最後一頁");
  assert.strictEqual(overPage.startIndex, 40);
  assert.strictEqual(overPage.endIndex, 50);

  const nanPage = calculatePaginationWindow(50, NaN, 20);
  assert.strictEqual(nanPage.currentPage, 1, "NaN 頁碼應預設為 1");
  console.log("   ✓ 頁碼上下限校正驗證通過！");
}

// 5. 邊界：整除情況
console.log("5. 驗證剛好整除情境...");
{
  const exact = calculatePaginationWindow(60, 3, 20);
  assert.strictEqual(exact.totalPages, 3);
  assert.strictEqual(exact.currentPage, 3);
  assert.strictEqual(exact.startIndex, 40);
  assert.strictEqual(exact.endIndex, 60);
  assert.strictEqual(exact.hasPrev, true);
  assert.strictEqual(exact.hasNext, false);
  console.log("   ✓ 整除切片驗證通過！");
}

// 6. 驗證 renderPaginationBar 雙向渲染、唯一 ID、區隔 Landmark 與事件委派模式
console.log("6. 驗證 renderPaginationBar 雙向渲染與屬性生成...");
{
  assert.strictEqual(typeof ui.renderPaginationBar, "function", "必須提供 renderPaginationBar 純函式");

  const topHtml = ui.renderPaginationBar({
    total: 100,
    page: 2,
    pageSize: 20,
    position: "top",
    idPrefix: "test-pager",
    itemLabel: "門課程",
    navAriaLabel: "課程代碼分頁導覽",
    actionAttribute: "data-course-action",
    onPageSizeChange: "changeSize({pageSize})"
  });

  assert.ok(topHtml.includes('id="test-pager-top-size"'), "上方每頁筆數 ID 應包含 -top");
  assert.ok(topHtml.includes('id="test-pager-top-jump"'), "上方跳頁 ID 應包含 -top");
  assert.ok(topHtml.includes('aria-label="課程代碼分頁導覽（上方）"'), "上方分頁導覽地標應包含（上方）方位標示");
  assert.ok(topHtml.includes('data-course-action="page" data-page="1"'), "第一頁按鈕應包含事件委派屬性");
  assert.ok(topHtml.includes('data-course-action="page" data-page="3"'), "下一頁按鈕應包含事件委派屬性");
  assert.ok(topHtml.includes("共 100 門課程 · 第 2 / 5 頁"), "應正確呈現統計字樣");

  const bottomHtml = ui.renderPaginationBar({
    total: 100,
    page: 2,
    pageSize: 20,
    position: "bottom",
    idPrefix: "test-pager",
    itemLabel: "門課程",
    navAriaLabel: "課程代碼分頁導覽",
    onPageChange: "gotoPage({page})",
    onPageSizeChange: "changeSize({pageSize})"
  });

  assert.ok(bottomHtml.includes('id="test-pager-bottom-size"'), "下方每頁筆數 ID 應包含 -bottom");
  assert.ok(bottomHtml.includes('id="test-pager-bottom-jump"'), "下方跳頁 ID 應包含 -bottom");
  assert.ok(bottomHtml.includes('aria-label="課程代碼分頁導覽（下方）"'), "下方分頁導覽地標應包含（下方）方位標示");
  assert.ok(bottomHtml.includes('onclick="gotoPage(1)"'), "第一頁按鈕樣板應代入 1");
  assert.ok(bottomHtml.includes('onclick="gotoPage(3)"'), "下一頁按鈕樣板應代入 3");
  console.log("   ✓ renderPaginationBar 雙向渲染與唯一 ID 驗證通過！");
}

// 7. 驗證 renderPaginationBar 0 筆與單頁停用防呆
console.log("7. 驗證 renderPaginationBar 0 筆與單頁停用防呆...");
{
  const emptyHtml = ui.renderPaginationBar({
    total: 0,
    page: 1,
    pageSize: 15,
    position: "bottom",
    idPrefix: "empty-pager",
    itemLabel: "筆紀錄",
    onPageChange: "gotoPage({page})",
    onPageSizeChange: "changeSize({pageSize})"
  });

  assert.ok(emptyHtml.includes('id="empty-pager-bottom-size"'), "每頁筆數元素存在");
  assert.ok(emptyHtml.includes("disabled"), "0 筆時控制項應包含 disabled");
  assert.ok(emptyHtml.includes("共 0 筆紀錄 · 第 1 / 1 頁"), "0 筆時呈現正確文字");

  const singleHtml = ui.renderPaginationBar({
    total: 5,
    page: 1,
    pageSize: 15,
    position: "top",
    idPrefix: "single-pager",
    onPageChange: "gotoPage({page})",
    onPageSizeChange: "changeSize({pageSize})"
  });
  assert.ok(singleHtml.includes("disabled"), "單頁時跳頁與翻頁按鈕應包含 disabled");
  console.log("   ✓ renderPaginationBar 0 筆與單頁停用防呆驗證通過！");
}

console.log("\n✓ calculatePaginationWindow 與 renderPaginationBar 測試全數通過！");
