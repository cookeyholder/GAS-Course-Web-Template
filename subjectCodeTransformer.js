/**
 * @file subjectCodeTransformer.js
 * @description 108 課綱課程代碼對照與 1NF 正規化處理模組（試算表寫入與檢索）
 *
 * 對照表與正規化純邏輯已抽至 courseNormalizationShared.js，前後端共用單一來源。
 */

/** 一次批次寫入正規化課程代碼的最大列數 */
const COURSE_INDEX_WRITE_CHUNK_SIZE = 5000;

/**
 * 解析共用正規化模組（Node.js / GAS 雙環境）。
 *
 * @returns {Object} courseNormalizationShared API
 */
function resolveCourseNormalizationShared_() {
  if (typeof globalThis !== "undefined" && globalThis.courseNormalizationShared) {
    return globalThis.courseNormalizationShared;
  }
  if (typeof require === "function") return require("./courseNormalizationShared.js");
  throw new Error("找不到共用正規化模組 courseNormalizationShared");
}

const COURSE_NORMALIZATION_SHARED = resolveCourseNormalizationShared_();
const GAS_RUNTIME =
  typeof globalThis !== "undefined" && globalThis.gasRuntime
    ? globalThis.gasRuntime
    : typeof require === "function"
      ? require("./gasRuntime.js")
      : null;
/** 正規化課程代碼工作表名稱統一由 gasRuntime 提供（單一來源） */
const NORMALIZED_COURSE_SHEET_NAME = GAS_RUNTIME.SHEET_COURSE_INDEX;

const NORMALIZED_COURSE_HEADERS = COURSE_NORMALIZATION_SHARED.NORMALIZED_COURSE_HEADERS;
const EXCLUDED_SUBJECT_ATTRIBUTES = COURSE_NORMALIZATION_SHARED.EXCLUDED_SUBJECT_ATTRIBUTES;
const GROUP_CODE_NAMES = COURSE_NORMALIZATION_SHARED.GROUP_CODE_NAMES;
const DEPARTMENT_CODE_NAMES = COURSE_NORMALIZATION_SHARED.DEPARTMENT_CODE_NAMES;
const MINISTRY_DEPARTMENT_CODE_NAMES = COURSE_NORMALIZATION_SHARED.MINISTRY_DEPARTMENT_CODE_NAMES;
const DEPARTMENT_ALIASES = COURSE_NORMALIZATION_SHARED.DEPARTMENT_ALIASES;
const COMMON_DEPARTMENT_CODES = COURSE_NORMALIZATION_SHARED.COMMON_DEPARTMENT_CODES;
const DEPARTMENT_NAME_TO_CODE = COURSE_NORMALIZATION_SHARED.DEPARTMENT_NAME_TO_CODE;
const SUBJECT_TYPE_NAMES = COURSE_NORMALIZATION_SHARED.SUBJECT_TYPE_NAMES;
const OPEN_WAY_NAMES = COURSE_NORMALIZATION_SHARED.OPEN_WAY_NAMES;
const SUBJECT_ATTRIBUTION_NAMES = COURSE_NORMALIZATION_SHARED.SUBJECT_ATTRIBUTION_NAMES;
const REQUIRED_ELECTIVE_NAMES = COURSE_NORMALIZATION_SHARED.REQUIRED_ELECTIVE_NAMES;

const getGroupName = COURSE_NORMALIZATION_SHARED.getGroupName;
const getDepartmentNameByCode = COURSE_NORMALIZATION_SHARED.getDepartmentNameByCode;
const getDepartmentCode = COURSE_NORMALIZATION_SHARED.getDepartmentCode;
const getDepartmentSortKey = COURSE_NORMALIZATION_SHARED.getDepartmentSortKey;
const compareDepartmentsByCode = COURSE_NORMALIZATION_SHARED.compareDepartmentsByCode;
const getSubjectType = COURSE_NORMALIZATION_SHARED.getSubjectType;
const getOpenWay = COURSE_NORMALIZATION_SHARED.getOpenWay;
const getSubjectAttribution = COURSE_NORMALIZATION_SHARED.getSubjectAttribution;
const isRequiredOrElective = COURSE_NORMALIZATION_SHARED.isRequiredOrElective;
const isCourseCodeHeaderRow = COURSE_NORMALIZATION_SHARED.isCourseCodeHeaderRow;
const isExcludedCourseRow = COURSE_NORMALIZATION_SHARED.isExcludedCourseRow;
const expandCourseRow = COURSE_NORMALIZATION_SHARED.expandCourseRow;
const normalizeCourseCodes = COURSE_NORMALIZATION_SHARED.normalizeCourseCodes;

function resolveRouteDependency_(name, modulePath, fallback) {
  if (GAS_RUNTIME) return GAS_RUNTIME.resolveDependency_(name, modulePath, fallback);
  return fallback;
}

function resolveImportCourseSpreadsheet_(options) {
  if (GAS_RUNTIME) return GAS_RUNTIME.getActiveSpreadsheetSafe_(options);
  const opts = options || {};
  return opts.spreadsheet || null;
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
  return resolveRouteDependency_("normalizeCourseCodes", null, normalizeCourseCodes)(rawData, { withStats: true });
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
  const headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange.setValues([NORMALIZED_COURSE_HEADERS]);
  headerRange.setFontWeight("bold");
  sheet.getRange(1, 1, totalDataRows + 1, colCount).setNumberFormat("@");
}

function chunkArrayFallback_(arr, size) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const s = Math.max(1, parseInt(size, 10) || 1);
  const res = [];
  for (let i = 0; i < arr.length; i += s) res.push(arr.slice(i, i + s));
  return res;
}

function writeCourseIndexRowsInChunks_(sheet, rows) {
  const colCount = NORMALIZED_COURSE_HEADERS.length;
  const sanitize = resolveRouteDependency_("sanitizeRowMatrix", "./utilities.js", function (matrix) {
    return matrix;
  });
  const getChunkArray = resolveRouteDependency_("chunkArray", "./utilities.js", chunkArrayFallback_);
  const chunks = getChunkArray(rows, COURSE_INDEX_WRITE_CHUNK_SIZE);
  let currentRow = 2;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    sheet.getRange(currentRow, 1, chunk.length, colCount).setValues(sanitize(chunk));
    currentRow += chunk.length;
  }
}

function finalizeCourseIndexSheet_(sheet, totalDataRows) {
  const colCount = NORMALIZED_COURSE_HEADERS.length;
  resolveRouteDependency_("safeApplySheetFontSize", "./utilities.js", function () {})(
    sheet.getRange(1, 1, totalDataRows + 1, colCount),
    11
  );
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
  return GAS_RUNTIME.getActiveSpreadsheetSafe_({ spreadsheet: ss });
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

/**
 * 輕量取得課程代碼總筆數：僅讀取最後一列索引，不下載整份工作表內容。
 * 供概覽頁顯示統計使用，避免為了取得 total 而呼叫 getCourseIndex。
 */
function getCourseIndexStats(ss) {
  const targetSs = resolveCourseIndexSpreadsheet_(ss);
  const sheet = targetSs ? targetSs.getSheetByName(NORMALIZED_COURSE_SHEET_NAME) : null;
  if (!sheet) return { ok: true, total: 0 };
  if (typeof sheet.getLastRow === "function") {
    const lastRow = Number(sheet.getLastRow()) || 0;
    return { ok: true, total: Math.max(0, lastRow - 1) };
  }
  // 相容未提供 getLastRow 的測試替身或其他試算表實作。
  const dataRows = getCourseIndexDataRows_(targetSs);
  return { ok: true, total: dataRows ? dataRows.length : 0 };
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

/** 取得原始列欄位並轉為字串；與 mapCourseIndexRow_ 的取值規則保持一致。 */
function getRawCourseField_(row, index) {
  const value = row ? row[index] : null;
  return String(value || "");
}

function isCourseRowMatchedByFields_(row, criteria) {
  if (criteria.year !== "" && getRawCourseField_(row, 0) !== criteria.year) return false;
  if (criteria.semester !== "" && getRawCourseField_(row, 1) !== criteria.semester) return false;
  if (criteria.department !== "" && getRawCourseField_(row, 7) !== criteria.department) return false;
  return true;
}

function isCourseRowMatchedByKeyword_(row, keyword) {
  if (keyword === "") return true;
  const line =
    getRawCourseField_(row, 4) +
    " " +
    getRawCourseField_(row, 5) +
    " " +
    getRawCourseField_(row, 7) +
    " " +
    getRawCourseField_(row, 6);
  return line.toLowerCase().indexOf(keyword) !== -1;
}

function isCourseIndexRowMatched_(row, criteria) {
  return isCourseRowMatchedByFields_(row, criteria) && isCourseRowMatchedByKeyword_(row, criteria.keyword);
}

/**
 * 先以原始列索引篩選，不建立完整物件；僅將該頁資料轉換為回傳物件。
 * 此舉可避免對每一列建立 N 個物件，降低大量資料查詢的記憶體用量。
 */
function collectMatchedCourseRowIndexes_(dataRows, criteria) {
  const matchedIndexes = [];
  for (let i = 0; i < dataRows.length; i++) {
    if (isCourseIndexRowMatched_(dataRows[i], criteria)) matchedIndexes.push(i);
  }
  return matchedIndexes;
}

function normalizeCoursePageParams_(filter) {
  const source = filter || {};
  const page = Math.max(1, parseInt(source.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(source.pageSize, 10) || 50));
  return { page: page, pageSize: pageSize };
}

function buildPagedCourseResultFromIndexes_(dataRows, matchedIndexes, page, pageSize) {
  const total = matchedIndexes.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  const pageIndexes = matchedIndexes.slice(start, start + pageSize);
  const list = [];
  for (let i = 0; i < pageIndexes.length; i++) {
    list.push(mapCourseIndexRow_(dataRows[pageIndexes[i]]));
  }
  return {
    ok: true,
    list: list,
    total: total,
    page: page,
    pageSize: pageSize,
    totalPages: totalPages
  };
}

/**
 * 純二維資料列篩選與分頁查詢函式（零 GAS / 零試算表依賴）
 *
 * @param {Array<Array<*>>} dataRows - 二維資料列矩陣（不含表頭）
 * @param {Object} [filter] - 篩選條件
 * @param {string} [filter.keyword] - 科目名稱或代碼關鍵字
 * @param {string} [filter.academicYear] - 開課學年
 * @param {string} [filter.semester] - 開課學期
 * @param {string} [filter.department] - 科別
 * @param {number} [filter.page=1] - 頁碼（1-based）
 * @param {number} [filter.pageSize=50] - 每頁筆數
 * @returns {Object} 查詢結果 `{ ok: true, list, total, page, pageSize, totalPages }`
 */
function queryCourseDataRows(dataRows, filter) {
  const paging = normalizeCoursePageParams_(filter);
  if (!Array.isArray(dataRows) || dataRows.length === 0) {
    return createEmptyCourseQueryResult_(paging.page, paging.pageSize, 0);
  }
  const criteria = normalizeCourseQueryCriteria_(filter);
  const matchedIndexes = collectMatchedCourseRowIndexes_(dataRows, criteria);
  return buildPagedCourseResultFromIndexes_(dataRows, matchedIndexes, paging.page, paging.pageSize);
}

/**
 * 讀取並分頁查詢正規化課程代碼
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
  return queryCourseDataRows(dataRows, filter);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    NORMALIZED_COURSE_SHEET_NAME: NORMALIZED_COURSE_SHEET_NAME,
    NORMALIZED_COURSE_HEADERS: NORMALIZED_COURSE_HEADERS,
    GROUP_CODE_NAMES: GROUP_CODE_NAMES,
    DEPARTMENT_CODE_NAMES: DEPARTMENT_CODE_NAMES,
    MINISTRY_DEPARTMENT_CODE_NAMES: MINISTRY_DEPARTMENT_CODE_NAMES,
    DEPARTMENT_ALIASES: DEPARTMENT_ALIASES,
    COMMON_DEPARTMENT_CODES: COMMON_DEPARTMENT_CODES,
    DEPARTMENT_NAME_TO_CODE: DEPARTMENT_NAME_TO_CODE,
    SUBJECT_TYPE_NAMES: SUBJECT_TYPE_NAMES,
    OPEN_WAY_NAMES: OPEN_WAY_NAMES,
    SUBJECT_ATTRIBUTION_NAMES: SUBJECT_ATTRIBUTION_NAMES,
    REQUIRED_ELECTIVE_NAMES: REQUIRED_ELECTIVE_NAMES,
    EXCLUDED_SUBJECT_ATTRIBUTES: EXCLUDED_SUBJECT_ATTRIBUTES,
    getGroupName: getGroupName,
    getDepartmentNameByCode: getDepartmentNameByCode,
    getDepartmentCode: getDepartmentCode,
    getDepartmentSortKey: getDepartmentSortKey,
    compareDepartmentsByCode: compareDepartmentsByCode,
    getSubjectType: getSubjectType,
    getOpenWay: getOpenWay,
    getSubjectAttribution: getSubjectAttribution,
    isRequiredOrElective: isRequiredOrElective,
    isCourseCodeHeaderRow: isCourseCodeHeaderRow,
    isExcludedCourseRow: isExcludedCourseRow,
    expandCourseRow: expandCourseRow,
    normalizeCourseCodes: normalizeCourseCodes,
    importNormalizedCourseCodes: importNormalizedCourseCodes,
    getNormalizedCourses: getNormalizedCourses,
    queryCourseDataRows: queryCourseDataRows,
    chunkArrayFallback_: chunkArrayFallback_,
    chunkArray: resolveRouteDependency_("chunkArray", "./utilities.js", chunkArrayFallback_),
    getCourseIndexStats: getCourseIndexStats
  };
}
