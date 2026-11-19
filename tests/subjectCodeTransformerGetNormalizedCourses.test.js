"use strict";

/**
 * getNormalizedCourses 單元測試（G4.1）
 * 驗證正規化課程索引查詢之資料來源、篩選、分頁與列映射行為。
 */

const assert = require("assert");
const transformer = require("../subjectCodeTransformer.js");

console.log("開始執行 getNormalizedCourses 測試...\n");

function withGlobals(temp, fn) {
  const prev = {};
  Object.keys(temp).forEach(function (k) {
    prev[k] = Object.prototype.hasOwnProperty.call(global, k) ? global[k] : undefined;
    if (temp[k] === undefined) delete global[k];
    else global[k] = temp[k];
  });
  try {
    return fn();
  } finally {
    Object.keys(temp).forEach(function (k) {
      if (prev[k] === undefined) delete global[k];
      else global[k] = prev[k];
    });
  }
}

function makeSheet(values) {
  return {
    getDataRange: function () {
      return {
        getValues: function () {
          return values;
        }
      };
    }
  };
}

function makeSs(sheet, expectedName) {
  return {
    getSheetByName: function (name) {
      if (expectedName) assert.strictEqual(name, expectedName);
      return sheet;
    }
  };
}

const header = transformer.NORMALIZED_COURSE_HEADERS;
function row(overrides) {
  const base = [
    "114",
    "1",
    "1",
    "114",
    "305101A",
    "程式設計實習",
    "電機與電子群",
    "資訊科",
    "部定必修",
    "原班級",
    "實習科目",
    "必修",
    "3",
    "3"
  ];
  const o = overrides || {};
  return [
    o.academicYear !== undefined ? o.academicYear : base[0],
    o.semester !== undefined ? o.semester : base[1],
    o.grade !== undefined ? o.grade : base[2],
    o.entryYear !== undefined ? o.entryYear : base[3],
    o.courseCode !== undefined ? o.courseCode : base[4],
    o.subjectName !== undefined ? o.subjectName : base[5],
    o.group !== undefined ? o.group : base[6],
    o.department !== undefined ? o.department : base[7],
    o.subjectType !== undefined ? o.subjectType : base[8],
    o.openWay !== undefined ? o.openWay : base[9],
    o.attribute !== undefined ? o.attribute : base[10],
    o.required !== undefined ? o.required : base[11],
    o.credits !== undefined ? o.credits : base[12],
    o.hours !== undefined ? o.hours : base[13]
  ];
}

const sampleRows = [
  header,
  row({
    academicYear: "114",
    semester: "1",
    courseCode: "C001",
    subjectName: "程式設計",
    department: "資訊科",
    group: "電機與電子群"
  }),
  row({
    academicYear: "114",
    semester: "2",
    courseCode: "C002",
    subjectName: "資料庫",
    department: "資訊科",
    group: "電機與電子群"
  }),
  row({
    academicYear: "113",
    semester: "1",
    courseCode: "M001",
    subjectName: "機械製圖",
    department: "機械科",
    group: "機械群"
  })
];

console.log("1. 無試算表（無 ss 且無 SpreadsheetApp）時應回傳空結果預設值...");
{
  const result = withGlobals({ SpreadsheetApp: undefined }, function () {
    return transformer.getNormalizedCourses({ keyword: "x" });
  });
  assert.deepStrictEqual(result, { ok: true, list: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
  console.log("   ✓ 無試算表預設值驗證通過！\n");
}

console.log("2. 無 ss 時應使用 SpreadsheetApp.getActiveSpreadsheet...");
{
  const ss = makeSs(makeSheet([header]), transformer.NORMALIZED_COURSE_SHEET_NAME);
  const SpreadsheetApp = {
    getActiveSpreadsheet: function () {
      return ss;
    }
  };
  const result = withGlobals({ SpreadsheetApp: SpreadsheetApp }, function () {
    return transformer.getNormalizedCourses();
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.total, 0);
  console.log("   ✓ SpreadsheetApp fallback 驗證通過！\n");
}

console.log("3. 找不到課程索引工作表時應回傳空結果...");
{
  const ss = {
    getSheetByName: function () {
      return null;
    }
  };
  const result = transformer.getNormalizedCourses({}, ss);
  assert.deepStrictEqual(result, { ok: true, list: [], total: 0, page: 1, pageSize: 50, totalPages: 0 });
  console.log("   ✓ 缺少工作表驗證通過！\n");
}

console.log("4. 僅有表頭或無資料列時應回傳空結果...");
{
  const ssHeaderOnly = makeSs(makeSheet([header]));
  const ssEmpty = makeSs(makeSheet([]));
  assert.deepStrictEqual(transformer.getNormalizedCourses({}, ssHeaderOnly), {
    ok: true,
    list: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0
  });
  assert.deepStrictEqual(transformer.getNormalizedCourses({}, ssEmpty), {
    ok: true,
    list: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0
  });
  console.log("   ✓ 無資料列驗證通過！\n");
}

console.log("5. 應正確映射列欄位並回傳分頁資訊...");
{
  const ss = makeSs(makeSheet(sampleRows));
  const result = transformer.getNormalizedCourses({}, ss);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.total, 3);
  assert.strictEqual(result.page, 1);
  assert.strictEqual(result.pageSize, 50);
  assert.strictEqual(result.totalPages, 1);
  assert.strictEqual(result.list.length, 3);
  assert.deepStrictEqual(result.list[0], {
    academicYear: "114",
    semester: "1",
    grade: "1",
    entryYear: "114",
    courseCode: "C001",
    subjectName: "程式設計",
    group: "電機與電子群",
    department: "資訊科",
    subjectType: "部定必修",
    openWay: "原班級",
    attribute: "實習科目",
    required: "必修",
    credits: "3",
    hours: "3"
  });
  console.log("   ✓ 欄位映射與分頁資訊驗證通過！\n");
}

console.log("6. 應支援 academicYear、semester、department 篩選...");
{
  const ss = makeSs(makeSheet(sampleRows));
  const byYear = transformer.getNormalizedCourses({ academicYear: "114" }, ss);
  assert.strictEqual(byYear.total, 2);
  assert.deepStrictEqual(
    byYear.list.map(function (x) {
      return x.courseCode;
    }),
    ["C001", "C002"]
  );

  const bySem = transformer.getNormalizedCourses({ semester: "2" }, ss);
  assert.strictEqual(bySem.total, 1);
  assert.strictEqual(bySem.list[0].courseCode, "C002");

  const byDept = transformer.getNormalizedCourses({ department: "機械科" }, ss);
  assert.strictEqual(byDept.total, 1);
  assert.strictEqual(byDept.list[0].courseCode, "M001");

  const combined = transformer.getNormalizedCourses({ academicYear: "114", semester: "1", department: "資訊科" }, ss);
  assert.strictEqual(combined.total, 1);
  assert.strictEqual(combined.list[0].courseCode, "C001");

  const noMatch = transformer.getNormalizedCourses({ academicYear: "999" }, ss);
  assert.strictEqual(noMatch.total, 0);
  assert.deepStrictEqual(noMatch.list, []);
  console.log("   ✓ 欄位篩選驗證通過！\n");
}

console.log("7. keyword 應以課程代碼/科目名稱/科別/群別進行不分大小寫模糊比對...");
{
  const ss = makeSs(makeSheet(sampleRows));
  assert.strictEqual(transformer.getNormalizedCourses({ keyword: "c002" }, ss).total, 1);
  assert.strictEqual(transformer.getNormalizedCourses({ keyword: "程式" }, ss).total, 1);
  assert.strictEqual(transformer.getNormalizedCourses({ keyword: "機械科" }, ss).total, 1);
  assert.strictEqual(transformer.getNormalizedCourses({ keyword: "電機與電子群" }, ss).total, 2);
  assert.strictEqual(transformer.getNormalizedCourses({ keyword: "  資料  " }, ss).total, 1);
  assert.strictEqual(transformer.getNormalizedCourses({ keyword: "不存在" }, ss).total, 0);
  console.log("   ✓ keyword 篩選驗證通過！\n");
}

console.log("8. 分頁參數應正規化並正確切片...");
{
  const many = [header];
  for (let i = 1; i <= 25; i++) {
    many.push(row({ courseCode: "K" + i, subjectName: "科目" + i }));
  }
  const ss = makeSs(makeSheet(many));

  const p2 = transformer.getNormalizedCourses({ page: 2, pageSize: 10 }, ss);
  assert.strictEqual(p2.total, 25);
  assert.strictEqual(p2.page, 2);
  assert.strictEqual(p2.pageSize, 10);
  assert.strictEqual(p2.totalPages, 3);
  assert.strictEqual(p2.list.length, 10);
  assert.strictEqual(p2.list[0].courseCode, "K11");

  const last = transformer.getNormalizedCourses({ page: 3, pageSize: 10 }, ss);
  assert.strictEqual(last.list.length, 5);
  assert.strictEqual(last.list[0].courseCode, "K21");

  // 邊界與無效值（維持既有正規化行為）
  assert.strictEqual(transformer.getNormalizedCourses({ page: 0, pageSize: 10 }, ss).page, 1);
  assert.strictEqual(transformer.getNormalizedCourses({ page: -5, pageSize: 10 }, ss).page, 1);
  assert.strictEqual(transformer.getNormalizedCourses({ page: "bad", pageSize: 10 }, ss).page, 1);
  assert.strictEqual(transformer.getNormalizedCourses({ page: 1, pageSize: 0 }, ss).pageSize, 50);
  assert.strictEqual(transformer.getNormalizedCourses({ page: 1, pageSize: -1 }, ss).pageSize, 1);
  assert.strictEqual(transformer.getNormalizedCourses({ page: 1, pageSize: 999 }, ss).pageSize, 200);
  assert.strictEqual(transformer.getNormalizedCourses({ page: 1, pageSize: "bad" }, ss).pageSize, 50);

  console.log("   ✓ 分頁正規化與切片驗證通過！\n");
}

console.log("9. filter 未提供或欄位為空/空白時應視為不篩選，且列值應轉為字串...");
{
  const values = [
    header,
    ["114", 1, 2, 114, 12345, null, "", undefined, "部定必修", "原班級", "一般科目", "必修", 2, 0]
  ];
  const ss = makeSs(makeSheet(values));
  const r1 = transformer.getNormalizedCourses(null, ss);
  const r2 = transformer.getNormalizedCourses(
    { keyword: "   ", academicYear: "  ", semester: "", department: "   " },
    ss
  );
  assert.strictEqual(r1.total, 1);
  assert.strictEqual(r2.total, 1);
  assert.deepStrictEqual(r1.list[0], {
    academicYear: "114",
    semester: "1",
    grade: "2",
    entryYear: "114",
    courseCode: "12345",
    subjectName: "",
    group: "",
    department: "",
    subjectType: "部定必修",
    openWay: "原班級",
    attribute: "一般科目",
    required: "必修",
    credits: "2",
    hours: ""
  });
  console.log("   ✓ 空篩選與字串轉換驗證通過！\n");
}

console.log("10. 大量資料分頁應僅映射該頁列，不對全部資料建立物件...");
{
  const rowCount = 20000;
  const values = [header.slice()];
  let mappedOnlyFieldReads = 0;
  for (let i = 0; i < rowCount; i++) {
    const dataRow = [
      "114",
      "1",
      "1",
      "114",
      "C" + String(i).padStart(5, "0"),
      "科目" + i,
      "群",
      "資訊科",
      "類",
      "式",
      "屬",
      "必",
      "3",
      ""
    ];
    // 此欄位僅由 mapCourseIndexRow_ 讀取；計數可驗證映射次數。
    Object.defineProperty(dataRow, 13, {
      get: function () {
        mappedOnlyFieldReads += 1;
        return "2";
      },
      enumerable: true
    });
    values.push(dataRow);
  }
  const ss = makeSs(makeSheet(values));
  const result = transformer.getNormalizedCourses({ page: 2, pageSize: 10 }, ss);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.total, rowCount);
  assert.strictEqual(result.totalPages, 2000);
  assert.strictEqual(result.page, 2);
  assert.strictEqual(result.list.length, 10);
  assert.strictEqual(result.list[0].courseCode, "C00010");
  assert.strictEqual(result.list[9].courseCode, "C00019");
  assert.strictEqual(result.list[0].hours, "2");
  assert.strictEqual(mappedOnlyFieldReads, 10, "僅應映射該頁 10 列，實際映射 " + mappedOnlyFieldReads + " 列");

  const filtered = transformer.getNormalizedCourses(
    { page: 1, pageSize: 5, academicYear: "114", semester: "1", keyword: "c0000" },
    ss
  );
  assert.strictEqual(filtered.total, 10);
  assert.strictEqual(filtered.list.length, 5);
  assert.strictEqual(filtered.list[0].courseCode, "C00000");
  console.log("   ✓ 大量資料分頁與映射次數驗證通過！\n");
}

console.log("✓ getNormalizedCourses 測試全數通過！\n");
