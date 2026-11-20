/**
 * @file wiring.js
 * @description 前端單一組裝點（task 6.1）：建立最小介面並注入各模組，
 *              取代各模組 UMD 外層自行建立實例與 app.js 的 invoke 服務定位器。
 *
 * 基礎服務（config／state／api／safeErrors／courseData／mock）仍由各自模組
 * 掛至 window.MEA；本檔最後載入，組裝 ui／auth／imports／courses／accounts／
 * activityLog 與 app controller，並回填全域別名以保留既有公開方法名稱與測試契約。
 */
(function (root) {
  "use strict";

  const win = typeof window !== "undefined" ? window : null;
  if (!win) return;

  const MEA = (root.MEA = root.MEA || {});
  const factories = MEA.factories || {};
  const doc = win.document;
  const setTimeoutFn = function (fn, ms) {
    return win.setTimeout(fn, ms);
  };

  /** 安全取得模組方法，缺失時回傳 null（自治守衛，集中一處）。 */
  function pickMethod(module, method) {
    return module && typeof module[method] === "function" ? module[method] : null;
  }

  /** 最小介面：基礎服務由 config／state／api／errorMessages／courseData 提供。 */
  const services = {
    config: MEA.config || {},
    state: MEA.state,
    setState: MEA.setState,
    subscribe: MEA.subscribe,
    api: MEA.api,
    safeErrors: MEA.safeErrors,
    courseData: MEA.courseData,
    window: win,
    document: doc,
    setTimeoutFn: setTimeoutFn
  };

  // 工廠以 options.MEA 取得相依；此處指向同一個最小介面活參考，
  // 使模組間交叉呼叫在執行期皆能解析已建立的模組。
  const deps = Object.assign({ MEA: services }, services);

  /** app 最後建立，因為它需要路由其他模組的 renderView／fetchList。 */
  const MODULE_ORDER = ["ui", "auth", "imports", "courses", "accounts", "activityLog"];
  MODULE_ORDER.forEach(function (name) {
    services[name] = factories[name] ? factories[name](deps) : MEA[name];
    MEA[name] = services[name];
  });

  /** navigation 最小介面：setTab 由 app controller 提供，renderNavbar 由 ui 提供。 */
  services.navigation = {
    setTab: null,
    renderNavbar: pickMethod(services.ui, "renderNavbar")
  };

  /** views：各頁籤 renderView，集中注入 app controller。 */
  services.views = {
    overview: pickMethod(services.ui, "renderOverviewView"),
    import: pickMethod(services.imports, "renderView"),
    courses: pickMethod(services.courses, "renderView"),
    settings: pickMethod(services.accounts, "renderView"),
    activityLog: pickMethod(services.activityLog, "renderView")
  };
  deps.navigation = services.navigation;
  deps.views = services.views;

  const app = factories.app ? factories.app(deps) : null;
  if (app) {
    services.navigation.setTab = app.setTab;
    MEA.setTab = app.setTab;
    MEA.render = app.render;
    MEA.init = app.init;

    if (doc.readyState === "loading") {
      doc.addEventListener("DOMContentLoaded", app.init);
    } else {
      app.init();
    }
  }
  MEA.factories = factories;
})(typeof globalThis !== "undefined" ? globalThis : this);
