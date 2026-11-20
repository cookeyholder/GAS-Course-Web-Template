"use strict";

/**
 * 前端無障礙結構測試（task 4.2）。
 * 驗證跳過連結、地標語意、鍵盤操作、表單 ARIA、live region、inert 與減少動態規則。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const harness = require("./helpers/a11yHarness.js");
const uiModule = require("../webapp/js/ui.js");

const ROOT = path.join(__dirname, "..");
const INDEX_HTML = fs.readFileSync(path.join(ROOT, "webapp", "index.html"), "utf8");
const CSS_TEXT = fs.readFileSync(path.join(ROOT, "webapp", "styles.css"), "utf8");

/**
 * 建立已渲染指定狀態的前端 DOM。
 *
 * @param {Object} [stateOverrides] - 疊加至 MEA.state 的欄位
 * @param {string} [setup] - 額外操作（addAccountPrompt）
 * @returns {Object} dom、document 與前端 context
 */
function renderState(stateOverrides, setup) {
  const dom = harness.createA11yDocument("light");
  const doc = harness.resetDocument(dom, "light");
  const context = harness.createFrontend(dom, stateOverrides);
  context.app.render();
  if (setup === "addAccountPrompt") context.MEA.accounts.addAccountPrompt();
  return { dom: dom, doc: doc, context: context };
}

function run() {
  console.log("1. 跳過連結與主要內容地標...");
  assert(INDEX_HTML.indexOf('<a class="skip-link" href="#main-content">跳至主要內容</a>') !== -1, "骨架應有跳過連結");
  const overview = renderState({ view: "ready", tab: "overview" });
  const main = overview.doc.querySelector("main#main-content");
  assert(main !== null, "應有 #main-content 主要地標");
  assert.strictEqual(main.getAttribute("tabindex"), "-1", "主要內容應可程式聚焦");
  assert(CSS_TEXT.indexOf(".skip-link") !== -1, "應定義 .skip-link 樣式");
  assert(CSS_TEXT.indexOf(".skip-link:focus") !== -1, "跳過連結聚焦時應可見");
  console.log("   ✓ 跳過連結與 main 驗證通過！\n");

  console.log("2. 導覽名稱與目前頁籤語意...");
  assert(overview.doc.querySelector('nav[aria-label="主要導覽"]') !== null, "nav 應有可讀名稱");
  const currentTabs = overview.doc.querySelectorAll(".nav-tab[aria-current='page']");
  assert.strictEqual(currentTabs.length, 1, "應僅有目前的頁籤標示 aria-current");
  assert.strictEqual(currentTabs[0].textContent.replace(/\s+/g, "").indexOf("概覽") !== -1, true, "目前頁籤應為概覽");
  console.log("   ✓ 導覽地標與 aria-current 驗證通過！\n");

  console.log("3. 首頁功能卡片為可鍵盤操作按鈕...");
  const featureButtons = overview.doc.querySelectorAll("button.feature-item[type='button']");
  assert.strictEqual(featureButtons.length, 3, "應有三個功能卡片按鈕");
  const featureTitles = ["課程代碼匯入與 1NF 正規化", "正規化課程檢索與分頁", "系統設定與授權管理 (RBAC)"];
  featureButtons.forEach(function (button, index) {
    const title = button.querySelector("h4");
    assert(title !== null, "功能卡片應有標題做為可讀名稱");
    assert(title.textContent === featureTitles[index], "功能卡片標題應符合預期");
    assert.strictEqual(button.getAttribute("data-ui-action"), "set-tab", "功能卡片應保留切換頁籤行為");
    assert(button.getAttribute("data-tab"), "功能卡片應標註目標頁籤");
  });
  console.log("   ✓ 功能卡片按鈕驗證通過！\n");

  console.log("4. 裝飾性圖示 aria-hidden...");
  assert(overview.doc.querySelector(".brand-mark[aria-hidden='true']") !== null, "品牌圖示應隱藏");
  assert(overview.doc.querySelector(".nav-icon[aria-hidden='true']") !== null, "導覽圖示應隱藏");
  assert(overview.doc.querySelector(".feature-icon[aria-hidden='true']") !== null, "功能卡圖示應隱藏");
  const toastDoc = harness.createA11yDocument("light").window.document;
  const toastIcon = uiModule.createToastElement(toastDoc, "訊息", "info").querySelector(".toast-icon");
  assert(toastIcon !== null && toastIcon.getAttribute("aria-hidden") === "true", "Toast 圖示應隱藏");
  console.log("   ✓ 裝飾圖示驗證通過！\n");

  console.log("5. 登入錯誤與載入狀態 live region...");
  const login = renderState({ view: "login", loginError: "工作階段已過期" });
  assert(login.doc.querySelector(".login-alert[role='alert']") !== null, "登入錯誤應有 role=alert");
  const loading = renderState({ view: "loading" });
  const loadingCard = loading.doc.querySelector(".login-card[role='status']");
  assert(loadingCard !== null, "載入畫面應有 role=status");
  assert.strictEqual(loadingCard.getAttribute("aria-busy"), "true", "載入畫面應標示 aria-busy");
  console.log("   ✓ 狀態 live region 驗證通過！\n");

  console.log("6. 對話框背景 inert...");
  const modal = renderState({ view: "ready", tab: "settings" }, "addAccountPrompt");
  assert(modal.doc.querySelector(".modal-host [role='dialog']") !== null, "對話框應開啟");
  assert(modal.doc.querySelector(".app-nav[inert]") !== null, "導覽應被設為 inert");
  assert(modal.doc.querySelector(".app-content[inert]") !== null, "主要內容應被設為 inert");
  modal.context.MEA.ui.closeModal();
  assert.strictEqual(modal.doc.querySelector(".app-nav[inert]"), null, "關閉後應還原導覽");
  assert.strictEqual(modal.doc.querySelector(".app-content[inert]"), null, "關閉後應還原主要內容");
  console.log("   ✓ 對話框 inert 驗證通過！\n");

  console.log("7. 表單必填、提示關聯與表格標頭...");
  const settings = renderState({ view: "ready", tab: "settings" });
  assert(settings.doc.querySelector('[data-account-action="add"]') !== null, "應有新增授權帳號按鈕");
  settings.context.MEA.accounts.addAccountPrompt();
  const emailInput = settings.doc.getElementById("newAccountEmail");
  assert(emailInput !== null, "新增帳號表單應有 Email 欄位");
  assert(emailInput.hasAttribute("required"), "Email 應為必填");
  assert.strictEqual(emailInput.getAttribute("aria-required"), "true");
  assert(emailInput.getAttribute("aria-describedby").indexOf("newAccountEmailHint") !== -1, "Email 應關聯提示");
  assert(settings.doc.getElementById("newAccountEmailHint") !== null, "應有 Email 提示節點");
  assert(settings.doc.getElementById("newAccountEmailError") !== null, "應有 Email 錯誤節點");
  assert(settings.doc.getElementById("cfgClientIdHint") !== null, "Client Id 提示應有 id");
  const clientId = settings.doc.getElementById("cfgClientId");
  assert(clientId.getAttribute("aria-describedby") === "cfgClientIdHint", "Client Id 應關聯提示");
  assert(settings.doc.querySelectorAll("th[scope='col']").length >= 5, "表格標頭應有 scope=col");

  const courses = renderState({
    view: "ready",
    tab: "courses",
    courses: { list: [], page: 1, pageSize: 30, total: 0 }
  });
  assert(courses.doc.querySelectorAll("th[scope='col']").length === 10, "課程表格標頭應有 scope=col");
  console.log("   ✓ 表單 ARIA 與表格標頭驗證通過！\n");

  console.log("8. 欄位錯誤標記 aria-invalid...");
  const invalidCtx = renderState({ view: "ready", tab: "settings" }, "addAccountPrompt");
  const confirmButtons = invalidCtx.doc.querySelectorAll(".modal-footer button");
  let confirmButton = null;
  for (let i = 0; i < confirmButtons.length; i++) {
    if (confirmButtons[i].textContent === "新增") confirmButton = confirmButtons[i];
  }
  assert(confirmButton !== null, "對話框應有新增按鈕");
  confirmButton.click();
  const invalidEmail = invalidCtx.doc.getElementById("newAccountEmail");
  assert.strictEqual(invalidEmail.getAttribute("aria-invalid"), "true", "驗證失敗應標示 aria-invalid");
  const errorNode = invalidCtx.doc.getElementById("newAccountEmailError");
  assert(errorNode.textContent.length > 0, "應顯示欄位錯誤訊息");
  assert(errorNode.hasAttribute("hidden") === false, "錯誤訊息應可見");
  console.log("   ✓ 欄位錯誤語意驗證通過！\n");

  console.log("9. 減少動態效果與焦點可見性規則...");
  assert(CSS_TEXT.indexOf("@media (prefers-reduced-motion: reduce)") !== -1, "應支援減少動態偏好");
  assert(CSS_TEXT.indexOf("animation-duration: 0.01ms !important") !== -1, "應關閉動畫");
  assert(CSS_TEXT.indexOf(".stage3-diff-summary:focus-visible") !== -1, "應維持 focus-visible 可見性");
  assert(CSS_TEXT.indexOf(".modal-search-input:focus-visible") !== -1, "對話框輸入應維持 focus-visible");
  console.log("   ✓ 減少動態與焦點規則驗證通過！\n");

  console.log("✓ 前端無障礙結構測試全數通過！\n");
}

run();
