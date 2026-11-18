/**
 * @file imports.js
 * @description 課程代碼 Excel 檔案解析、1NF 正規化即時預覽與後端匯入
 */
window.MEA = window.MEA || {};

(function (MEA) {
  "use strict";

  const SHEETJS_CDN = [
    "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js",
    "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    "https://unpkg.com/xlsx@0.18.5/dist/xlsx.full.min.js"
  ];

  let sheetJsPromise = null;

  function loadSheetJs() {
    if (sheetJsPromise) return sheetJsPromise;
    if (window.XLSX) {
      sheetJsPromise = Promise.resolve(window.XLSX);
      return sheetJsPromise;
    }

    sheetJsPromise = new Promise(function (resolve, reject) {
      let index = 0;

      function attempt() {
        if (index >= SHEETJS_CDN.length) {
          reject(new Error("無法載入 SheetJS 解析套件，請確認網路連線"));
          return;
        }
        const script = document.createElement("script");
        script.src = SHEETJS_CDN[index++];
        script.async = true;
        script.onload = function () {
          if (window.XLSX) {
            resolve(window.XLSX);
          } else {
            attempt();
          }
        };
        script.onerror = attempt;
        document.head.appendChild(script);
      }

      attempt();
    });

    return sheetJsPromise;
  }

  function rowsOfSheet(workbook, sheetName) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return [];
    return window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      raw: false,
      defval: "",
      blankrows: false
    });
  }

  function looksLikeCourseCodes(rows) {
    const firstRows = rows.slice(0, 3);
    for (let i = 0; i < firstRows.length; i++) {
      const row = firstRows[i] || [];
      for (let j = 0; j < row.length; j++) {
        const val = String(row[j] || "").trim();
        if (val === "課程代碼" || val === "科目屬性" || val === "科目名稱") {
          return true;
        }
      }
    }
    return false;
  }

  function pickCourseSheetRows(workbook) {
    const names = workbook.SheetNames || [];
    for (let i = 0; i < names.length; i++) {
      const rows = rowsOfSheet(workbook, names[i]);
      if (rows.length > 0 && looksLikeCourseCodes(rows)) {
        return { sheetName: names[i], rows: rows };
      }
    }
    for (let i = 0; i < names.length; i++) {
      const rows = rowsOfSheet(workbook, names[i]);
      if (rows.length > 0) {
        return { sheetName: names[i], rows: rows };
      }
    }
    return { sheetName: "", rows: [] };
  }

  function readFileRows(file) {
    return loadSheetJs().then(function (XLSX) {
      return new Promise(function (resolve, reject) {
        const reader = new FileReader();
        reader.onload = function () {
          try {
            const data = new Uint8Array(reader.result);
            const workbook = XLSX.read(data, { type: "array", cellDates: false });
            resolve(workbook);
          } catch (error) {
            reject(new Error("檔案解析失敗，請確認格式為 .xlsx、.xls 或 .ods"));
          }
        };
        reader.onerror = function () {
          reject(new Error("讀取檔案失敗"));
        };
        reader.readAsArrayBuffer(file);
      });
    });
  }

  function previewCourseCodes(rows) {
    const result = MEA.courseData.normalizeCourseCodes(rows, { withStats: true });
    return {
      payload: result.rows,
      payloadPreNormalized: true,
      stats: result.stats,
      sample: result.rows.slice(0, 5)
    };
  }

  function previewFile(file) {
    if (!file) return Promise.resolve(null);
    MEA.setState({ importBusy: true });

    return readFileRows(file)
      .then(function (workbook) {
        const picked = pickCourseSheetRows(workbook);
        if (picked.rows.length === 0) {
          throw new Error("工作表中找不到有效資料");
        }
        const preview = previewCourseCodes(picked.rows);
        const entry = Object.assign(
          {
            fileName: file.name,
            fileSize: file.size,
            sheetName: picked.sheetName,
            imported: false
          },
          preview
        );

        MEA.setState({
          imports: { courseCodes: entry },
          importBusy: false
        });

        MEA.ui.toast(file.name + " 解析完成（共 " + preview.stats.expandedRows + " 筆 1NF 紀錄）", "ok");
        return entry;
      })
      .catch(function (error) {
        MEA.setState({ importBusy: false });
        MEA.ui.toast(String(error && error.message ? error.message : error), "err");
        return null;
      });
  }

  function pickFile() {
    const input = document.getElementById("fileInput");
    if (input) input.click();
  }

  function handleFileSelect(input) {
    const file = input && input.files && input.files[0];
    if (input) input.value = "";
    if (file) previewFile(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    const zone = document.getElementById("uploadDropzone");
    if (zone) zone.classList.add("dragover");
  }

  function handleDragLeave(e) {
    e.preventDefault();
    const zone = document.getElementById("uploadDropzone");
    if (zone) zone.classList.remove("dragover");
  }

  function handleDrop(e) {
    e.preventDefault();
    const zone = document.getElementById("uploadDropzone");
    if (zone) zone.classList.remove("dragover");

    const file = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null;
    if (file) previewFile(file);
  }

  function resetImport() {
    MEA.setState({
      imports: {},
      importLast: null
    });
  }

  function doImport() {
    const entry = (MEA.state.imports || {}).courseCodes;
    if (!entry || !Array.isArray(entry.payload) || entry.payload.length === 0) {
      MEA.ui.toast("請先選擇並解析課程代碼檔案", "warn");
      return;
    }

    MEA.setState({ importBusy: true });
    MEA.ui.toast("正在寫入 Google 試算表（共 " + entry.payload.length + " 筆）...", "info");

    MEA.api
      .call("importCourseCodes", {
        rows: entry.payload,
        preNormalized: true
      })
      .then(function (result) {
        MEA.setState({ importBusy: false });
        if (!result || result.ok !== true) {
          MEA.ui.toast((result && result.message) || "匯入失敗", "err");
          return;
        }

        MEA.setState({
          imports: {
            courseCodes: Object.assign({}, entry, { imported: true })
          },
          importLast: result
        });

        MEA.ui.toast("課程代碼匯入完成！已儲存至「正規化課程索引」工作表", "ok");

        // 自動重新載入課程檢索列表
        if (MEA.courses && typeof MEA.courses.fetchList === "function") {
          MEA.courses.fetchList(1);
        }
      })
      .catch(function (error) {
        MEA.setState({ importBusy: false });
        MEA.ui.toast(String(error && error.message ? error.message : error), "err");
      });
  }

  // ============================================================================
  // 畫面渲染
  // ============================================================================

  function renderView() {
    const entry = (MEA.state.imports || {}).courseCodes;
    const busy = MEA.state.importBusy;
    const user = MEA.state.user || {};
    const canImport = user.perms && (user.perms.indexOf("*") !== -1 || user.perms.indexOf("importCourseCodes") !== -1);

    let contentHtml = "";

    if (!entry) {
      contentHtml =
        '<div class="upload-dropzone" id="uploadDropzone"' +
        ' ondragover="MEA.imports.handleDragOver(event)"' +
        ' ondragleave="MEA.imports.handleDragLeave(event)"' +
        ' ondrop="MEA.imports.handleDrop(event)"' +
        ' onclick="MEA.imports.pickFile()">' +
        '  <div class="dropzone-icon">📁</div>' +
        '  <div class="dropzone-title">點擊選擇或拖曳 108 課綱課程代碼 Excel 檔案至此</div>' +
        '  <div class="dropzone-desc">支援自教育部課程計畫平臺下載之 .xlsx、.xls 或 .ods 寬表（39 欄格式）</div>' +
        '  <input type="file" id="fileInput" style="display:none;" accept=".xlsx,.xls,.ods" onchange="MEA.imports.handleFileSelect(this)" />' +
        "</div>";
    } else {
      const stats = entry.stats || {};
      const sample = entry.sample || [];

      let sampleRowsHtml = "";
      for (let i = 0; i < sample.length; i++) {
        const row = sample[i];
        sampleRowsHtml +=
          "<tr>" +
          "<td>" +
          MEA.ui.escapeHtml(row[0]) +
          "</td>" +
          "<td>" +
          MEA.ui.escapeHtml(row[1]) +
          "</td>" +
          "<td>" +
          MEA.ui.escapeHtml(row[2]) +
          "</td>" +
          "<td>" +
          MEA.ui.escapeHtml(row[4]) +
          "</td>" +
          "<td><strong>" +
          MEA.ui.escapeHtml(row[5]) +
          "</strong></td>" +
          "<td>" +
          MEA.ui.escapeHtml(row[7]) +
          "</td>" +
          "<td>" +
          MEA.ui.escapeHtml(row[10]) +
          "</td>" +
          "<td>" +
          MEA.ui.escapeHtml(row[11]) +
          "</td>" +
          "<td>" +
          MEA.ui.escapeHtml(row[12]) +
          "</td>" +
          "</tr>";
      }

      contentHtml =
        '<div class="card">' +
        '  <div class="card-header">' +
        "    <div>" +
        '      <h3 class="card-title">檔案解析預覽：' +
        MEA.ui.escapeHtml(entry.fileName) +
        "</h3>" +
        '      <p class="card-sub">來源工作表：' +
        MEA.ui.escapeHtml(entry.sheetName) +
        " · 檔案大小：" +
        Math.round(entry.fileSize / 1024) +
        " KB</p>" +
        "    </div>" +
        '    <div class="card-actions">' +
        '      <button class="btn secondary compact" onclick="MEA.imports.resetImport()">重新選擇</button>' +
        '      <button class="btn primary compact" onclick="MEA.imports.doImport()"' +
        (busy || !canImport || entry.imported ? " disabled" : "") +
        ">" +
        (entry.imported ? "✓ 已匯入完成" : busy ? "匯入中..." : "確認匯入至試算表") +
        "      </button>" +
        "    </div>" +
        "  </div>" +
        '  <div class="metrics-grid mt-3">' +
        '    <div class="metric-card">' +
        '      <div class="metric-label">原始科目列數</div>' +
        '      <div class="metric-value">' +
        MEA.ui.number(stats.sourceRows) +
        "</div>" +
        '      <div class="metric-sub">來源 39 欄資料</div>' +
        "    </div>" +
        '    <div class="metric-card">' +
        '      <div class="metric-label">匯入科目列數</div>' +
        '      <div class="metric-value text-accent">' +
        MEA.ui.number(stats.keptCourseRows) +
        "</div>" +
        '      <div class="metric-sub">全數納入（不剔除任何屬性）</div>' +
        "    </div>" +
        '    <div class="metric-card">' +
        '      <div class="metric-label">1NF 展開後紀錄筆數</div>' +
        '      <div class="metric-value text-accent">' +
        MEA.ui.number(stats.expandedRows) +
        "</div>" +
        '      <div class="metric-sub">三年六學期實質開課</div>' +
        "    </div>" +
        "  </div>" +
        '  <h4 class="mt-4 mb-2">正規化前 5 筆預覽</h4>' +
        '  <div class="table-responsive">' +
        '    <table class="table">' +
        "      <thead>" +
        "        <tr>" +
        "          <th>開課學年</th><th>學期</th><th>年級</th><th>課程代碼</th><th>科目名稱</th><th>科別</th><th>科目屬性</th><th>必選修</th><th>學分</th>" +
        "        </tr>" +
        "      </thead>" +
        "      <tbody>" +
        sampleRowsHtml +
        "</tbody>" +
        "    </table>" +
        "  </div>" +
        "</div>";
    }

    return (
      '<div class="panel">' +
      '<div class="panel-header">' +
      "  <div>" +
      '    <h2 class="panel-title">108 課綱課程代碼匯入與 1NF 正規化</h2>' +
      '    <p class="panel-sub">自動展開三年六學期學分時數，轉譯代碼並儲存為第一正規化索引表</p>' +
      "  </div>" +
      "</div>" +
      contentHtml +
      "</div>"
    );
  }

  MEA.imports = {
    loadSheetJs: loadSheetJs,
    previewFile: previewFile,
    pickFile: pickFile,
    handleFileSelect: handleFileSelect,
    handleDragOver: handleDragOver,
    handleDragLeave: handleDragLeave,
    handleDrop: handleDrop,
    resetImport: resetImport,
    doImport: doImport,
    renderView: renderView
  };
})(window.MEA);
