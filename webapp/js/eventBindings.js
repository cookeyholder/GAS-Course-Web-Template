/**
 * @file eventBindings.js
 * @description 前端事件綁定單一守衛（task 6.2）：以 Symbol.for("mea.bindings")
 *              記錄已綁定元素，避免各模組各自使用全文件布林旗標造成衝突。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    MEA.eventBindings = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** 單一綁定守衛索引，跨模組共用同一 Symbol。 */
  const BINDINGS_KEY = typeof Symbol === "function" && Symbol.for ? Symbol.for("mea.bindings") : "__meaBindings";

  /** 取得元素上的綁定集合（不存在時建立）。 */
  function getBindingSet(target) {
    if (!target || (typeof target !== "object" && typeof target !== "function")) return null;
    if (!target[BINDINGS_KEY]) {
      try {
        target[BINDINGS_KEY] = new Set();
      } catch (e) {
        return null;
      }
    }
    return target[BINDINGS_KEY];
  }

  /** 針對單一元素綁定事件一次；重複呼叫不再綁定。 */
  function bindOnce(target, type, handler, key) {
    if (!target || typeof target.addEventListener !== "function") return false;
    const set = getBindingSet(target);
    if (!set) return false;
    const id = key ? type + ":" + key : type;
    if (set.has(id)) return false;
    set.add(id);
    target.addEventListener(type, handler);
    return true;
  }

  /** 查找事件目標中符合 selector 的元素（支援 closest 與 parentNode fallback）。 */
  function findDelegateTarget(target, origin, selector) {
    if (!origin) return null;
    if (typeof origin.closest === "function") return origin.closest(selector);
    let node = origin;
    while (node) {
      if (typeof node.matches === "function" && node.matches(selector)) return node;
      if (node === target) break;
      node = node.parentNode;
    }
    return null;
  }

  /** 事件委派：在 target 上監聽 type，命中 selector 後以該元素呼叫 handler。 */
  function delegate(target, type, selector, handler) {
    return bindOnce(
      target,
      type,
      function (event) {
        const element = findDelegateTarget(target, event && event.target, selector);
        if (!element) return undefined;
        return handler.call(element, event, element);
      },
      "delegate:" + type + ":" + selector
    );
  }

  /** 測試用：查詢元素是否已被標記綁定。 */
  function isBound(target, type, key) {
    const set = getBindingSet(target);
    if (!set) return false;
    return set.has(key ? type + ":" + key : type);
  }

  return {
    BINDINGS_KEY: BINDINGS_KEY,
    bindOnce: bindOnce,
    delegate: delegate,
    findDelegateTarget: findDelegateTarget,
    isBound: isBound
  };
});
