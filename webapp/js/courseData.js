/**
 * @file courseData.js
 * @description 前端課程代碼 1NF 正規化處理模組
 *
 * 共用對照表與正規化邏輯已抽至 courseNormalizationShared.js，
 * 此檔僅負責將其掛載為 MEA.courseData 並維持既有呼叫契約。
 */
(function (root, factory) {
  "use strict";

  const api = factory(root);

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MEA = root.MEA || {};
  root.MEA.courseData = api;
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  function resolveShared_() {
    const host = root || {};
    if (host.MEA && host.MEA.courseNormalizationShared) return host.MEA.courseNormalizationShared;
    if (host.courseNormalizationShared) return host.courseNormalizationShared;
    if (typeof require === "function") return require("../../courseNormalizationShared.js");
    throw new Error("找不到共用正規化模組 courseNormalizationShared");
  }

  const shared = resolveShared_();

  return {
    GROUP_CODE_NAMES: shared.GROUP_CODE_NAMES,
    DEPARTMENT_CODE_NAMES: shared.DEPARTMENT_CODE_NAMES,
    SUBJECT_TYPE_NAMES: shared.SUBJECT_TYPE_NAMES,
    OPEN_WAY_NAMES: shared.OPEN_WAY_NAMES,
    SUBJECT_ATTRIBUTION_NAMES: shared.SUBJECT_ATTRIBUTION_NAMES,
    REQUIRED_ELECTIVE_NAMES: shared.REQUIRED_ELECTIVE_NAMES,
    EXCLUDED_SUBJECT_ATTRIBUTES: shared.EXCLUDED_SUBJECT_ATTRIBUTES,
    NORMALIZED_COURSE_HEADERS: shared.NORMALIZED_COURSE_HEADERS,
    getGroupName: shared.getGroupName,
    getDepartmentNameByCode: shared.getDepartmentNameByCode,
    getSubjectType: shared.getSubjectType,
    getOpenWay: shared.getOpenWay,
    getSubjectAttribution: shared.getSubjectAttribution,
    isRequiredOrElective: shared.isRequiredOrElective,
    isCourseCodeHeaderRow: shared.isCourseCodeHeaderRow,
    isExcludedCourseRow: shared.isExcludedCourseRow,
    expandCourseRow: shared.expandCourseRow,
    normalizeCourseCodes: shared.normalizeCourseCodes
  };
});
