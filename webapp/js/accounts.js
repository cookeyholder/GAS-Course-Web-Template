/**
 * @file accounts.js
 * @description 系統設定與存取授權白名單（RBAC）管理模組（可測試工廠）。
 *
 * 瀏覽器環境組裝 window.MEA.accounts；Node.js 環境匯出 createAccountsModule 供單元測試注入依賴。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    MEA.accounts = api.createAccountsModule({
      MEA: MEA,
      document: window.document
    });
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const safeErrorsFallback = typeof module !== "undefined" && module.exports ? require("./errorMessages.js") : null;

  function getSafeErrors() {
    const globalNamespace = typeof globalThis !== "undefined" ? globalThis : {};
    return (globalNamespace.MEA && globalNamespace.MEA.safeErrors) || safeErrorsFallback;
  }

  function resolveSafeMessage(value, fallback) {
    const helper = getSafeErrors();
    return helper ? helper.resolveUserMessage(value, fallback) : fallback;
  }

  /**
   * 建立帳號與系統設定模組控制器。
   *
   * @param {Object} [deps] - 依賴注入（MEA、document）
   * @returns {Object} 公開方法集合（與 MEA.accounts 一致）
   */
  function createAccountsModule(deps) {
    const options = deps || {};
    const MEA = options.MEA || (typeof window !== "undefined" ? window.MEA : null) || {};
    const doc = options.document || (typeof document !== "undefined" ? document : null);

    /**
     * 以注入的 document 取得元素，缺損時回傳 null。
     *
     * @param {string} id - 元素識別碼
     * @returns {Object|null} 元素或 null
     */
    function getElementById(id) {
      return doc && typeof doc.getElementById === "function" ? doc.getElementById(id) : null;
    }

    /**
     * 統一錯誤訊息轉譯。
     *
     * @param {*} error - 錯誤物件或字串
     * @param {string} fallback - 原始例外不外顯時使用的文案
     * @returns {string} 可顯示的錯誤訊息
     */
    function normalizeErrorMessage(error, fallback) {
      return resolveSafeMessage(error, fallback);
    }

    function loadSettingsAndAccounts() {
      MEA.setState({
        settings: Object.assign({}, MEA.state.settings || {}, { loading: true })
      });

      Promise.all([MEA.api.call("getSystemSettings", {}), MEA.api.call("getAccounts", {})])
        .then(function (results) {
          const settingsRes = results[0];
          const accountsRes = results[1];

          MEA.setState({
            settings: {
              loading: false,
              saving: false,
              data: settingsRes && settingsRes.settings ? settingsRes.settings : {},
              accounts: accountsRes && accountsRes.accounts ? accountsRes.accounts : []
            }
          });
        })
        .catch(function (error) {
          MEA.setState({
            settings: Object.assign({}, MEA.state.settings || {}, { loading: false })
          });
          MEA.ui.toast(normalizeErrorMessage(error, "讀取系統設定失敗，請稍後再試"), "err");
        });
    }

    /**
     * 讀取系統設定表單欄位。
     *
     * @returns {Object} 表單值快照
     */
    function collectSettingsFormValues() {
      const systemNameInput = getElementById("cfgSystemName");
      const schoolYearInput = getElementById("cfgSchoolYear");
      const semesterInput = getElementById("cfgSemester");
      const clientIdInput = getElementById("cfgClientId");
      const clientSecretInput = getElementById("cfgClientSecret");
      const allowedDomainInput = getElementById("cfgAllowedDomain");
      const restrictInput = getElementById("cfgRestrictWhitelist");

      return {
        systemName: systemNameInput ? systemNameInput.value.trim() : "",
        schoolYear: schoolYearInput ? schoolYearInput.value.trim() : "",
        semester: semesterInput ? semesterInput.value.trim() : "",
        clientId: clientIdInput ? clientIdInput.value.trim() : "",
        clientSecret: clientSecretInput ? clientSecretInput.value.trim() : "",
        allowedLoginDomain: allowedDomainInput ? allowedDomainInput.value.trim().replace(/^@/, "").toLowerCase() : "",
        restrict: !!(restrictInput && restrictInput.checked)
      };
    }

    /**
     * 由表單值建構後端儲存參數。
     *
     * @param {Object} values - 表單值快照
     * @returns {Object} API payload
     */
    function buildSettingsPayload(values) {
      return {
        settings: {
          systemName: values.systemName,
          schoolYear: values.schoolYear,
          semester: values.semester,
          clientId: values.clientId,
          clientSecret: values.clientSecret,
          allowedLoginDomain: values.allowedLoginDomain,
          restrictWhitelist: values.restrict ? "true" : "false"
        }
      };
    }

    /**
     * 由表單值建構前端公眾設定更新片段。
     *
     * @param {Object} values - 表單值快照
     * @returns {Object} publicConfig 更新片段
     */
    function buildPublicConfigPatch(values) {
      return {
        systemName: values.systemName,
        schoolYear: values.schoolYear,
        semester: values.semester,
        clientId: values.clientId,
        allowedDomain: values.allowedLoginDomain,
        hasClientSecret: Boolean(values.clientSecret)
      };
    }

    /**
     * 結束儲存中狀態。
     */
    function finishSettingsSaving() {
      MEA.setState({
        settings: Object.assign({}, MEA.state.settings || {}, { saving: false })
      });
    }

    /**
     * 處理系統設定儲存結果（原 saveSettings 的 then 回呼）。
     *
     * @param {Object} result - API 回應
     * @param {Object} values - 表單值快照
     */
    function handleSettingsSaveResult(result, values) {
      finishSettingsSaving();
      if (result && result.ok) {
        MEA.ui.toast("系統參數已成功儲存！", "ok");
        if (MEA.state.publicConfig) {
          MEA.setState({
            publicConfig: Object.assign({}, MEA.state.publicConfig, buildPublicConfigPatch(values))
          });
        }
      } else {
        MEA.ui.toast((result && result.message) || "儲存失敗", "err");
      }
    }

    function saveSettings(e) {
      if (e && e.preventDefault) e.preventDefault();
      const values = collectSettingsFormValues();

      MEA.setState({
        settings: Object.assign({}, MEA.state.settings || {}, { saving: true })
      });

      MEA.api
        .call("saveSystemSettings", buildSettingsPayload(values))
        .then(function (result) {
          handleSettingsSaveResult(result, values);
        })
        .catch(function (error) {
          finishSettingsSaving();
          MEA.ui.toast(normalizeErrorMessage(error, "儲存系統設定失敗，請稍後再試"), "err");
        });
    }

    /**
     * 讀取新增授權成員表單欄位。
     *
     * @returns {Object} 表單值快照
     */
    function readNewAccountValues() {
      const emailInput = getElementById("newAccountEmail");
      const nameInput = getElementById("newAccountName");
      const roleSelect = getElementById("newAccountRole");

      return {
        email: emailInput ? emailInput.value.trim().toLowerCase() : "",
        name: nameInput ? nameInput.value.trim() : "",
        role: roleSelect ? roleSelect.value : "viewer"
      };
    }

    /**
     * 檢查 Email 是否已在白名單中。
     *
     * @param {Array<Object>} accounts - 現有帳號陣列
     * @param {string} email - 待檢查 Email
     * @returns {boolean} 是否已存在
     */
    function isDuplicateEmail(accounts, email) {
      for (let i = 0; i < accounts.length; i++) {
        if (accounts[i].email === email) return true;
      }
      return false;
    }

    /**
     * 由表單值產生更新後的帳號陣列。
     *
     * @param {Array<Object>} accounts - 現有帳號陣列
     * @param {Object} values - 表單值快照
     * @returns {Array<Object>} 更新後的帳號陣列
     */
    function buildUpdatedAccounts(accounts, values) {
      return accounts.concat([
        {
          email: values.email,
          name: values.name || values.email,
          role: values.role,
          roleName: MEA.config.roleNames[values.role] || values.role,
          enabled: true
        }
      ]);
    }

    /**
     * 處理「新增」按鈕點擊（原 addAccountPrompt 的 onClick 回呼）。
     */
    function handleAddAccountClick() {
      const values = readNewAccountValues();
      if (!values.email || values.email.indexOf("@") === -1) {
        MEA.ui.toast("請填寫有效的 Email", "warn");
        return;
      }

      const cur = (MEA.state.settings && MEA.state.settings.accounts) || [];
      if (isDuplicateEmail(cur, values.email)) {
        MEA.ui.toast("此 Email 已在白名單中", "warn");
        return;
      }

      saveAccountsList(buildUpdatedAccounts(cur, values));
      MEA.ui.closeModal();
    }

    function addAccountPrompt() {
      const html =
        '<div class="form-group">' +
        '  <label class="label" for="newAccountEmail">Google Email</label>' +
        '  <input type="email" id="newAccountEmail" class="input" placeholder="user@example.com" />' +
        "</div>" +
        '<div class="form-group mt-2">' +
        '  <label class="label" for="newAccountName">姓名或職稱</label>' +
        '  <input type="text" id="newAccountName" class="input" placeholder="王小明" />' +
        "</div>" +
        '<div class="form-group mt-2">' +
        '  <label class="label" for="newAccountRole">指派角色</label>' +
        '  <select id="newAccountRole" class="select">' +
        '    <option value="viewer">檢視人員 (viewer)</option>' +
        '    <option value="staff">業務人員 (staff)</option>' +
        '    <option value="admin">系統管理員 (admin)</option>' +
        "  </select>" +
        "</div>";

      MEA.ui.modal("新增授權帳號", html, [
        { text: "取消", secondary: true, onClick: MEA.ui.closeModal },
        {
          text: "新增",
          primary: true,
          onClick: handleAddAccountClick
        }
      ]);
    }

    function removeAccount(email) {
      const cur = (MEA.state.settings && MEA.state.settings.accounts) || [];
      const updated = cur.filter(function (a) {
        return a.email !== email;
      });
      MEA.ui.modal(
        "確認刪除授權成員",
        '<p class="mb-2">確定要刪除 <strong>' +
          MEA.ui.escapeHtml(email) +
          "</strong> 嗎？刪除後該帳號將立即失去存取權。</p>",
        [
          { text: "取消", onClick: MEA.ui.closeModal },
          {
            text: "確認刪除",
            primary: true,
            onClick: function () {
              MEA.ui.closeModal();
              saveAccountsList(updated);
            }
          }
        ]
      );
    }

    function toggleAccount(email) {
      const cur = (MEA.state.settings && MEA.state.settings.accounts) || [];
      const updated = cur.map(function (a) {
        if (a.email === email) {
          return Object.assign({}, a, { enabled: !a.enabled });
        }
        return a;
      });
      saveAccountsList(updated);
    }

    /**
     * 結束白名單儲存中狀態。
     */
    function finishWhitelistSaving() {
      MEA.setState({
        settings: Object.assign({}, MEA.state.settings || {}, { saving: false })
      });
    }

    /**
     * 處理白名單儲存結果（原 saveAccountsList 的 then 回呼）。
     *
     * @param {Object} result - API 回應
     */
    function handleWhitelistSaveResult(result) {
      finishWhitelistSaving();
      if (result && result.ok) {
        MEA.ui.toast("授權白名單已更新！", "ok");
      } else {
        MEA.ui.toast((result && result.message) || "白名單更新失敗", "err");
      }
    }

    function saveAccountsList(accounts) {
      MEA.setState({
        settings: Object.assign({}, MEA.state.settings || {}, {
          saving: true,
          accounts: accounts
        })
      });

      MEA.api
        .call("saveWhitelist", { accounts: accounts })
        .then(function (result) {
          handleWhitelistSaveResult(result);
        })
        .catch(function (error) {
          finishWhitelistSaving();
          MEA.ui.toast(normalizeErrorMessage(error, "儲存授權成員失敗，請稍後再試"), "err");
        });
    }

    /**
     * 產生權限不足面板。
     *
     * @param {Object} user - 目前使用者
     * @returns {string} HTML 字串
     */
    function renderPermissionDeniedHtml(user) {
      return (
        '<div class="panel">' +
        '<div class="panel-header"><h2 class="panel-title">權限不足</h2></div>' +
        '<div class="alert err">您目前的角色（' +
        MEA.ui.escapeHtml(user.roleName || user.role) +
        "）無權限檢視或修改系統設定與授權名單。</div>" +
        "</div>"
      );
    }

    /**
     * 產生單筆授權成員表格列。
     *
     * @param {Object} a - 帳號紀錄
     * @param {boolean} saving - 是否正在儲存
     * @returns {string} HTML 字串
     */
    function renderAccountRowHtml(a, saving) {
      const disabled = saving ? " disabled" : "";
      return (
        "<tr>" +
        "<td><strong>" +
        MEA.ui.escapeHtml(a.email) +
        "</strong></td>" +
        "<td>" +
        MEA.ui.escapeHtml(a.name) +
        "</td>" +
        '<td><span class="pill ' +
        (a.role === "admin" ? "accent" : "muted") +
        '">' +
        MEA.ui.escapeHtml(a.roleName || a.role) +
        "</span></td>" +
        "<td>" +
        '  <span class="badge ' +
        (a.enabled ? "badge-ok" : "badge-err") +
        '">' +
        (a.enabled ? "已啟用" : "已停用") +
        "  </span>" +
        "</td>" +
        "<td>" +
        '  <button type="button" class="btn secondary compact" onclick="MEA.accounts.toggleAccount(decodeURIComponent(\'' +
        encodeURIComponent(a.email) +
        "'))\"" +
        disabled +
        ">" +
        (a.enabled ? "停用" : "啟用") +
        "</button>" +
        '  <button type="button" class="btn danger compact" onclick="MEA.accounts.removeAccount(decodeURIComponent(\'' +
        encodeURIComponent(a.email) +
        "'))\"" +
        disabled +
        ">刪除</button>" +
        "</td>" +
        "</tr>"
      );
    }

    /**
     * 產生授權成員表格內容。
     *
     * @param {Array<Object>} accounts - 帳號陣列
     * @param {boolean} saving - 是否正在儲存
     * @returns {string} HTML 字串
     */
    function renderAccountsRowsHtml(accounts, saving) {
      if (accounts.length === 0) {
        return '<tr><td colspan="5" class="text-center py-4 text-muted">目前尚未設定任何授權帳號。</td></tr>';
      }

      let rowsHtml = "";
      for (let i = 0; i < accounts.length; i++) {
        rowsHtml += renderAccountRowHtml(accounts[i], saving);
      }
      return rowsHtml;
    }

    /**
     * 產生系統核心參數卡片。
     *
     * @param {Object} data - 系統設定資料
     * @param {boolean} saving - 是否儲存中
     * @returns {string} HTML 字串
     */
    function renderSystemCoreCardHtml(data, saving) {
      return (
        '<div class="card mt-3">' +
        '  <h3 class="card-title">系統核心參數</h3>' +
        '  <form class="mt-3" onsubmit="MEA.accounts.saveSettings(event)">' +
        '    <div class="row">' +
        '      <div class="col" style="flex:2;">' +
        '        <label class="label" for="cfgSystemName">系統名稱</label>' +
        '        <input type="text" id="cfgSystemName" class="input" value="' +
        MEA.ui.escapeHtml(data.systemName || "") +
        '" />' +
        "      </div>" +
        '      <div class="col">' +
        '        <label class="label" for="cfgSchoolYear">目前學年度</label>' +
        '        <input type="text" id="cfgSchoolYear" class="input" value="' +
        MEA.ui.escapeHtml(data.schoolYear || "114") +
        '" />' +
        "      </div>" +
        '      <div class="col">' +
        '        <label class="label" for="cfgSemester">目前學期</label>' +
        '        <input type="text" id="cfgSemester" class="input" value="' +
        MEA.ui.escapeHtml(data.semester || "1") +
        '" />' +
        "      </div>" +
        "    </div>" +
        '    <div class="form-group mt-3">' +
        '      <label class="label" for="cfgClientId">Google OAuth 2.0 Client ID (GIS 登入用)</label>' +
        '      <input type="text" id="cfgClientId" class="input mono" placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com" value="' +
        MEA.ui.escapeHtml(data.clientId || "") +
        '" />' +
        '      <span class="hint">可於 Google Cloud Console 憑證管理中取得；於 GAS 容器內仍可搭配 ActiveUser / AccountChooser 流程使用。</span>' +
        "    </div>" +
        '    <div class="form-group mt-3">' +
        '      <label class="label" for="cfgClientSecret">Google OAuth 2.0 Client Secret（授權碼回呼備援時需要）</label>' +
        '      <input type="password" id="cfgClientSecret" class="input mono" value="' +
        MEA.ui.escapeHtml(data.clientSecret || "") +
        '" />' +
        "    </div>" +
        '    <div class="form-group mt-3">' +
        '      <label class="label" for="cfgAllowedDomain">Google 登入允許網域（選填）</label>' +
        '      <input type="text" id="cfgAllowedDomain" class="input mono" placeholder="example.edu.tw" value="' +
        MEA.ui.escapeHtml(data.allowedLoginDomain || data["Google 登入允許網域"] || "") +
        '" />' +
        '      <span class="hint">填寫網域後僅允許該網域帳號登入（例如 <code>example.edu.tw</code>）。</span>' +
        "    </div>" +
        '    <div class="form-group mt-3">' +
        '      <label class="checkbox-label" for="cfgRestrictWhitelist">' +
        '        <input type="checkbox" id="cfgRestrictWhitelist"' +
        (data.restrictWhitelist ? " checked" : "") +
        " />" +
        "        <span>嚴格啟用白名單限制（未列於下方成員清單之帳號將拒絕登入）</span>" +
        "      </label>" +
        "    </div>" +
        '    <div class="mt-4">' +
        '      <button type="submit" class="btn primary"' +
        (saving ? " disabled" : "") +
        ">" +
        (saving ? "儲存中..." : "儲存系統設定") +
        "</button>" +
        "    </div>" +
        "  </form>" +
        "</div>"
      );
    }

    /**
     * 產生授權白名單卡片。
     *
     * @param {string} accountsRowsHtml - 表格列 HTML
     * @param {boolean} saving - 是否正在儲存
     * @returns {string} HTML 字串
     */
    function renderWhitelistCardHtml(accountsRowsHtml, saving) {
      const loadingHint = saving ? '<span class="hint" role="status">正在更新授權白名單，請稍候...</span>' : "";
      return (
        '<div class="card mt-4">' +
        '  <div class="card-header">' +
        '    <h3 class="card-title">授權白名單成員清單</h3>' +
        '    <button type="button" class="btn secondary compact" onclick="MEA.accounts.addAccountPrompt()"' +
        (saving ? " disabled" : "") +
        ">＋ 新增授權成員</button>" +
        "  </div>" +
        loadingHint +
        '  <div class="table-responsive mt-3">' +
        '    <table class="table">' +
        "      <thead>" +
        "        <tr>" +
        '          <th scope="col">Email</th><th scope="col">姓名/職稱</th><th scope="col">角色</th><th scope="col">狀態</th><th scope="col">操作</th>' +
        "        </tr>" +
        "      </thead>" +
        "      <tbody>" +
        accountsRowsHtml +
        "</tbody>" +
        "    </table>" +
        "  </div>" +
        "</div>"
      );
    }

    function renderView() {
      const user = MEA.state.user || {};
      const isAdmin = user.role === "admin";
      const settings = MEA.state.settings || {};
      const data = settings.data || {};
      const accounts = settings.accounts || [];

      if (!isAdmin) {
        return renderPermissionDeniedHtml(user);
      }

      return (
        '<div class="panel">' +
        '<div class="panel-header">' +
        "  <div>" +
        '    <h2 class="panel-title">系統設定與授權 (RBAC)</h2>' +
        '    <p class="panel-sub">設定 Google OAuth、登入網域限制與存取成員角色清單</p>' +
        "  </div>" +
        '  <button type="button" class="btn secondary compact" onclick="MEA.accounts.loadSettingsAndAccounts()"' +
        (settings.loading ? " disabled" : "") +
        ">" +
        (settings.loading ? "讀取中..." : "🔄 重新讀取") +
        "</button>" +
        "</div>" +
        renderSystemCoreCardHtml(data, settings.saving) +
        renderWhitelistCardHtml(renderAccountsRowsHtml(accounts, settings.saving), settings.saving) +
        "</div>"
      );
    }

    return {
      loadSettingsAndAccounts: loadSettingsAndAccounts,
      saveSettings: saveSettings,
      addAccountPrompt: addAccountPrompt,
      removeAccount: removeAccount,
      toggleAccount: toggleAccount,
      renderView: renderView
    };
  }

  return {
    createAccountsModule: createAccountsModule
  };
});
