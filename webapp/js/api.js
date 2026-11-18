/**
 * @file api.js
 * @description 前端 API 通訊層
 *
 * 1. 於 GAS HtmlService 容器內優先使用 google.script.run.executeWebApi（原生 RPC）
 * 2. 一般環境以 text/plain;charset=utf-8 POST 備援，避免 CORS 預檢
 * 3. 自動攜帶 Session Token 與 CSRF Token
 * 4. 可重試錯誤（network_error、lock_timeout、rate_limited）採指數退避重試
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  const csrfStorageKey = "gas_tmpl.csrf.v1";

  let currentToken = "";
  let currentCsrfToken = "";

  try {
    currentToken = window.localStorage.getItem(MEA.config.storageKey) || "";
    currentCsrfToken = window.localStorage.getItem(csrfStorageKey) || "";
  } catch (e) {
    currentToken = "";
    currentCsrfToken = "";
  }

  function getToken() {
    return currentToken;
  }

  function setToken(token) {
    currentToken = token || "";
    try {
      if (currentToken) {
        window.localStorage.setItem(MEA.config.storageKey, currentToken);
      } else {
        window.localStorage.removeItem(MEA.config.storageKey);
      }
    } catch (e) {}
  }

  function getCsrfToken() {
    return currentCsrfToken;
  }

  function setCsrfToken(csrfToken) {
    currentCsrfToken = csrfToken || "";
    try {
      if (currentCsrfToken) {
        window.localStorage.setItem(csrfStorageKey, currentCsrfToken);
      } else {
        window.localStorage.removeItem(csrfStorageKey);
      }
    } catch (e) {}
  }

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

  function requestOnce(action, payload) {
    if (MEA.config.mock && MEA.mock && typeof MEA.mock.handle === "function") {
      const mockBody = Object.assign({}, payload || {}, {
        action: action,
        token: (payload && payload.token) || currentToken,
        csrfToken: (payload && payload.csrfToken) || currentCsrfToken
      });
      return MEA.mock.handle(action, mockBody);
    }

    const body = Object.assign({}, payload || {}, {
      action: action,
      token: (payload && payload.token) || currentToken,
      csrfToken: (payload && payload.csrfToken) || currentCsrfToken
    });

    // GAS HtmlService 容器內優先使用原生 RPC，避免跨來源 fetch 問題
    if (typeof window.google !== "undefined" && window.google.script && typeof window.google.script.run === "object") {
      return new Promise(function (resolve) {
        function resolveRpcError(error) {
          resolve({
            ok: false,
            error: "server_error",
            message: "後端執行失敗：" + String(error && error.message ? error.message : error)
          });
        }

        try {
          window.google.script.run
            .withSuccessHandler(function (result) {
              if (typeof result === "string") {
                resolve(parseApiResponse(result));
                return;
              }
              if (result && typeof result === "object") {
                resolve(result);
                return;
              }
              resolve({
                ok: false,
                error: "invalid_response",
                message: "後端回傳空回應"
              });
            })
            .withFailureHandler(resolveRpcError)
            .executeWebApi(body);
        } catch (error) {
          resolveRpcError(error);
        }
      });
    }

    const apiUrl = MEA.config.apiUrl;
    if (!apiUrl) {
      return Promise.resolve({
        ok: false,
        error: "missing_api_url",
        message: "尚未設定 Web App API 網址，若於本機預覽請於網址加上 ?mock=true 啟用模擬資料"
      });
    }

    return fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(body),
      redirect: "follow"
    })
      .then(function (response) {
        if (response.ok === false) {
          throw new Error("HTTP " + response.status);
        }
        if (typeof response.text === "function") {
          return response.text().then(parseApiResponse);
        }
        return response.json();
      })
      .catch(function (error) {
        return {
          ok: false,
          error: "network_error",
          message:
            "無法連線至 Google Apps Script 伺服器（" +
            String(error && error.message ? error.message : error) +
            "），請確認網路連線或稍後再試"
        };
      });
  }

  function callWithRetry(action, payload, options) {
    options = options || {};
    const delays = Array.isArray(options.delays) ? options.delays : [1000, 2000, 4000];
    let attempt = 0;

    function execute() {
      return requestOnce(action, payload).then(function (result) {
        const isRetryableError =
          result &&
          (result.error === "rate_limited" || result.error === "lock_timeout" || result.error === "network_error");

        if (result && result.ok !== true && isRetryableError && attempt < delays.length) {
          const delay = delays[attempt];
          attempt++;
          return new Promise(function (resolve) {
            setTimeout(resolve, delay);
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

  function call(action, payload) {
    return callWithRetry(action, payload);
  }

  MEA.api = {
    getToken: getToken,
    setToken: setToken,
    getCsrfToken: getCsrfToken,
    setCsrfToken: setCsrfToken,
    call: call,
    callWithRetry: callWithRetry
  };
})(window.MEA);
