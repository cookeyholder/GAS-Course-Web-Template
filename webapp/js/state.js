/**
 * @file state.js
 * @description 前端全域狀態容器與變更通知
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  const listeners = [];

  const initialState = {
    view: "loading", // "loading" | "login" | "app"
    tab: "overview", // "overview" | "import" | "courses" | "settings"
    user: null,
    publicConfig: null,
    loginBusy: false,
    loginError: "",
    importBusy: false,
    imports: {},
    importLast: null,
    courses: {
      list: [],
      total: 0,
      page: 1,
      pageSize: 30,
      totalPages: 1,
      keyword: "",
      department: "",
      academicYear: "",
      semester: "",
      loading: false
    },
    settings: {
      loading: false,
      saving: false,
      data: null,
      accounts: []
    }
  };

  MEA.state = Object.assign({}, initialState);

  function setState(patch) {
    if (!patch || typeof patch !== "object") return;
    Object.assign(MEA.state, patch);
    for (let i = 0; i < listeners.length; i++) {
      try {
        listeners[i](MEA.state);
      } catch (e) {
        console.error("[setState listener error]", e);
      }
    }
  }

  function subscribe(fn) {
    if (typeof fn === "function") {
      listeners.push(fn);
    }
    return function unsubscribe() {
      const idx = listeners.indexOf(fn);
      if (idx !== -1) listeners.splice(idx, 1);
    };
  }

  MEA.setState = setState;
  MEA.subscribe = subscribe;
})(window.MEA);
