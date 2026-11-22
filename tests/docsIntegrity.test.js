"use strict";

/**
 * 技術手冊與文件白名單路由完整性單元測試（Task 4.1）
 * 驗證 WEB_APP_DOC_ROUTES 白名單檔案存在、docs/index.html 導覽完整性、
 * 手冊間內部連結無死鏈，以及繁體中文 HTML 語言標籤宣告。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");
const DOCS_DIR = path.join(PROJECT_ROOT, "docs");

console.log("開始執行技術手冊與文件白名單路由完整性測試...\n");

// 載入 webApi 模組取得 WEB_APP_DOC_ROUTES
const webApi = require(path.join(PROJECT_ROOT, "webApi.js"));

console.log("1. 驗證 WEB_APP_DOC_ROUTES 白名單映射檔案皆實體存在...");
{
  assert(
    webApi.WEB_APP_DOC_ROUTES && typeof webApi.WEB_APP_DOC_ROUTES === "object",
    "webApi.WEB_APP_DOC_ROUTES 必須存在且為物件"
  );

  const routeKeys = Object.keys(webApi.WEB_APP_DOC_ROUTES);
  assert(routeKeys.length >= 7, "WEB_APP_DOC_ROUTES 應至少定義 7 個白名單路由");

  routeKeys.forEach(function (routeKey) {
    const entry = webApi.WEB_APP_DOC_ROUTES[routeKey];
    assert(
      entry && typeof entry === "object" && typeof entry.file === "string",
      "白名單項目 [" + routeKey + "] 必須包含有效的 entry 與 file 屬性"
    );
    const keyPath = path.join(PROJECT_ROOT, routeKey);
    const filePath = path.join(PROJECT_ROOT, entry.file + ".html");
    assert(fs.existsSync(keyPath), "白名單路由 key 指向之檔案不存在：" + routeKey);
    assert(fs.existsSync(filePath), "白名單 entry.file 指向之實體檔案不存在：" + entry.file + ".html");
  });
  console.log("   ✓ 白名單路由檔案全數實體存在！\n");
}

console.log("2. 驗證 docs/index.html 導覽卡片覆蓋所有白名單手冊頁面...");
{
  const indexHtml = fs.readFileSync(path.join(DOCS_DIR, "index.html"), "utf8");
  const expectedDocFiles = [
    "architecture-guide.html",
    "clasp-guide.html",
    "course-normalization-guide.html",
    "gis-login-guide.html",
    "rbac-guide.html",
    "user-guide.html"
  ];

  expectedDocFiles.forEach(function (docFile) {
    const hrefPattern = new RegExp("href=[\"']" + docFile + "[\"']");
    assert(hrefPattern.test(indexHtml), "docs/index.html 應包含指向 " + docFile + " 的卡片連結");
  });
  console.log("   ✓ docs/index.html 導覽卡片完整覆蓋！\n");
}

console.log("3. 驗證所有手冊 HTML 內部相對超連結皆真實存在（零死鏈）...");
{
  const docFiles = fs.readdirSync(DOCS_DIR).filter(function (file) {
    return file.endsWith(".html");
  });

  assert(docFiles.length >= 7, "docs/ 目錄下應至少有 7 個 HTML 手冊檔案");

  let checkedLinksCount = 0;

  docFiles.forEach(function (docFile) {
    const filePath = path.join(DOCS_DIR, docFile);
    const content = fs.readFileSync(filePath, "utf8");
    const hrefRegex = /<a\s+[^>]*href=["']([^"']+)["']/gi;
    let match;

    while ((match = hrefRegex.exec(content)) !== null) {
      const link = match[1].trim();

      // 略過外部連結、純錨點與通訊協議
      if (
        link.startsWith("http://") ||
        link.startsWith("https://") ||
        link.startsWith("#") ||
        link.startsWith("mailto:") ||
        link.startsWith("javascript:")
      ) {
        continue;
      }

      // 移除錨點部分
      const linkPathWithoutHash = link.split("#")[0];
      if (!linkPathWithoutHash) {
        continue;
      }

      // 解析相對路徑
      const targetPath = path.resolve(DOCS_DIR, linkPathWithoutHash);
      assert(
        fs.existsSync(targetPath),
        docFile + " 中的超連結指向不存在的目標：" + link + " (解析路徑: " + targetPath + ")"
      );
      checkedLinksCount++;
    }
  });

  assert(checkedLinksCount > 0, "應至少檢查並驗證了內部相對超連結");
  console.log("   ✓ 共檢查 " + checkedLinksCount + " 個內部超連結，全數確認無死鏈！\n");
}

console.log('4. 驗證所有手冊 HTML 具備臺灣繁體中文 lang="zh-TW" 宣告...');
{
  const docFiles = fs.readdirSync(DOCS_DIR).filter(function (file) {
    return file.endsWith(".html");
  });

  docFiles.forEach(function (docFile) {
    const filePath = path.join(DOCS_DIR, docFile);
    const content = fs.readFileSync(filePath, "utf8");
    assert(/<html[^>]*lang=["']zh-TW["']/i.test(content), docFile + ' 必須包含 lang="zh-TW" 語言標籤');
  });
  console.log("   ✓ 所有手冊 HTML 語言標籤檢驗通過！\n");
}

console.log("5. 驗證 docs/參考資料 官方課綱資料完整性...");
{
  const refDir = path.join(DOCS_DIR, "參考資料");
  const expectedRefFiles = ["科別代碼.csv", "科目固定編碼.csv", "README.md"];

  expectedRefFiles.forEach(function (file) {
    assert(fs.existsSync(path.join(refDir, file)), "docs/參考資料 必須包含官方資料檔案：" + file);
  });
  console.log("   ✓ 官方課綱參考資料檔案全數存在！\n");
}

console.log("✓ 技術手冊與文件白名單路由完整性測試全數通過！\n");
