/**
 * @file main.js
 * @description Google 試算表容器工具列選單與 Web App 入口
 */

/**
 * 建立試算表工具列選單
 * 當試算表開啟時自動執行
 */
function onOpen() {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu("應用程式管理")
    .addItem("初始化後端資料庫 (全套工作表與授權)", "initializeDatabaseSheetsMenu")
    .addSeparator()
    .addItem("開啟 Web App 網頁", "openWebAppDialog")
    .addToUi();
}

/**
 * 選單動作：初始化後端資料庫工作表
 */
function initializeDatabaseSheetsMenu() {
  const ui = SpreadsheetApp.getUi();
  const res = ui.alert(
    "系統初始化確認",
    "即將初始化／檢查 Web App 後端資料庫工作表（包含「系統設定與授權」、「正規化課程代碼」、「系統使用說明」等）。\n\n此操作具安全冪等性，不會覆蓋既有自訂設定。是否繼續？",
    ui.ButtonSet.YES_NO
  );
  if (res !== ui.Button.YES) return;

  try {
    const result = initializeDatabaseSheets({ silent: true });
    ui.alert(
      "初始化完成",
      "後端資料庫工作表已完成初始化！\n\n已檢查／建立工作表：\n" +
        (result && result.sheets ? result.sheets.join("、") : ""),
      ui.ButtonSet.OK
    );
  } catch (error) {
    ui.alert("初始化失敗", "執行失敗：" + (error && error.message ? error.message : error), ui.ButtonSet.OK);
  }
}

/**
 * 選單動作：彈出視窗提供 Web App 網頁開啟連結
 */
function openWebAppDialog() {
  const ui = SpreadsheetApp.getUi();
  try {
    let url = "";
    if (typeof ScriptApp !== "undefined" && ScriptApp.getService) {
      url = ScriptApp.getService().getUrl() || "";
    }
    if (!url) {
      url = "尚未部署 Web App，請先使用 clasp deploy 或於 Apps Script 編輯器發布網頁應用程式";
    }

    const html = HtmlService.createHtmlOutput(
      "<div style=\"font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; text-align: center;\">" +
        '<h3 style="margin-top:0; color: #1e293b;">Google Apps Script 應用程式 Web App</h3>' +
        '<p style="font-size: 14px; color: #475569; margin: 16px 0 24px;">請點擊下方按鈕以新分頁開啟網頁應用程式：</p>' +
        (url.indexOf("http") === 0
          ? '<a href="' +
            url +
            '" target="_blank" style="background:#2563eb; color:#ffffff; padding:12px 24px; text-decoration:none; border-radius:6px; font-weight:bold; font-size: 15px; display:inline-block; box-shadow: 0 2px 4px rgba(37,99,235,0.2);">開啟 Web App 網頁</a>'
          : '<div style="background:#fef2f2; color:#dc2626; padding:12px; border-radius:6px; font-size:13px;">' +
            url +
            "</div>") +
        '<p style="margin-top: 24px; font-size: 11px; color: #94a3b8; word-break: break-all;">完整網址：<br>' +
        url +
        "</p>" +
        "</div>"
    )
      .setWidth(460)
      .setHeight(240);

    ui.showModalDialog(html, "開啟 Web App");
  } catch (error) {
    ui.alert("開啟失敗", "無法取得 Web App 連結：" + (error && error.message ? error.message : error), ui.ButtonSet.OK);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    onOpen: onOpen,
    initializeDatabaseSheetsMenu: initializeDatabaseSheetsMenu,
    openWebAppDialog: openWebAppDialog
  };
}
