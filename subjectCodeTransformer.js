/**
 * @file subjectCodeTransformer.js
 * @description 108 課綱課程代碼對照與 1NF 正規化處理模組
 *
 * 將教育部課程計畫平臺下載之 39 欄課程代碼寬表展開並正規化為 14 欄的第一正規化（1NF）課程索引：
 * 1. 全數匯入所有課程代碼，不剔除任何科目屬性（包含不分屬性 0 與特殊需求領域 6）
 * 2. 依六學期（一上、一下、二上、二下、三上、三下）開課學分與時數展開
 * 3. 代碼轉譯為可讀之群別、科別、課程類別、開課方式、科目屬性與必選修中文名稱
 */

// ============================================================================
// 課程代碼對照表常數（提升至頂層以達零物件建立開銷 O(1) 查找）
// ============================================================================

const NORMALIZED_COURSE_SHEET_NAME = "正規化課程索引";

/**
 * 正規化課程索引標準表頭（共 14 欄）
 */
const NORMALIZED_COURSE_HEADERS = [
  "開課學年",
  "開課學期",
  "修課年級",
  "學生入學年",
  "課程代碼",
  "科目名稱",
  "群別",
  "科別",
  "課程類別",
  "開課方式",
  "科目屬性",
  "必選修",
  "學分數",
  "開課時數"
];

/** 一次批次寫入正規化課程索引的最大列數 */
const COURSE_INDEX_WRITE_CHUNK_SIZE = 5000;

/** 科目屬性排除名單（本專案全數匯入，不剔除任何科目） */
const EXCLUDED_SUBJECT_ATTRIBUTES = [];

const GROUP_CODE_NAMES = {
  11: "學術群",
  21: "機械群",
  22: "動力機械群",
  23: "電機與電子群",
  24: "化工群",
  25: "土木與建築群",
  26: "商業與管理群／商業群(綜高、實用技能學程)",
  27: "外語群",
  28: "設計群",
  29: "農業群",
  30: "食品群",
  31: "家政群",
  32: "餐旅群",
  33: "水產群",
  34: "海事群",
  35: "藝術群",
  36: "美容造型群(實用技能學程)",
  40: "服務群(特殊教育類型)",
  41: "其他(綜高)"
};

const DEPARTMENT_CODE_NAMES = {
  301: "機械科",
  303: "汽車科",
  305: "資訊科",
  306: "電子科",
  308: "電機科",
  309: "冷凍空調科",
  311: "建築科",
  315: "化工科",
  321: "電機空調科",
  373: "圖文傳播科",
  374: "電腦機械製圖科"
};

const SUBJECT_TYPE_NAMES = {
  1: "部定必修",
  2: "校訂必修",
  3: "選修-加深加廣選修",
  4: "選修-補強性選修",
  5: "選修-多元選修",
  6: "選修-其他",
  7: "校訂選修",
  8: "團體活動時間",
  9: "彈性學習時間",
  A: "大學預修課程",
  B: "基礎訓練",
  C: "職前訓練",
  D: "寒暑假課程",
  E: "返校課程",
  F: "職業技能訓練"
};

const OPEN_WAY_NAMES = {
  0: "原班級",
  1: "跨班選修(班群開課)",
  2: "綜高跨年級選修",
  A: "同科單班選修",
  B: "同科跨班選修",
  C: "同群跨科選修、跨學程選修",
  D: "同校跨群選修",
  E: "跨校選修"
};

const SUBJECT_ATTRIBUTION_NAMES = {
  0: "不分屬性",
  1: "一般科目",
  2: "專業科目",
  3: "實習科目",
  4: "專精科目",
  5: "專精科目(核心科目)",
  6: "特殊需求領域",
  A: "自主學習",
  B: "選手培訓",
  C: "充實(增廣)、補強性教學[全學期、不授予學分]",
  D: "充實(增廣)、補強性教學[全學期、授予學分]",
  E: "學校特色活動",
  F: "專精(專業)科目",
  G: "專精(實習)科目",
  H: "專精(專業)科目(核心)",
  I: "專精(實習)科目(核心)"
};

const REQUIRED_ELECTIVE_NAMES = {
  1: "必修",
  2: "選修"
};

// ============================================================================
// 代碼查表與輔助轉譯函式
// ============================================================================

function getGroupName(code) {
  const k = code === null || code === undefined ? "" : String(code).trim();
  return GROUP_CODE_NAMES[k] || k;
}

function getDepartmentNameByCode(code) {
  const k = code === null || code === undefined ? "" : String(code).trim();
  return DEPARTMENT_CODE_NAMES[k] || k;
}

function getSubjectType(code) {
  const k = code === null || code === undefined ? "" : String(code).trim();
  return SUBJECT_TYPE_NAMES[k] || k;
}

function getOpenWay(code) {
  const k = code === null || code === undefined ? "" : String(code).trim();
  return OPEN_WAY_NAMES[k] || k;
}

function getSubjectAttribution(code) {
  const k = code === null || code === undefined ? "" : String(code).trim();
  return SUBJECT_ATTRIBUTION_NAMES[k] || k;
}

function isRequiredOrElective(code) {
  const k = code === null || code === undefined ? "" : String(code).trim();
  return REQUIRED_ELECTIVE_NAMES[k] || k;
}

/**
 * 判斷是否為巨耀匯出課程代碼之表頭列
 *
 * @param {Array} row - 單一資料列
 * @returns {boolean} 是否為表頭列
 */
function isCourseCodeHeaderRow(row) {
  if (!Array.isArray(row) || row.length === 0) return false;
  const first = row[0] === null || row[0] === undefined ? "" : String(row[0]).trim();
  const attr = row[11] === null || row[11] === undefined ? "" : String(row[11]).trim();
  return first === "課程代碼" || attr === "科目屬性";
}

/**
 * 判斷課程列是否應於匯入時剔除（本專案全數匯入，不剔除任何科目）
 *
 * @param {Array} row - 39 欄原始課程列
 * @returns {boolean} false 表示不剔除（全數保留）
 */
function isExcludedCourseRow(row) {
  if (!Array.isArray(row)) return false;
  if (EXCLUDED_SUBJECT_ATTRIBUTES.length === 0) return false;
  const attr = row[11] === null || row[11] === undefined ? "" : String(row[11]).trim();
  return EXCLUDED_SUBJECT_ATTRIBUTES.indexOf(attr) !== -1;
}

/**
 * 將單一 39 欄課程列展開為 0~6 筆 14 欄 1NF 正規化紀錄
 *
 * 僅保留「開課學分 > 0 或開課時數 > 0」之學期：
 * - 開課學年：第 16 + floor(s / 2) 欄（一/二/三年級學年）
 * - 修課年級：floor(s / 2) + 1
 * - 開課學期：(s % 2) + 1
 * - 學生入學年：第 16 欄
 * - 開課方式：第 31 + s 欄，若為空則退回第 10 欄
 *
 * @param {Array} row - 39 欄原始課程列
 * @returns {Array<Array>} 14 欄正規化紀錄陣列
 */
function expandCourseRow(row) {
  const expanded = [];
  if (!Array.isArray(row) || row.length < 31) return expanded;

  const entryYear = row[16] === null || row[16] === undefined ? "" : String(row[16]).trim();
  const fallbackOpenWay = row[10];

  for (let s = 0; s < 6; s++) {
    const credits = Number(row[19 + s] || 0);
    const hours = Number(row[25 + s] || 0);

    // 僅展開實際開課（學分或時數大於 0）之學期
    if (!(credits > 0 || hours > 0)) continue;

    const gradeIndex = Math.floor(s / 2);
    const academicYear =
      row[16 + gradeIndex] === null || row[16 + gradeIndex] === undefined ? "" : String(row[16 + gradeIndex]).trim();
    const semester = String((s % 2) + 1);

    const semesterOpenWay =
      row[31 + s] === null || row[31 + s] === undefined || row[31 + s] === "" ? fallbackOpenWay : row[31 + s];

    expanded.push([
      academicYear,
      semester,
      String(gradeIndex + 1),
      entryYear,
      row[0] === null || row[0] === undefined ? "" : String(row[0]).trim(),
      row[2] === null || row[2] === undefined ? "" : String(row[2]).trim(),
      getGroupName(row[6]) || "",
      getDepartmentNameByCode(row[7]) || "",
      getSubjectType(row[9]) || "",
      getOpenWay(semesterOpenWay) || "",
      getSubjectAttribution(row[11]) || "",
      isRequiredOrElective(row[15]) || "",
      credits,
      hours
    ]);
  }

  return expanded;
}

/**
 * 將教育部課程計畫平臺下載之 39 欄課程代碼寬表正規化為 14 欄 1NF 課程索引
 *
 * @param {Array<Array>} rawData - 教育部課程計畫平臺下載之 39 欄課程代碼原始資料（可含表頭列）
 * @param {Object} [options] - 選項
 * @param {string|number} [options.academicYear] - 僅保留指定開課學年
 * @param {string|number} [options.semester] - 僅保留指定開課學期
 * @param {boolean} [options.withStats=false] - 為 true 時回傳 `{ rows, stats }`
 * @returns {Array<Array>|Object} 14 欄正規化資料列，或含統計資訊之物件
 */
function normalizeCourseCodes(rawData, options) {
  options = options || {};
  const rows = Array.isArray(rawData) ? rawData : [];
  const academicYear =
    options.academicYear === null || options.academicYear === undefined ? "" : String(options.academicYear).trim();
  const semester = options.semester === null || options.semester === undefined ? "" : String(options.semester).trim();

  let sourceRows = 0;
  let excludedRows = 0;
  let keptCourseRows = 0;
  let totalExpanded = 0;

  const normalized = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!Array.isArray(row) || row.length === 0) continue;
    if (isCourseCodeHeaderRow(row)) continue;

    sourceRows++;

    if (isExcludedCourseRow(row)) {
      excludedRows++;
      continue;
    }

    keptCourseRows++;
    const expanded = expandCourseRow(row);
    totalExpanded += expanded.length;

    for (let j = 0; j < expanded.length; j++) {
      const record = expanded[j];
      if (academicYear !== "" && record[0] !== academicYear) continue;
      if (semester !== "" && record[1] !== semester) continue;
      normalized.push(record);
    }
  }

  if (options.withStats) {
    return {
      rows: normalized,
      stats: {
        sourceRows: sourceRows,
        excludedRows: excludedRows,
        keptCourseRows: keptCourseRows,
        expandedRows: totalExpanded,
        returnedRows: normalized.length
      }
    };
  }

  return normalized;
}

function resolveImportCourseSpreadsheet_(options) {
  const opts = options || {};
  return (
    opts.spreadsheet ||
    (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
      ? SpreadsheetApp.getActiveSpreadsheet()
      : null)
  );
}

function resolveNormalizeCourseCodesFn_() {
  if (typeof globalThis !== "undefined" && typeof globalThis.normalizeCourseCodes === "function") {
    return globalThis.normalizeCourseCodes;
  }
  return normalizeCourseCodes;
}

function resolveSafeApplySheetFontSizeFn_() {
  if (typeof safeApplySheetFontSize === "function") return safeApplySheetFontSize;
  if (typeof globalThis !== "undefined" && typeof globalThis.safeApplySheetFontSize === "function") {
    return globalThis.safeApplySheetFontSize;
  }
  return function () {};
}

function buildPreNormalizedImportResult_(rawData) {
  const rows = Array.isArray(rawData) ? rawData.slice() : [];
  if (rows.length > 0 && Array.isArray(rows[0]) && String(rows[0][0]).trim() === NORMALIZED_COURSE_HEADERS[0]) {
    rows.shift();
  }
  return {
    rows: rows,
    stats: {
      sourceRows: rows.length,
      excludedRows: 0,
      keptCourseRows: rows.length,
      expandedRows: rows.length,
      returnedRows: rows.length
    }
  };
}

function prepareCourseImportResult_(rawData, options) {
  if (options.preNormalized === true) {
    return buildPreNormalizedImportResult_(rawData);
  }
  return resolveNormalizeCourseCodesFn_()(rawData, { withStats: true });
}

function getOrCreateCourseIndexSheet_(ss) {
  let sheet = ss.getSheetByName(NORMALIZED_COURSE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(NORMALIZED_COURSE_SHEET_NAME);
  }
  return sheet;
}

function prepareCourseIndexSheet_(sheet, options) {
  if (options.reset !== false) {
    sheet.clearContents();
  }
  if (sheet.getMaxColumns() < NORMALIZED_COURSE_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), NORMALIZED_COURSE_HEADERS.length - sheet.getMaxColumns());
  }
}

function writeCourseIndexHeaderAndFormat_(sheet, totalDataRows) {
  const colCount = NORMALIZED_COURSE_HEADERS.length;
  const rowCount = Math.max(sheet.getMaxRows(), totalDataRows + 1);
  sheet.getRange(1, 1, 1, colCount).setValues([NORMALIZED_COURSE_HEADERS]);
  sheet.getRange(1, 1, 1, colCount).setFontWeight("bold");
  sheet.getRange(1, 1, rowCount, colCount).setNumberFormat("@");
}

function writeCourseIndexRowsInChunks_(sheet, rows) {
  const colCount = NORMALIZED_COURSE_HEADERS.length;
  for (let start = 0; start < rows.length; start += COURSE_INDEX_WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + COURSE_INDEX_WRITE_CHUNK_SIZE);
    sheet.getRange(start + 2, 1, chunk.length, colCount).setValues(chunk);
  }
}

function finalizeCourseIndexSheet_(sheet, totalDataRows) {
  const colCount = NORMALIZED_COURSE_HEADERS.length;
  const rowCount = Math.max(sheet.getMaxRows(), totalDataRows + 1);
  resolveSafeApplySheetFontSizeFn_()(sheet.getRange(1, 1, rowCount, colCount), 11);
  if (sheet.getFrozenRows() < 1) {
    sheet.setFrozenRows(1);
  }
}

/**
 * 匯入正規化課程代碼至工作表
 *
 * @param {Array<Array>} rawData - 課程代碼資料（原始 39 欄或已正規化 14 欄）
 * @param {Object} [options] - 選項
 * @param {Spreadsheet} [options.spreadsheet] - 指定試算表
 * @param {boolean} [options.preNormalized=false] - 是否已經前端正規化
 * @param {boolean} [options.reset=true] - 是否清空既有資料
 * @returns {Object} 匯入結果 `{ ok, rows, stats }`
 */
function importNormalizedCourseCodes(rawData, options) {
  options = options || {};
  const ss = resolveImportCourseSpreadsheet_(options);
  if (!ss) {
    throw new Error("找不到有效的試算表物件");
  }

  const result = prepareCourseImportResult_(rawData, options);
  const rows = result.rows;
  const sheet = getOrCreateCourseIndexSheet_(ss);

  prepareCourseIndexSheet_(sheet, options);
  writeCourseIndexHeaderAndFormat_(sheet, rows.length);
  writeCourseIndexRowsInChunks_(sheet, rows);
  finalizeCourseIndexSheet_(sheet, rows.length);

  return {
    ok: true,
    rows: rows.length,
    stats: result.stats
  };
}

function resolveCourseIndexSpreadsheet_(ss) {
  return (
    ss ||
    (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet
      ? SpreadsheetApp.getActiveSpreadsheet()
      : null)
  );
}

function createEmptyCourseQueryResult_(page, pageSize, totalPages) {
  return {
    ok: true,
    list: [],
    total: 0,
    page: typeof page === "number" ? page : 1,
    pageSize: typeof pageSize === "number" ? pageSize : 50,
    totalPages: typeof totalPages === "number" ? totalPages : 0
  };
}

function getCourseIndexDataRows_(targetSs) {
  if (!targetSs) return null;
  const sheet = targetSs.getSheetByName(NORMALIZED_COURSE_SHEET_NAME);
  if (!sheet) return null;
  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return null;
  return values.slice(1);
}

function normalizeCourseQueryCriteria_(filter) {
  const source = filter || {};
  return {
    keyword: (source.keyword || "").trim().toLowerCase(),
    year: (source.academicYear || "").trim(),
    semester: (source.semester || "").trim(),
    department: (source.department || "").trim()
  };
}

function mapCourseIndexRow_(row) {
  const r = row || [];
  return {
    academicYear: String(r[0] || ""),
    semester: String(r[1] || ""),
    grade: String(r[2] || ""),
    entryYear: String(r[3] || ""),
    courseCode: String(r[4] || ""),
    subjectName: String(r[5] || ""),
    group: String(r[6] || ""),
    department: String(r[7] || ""),
    subjectType: String(r[8] || ""),
    openWay: String(r[9] || ""),
    attribute: String(r[10] || ""),
    required: String(r[11] || ""),
    credits: String(r[12] || ""),
    hours: String(r[13] || "")
  };
}

function isCourseRowMatchedByFields_(item, criteria) {
  if (criteria.year !== "" && item.academicYear !== criteria.year) return false;
  if (criteria.semester !== "" && item.semester !== criteria.semester) return false;
  if (criteria.department !== "" && item.department !== criteria.department) return false;
  return true;
}

function isCourseRowMatchedByKeyword_(item, keyword) {
  if (keyword === "") return true;
  const line = (item.courseCode + " " + item.subjectName + " " + item.department + " " + item.group).toLowerCase();
  return line.indexOf(keyword) !== -1;
}

function isCourseIndexRowMatched_(item, criteria) {
  return isCourseRowMatchedByFields_(item, criteria) && isCourseRowMatchedByKeyword_(item, criteria.keyword);
}

function collectMatchedCourseRows_(dataRows, criteria) {
  const matched = [];
  for (let i = 0; i < dataRows.length; i++) {
    const item = mapCourseIndexRow_(dataRows[i]);
    if (!isCourseIndexRowMatched_(item, criteria)) continue;
    matched.push(item);
  }
  return matched;
}

function normalizeCoursePageParams_(filter) {
  const source = filter || {};
  const page = Math.max(1, parseInt(source.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(source.pageSize, 10) || 50));
  return { page: page, pageSize: pageSize };
}

function buildPagedCourseResult_(matched, page, pageSize) {
  const total = matched.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  const pageItems = matched.slice(start, start + pageSize);
  return {
    ok: true,
    list: pageItems,
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: totalPages
  };
}

/**
 * 讀取並分頁查詢正規化課程索引
 *
 * @param {Object} [filter] - 篩選條件
 * @param {string} [filter.keyword] - 科目名稱或代碼關鍵字
 * @param {string} [filter.academicYear] - 開課學年
 * @param {string} [filter.semester] - 開課學期
 * @param {string} [filter.department] - 科別
 * @param {number} [filter.page=1] - 頁碼（1-based）
 * @param {number} [filter.pageSize=50] - 每頁筆數
 * @param {Spreadsheet} [ss] - 試算表物件
 * @returns {Object} 查詢結果 `{ ok: true, list, total, page, pageSize, totalPages }`
 */
function getNormalizedCourses(filter, ss) {
  const targetSs = resolveCourseIndexSpreadsheet_(ss);
  const dataRows = getCourseIndexDataRows_(targetSs);
  if (!dataRows) return createEmptyCourseQueryResult_();

  const criteria = normalizeCourseQueryCriteria_(filter);
  const matched = collectMatchedCourseRows_(dataRows, criteria);
  const paging = normalizeCoursePageParams_(filter);
  return buildPagedCourseResult_(matched, paging.page, paging.pageSize);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    NORMALIZED_COURSE_SHEET_NAME: NORMALIZED_COURSE_SHEET_NAME,
    NORMALIZED_COURSE_HEADERS: NORMALIZED_COURSE_HEADERS,
    GROUP_CODE_NAMES: GROUP_CODE_NAMES,
    DEPARTMENT_CODE_NAMES: DEPARTMENT_CODE_NAMES,
    SUBJECT_TYPE_NAMES: SUBJECT_TYPE_NAMES,
    OPEN_WAY_NAMES: OPEN_WAY_NAMES,
    SUBJECT_ATTRIBUTION_NAMES: SUBJECT_ATTRIBUTION_NAMES,
    REQUIRED_ELECTIVE_NAMES: REQUIRED_ELECTIVE_NAMES,
    getGroupName: getGroupName,
    getDepartmentNameByCode: getDepartmentNameByCode,
    getSubjectType: getSubjectType,
    getOpenWay: getOpenWay,
    getSubjectAttribution: getSubjectAttribution,
    isRequiredOrElective: isRequiredOrElective,
    isCourseCodeHeaderRow: isCourseCodeHeaderRow,
    isExcludedCourseRow: isExcludedCourseRow,
    expandCourseRow: expandCourseRow,
    normalizeCourseCodes: normalizeCourseCodes,
    importNormalizedCourseCodes: importNormalizedCourseCodes,
    getNormalizedCourses: getNormalizedCourses
  };
}
