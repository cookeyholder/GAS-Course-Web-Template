/**
 * @file accounts.js
 * @description 系統設定與存取授權白名單（RBAC）管理模組
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

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
        MEA.ui.toast(String(error && error.message ? error.message : error), "err");
      });
  }

  function saveSettings(e) {
    if (e && e.preventDefault) e.preventDefault();
    const systemName = document.getElementById("cfgSystemName").value.trim();
    const schoolYear = document.getElementById("cfgSchoolYear").value.trim();
    const semester = document.getElementById("cfgSemester").value.trim();
    const clientId = document.getElementById("cfgClientId").value.trim();
    const clientSecret = document.getElementById("cfgClientSecret").value.trim();
    const allowedLoginDomain = document.getElementById("cfgAllowedDomain")
      ? document.getElementById("cfgAllowedDomain").value.trim().replace(/^@/, "").toLowerCase()
      : "";
    const restrict = document.getElementById("cfgRestrictWhitelist").checked;

    MEA.setState({
      settings: Object.assign({}, MEA.state.settings || {}, { saving: true })
    });

    MEA.api
      .call("saveSystemSettings", {
        settings: {
          systemName: systemName,
          schoolYear: schoolYear,
          semester: semester,
          clientId: clientId,
          clientSecret: clientSecret,
          allowedLoginDomain: allowedLoginDomain,
          restrictWhitelist: restrict ? "true" : "false"
        }
      })
      .then(function (result) {
        MEA.setState({
          settings: Object.assign({}, MEA.state.settings || {}, { saving: false })
        });
        if (result && result.ok) {
          MEA.ui.toast("系統參數已成功儲存！", "ok");
          if (MEA.state.publicConfig) {
            MEA.setState({
              publicConfig: Object.assign({}, MEA.state.publicConfig, {
                systemName: systemName,
                schoolYear: schoolYear,
                semester: semester,
                clientId: clientId,
                allowedDomain: allowedLoginDomain,
                hasClientSecret: Boolean(clientSecret)
              })
            });
          }
        } else {
          MEA.ui.toast((result && result.message) || "儲存失敗", "err");
        }
      })
      .catch(function (error) {
        MEA.setState({
          settings: Object.assign({}, MEA.state.settings || {}, { saving: false })
        });
        MEA.ui.toast(String(error && error.message ? error.message : error), "err");
      });
  }

  function addAccountPrompt() {
    const html =
      '<div class="form-group">' +
      '  <label class="label">Google Email</label>' +
      '  <input type="email" id="newAccountEmail" class="input" placeholder="user@example.com" />' +
      "</div>" +
      '<div class="form-group mt-2">' +
      '  <label class="label">姓名或職稱</label>' +
      '  <input type="text" id="newAccountName" class="input" placeholder="王小明" />' +
      "</div>" +
      '<div class="form-group mt-2">' +
      '  <label class="label">指派角色</label>' +
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
        onClick: function () {
          const emailInput = document.getElementById("newAccountEmail");
          const nameInput = document.getElementById("newAccountName");
          const roleSelect = document.getElementById("newAccountRole");

          const email = emailInput ? emailInput.value.trim().toLowerCase() : "";
          const name = nameInput ? nameInput.value.trim() : "";
          const role = roleSelect ? roleSelect.value : "viewer";

          if (!email || email.indexOf("@") === -1) {
            MEA.ui.toast("請填寫有效的 Email", "warn");
            return;
          }

          const cur = (MEA.state.settings && MEA.state.settings.accounts) || [];
          for (let i = 0; i < cur.length; i++) {
            if (cur[i].email === email) {
              MEA.ui.toast("此 Email 已在白名單中", "warn");
              return;
            }
          }

          const updated = cur.concat([
            {
              email: email,
              name: name || email,
              role: role,
              roleName: MEA.config.roleNames[role] || role,
              enabled: true
            }
          ]);

          saveAccountsList(updated);
          MEA.ui.closeModal();
        }
      }
    ]);
  }

  function removeAccount(email) {
    const cur = (MEA.state.settings && MEA.state.settings.accounts) || [];
    const updated = cur.filter(function (a) {
      return a.email !== email;
    });
    saveAccountsList(updated);
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
        MEA.setState({
          settings: Object.assign({}, MEA.state.settings || {}, { saving: false })
        });
        if (result && result.ok) {
          MEA.ui.toast("授權白名單已更新！", "ok");
        } else {
          MEA.ui.toast((result && result.message) || "白名單更新失敗", "err");
        }
      })
      .catch(function (error) {
        MEA.setState({
          settings: Object.assign({}, MEA.state.settings || {}, { saving: false })
        });
        MEA.ui.toast(String(error && error.message ? error.message : error), "err");
      });
  }

  function renderView() {
    const user = MEA.state.user || {};
    const isAdmin = user.role === "admin";
    const settings = MEA.state.settings || {};
    const data = settings.data || {};
    const accounts = settings.accounts || [];
    const loading = settings.loading;
    const saving = settings.saving;

    if (!isAdmin) {
      return (
        '<div class="panel">' +
        '<div class="panel-header"><h2 class="panel-title">權限不足</h2></div>' +
        '<div class="alert err">您目前的角色（' +
        MEA.ui.escapeHtml(user.roleName || user.role) +
        "）無權限檢視或修改系統設定與授權名單。</div>" +
        "</div>"
      );
    }

    let accountsRowsHtml = "";
    if (accounts.length === 0) {
      accountsRowsHtml = '<tr><td colspan="5" class="text-center py-4 text-muted">目前尚未設定任何授權帳號。</td></tr>';
    } else {
      for (let i = 0; i < accounts.length; i++) {
        const a = accounts[i];
        accountsRowsHtml +=
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
          '  <button class="btn secondary compact" onclick="MEA.accounts.toggleAccount(decodeURIComponent(\'' +
          encodeURIComponent(a.email) +
          "'))\">" +
          (a.enabled ? "停用" : "啟用") +
          "</button>" +
          '  <button class="btn danger compact" onclick="MEA.accounts.removeAccount(decodeURIComponent(\'' +
          encodeURIComponent(a.email) +
          "'))\">刪除</button>" +
          "</td>" +
          "</tr>";
      }
    }

    return (
      '<div class="panel">' +
      '<div class="panel-header">' +
      "  <div>" +
      '    <h2 class="panel-title">系統設定與授權 (RBAC)</h2>' +
      '    <p class="panel-sub">設定 Google OAuth、登入網域限制與存取成員角色清單</p>' +
      "  </div>" +
      '  <button class="btn secondary compact" onclick="MEA.accounts.loadSettingsAndAccounts()">🔄 重新讀取</button>' +
      "</div>" +
      '<div class="card mt-3">' +
      '  <h3 class="card-title">系統核心參數</h3>' +
      '  <form class="mt-3" onsubmit="MEA.accounts.saveSettings(event)">' +
      '    <div class="row">' +
      '      <div class="col" style="flex:2;">' +
      '        <label class="label">系統名稱</label>' +
      '        <input type="text" id="cfgSystemName" class="input" value="' +
      MEA.ui.escapeHtml(data.systemName || "") +
      '" />' +
      "      </div>" +
      '      <div class="col">' +
      '        <label class="label">目前學年度</label>' +
      '        <input type="text" id="cfgSchoolYear" class="input" value="' +
      MEA.ui.escapeHtml(data.schoolYear || "114") +
      '" />' +
      "      </div>" +
      '      <div class="col">' +
      '        <label class="label">目前學期</label>' +
      '        <input type="text" id="cfgSemester" class="input" value="' +
      MEA.ui.escapeHtml(data.semester || "1") +
      '" />' +
      "      </div>" +
      "    </div>" +
      '    <div class="form-group mt-3">' +
      '      <label class="label">Google OAuth 2.0 Client ID (GIS 登入用)</label>' +
      '      <input type="text" id="cfgClientId" class="input mono" placeholder="xxxxxxxxxxxx-xxxxxxxxxxxxxxxx.apps.googleusercontent.com" value="' +
      MEA.ui.escapeHtml(data.clientId || "") +
      '" />' +
      '      <span class="hint">可於 Google Cloud Console 憑證管理中取得；於 GAS 容器內仍可搭配 ActiveUser / AccountChooser 流程使用。</span>' +
      "    </div>" +
      '    <div class="form-group mt-3">' +
      '      <label class="label">Google OAuth 2.0 Client Secret（授權碼回呼備援時需要）</label>' +
      '      <input type="password" id="cfgClientSecret" class="input mono" value="' +
      MEA.ui.escapeHtml(data.clientSecret || "") +
      '" />' +
      "    </div>" +
      '    <div class="form-group mt-3">' +
      '      <label class="label">Google 登入允許網域（選填）</label>' +
      '      <input type="text" id="cfgAllowedDomain" class="input mono" placeholder="example.edu.tw" value="' +
      MEA.ui.escapeHtml(data.allowedLoginDomain || data["Google 登入允許網域"] || "") +
      '" />' +
      '      <span class="hint">填寫網域後僅允許該網域帳號登入（例如 <code>ksvs.kh.edu.tw</code>）。</span>' +
      "    </div>" +
      '    <div class="form-group mt-3">' +
      '      <label class="checkbox-label">' +
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
      "</div>" +
      '<div class="card mt-4">' +
      '  <div class="card-header">' +
      '    <h3 class="card-title">授權白名單成員清單</h3>' +
      '    <button class="btn secondary compact" onclick="MEA.accounts.addAccountPrompt()">＋ 新增授權成員</button>' +
      "  </div>" +
      '  <div class="table-responsive mt-3">' +
      '    <table class="table">' +
      "      <thead>" +
      "        <tr>" +
      "          <th>Email</th><th>姓名/職稱</th><th>角色</th><th>狀態</th><th>操作</th>" +
      "        </tr>" +
      "      </thead>" +
      "      <tbody>" +
      accountsRowsHtml +
      "</tbody>" +
      "    </table>" +
      "  </div>" +
      "</div>" +
      "</div>"
    );
  }

  MEA.accounts = {
    loadSettingsAndAccounts: loadSettingsAndAccounts,
    saveSettings: saveSettings,
    addAccountPrompt: addAccountPrompt,
    removeAccount: removeAccount,
    toggleAccount: toggleAccount,
    renderView: renderView
  };
})(window.MEA);
