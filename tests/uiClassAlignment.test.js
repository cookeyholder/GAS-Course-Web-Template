"use strict";

/**
 * UI class 與 CSS 對齊檢查測試（task 3.1）。
 * 驗證檢查腳本能正確解析三種 class 來源，並確保專案目前沒有未定義 class。
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const checker = require("../scripts/checkUiClasses.js");

async function run() {
  console.log("1. 實際專案不應存在未定義的 UI class...");
  assert.deepStrictEqual(checker.findMissingClasses(), [], "所有前端 class 都應有 CSS 定義");
  console.log("   ✓ 專案 class 對齊驗證通過！\n");

  console.log("2. CSS 解析應忽略註解並支援複合選擇器...");
  {
    const defined = checker.collectDefinedClasses("/* .ghost {} */\n.btn.secondary {}\n.table th {}");
    assert(defined.has("btn"));
    assert(defined.has("secondary"));
    assert(defined.has("table"));
    assert(!defined.has("ghost"), "註解內的 class 不應計入定義");
  }
  console.log("   ✓ CSS 解析驗證通過！\n");

  console.log("3. class 使用解析應涵蓋 class、className 與 classList...");
  {
    const source = [
      '<div class="foo bar"></div>',
      'element.className = "baz";',
      'element.classList.add("qux");',
      'element.classList.remove("quux");',
      'element.classList.toggle("corge");'
    ].join("\n");
    const used = checker.collectUsedClasses(source);
    ["foo", "bar", "baz", "qux", "quux", "corge"].forEach(function (className) {
      assert(used.has(className), "應解析出 class：" + className);
    });
  }
  console.log("   ✓ class 使用解析驗證通過！\n");

  console.log("4. 注入缺少定義的暫存專案應被正確檢出...");
  {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ui-classes-"));
    try {
      fs.mkdirSync(path.join(tempRoot, "webapp", "js"), { recursive: true });
      fs.writeFileSync(path.join(tempRoot, "webapp", "styles.css"), ".defined {}\n");
      fs.writeFileSync(
        path.join(tempRoot, "webapp", "js", "demo.js"),
        'element.className = "defined missing";\nelement.classList.add("also-missing");\n'
      );
      const missing = checker.findMissingClasses({ root: tempRoot });
      assert.deepStrictEqual(
        missing.map(function (item) {
          return item.className;
        }),
        ["also-missing", "missing"]
      );
      assert.deepStrictEqual(missing[0].files, ["demo.js"]);
    } finally {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
  console.log("   ✓ 缺失檢出驗證通過！\n");

  console.log("✓ UI class 對齊檢查測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
