"use strict";

/**
 * scripts/languageCheck.js 的 collectFiles 回呼單元測試（G8.5）
 * 驗證遞迴收集、排除目錄與檔案、排序及注入檔案系統之行為。
 */

const assert = require("assert");
const path = require("path");
const helpers = require("./helpers/scriptsDeps.js");
const languageCheck = require("../scripts/languageCheck.js");

/**
 * 建立注入式 Directory 項目。
 *
 * @param {string} name - 名稱
 * @param {boolean} isDirectory - 是否為目錄
 * @returns {Object} 模擬項目
 */
function makeEntry(name, isDirectory) {
  return {
    name: name,
    isDirectory: function () {
      return isDirectory;
    },
    isFile: function () {
      return !isDirectory;
    }
  };
}

/**
 * 建立以路徑為鍵的注入式檔案系統。
 *
 * @param {Object} table - 目錄至項目的對照
 * @returns {{fs: Object, calls: Array}} 檔案系統與呼叫紀錄
 */
function makeFsStub(table) {
  const calls = [];
  return {
    calls: calls,
    fs: {
      readdirSync: function (directory, options) {
        calls.push({ directory: directory, options: options });
        const key = String(directory).replace(/\\/g, "/");
        return table[key] || [];
      }
    }
  };
}

console.log("開始執行 scripts/languageCheck.js::<anon method-4> 測試...\n");

console.log("1. 應匯出可測試的檔案收集函式...");
{
  assert.strictEqual(typeof languageCheck.collectFiles, "function", "應匯出 collectFiles");
  assert.strictEqual(typeof languageCheck.checkProject, "function", "應匯出 checkProject");
  console.log("   ✓ 匯出介面驗證通過！\n");
}

console.log("2. collectFiles 應遞迴收集目標副檔名並排序...");
{
  const project = helpers.createTempProject();
  try {
    project.write("webapp/z.js", "");
    project.write("webapp/a.md", "");
    project.write("webapp/skip.txt", "");
    project.write("webapp/sub/c.js", "");
    project.write("webapp/sub/deep/d.yaml", "");
    project.write("webapp/dir-like.js/e.js", "");
    assert.deepStrictEqual(languageCheck.collectFiles(project.webapp), [
      "a.md",
      "dir-like.js/e.js",
      "sub/c.js",
      "sub/deep/d.yaml",
      "z.js"
    ]);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 遞迴收集驗證通過！\n");
}

console.log("3. collectFiles 應排除指定目錄與檔案...");
{
  const project = helpers.createTempProject();
  try {
    project.write("webapp/keep.js", "");
    ["node_modules", "coverage", ".git", "dist", ".clasp", ".codegraph"].forEach(function (dir) {
      project.write("webapp/" + dir + "/skip.js", "");
    });
    ["AGENTS.md", "languageCheck.js", "package-lock.json", "index.html"].forEach(function (file) {
      project.write("webapp/" + file, "");
    });
    assert.deepStrictEqual(languageCheck.collectFiles(project.webapp), ["keep.js"]);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 排除規則驗證通過！\n");
}

console.log("3b. openspec 目錄應納入語言檢查，不再被排除...");
{
  const project = helpers.createTempProject();
  try {
    project.write("webapp/openspec/changes/add-activity-logging/proposal.md", "# 提案文件");
    project.write("webapp/openspec/specs/example/spec.md", "# 規格文件");
    assert.deepStrictEqual(languageCheck.collectFiles(project.webapp), [
      "openspec/changes/add-activity-logging/proposal.md",
      "openspec/specs/example/spec.md"
    ]);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ OpenSpec 納入檢查驗證通過！\n");
}

console.log("4. 注入檔案系統時應略過非檔案非目錄項目...");
{
  const table = {
    "/root": [
      makeEntry("z.js", false),
      makeEntry("a.md", false),
      makeEntry("folder", true),
      makeEntry("link", false),
      makeEntry("node_modules", true)
    ],
    "/root/folder": [makeEntry("inner.js", false), makeEntry("notes.txt", false)],
    "/root/node_modules": [makeEntry("skip.js", false)]
  };
  const stub = makeFsStub(table);
  assert.deepStrictEqual(languageCheck.collectFiles("/root", { fs: stub.fs }), ["a.md", "folder/inner.js", "z.js"]);
  assert.strictEqual(stub.calls.length, 2, "排除目錄不應被走訪");
  stub.calls.forEach(function (call) {
    assert.deepStrictEqual(call.options, { withFileTypes: true });
  });
  console.log("   ✓ 注入依賴驗證通過！\n");
}

console.log("5. 空目錄應回傳空陣列，讀取失敗則向外傳播...");
{
  const stub = makeFsStub({ "/empty": [] });
  assert.deepStrictEqual(languageCheck.collectFiles("/empty", { fs: stub.fs }), []);
  const failingFs = {
    readdirSync: function () {
      throw new Error("讀取失敗：missing");
    }
  };
  assert.throws(function () {
    languageCheck.collectFiles("/missing", { fs: failingFs });
  }, /讀取失敗/);
  console.log("   ✓ 空目錄與錯誤驗證通過！\n");
}

console.log("6. checkProject 應沿用 collectFiles 的結果回報違規...");
{
  const project = helpers.createTempProject();
  try {
    const bannedWord = String.fromCharCode(0x4ee3, 0x7801);
    project.write("webapp/good.js", 'const name = "測試";\n');
    project.write("webapp/bad.js", 'const word = "' + bannedWord + '";\n');
    const results = languageCheck.checkProject(project.webapp);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].file, "bad.js");
    const kinds = results[0].violations.map(function (item) {
      return item.kind;
    });
    assert(kinds.indexOf("簡體字") !== -1);
    assert(kinds.indexOf("中國用語") !== -1);
  } finally {
    project.cleanup();
  }
  console.log("   ✓ 專案檢查整合驗證通過！\n");
}

console.log("✓ scripts/languageCheck.js::<anon method-4> 測試全數通過！\n");
