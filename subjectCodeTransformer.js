/**
 * @file subjectCodeTransformer.js
 * @description 108 課綱課程代碼對照與 1NF 正規化處理模組
 *
 * 將巨耀匯出之 39 欄寬表展開並正規化為 14 欄的第一正規化（1NF）課程索引：
 * 1. 剔除科目屬性為 "0"（不分屬性）或 "6"（特殊需求領域）之非實質授課列
 * 2. 依六學期（一上、一下、二上、二下、三上、三下）開課學分與時數展開
 * 3. 代碼轉譯為可讀之群別、科別、課程類別、開課方式、科目屬性與必選修中文名稱
 */

// ============================================================================
// 課程代碼對照表常數（提升至頂層以達零物件配置 O(1) 查找）
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

/** 匯入時應直接剔除的科目屬性代碼（0-based index 11） */
const EXCLUDED_SUBJECT_ATTRIBUTES = ["0", "6"];

const GROUP_CODE_NAMES = {
  "11": "學術群",
  "21": "機械群",
  "22": "動力機械群",
  "23": "電機與電子群",
  "24": "化工群",
  "25": "土木與建築群",
  "26": "商業與管理群商業群(綜高、實用技能學程)",
  "27": "外語群",
  "28": "設計群",
  "29": "農業群",
  "30": "食品群",
  "31": "家政群",
  "32": "餐旅群",
  "33": "水產群",
  "34": "海事群",
  "35": "藝術群",
  "36": "美容造型群(實用技能學程)",
  "40": "服務群(特殊教育類型)",
  "41": "其他(綜高)"
};

const DEPARTMENT_CODE_NAMES = {
  "301": "機械科",
  "303": "汽車科",
  "305": "資訊科",
  "306": "電子科",
  "308": "電機科",
  "309": "冷凍空調科",
  "311": "建築科",
  "315": "化工科",
  "321": "電機空調科",
  "373": "圖文傳播科",
  "374": "電腦機械製圖科"
};

const SUBJECT_TYPE_NAMES = {
  "1": "部定必修",
  "2": "校訂必修",
  "3": "選修-加深加廣選修",
  "4": "選修-補強性選修",
  "5": "選修-多元選修",
  "6": "選修-其他",
  "7": "校訂選修",
  "8": "團體活動時間",
  "9": "彈性學習時間",
  "A": "大學預修課程",
  "B": "基礎訓練",
  "C": "職前訓練",
  "D": "寒暑假課程",
  "E": "返校課程",
  "F": "職業技能訓練"
};

const OPEN_WAY_NAMES = {
  "0": "原班級",
  "1": "跨班選修(班群開課)",
  "2": "綜高跨年級選修",
  "A": "同科單班選修",
  "B": "同科跨班選修",
  "C": "同群跨科選修、跨學程選修",
  "D": "同校跨群選修",
  "E": "跨校選修"
};

const SUBJECT_ATTRIBUTION_NAMES = {
  "0": "不分屬性",
  "1": "一般科目",
  "2": "專業科目",
  "3": "實習科目",
  "4": "專精科目",
  "5": "專精科目(核心科目)",
  "6": "特殊需求領域",
  "A": "自主學習",
  "B": "選手培訓",
  "C": "充實(增廣)、補強性教學[全學期、不授予學分]",
  "D": "充實(增廣)、補強性教學[全學期、授予學分]",
  "E": "學校特色活動",
  "F": "專精(專業)科目",
  "G": "專精(實習)科目",
  "H": "專精(專業)科目(核心)",
  "I": "專精(實習)科目(核心)"
};

const REQUIRED_ELECTIVE_NAMES = {
  "1": "必修",
  "2": "選修"
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
 * 判斷課程列是否應於匯入時剔除（科目屬性為 0 或 6）
 *
 * @param {Array} row - 39 欄原始課程列
 * @returns {boolean} true 表示應剔除
 */
function isExcludedCourseRow(row) {
  if (!Array.isArray(row)) return true;
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
    const academicYear = row[16 + gradeIndex] === null || row[16 + gradeIndex] === undefined
      ? ""
      : String(row[16 + gradeIndex]).trim();
    const semester = String((s % 2) + 1);

    const semesterOpenWay = (row[31 + s] === null || row[31 + s] === undefined || row[31 + s] === "")
      ? fallbackOpenWay
      : row[31 + s];

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
 * 將巨耀匯出之 39 欄寬表正規化為 14 欄 1NF 課程索引
 *
 * @param {Array<Array>} rawData - 巨耀匯出課程代碼原始資料（可含表頭列）
 * @param {Object} [options] - 選項
 * @param {string|number} [options.academicYear] - 僅保留指定開課學年
 * @param {string|number} [options.semester] - 僅保留指定開課學期
 * @param {boolean} [options.withStats=false] - 為 true 時回傳 `{ rows, stats }`
 * @returns {Array<Array>|Object} 14 欄正規化資料列，或含統計資訊之物件
 */
function normalizeCourseCodes(rawData, options) {
  options = options || {};
  const rows = Array.isArray(rawData) ? rawData : [];
  const academicYear = (options.academicYear === null || options.academicYear === undefined)
    ? ""
    : String(options.academicYear).trim();
  const semester = (options.semester === null || options.semester === undefined)
    ? ""
    : String(options.semester).trim();

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
  const ss = options.spreadsheet || (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet ? SpreadsheetApp.getActiveSpreadsheet() : null);
  if (!ss) {
    throw new Error("找不到有效的試算表物件");
  }

  const inputRows = Array.isArray(rawData) ? rawData : [];
  let result;

  if (options.preNormalized === true) {
    const rows = inputRows.slice();
    if (rows.length > 0 && Array.isArray(rows[0]) && String(rows[0][0]).trim() === NORMALIZED_COURSE_HEADERS[0]) {
      rows.shift();
    }
    result = {
      rows: rows,
      stats: {
        sourceRows: rows.length,
        excludedRows: 0,
        keptCourseRows: rows.length,
        expandedRows: rows.length,
        returnedRows: rows.length
      }
    };
  } else {
    result = normalizeCourseCodes(rawData, { withStats: true });
  }
  const rows = result.rows;

  let sheet = ss.getSheetByName(NORMALIZED_COURSE_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(NORMALIZED_COURSE_SHEET_NAME);
  }

  if (options.reset !== false) {
    sheet.clearContents();
  }

  if (sheet.getMaxColumns() < NORMALIZED_COURSE_HEADERS.length) {
    sheet.insertColumnsAfter(sheet.getMaxColumns(), NORMALIZED_COURSE_HEADERS.length - sheet.getMaxColumns());
  }

  sheet.getRange(1, 1, 1, NORMALIZED_COURSE_HEADERS.length).setValues([NORMALIZED_COURSE_HEADERS]);
  sheet.getRange(1, 1, 1, NORMALIZED_COURSE_HEADERS.length).setFontWeight("bold");
  sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), rows.length + 1), NORMALIZED_COURSE_HEADERS.length).setNumberFormat("@");

  // 分批寫入，避免單次 setValues 資料量過大逾時
  for (let start = 0; start < rows.length; start += COURSE_INDEX_WRITE_CHUNK_SIZE) {
    const chunk = rows.slice(start, start + COURSE_INDEX_WRITE_CHUNK_SIZE);
    sheet.getRange(start + 2, 1, chunk.length, NORMALIZED_COURSE_HEADERS.length).setValues(chunk);
  }

  safeApplySheetFontSize(sheet.getRange(1, 1, Math.max(sheet.getMaxRows(), rows.length + 1), NORMALIZED_COURSE_HEADERS.length), 11);

  if (sheet.getFrozenRows() < 1) {
    sheet.setFrozenRows(1);
  }

  return {
    ok: true,
    rows: rows.length,
    stats: result.stats
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
  filter = filter || {};
  const targetSs = ss || (typeof SpreadsheetApp !== "undefined" && SpreadsheetApp.getActiveSpreadsheet ? SpreadsheetApp.getActiveSpreadsheet() : null);
  if (!targetSs) return { ok: true, list: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };

  const sheet = targetSs.getSheetByName(NORMALIZED_COURSE_SHEET_NAME);
  if (!sheet) return { ok: true, list: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) return { ok: true, list: [], total: 0, page: 1, pageSize: 50, totalPages: 0 };

  const keyword = (filter.keyword || "").trim().toLowerCase();
  const year = (filter.academicYear || "").trim();
  const semester = (filter.semester || "").trim();
  const department = (filter.department || "").trim();

  const dataRows = values.slice(1);
  const matched = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rYear = String(row[0] || "");
    const rSem = String(row[1] || "");
    const rGrade = String(row[2] || "");
    const rEntryYear = String(row[3] || "");
    const rCode = String(row[4] || "");
    const rName = String(row[5] || "");
    const rGroup = String(row[6] || "");
    const rDept = String(row[7] || "");
    const rType = String(row[8] || "");
    const rOpenWay = String(row[9] || "");
    const rAttr = String(row[10] || "");
    const rReq = String(row[11] || "");
    const rCredits = String(row[12] || "");
    const rHours = String(row[13] || "");

    if (year !== "" && rYear !== year) continue;
    if (semester !== "" && rSem !== semester) continue;
    if (department !== "" && rDept !== department) continue;

    if (keyword !== "") {
      const line = (rCode + " " + rName + " " + rDept + " " + rGroup).toLowerCase();
      if (line.indexOf(keyword) === -1) continue;
    }

    matched.push({
      academicYear: rYear,
      semester: rSem,
      grade: rGrade,
      entryYear: rEntryYear,
      courseCode: rCode,
      subjectName: rName,
      group: rGroup,
      department: rDept,
      subjectType: rType,
      openWay: rOpenWay,
      attribute: rAttr,
      required: rReq,
      credits: rCredits,
      hours: rHours
    });
  }

  const page = Math.max(1, parseInt(filter.page, 10) || 1);
  const pageSize = Math.max(1, Math.min(200, parseInt(filter.pageSize, 10) || 50));
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
