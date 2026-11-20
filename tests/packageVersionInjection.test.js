"use strict";

/**
 * packageVersionInjection.test.js（task 5.1）
 *
 * 驗證版本號單一來源：package.json → build-webapp.js → 前端注入與後端版本來源，
 * 且 gasRuntime／config／mock 皆優先使用注入值並退回固定值 1.1.0。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const helpers = require("./helpers/scriptsDeps.js");
const buildModule = require("../scripts/build-webapp.js");
const gasRuntime = require("../gasRuntime.js");

const ROOT = path.join(__dirname, "..");
const PACKAGE_VERSION = require("../package.json").version;

console.log("開始執行套件版本注入測試...\n");

console.log("1. package.json 版本應為 1.1.0...\n");
{
  assert.strictEqual(PACKAGE_VERSION, "1.1.0");
  console.log("   ✓ package.json 版本驗證通過！\n");
}

console.log("2. build 應從 package.json 注入 window.__PACKAGE_VERSION__ 並產生後端版本來源...\n");
{
  const project = helpers.createTempProject();
  try {
    project.write("package.json", JSON.stringify({ version: "2.3.4" }));
    project.write(
      "webapp/index.html",
      [
        "<!DOCTYPE html><html><head></head><body>",
        "<!-- BUILD:CSS --><!-- /BUILD:CSS -->",
        "<!-- BUILD:JS -->",
        '<script src="js/app.js"></script>',
        "<!-- /BUILD:JS -->",
        "</body></html>"
      ].join("\n")
    );
    project.write("webapp/styles.css", "body{}");
    project.write("webapp/js/app.js", "// app");

    const result = buildModule.build({ root: project.root });
    assert.strictEqual(result.version, "2.3.4");
    assert.strictEqual(result.versionGenerated, path.join(project.root, "version.generated.js"));

    const output = fs.readFileSync(result.output, "utf8");
    assert(output.indexOf('window.__PACKAGE_VERSION__ = "2.3.4";') !== -1, "HTML 應注入套件版本");

    const generated = fs.readFileSync(result.versionGenerated, "utf8");
    assert(generated.indexOf('const PACKAGE_VERSION = "2.3.4";') !== -1, "後端來源應含套件版本");
    assert(generated.indexOf("module.exports") !== -1, "後端來源應支援 Node 匯出");
    assert(generated.indexOf("globalThis.__PACKAGE_VERSION__") !== -1, "後端來源應掛載全域");
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 版本注入與後端來源驗證通過！\n");
}

console.log("3. build 缺少 package.json 或版本時應 fail-fast...\n");
{
  const project = helpers.createTempProject();
  try {
    fs.unlinkSync(path.join(project.root, "package.json"));
    assert.throws(function () {
      buildModule.build({ root: project.root });
    }, /找不到 package.json/);

    project.write("package.json", JSON.stringify({ version: "" }));
    assert.throws(function () {
      buildModule.build({ root: project.root });
    }, /缺少有效的 version/);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ fail-fast 驗證通過！\n");
}

console.log("4. gasRuntime.WEB_API_VERSION 應優先注入值並退回固定值...\n");
{
  const previous = globalThis.__PACKAGE_VERSION__;
  try {
    delete globalThis.__PACKAGE_VERSION__;
    assert.strictEqual(gasRuntime.WEB_API_VERSION, "1.1.0", "無注入時退回固定值");
    globalThis.__PACKAGE_VERSION__ = "9.8.7";
    assert.strictEqual(gasRuntime.WEB_API_VERSION, "9.8.7", "有注入時優先使用");
    globalThis.__PACKAGE_VERSION__ = "  ";
    assert.strictEqual(gasRuntime.WEB_API_VERSION, "1.1.0", "空白注入值應退回");
  } finally {
    if (previous === undefined) delete globalThis.__PACKAGE_VERSION__;
    else globalThis.__PACKAGE_VERSION__ = previous;
  }
  console.log("   ✓ gasRuntime 版本解析驗證通過！\n");
}

async function run() {
  console.log("5. config 透過 gasRuntime getter 取得注入版本，mock 衍生 -mock 後綴...\n");
  {
    const config = require("../webapp/js/config.js");
    const mock = require("../webapp/js/mock.js");

    // config 版本來自 gasRuntime.WEB_API_VERSION（getter 優先注入值），無注入時退回 1.1.0。
    assert.strictEqual(config.buildFrontendConfig({}).version, "1.1.0");
    const previous = globalThis.__PACKAGE_VERSION__;
    try {
      globalThis.__PACKAGE_VERSION__ = "3.2.1";
      assert.strictEqual(config.buildFrontendConfig({}).version, "3.2.1");
    } finally {
      if (previous === undefined) delete globalThis.__PACKAGE_VERSION__;
      else globalThis.__PACKAGE_VERSION__ = previous;
    }

    // mock 由 options.packageVersion 衍生 -mock 後綴，退回 1.1.0-mock。
    const immediateTimer = function (fn) {
      fn();
    };
    const defaultMock = mock.createMockApi({ setTimeoutFn: immediateTimer });
    const injectedMock = mock.createMockApi({ setTimeoutFn: immediateTimer, packageVersion: "5.5.5" });
    assert.strictEqual((await defaultMock.handle("ping")).version, "1.1.0-mock");
    assert.strictEqual((await injectedMock.handle("ping")).version, "5.5.5-mock");
  }
  console.log("   ✓ config/mock 版本驗證通過！\n");

  console.log("✓ packageVersionInjection.test.js 測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exitCode = 1;
});
