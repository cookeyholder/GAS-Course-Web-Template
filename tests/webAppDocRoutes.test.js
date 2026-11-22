"use strict";

const assert = require("assert");
const webApi = require("../webApi.js");

console.log("開始執行 Web App 文件路由單元測試...");

// 1. 白名單路由定義與解析
console.log("1. 驗證合法文件路徑解析...");
assert.strictEqual(typeof webApi.WEB_APP_DOC_ROUTES, "object");
assert.strictEqual(webApi.WEB_APP_DOC_ROUTE_PARAM, "page");

const userGuideRoute = webApi.resolveWebAppDocRoute("docs/user-guide.html");
assert(userGuideRoute !== null, "user-guide.html 應被成功解析");
assert.strictEqual(userGuideRoute.file, "docs/user-guide");
assert.strictEqual(userGuideRoute.title, "使用者操作手冊");

const indexRoute = webApi.resolveWebAppDocRoute("docs/index.html");
assert(indexRoute !== null, "index.html 應被成功解析");
assert.strictEqual(indexRoute.file, "docs/index");

// 支援 URL 編碼路徑解析
const encodedRoute = webApi.resolveWebAppDocRoute("docs%2Fuser-guide.html");
assert(encodedRoute !== null, "URL 編碼路徑應被成功解析");
assert.strictEqual(encodedRoute.file, "docs/user-guide");
console.log("   ✓ 合法文件路徑解析通過！");

// 2. 拒絕非法、危險或未登錄路徑
console.log("2. 驗證非白名單與危險路徑防禦...");
const invalidPaths = [
  "",
  null,
  undefined,
  "../secret.html",
  "docs/../../etc/passwd.html",
  "docs/\0bad.html",
  "/docs/user-guide.html",
  "C:/docs/user-guide.html",
  "docs/unknown-manual.html",
  "docs/user-guide.txt",
  "docs/user-guide.php"
];

invalidPaths.forEach(function (path) {
  assert.strictEqual(webApi.resolveWebAppDocRoute(path), null, "應拒絕無效或危險路徑: " + path);
});
console.log("   ✓ 危險路徑防禦通過！");

// 3. HtmlService 替身與 createWebAppDocResponse
console.log("3. 驗證 createWebAppDocResponse 與 404 回退...");
const originalHtmlService = globalThis.HtmlService;

try {
  let createdFile = "";
  let setOutputTitle = "";
  globalThis.HtmlService = {
    XFrameOptionsMode: { DEFAULT: "DEFAULT" },
    createHtmlOutputFromFile: function (file) {
      if (file === "docs/user-guide" || file === "docs-user-guide") {
        createdFile = file;
        return {
          setTitle: function (t) {
            setOutputTitle = t;
            return this;
          },
          setXFrameOptionsMode: function () {
            return this;
          }
        };
      }
      throw new Error("File not found: " + file);
    },
    createHtmlOutput: function (html) {
      return {
        html: html,
        setTitle: function (t) {
          setOutputTitle = t;
          return this;
        },
        setXFrameOptionsMode: function () {
          return this;
        }
      };
    }
  };

  // 測試成功取得手冊
  const resSuccess = webApi.createWebAppDocResponse("docs/user-guide.html");
  assert.strictEqual(createdFile, "docs/user-guide");
  assert.strictEqual(setOutputTitle, "使用者操作手冊");

  // 測試未知文件回傳安全 404
  const resNotFound = webApi.createWebAppDocResponse("docs/not-exist.html");
  assert.strictEqual(setOutputTitle, "找不到文件");

  // 測試 decodeURIComponent 拋錯容錯（畸形 URI 編碼）
  assert.strictEqual(webApi.resolveWebAppDocRoute("%E0%A4%A"), null, "畸形 URI 編碼應容錯回傳 null");

  // 測試 HtmlService 未定義時的回應
  delete globalThis.HtmlService;
  const noHtmlServiceRes = webApi.createWebAppDocResponse("docs/user-guide.html");
  assert.strictEqual(noHtmlServiceRes.ok, false);
  assert.strictEqual(noHtmlServiceRes.error, "service_unavailable");

  // 測試 HtmlService 缺少 createHtmlOutput 時 404 回退
  globalThis.HtmlService = {};
  const noOutputRes = webApi.createWebAppDocNotFoundOutput();
  assert.strictEqual(noOutputRes.ok, false);
  assert.strictEqual(noOutputRes.error, "not_found");

  // 還原並測試 createHtmlOutputFromFile 拋錯時的候選容錯與最終 404
  globalThis.HtmlService = {
    createHtmlOutputFromFile: function () {
      throw new Error("Simulated file error");
    },
    createHtmlOutput: function () {
      return {
        setTitle: function (t) {
          setOutputTitle = t;
          return this;
        },
        setXFrameOptionsMode: function () {
          return this;
        }
      };
    },
    XFrameOptionsMode: { DEFAULT: "DEFAULT" }
  };
  const failRes = webApi.createWebAppDocResponse("docs/user-guide.html");
  assert.strictEqual(setOutputTitle, "找不到文件");

  // 還原為有效 HtmlService 供後續 doGet 測試
  globalThis.HtmlService = {
    createHtmlOutputFromFile: function (file) {
      createdFile = file;
      return {
        setTitle: function (t) {
          setOutputTitle = t;
          return this;
        },
        setXFrameOptionsMode: function () {
          return this;
        }
      };
    },
    XFrameOptionsMode: { DEFAULT: "DEFAULT" }
  };

  // 4. doGet 整合測試
  console.log("4. 驗證 doGet 派發文件路由...");
  const e = { parameter: { page: "docs/user-guide.html" } };
  createdFile = "";
  setOutputTitle = "";
  const doGetRes = webApi.doGet(e);
  assert(doGetRes !== null);
  assert.strictEqual(createdFile, "docs/user-guide");
  assert.strictEqual(setOutputTitle, "使用者操作手冊");
  console.log("   ✓ doGet 派發驗證通過！");
} finally {
  globalThis.HtmlService = originalHtmlService;
}

console.log("✓ Web App 文件路由單元測試全數通過！");
