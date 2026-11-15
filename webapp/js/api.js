/**
 * @file api.js
 * @description 前端 API 通訊層
 *
 * 以 text/plain;charset=utf-8 發送 JSON 請求避免 CORS 預檢，
 * 並自動攜帶 Session Token。
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  let currentToken = "";
  try {
    currentToken = window.localStorage.getItem(MEA.config.storageKey) || "";
  } catch (e) {
    currentToken = "";
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
    } catch (e) {
      // 忽略儲存錯誤
    }
  }

  function call(action, payload) {
    if (MEA.config.mock && MEA.mock && typeof MEA.mock.handle === "function") {
      return MEA.mock.handle(action, payload);
    }

    const apiUrl = MEA.config.apiUrl;
    if (!apiUrl) {
      return Promise.resolve({
        ok: false,
        error: "missing_api_url",
        message: "尚未設定 Web App API 網址，若於本機預覽請於網址加上 ?mock=true 啟用模擬資料"
      });
    }

    const body = Object.assign({}, payload || {}, {
      action: action,
      token: (payload && payload.token) || currentToken
    });

    return fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(body)
    })
      .then(function (response) {
        return response.json();
      })
      .catch(function (error) {
        return {
          ok: false,
          error: "network_error",
          message: "無法連線至 Google Apps Script 伺服器，請檢查網路連線或稍後再試"
        };
      });
  }

  MEA.api = {
    getToken: getToken,
    setToken: setToken,
    call: call
  };
})(window.MEA);
