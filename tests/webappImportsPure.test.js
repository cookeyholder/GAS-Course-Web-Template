const test = require("node:test");
const assert = require("node:assert/strict");

const importsModule = require("../webapp/js/imports.js");

test("webapp/js/imports.js 純函式與狀態不可變性驗證", async (t) => {
  const { generateImportId, buildImportSuccessPatch } = importsModule;

  await t.test("generateImportId 格式與唯一性", () => {
    assert.strictEqual(typeof generateImportId, "function");
    const id1 = generateImportId();
    const id2 = generateImportId();
    assert.match(id1, /^imp-\d+-[a-z0-9]+$/);
    assert.match(id2, /^imp-\d+-[a-z0-9]+$/);
    assert.notStrictEqual(id1, id2);
  });

  await t.test("buildImportSuccessPatch 不修改傳入物件並產生標準 state patch", () => {
    assert.strictEqual(typeof buildImportSuccessPatch, "function");
    const rawEntry = {
      filename: "courses.xlsx",
      importId: "imp-test-123",
      payload: [["C001", "科目"]],
      stats: { totalRows: 1 }
    };
    const clonedEntry = JSON.parse(JSON.stringify(rawEntry));

    const backendResult = {
      ok: true,
      rows: 1,
      idempotent: false
    };

    const patch = buildImportSuccessPatch(rawEntry, backendResult);

    // 斷言傳入物件未被就地變更
    assert.deepStrictEqual(rawEntry, clonedEntry);
    assert.strictEqual(rawEntry.imported, undefined);

    // 斷言 patch 物件結構與屬性
    assert.strictEqual(patch.importBusy, false);
    assert.strictEqual(patch.importLast, backendResult);
    assert.ok(patch.imports && patch.imports.courseCodes);
    assert.strictEqual(patch.imports.courseCodes.imported, true);
    assert.strictEqual(patch.imports.courseCodes.importId, "imp-test-123");
    assert.strictEqual(patch.imports.courseCodes.filename, "courses.xlsx");
  });
});
