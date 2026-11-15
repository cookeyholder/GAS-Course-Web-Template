"use strict";

const assert = require("assert");
const backend = require("../subjectCodeTransformer.js");
const frontend = require("../webapp/js/courseData.js");

console.log("開始執行 108 課綱課程代碼正規化單元測試...\n");

// 模擬巨耀 39 欄原始課程代碼列
function createSampleRow(opts) {
  opts = opts || {};
  const row = new Array(39).fill("");
  row[0] = opts.code || "305101A"; // 課程代碼
  row[1] = opts.creditsTotal || "6"; // 六學期開課學分
  row[2] = opts.name || "程式設計實習"; // 科目名稱
  row[3] = "114"; // 學生入學年
  row[4] = "041308"; // 校代碼
  row[6] = opts.group || "23"; // 群別代碼：電機與電子群
  row[7] = opts.dept || "305"; // 科別代碼：資訊科
  row[9] = opts.type || "1"; // 課程類型：部定必修
  row[10] = "0"; // 開課方式：原班級
  row[11] = opts.attr || "3"; // 科目屬性：實習科目
  row[15] = opts.req || "1"; // 必選修：必修
  row[16] = "114"; // 一年級學年
  row[17] = "115"; // 二年級學年
  row[18] = "116"; // 三年級學年

  // 學分 (19~24) 一上～三下
  row[19] = opts.creditsSem1 !== undefined ? opts.creditsSem1 : 3;
  row[20] = opts.creditsSem2 !== undefined ? opts.creditsSem2 : 3;
  row[21] = 0;
  row[22] = 0;
  row[23] = 0;
  row[24] = 0;

  // 時數 (25~30) 一上～三下
  row[25] = opts.hoursSem1 !== undefined ? opts.hoursSem1 : 3;
  row[26] = opts.hoursSem2 !== undefined ? opts.hoursSem2 : 3;
  row[27] = 0;
  row[28] = 0;
  row[29] = 0;
  row[30] = 0;

  return row;
}

// 1. 測試一般正常課程列展開（一上與一下有開課）
{
  const row = createSampleRow({ name: "程式設計實習" });
  const expanded = backend.expandCourseRow(row);
  assert.strictEqual(expanded.length, 2, "一上與一下均有學分時數，應展開為 2 筆 1NF 紀錄");

  const r1 = expanded[0];
  assert.strictEqual(r1[0], "114", "開課學年應為 114");
  assert.strictEqual(r1[1], "1", "開課學期應為 1 (一上)");
  assert.strictEqual(r1[2], "1", "修課年級應為 1");
  assert.strictEqual(r1[4], "305101A", "課程代碼正確");
  assert.strictEqual(r1[5], "程式設計實習", "科目名稱正確");
  assert.strictEqual(r1[6], "電機與電子群", "群別中文對照正確");
  assert.strictEqual(r1[7], "資訊科", "科別中文對照正確");
  assert.strictEqual(r1[8], "部定必修", "課程類別中文對照正確");
  assert.strictEqual(r1[10], "實習科目", "科目屬性中文對照正確");
  assert.strictEqual(r1[11], "必修", "必選修中文對照正確");
  assert.strictEqual(r1[12], 3, "學分數正確");
  assert.strictEqual(r1[13], 3, "時數正確");

  const r2 = expanded[1];
  assert.strictEqual(r2[0], "114", "開課學年應為 114");
  assert.strictEqual(r2[1], "2", "開課學期應為 2 (一下)");
  assert.strictEqual(r2[2], "1", "修課年級應為 1");
}

// 2. 測試科目屬性 0（不分屬性）全數保留不剔除
{
  const rowAttr0 = createSampleRow({ name: "團體活動時間", attr: "0" });
  assert.strictEqual(backend.isExcludedCourseRow(rowAttr0), false, "屬性 0 不應被判定為剔除列");
  assert.strictEqual(frontend.isExcludedCourseRow(rowAttr0), false, "前端亦判定屬性 0 不剔除");

  const normalized = backend.normalizeCourseCodes([rowAttr0], { withStats: true });
  assert.strictEqual(normalized.rows.length, 2, "正規化後應包含屬性 0 開課之 2 筆紀錄");
  assert.strictEqual(normalized.stats.excludedRows, 0, "統計排除數應為 0");
  assert.strictEqual(normalized.stats.keptCourseRows, 1, "保留科目數應為 1");
}

// 3. 測試科目屬性 6（特殊需求領域）全數保留不剔除
{
  const rowAttr6 = createSampleRow({ name: "特殊需求課程", attr: "6" });
  assert.strictEqual(backend.isExcludedCourseRow(rowAttr6), false, "屬性 6 不應被判定為剔除列");
  const normalized = backend.normalizeCourseCodes([rowAttr6], { withStats: true });
  assert.strictEqual(normalized.rows.length, 2, "正規化後應包含屬性 6 開課之 2 筆紀錄");
  assert.strictEqual(normalized.stats.excludedRows, 0, "統計排除數應為 0");
  assert.strictEqual(normalized.stats.keptCourseRows, 1, "保留科目數應為 1");
}

// 4. 測試前端與後端正規化行為一致性
{
  const sampleData = [
    createSampleRow({ code: "305101A", name: "程式設計實習", attr: "3" }),
    createSampleRow({ code: "000000X", name: "每週彈性學習", attr: "0" }),
    createSampleRow({ code: "308102B", name: "基本電學", attr: "2", creditsSem2: 0, hoursSem2: 0 })
  ];

  const backendResult = backend.normalizeCourseCodes(sampleData, { withStats: true });
  const frontendResult = frontend.normalizeCourseCodes(sampleData, { withStats: true });

  assert.strictEqual(backendResult.rows.length, frontendResult.rows.length, "前後端展開筆數一致");
  assert.strictEqual(backendResult.stats.excludedRows, 0, "排除筆數應為 0");
  assert.strictEqual(frontendResult.stats.excludedRows, 0, "前端排除筆數應為 0");
  assert.strictEqual(backendResult.stats.sourceRows, frontendResult.stats.sourceRows, "前後端原始筆數統計一致");
  assert.strictEqual(backendResult.rows.length, 5, "展開筆數應為 2+2+1=5 筆");
}

console.log("✓ 108 課綱課程代碼正規化單元測試全數通過！");
