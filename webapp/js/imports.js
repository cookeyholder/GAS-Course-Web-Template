/**
 * @file imports.js
 * @description 課程代碼 Excel 檔案解析、1NF 正規化即時預覽與後端匯入
 *
 * 開發與測試環境可透過 createImportsModule 注入依賴；瀏覽器環境仍組裝
 * window.MEA.imports，保留原有公開方法名稱、DOM 事件與 SheetJS CDN 備援邏輯。
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof window !== "undefined") {
    const MEA = (root.MEA = root.MEA || {});
    // task 6.1：僅註冊工廠，實例由 wiring.js 集中建立並注入最小介面。
    if (!MEA.factories) {
      MEA.factories = {};
    }
    MEA.factories.imports = api.createImportsModule;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  // task 6.4：共用 Node require 相容墊片與 safeErrors 注入解析（Node 由 require 取得，瀏覽器由全域取得）。
  const moduleHelpers = typeof require === "function" ? require("./moduleHelpers.js") : globalThis.MEA.moduleHelpers;

  // SheetJS 自 0.19 起僅於官方 CDN 發布；固定單一版本並以 SRI 驗證完整性。
  const SHEETJS_VERSION = "0.20.3";
  const SHEETJS_CDN = ["https://cdn.sheetjs.com/xlsx-" + SHEETJS_VERSION + "/package/dist/xlsx.full.min.js"];
  const SHEETJS_SRI = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";

  const SAMPLE_COLUMN_INDEXES = [0, 1, 2, 4, 5, 7, 10, 11, 12];

  /**
   * 判斷前幾列是否出現課綱寬表識別標頭。
   *
   * @param {Array} rows - 工作表列資料
   * @returns {boolean} 是否為課程代碼工作表
   */
  function looksLikeCourseCodes(rows) {
    const firstRows = (rows || []).slice(0, 3);
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

  /**
   * 挑選課程代碼工作表；找不到特色標頭時退回第一個有資料的工作表。
   * 每個工作表最多解析一次，避免退回邏輯重複呼叫 SheetJS。
   *
   * @param {Object} workbook - 試算表活頁簿
   * @param {Function} readRows - 讀取單一工作表列的函式
   * @returns {{sheetName: string, rows: Array}} 挑選結果
   */
  function pickCourseSheetRows(workbook, readRows) {
    const names = (workbook && workbook.SheetNames) || [];
    const reader =
      typeof readRows === "function"
        ? readRows
        : function () {
            return [];
          };
    const rowsBySheet = Object.create(null);
    let firstSheetWithRows = null;

    for (let i = 0; i < names.length; i++) {
      const sheetName = names[i];
      let rows;
      if (Object.prototype.hasOwnProperty.call(rowsBySheet, sheetName)) {
        rows = rowsBySheet[sheetName];
      } else {
        rows = reader(sheetName) || [];
        rowsBySheet[sheetName] = rows;
      }
      if (rows.length === 0) continue;

      if (!firstSheetWithRows) {
        firstSheetWithRows = { sheetName: sheetName, rows: rows };
      }
      if (looksLikeCourseCodes(rows)) {
        return { sheetName: sheetName, rows: rows };
      }
    }

    return firstSheetWithRows || { sheetName: "", rows: [] };
  }

  /**
   * 判斷目前使用者是否具備匯入權限。
   *
   * @param {Object} user - 使用者狀態
   * @returns {boolean} 是否可匯入
   */
  function canImportCourseCodes(user) {
    const perms = (user && user.perms) || [];
    return perms.indexOf("*") !== -1 || perms.indexOf("importCourseCodes") !== -1;
  }

  /**
   * 建立 108 課綱課程代碼官方來源管道與格式禁忌指引卡片。
   *
   * @returns {string} 指引區塊 HTML
   */
  function renderCourseCodeGuidanceHtml() {
    return (
      '<div class="course-guidance-card mt-4" style="background:var(--fill);border:1px solid var(--line-2);border-radius:8px;padding:16px 20px;" role="region" aria-label="108 課綱課程代碼官方來源管道指引">' +
      '  <h4 style="margin:0 0 10px 0;font-size:1rem;color:var(--ink);display:flex;align-items:center;gap:6px;">' +
      '    <span aria-hidden="true">📌</span> 課綱 Excel 檔案官方來源管道說明' +
      "  </h4>" +
      '  <ul style="margin:0;padding-left:20px;line-height:1.7;color:var(--ink-2);font-size:0.9rem;">' +
      "    <li><strong>教育部「高級中等學校課程計畫平臺」：</strong><code>學校/科主任登入 ➔ 備查通過清單 ➔ 匯出 [科目總表 (39欄 Excel)]</code></li>" +
      "    <li><strong>巨耀校務行政系統：</strong><code>[課務作業] ➔ [課程計畫] ➔ [歷年108課綱課程代碼] ➔ 綜合查詢 ➔ 匯出 Excel</code></li>" +
      "  </ul>" +
      '  <div class="mt-2" style="font-size:0.875rem;line-height:1.5;font-weight:500;color:var(--err);">' +
      '    <span aria-hidden="true">⚠️</span> <strong>格式注意事項：</strong>匯出後請直接上傳，請勿修改欄位順序、刪除表頭或合併儲存格，以免 1NF 正規化解析失敗。' +
      "  </div>" +
      "</div>"
    );
  }

  /**
   * 建立尚未選擇檔案時的拖曳上傳區。
   *
   * @returns {string} 上傳區 HTML
   */
  function buildDropzoneHtml() {
    return (
      '<div class="upload-dropzone" id="uploadDropzone"' +
      ' role="button"' +
      ' tabindex="0"' +
      ' aria-label="選擇或拖曳課程代碼 Excel 檔案"' +
      ' data-import-dropzone="1">' +
      '  <div class="dropzone-icon" aria-hidden="true">📁</div>' +
      '  <div class="dropzone-title">點擊選擇或拖曳課程代碼 Excel 檔案至此</div>' +
      '  <div class="dropzone-desc">支援自教育部課程計畫平臺下載之 .xlsx、.xls 或 .ods 寬表（39 欄格式）</div>' +
      "</div>" +
      '<input type="file" id="fileInput" class="sr-only" aria-label="選擇課程代碼 Excel 檔案" accept=".xlsx,.xls,.ods" data-import-action="file-select" />'
    );
  }

  /**
   * 輸出單列之所有 TD 單元格 HTML。
   *
   * @param {Array} row - 列資料
   * @param {Function} escapeHtml - HTML 跳脫函式
   * @returns {string} TD 標籤字串
   */
  function renderSampleRowCellsHtml(row, escapeHtml) {
    const r = row || [];
    let html = "";
    for (let j = 0; j < SAMPLE_COLUMN_INDEXES.length; j++) {
      const index = SAMPLE_COLUMN_INDEXES[j];
      const cell = index === 5 ? "<strong>" + escapeHtml(r[index]) + "</strong>" : escapeHtml(r[index]);
      html += "<td>" + cell + "</td>";
    }
    return html;
  }

  /**
   * 輸出正規化前五筆預覽列。
   *
   * @param {Array} sample - 預覽列資料
   * @param {Function} escapeHtml - HTML 跳脫函式
   * @returns {string} 表格列 HTML
   */
  function renderSampleRowsHtml(sample, escapeHtml) {
    let html = "";
    for (let i = 0; i < sample.length; i++) {
      html += "<tr>" + renderSampleRowCellsHtml(sample[i], escapeHtml) + "</tr>";
    }
    return html;
  }

  /**
   * 萃取預覽資料中所有不重複科別清單（依科別代碼升冪排序）。
   *
   * @param {Array<Array>} rows - 預覽列陣列
   * @param {Function} [comparator] - 自訂比較器（未傳時自動依 MEA.courseData.compareDepartmentsByCode 或預設降級）
   * @returns {Array<string>} 已排序的不重複科別清單
   */
  function extractPreviewDepartments(rows, comparator) {
    const list = Array.isArray(rows) ? rows : [];
    const seen = {};
    const depts = [];
    for (let i = 0; i < list.length; i++) {
      const row = list[i] || [];
      const dept = String(row[7] || "").trim();
      if (dept && !seen[dept]) {
        seen[dept] = true;
        depts.push(dept);
      }
    }
    const cmp =
      typeof comparator === "function"
        ? comparator
        : typeof MEA !== "undefined" &&
            MEA &&
            MEA.courseData &&
            typeof MEA.courseData.compareDepartmentsByCode === "function"
          ? MEA.courseData.compareDepartmentsByCode
          : typeof window !== "undefined" &&
              window.MEA &&
              window.MEA.courseData &&
              typeof window.MEA.courseData.compareDepartmentsByCode === "function"
            ? window.MEA.courseData.compareDepartmentsByCode
            : function (a, b) {
                return String(a || "").localeCompare(String(b || ""), "zh-TW");
              };
    return depts.sort(cmp);
  }

  /**
   * 輸出預覽科別篩選下拉選單 HTML。
   *
   * @param {Array<string>} departments - 科別清單
   * @param {string} selectedDept - 目前選定之科別
   * @param {Function} escapeHtml - HTML 跳脫函式
   * @returns {string} 下拉選單 HTML
   */
  function renderDeptFilterHtml(departments, selectedDept, escapeHtml) {
    const list = Array.isArray(departments) ? departments : [];
    let optionsHtml = '<option value="">全部科別</option>';
    for (let i = 0; i < list.length; i++) {
      const dept = list[i];
      if (!dept) continue;
      const sel = dept === selectedDept ? " selected" : "";
      optionsHtml += '<option value="' + escapeHtml(dept) + '"' + sel + ">" + escapeHtml(dept) + "</option>";
    }
    return (
      '<div style="display:inline-flex; align-items:center; gap:6px;">' +
      '  <label for="importDeptFilter" style="font-size:13.5px; color:var(--ink-2); white-space:nowrap;">科別篩選：</label>' +
      '  <select id="importDeptFilter" class="form-select form-select-sm" style="font-size:13px; padding:3px 8px; border-radius:4px;" data-import-action="filter-dept">' +
      optionsHtml +
      "  </select>" +
      "</div>"
    );
  }

  /**
   * 輸出解析統計卡片。
   *
   * @param {Object} stats - 解析統計資料
   * @param {Function} number - 數字格式化函式
   * @returns {string} 統計卡片 HTML
   */
  function renderMetricsHtml(stats, number) {
    return (
      '  <div class="metrics-grid mt-3">' +
      '    <div class="metric-card">' +
      '      <div class="metric-label">原始科目列數</div>' +
      '      <div class="metric-value">' +
      number(stats.sourceRows) +
      "</div>" +
      '      <div class="metric-sub">來源 39 欄資料</div>' +
      "    </div>" +
      '    <div class="metric-card">' +
      '      <div class="metric-label">匯入科目列數</div>' +
      '      <div class="metric-value text-accent">' +
      number(stats.keptCourseRows) +
      "</div>" +
      '      <div class="metric-sub">全數納入（不剔除任何屬性）</div>' +
      "    </div>" +
      '    <div class="metric-card">' +
      '      <div class="metric-label">1NF 展開後紀錄筆數</div>' +
      '      <div class="metric-value text-accent">' +
      number(stats.expandedRows) +
      "</div>" +
      '      <div class="metric-sub">三年六學期實質開課</div>' +
      "    </div>" +
      "  </div>"
    );
  }

  /**
   * 輸出檔案解析預覽卡片。
   *
   * @param {Object} entry - 匯入項目
   * @param {boolean} busy - 是否正在處理
   * @param {boolean} canImport - 是否具備匯入權限
   * @param {Function} escapeHtml - HTML 跳脫函式
   * @param {Function} number - 數字格式化函式
   * @param {Object} [ui] - UI 模組
   * @returns {string} 預覽卡片 HTML
   */
  function renderPreviewCardHtml(entry, busy, canImport, escapeHtml, number, ui, comparator) {
    const stats = entry.stats || {};
    const sample = entry.sample || [];
    const payload = Array.isArray(entry.payload) ? entry.payload : [];
    const departments = extractPreviewDepartments(payload.concat(sample), comparator);
    const selectedDept = entry.deptFilter || "";
    const filterHtml = renderDeptFilterHtml(departments, selectedDept, escapeHtml);

    const displayRows = selectedDept
      ? sample.filter(function (r) {
          return r && r[7] === selectedDept;
        })
      : sample;

    const disabled = busy || !canImport || entry.imported ? " disabled" : "";
    const buttonText = entry.imported ? "✓ 已匯入完成" : busy ? "匯入中..." : "確認匯入至試算表";

    const columns = [
      { title: "開課學年" },
      { title: "學期" },
      { title: "年級" },
      { title: "課程代碼" },
      { title: "科目名稱" },
      { title: "科別" },
      { title: "科目屬性" },
      { title: "必選修" },
      { title: "學分" }
    ];

    const resolvedUi =
      ui ||
      (typeof MEA !== "undefined" && MEA.ui) ||
      (typeof window !== "undefined" && window.MEA && window.MEA.ui) ||
      null;

    const pagedTableHtml =
      resolvedUi && typeof resolvedUi.renderPagedTable === "function"
        ? resolvedUi.renderPagedTable({
            className: "table table-centered table-hover",
            columns: columns,
            items: displayRows,
            rowRenderer: function (row) {
              return renderSampleRowCellsHtml(row, escapeHtml);
            },
            emptyText: "無相符的預覽資料。",
            colspan: 9
          })
        : '<div class="table-responsive mt-3">' +
          '  <table class="table">' +
          "    <thead>" +
          "      <tr>" +
          '        <th scope="col">開課學年</th><th scope="col">學期</th><th scope="col">年級</th><th scope="col">課程代碼</th><th scope="col">科目名稱</th><th scope="col">科別</th><th scope="col">科目屬性</th><th scope="col">必選修</th><th scope="col">學分</th>' +
          "      </tr>" +
          "    </thead>" +
          "    <tbody>" +
          renderSampleRowsHtml(displayRows, escapeHtml) +
          "</tbody>" +
          "    </table>" +
          "  </div>";

    return (
      '<div class="card">' +
      '  <div class="card-header">' +
      "    <div>" +
      '      <h3 class="card-title">檔案解析預覽：' +
      escapeHtml(entry.fileName) +
      "</h3>" +
      '      <p class="card-sub">來源工作表：' +
      escapeHtml(entry.sheetName) +
      " · 檔案大小：" +
      Math.round(entry.fileSize / 1024) +
      " KB</p>" +
      "    </div>" +
      '    <div class="card-actions">' +
      '      <button type="button" class="btn secondary compact" data-import-action="reset">重新選擇</button>' +
      '      <button type="button" class="btn primary compact" data-import-action="import"' +
      disabled +
      ">" +
      buttonText +
      "      </button>" +
      "    </div>" +
      "  </div>" +
      renderMetricsHtml(stats, number) +
      '  <div class="mt-4 mb-2" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">' +
      '    <h4 style="margin:0;">正規化前 5 筆預覽</h4>' +
      filterHtml +
      "  </div>" +
      pagedTableHtml +
      "</div>"
    );
  }

  /**
   * 包裹匯入頁籤的外層面板。
   *
   * @param {string} contentHtml - 上傳區或預覽卡片 HTML
   * @returns {string} 完整面板 HTML
   */
  function renderPanelHtml(contentHtml) {
    return (
      '<div class="panel">' +
      '<div class="panel-header">' +
      "  <div>" +
      '    <h2 class="panel-title">課程代碼匯入與 1NF 正規化</h2>' +
      '    <p class="panel-sub">自動展開三年六學期學分時數，轉譯代碼並儲存為第一正規化索引表</p>' +
      "  </div>" +
      "</div>" +
      contentHtml +
      "</div>"
    );
  }

  /**
   * 產生唯一的匯入操作識別碼 (UUID-like)
   *
   * @returns {string} 識別碼
   */
  function generateImportId() {
    return "imp-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  }

  /**
   * 建構匯入成功後的狀態更新物件（不可變）
   *
   * @param {Object} entry - 當前匯入項目
   * @param {Object} result - 後端回傳結果
   * @returns {Object} State patch 物件
   */
  function buildImportSuccessPatch(entry, result) {
    return {
      imports: {
        courseCodes: Object.assign({}, entry, { imported: true })
      },
      importLast: result,
      importBusy: false
    };
  }

  /**
   * 建立可注入依賴的匯入模組實例。
   *
   * @param {Object} deps - MEA、window、document 與選擇性 FileReader 依賴
   * @returns {Object} MEA.imports 公開方法與測試用內部函式
   */
  function createImportsModule(deps) {
    const options = deps || {};
    const safeErrors = moduleHelpers.resolveSafeErrors(options);
    const MEA = options.MEA || (typeof window !== "undefined" ? window.MEA : null) || {};
    const win = options.window || (typeof window !== "undefined" ? window : null) || {};
    const doc = options.document || (win && win.document) || (typeof document !== "undefined" ? document : null);
    const FileReaderCtor =
      options.FileReader || (win && win.FileReader) || (typeof FileReader !== "undefined" ? FileReader : null);
    // task 6.2：事件綁定守護由共用模組提供（Node 由 require 取得，瀏覽器由全域取得）。
    const bindings = typeof require === "function" ? require("./eventBindings.js") : globalThis.MEA.eventBindings;

    /** 以 document 委派綁定拖曳區、檔案輸入與預覽卡片事件。 */
    function bindEventsOnce() {
      if (!bindings || !doc || typeof doc.addEventListener !== "function") return;
      bindings.delegate(doc, "dragover", "[data-import-dropzone]", function (event, element) {
        handleDragOver(event, element);
      });
      bindings.delegate(doc, "dragleave", "[data-import-dropzone]", function (event, element) {
        handleDragLeave(event, element);
      });
      bindings.delegate(doc, "drop", "[data-import-dropzone]", function (event, element) {
        handleDrop(event, element);
      });
      bindings.delegate(doc, "keydown", "[data-import-dropzone]", function (event) {
        handleDropzoneKey(event);
      });
      bindings.delegate(doc, "click", "[data-import-dropzone]", function () {
        pickFile();
      });
      bindings.delegate(doc, "change", "[data-import-action='file-select']", function (event, element) {
        handleFileSelect(element);
      });
      bindings.delegate(doc, "change", "[data-import-action='filter-dept']", function (event, element) {
        handleDeptFilter(element.value);
      });
      bindings.delegate(doc, "click", "[data-import-action]", function (event, element) {
        const action = element.getAttribute("data-import-action");
        if (action === "reset") return resetImport();
        if (action === "import") return doImport();
        return undefined;
      });
    }

    bindEventsOnce();

    let sheetJsPromise = null;

    function loadSheetJs() {
      if (sheetJsPromise) return sheetJsPromise;
      if (win.XLSX) {
        sheetJsPromise = Promise.resolve(win.XLSX);
        return sheetJsPromise;
      }

      sheetJsPromise = new Promise(function (resolve, reject) {
        let index = 0;

        function attempt() {
          if (index >= SHEETJS_CDN.length) {
            reject(new Error("無法載入 SheetJS 解析套件，請確認網路連線"));
            return;
          }
          const script = doc.createElement("script");
          script.src = SHEETJS_CDN[index++];
          script.async = true;
          script.integrity = SHEETJS_SRI;
          script.crossOrigin = "anonymous";
          script.onload = function () {
            if (win.XLSX) {
              resolve(win.XLSX);
            } else {
              attempt();
            }
          };
          script.onerror = attempt;
          doc.head.appendChild(script);
        }

        attempt();
      });

      return sheetJsPromise;
    }

    function rowsOfSheet(workbook, sheetName) {
      const sheet = workbook && workbook.Sheets ? workbook.Sheets[sheetName] : null;
      if (!sheet) return [];
      return win.XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false
      });
    }

    function readRowsOfSheet(workbook) {
      return function (sheetName) {
        return rowsOfSheet(workbook, sheetName);
      };
    }

    function readFileRows(file) {
      return loadSheetJs().then(function (XLSX) {
        return new Promise(function (resolve, reject) {
          const reader = new FileReaderCtor();
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
          const picked = pickCourseSheetRows(workbook, readRowsOfSheet(workbook));
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
          MEA.ui.toast(safeErrors.resolveSafeMessage(error, "解析檔案失敗，請稍後再試"), "err");
          return null;
        });
    }

    function pickFile() {
      const input = doc.getElementById("fileInput");
      if (input) input.click();
    }

    /**
     * 讓鍵盤使用者以 Enter 或 Space 觸發檔案選擇。
     *
     * @param {Object} e - 鍵盤事件
     */
    function handleDropzoneKey(e) {
      if (!e) return;
      const key = e.key || (e.keyCode === 32 ? " " : "");
      if (key !== "Enter" && key !== " " && key !== "Spacebar") return;
      if (typeof e.preventDefault === "function") e.preventDefault();
      pickFile();
    }

    function handleFileSelect(input) {
      const file = input && input.files && input.files[0];
      if (input) input.value = "";
      if (file) previewFile(file);
    }

    function handleDragOver(e, element) {
      e.preventDefault();
      const zone = element || doc.getElementById("uploadDropzone");
      if (zone && zone.classList) zone.classList.add("dragover");
    }

    function handleDragLeave(e, element) {
      e.preventDefault();
      const zone = element || doc.getElementById("uploadDropzone");
      if (zone && zone.classList) zone.classList.remove("dragover");
    }

    function handleDrop(e, element) {
      e.preventDefault();
      const zone = element || doc.getElementById("uploadDropzone");
      if (zone && zone.classList) zone.classList.remove("dragover");

      const file = e.dataTransfer && e.dataTransfer.files ? e.dataTransfer.files[0] : null;
      if (file) previewFile(file);
    }

    function resetImport() {
      MEA.setState({
        imports: {},
        importLast: null
      });
    }

    function handleImportResult(entry, result) {
      if (!result || result.ok !== true) {
        MEA.setState({ importBusy: false });
        MEA.ui.toast((result && result.message) || "匯入失敗", "err");
        return;
      }

      MEA.setState(buildImportSuccessPatch(entry, result));

      MEA.ui.toast(
        result.idempotent === true
          ? "此匯入已處理完成，不重複寫入（冪等命中）"
          : "課程代碼匯入完成！已儲存至「正規化課程代碼」工作表",
        "ok"
      );

      if (MEA.courses && typeof MEA.courses.fetchList === "function") {
        MEA.courses.fetchList(1);
      }
    }

    function handleImportError(error) {
      MEA.setState({ importBusy: false });
      const detail = safeErrors.resolveSafeMessage(error, "匯入失敗，請稍後再試");
      MEA.ui.toast(detail + "（系統不會自動重送，請確認後再手動重試）", "err");
    }

    function doImport() {
      const entry = (MEA.state.imports || {}).courseCodes;
      if (!entry || !Array.isArray(entry.payload) || entry.payload.length === 0) {
        MEA.ui.toast("請先選擇並解析課程代碼檔案", "warn");
        return;
      }

      const importId = entry.importId || generateImportId();
      if (!entry.importId) {
        entry.importId = importId;
        const nextImports = Object.assign({}, MEA.state.imports, {
          courseCodes: Object.assign({}, entry, { importId: importId })
        });
        MEA.setState({ imports: nextImports });
      }

      MEA.setState({ importBusy: true });
      MEA.ui.toast("正在寫入 Google 試算表（共 " + entry.payload.length + " 筆）...", "info");

      MEA.api
        .call(
          "importCourseCodes",
          {
            rows: entry.payload,
            preNormalized: true,
            importId: importId
          },
          { retry: false }
        )
        .then(function (result) {
          handleImportResult(entry, result);
        })
        .catch(handleImportError);
    }

    function handleDeptFilter(dept) {
      const current = MEA.state.imports || {};
      const currentEntry = current.courseCodes;
      if (!currentEntry) return;
      const nextEntry = Object.assign({}, currentEntry, {
        deptFilter: dept || ""
      });
      MEA.setState({
        imports: Object.assign({}, current, {
          courseCodes: nextEntry
        })
      });
    }

    function renderView() {
      const entry = (MEA.state.imports || {}).courseCodes;
      const busy = MEA.state.importBusy;
      const user = MEA.state.user || {};
      const canImport = canImportCourseCodes(user);
      const safeEscapeHtml =
        options.escapeHtml ||
        (MEA.ui && MEA.ui.escapeHtml) ||
        function (str) {
          return String(str == null ? "" : str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
        };
      const safeNumber =
        options.number ||
        (MEA.ui && MEA.ui.number) ||
        function (val) {
          const n = Number(val);
          return isNaN(n) ? "0" : String(n);
        };
      const compareFn =
        options.compareDepartmentsByCode ||
        (MEA.courseData && typeof MEA.courseData.compareDepartmentsByCode === "function"
          ? MEA.courseData.compareDepartmentsByCode
          : function (a, b) {
              return String(a || "").localeCompare(String(b || ""), "zh-TW");
            });

      const contentHtml = entry
        ? renderPreviewCardHtml(entry, busy, canImport, safeEscapeHtml, safeNumber, MEA.ui || {}, compareFn)
        : buildDropzoneHtml() + renderCourseCodeGuidanceHtml();

      return renderPanelHtml(contentHtml);
    }

    const api = {
      loadSheetJs: loadSheetJs,
      previewFile: previewFile,
      pickFile: pickFile,
      handleDropzoneKey: handleDropzoneKey,
      handleFileSelect: handleFileSelect,
      handleDeptFilter: handleDeptFilter,
      handleDragOver: handleDragOver,
      handleDragLeave: handleDragLeave,
      handleDrop: handleDrop,
      resetImport: resetImport,
      doImport: doImport,
      renderCourseCodeGuidanceHtml: renderCourseCodeGuidanceHtml,
      renderView: renderView
    };

    if (options.exposeInternals) {
      Object.assign(api, {
        rowsOfSheet: rowsOfSheet,
        readRowsOfSheet: readRowsOfSheet,
        looksLikeCourseCodes: looksLikeCourseCodes,
        pickCourseSheetRows: function (workbook) {
          return pickCourseSheetRows(workbook, readRowsOfSheet(workbook));
        },
        previewCourseCodes: previewCourseCodes,
        canImportCourseCodes: canImportCourseCodes,
        buildDropzoneHtml: buildDropzoneHtml,
        renderCourseCodeGuidanceHtml: renderCourseCodeGuidanceHtml,
        extractPreviewDepartments: extractPreviewDepartments,
        renderDeptFilterHtml: renderDeptFilterHtml,
        renderSampleRowCellsHtml: renderSampleRowCellsHtml,
        renderSampleRowsHtml: renderSampleRowsHtml,
        renderMetricsHtml: renderMetricsHtml,
        renderPreviewCardHtml: renderPreviewCardHtml,
        renderPanelHtml: renderPanelHtml,
        handleImportResult: handleImportResult,
        handleImportError: handleImportError
      });
    }

    return api;
  }

  return {
    createImportsModule: createImportsModule,
    SHEETJS_CDN: SHEETJS_CDN,
    SHEETJS_VERSION: SHEETJS_VERSION,
    SHEETJS_SRI: SHEETJS_SRI,
    SAMPLE_COLUMN_INDEXES: SAMPLE_COLUMN_INDEXES,
    looksLikeCourseCodes: looksLikeCourseCodes,
    pickCourseSheetRows: pickCourseSheetRows,
    canImportCourseCodes: canImportCourseCodes,
    buildDropzoneHtml: buildDropzoneHtml,
    renderCourseCodeGuidanceHtml: renderCourseCodeGuidanceHtml,
    extractPreviewDepartments: extractPreviewDepartments,
    renderDeptFilterHtml: renderDeptFilterHtml,
    renderSampleRowCellsHtml: renderSampleRowCellsHtml,
    renderSampleRowsHtml: renderSampleRowsHtml,
    renderMetricsHtml: renderMetricsHtml,
    renderPreviewCardHtml: renderPreviewCardHtml,
    renderPanelHtml: renderPanelHtml,
    generateImportId: generateImportId,
    buildImportSuccessPatch: buildImportSuccessPatch
  };
});
