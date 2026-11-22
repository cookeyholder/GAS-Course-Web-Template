/**
 * @file api.js
 * @description 前端 API 通訊層
 *
 * 1. 於 GAS HtmlService 容器內優先使用 google.script.run.executeWebApi（原生 RPC）
 * 2. 一般環境以 text/plain;charset=utf-8 POST 備援，避免 CORS 預檢
 * 3. 自動攜帶 Session Token 與 CSRF Token
 * 4. 可重試錯誤（network_error、lock_timeout、rate_limited）採指數退避重試
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    api.applyBrowserConfig(root, window);
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // task 6.4：共用 Node require 相容墊片與 safeErrors 注入解析（Node 由 require 取得，瀏覽器由全域取得）。
  const moduleHelpers = typeof require === "function" ? require("./moduleHelpers.js") : globalThis.MEA.moduleHelpers;

  const CSRF_STORAGE_KEY = "gas_tmpl.csrf.v1";

  /** 重試策略常數：指數退避 + jitter + 總時間上限 */
  const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000];
  const DEFAULT_TOTAL_RETRY_MS = 10000;
  const RETRY_JITTER_RATIO = 0.2;
  /** 大型匯入（大於或等於 GAS 分批寫入大小）停用自動重試，避免重複寫入 */
  const LARGE_IMPORT_ROW_THRESHOLD = 5000;

  /**
   * 解析後端回應之 JSON 字串，格式錯誤時回傳標準錯誤結構。純函式，無副作用。
   *
   * @param {string} text - 後端回應字串
   * @returns {Object} 解析後之物件或 invalid_response 錯誤物件
   */
  function parseApiResponse(text) {
    const invalid = {
      ok: false,
      error: "invalid_response",
      message: "後端回傳格式錯誤，請確認 Web App 部署是否正常"
    };
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === "object" ? parsed : invalid;
    } catch (error) {
      return invalid;
    }
  }

  /**
   * 建立 API 客戶端實例。
   *
   * @param {Object} [deps] - 依賴注入物件（支援 mock、google RPC、fetch、storage 測試替身）
   * @param {Object} [deps.config] - 前端設定物件
   * @param {Storage} [deps.storage] - 快取儲存實例（如 localStorage）
   * @param {Function} [deps.fetchFn] - 自訂 HTTP fetch 實作
   * @param {Function} [deps.getGoogle] - 取得 google.script.run 物件之回呼
   * @param {Function} [deps.getMock] - 取得 mock API 實例之回呼
   * @param {Function} [deps.setTimeoutFn] - 自訂延遲排程函式
   * @param {Function} [deps.randomFn] - 自訂隨機數產生函式
   * @returns {Object} API 客戶端操作介面
   */
  function createApiClient(deps) {
    const options = deps || {};
    const safeErrors = moduleHelpers.resolveSafeErrors(options);
    const config = options.config || {};
    const storage = options.storage || {
      getItem: function () {
        return null;
      },
      setItem: function () {},
      removeItem: function () {}
    };
    const fetchFn =
      typeof options.fetchFn === "function"
        ? options.fetchFn
        : typeof options.fetch === "function"
          ? options.fetch
          : null;
    const getGoogle =
      typeof options.getGoogle === "function"
        ? options.getGoogle
        : function () {
            return options.google || null;
          };
    const getMock =
      typeof options.getMock === "function"
        ? options.getMock
        : function () {
            return options.mock || null;
          };
    const setTimeoutFn =
      typeof options.setTimeoutFn === "function"
        ? options.setTimeoutFn
        : function (fn, ms) {
            return setTimeout(fn, ms);
          };
    const randomFn =
      typeof options.randomFn === "function"
        ? options.randomFn
        : function () {
            return Math.random();
          };

    let currentToken = "";
    let currentCsrfToken = "";

    /**
     * 安全讀取 storage，避免例外中斷流程。
     *
     * @param {string} key - 儲存鍵值
     * @returns {string|null} 讀取之字串，失敗或不存在時回傳 null
     */
    function safeStorageGet(key) {
      try {
        return storage.getItem(key);
      } catch (e) {
        return null;
      }
    }

    /**
     * 安全寫入 storage。
     *
     * @param {string} key - 儲存鍵值
     * @param {string} value - 欲寫入之字串
     */
    function safeStorageSet(key, value) {
      try {
        storage.setItem(key, value);
      } catch (e) {}
    }

    /**
     * 安全移除 storage 項目。
     *
     * @param {string} key - 儲存鍵值
     */
    function safeStorageRemove(key) {
      try {
        storage.removeItem(key);
      } catch (e) {}
    }

    try {
      currentToken = safeStorageGet(config.storageKey) || "";
      currentCsrfToken = safeStorageGet(CSRF_STORAGE_KEY) || "";
    } catch (e) {
      currentToken = "";
      currentCsrfToken = "";
    }

    /**
     * 取得目前保存之 Session Token。
     *
     * @returns {string} Session Token 字串
     */
    function getToken() {
      return currentToken;
    }

    /**
     * 設定並持久化 Session Token。
     *
     * @param {string} token - 新的 Token 字串（空值代表清除）
     */
    function setToken(token) {
      currentToken = token || "";
      if (currentToken) {
        safeStorageSet(config.storageKey, currentToken);
      } else {
        safeStorageRemove(config.storageKey);
      }
    }

    /**
     * 取得目前保存之 CSRF Token。
     *
     * @returns {string} CSRF Token 字串
     */
    function getCsrfToken() {
      return currentCsrfToken;
    }

    /**
     * 設定並持久化 CSRF Token。
     *
     * @param {string} csrfToken - 新的 CSRF Token 字串（空值代表清除）
     */
    function setCsrfToken(csrfToken) {
      currentCsrfToken = csrfToken || "";
      if (currentCsrfToken) {
        safeStorageSet(CSRF_STORAGE_KEY, currentCsrfToken);
      } else {
        safeStorageRemove(CSRF_STORAGE_KEY);
      }
    }

    /**
     * 組裝帶有 action、token 與 csrfToken 之請求內容。純函式。
     *
     * @param {string} action - API 動作名稱
     * @param {Object} [payload] - 額外參數
     * @returns {Object} 完整請求物件
     */
    function buildRequestBody(action, payload) {
      const source = payload || {};
      return Object.assign({}, source, {
        action: action,
        token: source.token || currentToken,
        csrfToken: source.csrfToken || currentCsrfToken
      });
    }

    /**
     * 判斷目前是否應使用 Mock 模式處理請求。
     *
     * @returns {boolean} 是否啟用且具備 Mock 處理常式
     */
    function canUseMock() {
      const mock = getMock();
      return !!(config.mock && mock && typeof mock.handle === "function");
    }

    /**
     * 透過 Mock 介面發送請求。
     *
     * @param {string} action - API 動作名稱
     * @param {Object} body - 請求本體物件
     * @returns {Promise<Object>} Mock 回應之 Promise
     */
    function requestViaMock(action, body) {
      const mock = getMock();
      return mock.handle(action, body);
    }

    /**
     * 取得 Google Apps Script 原生 RPC 執行器。
     *
     * @returns {Object|null} google.script.run 物件或 null
     */
    function getRpcRunner() {
      const google = getGoogle();
      if (google && google.script && typeof google.script.run === "object") {
        return google.script.run;
      }
      return null;
    }

    /**
     * 正規化 RPC 回應成果，確保回傳標準物件。
     *
     * @param {*} result - 原生回傳值（字串、物件或空值）
     * @returns {Object} 解析後回應或 invalid_response 錯誤物件
     */
    function normalizeRpcResult(result) {
      if (typeof result === "string") {
        return parseApiResponse(result);
      }
      if (result && typeof result === "object") {
        return result;
      }
      return {
        ok: false,
        error: "invalid_response",
        message: "後端回傳空回應"
      };
    }

    /**
     * 建立標準化的 RPC 執行錯誤物件。
     *
     * @param {*} error - 捕捉到之例外物件
     * @returns {Object} 標準 server_error 物件
     */
    function createRpcError(error) {
      return {
        ok: false,
        error: "server_error",
        message: safeErrors.resolveSafeMessage(error, "後端執行失敗，請稍後再試")
      };
    }

    /**
     * 透過 Google Apps Script 原生 RPC（google.script.run）發送請求。
     *
     * @param {Object} runner - google.script.run 物件
     * @param {Object} body - 請求參數本體
     * @returns {Promise<Object>} RPC 解析後之回應 Promise
     */
    function requestViaRpc(runner, body) {
      return new Promise(function (resolve) {
        function resolveRpcError(error) {
          resolve(createRpcError(error));
        }

        try {
          runner
            .withSuccessHandler(function (result) {
              resolve(normalizeRpcResult(result));
            })
            .withFailureHandler(resolveRpcError)
            .executeWebApi(body);
        } catch (error) {
          resolveRpcError(error);
        }
      });
    }

    /**
     * 建立遺漏 API 網址時之標準錯誤回應。
     *
     * @returns {Promise<Object>} missing_api_url 錯誤 Promise
     */
    function createMissingApiUrlError() {
      return Promise.resolve({
        ok: false,
        error: "missing_api_url",
        message: "尚未設定 Web App API 網址，若於本機預覽請於網址加上 ?mock=true 啟用模擬資料"
      });
    }

    /**
     * 處理 fetch HTTP 回應，檢查狀態碼並解析內容。
     *
     * @param {Response} response - Fetch 回應物件
     * @returns {Promise<Object>} 解析後 JSON 資料
     * @throws {Error} 當 HTTP 狀態碼非 2xx 時拋出具安全訊息之 Error
     */
    function handleFetchResponse(response) {
      if (response.ok === false) {
        const error = safeErrors.createSafeError("伺服器回應 HTTP " + response.status + "，請稍後再試");
        error.status = response.status;
        throw error;
      }
      if (typeof response.text === "function") {
        return response.text().then(parseApiResponse);
      }
      return response.json();
    }

    /**
     * 建立網路連線異常時之標準錯誤回應物件。
     *
     * @param {*} error - 連線例外或錯誤物件
     * @returns {Object} 標準 network_error 物件
     */
    function createNetworkError(error) {
      return {
        ok: false,
        error: "network_error",
        message: safeErrors.resolveSafeMessage(error, "無法連線至 Google Apps Script 伺服器，請確認網路連線或稍後再試")
      };
    }

    /**
     * 透過 HTTP Fetch 發送 POST 請求（使用 text/plain;charset=utf-8 避開 OPTIONS 預檢）。
     *
     * @param {Object} body - 請求參數本體
     * @returns {Promise<Object>} 伺服器回應或連線錯誤 Promise
     */
    function requestViaFetch(body) {
      const apiUrl = config.apiUrl;
      if (!apiUrl) {
        return createMissingApiUrlError();
      }
      if (typeof fetchFn !== "function") {
        return Promise.resolve(createNetworkError(safeErrors.createSafeError("尚未取得瀏覽器連線功能，請稍後再試")));
      }
      return fetchFn(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        },
        body: JSON.stringify(body),
        redirect: "follow"
      })
        .then(handleFetchResponse)
        .catch(createNetworkError);
    }

    /**
     * 單次執行請求（依環境依序採用 Mock、RPC 或 Fetch）。
     *
     * @param {string} action - API 動作名稱
     * @param {Object} [payload] - 額外參數
     * @returns {Promise<Object>} 單次呼叫回應 Promise
     */
    function requestOnce(action, payload) {
      const body = buildRequestBody(action, payload);
      if (canUseMock()) {
        return requestViaMock(action, body);
      }

      const runner = getRpcRunner();
      if (runner) {
        return requestViaRpc(runner, body);
      }

      return requestViaFetch(body);
    }

    /**
     * 判斷後端錯誤代碼是否屬於可重試類別（rate_limited, lock_timeout, network_error）。
     *
     * @param {Object} result - API 呼叫成果物件
     * @returns {boolean} 是否符合重試條件
     */
    function isRetryableResult(result) {
      return !!(
        result &&
        (result.error === "rate_limited" || result.error === "lock_timeout" || result.error === "network_error")
      );
    }

    /**
     * 判斷是否為大型匯入請求（大於或等於分批閥值），避免自動重試造成重複匯入。
     *
     * @param {string} action - 動作名稱
     * @param {Object} [payload] - 參數物件
     * @returns {boolean} 是否為大型匯入
     */
    function isLargeImportPayload(action, payload) {
      if (action !== "importCourseCodes") return false;
      const rows = payload && payload.rows;
      return Array.isArray(rows) && rows.length >= LARGE_IMPORT_ROW_THRESHOLD;
    }

    /**
     * 評估特定請求是否允許自動重試。
     *
     * @param {string} action - 動作名稱
     * @param {Object} [payload] - 參數物件
     * @param {Object} opts - 呼叫選項
     * @returns {boolean} 是否允許重試
     */
    function shouldAutoRetry(action, payload, opts) {
      if (opts.retry === false) return false;
      return !isLargeImportPayload(action, payload);
    }

    /**
     * 計算帶有隨機擾動（jitter）之退避重試延遲時間。
     *
     * @param {number} baseDelay - 基準延遲（毫秒）
     * @param {Object} opts - 呼叫選項（可包含 maxSingleDelayMs）
     * @returns {number} 實際延遲毫秒數
     */
    function computeRetryDelay(baseDelay, opts) {
      const jitter = 1 + (randomFn() * 2 - 1) * RETRY_JITTER_RATIO;
      const jittered = Math.max(0, Math.round(baseDelay * jitter));
      return typeof opts.maxSingleDelayMs === "number"
        ? Math.min(jittered, Math.max(0, opts.maxSingleDelayMs))
        : jittered;
    }

    /**
     * 具備自動指數退避與 Jitter 重試機制之 API 呼叫函式。
     *
     * @param {string} action - API 動作名稱
     * @param {Object} [payload] - 額外參數
     * @param {Object} [callOptions] - 重試與連線設定選項
     * @returns {Promise<Object>} API 回應 Promise
     */
    function callWithRetry(action, payload, callOptions) {
      const opts = callOptions || {};
      const delays = Array.isArray(opts.delays) ? opts.delays : DEFAULT_RETRY_DELAYS;
      const totalRetryMs =
        typeof opts.totalRetryMs === "number" ? Math.max(0, opts.totalRetryMs) : DEFAULT_TOTAL_RETRY_MS;
      const allowRetry = shouldAutoRetry(action, payload, opts);
      let attempt = 0;
      let elapsed = 0;

      function execute() {
        return requestOnce(action, payload).then(function (result) {
          const canRetry =
            result &&
            result.ok !== true &&
            isRetryableResult(result) &&
            allowRetry &&
            attempt < delays.length &&
            elapsed < totalRetryMs;
          if (canRetry) {
            const remaining = totalRetryMs - elapsed;
            const delay = Math.min(computeRetryDelay(delays[attempt], opts), remaining);
            attempt++;
            elapsed += delay;
            return new Promise(function (resolve) {
              setTimeoutFn(resolve, delay);
            }).then(execute);
          }

          if (result && result.csrfToken) {
            setCsrfToken(result.csrfToken);
          }
          return result;
        });
      }

      return execute();
    }

    /**
     * API 呼叫主要外顯介面，預設套用指數退避重試策略。
     *
     * @param {string} action - API 動作名稱
     * @param {Object} [payload] - 額外參數
     * @param {Object} [callOptions] - 重試與連線設定選項
     * @returns {Promise<Object>} API 回應 Promise
     */
    function call(action, payload, callOptions) {
      return callWithRetry(action, payload, callOptions);
    }

    /**
     * 查詢操作日誌：沿用共用的 call 通道，維持 text/plain;charset=utf-8 請求格式。
     *
     * @param {Object} [payload] - 查詢參數（日期區間、操作者、類別與分頁）
     * @returns {Promise<Object>} 日誌查詢回應
     */
    function getActivityLog(payload) {
      return call("getActivityLog", payload);
    }

    return {
      getToken: getToken,
      setToken: setToken,
      getCsrfToken: getCsrfToken,
      setCsrfToken: setCsrfToken,
      call: call,
      getActivityLog: getActivityLog,
      callWithRetry: callWithRetry,
      requestOnce: requestOnce,
      parseApiResponse: parseApiResponse
    };
  }

  /**
   * 將瀏覽器環境依賴組裝為 MEA.api（從 UMD 外層抽出以便測試）。
   *
   * @param {Object} root - 全域命名空間物件（通常為 globalThis）
   * @param {Object} win - 瀏覽器 window 物件
   * @returns {Object} 建立的 API 客戶端
   */
  function applyBrowserConfig(root, win) {
    const namespace = root || {};
    const browser = win || {};
    const MEA = (namespace.MEA = namespace.MEA || {});
    const storage = browser.localStorage || {
      getItem: function () {
        return null;
      },
      setItem: function () {},
      removeItem: function () {}
    };
    const client = createApiClient({
      config: MEA.config || {},
      safeErrors: MEA.safeErrors,
      storage: storage,
      fetchFn: typeof browser.fetch === "function" ? browser.fetch.bind(browser) : null,
      google: browser.google || null,
      getMock: function () {
        return MEA.mock || null;
      },
      setTimeoutFn: function (fn, ms) {
        return browser.setTimeout(fn, ms);
      }
    });
    MEA.api = client;
    return client;
  }

  return {
    createApiClient: createApiClient,
    parseApiResponse: parseApiResponse,
    applyBrowserConfig: applyBrowserConfig,
    CSRF_STORAGE_KEY: CSRF_STORAGE_KEY,
    DEFAULT_RETRY_DELAYS: DEFAULT_RETRY_DELAYS,
    DEFAULT_TOTAL_RETRY_MS: DEFAULT_TOTAL_RETRY_MS,
    RETRY_JITTER_RATIO: RETRY_JITTER_RATIO,
    LARGE_IMPORT_ROW_THRESHOLD: LARGE_IMPORT_ROW_THRESHOLD
  };
});
