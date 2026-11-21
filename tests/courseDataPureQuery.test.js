const test = require("node:test");
const assert = require("node:assert/strict");

const { chunkArray } = require("../utilities.js");
const { queryCourseDataRows } = require("../subjectCodeTransformer.js");

test("chunkArray - 邊界值與正常切分驗證", async (t) => {
  await t.test("非陣列與空陣列回傳空陣列", () => {
    assert.deepStrictEqual(chunkArray(null, 10), []);
    assert.deepStrictEqual(chunkArray(undefined, 10), []);
    assert.deepStrictEqual(chunkArray("not an array", 10), []);
    assert.deepStrictEqual(chunkArray([], 10), []);
  });

  await t.test("chunkSize 無效值自動回退為 1", () => {
    assert.deepStrictEqual(chunkArray([1, 2, 3], 0), [[1], [2], [3]]);
    assert.deepStrictEqual(chunkArray([1, 2, 3], -5), [[1], [2], [3]]);
    assert.deepStrictEqual(chunkArray([1, 2, 3], "invalid"), [[1], [2], [3]]);
  });

  await t.test("正常整除與不整除切分", () => {
    const list = [1, 2, 3, 4, 5];
    assert.deepStrictEqual(chunkArray(list, 2), [[1, 2], [3, 4], [5]]);
    assert.deepStrictEqual(chunkArray(list, 5), [[1, 2, 3, 4, 5]]);
    assert.deepStrictEqual(chunkArray(list, 10), [[1, 2, 3, 4, 5]]);
  });
});

test("queryCourseDataRows - 純資料列篩選與分頁零 Mock 驗證", async (t) => {
  const sampleRows = [
    // [學年, 學期, 年級, 入學年, 課程代碼, 科目名稱, 群別, 科別, 類別, 開課方式, 屬性, 必選修, 學分, 時數]
    ["112", "1", "1", "112", "C001", "國語文", "普通科", "普通科", "部定必修", "原班開課", "一般科目", "必修", "4", "4"],
    ["112", "1", "1", "112", "C002", "英語文", "普通科", "普通科", "部定必修", "原班開課", "一般科目", "必修", "4", "4"],
    ["112", "2", "1", "112", "C003", "數學", "電機電子群", "資訊科", "校訂必修", "原班開課", "專業科目", "必修", "3", "3"],
    ["113", "1", "2", "112", "C004", "專題實作", "商業與管理群", "資料處理科", "校訂選修", "跨班選修", "實習科目", "選修", "2", "2"]
  ];

  await t.test("空陣列、null、undefined 傳入時回傳 totalPages 0", () => {
    const resEmpty = queryCourseDataRows([], { page: 1, pageSize: 10 });
    assert.strictEqual(resEmpty.ok, true);
    assert.strictEqual(resEmpty.total, 0);
    assert.strictEqual(resEmpty.totalPages, 0);
    assert.deepStrictEqual(resEmpty.list, []);

    const resNull = queryCourseDataRows(null, { page: 2, pageSize: 20 });
    assert.strictEqual(resNull.page, 2);
    assert.strictEqual(resNull.pageSize, 20);
    assert.strictEqual(resNull.totalPages, 0);

    const resUndefined = queryCourseDataRows(undefined);
    assert.strictEqual(resUndefined.page, 1);
    assert.strictEqual(resUndefined.pageSize, 50);
    assert.strictEqual(resUndefined.totalPages, 0);
  });

  await t.test("無篩選條件時正常分頁與物件映射", () => {
    const res = queryCourseDataRows(sampleRows, { page: 1, pageSize: 2 });
    assert.strictEqual(res.total, 4);
    assert.strictEqual(res.totalPages, 2);
    assert.strictEqual(res.list.length, 2);
    assert.strictEqual(res.list[0].courseCode, "C001");
    assert.strictEqual(res.list[0].subjectName, "國語文");
    assert.strictEqual(res.list[1].courseCode, "C002");
    assert.strictEqual(res.list[1].subjectName, "英語文");

    const page2 = queryCourseDataRows(sampleRows, { page: 2, pageSize: 2 });
    assert.strictEqual(page2.list.length, 2);
    assert.strictEqual(page2.list[0].courseCode, "C003");
    assert.strictEqual(page2.list[1].courseCode, "C004");
  });

  await t.test("篩選條件：學年度與學期過濾", () => {
    const res = queryCourseDataRows(sampleRows, { academicYear: "112", semester: "1" });
    assert.strictEqual(res.total, 2);
    assert.strictEqual(res.list.length, 2);
    assert.strictEqual(res.list[0].courseCode, "C001");
    assert.strictEqual(res.list[1].courseCode, "C002");
  });

  await t.test("篩選條件：科別精確比對", () => {
    const res = queryCourseDataRows(sampleRows, { department: "資訊科" });
    assert.strictEqual(res.total, 1);
    assert.strictEqual(res.list[0].courseCode, "C003");
    assert.strictEqual(res.list[0].department, "資訊科");
  });

  await t.test("關鍵字模糊比對（科目名稱、代碼、科別、群別）", () => {
    const resKeyword = queryCourseDataRows(sampleRows, { keyword: "專題" });
    assert.strictEqual(resKeyword.total, 1);
    assert.strictEqual(resKeyword.list[0].subjectName, "專題實作");

    const resCode = queryCourseDataRows(sampleRows, { keyword: "c002" });
    assert.strictEqual(resCode.total, 1);
    assert.strictEqual(resCode.list[0].subjectName, "英語文");
  });

  await t.test("有資料列但篩選條件查無結果時，totalPages 回傳 1", () => {
    const resNoMatch = queryCourseDataRows(sampleRows, { keyword: "不存在的科目" });
    assert.strictEqual(resNoMatch.ok, true);
    assert.strictEqual(resNoMatch.total, 0);
    assert.strictEqual(resNoMatch.totalPages, 1);
    assert.deepStrictEqual(resNoMatch.list, []);
  });
});
