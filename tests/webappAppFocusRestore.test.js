"use strict";

/**
 * 前端整塊重建焦點還原測試（task 2.7）。
 * 驗證 innerHTML 重建前記錄 activeElement.id 與選取範圍，重建後還原。
 */

const assert = require("assert");
const appModule = require("../webapp/js/app.js");
const createDeps = require("./helpers/appControllerDeps.js").createDeps;

function makeFocusTarget() {
  return {
    focused: 0,
    selection: null,
    focus: function () {
      this.focused += 1;
    },
    setSelectionRange: function (start, end) {
      this.selection = [start, end];
    }
  };
}

console.log("開始執行前端焦點還原測試...\n");

console.log("1. 沒有 activeElement 或缺少 id 時不產生快照...");
{
  const doc = {
    getElementById: function () {
      return null;
    }
  };
  assert.strictEqual(appModule.captureFocusState(doc, null), null);
  doc.activeElement = { tagName: "DIV" };
  assert.strictEqual(appModule.captureFocusState(doc, null), null);
  assert.strictEqual(appModule.captureFocusState(null, null), null);
  console.log("   ✓ 空快照驗證通過！\n");
}

console.log("2. 應記錄 id 與選取範圍，且略過掛載元素外的焦點...");
{
  const doc = {
    getElementById: function () {
      return null;
    },
    activeElement: { id: "courseSearchKeyword", selectionStart: 2, selectionEnd: 5 }
  };
  assert.deepStrictEqual(appModule.captureFocusState(doc, null), {
    id: "courseSearchKeyword",
    selectionStart: 2,
    selectionEnd: 5
  });
  const outsideMount = {
    contains: function () {
      return false;
    }
  };
  assert.strictEqual(appModule.captureFocusState(doc, outsideMount), null, "掛載元素外的焦點不應還原");
  console.log("   ✓ 快照內容與範圍驗證通過！\n");
}

console.log("3. 還原時應呼叫 focus 並設定選取範圍，元素不存在時安全略過...");
{
  const target = makeFocusTarget();
  const doc = {
    getElementById: function (id) {
      return id === "kw" ? target : null;
    }
  };
  appModule.restoreFocusState(doc, { id: "kw", selectionStart: 1, selectionEnd: 4 });
  assert.strictEqual(target.focused, 1);
  assert.deepStrictEqual(target.selection, [1, 4]);
  appModule.restoreFocusState(doc, { id: "missing" });
  appModule.restoreFocusState(null, { id: "kw" });
  appModule.restoreFocusState(doc, null);
  assert.strictEqual(target.focused, 1, "找不到元素時不應重複 focus");
  console.log("   ✓ 還原驗證通過！\n");
}

console.log("4. render 重建後應還原原輸入焦點...");
{
  const fixture = createDeps();
  const target = makeFocusTarget();
  fixture.deps.document.activeElement = { id: "courseSearchKeyword", selectionStart: 3, selectionEnd: 3 };
  const originalGetElementById = fixture.deps.document.getElementById;
  fixture.deps.document.getElementById = function (id) {
    if (id === "courseSearchKeyword") return target;
    return originalGetElementById(id);
  };
  fixture.state.view = "app";
  fixture.state.tab = "courses";
  fixture.MEA.courses.renderView = function () {
    return '<input id="courseSearchKeyword" />';
  };
  const controller = appModule.createAppController(fixture.deps);
  controller.render();
  assert.strictEqual(target.focused, 1, "重建後應重新 focus 原輸入框");
  assert.deepStrictEqual(target.selection, [3, 3], "重建後應還原輸入選取位置");
  console.log("   ✓ render 焦點還原驗證通過！\n");
}

console.log("✓ 前端焦點還原測試全數通過！\n");
