"use strict";

/**
 * 上傳區鍵盤可操作測試（task 3.2）。
 * 驗證拖曳區具備 role/tabindex/aria-label，且 Enter 與 Space 可觸發檔案選擇。
 */

const assert = require("assert");
const helpers = require("./helpers/importsUiDeps.js");
const createDeps = helpers.createImportsDeps;

function makeKeyEvent(key, keyCode) {
  let prevented = 0;
  return {
    key: key,
    keyCode: keyCode,
    preventDefault: function () {
      prevented += 1;
    },
    get prevented() {
      return prevented;
    }
  };
}

console.log("開始執行上傳區鍵盤可操作測試...\n");

console.log("1. 上傳區應具備按鈕語意、可聚焦性與鍵盤事件...");
{
  const ctx = createDeps();
  const html = ctx.imports.renderView();
  assert(html.indexOf('role="button"') !== -1, "應標示 role=button");
  assert(html.indexOf('tabindex="0"') !== -1, "應可用 Tab 聚焦");
  assert(html.indexOf('aria-label="選擇或拖曳課程代碼 Excel 檔案"') !== -1, "應有無障礙名稱");
  assert(html.indexOf('data-import-dropzone="1"') !== -1, "應標註鍵盤事件委派目標");
  assert(html.indexOf('class="sr-only"') !== -1, "檔案輸入應為可聚焦的視覺隱藏樣式");
  assert(html.indexOf("display:none") === -1, "不應以 display:none 隱藏唯一的檔案輸入");
  console.log("   ✓ 上傳區語意驗證通過！\n");
}

console.log("2. Enter 與 Space 應觸發檔案選擇並阻止預設行為...");
{
  const ctx = createDeps();
  const fileInput = helpers.createElement("input");
  ctx.elements.fileInput = fileInput;
  [
    ["Enter", 13],
    [" ", 32],
    ["Spacebar", 32]
  ].forEach(function (pair) {
    fileInput.clicked = 0;
    const event = makeKeyEvent(pair[0], pair[1]);
    ctx.imports.handleDropzoneKey(event);
    assert.strictEqual(fileInput.clicked, 1, "按鍵 " + pair[0] + " 應觸發檔案選擇");
    assert.strictEqual(event.prevented, 1, "按鍵 " + pair[0] + " 應阻止預設捲動行為");
  });
  console.log("   ✓ Enter/Space 觸發驗證通過！\n");
}

console.log("3. 舊版 keyCode 32 應可作為 Space 的替代判斷...");
{
  const ctx = createDeps();
  const fileInput = helpers.createElement("input");
  ctx.elements.fileInput = fileInput;
  const event = makeKeyEvent(undefined, 32);
  ctx.imports.handleDropzoneKey(event);
  assert.strictEqual(fileInput.clicked, 1, "keyCode 32 應視為 Space");
  assert.strictEqual(event.prevented, 1);
  console.log("   ✓ keyCode 兜底驗證通過！\n");
}

console.log("4. 其他按鍵與缺少事件時不得觸發檔案選擇...");
{
  const ctx = createDeps();
  const fileInput = helpers.createElement("input");
  ctx.elements.fileInput = fileInput;
  ["Tab", "Escape", "ArrowDown"].forEach(function (key) {
    const event = makeKeyEvent(key, 0);
    ctx.imports.handleDropzoneKey(event);
    assert.strictEqual(event.prevented, 0, "按鍵 " + key + " 不應阻止預設行為");
  });
  ctx.imports.handleDropzoneKey(null);
  assert.strictEqual(fileInput.clicked, 0, "非 Enter/Space 不應開啟檔案對話框");
  console.log("   ✓ 忽略其他按鍵驗證通過！\n");
}

console.log("✓ 上傳區鍵盤可操作測試全數通過！\n");
