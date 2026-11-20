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
  function createListController(config) {
    const options = config || {};
    const apiAction = options.apiAction || "";
    const getState =
      options.getState ||
      function () {
        return {};
      };
    const setState = options.setState || function () {};
    const callApi =
      options.callApi ||
      function () {
        return Promise.resolve(null);
      };
    const toast = options.toast || function () {};
    const buildQuery =
      options.buildQuery ||
      function (state, page) {
        return { page: page };
      };
    const buildSuccessPatch =
      options.buildSuccessPatch ||
      function () {
        return { loading: false };
      };
    const readFilters =
      options.readFilters ||
      function () {
        return {};
      };
    const buildResetPatch =
      options.buildResetPatch ||
      function () {
        return {};
      };
    const buildSearchExtraPatch =
      options.buildSearchExtraPatch ||
      function () {
        return {};
      };
    const resolveFailureMessage =
      options.resolveFailureMessage ||
      function (result, fallback) {
        return (result && result.message) || fallback;
      };
    const resolveErrorMessage =
      options.resolveErrorMessage ||
      function (error, fallback) {
        return fallback;
      };
    const normalizePage =
      options.normalizePage ||
      function (requested, state) {
        return requested || state.page || 1;
      };
    const canCallApi =
      options.canCallApi ||
      function () {
        return true;
      };
    const buildFetchKey = options.buildFetchKey || null;
    const failureFallback = options.failureFallback || "讀取資料失敗";
    const errorFallback = options.errorFallback || "讀取資料失敗，請稍後再試";
    const pagination = options.pagination || {};

    /** 進行中的請求，以避免重複鍵為索引；未提供 buildFetchKey 時不啟用。 */
    const inflight = Object.create(null);
    let requestSeq = 0;

    /** 只接受最新一次清單請求的回應，避免過期回應覆蓋新篩選結果。 */
    function isCurrentRequest(seq) {
      return seq === requestSeq;
    }

    /** 將失敗狀態標記為非載入中並顯示安全文案。 */
    function applyFailureState(fallback, error) {
      const current = getState();
      setState(Object.assign({}, current, { loading: false }));
      toast(resolveErrorMessage(error, fallback), "err");
    }

    /** 處理 successful／失敗回應；過期請求直接捨棄。 */
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

    /** 處理例外；過期請求直接捨棄，不干擾使用者。 */
    function handleError(error, seq) {
      if (!isCurrentRequest(seq)) return undefined;
      applyFailureState(errorFallback, error);
      return null;
    }

    /** 清除避免重複記錄，並保留原本的解析值或拒絕原因。 */
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

    /** 讀取清單；相同避免重複鍵的進行中請求共享同一個 Promise。 */
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

    /** 明確觸發搜尋：讀取表單、更新狀態後回到第一頁。 */
    function handleSearch(event) {
      if (event && event.preventDefault) event.preventDefault();
      const current = getState();
      setState(Object.assign({}, current, readFilters(), buildSearchExtraPatch(current)));
      return fetchList(1);
    }

    /** 重設篩選條件後回到第一頁。 */
    function resetSearch() {
      const current = getState();
      setState(Object.assign({}, current, buildResetPatch(current)));
      return fetchList(1);
    }

    /** 產生共用的上一頁／下一頁分頁列。 */
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
