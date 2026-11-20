"use strict";

/**
 * webappEventBindings.test.js（task 6.2）
 * 驗證事件綁定單一守衛：bindOnce 冪等、delegate 以 selector 比對目標，
 * 以及 Symbol.for("mea.bindings") 跨模組共用。
 */

const assert = require("assert");
const bindings = require("../webapp/js/eventBindings.js");

/** 建立具資料屬性的假元素。 */
function makeElement(attributes, parent) {
  const attrs = attributes || {};
  return {
    attrs: attrs,
    parentNode: parent || null,
    hasAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attrs, name);
    },
    getAttribute: function (name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null;
    },
    matches: function (selector) {
      if (selector.charAt(0) === "[") {
        const name = selector.slice(1, -1);
        return Object.prototype.hasOwnProperty.call(attrs, name);
      }
      return attrs.tag === selector;
    },
    closest: function (selector) {
      let node = this;
      while (node) {
        if (node.matches(selector)) return node;
        node = node.parentNode;
      }
      return null;
    }
  };
}

/** 建立可記錄 addEventListener 的假容器。 */
function makeContainer() {
  const handlers = {};
  const container = {
    handlers: handlers,
    addEventListener: function (type, handler) {
      handlers[type] = handler;
    },
    contains: function (element) {
      let node = element;
      while (node) {
        if (node === container) return true;
        node = node.parentNode;
      }
      return false;
    }
  };
  return container;
}

function run() {
  console.log("1. 全域索引應使用共用 Symbol...");
  assert.strictEqual(bindings.BINDINGS_KEY, Symbol.for("mea.bindings"));
  console.log("   ✓ 共用 Symbol 驗證通過！\n");

  console.log("2. bindOnce 應只綁定一次，不同 key 可分別綁定...");
  {
    const container = makeContainer();
    let calls = 0;
    const handler = function () {
      calls++;
    };
    assert.strictEqual(bindings.bindOnce(container, "click", handler), true);
    assert.strictEqual(bindings.bindOnce(container, "click", handler), false);
    assert.strictEqual(bindings.isBound(container, "click"), true);
    container.handlers.click();
    assert.strictEqual(calls, 1);
    assert.strictEqual(bindings.bindOnce(container, "click", handler, "other"), true);
    assert.strictEqual(bindings.isBound(container, "click", "other"), true);
    console.log("   ✓ bindOnce 冪等驗證通過！\n");
  }

  console.log("3. delegate 應以 selector 比對目標並以元素呼叫 handler...");
  {
    const container = makeContainer();
    const button = makeElement({ "data-action": "go" }, container);
    button.parentNode = container;
    container.contains = function (element) {
      return element === button || element === container;
    };
    let received = null;
    assert.strictEqual(
      bindings.delegate(container, "click", "[data-action]", function (event, element) {
        assert.strictEqual(this, button);
        received = { event: event, element: element };
      }),
      true
    );
    container.handlers.click({ target: button });
    assert.strictEqual(received.element, button);
    received = null;
    container.handlers.click({ target: container });
    assert.strictEqual(received, null, "非匹配目標不應觸發");
    console.log("   ✓ delegate selector 比對驗證通過！\n");
  }

  console.log("4. findDelegateTarget 應支援無 closest 的 fallback...");
  {
    const container = makeContainer();
    const child = {
      parentNode: null,
      matches: function () {
        return false;
      }
    };
    const target = {
      parentNode: child,
      matches: function (selector) {
        return selector === "[data-go]";
      },
      hasAttribute: function (name) {
        return name === "data-go";
      }
    };
    child.parentNode = target;
    assert.strictEqual(bindings.findDelegateTarget(container, child, "[data-go]"), target);
    assert.strictEqual(bindings.findDelegateTarget(container, null, "[data-go]"), null);
    console.log("   ✓ fallback 比對驗證通過！\n");
  }

  console.log("5. 缺少 addEventListener 的目標應安全略過...");
  {
    assert.strictEqual(
      bindings.bindOnce({}, "click", function () {}),
      false
    );
    assert.strictEqual(
      bindings.delegate(null, "click", "[data-go]", function () {}),
      false
    );
    console.log("   ✓ 缺少 DOM 方法容錯驗證通過！\n");
  }

  console.log("✓ webapp/js/eventBindings.js 事件綁定測試全數通過！\n");
}

run();
