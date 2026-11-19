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

  // Node.js 環境載入共用模組；瀏覽器環境由 errorMessages.js 預先掛至 MEA。
  if (typeof module !== "undefined" && module.exports) {
    require("./errorMessages.js");
  }

  function resolveSafeMessage(value, fallback) {
    return globalThis.MEA.safeErrors.resolveUserMessage(value, fallback);
  }

  function createSafeError(message) {
    return globalThis.MEA.safeErrors.createSafeError(message);
  }

  const CSRF_STORAGE_KEY = "gas_tmpl.csrf.v1";

  /** 重試策略常數：指數退避 + jitter + 總時間上限 */
  const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000];
  const DEFAULT_TOTAL_RETRY_MS = 10000;
  const RETRY_JITTER_RATIO = 0.2;
  /** 大型匯入（大於或等於 GAS 分批寫入大小）停用自動重試，避免重複寫入 */
  const LARGE_IMPORT_ROW_THRESHOLD = 5000;

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

  function createApiClient(deps) {
    const options = deps || {};
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

    function safeStorageGet(key) {
      try {
        return storage.getItem(key);
      } catch (e) {
        return null;
      }
    }

    function safeStorageSet(key, value) {
      try {
        storage.setItem(key, value);
      } catch (e) {}
    }

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

    function getToken() {
      return currentToken;
    }

    function setToken(token) {
      currentToken = token || "";
      if (currentToken) {
        safeStorageSet(config.storageKey, currentToken);
      } else {
        safeStorageRemove(config.storageKey);
      }
    }

    function getCsrfToken() {
      return currentCsrfToken;
    }

    function setCsrfToken(csrfToken) {
      currentCsrfToken = csrfToken || "";
      if (currentCsrfToken) {
        safeStorageSet(CSRF_STORAGE_KEY, currentCsrfToken);
      } else {
        safeStorageRemove(CSRF_STORAGE_KEY);
      }
    }

    function buildRequestBody(action, payload) {
      const source = payload || {};
      return Object.assign({}, source, {
        action: action,
        token: source.token || currentToken,
        csrfToken: source.csrfToken || currentCsrfToken
      });
    }

    function canUseMock() {
      const mock = getMock();
      return !!(config.mock && mock && typeof mock.handle === "function");
    }

    function requestViaMock(action, body) {
      const mock = getMock();
      return mock.handle(action, body);
    }

    function getRpcRunner() {
      const google = getGoogle();
      if (google && google.script && typeof google.script.run === "object") {
        return google.script.run;
      }
      return null;
    }

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

    function createRpcError(error) {
      return {
        ok: false,
        error: "server_error",
        message: resolveSafeMessage(error, "後端執行失敗，請稍後再試")
      };
    }

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

    function createMissingApiUrlError() {
      return Promise.resolve({
        ok: false,
        error: "missing_api_url",
        message: "尚未設定 Web App API 網址，若於本機預覽請於網址加上 ?mock=true 啟用模擬資料"
      });
    }

    function handleFetchResponse(response) {
      if (response.ok === false) {
        const error = createSafeError("伺服器回應 HTTP " + response.status + "，請稍後再試");
        error.status = response.status;
        throw error;
      }
      if (typeof response.text === "function") {
        return response.text().then(parseApiResponse);
      }
      return response.json();
    }

    function createNetworkError(error) {
      return {
        ok: false,
        error: "network_error",
        message: resolveSafeMessage(error, "無法連線至 Google Apps Script 伺服器，請確認網路連線或稍後再試")
      };
    }

    function requestViaFetch(body) {
      const apiUrl = config.apiUrl;
      if (!apiUrl) {
        return createMissingApiUrlError();
      }
      if (typeof fetchFn !== "function") {
        return Promise.resolve(createNetworkError(createSafeError("尚未取得瀏覽器連線功能，請稍後再試")));
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

    function isRetryableResult(result) {
      return !!(
        result &&
        (result.error === "rate_limited" || result.error === "lock_timeout" || result.error === "network_error")
      );
    }

    /** 大型匯入不自動重送，避免 response 遺失時重複清除與寫入 */
    function isLargeImportPayload(action, payload) {
      if (action !== "importCourseCodes") return false;
      const rows = payload && payload.rows;
      return Array.isArray(rows) && rows.length >= LARGE_IMPORT_ROW_THRESHOLD;
    }

    function shouldAutoRetry(action, payload, opts) {
      if (opts.retry === false) return false;
      return !isLargeImportPayload(action, payload);
    }

    /** 在基準延遲上加入正負 20% jitter，避免並行請求同時重試 */
    function computeRetryDelay(baseDelay, opts) {
      const jitter = 1 + (randomFn() * 2 - 1) * RETRY_JITTER_RATIO;
      const jittered = Math.max(0, Math.round(baseDelay * jitter));
      return typeof opts.maxSingleDelayMs === "number"
        ? Math.min(jittered, Math.max(0, opts.maxSingleDelayMs))
        : jittered;
    }

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

    function call(action, payload, callOptions) {
      return callWithRetry(action, payload, callOptions);
    }

    return {
      getToken: getToken,
      setToken: setToken,
      getCsrfToken: getCsrfToken,
      setCsrfToken: setCsrfToken,
      call: call,
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
