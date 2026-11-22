/**
 * @file ui.js
 * @description 網頁多風格主題、共用視覺元件、Toast 與對話框渲染
 *
 * 開發與測試環境可透過 createUiModule 注入 MEA、window、document 與計時器；
 * 瀏覽器環境仍組裝 window.MEA.ui，保留原有公開方法名稱與 DOM 事件。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    // task 6.1：僅註冊工廠，實例由 wiring.js 集中建立並注入最小介面。
    if (!MEA.factories) {
      MEA.factories = {};
    }
    MEA.factories.ui = api.createUiModule;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const DEFAULT_STYLE = "modern-slate";
  const MODAL_TITLE_ID = "meaModalTitle";
  /**
   * 角色代碼單一來源（task 5.3）：GAS 全域 gasRuntime 優先，Node 由 require 取得。
   * gasRuntime.js 在建置順序中早於本模組載入，故可安全取得。
   */
  const ROLE_CODES =
    (typeof globalThis !== "undefined" && globalThis.gasRuntime && globalThis.gasRuntime.ROLE_CODES) ||
    (typeof require === "function" ? require("../../gasRuntime.js").ROLE_CODES : null);

  /**
   * 跳脫 HTML 特殊字元。
   *
   * @param {*} value - 待跳脫值
   * @returns {string} 跳脫後字串
   */
  function escapeHtml(value) {
    return String(value === null || value === undefined ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /**
   * 格式化數字為繁體中文千分位。
   *
   * @param {*} value - 數值
   * @returns {string} 格式化後字串
   */
  function number(value) {
    const n = Number(value);
    return isFinite(n) ? n.toLocaleString("zh-TW") : "0";
  }

  /**
   * 依頁籤的管理員旗標與目前使用者角色判定頁籤是否可見。
   * 未標記 adminOnly 的頁籤一律可見；標記者僅 admin 角色可見。
   *
   * @param {Object} tab - 頁籤定義
   * @param {Object} user - 目前登入使用者（MEA.state.user）
   * @returns {boolean} 是否允許存取
   */
  function isTabAllowed(tab, user) {
    if (!tab || tab.adminOnly !== true) return true;
    return !!(user && ROLE_CODES && user.role === ROLE_CODES.ADMIN);
  }

  /**
   * 取得角色顯示名稱。
   *
   * @param {string} role - 角色代碼
   * @returns {string} 角色名稱
   */
  function roleName(role, config) {
    const names = (config && config.roleNames) || {};
    return names[String(role || "")] || String(role || "未授權");
  }

  /**
   * 輸出風格下拉選單。
   *
   * @param {Array} styles - 風格清單
   * @param {string} curStyle - 目前風格
   * @returns {string} option 標籤 HTML
   */
  function renderStyleOptions(styles, curStyle) {
    let html = "";
    for (let i = 0; i < styles.length; i++) {
      const s = styles[i];
      const selected = s.id === curStyle ? " selected" : "";
      html +=
        '<option value="' + escapeHtml(s.id) + '"' + selected + ">" + escapeHtml(s.icon + " " + s.name) + "</option>";
    }
    return html;
  }

  /**
   * 解析 Toast 種類。
   *
   * @param {string} type - 傳入種類
   * @returns {string} 正規化後種類
   */
  function resolveToastKind(type) {
    return type === "ok" ? "ok" : type === "err" ? "err" : type === "warn" ? "warn" : "info";
  }

  /**
   * 取得 Toast 圖示。
   *
   * @param {string} kind - 正規化後種類
   * @returns {string} 圖示文字
   */
  function resolveToastIcon(kind) {
    return kind === "ok" ? "✓" : kind === "err" ? "✕" : kind === "warn" ? "⚠" : "ℹ";
  }

  /**
   * 取得 Toast 停留時間。
   *
   * @param {string} kind - 正規化後種類
   * @param {*} duration - 可覆寫的毫秒數
   * @returns {number} 停留毫秒數
   */
  function resolveToastDuration(kind, duration) {
    if (typeof duration === "number") return duration;
    return kind === "err" ? 5000 : 3500;
  }

  /**
   * 取得 Toast 的無障礙角色；錯誤與警告使用 alert 以即時宣告。
   *
   * @param {string} kind - 正規化後種類
   * @returns {string|null} 角色名稱或 null
   */
  function resolveToastRole(kind) {
    return kind === "err" || kind === "warn" ? "alert" : null;
  }

  /**
   * 建立 Toast 元素。
   *
   * @param {Object} doc - document 依賴
   * @param {string} message - 訊息內容
   * @param {string} kind - 正規化後種類
   * @returns {Object} Toast 元素
   */
  function createToastElement(doc, message, kind) {
    const t = doc.createElement("div");
    t.className = "toast " + kind;

    const role = resolveToastRole(kind);
    if (role && typeof t.setAttribute === "function") t.setAttribute("role", role);

    const iconSpan = doc.createElement("span");
    iconSpan.className = "toast-icon";
    iconSpan.textContent = resolveToastIcon(kind);
    if (typeof iconSpan.setAttribute === "function") iconSpan.setAttribute("aria-hidden", "true");

    const textSpan = doc.createElement("span");
    textSpan.className = "toast-msg";
    textSpan.textContent = message;

    t.appendChild(iconSpan);
    t.appendChild(textSpan);
    return t;
  }

  /**
   * 安排 Toast 出現與消失計時。
   *
   * @param {Object} t - Toast 元素
   * @param {number} time - 停留毫秒數
   * @param {Function} setTimeoutFn - 計時函式
   */
  function scheduleToastRemoval(t, time, setTimeoutFn) {
    setTimeoutFn(function () {
      t.classList.remove("visible");
      setTimeoutFn(function () {
        if (t.parentNode) t.parentNode.removeChild(t);
      }, 300);
    }, time);
  }

  /**
   * 通用分頁純運算函式（含除零防禦、負數校正與切片起訖計算）。
   *
   * @param {number} totalItems - 總筆數
   * @param {number} currentPage - 目前頁碼
   * @param {number} pageSize - 每頁筆數
   * @returns {Object} 分頁視窗運算結果
   */
  function calculatePaginationWindow(totalItems, currentPage, pageSize) {
    const rawTotal = parseInt(totalItems, 10);
    const validTotal = Number.isFinite(rawTotal) && rawTotal > 0 ? rawTotal : 0;

    const rawSize = parseInt(pageSize, 10);
    const validSize = Number.isFinite(rawSize) && rawSize > 0 ? rawSize : 20;

    const totalPages = Math.max(1, Math.ceil(validTotal / validSize));

    const rawPage = parseInt(currentPage, 10);
    const validPage = Number.isFinite(rawPage) ? rawPage : 1;
    const clampedPage = Math.max(1, Math.min(totalPages, validPage));

    const startIndex = (clampedPage - 1) * validSize;
    const endIndex = Math.min(validTotal, startIndex + validSize);

    return {
      totalItems: validTotal,
      pageSize: validSize,
      totalPages: totalPages,
      currentPage: clampedPage,
      startIndex: startIndex,
      endIndex: endIndex,
      hasPrev: clampedPage > 1,
      hasNext: clampedPage < totalPages
    };
  }

  /**
   * 內部純輔助函式：產生每頁筆數下拉選單 HTML（圈複雜度 <= 3）
   */
  function renderPageSizeSelect_(opt, prefix, win, hasData) {
    if (!opt.onPageSizeChange && !opt.pageSizeAction) return "";
    const pageSizeOptions =
      Array.isArray(opt.pageSizeOptions) && opt.pageSizeOptions.length > 0 ? opt.pageSizeOptions : [10, 20, 50, 100];

    let optionsHtml = "";
    for (let i = 0; i < pageSizeOptions.length; i++) {
      const sz = pageSizeOptions[i];
      const sel = sz === win.pageSize ? " selected" : "";
      optionsHtml += '<option value="' + sz + '"' + sel + ">每頁 " + sz + " 筆</option>";
    }

    const handlerAttr = opt.onPageSizeChange
      ? ' onchange="' + escapeHtml(String(opt.onPageSizeChange).replace(/\{pageSize\}/g, "this.value")) + '"'
      : " " + escapeHtml(opt.pageSizeAction) + '="size"';

    const disabledAttr = !hasData || opt.disabled ? " disabled" : "";
    return (
      '<div style="display:inline-flex; align-items:center; gap:6px;">' +
      '  <label for="' +
      escapeHtml(prefix + "-size") +
      '" style="font-size:13.5px; color:var(--ink-2); white-space:nowrap;">每頁：</label>' +
      '  <select id="' +
      escapeHtml(prefix + "-size") +
      '" class="form-select form-select-sm" style="font-size:13px; padding:3px 6px; border-radius:4px;"' +
      handlerAttr +
      disabledAttr +
      ">" +
      optionsHtml +
      "  </select>" +
      "</div>"
    );
  }

  /**
   * 內部純輔助函式：產生快速跳頁下拉選單 HTML（圈複雜度 <= 3）
   */
  function renderPageJumpSelect_(opt, prefix, win, hasData, isSinglePage) {
    if (!opt.onPageChange && !opt.actionAttribute) return "";
    let optionsHtml = "";
    if (hasData) {
      for (let p = 1; p <= win.totalPages; p++) {
        const sel = p === win.currentPage ? " selected" : "";
        optionsHtml += '<option value="' + p + '"' + sel + ">第 " + p + " 頁</option>";
      }
    } else {
      optionsHtml = '<option value="1" selected>第 1 頁</option>';
    }

    const handlerAttr = opt.onPageChange
      ? ' onchange="' + escapeHtml(String(opt.onPageChange).replace(/\{page\}/g, "parseInt(this.value, 10)")) + '"'
      : " " + escapeHtml(opt.actionAttribute) + '="jump"';

    const disabledAttr = !hasData || isSinglePage || opt.disabled ? " disabled" : "";
    return (
      '<div style="display:inline-flex; align-items:center; gap:6px;">' +
      '  <label for="' +
      escapeHtml(prefix + "-jump") +
      '" style="font-size:13.5px; color:var(--ink-2); white-space:nowrap;">跳至：</label>' +
      '  <select id="' +
      escapeHtml(prefix + "-jump") +
      '" class="form-select form-select-sm" style="font-size:13px; padding:3px 6px; border-radius:4px;"' +
      handlerAttr +
      disabledAttr +
      ">" +
      optionsHtml +
      "  </select>" +
      "</div>"
    );
  }

  /**
   * 內部純輔助函式：產生單一導覽按鈕 HTML（圈複雜度 <= 3）
   */
  function renderNavBtn_(label, targetPage, disabled, ariaLabel, opt) {
    const pageNum = Number.isFinite(Number(targetPage)) ? Math.floor(Number(targetPage)) : 1;
    let actionAttrs = "";
    if (opt.actionAttribute) {
      actionAttrs = " " + escapeHtml(opt.actionAttribute) + '="page" data-page="' + pageNum + '"';
    } else if (opt.onPageChange) {
      const handler = String(opt.onPageChange).replace(/\{page\}/g, String(pageNum));
      actionAttrs = ' onclick="' + escapeHtml(handler) + '"';
    }
    const disAttr = disabled ? " disabled" : "";
    return (
      '<button type="button" class="btn secondary sm" style="font-size:13px; padding:4px 8px; line-height:1.2;"' +
      ' aria-label="' +
      escapeHtml(ariaLabel) +
      '"' +
      actionAttrs +
      disAttr +
      ">" +
      label +
      "</button>"
    );
  }

  /**
   * 內部純輔助函式：產生導覽按鈕組 HTML（圈複雜度 <= 4）
   */
  function renderPaginationNavButtons_(opt, prefix, win, hasData, isSinglePage) {
    if (!opt.onPageChange && !opt.actionAttribute) return "";
    const jumpSelectHtml = renderPageJumpSelect_(opt, prefix, win, hasData, isSinglePage);
    const isDisabledPrev = !win.hasPrev || opt.disabled === true;
    const isDisabledNext = !win.hasNext || opt.disabled === true;

    const firstBtn = renderNavBtn_("第一頁", 1, isDisabledPrev, "前往第一頁，共 " + win.totalPages + " 頁", opt);
    const prevBtn = renderNavBtn_(
      "上一頁",
      win.currentPage - 1,
      isDisabledPrev,
      "上一頁，目前第 " + win.currentPage + " 頁，共 " + win.totalPages + " 頁",
      opt
    );
    const nextBtn = renderNavBtn_(
      "下一頁",
      win.currentPage + 1,
      isDisabledNext,
      "下一頁，目前第 " + win.currentPage + " 頁，共 " + win.totalPages + " 頁",
      opt
    );
    const lastBtn = renderNavBtn_(
      "最末頁",
      win.totalPages,
      isDisabledNext,
      "前往最末頁，共 " + win.totalPages + " 頁",
      opt
    );

    return (
      '<div style="display:inline-flex; align-items:center; gap:4px;">' +
      firstBtn +
      prevBtn +
      jumpSelectHtml +
      nextBtn +
      lastBtn +
      "</div>"
    );
  }

  /**
   * 內部純輔助函式：產生統計字串 HTML（圈複雜度 <= 2）
   */
  function renderPaginationSummary_(win, itemLabel, opt) {
    if (typeof opt.summaryFormatter === "function") {
      return opt.summaryFormatter(win, itemLabel);
    }
    const label = itemLabel ? String(itemLabel).trim() : "筆紀錄";
    return (
      '<span class="pagination-info" style="font-size:13.5px; color:var(--ink-2); font-variant-numeric:tabular-nums; white-space:nowrap;" aria-live="polite">' +
      "共 " +
      number(win.totalItems) +
      " " +
      escapeHtml(label) +
      " · 第 " +
      win.currentPage +
      " / " +
      win.totalPages +
      " 頁" +
      '<span class="sr-only" aria-current="page">，目前第 ' +
      win.currentPage +
      " 頁</span>" +
      "</span>"
    );
  }

  /**
   * 通用純函式雙向分頁工具列元件
   */
  function renderPaginationBar(options) {
    const opt = options || {};
    const win = calculatePaginationWindow(opt.total, opt.page, opt.pageSize || 20);
    if (Number.isFinite(parseInt(opt.totalPages, 10)) && parseInt(opt.totalPages, 10) > 0) {
      win.totalPages = parseInt(opt.totalPages, 10);
    }
    if (Number.isFinite(parseInt(opt.page, 10)) && parseInt(opt.page, 10) > 0) {
      win.currentPage = Math.max(1, Math.min(win.totalPages, parseInt(opt.page, 10)));
    }
    win.hasNext = win.currentPage < win.totalPages;
    win.hasPrev = win.currentPage > 1;
    const position = opt.position === "top" ? "top" : "bottom";
    const prefix = (opt.idPrefix ? String(opt.idPrefix).trim() : "pagination") + "-" + position;
    const baseNavLabel = opt.navAriaLabel ? String(opt.navAriaLabel).trim() : "分頁導覽";
    const navAriaLabel = baseNavLabel + (position === "top" ? "（上方）" : "（下方）");
    const hasData = win.totalItems > 0;
    const isSinglePage = win.totalPages <= 1;

    const summaryHtml = renderPaginationSummary_(win, opt.itemLabel, opt);
    const pageSizeSelectHtml = renderPageSizeSelect_(opt, prefix, win, hasData);
    const navButtonsHtml = renderPaginationNavButtons_(opt, prefix, win, hasData, isSinglePage);

    const barClass = position === "top" ? "pagination-bar pagination-bar-top" : "pagination-bar pagination-bar-bottom";

    return (
      '<div class="' +
      barClass +
      '" role="navigation" aria-label="' +
      escapeHtml(navAriaLabel) +
      '" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px; margin: 8px 0; font-size:13.5px;">' +
      '  <div style="display:flex; align-items:center; gap:12px; flex-wrap:wrap;">' +
      summaryHtml +
      pageSizeSelectHtml +
      "  </div>" +
      navButtonsHtml +
      "</div>"
    );
  }

  /**
   * 正規化表格欄位對齊方式（白名單防禦純函式）
   */
  function normalizeTableAlign(align) {
    if (!align) return "";
    const s = String(align).toLowerCase().trim();
    return s === "left" || s === "center" || s === "right" || s === "justify" ? s : "";
  }

  /**
   * 渲染表格表頭 HTML（純函式）
   */
  function renderTableHead(columns) {
    if (!Array.isArray(columns) || columns.length === 0) return "";
    let ths = "";
    for (let i = 0; i < columns.length; i++) {
      const col = columns[i] || {};
      const title = escapeHtml(col.title || col.name || col.label || "");
      const validAlign = normalizeTableAlign(col.align);
      const align = validAlign ? ' style="text-align:' + validAlign + ';"' : "";
      const width = col.width ? ' width="' + escapeHtml(col.width) + '"' : "";
      ths += '<th scope="col"' + align + width + ">" + title + "</th>";
    }
    return "<thead><tr>" + ths + "</tr></thead>";
  }

  /**
   * 渲染表格狀態提示列 HTML（保護 <td> 單元格語意，純函式）
   */
  function renderTableStatusRow(options) {
    const opt = options || {};
    const span = Number.isFinite(opt.colspan) && opt.colspan > 0 ? Math.floor(opt.colspan) : 1;
    if (opt.loading) {
      const loadingText = escapeHtml(opt.loadingText || "載入中...");
      return (
        '<tr><td colspan="' +
        span +
        '" style="text-align:center; padding:28px; color:var(--ink-2);">' +
        '<div role="status" aria-live="polite">' +
        '<span class="spinner" style="display:inline-block; margin-right:8px;" aria-hidden="true">⏳</span>' +
        loadingText +
        "</div></td></tr>"
      );
    }
    const emptyContent = opt.emptyHtml ? String(opt.emptyHtml) : escapeHtml(opt.emptyText || "查無資料");
    return (
      '<tr><td colspan="' +
      span +
      '" style="text-align:center; padding:28px; color:var(--ink-2);">' +
      '<div role="status" aria-live="polite">' +
      emptyContent +
      "</div></td></tr>"
    );
  }

  /**
   * 內部純輔助函式：產生宣告式欄位之資料列 HTML（圈複雜度 <= 4）
   */
  function renderDeclarativeRows_(items, columns) {
    let rowsHtml = "";
    for (let r = 0; r < items.length; r++) {
      const row = items[r] || {};
      let tds = "";
      for (let c = 0; c < columns.length; c++) {
        const col = columns[c] || {};
        const key = col.key || col.field || "";
        const rawVal = key ? row[key] : "";
        const content =
          typeof col.formatter === "function" ? col.formatter(rawVal, row, r) : escapeHtml(String(rawVal ?? ""));
        const validAlign = normalizeTableAlign(col.align);
        const align = validAlign ? ' style="text-align:' + validAlign + ';"' : "";
        tds += "<td" + align + ">" + content + "</td>";
      }
      rowsHtml += "<tr>" + tds + "</tr>";
    }
    return rowsHtml;
  }

  /**
   * 渲染表格主體資料列 HTML（純函式）
   */
  function renderTableBody(options) {
    const opt = options || {};
    const items = Array.isArray(opt.items) ? opt.items : [];
    const columns = Array.isArray(opt.columns) ? opt.columns : [];
    const span = Number.isFinite(opt.colspan) && opt.colspan > 0 ? Math.floor(opt.colspan) : columns.length || 1;

    if (opt.loading) {
      return (
        "<tbody>" + renderTableStatusRow({ colspan: span, loading: true, loadingText: opt.loadingText }) + "</tbody>"
      );
    }
    if (items.length === 0) {
      return (
        "<tbody>" +
        renderTableStatusRow({ colspan: span, loading: false, emptyText: opt.emptyText, emptyHtml: opt.emptyHtml }) +
        "</tbody>"
      );
    }
    if (typeof opt.rowRenderer === "function") {
      let rows = "";
      for (let i = 0; i < items.length; i++) {
        const rowContent = opt.rowRenderer(items[i], i);
        rows += rowContent != null ? rowContent : "";
      }
      return "<tbody>" + rows + "</tbody>";
    }

    return "<tbody>" + renderDeclarativeRows_(items, columns) + "</tbody>";
  }

  /**
   * 高階純函式資料表格組合容器元件（paged-table-container）
   */
  function renderPagedTable(options) {
    const opt = options || {};
    const items = Array.isArray(opt.items) ? opt.items : [];
    const columns = Array.isArray(opt.columns) ? opt.columns : [];
    const span = Number.isFinite(opt.colspan) && opt.colspan > 0 ? Math.floor(opt.colspan) : columns.length || 1;
    const isLoading = Boolean(opt.loading || opt.isLoading);
    const hasPagination = opt.pagination && typeof renderPaginationBar === "function";

    let topPager = "";
    let bottomPager = "";
    if (hasPagination) {
      const basePagerOpts = Object.assign({}, opt.pagination, {
        disabled: isLoading || opt.pagination.disabled === true
      });
      if (opt.pagination.showTop !== false) {
        topPager = renderPaginationBar(Object.assign({}, basePagerOpts, { position: "top" }));
      }
      if (opt.pagination.showBottom !== false) {
        bottomPager = renderPaginationBar(Object.assign({}, basePagerOpts, { position: "bottom" }));
      }
    }

    const rawHeadHtml = opt.theadHtml || renderTableHead(columns);
    const headHtml = rawHeadHtml
      ? String(rawHeadHtml).replace(/<th\b(?![^>]*\bscope\s*=)([^>]*)>/gi, '<th scope="col"$1>')
      : "";
    const bodyHtml = renderTableBody({
      items: items,
      columns: columns,
      rowRenderer: opt.rowRenderer,
      loading: isLoading,
      loadingText: opt.loadingText,
      emptyText: opt.emptyText,
      emptyHtml: opt.emptyHtml,
      colspan: span
    });

    const tableClass = opt.className
      ? "data-table " + escapeHtml(opt.className)
      : "data-table table-centered table-hover";
    const tableStyle = opt.tableStyle ? ' style="' + escapeHtml(opt.tableStyle) + '"' : ' style="width:100%;"';
    const ariaBusy = isLoading ? ' aria-busy="true"' : "";
    const beforeHtml = opt.beforeTableHtml || "";
    const afterHtml = opt.afterTableHtml || "";

    const containerClass = opt.containerClassName
      ? escapeHtml(opt.containerClassName)
      : "table-responsive table-container";

    const tableHtml =
      '<div class="' +
      containerClass +
      '" style="overflow-x:auto;">' +
      '  <table class="' +
      tableClass +
      '"' +
      tableStyle +
      ariaBusy +
      ">" +
      headHtml +
      bodyHtml +
      "  </table>" +
      "</div>";

    return beforeHtml + topPager + tableHtml + bottomPager + afterHtml;
  }

  /**
   * 建立可注入依賴的 UI 模組實例。
   *
   * @param {Object} deps - MEA、window、document 與計時器依賴
   * @returns {Object} MEA.ui 公開方法與測試用內部函式
   */
  function createUiModule(deps) {
    const options = deps || {};
    const MEA = options.MEA || (typeof window !== "undefined" ? window.MEA : null) || {};
    const win = options.window || (typeof window !== "undefined" ? window : null) || {};
    const doc = options.document || (win && win.document) || (typeof document !== "undefined" ? document : null);
    const setTimeoutFn =
      typeof options.setTimeoutFn === "function"
        ? options.setTimeoutFn
        : function (fn, ms) {
            return setTimeout(fn, ms);
          };
    // task 6.2：事件綁定守護由共用模組提供（Node 由 require 取得，瀏覽器由全域取得）。
    const bindings = typeof require === "function" ? require("./eventBindings.js") : globalThis.MEA.eventBindings;

    /** 以 document 委派綁定所有 UI 事件；DOM 於 render 後重建仍可作用。 */
    function bindEventsOnce() {
      if (!bindings || !doc || typeof doc.addEventListener !== "function") return;
      bindings.delegate(doc, "change", "[data-ui-action='apply-style']", function (event, element) {
        applyStyle(element.value);
      });
      bindings.delegate(doc, "click", "[data-ui-action]", function (event, element) {
        const action = element.getAttribute("data-ui-action");
        if (action === "toggle-theme") return toggleTheme();
        if (action === "logout") {
          return MEA.auth && typeof MEA.auth.logout === "function" ? MEA.auth.logout() : undefined;
        }
        if (action === "login-mock") {
          return MEA.auth && typeof MEA.auth.loginMock === "function" ? MEA.auth.loginMock() : undefined;
        }
        if (action === "set-tab") {
          const tab = element.getAttribute("data-tab");
          const setTab = (MEA.navigation && MEA.navigation.setTab) || MEA.setTab;
          return typeof setTab === "function" ? setTab(tab) : undefined;
        }
        if (action === "open-user-guide") return openUserGuide();
        return undefined;
      });
    }

    bindEventsOnce();

    let modalRestoreFocus = null;

    function applyTheme(theme) {
      const value = theme === "dark" ? "dark" : "light";
      doc.documentElement.dataset.theme = value;
      try {
        win.localStorage.setItem(MEA.config.themeKey, value);
      } catch (error) {}
      return value;
    }

    function currentTheme() {
      return doc.documentElement.dataset.theme === "dark" ? "dark" : "light";
    }

    function updateThemeToggleLabels(next) {
      const btn = doc.getElementById("themeToggle");
      if (btn) btn.textContent = next === "dark" ? "◑ 淺色模式" : "◐ 深色模式";
      const loginToggle = doc.getElementById("loginThemeToggle");
      if (loginToggle) loginToggle.textContent = next === "dark" ? "◑ 淺色" : "◐ 深色";
    }

    function toggleTheme() {
      const next = currentTheme() === "dark" ? "light" : "dark";
      applyTheme(next);
      updateThemeToggleLabels(next);
    }

    function getStyleList() {
      return (MEA.config.styles || []).slice();
    }

    function currentStyle() {
      return doc.documentElement.dataset.style || MEA.config.defaultStyle || DEFAULT_STYLE;
    }

    function applyStyle(styleId) {
      const list = getStyleList();
      let valid = false;
      for (let i = 0; i < list.length; i++) {
        if (list[i].id === styleId) {
          valid = true;
          break;
        }
      }
      const target = valid ? styleId : MEA.config.defaultStyle || DEFAULT_STYLE;
      doc.documentElement.dataset.style = target;
      try {
        win.localStorage.setItem(MEA.config.styleKey, target);
      } catch (error) {}
      return target;
    }

    function initThemeAndStyle() {
      let savedTheme = "light";
      let savedStyle = MEA.config.defaultStyle || DEFAULT_STYLE;
      try {
        savedTheme = win.localStorage.getItem(MEA.config.themeKey) || "light";
        savedStyle = win.localStorage.getItem(MEA.config.styleKey) || savedStyle;
      } catch (e) {}
      applyTheme(savedTheme);
      applyStyle(savedStyle);
    }

    function toast(message, type, duration) {
      const host = doc.getElementById("toastHost");
      if (!host) return;

      const kind = resolveToastKind(type);
      const t = createToastElement(doc, message, kind);
      host.appendChild(t);

      setTimeoutFn(function () {
        t.classList.add("visible");
      }, 10);

      scheduleToastRemoval(t, resolveToastDuration(kind, duration), setTimeoutFn);
    }

    /**
     * 收集容器內可聚焦元素，供初始焦點與 Tab 焦點陷阱使用。
     *
     * @param {Object} root - 查詢根元素
     * @returns {Array} 可聚焦元素清單
     */
    function collectFocusableElements(root) {
      if (!root || typeof root.querySelectorAll !== "function") return [];
      const found = root.querySelectorAll("button, input, select, textarea, a[href], [tabindex]");
      const nodes = [];
      for (let i = 0; i < found.length; i++) {
        const node = found[i];
        const tabIndex = typeof node.getAttribute === "function" ? node.getAttribute("tabindex") : null;
        if (node.disabled === true || tabIndex === "-1") continue;
        nodes.push(node);
      }
      return nodes;
    }

    /**
     * 對話框開啟時標記背景地標為 inert，關閉時還原，避免焦點與點擊穿透。
     *
     * @param {boolean} enabled - 是否啟用 inert
     */
    function setBackgroundInert(enabled) {
      if (!doc || typeof doc.querySelectorAll !== "function") return;
      const nodes = doc.querySelectorAll(".app-nav, .app-content");
      for (let i = 0; i < nodes.length; i++) {
        if (enabled) {
          if (typeof nodes[i].setAttribute === "function") nodes[i].setAttribute("inert", "");
        } else if (typeof nodes[i].removeAttribute === "function") {
          nodes[i].removeAttribute("inert");
        }
      }
    }

    function modal(title, contentHtml, buttons) {
      const host = doc.getElementById("modalHost");
      if (!host) return;

      const previousFocus = doc.activeElement || null;
      host.innerHTML = "";
      const overlay = doc.createElement("div");
      overlay.className = "modal-overlay";
      if (typeof overlay.setAttribute === "function") {
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-labelledby", MODAL_TITLE_ID);
      }

      const card = doc.createElement("div");
      card.className = "modal-card";

      const head = doc.createElement("div");
      head.className = "modal-header";
      head.innerHTML =
        '<h3 class="modal-title" id="' +
        MODAL_TITLE_ID +
        '">' +
        escapeHtml(title) +
        '</h3><button type="button" class="modal-close" id="modalCloseBtn" aria-label="關閉對話框">✕</button>';

      const body = doc.createElement("div");
      body.className = "modal-body";
      body.innerHTML = contentHtml;

      const foot = doc.createElement("div");
      foot.className = "modal-footer";

      const footButtons = [];
      const btns = buttons || [{ text: "關閉", primary: true, onClick: closeModal }];
      btns.forEach(function (btn) {
        const b = doc.createElement("button");
        b.className = btn.className || "btn " + (btn.primary ? "primary" : "secondary");
        if (typeof b.setAttribute === "function") b.setAttribute("type", "button");
        b.textContent = btn.text || btn.label || "";
        b.onclick = function () {
          if (typeof btn.onClick === "function") {
            btn.onClick();
          } else {
            closeModal();
          }
        };
        foot.appendChild(b);
        footButtons.push(b);
      });

      card.appendChild(head);
      card.appendChild(body);
      card.appendChild(foot);
      overlay.appendChild(card);
      host.appendChild(overlay);
      setBackgroundInert(true);

      modalRestoreFocus = previousFocus;

      const closeBtn = doc.getElementById("modalCloseBtn");
      if (closeBtn) closeBtn.onclick = closeModal;
      overlay.onclick = function (e) {
        if (e.target === overlay) closeModal();
      };

      function collectFocusables() {
        const closeNodes = closeBtn ? [closeBtn] : [];
        return closeNodes.concat(collectFocusableElements(body), footButtons);
      }

      const focusables = collectFocusables();
      if (focusables.length > 0 && typeof focusables[0].focus === "function") {
        focusables[0].focus();
      }

      overlay.onkeydown = function (e) {
        if (!e) return;
        const key = e.key || "";
        if (key === "Escape" || key === "Esc" || e.keyCode === 27) {
          if (typeof e.preventDefault === "function") e.preventDefault();
          closeModal();
          return;
        }
        if (key !== "Tab" && e.keyCode !== 9) return;
        const nodes = collectFocusables();
        if (nodes.length === 0) return;
        const index = nodes.indexOf(doc.activeElement);
        if (e.shiftKey) {
          if (index <= 0) {
            if (typeof e.preventDefault === "function") e.preventDefault();
            nodes[nodes.length - 1].focus();
          }
        } else if (index === -1 || index === nodes.length - 1) {
          if (typeof e.preventDefault === "function") e.preventDefault();
          nodes[0].focus();
        }
      };
    }

    function closeModal() {
      const host = doc.getElementById("modalHost");
      if (host) host.innerHTML = "";
      setBackgroundInert(false);
      const restoreTarget = modalRestoreFocus;
      modalRestoreFocus = null;
      if (restoreTarget && typeof restoreTarget.focus === "function") restoreTarget.focus();
    }

    /**
     * 取得使用者操作手冊的 Web App 文件路由網址（優先使用部署 exec/dev 網址）。
     *
     * @returns {string} 文件路由網址
     */
    function getUserGuideUrl() {
      const qs = "?page=docs%2Fuser-guide.html";
      let base = "";

      if (typeof win !== "undefined" && win) {
        const injected = String(win.GAS_WEBAPP_URL || "").trim();
        if (/^https?:\/\//i.test(injected)) base = injected;

        if (!base) {
          const href = String((win.location && win.location.href) || "").trim();
          if (/\/macros\/.+\/(exec|dev)(\?|#|$)/i.test(href) && !/googleusercontent\.com\/userCodeAppPanel/i.test(href)) {
            base = href.split("?")[0].split("#")[0];
          }
        }
      }

      if (!base) {
        const cfg = String((MEA.state && MEA.state.publicConfig && MEA.state.publicConfig.webAppUrl) || "").trim();
        if (/^https?:\/\//i.test(cfg)) base = cfg;
      }

      return base ? base.replace(/\?.*$/, "").replace(/#.*$/, "").replace(/\/+$/, "") + qs : qs;
    }

    /**
     * 開啟使用者操作手冊與常見問題快速指引對話框。
     */
    function openUserGuide() {
      const content =
        '<div class="user-guide-modal-content" style="max-height: 65vh; overflow-y: auto; padding: 4px 8px; font-size: 14px; line-height: 1.6;">' +
        '<div style="background: var(--fill); border: 1px solid var(--line-2); padding: 12px 14px; border-radius: 8px; margin-bottom: 14px;">' +
        "  <strong>📌 目前可操作功能快速指南：</strong>" +
        '  <ol style="margin: 8px 0 0 20px; color: var(--ink-2);">' +
        "    <li><strong>帳號登入與權限</strong>：使用 Google 帳號登入；導覽列頁籤將依帳號指派之角色自動過濾。未授權請聯繫系統管理員加入白名單。</li>" +
        "    <li><strong>課程代碼 Excel 匯入</strong>：於「課程代碼匯入」頁籤拖曳 108 課綱 39 欄 Excel，確認預覽後點擊「確認匯入至試算表」。</li>" +
        "    <li><strong>課程代碼清單檢索</strong>：於「正規化課程代碼清單」進行關鍵字、教育部 3 碼科別代碼、學年與學期多維度篩選。</li>" +
        "    <li><strong>系統設定與授權維護</strong>：管理員可於「系統設定與授權」維護成員白名單、管理員首次開通與操作日誌稽核。</li>" +
        "  </ol>" +
        "</div>" +
        '<div style="background: var(--fill); border: 1px solid var(--line-2); padding: 12px 14px; border-radius: 8px; margin-bottom: 14px;">' +
        "  <strong>💡 常見問題快速提醒：</strong>" +
        '  <ul style="margin: 6px 0 0 20px; color: var(--ink-2);">' +
        "    <li><strong>登入失敗？</strong> 若提示未授權，請聯繫管理員於「系統設定與授權」加入白名單並指派角色。</li>" +
        "    <li><strong>按鈕反灰？</strong> 代表查無資料、角色無權限，或系統正在處理前一個請求；稍候再試或重新整理。</li>" +
        "    <li><strong>提示操作過於頻繁？</strong> 系統設有並發排隊鎖定，請休息 3~5 秒後再進行點擊。</li>" +
        "  </ul>" +
        "</div>" +
        '<p style="color: var(--ink-2); font-size: 13px;">如需完整操作說明與技術規範，請點擊下方按鈕在新分頁開啟完整手冊。</p>' +
        "</div>";

      modal("📖 課程網頁應用程式 · 使用者操作手冊", content, [
        {
          text: "在新分頁開啟完整手冊",
          primary: true,
          className: "btn primary",
          onClick: function () {
            if (typeof win !== "undefined" && win && win.open) {
              win.open(getUserGuideUrl(), "_blank");
            }
          }
        },
        {
          text: "關閉",
          primary: false,
          className: "btn secondary",
          onClick: function () {
            closeModal();
          }
        }
      ]);
    }

    function renderUserPill(user) {
      return (
        '  <div class="user-pill">' +
        '    <span class="user-avatar" aria-hidden="true">👤</span>' +
        '    <span class="user-name">' +
        escapeHtml(user.name || user.email) +
        "</span>" +
        '    <span class="pill ' +
        (user.role === ROLE_CODES.ADMIN ? "accent" : "muted") +
        '">' +
        escapeHtml(user.roleName || roleName(user.role, MEA.config)) +
        "</span>" +
        "  </div>"
      );
    }

    function renderHeader() {
      const user = MEA.state.user || {};
      const logoutBusy = !!(MEA.state && MEA.state.logoutBusy);
      const styles = getStyleList();
      const curStyle = currentStyle();
      const systemName = (MEA.state.publicConfig && MEA.state.publicConfig.systemName) || MEA.config.title;

      return (
        '<header class="app-header">' +
        '<div class="header-brand">' +
        '  <div class="brand-mark" aria-hidden="true">📋</div>' +
        '  <div class="brand-text">' +
        '    <h1 class="brand-title">' +
        escapeHtml(systemName) +
        "</h1>" +
        '    <span class="brand-sub">Google Apps Script Web App Template v' +
        escapeHtml(MEA.config.version) +
        "</span>" +
        "  </div>" +
        "</div>" +
        '<div class="header-tools">' +
        renderUserPill(user) +
        '  <div class="style-selector-wrap">' +
        '    <label class="sr-only" for="styleSelect">介面風格</label>' +
        '    <select id="styleSelect" class="select compact" data-ui-action="apply-style">' +
        renderStyleOptions(styles, curStyle) +
        "    </select>" +
        "  </div>" +
        '  <button type="button" id="themeToggle" class="btn secondary compact" data-ui-action="toggle-theme">' +
        (currentTheme() === "dark" ? "◑ 淺色模式" : "◐ 深色模式") +
        "  </button>" +
        '  <button type="button" class="btn secondary compact" data-ui-action="logout"' +
        (logoutBusy ? " disabled" : "") +
        ">" +
        (logoutBusy ? "登出中..." : "登出") +
        "</button>" +
        "</div>" +
        "</header>"
      );
    }

    function renderNavbar() {
      const tabs = MEA.config.tabs || [];
      const currentTab = MEA.state.tab || "overview";
      const user = MEA.state && MEA.state.user;

      let tabsHtml = "";
      for (let i = 0; i < tabs.length; i++) {
        const t = tabs[i];
        if (!isTabAllowed(t, user)) continue;
        const active = t.id === currentTab ? " active" : "";
        const current = t.id === currentTab ? ' aria-current="page"' : "";
        tabsHtml +=
          '<button type="button" class="nav-tab' +
          active +
          '"' +
          current +
          ' data-ui-action="set-tab" data-tab="' +
          escapeHtml(t.id) +
          '">' +
          '<span class="nav-icon" aria-hidden="true">' +
          t.icon +
          "</span>" +
          '<span class="nav-name">' +
          escapeHtml(t.name) +
          "</span>" +
          "</button>";
      }

      return (
        '<nav class="app-nav" aria-label="主要導覽">' +
        '<div class="nav-tabs-container">' +
        tabsHtml +
        "</div>" +
        "</nav>"
      );
    }

    function renderLoginErrorHtml(loginError) {
      if (!loginError) return "";
      return (
        '<div class="login-alert err" role="alert"><span class="alert-icon" aria-hidden="true">⚠</span><span>' +
        escapeHtml(loginError) +
        "</span></div>"
      );
    }

    function getLoginStatusHtml(isMock, config, auth) {
      if (isMock) {
        return '<div class="login-hint">目前為本機 Mock 模式，可直接使用測試身分登入。</div>';
      }
      if (auth && typeof auth.isGasHosted === "function" && auth.isGasHosted()) {
        const activeEmail = String(config.activeEmail || "").trim();
        return activeEmail
          ? '<div class="login-hint">目前瀏覽器 Google 帳號：<strong>' + escapeHtml(activeEmail) + "</strong></div>"
          : '<div class="login-hint">將透過 Google 帳戶選擇器以目前瀏覽器 Google 帳號登入。</div>';
      }
      if (config.clientId) {
        return '<div class="login-hint">使用 Google Identity Services 憑證進行登入驗證。</div>';
      }
      return '<div class="login-hint">尚未設定 OAuth Client ID；可請管理員於系統設定完成後再啟用 GIS 登入。</div>';
    }

    function renderLoginActions(isMock, loginBusy) {
      const mockHtml = isMock
        ? '<div class="login-divider"><span>或</span></div>' +
          '<button type="button" class="btn secondary block" data-ui-action="login-mock"' +
          (loginBusy ? " disabled" : "") +
          ">" +
          "  🧪 本地測試身分登入 (Mock Mode)" +
          "</button>"
        : "";

      return (
        '  <div class="login-actions">' +
        '    <div class="gis-button-wrapper">' +
        '      <div id="googleLoginButton" class="google-btn-host"></div>' +
        "    </div>" +
        mockHtml +
        "  </div>"
      );
    }

    function renderLoginView() {
      const isMock = MEA.config.mock;
      const loginError = MEA.state.loginError || "";
      const loginBusy = MEA.state.loginBusy || false;
      const config = MEA.state.publicConfig || {};
      const styles = getStyleList();
      const curStyle = currentStyle();
      const styleOptionsHtml = renderStyleOptions(styles, curStyle);
      const errorHtml = renderLoginErrorHtml(loginError);
      const statusHtml = getLoginStatusHtml(isMock, config, MEA.auth);

      return (
        '<div class="login-container">' +
        '<div class="login-header-tools">' +
        '  <label class="sr-only" for="loginStyleSelect">介面風格</label>' +
        '  <select id="loginStyleSelect" class="select compact" data-ui-action="apply-style">' +
        styleOptionsHtml +
        "  </select>" +
        '  <button type="button" id="loginThemeToggle" class="btn secondary compact" data-ui-action="toggle-theme">' +
        (currentTheme() === "dark" ? "◑ 淺色" : "◐ 深色") +
        "  </button>" +
        "</div>" +
        '<div class="login-card">' +
        '  <div class="login-brand">' +
        '    <div class="login-logo" aria-hidden="true">✨</div>' +
        '    <h2 class="login-title">' +
        escapeHtml(config.systemName || MEA.config.title) +
        "</h2>" +
        '    <p class="login-desc">Google 帳號登入、Session 安全控管與 108 課綱課程代碼 1NF 正規化範本</p>' +
        "  </div>" +
        errorHtml +
        statusHtml +
        renderLoginActions(isMock, loginBusy) +
        '  <div class="login-footer">' +
        '    <p class="login-note">首次登入且尚無白名單資料時，系統將自動建立第一位系統管理員。</p>' +
        "  </div>" +
        "</div>" +
        "</div>"
      );
    }

    function getLoginMode(config, auth) {
      const isGasHosted = auth && typeof auth.isGasHosted === "function" && auth.isGasHosted();
      if (isGasHosted) return "GAS ActiveUser / AccountChooser";
      if (config.clientId) return "Google Identity Services";
      return "未設定 Client ID";
    }

    function renderOverviewMetrics(config, user, courses, loginMode) {
      return (
        '<div class="metrics-grid">' +
        '  <div class="metric-card">' +
        '    <div class="metric-label">目前學年度 / 學期</div>' +
        '    <div class="metric-value">' +
        escapeHtml(config.schoolYear || "114") +
        " - " +
        escapeHtml(config.semester || "1") +
        "</div>" +
        '    <div class="metric-sub">系統作業環境</div>' +
        "  </div>" +
        '  <div class="metric-card">' +
        '    <div class="metric-label">已登入使用者</div>' +
        '    <div class="metric-value">' +
        escapeHtml(user.name || user.email) +
        "</div>" +
        '    <div class="metric-sub">角色權限：' +
        escapeHtml(user.roleName || user.role) +
        "</div>" +
        "  </div>" +
        '  <div class="metric-card">' +
        '    <div class="metric-label">登入機制</div>' +
        '    <div class="metric-value">' +
        escapeHtml(loginMode) +
        "</div>" +
        '    <div class="metric-sub">' +
        (config.allowedDomain ? "限制網域：@" + escapeHtml(config.allowedDomain) : "未限制登入網域") +
        "</div>" +
        "  </div>" +
        '  <div class="metric-card">' +
        '    <div class="metric-label">課程代碼筆數</div>' +
        '    <div class="metric-value">' +
        number(courses.total || 0) +
        "</div>" +
        '    <div class="metric-sub">正規化課程紀錄總數</div>' +
        "  </div>" +
        "</div>"
      );
    }

    function renderFeatureGrid() {
      return (
        '<div class="card mt-4">' +
        '  <h3 class="card-title">🚀 範本功能快速導覽</h3>' +
        '  <div class="feature-grid mt-3">' +
        '    <button type="button" class="feature-item" data-ui-action="set-tab" data-tab="import">' +
        '      <div class="feature-icon" aria-hidden="true">📥</div>' +
        '      <div class="feature-text">' +
        "        <h4>課程代碼匯入與 1NF 正規化</h4>" +
        "        <p>支援 39 欄課綱寬表 Excel 檔案上傳，全數匯入並展開為 14 欄標準 1NF 課程代碼。</p>" +
        "      </div>" +
        "    </button>" +
        '    <button type="button" class="feature-item" data-ui-action="set-tab" data-tab="courses">' +
        '      <div class="feature-icon" aria-hidden="true">📚</div>' +
        '      <div class="feature-text">' +
        "        <h4>正規化課程檢索與分頁</h4>" +
        "        <p>提供多維度關鍵字、學年、學期、科別篩選機制，支援大批量課程資料快速檢索。</p>" +
        "      </div>" +
        "    </button>" +
        '    <button type="button" class="feature-item" data-ui-action="set-tab" data-tab="settings">' +
        '      <div class="feature-icon" aria-hidden="true">⚙️</div>' +
        '      <div class="feature-text">' +
        "        <h4>系統設定與授權管理 (RBAC)</h4>" +
        "        <p>維護 Google OAuth 設定、登入網域限制、學期參數與系統存取授權白名單。</p>" +
        "      </div>" +
        "    </button>" +
        "  </div>" +
        "</div>"
      );
    }

    function renderOverviewView() {
      const config = MEA.state.publicConfig || {};
      const user = MEA.state.user || {};
      const courses = MEA.state.courses || {};
      const loginMode = getLoginMode(config, MEA.auth);

      return (
        '<div class="panel overview-panel">' +
        '<div class="panel-header">' +
        "  <div>" +
        '    <h2 class="panel-title">系統概覽儀表板</h2>' +
        '    <p class="panel-sub">Google Apps Script 網頁應用程式範本核心運作狀態</p>' +
        "  </div>" +
        '  <button type="button" class="btn secondary compact" data-ui-action="open-user-guide"><span aria-hidden="true">📖</span> 說明手冊</button>' +
        "</div>" +
        renderOverviewMetrics(config, user, courses, loginMode) +
        renderFeatureGrid() +
        "</div>"
      );
    }

    /**
     * 函數防抖 (Debounce)
     *
     * @param {Function} fn - 目標執行函數
     * @param {number} [delay=250] - 延遲毫秒數
     * @returns {Function} 防抖包裹後之函數
     */
    function debounce(fn, delay) {
      let timer = null;
      const wait = typeof delay === "number" ? delay : 250;
      return function () {
        const context = this;
        const args = arguments;
        if (timer) {
          clearTimeout(timer);
        }
        timer = setTimeoutFn(function () {
          fn.apply(context, args);
        }, wait);
      };
    }

    const api = {
      escapeHtml: escapeHtml,
      number: number,
      isTabAllowed: isTabAllowed,
      roleName: function (role) {
        return roleName(role, MEA.config);
      },
      debounce: debounce,
      calculatePaginationWindow: calculatePaginationWindow,
      renderPaginationBar: renderPaginationBar,
      renderPagedTable: renderPagedTable,
      renderTableHead: renderTableHead,
      renderTableBody: renderTableBody,
      renderTableStatusRow: renderTableStatusRow,
      normalizeTableAlign: normalizeTableAlign,
      applyTheme: applyTheme,
      currentTheme: currentTheme,
      toggleTheme: toggleTheme,
      getStyleList: getStyleList,
      currentStyle: currentStyle,
      applyStyle: applyStyle,
      initThemeAndStyle: initThemeAndStyle,
      toast: toast,
      modal: modal,
      closeModal: closeModal,
      renderHeader: renderHeader,
      renderNavbar: renderNavbar,
      renderLoginView: renderLoginView,
      renderOverviewView: renderOverviewView,
      getUserGuideUrl: getUserGuideUrl,
      openUserGuide: openUserGuide
    };

    if (options.exposeInternals) {
      Object.assign(api, {
        getUserGuideUrl: getUserGuideUrl,
        openUserGuide: openUserGuide,
        collectFocusableElements: collectFocusableElements,
        renderStyleOptions: renderStyleOptions,
        resolveToastKind: resolveToastKind,
        resolveToastRole: resolveToastRole,
        resolveToastIcon: resolveToastIcon,
        resolveToastDuration: resolveToastDuration,
        createToastElement: createToastElement,
        scheduleToastRemoval: scheduleToastRemoval,
        renderUserPill: renderUserPill,
        renderLoginErrorHtml: renderLoginErrorHtml,
        getLoginStatusHtml: getLoginStatusHtml,
        renderLoginActions: renderLoginActions,
        getLoginMode: getLoginMode,
        renderOverviewMetrics: renderOverviewMetrics,
        renderFeatureGrid: renderFeatureGrid,
        setBackgroundInert: setBackgroundInert,
        updateThemeToggleLabels: updateThemeToggleLabels
      });
    }

    return api;
  }

  return {
    createUiModule: createUiModule,
    DEFAULT_STYLE: DEFAULT_STYLE,
    escapeHtml: escapeHtml,
    number: number,
    roleName: roleName,
    calculatePaginationWindow: calculatePaginationWindow,
    renderPaginationBar: renderPaginationBar,
    renderPagedTable: renderPagedTable,
    renderTableHead: renderTableHead,
    renderTableBody: renderTableBody,
    renderTableStatusRow: renderTableStatusRow,
    normalizeTableAlign: normalizeTableAlign,
    renderStyleOptions: renderStyleOptions,
    resolveToastKind: resolveToastKind,
    resolveToastRole: resolveToastRole,
    resolveToastIcon: resolveToastIcon,
    resolveToastDuration: resolveToastDuration,
    createToastElement: createToastElement,
    scheduleToastRemoval: scheduleToastRemoval
  };
});
