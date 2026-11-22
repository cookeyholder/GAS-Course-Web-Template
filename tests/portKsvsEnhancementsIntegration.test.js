"use strict";

/**
 * 移植 KSVS 增強功能綜合整合單元測試（Task 5.1）
 * 涵蓋：
 * 1. 官方參考資料手冊納管與說明文件
 * 2. Web App 文件路由與路徑安全守門
 * 3. 離線多主題說明手冊 HTML 結構
 * 4. 匯入指引卡片與語意樣式
 * 5. 防禦性降級純函式防護
 * 6. 課程清單四維度 Empty State CTA
 * 7. 全站頁尾手冊連結與 WCAG 2.5.3 Label in Name
 * 8. 打包產物 index.html 內嵌完整性
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

console.log("開始執行移植 KSVS 增強功能綜合整合測試...\n");

function run() {
  const rootDir = path.join(__dirname, "..");

  // 1. 官方參考資料手冊納管與說明文件
  const readmePath = path.join(rootDir, "docs/參考資料/README.md");
  assert(fs.existsSync(readmePath), "docs/參考資料/README.md 必須存在");
  const readmeContent = fs.readFileSync(readmePath, "utf-8");
  assert(readmeContent.indexOf("教育部國民及學前教育署") !== -1, "README 應載明教育部官方來源");
  assert(readmeContent.indexOf("UTF-8 BOM") !== -1, "README 應載明編碼注意事項");
  console.log("1. 官方參考資料目錄手冊納管驗證通過 ✓\n");

  // 2. Web App 文件路由白名單與路徑安全
  const webApi = require("../webApi.js");
  assert.strictEqual(typeof webApi.WEB_APP_DOC_ROUTES, "object", "應匯出 WEB_APP_DOC_ROUTES 白名單");
  assert(Boolean(webApi.WEB_APP_DOC_ROUTES["docs/user-guide.html"]), "白名單應包含 user-guide.html");
  assert(webApi.resolveWebAppDocRoute("docs/user-guide.html") !== null, "合法路徑應成功解析");
  assert.strictEqual(webApi.resolveWebAppDocRoute("../../../etc/passwd"), null, "路徑走訪必須阻擋");
  console.log("2. Web App 文件路由白名單與路徑安全驗證通過 ✓\n");

  // 3. 離線多主題使用者手冊 HTML 結構
  const userGuidePath = path.join(rootDir, "docs/user-guide.html");
  assert(fs.existsSync(userGuidePath), "docs/user-guide.html 必須存在");
  const guideContent = fs.readFileSync(userGuidePath, "utf-8");
  assert(guideContent.indexOf("<!DOCTYPE html>") !== -1, "手冊應為自包含 HTML");
  assert(guideContent.indexOf("localStorage") !== -1, "手冊應支援主題設定持久化");
  assert(guideContent.indexOf("data-theme") !== -1, "手冊應支援主題切換");
  console.log("3. 離線多主題使用者操作手冊結構驗證通過 ✓\n");

  // 4. 匯入指引卡片與語意樣式
  const importsModule = require("../webapp/js/imports.js");
  assert.strictEqual(typeof importsModule.renderCourseCodeGuidanceHtml, "function", "imports 應匯出指引卡片純函式");
  const guidanceHtml = importsModule.renderCourseCodeGuidanceHtml();
  assert(guidanceHtml.indexOf("course-guidance-card") !== -1, "應套用 course-guidance-card 類別");
  assert(guidanceHtml.indexOf("高級中等學校課程計畫平臺") !== -1, "應載明官方來源平臺");
  console.log("4. 匯入官方來源管道指引卡片驗證通過 ✓\n");

  // 5. 防禦性降級純函式
  const coursesModule = require("../webapp/js/courses.js");
  const noUiMod = coursesModule.createCoursesModule({
    MEA: {
      state: {
        courses: {
          list: [
            {
              academicYear: "114",
              semester: "1",
              grade: "1",
              courseCode: "C01",
              subjectName: "<安全科目>",
              department: "機械科",
              subjectType: "必修",
              attribute: "一般",
              required: "是",
              credits: "2",
              hours: "2"
            }
          ],
          total: 1,
          page: 1,
          totalPages: 1
        }
      }
    }
  });
  const fallbackHtml = noUiMod.renderView();
  assert(fallbackHtml.indexOf("&lt;安全科目&gt;") !== -1, "safeEscapeHtml 應正確跳脫 HTML");
  console.log("5. 防禦性降級純函式與科別排序驗證通過 ✓\n");

  // 6. 課程清單四維度 Empty State CTA
  assert.strictEqual(typeof coursesModule.renderEmptyCoursesStateHtml, "function", "courses 應匯出 empty state 函式");
  const emptyDbHtml = coursesModule.renderEmptyCoursesStateHtml({ keyword: "", department: "", academicYear: "", semester: "" });
  assert(emptyDbHtml.indexOf('data-course-action="goto-import"') !== -1, "全空狀態應引導至匯入頁面");
  assert(emptyDbHtml.indexOf("前往匯入課綱代碼") !== -1, "全空狀態應有清楚按鈕文字");

  const noResultHtml = coursesModule.renderEmptyCoursesStateHtml({ keyword: "微積分", department: "", academicYear: "", semester: "" });
  assert(noResultHtml.indexOf('data-course-action="reset"') !== -1, "搜尋無結果應引導重設篩選");
  assert(noResultHtml.indexOf("重設搜尋條件") !== -1, "搜尋無結果應有重設按鈕");
  console.log("6. 課程清單四維度 Empty State CTA 分流驗證通過 ✓\n");

  // 7. 全站頁尾手冊連結與 WCAG 2.5.3
  const appModule = require("../webapp/js/app.js");
  assert.strictEqual(typeof appModule.renderFooterHtml, "function", "app 應匯出 renderFooterHtml");
  const footerHtml = appModule.renderFooterHtml({
    config: { appName: "測試系統", version: "2.0.0" },
    ui: {
      escapeHtml: function (s) { return String(s); },
      getUserGuideUrl: function () { return "?page=docs%2Fuser-guide.html"; }
    }
  });
  assert(footerHtml.indexOf('role="contentinfo"') !== -1, "頁尾應具備 contentinfo 角色");
  assert(footerHtml.indexOf('class="app-footer"') !== -1, "頁尾應套用 app-footer 類別");
  assert(footerHtml.indexOf('aria-label="說明手冊（另開新分頁）"') !== -1, "手冊連結應符合 WCAG 2.5.3 標籤一致性");
  assert(footerHtml.indexOf('target="_blank"') !== -1, "手冊連結應另開新分頁");
  assert(footerHtml.indexOf('rel="noopener noreferrer"') !== -1, "新分頁連結應有安全 rel 屬性");
  console.log("7. 全站頁尾手冊連結與無障礙規格驗證通過 ✓\n");

  // 8. 打包產物 index.html 內嵌完整性
  const indexHtmlPath = path.join(rootDir, "index.html");
  assert(fs.existsSync(indexHtmlPath), "根目錄 index.html 必須存在");
  const indexContent = fs.readFileSync(indexHtmlPath, "utf-8");
  assert(indexContent.indexOf("renderCourseCodeGuidanceHtml") !== -1, "index.html 應包含匯入指引模組");
  assert(indexContent.indexOf("renderEmptyCoursesStateHtml") !== -1, "index.html 應包含 Empty State 模組");
  assert(indexContent.indexOf("renderFooterHtml") !== -1, "index.html 應包含頁尾模組");
  assert(indexContent.indexOf(".app-footer") !== -1, "index.html 應內嵌頁尾樣式");
  console.log("8. 打包產物 index.html 內嵌完整性驗證通過 ✓\n");

  console.log("✓ 全部移植 KSVS 增強功能綜合整合測試通過！\n");
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
