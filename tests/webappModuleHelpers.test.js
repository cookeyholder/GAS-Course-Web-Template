"use strict";

/**
 * webappModuleHelpers.test.js（task 6.4）
 * 驗證共用 Node require 相容墊片與 safeErrors 注入解析順序。
 */

const assert = require("assert");
const moduleHelpers = require("../webapp/js/moduleHelpers.js");
const safeErrors = require("../webapp/js/errorMessages.js");

async function run() {
  console.log("1. 模組匯出與明確注入優先...");
  {
    assert.strictEqual(typeof moduleHelpers.resolveSafeErrors, "function");
    const custom = {
      resolveSafeMessage: function () {
        return "自訂";
      }
    };
    assert.strictEqual(moduleHelpers.resolveSafeErrors({ safeErrors: custom }), custom);
    console.log("   ✓ 明確注入驗證通過！\n");
  }

  console.log("2. MEA 包裹注入次之...");
  {
    const wrapped = {
      resolveSafeMessage: function () {
        return "包裹";
      }
    };
    assert.strictEqual(moduleHelpers.resolveSafeErrors({ MEA: { safeErrors: wrapped } }), wrapped);
    console.log("   ✓ MEA 注入驗證通過！\n");
  }

  console.log("3. 全域 safeErrors 做為備援...");
  {
    assert.strictEqual(moduleHelpers.resolveSafeErrors({}), safeErrors);
    console.log("   ✓ 全域備援驗證通過！\n");
  }

  console.log("4. 全域不存在時由 Node require 相容墊片載入...");
  {
    const previous = globalThis.MEA && globalThis.MEA.safeErrors;
    try {
      if (globalThis.MEA) delete globalThis.MEA.safeErrors;
      const resolved = moduleHelpers.resolveSafeErrors();
      assert.strictEqual(resolved, safeErrors, "Node 環境應回傳共用模組匯出的 safeErrors");
    } finally {
      if (globalThis.MEA && previous) globalThis.MEA.safeErrors = previous;
    }
    assert.strictEqual(safeErrors.resolveSafeMessage(new Error("機密堆疊"), "備援"), "備援");
    assert.strictEqual(safeErrors.resolveSafeMessage({ message: "安全文案" }, "備援"), "安全文案");
    console.log("   ✓ Node require 墊片與單一轉譯定義驗證通過！\n");
  }

  console.log("✓ webapp/js/moduleHelpers.js 共用轉接層測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
