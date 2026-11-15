/**
 * @file courseData.js
 * @description 前端課程代碼 1NF 正規化處理模組
 *
 * 與後端 `subjectCodeTransformer.js` 保持相同規則，
 * 讓瀏覽器在上傳前即可即時預覽統計，並僅傳送正規化後的有效資料。
 */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.MEA = root.MEA || {};
  root.MEA.courseData = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

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

  const EXCLUDED_SUBJECT_ATTRIBUTES = [];

  const NORMALIZED_COURSE_HEADERS = [
    "開課學年", "開課學期", "修課年級", "學生入學年",
    "課程代碼", "科目名稱", "群別", "科別", "課程類別",
    "開課方式", "科目屬性", "必選修", "學分數", "開課時數"
  ];

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

  function isCourseCodeHeaderRow(row) {
    if (!Array.isArray(row) || row.length === 0) return false;
    const first = row[0] === null || row[0] === undefined ? "" : String(row[0]).trim();
    const attr = row[11] === null || row[11] === undefined ? "" : String(row[11]).trim();
    return first === "課程代碼" || attr === "科目屬性";
  }

  function isExcludedCourseRow(row) {
    if (!Array.isArray(row)) return false;
    if (EXCLUDED_SUBJECT_ATTRIBUTES.length === 0) return false;
    const attr = row[11] === null || row[11] === undefined ? "" : String(row[11]).trim();
    return EXCLUDED_SUBJECT_ATTRIBUTES.indexOf(attr) !== -1;
  }

  function expandCourseRow(row) {
    const expanded = [];
    if (!Array.isArray(row) || row.length < 31) return expanded;

    const entryYear = row[16] === null || row[16] === undefined ? "" : String(row[16]).trim();
    const fallbackOpenWay = row[10];

    for (let s = 0; s < 6; s++) {
      const credits = Number(row[19 + s] || 0);
      const hours = Number(row[25 + s] || 0);

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

  return {
    GROUP_CODE_NAMES: GROUP_CODE_NAMES,
    DEPARTMENT_CODE_NAMES: DEPARTMENT_CODE_NAMES,
    SUBJECT_TYPE_NAMES: SUBJECT_TYPE_NAMES,
    OPEN_WAY_NAMES: OPEN_WAY_NAMES,
    SUBJECT_ATTRIBUTION_NAMES: SUBJECT_ATTRIBUTION_NAMES,
    REQUIRED_ELECTIVE_NAMES: REQUIRED_ELECTIVE_NAMES,
    EXCLUDED_SUBJECT_ATTRIBUTES: EXCLUDED_SUBJECT_ATTRIBUTES,
    NORMALIZED_COURSE_HEADERS: NORMALIZED_COURSE_HEADERS,
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
