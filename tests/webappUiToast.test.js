"use strict";

/**
 * webapp/js/ui.js::toast 單元測試（G7.16）。
 * 驗證種類圖示、預設/自訂停留時間、DOM 結構、顯示與移除計時。
 */

const assert = require("assert");
const uiModule = require("../webapp/js/ui.js");
const helpers = require("./helpers/importsUiDeps.js");
const createDeps = helpers.createUiDeps;
const createDocument = helpers.createDocument;

console.log("開始執行 webapp/js/ui.js toast 測試...\n");

function withHost() {
  const ctx = createDeps();
  ctx.elements.toastHost = helpers.createElement("div");
  return ctx;
}

function run() {
  assert.strictEqual(typeof uiModule.resolveToastKind, "function", "應匯出種類解析函式");
  assert.strictEqual(typeof uiModule.createToastElement, "function", "應匯出元素建立函式");
  assert.strictEqual(uiModule.resolveToastKind("ok"), "ok");
  assert.strictEqual(uiModule.resolveToastKind("err"), "err");
  assert.strictEqual(uiModule.resolveToastKind("warn"), "warn");
  assert.strictEqual(uiModule.resolveToastKind("未知"), "info");
  assert.strictEqual(uiModule.resolveToastIcon("ok"), "✓");
  assert.strictEqual(uiModule.resolveToastIcon("err"), "✕");
  assert.strictEqual(uiModule.resolveToastIcon("warn"), "⚠");
  assert.strictEqual(uiModule.resolveToastIcon("info"), "ℹ");
  assert.strictEqual(uiModule.resolveToastDuration("err", undefined), 5000);
  assert.strictEqual(uiModule.resolveToastDuration("ok", undefined), 3500);
  assert.strictEqual(uiModule.resolveToastDuration("err", 1234), 1234);
  console.log("1. 種類、圖示與停留時間解析 ✓\n");

  const kinds = [
    { type: "ok", className: "toast ok", icon: "✓" },
    { type: "err", className: "toast err", icon: "✕" },
    { type: "warn", className: "toast warn", icon: "⚠" },
    { type: "info", className: "toast info", icon: "ℹ" }
  ];
  kinds.forEach(function (item) {
    const ctx = withHost();
    ctx.ui.toast("測試訊息", item.type);
    const t = ctx.elements.toastHost.children[0];
    assert.strictEqual(t.className, item.className);
    assert.strictEqual(t.children.length, 2);
    assert.strictEqual(t.children[0].className, "toast-icon");
    assert.strictEqual(t.children[0].textContent, item.icon);
    assert.strictEqual(t.children[1].className, "toast-msg");
    assert.strictEqual(t.children[1].textContent, "測試訊息");
    assert.strictEqual(ctx.calls.timeouts[0].ms, 10);
    assert.strictEqual(ctx.calls.timeouts[1].ms, item.type === "err" ? 5000 : 3500);
  });
  console.log("2. 四種 Toast 的 class、圖示、訊息與預設計時 ✓\n");

  const timed = withHost();
  timed.ui.toast("自訂時間", "ok", 777);
  assert.strictEqual(timed.calls.timeouts[1].ms, 777);

  const stringDuration = withHost();
  stringDuration.ui.toast("字串時間", "ok", "999");
  assert.strictEqual(stringDuration.calls.timeouts[1].ms, 3500);

  const node = timed.elements.toastHost.children[0];
  timed.calls.timeouts[0].fn();
  assert.strictEqual(node.classList.contains("visible"), true);
  timed.calls.timeouts[1].fn();
  assert.strictEqual(node.classList.contains("visible"), false);
  assert.strictEqual(timed.calls.timeouts[2].ms, 300);
  timed.calls.timeouts[2].fn();
  assert.strictEqual(timed.elements.toastHost.children.length, 0);
  assert.strictEqual(node.parentNode, null);
  console.log("3. 自訂時間、顯示、淡出與移除計時 ✓\n");

  const missing = createDeps();
  assert.doesNotThrow(function () {
    missing.ui.toast("沒有掛載點", "err");
  });
  assert.strictEqual(missing.calls.timeouts.length, 0);

  const directDoc = createDocument().doc;
  const direct = uiModule.createToastElement(directDoc, "直接建立", "warn");
  assert.strictEqual(direct.className, "toast warn");
  assert.strictEqual(direct.children[1].textContent, "直接建立");
  console.log("4. 缺少掛載點與直接建立元素容錯 ✓\n");

  console.log("✓ webapp/js/ui.js toast 測試全數通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
