"use strict";

/**
 * 對話框無障礙測試（task 3.3）。
 * 驗證 role/aria 語意、初始焦點、Esc 關閉、Tab 焦點陷阱與關閉後焦點還原。
 */

const assert = require("assert");
const uiModule = require("../webapp/js/ui.js");

function matches(el, selectors) {
  return selectors.some(function (selector) {
    if (selector === "a[href]") return el.tagName === "A" && el.getAttribute("href") !== null;
    if (selector === "[tabindex]") return el.getAttribute("tabindex") !== null;
    if (["button", "input", "select", "textarea"].indexOf(selector) !== -1) {
      return el.tagName === selector.toUpperCase();
    }
    return false;
  });
}

function createElement(tag, dom) {
  return {
    tagName: String(tag).toUpperCase(),
    id: "",
    className: "",
    textContent: "",
    innerHTML: "",
    attributes: {},
    children: [],
    parentNode: null,
    disabled: false,
    onclick: null,
    onkeydown: null,
    focused: 0,
    classList: {
      add: function () {},
      remove: function () {},
      contains: function () {
        return false;
      }
    },
    setAttribute: function (name, value) {
      this.attributes[name] = String(value);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(this.attributes, name) ? this.attributes[name] : null;
    },
    appendChild: function (child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    },
    removeChild: function (child) {
      const index = this.children.indexOf(child);
      if (index !== -1) this.children.splice(index, 1);
      child.parentNode = null;
      return child;
    },
    focus: function () {
      this.focused += 1;
      dom.state.activeElement = this;
    },
    querySelectorAll: function (selector) {
      const wanted = selector.split(",").map(function (part) {
        return part.trim();
      });
      const result = [];
      function walk(node) {
        node.children.forEach(function (child) {
          if (matches(child, wanted)) result.push(child);
          walk(child);
        });
      }
      walk(this);
      return result;
    }
  };
}

function createDom() {
  const dom = {
    created: [],
    elements: Object.create(null),
    state: { activeElement: null }
  };
  dom.doc = {
    get activeElement() {
      return dom.state.activeElement;
    },
    set activeElement(value) {
      dom.state.activeElement = value;
    },
    getElementById: function (id) {
      return dom.elements[id] || null;
    },
    createElement: function (tag) {
      const el = createElement(tag, dom);
      dom.created.push(el);
      return el;
    },
    addEventListener: function () {},
    removeEventListener: function () {}
  };
  return dom;
}

function setup() {
  const dom = createDom();
  dom.elements.modalHost = createElement("div", dom);
  dom.elements.modalHost.innerHTML = "";
  const closeBtn = createElement("button", dom);
  closeBtn.id = "modalCloseBtn";
  dom.elements.modalCloseBtn = closeBtn;
  const MEA = { config: {}, state: {} };
  const ui = uiModule.createUiModule({
    MEA: MEA,
    document: dom.doc,
    window: {},
    exposeInternals: true
  });
  MEA.ui = ui;
  return { dom: dom, ui: ui, closeBtn: closeBtn };
}

function findByClass(dom, className) {
  return dom.created.find(function (el) {
    return el.className === className;
  });
}

console.log("開始執行對話框無障礙測試...\n");

console.log("1. 對話框應具備 role、aria-modal、aria-labelledby 與標題 id...");
{
  const ctx = setup();
  ctx.ui.modal("新增授權成員", '<input id="newAccountEmail" />', [{ text: "取消" }, { text: "新增", primary: true }]);
  const overlay = findByClass(ctx.dom, "modal-overlay");
  const head = findByClass(ctx.dom, "modal-header");
  assert.strictEqual(overlay.getAttribute("role"), "dialog");
  assert.strictEqual(overlay.getAttribute("aria-modal"), "true");
  assert.strictEqual(overlay.getAttribute("aria-labelledby"), "meaModalTitle");
  assert(head.innerHTML.indexOf('id="meaModalTitle"') !== -1, "標題應有對應 id");
  console.log("   ✓ 對話框語意驗證通過！\n");
}

console.log("2. 開啟時應聚焦第一個可操作元素，且按鈕具備 type 與無障礙名稱...");
{
  const ctx = setup();
  ctx.ui.modal("新增授權成員", '<input id="newAccountEmail" />', [{ text: "取消" }, { text: "新增", primary: true }]);
  assert.strictEqual(ctx.closeBtn.focused, 1, "應聚焦關閉鈕");
  assert.strictEqual(ctx.dom.state.activeElement, ctx.closeBtn);
  const head = findByClass(ctx.dom, "modal-header");
  assert(head.innerHTML.indexOf('type="button" class="modal-close"') !== -1, "關閉鈕應標記 type=button");
  assert(head.innerHTML.indexOf('aria-label="關閉對話框"') !== -1, "關閉鈕應有無障礙名稱");
  const footButtons = ctx.dom.created.filter(function (el) {
    return el.tagName === "BUTTON" && el.className.indexOf("btn ") === 0;
  });
  assert.strictEqual(footButtons.length, 2);
  footButtons.forEach(function (button) {
    assert.strictEqual(button.getAttribute("type"), "button", "非提交按鈕應標記 type=button");
  });
  console.log("   ✓ 初始焦點與按鈕語意驗證通過！\n");
}

console.log("3. Esc 應關閉對話框並將焦點還原至觸發元素...");
{
  const ctx = setup();
  const trigger = createElement("button", ctx.dom);
  ctx.dom.state.activeElement = trigger;
  ctx.ui.modal("刪除成員", "<p>確認嗎？</p>", [{ text: "刪除" }]);
  const overlay = findByClass(ctx.dom, "modal-overlay");
  let prevented = 0;
  overlay.onkeydown({
    key: "Escape",
    preventDefault: function () {
      prevented += 1;
    }
  });
  assert.strictEqual(ctx.dom.elements.modalHost.innerHTML, "", "對話框應被關閉");
  assert.strictEqual(ctx.dom.state.activeElement, trigger, "焦點應回到觸發元素");
  assert.strictEqual(prevented, 1, "應阻止預設行為");
  console.log("   ✓ Esc 關閉與焦點還原驗證通過！\n");
}

console.log("4. Tab 應在對話框內循環，不逸出至背景內容...");
{
  const ctx = setup();
  ctx.ui.modal("新增授權成員", '<input id="newAccountEmail" />', [{ text: "取消" }, { text: "新增", primary: true }]);
  const overlay = findByClass(ctx.dom, "modal-overlay");
  const body = findByClass(ctx.dom, "modal-body");
  const input = createElement("input", ctx.dom);
  input.id = "newAccountEmail";
  body.appendChild(input);
  const footButtons = ctx.dom.created.filter(function (el) {
    return el.tagName === "BUTTON" && el.className.indexOf("btn ") === 0;
  });
  const last = footButtons[footButtons.length - 1];

  last.focus();
  let prevented = 0;
  overlay.onkeydown({
    key: "Tab",
    preventDefault: function () {
      prevented += 1;
    }
  });
  assert.strictEqual(ctx.dom.state.activeElement, ctx.closeBtn, "末項 Tab 應回到首項");
  assert.strictEqual(prevented, 1);

  ctx.closeBtn.focus();
  overlay.onkeydown({
    key: "Tab",
    shiftKey: true,
    preventDefault: function () {
      prevented += 1;
    }
  });
  assert.strictEqual(ctx.dom.state.activeElement, last, "首項 Shift+Tab 應跳到末項");

  input.focus();
  const before = prevented;
  overlay.onkeydown({
    key: "Tab",
    preventDefault: function () {
      prevented += 1;
    }
  });
  assert.strictEqual(prevented, before, "中間元素不應攔截 Tab");
  console.log("   ✓ Tab 焦點陷阱驗證通過！\n");
}

console.log("5. 點擊遮罩背景應可關閉對話框...");
{
  const ctx = setup();
  ctx.ui.modal("提示", "<p>內容</p>");
  const overlay = findByClass(ctx.dom, "modal-overlay");
  overlay.onclick({ target: overlay });
  assert.strictEqual(ctx.dom.elements.modalHost.innerHTML, "");
  console.log("   ✓ 遮罩關閉驗證通過！\n");
}

console.log("6. 可聚焦元素收集應容忍無效根節點與異常節點...\n");
{
  const ctx = setup();
  assert.deepStrictEqual(ctx.ui.collectFocusableElements(null), [], "空根節點應回傳空陣列");
  assert.deepStrictEqual(ctx.ui.collectFocusableElements({}), [], "缺少 querySelectorAll 應回傳空陣列");
  const noAttributeNode = { tagName: "BUTTON", disabled: false };
  const disabledNode = { tagName: "BUTTON", disabled: true, getAttribute: () => null };
  const skipTabNode = {
    tagName: "DIV",
    disabled: false,
    getAttribute: (name) => (name === "tabindex" ? "-1" : null)
  };
  const root = {
    querySelectorAll: function () {
      return [noAttributeNode, disabledNode, skipTabNode];
    }
  };
  assert.deepStrictEqual(
    ctx.ui.collectFocusableElements(root),
    [noAttributeNode],
    "禁用與 tabindex=-1 節點應被略過，缺少 getAttribute 的節點仍保留"
  );
  console.log("   ✓ 可聚焦元素收集防禦路徑通過！\n");
}

console.log("7. 沒有關閉鈕與可聚焦元素時，Tab 不應產生錯誤...\n");
{
  const dom = createDom();
  dom.elements.modalHost = createElement("div", dom);
  dom.elements.modalHost.innerHTML = "";
  const MEA = { config: {}, state: {} };
  const ui = uiModule.createUiModule({
    MEA: MEA,
    document: dom.doc,
    window: {},
    exposeInternals: true
  });
  MEA.ui = ui;
  ui.modal("空對話框", "<p>沒有可聚焦元素</p>", []);
  const overlay = findByClass(dom, "modal-overlay");
  assert.strictEqual(dom.state.activeElement, null, "沒有可聚焦元素時不應設定焦點");
  let prevented = 0;
  overlay.onkeydown({
    key: "Tab",
    preventDefault: function () {
      prevented += 1;
    }
  });
  assert.strictEqual(prevented, 0, "空對話框不應攔截 Tab");
  console.log("   ✓ 空對話框防禦路徑通過！\n");
}

console.log("8. 鍵盤事件缺少事件、按鍵或為其他按鍵時應安全忽略...\n");
{
  const ctx = setup();
  ctx.ui.modal("提示", "<p>內容</p>");
  const overlay = findByClass(ctx.dom, "modal-overlay");
  overlay.onkeydown(null);
  overlay.onkeydown({ keyCode: 9, preventDefault: () => {} });
  overlay.onkeydown({ key: "a", keyCode: 65, preventDefault: () => {} });
  overlay.onkeydown({ key: "Tab", keyCode: 0, preventDefault: () => {} });
  assert(findByClass(ctx.dom, "modal-overlay"), "非 Escape 按鍵不應關閉對話框");
  console.log("   ✓ 鍵盤事件防禦路徑通過！\n");
}

console.log("✓ 對話框無障礙測試全數通過！\n");
