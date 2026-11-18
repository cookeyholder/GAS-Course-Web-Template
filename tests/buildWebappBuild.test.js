"use strict";

/**
 * scripts/build-webapp.js 的 build 單元測試（G8.4）
 * 以暫存專案驗證樣式與腳本內嵌順序、跳脫、錯誤訊息與輸出路徑，不覆蓋專案根 index.html。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const helpers = require("./helpers/scriptsDeps.js");
const buildModule = require("../scripts/build-webapp.js");

const TEMPLATE = [
  "<!DOCTYPE html>",
  '<html lang="zh-TW"><head><title>測試</title>',
  "<!-- BUILD:CSS -->",
  '<link rel="stylesheet" href="styles.css" />',
  "<!-- /BUILD:CSS -->",
  "</head><body>",
  "<!-- BUILD:JS -->",
  '<script src="js/first.js"></script>',
  '<script src="js/second.js"></script>',
  "<!-- /BUILD:JS -->",
  "</body></html>"
].join("\n");

/**
 * 建立含有基本樣板與腳本的暫存專案。
 *
 * @param {Object} [overrides] - 自訂樣板內容
 * @returns {Object} 暫存專案與寫入檔案路徑
 */
function createProject(overrides) {
  const settings = overrides || {};
  const project = helpers.createTempProject();
  const template = typeof settings.template === "string" ? settings.template : TEMPLATE;
  project.write("webapp/index.html", template);
  if (settings.skipCss !== true) {
    project.write("webapp/styles.css", "  .box { color: red; }\n");
  }
  if (settings.scripts !== false) {
    project.write("webapp/js/first.js", 'console.log("first");\n</script>');
    project.write("webapp/js/second.js", 'console.log("second");');
  }
  return project;
}

/**
 * 執行建置並保證清理暫存目錄。
 *
 * @param {Object} project - 暫存專案
 * @param {Object} [options] - 建置選項
 * @returns {Object} 建置結果與輸出內容
 */
function buildProject(project, options) {
  try {
    const result = buildModule.build(Object.assign({ root: project.root }, options || {}));
    return {
      result: result,
      output: fs.readFileSync(result.output, "utf8")
    };
  } finally {
    project.cleanup();
  }
}

console.log("開始執行 scripts/build-webapp.js::build 測試...\n");

console.log("1. 應匯出可測試的建置函式...");
{
  assert.strictEqual(typeof buildModule.build, "function", "應匯出 build");
  assert.strictEqual(typeof buildModule.createBuilder, "function", "應匯出 createBuilder");
  assert.strictEqual(typeof buildModule.escapeScript, "function", "應匯出 escapeScript");
  console.log("   ✓ 匯出介面驗證通過！\n");
}

console.log("2. escapeScript 應跳脫不分大小寫的結尾標籤...");
{
  assert.strictEqual(buildModule.escapeScript("a</script>b"), "a<\\/script>b");
  assert.strictEqual(buildModule.escapeScript("a</SCRIPT>b"), "a<\\/script>b");
  assert.strictEqual(buildModule.escapeScript("a<script>b"), "a<script>b");
  console.log("   ✓ 跳脫邏輯驗證通過！\n");
}

console.log("3. 正常建置應內嵌Css與依序內嵌Js...");
{
  const project = createProject();
  const built = buildProject(project);
  assert.strictEqual(built.result.output, path.join(project.root, "index.html"));
  assert.deepStrictEqual(built.result.scripts, ["js/first.js", "js/second.js"]);
  assert.strictEqual(built.result.bytes, Buffer.byteLength(built.output, "utf8"));
  assert(built.output.indexOf("<style>\n.box { color: red; }\n</style>") !== -1, "Css 應被包裹並去除前後空白");
  assert(built.output.indexOf('<link rel="stylesheet" href="styles.css" />') === -1, "原外部Css連結應被取代");
  const firstAt = built.output.indexOf("/* js/first.js */");
  const secondAt = built.output.indexOf("/* js/second.js */");
  assert(firstAt !== -1 && secondAt > firstAt, "腳本應按樣板順序內嵌");
  assert(built.output.indexOf("<\\/script>") !== -1, "腳本內容中的結尾標籤應被跳脫");
  assert(built.output.indexOf("<!-- 本檔由 scripts/build-webapp.js 自動產生，請勿直接編輯") !== -1, "應加入產生說明");
  assert(built.output.indexOf("<!-- BUILD:JS -->") === -1, "原有注入標記應被取代");
  console.log("   ✓ 正常建置驗證通過！\n");
}

console.log("4. 自訂輸出路徑時不應產生預設根目錄檔案...");
{
  const project = createProject();
  try {
    const result = buildModule.build({ root: project.root, output: path.join(project.root, "dist", "app.html") });
    assert.strictEqual(result.output, path.join(project.root, "dist", "app.html"));
    assert.strictEqual(fs.existsSync(result.output), true);
    assert.strictEqual(fs.existsSync(path.join(project.root, "index.html")), false);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 自訂輸出路徑驗證通過！\n");
}

console.log("5. 缺少樣板時應拋出明確錯誤...");
{
  const project = helpers.createTempProject();
  try {
    assert.throws(
      function () {
        buildModule.build({ root: project.root });
      },
      function (error) {
        return error.message.indexOf("找不到前端樣板：") === 0;
      }
    );
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 缺少樣板驗證通過！\n");
}

console.log("6. 缺少 BUILD:CSS 標記時應拋出錯誤...");
{
  const project = createProject({ template: "<html><head></head><body></body></html>" });
  try {
    assert.throws(function () {
      buildModule.build({ root: project.root });
    }, /index\.html 缺少 BUILD:CSS 標記/);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 缺少Css標記驗證通過！\n");
}

console.log("7. 缺少 BUILD:JS 標記時應拋出錯誤...");
{
  const project = createProject({
    template: "<html><head><!-- BUILD:CSS --><!-- /BUILD:CSS --></head><body></body></html>"
  });
  try {
    assert.throws(function () {
      buildModule.build({ root: project.root });
    }, /index\.html 缺少 BUILD:JS 標記/);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 缺少Js標記驗證通過！\n");
}

console.log("8. 找不到腳本檔案時應拋出錯誤...");
{
  const project = createProject({ scripts: false });
  try {
    assert.throws(function () {
      buildModule.build({ root: project.root });
    }, /找不到前端腳本：/);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 缺少腳本檔案驗證通過！\n");
}

console.log("9. BUILD:JS 區塊沒有 script src 時應拋出錯誤...");
{
  const project = createProject({
    template: TEMPLATE.replace(
      '<script src="js/first.js"></script>\n<script src="js/second.js"></script>',
      "<p>空的</p>"
    )
  });
  try {
    assert.throws(function () {
      buildModule.build({ root: project.root });
    }, /BUILD:JS 區塊中沒有任何 <script src>/);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 空腳本區塊驗證通過！\n");
}

console.log("10. 自訂樣板與樣式路徑時應使用注入的檔案...");
{
  const project = createProject({
    template: TEMPLATE.replace('<link rel="stylesheet" href="styles.css" />', "")
  });
  try {
    project.write("webapp/theme.css", "body { margin: 0; }");
    const customTemplate = TEMPLATE.replace('<link rel="stylesheet" href="styles.css" />', "");
    project.write("webapp/custom.html", customTemplate);
    const result = buildModule.build({
      root: project.root,
      template: path.join(project.webapp, "custom.html"),
      css: path.join(project.webapp, "theme.css")
    });
    const output = fs.readFileSync(result.output, "utf8");
    assert(output.indexOf("body { margin: 0; }") !== -1);
    assert(output.indexOf(".box { color: red; }") === -1);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 自訂路徑驗證通過！\n");
}

console.log("✓ scripts/build-webapp.js::build 測試全數通過！\n");
