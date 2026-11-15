/**
 * @file mock.js
 * @description 本機離線開發與展示用之 Mock API 模擬器
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  const mockSettings = {
    systemName: "Google Apps Script 應用程式範本 (Mock Mode)",
    schoolYear: "114",
    semester: "1",
    clientId: "mock-client-id.apps.googleusercontent.com",
    clientSecret: "",
    restrictWhitelist: false
  };

  const mockAccounts = [
    { email: "admin@example.com", name: "測試管理員", role: "admin", roleName: "系統管理員", enabled: true },
    { email: "teacher@example.com", name: "測試教師", role: "staff", roleName: "業務人員", enabled: true }
  ];

  let mockCoursesList = [
    { academicYear: "114", semester: "1", grade: "1", entryYear: "114", courseCode: "305101A", subjectName: "程式設計實習Ⅰ", group: "電機與電子群", department: "資訊科", subjectType: "部定必修", openWay: "原班級", attribute: "實習科目", required: "必修", credits: "3", hours: "3" },
    { academicYear: "114", semester: "1", grade: "1", entryYear: "114", courseCode: "308102B", subjectName: "基本電學Ⅰ", group: "電機與電子群", department: "電機科", subjectType: "部定必修", openWay: "原班級", attribute: "專業科目", required: "必修", credits: "3", hours: "3" },
    { academicYear: "114", semester: "1", grade: "2", entryYear: "113", courseCode: "301201C", subjectName: "機械製造Ⅱ", group: "機械群", department: "機械科", subjectType: "部定必修", openWay: "原班級", attribute: "專業科目", required: "必修", credits: "2", hours: "2" },
    { academicYear: "114", semester: "1", grade: "3", entryYear: "112", courseCode: "311301D", subjectName: "工程力學Ⅱ", group: "土木與建築群", department: "建築科", subjectType: "部定必修", openWay: "原班級", attribute: "專業科目", required: "必修", credits: "3", hours: "3" }
  ];

  function handle(action, payload) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        switch (action) {
          case "ping":
            resolve({ ok: true, pong: Date.now(), version: "1.0.0-mock" });
            break;

          case "getPublicConfig":
            resolve({
              ok: true,
              version: "1.0.0-mock",
              systemName: mockSettings.systemName,
              schoolYear: mockSettings.schoolYear,
              semester: mockSettings.semester,
              clientId: mockSettings.clientId,
              webAppUrl: window.location.href
            });
            break;

          case "login":
          case "loginWithActiveUser":
            resolve({
              ok: true,
              token: "mock_session_token_" + Date.now(),
              expiresIn: 21600,
              email: "admin@example.com",
              name: "測試管理員",
              role: "admin",
              roleName: "系統管理員",
              perms: ["*"]
            });
            break;

          case "getSession":
            resolve({
              ok: true,
              email: "admin@example.com",
              name: "測試管理員",
              role: "admin",
              roleName: "系統管理員",
              perms: ["*"]
            });
            break;

          case "logout":
            resolve({ ok: true });
            break;

          case "importCourseCodes":
            if (payload && Array.isArray(payload.rows)) {
              const rows = payload.rows;
              mockCoursesList = rows.map(function (r) {
                return {
                  academicYear: r[0],
                  semester: r[1],
                  grade: r[2],
                  entryYear: r[3],
                  courseCode: r[4],
                  subjectName: r[5],
                  group: r[6],
                  department: r[7],
                  subjectType: r[8],
                  openWay: r[9],
                  attribute: r[10],
                  required: r[11],
                  credits: r[12],
                  hours: r[13]
                };
              });
            }
            resolve({ ok: true, rows: mockCoursesList.length });
            break;

          case "getCourseIndex":
            resolve({
              ok: true,
              list: mockCoursesList,
              total: mockCoursesList.length,
              page: 1,
              pageSize: 50,
              totalPages: 1
            });
            break;

          case "getSystemSettings":
            resolve({ ok: true, settings: Object.assign({}, mockSettings) });
            break;

          case "saveSystemSettings":
            Object.assign(mockSettings, payload.settings || {});
            resolve({ ok: true });
            break;

          case "getAccounts":
            resolve({ ok: true, accounts: mockAccounts.slice() });
            break;

          case "saveWhitelist":
            mockAccounts.length = 0;
            (payload.accounts || []).forEach(function (a) { mockAccounts.push(a); });
            resolve({ ok: true, count: mockAccounts.length });
            break;

          default:
            resolve({ ok: false, error: "unknown_mock_action", message: "Mock 未支援 action：" + action });
            break;
        }
      }, 150);
    });
  }

  MEA.mock = {
    handle: handle
  };
})(window.MEA);
