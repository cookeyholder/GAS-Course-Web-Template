/**
 * @file activityLog.js
 * @description 操作日誌清單、篩選、分頁與詳情展開（可測試工廠）。
 *
 * 瀏覽器環境組裝 window.MEA.activityLog；Node.js 環境匯出 createActivityLogModule 供單元測試注入依賴。
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
    MEA.factories.activityLog = api.createActivityLogModule;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // task 6.4：共用 Node require 相容墊片與 safeErrors 注入解析（Node 由 require 取得，瀏覽器由全域取得）。
  const moduleHelpers = typeof require === "function" ? require("./moduleHelpers.js") : globalThis.MEA.moduleHelpers;

  /** 後端已明確定義的錯誤代碼文案（查詢日誌專用） */
  const SAFE_ERROR_MESSAGES = {
    invalid_date_range: "日期格式不正確或日期區間無效",
    forbidden: "您的帳號沒有存取操作日誌的權限",
    unauthorized: "登入狀態已失效，請重新登入"
  };

  /** 事件類別顯示名稱（與後端 logCategory 一致） */
  const CATEGORY_LABELS = {
    auth: "身份驗證",
    write: "寫入操作",
    query: "查詢操作"
  };

  /** 預設查詢天數與每頁筆數（與後端 getActivityLog 上限一致） */
  const DEFAULT_DAYS = 7;
  const DEFAULT_PAGE_SIZE = 50;
  const MAX_PAGE_SIZE = 500;

  /**
   * 以 Asia/Taipei 時區格式化日期為 yyyy-MM-dd。
   *
   * @param {Date} date - 日期物件
   * @returns {string} 日期字串
   */
  function formatTaipeiDate(date) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).formatToParts(date);
      const values = {};
      parts.forEach(function (part) {
        values[part.type] = part.value;
      });
      return values.year + "-" + values.month + "-" + values.day;
    } catch (error) {
      return new Date(date.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
  }

  /**
   * 取得預設日期區間（最近 7 天，含今日）。
   *
   * @returns {Object} `{ startDate, endDate }`
   */
  function defaultDateRange() {
    const now = new Date();
    return {
      startDate: formatTaipeiDate(new Date(now.getTime() - (DEFAULT_DAYS - 1) * 24 * 60 * 60 * 1000)),
      endDate: formatTaipeiDate(now)
    };
  }

  /**
   * 建立操作日誌模組控制器。
   *
   * @param {Object} [deps] - 依賴注入（MEA、document）
   * @returns {Object} 公開方法集合（與 MEA.activityLog 一致）
   */
  function createActivityLogModule(deps) {
    const options = deps || {};
    const safeErrors = moduleHelpers.resolveSafeErrors(options);
    const MEA = options.MEA || (typeof window !== "undefined" ? window.MEA : null) || {};
    const doc = options.document || (typeof document !== "undefined" ? document : null);
    // task 6.2：事件綁定守護由共用模組提供（Node 由 require 取得，瀏覽器由全域取得）。
    const bindings = typeof require === "function" ? require("./eventBindings.js") : globalThis.MEA.eventBindings;
    // task 6.3：列表控制流程由共用控制器提供（Node 由 require 取得，瀏覽器由全域取得）。
    const listControllerModule =
      typeof require === "function" ? require("./listController.js") : globalThis.MEA.listController;

    const listCtl = listControllerModule.createListController({
      apiAction: "getActivityLog",
      getState: currentState,
      setState: function (next) {
        MEA.setState({ activityLog: next });
      },
      canCallApi: function () {
        return !!(MEA.api && typeof MEA.api.call === "function");
      },
      callApi: function (action, payload) {
        return MEA.api.call(action, payload);
      },
      toast: function (message, kind) {
        MEA.ui.toast(message, kind);
      },
      buildQuery: function (state, page) {
        return {
          startDate: state.startDate,
          endDate: state.endDate,
          email: state.email,
          category: state.category,
          page: page,
          pageSize: state.pageSize
        };
      },
      buildSuccessPatch: function (state, result, page) {
        const total = Number(result.total) || 0;
        const pageSize = Math.min(MAX_PAGE_SIZE, Number(result.pageSize) || DEFAULT_PAGE_SIZE);
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        const resolvedPage = Math.min(Math.max(1, Number(result.page) || page), totalPages);
        return {
          loading: false,
          list: result.rows || [],
          total: total,
          page: resolvedPage,
          pageSize: pageSize,
          totalPages: totalPages
        };
      },
      readFilters: readFilterFormValues,
      buildResetPatch: function () {
        const range = defaultDateRange();
        return {
          startDate: range.startDate,
          endDate: range.endDate,
          email: "",
          category: "",
          expanded: {}
        };
      },
      buildSearchExtraPatch: function () {
        return { expanded: {} };
      },
      resolveFailureMessage: function (result, fallback) {
        return resolveLogError(result, fallback);
      },
      resolveErrorMessage: function (error, fallback) {
        return resolveLogError(error, fallback);
      },
      normalizePage: function (requested, state) {
        return Math.max(1, requested || state.page || 1);
      },
      failureFallback: "讀取操作日誌失敗",
      errorFallback: "讀取操作日誌失敗，請稍後再試",
      pagination: {
        actionAttribute: "data-activity-action",
        number: function (value) {
          return MEA.ui.number(value);
        },
        normalize: function (state) {
          const totalPages = Math.max(1, state.totalPages || 1);
          return {
            total: state.total,
            currentPage: Math.min(Math.max(1, state.page || 1), totalPages),
            totalPages: totalPages
          };
        }
      }
    });

    const fetchList = listCtl.fetchList;
    const handleSearch = listCtl.handleSearch;
    const resetSearch = listCtl.resetSearch;

    /**
     * 取得目前日誌狀態，缺損時回傳含預設值的物件。
     *
     * @returns {Object} 日誌狀態
     */
    function currentState() {
      const state = MEA.state && MEA.state.activityLog ? MEA.state.activityLog : {};
      const range = defaultDateRange();
      return {
        list: state.list || [],
        total: state.total || 0,
        page: state.page || 1,
        pageSize: Math.min(MAX_PAGE_SIZE, state.pageSize || DEFAULT_PAGE_SIZE),
        totalPages: state.totalPages || 1,
        startDate: state.startDate || range.startDate,
        endDate: state.endDate || range.endDate,
        email: state.email || "",
        category: state.category || "",
        loading: state.loading === true,
        expanded: state.expanded || {}
      };
    }

    function getElementById(id) {
      return doc && typeof doc.getElementById === "function" ? doc.getElementById(id) : null;
    }

    function resolveLogError(value, fallbackMessage) {
      const fallback = fallbackMessage || "讀取操作日誌失敗";
      const code = value && (value.error || value.code);
      if (code && SAFE_ERROR_MESSAGES[code]) return SAFE_ERROR_MESSAGES[code];
      return safeErrors.resolveSafeMessage(value, fallback);
    }

    /**
     * 讀取篩選表單欄位值。
     *
     * @returns {Object} 表單值快照
     */
    function readFilterFormValues() {
      const startInput = getElementById("activityLogStartDate");
      const endInput = getElementById("activityLogEndDate");
      const emailInput = getElementById("activityLogEmail");
      const categorySelect = getElementById("activityLogCategory");
      const range = defaultDateRange();
      return {
        startDate: startInput ? String(startInput.value || "").trim() : range.startDate,
        endDate: endInput ? String(endInput.value || "").trim() : range.endDate,
        email: emailInput ? String(emailInput.value || "").trim() : "",
        category: categorySelect ? String(categorySelect.value || "").trim() : ""
      };
    }

    /**
     * 展開或收起單一列詳情。
     *
     * @param {string} requestId - 請求識別碼
     */
    function toggleDetail(requestId) {
      const cur = currentState();
      const expanded = Object.assign({}, cur.expanded);
      const key = String(requestId || "");
      expanded[key] = !expanded[key];
      MEA.setState({ activityLog: Object.assign({}, cur, { expanded: expanded }) });
    }

    function bindEventsOnce() {
      if (!bindings || !doc || typeof doc.addEventListener !== "function") return;
      bindings.delegate(doc, "submit", "[data-activity-form]", function (event, form) {
        if (form.getAttribute("data-activity-form") === "search") handleSearch(event);
      });
      bindings.delegate(doc, "click", "[data-activity-action]", function (event, button) {
        const action = button.getAttribute("data-activity-action");
        const handlers = {
          refresh: function () {
            return fetchList(currentState().page);
          },
          reset: function () {
            return resetSearch();
          },
          page: function () {
            const page = parseInt(button.getAttribute("data-page"), 10);
            return Number.isFinite(page) ? fetchList(page) : undefined;
          },
          "toggle-detail": function () {
            return toggleDetail(button.getAttribute("data-request-id"));
          }
        };
        const handler = handlers[action];
        if (handler) handler();
      });
    }

    bindEventsOnce();

    /**
     * 產生事件類別下拉選項。
     *
     * @param {string} selected - 目前選中的類別
     * @returns {string} HTML 字串
     */
    function renderCategoryOptionsHtml(selected) {
      let html = '<option value="">所有類別</option>';
      Object.keys(CATEGORY_LABELS).forEach(function (value) {
        const chosen = selected === value ? " selected" : "";
        html +=
          '<option value="' +
          MEA.ui.escapeHtml(value) +
          '"' +
          chosen +
          ">" +
          MEA.ui.escapeHtml(CATEGORY_LABELS[value]) +
          "</option>";
      });
      return html;
    }

    /**
     * 產生篩選表單。
     *
     * @param {Object} state - 日誌狀態
     * @returns {string} HTML 字串
     */
    function renderFilterFormHtml(state) {
      return (
        '<div class="filter-bar">' +
        '  <form class="filter-form" data-activity-form="search">' +
        '    <label class="sr-only" for="activityLogStartDate">開始日期</label>' +
        '    <input type="date" id="activityLogStartDate" class="input" value="' +
        MEA.ui.escapeHtml(state.startDate) +
        '" />' +
        '    <label class="sr-only" for="activityLogEndDate">結束日期</label>' +
        '    <input type="date" id="activityLogEndDate" class="input" value="' +
        MEA.ui.escapeHtml(state.endDate) +
        '" />' +
        '    <label class="sr-only" for="activityLogEmail">操作者</label>' +
        '    <input type="text" id="activityLogEmail" class="input" placeholder="操作者 email" value="' +
        MEA.ui.escapeHtml(state.email) +
        '" />' +
        '    <label class="sr-only" for="activityLogCategory">事件類別</label>' +
        '    <select id="activityLogCategory" class="select">' +
        renderCategoryOptionsHtml(state.category) +
        "    </select>" +
        '    <button type="submit" class="btn primary"' +
        (state.loading ? " disabled" : "") +
        ">搜尋</button>" +
        '    <button type="button" class="btn secondary" data-activity-action="reset"' +
        (state.loading ? " disabled" : "") +
        ">重設</button>" +
        "  </form>" +
        "</div>"
      );
    }

    /**
     * 產生單一列日誌與其詳情列。
     *
     * @param {Object} item - 日誌紀錄
     * @param {number} index - 資料索引（供 aria-controls 識別）
     * @returns {string} HTML 字串
     */
    function renderRowHtml(item, index) {
      const expanded = item.expanded === true;
      const detailId = "activityLogDetail_" + index;
      const requestId = String(item.requestId || "");
      const resultClass = item.result === "success" ? "ok" : "err";
      return (
        "<tr>" +
        "<td>" +
        MEA.ui.escapeHtml(item.timestamp) +
        "</td>" +
        '<td><span class="pill muted">' +
        MEA.ui.escapeHtml(item.category) +
        "</span></td>" +
        "<td>" +
        MEA.ui.escapeHtml(item.action) +
        "</td>" +
        '<td><span class="pill ' +
        resultClass +
        '">' +
        MEA.ui.escapeHtml(item.result === "success" ? "成功" : "失敗") +
        "</span></td>" +
        "<td>" +
        MEA.ui.escapeHtml(item.email) +
        "</td>" +
        "<td>" +
        MEA.ui.escapeHtml(item.summary) +
        "</td>" +
        "<td>" +
        MEA.ui.number(item.durationMs) +
        "</td>" +
        '<td><button type="button" class="btn secondary compact" aria-expanded="' +
        (expanded ? "true" : "false") +
        '" aria-controls="' +
        detailId +
        '" data-activity-action="toggle-detail" data-request-id="' +
        MEA.ui.escapeHtml(requestId) +
        '">' +
        (expanded ? "收起" : "展開") +
        "</button></td>" +
        "</tr>" +
        "<tr" +
        (expanded ? "" : " hidden") +
        '><td colspan="8"><pre class="mono font-sm activity-log-detail" id="' +
        detailId +
        '">' +
        MEA.ui.escapeHtml(item.detail) +
        "</pre></td></tr>"
      );
    }

    /**
     * 產生表格內容列。
     *
     * @param {Object} state - 日誌狀態
     * @returns {string} HTML 字串
     */
    function renderRowsHtml(state) {
      if (state.loading) {
        return '<tr><td colspan="8" class="text-center py-8 text-muted">正在載入操作日誌...</td></tr>';
      }
      if (state.list.length === 0) {
        return '<tr><td colspan="8" class="text-center py-8 text-muted">目前沒有符合條件的操作日誌。</td></tr>';
      }
      let html = "";
      state.list.forEach(function (row, index) {
        const item = Object.assign({}, row, {
          expanded: state.expanded[String(row.requestId || "")] === true
        });
        html += renderRowHtml(item, index);
      });
      return html;
    }

    function renderView() {
      const state = currentState();
      return (
        '<div class="panel">' +
        '<div class="panel-header">' +
        "  <div>" +
        '    <h2 class="panel-title">操作日誌</h2>' +
        '    <p class="panel-sub">查詢系統操作紀錄，僅系統管理員可見</p>' +
        "  </div>" +
        '  <button type="button" class="btn secondary compact" data-activity-action="refresh"' +
        (state.loading ? " disabled" : "") +
        ">🔄 重新整理</button>" +
        "</div>" +
        renderFilterFormHtml(state) +
        '<div class="table-responsive mt-3">' +
        '  <table class="table">' +
        "    <thead>" +
        "      <tr>" +
        '        <th scope="col">時間</th>' +
        '        <th scope="col">事件類別</th>' +
        '        <th scope="col">動作</th>' +
        '        <th scope="col">結果</th>' +
        '        <th scope="col">操作者</th>' +
        '        <th scope="col">摘要</th>' +
        '        <th scope="col">耗時（毫秒）</th>' +
        '        <th scope="col">詳情</th>' +
        "      </tr>" +
        "    </thead>" +
        "    <tbody>" +
        renderRowsHtml(state) +
        "    </tbody>" +
        "  </table>" +
        "</div>" +
        listCtl.renderPagination(state, state.loading) +
        "</div>"
      );
    }

    return {
      fetchList: fetchList,
      handleSearch: handleSearch,
      resetSearch: resetSearch,
      toggleDetail: toggleDetail,
      renderView: renderView
    };
  }

  return {
    createActivityLogModule: createActivityLogModule,
    formatTaipeiDate: formatTaipeiDate,
    defaultDateRange: defaultDateRange
  };
});
