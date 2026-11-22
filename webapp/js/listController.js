/**
 * @file listController.js
 * @description 前端列表共用控制器（task 6.3）：收斂 fetchList／handleSearch／
 *              resetSearch／renderPagination 的控制流程，並納入請求序號競態防護。
 *
 * 各頁面僅提供 API action 名稱、狀態讀寫回呼、查詢與渲染所需的資料轉換函式。
 * 瀏覽器環境掛至 MEA.listController；Node.js 環境匯出 createListController 供測試注入。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    MEA.listController = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /**
   * 建立共用列表控制器。
   *
   * @param {Object} [config] - 頁面提供的設定與回呼
   * @param {string} config.apiAction - 清單查詢的 Web API action 名稱
   * @param {Function} config.getState - 取得目前列表狀態
   * @param {Function} config.setState - 寫入列表狀態（傳入完整列表狀態物件）
   * @param {Function} config.callApi - 呼叫 Web API，回傳 Promise
   * @param {Function} config.toast - 顯示錯誤訊息
   * @param {Function} config.buildQuery - (state, page) => API payload
   * @param {Function} config.buildSuccessPatch - (state, result, page) => 成功狀態片段
   * @param {Function} config.readFilters - () => 表單欄位快照
   * @param {Function} config.buildResetPatch - (state) => 重設欄位片段
   * @param {string} [config.failureFallback] - 失敗回應的預設文案
   * @param {string} [config.errorFallback] - 例外狀況的預設文案
   * @param {Function} [config.buildSearchExtraPatch] - (state) => 搜尋時額外狀態片段
   * @param {Function} [config.resolveFailureMessage] - (result, fallback) => 安全文案
   * @param {Function} [config.resolveErrorMessage] - (error, fallback) => 安全文案
   * @param {Function} [config.normalizePage] - (requested, state) => 目標頁碼
   * @param {Function} [config.buildFetchKey] - (query) => 避免重複鍵；提供時啟用同參數避免重複
   * @param {Function} [config.canCallApi] - () => API 是否可用
   * @param {Object} config.pagination - 分頁渲染設定
   * @returns {Object} fetchList／handleSearch／resetSearch／renderPagination
   */
  const DEFAULT_LIST_CONTROLLER_DEFAULTS = {
    apiAction: "",
    getState: function () {
      return {};
    },
    setState: function () {},
    callApi: function () {
      return Promise.resolve(null);
    },
    toast: function () {},
    buildQuery: function (state, page) {
      return { page: page };
    },
    buildSuccessPatch: function () {
      return { loading: false };
    },
    readFilters: function () {
      return {};
    },
    buildResetPatch: function () {
      return {};
    },
    buildSearchExtraPatch: function () {
      return {};
    },
    resolveFailureMessage: function (result, fallback) {
      return (result && result.message) || fallback;
    },
    resolveErrorMessage: function (error, fallback) {
      return fallback;
    },
    normalizePage: function (requested, state) {
      return requested || (state && state.page) || 1;
    },
    canCallApi: function () {
      return true;
    },
    buildFetchKey: null,
    failureFallback: "讀取資料失敗",
    errorFallback: "讀取資料失敗，請稍後再試",
    pagination: {}
  };

  /**
   * 正規化清單控制器設定選項，採用常數字典集中指派預設值以消除語法樹分支膨脹。
   *
   * @param {Object} [config] - 外部傳入之組態物件
   * @returns {Object} 補齊預設值後的組態物件
   */
  function normalizeListControllerOptions_(config) {
    const src = config || {};
    const normalized = Object.assign({}, DEFAULT_LIST_CONTROLLER_DEFAULTS);
    const keys = Object.keys(DEFAULT_LIST_CONTROLLER_DEFAULTS);
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      if (src[k] !== undefined && src[k] !== null) {
        normalized[k] = src[k];
      }
    }
    return normalized;
  }

  /**
   * 建立共用列表控制器實例。
   *
   * @param {Object} [config] - 列表控制器組態物件
   * @returns {Object} 包含 fetchList, handleSearch, resetSearch, renderPagination, isCurrentRequest 之操作介面
   */
  function createListController(config) {
    const options = normalizeListControllerOptions_(config);
    const apiAction = options.apiAction;
    const getState = options.getState;
    const setState = options.setState;
    const callApi = options.callApi;
    const toast = options.toast;
    const buildQuery = options.buildQuery;
    const buildSuccessPatch = options.buildSuccessPatch;
    const readFilters = options.readFilters;
    const buildResetPatch = options.buildResetPatch;
    const buildSearchExtraPatch = options.buildSearchExtraPatch;
    const resolveFailureMessage = options.resolveFailureMessage;
    const resolveErrorMessage = options.resolveErrorMessage;
    const normalizePage = options.normalizePage;
    const canCallApi = options.canCallApi;
    const buildFetchKey = options.buildFetchKey;
    const failureFallback = options.failureFallback;
    const errorFallback = options.errorFallback;
    const pagination = options.pagination;

    /** 進行中的請求，以避免重複鍵為索引；未提供 buildFetchKey 時不啟用。 */
    const inflight = Object.create(null);
    let requestSeq = 0;

    /**
     * 檢查傳入之請求序號是否仍為最新一次請求（避免過期回應覆蓋新狀態）。
     *
     * @param {number} seq - 請求序號
     * @returns {boolean} 是否為當前有效請求
     */
    function isCurrentRequest(seq) {
      return seq === requestSeq;
    }

    /**
     * 套用失敗狀態，更新 state 並彈出 Toast 錯誤提示。
     *
     * @param {string} fallback - 預設錯誤文案
     * @param {*} error - 例外物件
     */
    function applyFailureState(fallback, error) {
      const current = getState();
      setState(Object.assign({}, current, { loading: false }));
      toast(resolveErrorMessage(error, fallback), "err");
    }

    /**
     * 處理 API 回應結果，過期回應自動忽略。
     *
     * @param {Object} result - API 回應物件
     * @param {number} seq - 請求序號
     * @param {number} page - 查詢頁碼
     * @returns {Object|undefined} 回應成果或 undefined
     */
    function handleResult(result, seq, page) {
      if (!isCurrentRequest(seq)) return undefined;
      const current = getState();
      if (!result || result.ok !== true) {
        setState(Object.assign({}, current, { loading: false }));
        toast(resolveFailureMessage(result, failureFallback), "err");
        return result || null;
      }
      setState(Object.assign({}, current, buildSuccessPatch(current, result, page)));
      return result;
    }

    /**
     * 處理 API 呼叫例外，過期請求直接忽略。
     *
     * @param {*} error - 捕捉之例外
     * @param {number} seq - 請求序號
     * @returns {null|undefined} null 或 undefined
     */
    function handleError(error, seq) {
      if (!isCurrentRequest(seq)) return undefined;
      applyFailureState(errorFallback, error);
      return null;
    }

    /**
     * 追蹤進行中之 Promise，在完成或拒絕時自 inflight 字典移除。
     *
     * @param {string} fetchKey - 快取鍵值
     * @param {Promise} pending - 進行中之 Promise
     * @returns {Promise} 追蹤包裹後之 Promise
     */
    function trackPending(fetchKey, pending) {
      if (!fetchKey) return pending;
      const tracked = pending.then(
        function (value) {
          delete inflight[fetchKey];
          return value;
        },
        function (error) {
          delete inflight[fetchKey];
          throw error;
        }
      );
      inflight[fetchKey] = tracked;
      return tracked;
    }

    /**
     * 發起清單查詢請求，相同避免重複鍵共享既有 Promise。
     *
     * @param {number} [page] - 指定目標頁碼
     * @returns {Promise<Object|null>} 查詢成果 Promise
     */
    function fetchList(page) {
      const before = getState();
      const targetPage = normalizePage(page, before);
      const query = buildQuery(before, targetPage);
      const fetchKey = buildFetchKey ? buildFetchKey(query) : "";
      if (fetchKey && Object.prototype.hasOwnProperty.call(inflight, fetchKey)) {
        return inflight[fetchKey];
      }
      if (!canCallApi()) return Promise.resolve(null);

      const requestId = ++requestSeq;
      setState(Object.assign({}, before, { loading: true, page: targetPage }));

      const pending = callApi(apiAction, query)
        .then(function (result) {
          return handleResult(result, requestId, targetPage);
        })
        .catch(function (error) {
          return handleError(error, requestId);
        });
      return trackPending(fetchKey, pending);
    }

    /**
     * 表單提交或搜尋觸發常式：讀取篩選欄位後重設回第 1 頁查詢。
     *
     * @param {Event} [event] - 表單提交事件
     * @returns {Promise<Object|null>} 查詢成果 Promise
     */
    function handleSearch(event) {
      if (event && event.preventDefault) event.preventDefault();
      const current = getState();
      setState(Object.assign({}, current, readFilters(), buildSearchExtraPatch(current)));
      return fetchList(1);
    }

    /**
     * 重設篩選條件並回到第 1 頁查詢。
     *
     * @returns {Promise<Object|null>} 查詢成果 Promise
     */
    function resetSearch() {
      const current = getState();
      setState(Object.assign({}, current, buildResetPatch(current)));
      return fetchList(1);
    }

    /**
     * 產生共用的上一頁／下一頁簡易分頁列 HTML。
     *
     * @param {Object} state - 目前狀態物件
     * @param {boolean} [loading] - 是否正在載入
     * @returns {string} 分頁工具列 HTML
     */
    function renderPagination(state, loading) {
      const normalize =
        pagination.normalize ||
        function (value) {
          return value || {};
        };
      const info = normalize(state);
      const totalPages = info.totalPages || 1;
      const currentPage = info.currentPage || 1;
      const number =
        pagination.number ||
        function (value) {
          return String(value === undefined || value === null ? "" : value);
        };
      const actionAttribute = pagination.actionAttribute || "data-action";
      return (
        '<div class="pagination-bar">' +
        '  <span class="pagination-info">共 ' +
        number(info.total) +
        " 筆紀錄 · 第 " +
        currentPage +
        " / " +
        totalPages +
        " 頁</span>" +
        '  <div class="pagination-buttons">' +
        '    <button type="button" class="btn secondary compact" ' +
        actionAttribute +
        '="page" data-page="' +
        (currentPage - 1) +
        '"' +
        (currentPage <= 1 || loading ? " disabled" : "") +
        ">上一頁</button>" +
        '    <button type="button" class="btn secondary compact" ' +
        actionAttribute +
        '="page" data-page="' +
        (currentPage + 1) +
        '"' +
        (currentPage >= totalPages || loading ? " disabled" : "") +
        ">下一頁</button>" +
        "  </div>" +
        "</div>"
      );
    }

    return {
      fetchList: fetchList,
      handleSearch: handleSearch,
      resetSearch: resetSearch,
      renderPagination: renderPagination,
      isCurrentRequest: isCurrentRequest
    };
  }

  return {
    createListController: createListController
  };
});
