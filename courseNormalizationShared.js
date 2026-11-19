/**
 * @file courseNormalizationShared.js
 * @description 108 課綱課程代碼對照表與 1NF 正規化純邏輯（前後端共用單一來源）
 *
 * 同時支援三種環境：
 * - Node.js：module.exports
 * - Google Apps Script：globalThis.courseNormalizationShared
 * - 瀏覽器：window.MEA.courseNormalizationShared
 */
(function (root, factory) {
  "use strict";

  const api = factory();

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (root) {
    root.courseNormalizationShared = api;
    root.MEA = root.MEA || {};
    root.MEA.courseNormalizationShared = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  /** 正規化課程代碼標準表頭（共 14 欄） */
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

  function normalizeCodeKey(code) {
    return code === null || code === undefined ? "" : String(code).trim();
  }

  function getGroupName(code) {
    const key = normalizeCodeKey(code);
    return GROUP_CODE_NAMES[key] || key;
  }

  function getDepartmentNameByCode(code) {
    const key = normalizeCodeKey(code);
    return DEPARTMENT_CODE_NAMES[key] || key;
  }

  function getSubjectType(code) {
    const key = normalizeCodeKey(code);
    return SUBJECT_TYPE_NAMES[key] || key;
  }

  function getOpenWay(code) {
    const key = normalizeCodeKey(code);
    return OPEN_WAY_NAMES[key] || key;
  }

  function getSubjectAttribution(code) {
    const key = normalizeCodeKey(code);
    return SUBJECT_ATTRIBUTION_NAMES[key] || key;
  }

  function isRequiredOrElective(code) {
    const key = normalizeCodeKey(code);
    return REQUIRED_ELECTIVE_NAMES[key] || key;
  }

  function isCourseCodeHeaderRow(row) {
    if (!Array.isArray(row) || row.length === 0) return false;
    const first = normalizeCodeKey(row[0]);
    const attr = normalizeCodeKey(row[11]);
    return first === "課程代碼" || attr === "科目屬性";
  }

  function isExcludedCourseRow(row) {
    if (!Array.isArray(row)) return false;
    if (EXCLUDED_SUBJECT_ATTRIBUTES.length === 0) return false;
    return EXCLUDED_SUBJECT_ATTRIBUTES.indexOf(normalizeCodeKey(row[11])) !== -1;
  }

  function expandCourseRow(row) {
    const expanded = [];
    if (!Array.isArray(row) || row.length < 31) return expanded;

    const entryYear = normalizeCodeKey(row[16]);
    const fallbackOpenWay = row[10];
    const courseCode = normalizeCodeKey(row[0]);
    const subjectName = normalizeCodeKey(row[2]);
    const groupName = getGroupName(row[6]) || "";
    const departmentName = getDepartmentNameByCode(row[7]) || "";
    const subjectType = getSubjectType(row[9]) || "";
    const subjectAttribution = getSubjectAttribution(row[11]) || "";
    const requiredOrElective = isRequiredOrElective(row[15]) || "";

    for (let s = 0; s < 6; s++) {
      const credits = Number(row[19 + s] || 0);
      const hours = Number(row[25 + s] || 0);
      if (!(credits > 0 || hours > 0)) continue;

      const gradeIndex = Math.floor(s / 2);
      const academicYear = normalizeCodeKey(row[16 + gradeIndex]);
      const semester = String((s % 2) + 1);
      const semesterValue = row[31 + s];
      const semesterOpenWay =
        semesterValue === null || semesterValue === undefined || semesterValue === "" ? fallbackOpenWay : semesterValue;

      expanded.push([
        academicYear,
        semester,
        String(gradeIndex + 1),
        entryYear,
        courseCode,
        subjectName,
        groupName,
        departmentName,
        subjectType,
        getOpenWay(semesterOpenWay) || "",
        subjectAttribution,
        requiredOrElective,
        credits,
        hours
      ]);
    }

    return expanded;
  }

  function normalizeCourseCodes(rawData, options) {
    const opts = options || {};
    const rows = Array.isArray(rawData) ? rawData : [];
    const academicYear = normalizeCodeKey(opts.academicYear);
    const semester = normalizeCodeKey(opts.semester);

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

    if (opts.withStats) {
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

  return {
    NORMALIZED_COURSE_HEADERS: NORMALIZED_COURSE_HEADERS,
    EXCLUDED_SUBJECT_ATTRIBUTES: EXCLUDED_SUBJECT_ATTRIBUTES,
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
    normalizeCourseCodes: normalizeCourseCodes
  };
});
