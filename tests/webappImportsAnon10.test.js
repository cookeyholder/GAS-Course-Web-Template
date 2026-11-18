"use strict";

/**
 * webapp/js/imports.js 原 <anon method-10> 單元測試（G7.13）。
 * 原位置為 doImport 內 MEA.api.call(...).then(function (result) {...}) 回呼，
 * 已抽為 handleImportResult，並搭配 handleImportError 驗證完整匯入流程。
 */

const assert = require("assert");
const createDeps = require("./helpers/importsUiDeps.js").createImportsDeps;

console.log("開始執行 webapp/js/imports.js 匯入結果回呼測試...\n");

function flush() {
  return new Promise(function (resolve) {
    setImmediate(resolve);
  });
}

async function run() {
  const ctx = createDeps();
  assert.strictEqual(typeof ctx.imports.handleImportResult, "function", "應抽出結果處理函式");
  console.log("1. 原匿名回呼已抽為具名函式 ✓\n");

  const missing = createDeps();
  missing.imports.doImport();
  assert.deepStrictEqual(missing.calls.apiCalls, []);
  assert.strictEqual(missing.calls.toasts.length, 1);
  assert.strictEqual(missing.calls.toasts[0].message, "請先選擇並解析課程代碼檔案");
  assert.strictEqual(missing.calls.toasts[0].type, "warn");
  console.log("2. 尚未解析檔案時應提示且不送出請求 ✓\n");

  const success = createDeps();
  const entry = { payload: [["A"], ["B"]], fileName: "課綱.xlsx" };
  success.state.imports = { courseCodes: entry };
  success.imports.doImport();
  await flush();
  assert.strictEqual(success.calls.apiCalls.length, 1);
  assert.strictEqual(success.calls.apiCalls[0].action, "importCourseCodes");
  assert.deepStrictEqual(success.calls.apiCalls[0].payload, { rows: entry.payload, preNormalized: true });
  assert.strictEqual(success.state.importBusy, false);
  assert.strictEqual(success.state.imports.courseCodes.imported, true);
  assert.strictEqual(success.state.importLast.ok, true);
  assert.deepStrictEqual(success.calls.fetchList, [1]);
  assert(
    success.calls.toasts.some(function (item) {
      return item.type === "ok" && item.message.indexOf("已儲存至") !== -1;
    })
  );
  console.log("3. 成功回應應標記匯入完成並重新整理課程清單 ✓\n");

  const rejected = createDeps();
  rejected.state.imports = { courseCodes: { payload: [["A"]] } };
  rejected.calls.apiResponses.push({ ok: false, message: "請先初始化工作表" });
  rejected.imports.doImport();
  await flush();
  assert.strictEqual(rejected.state.importBusy, false);
  assert.strictEqual(rejected.state.importLast, null);
  assert.strictEqual(rejected.state.imports.courseCodes.imported, undefined);
  assert.deepStrictEqual(rejected.calls.fetchList, []);
  assert(
    rejected.calls.toasts.some(function (item) {
      return item.type === "err" && item.message === "請先初始化工作表";
    })
  );
  console.log("4. 失敗回應應顯示後端訊息且不標記完成 ✓\n");

  const emptyResult = createDeps();
  emptyResult.state.imports = { courseCodes: { payload: [["A"]] } };
  emptyResult.calls.apiResponses.push(null);
  emptyResult.imports.doImport();
  await flush();
  assert(
    emptyResult.calls.toasts.some(function (item) {
      return item.type === "err" && item.message === "匯入失敗";
    })
  );

  const thrown = createDeps();
  thrown.state.imports = { courseCodes: { payload: [["A"]] } };
  thrown.calls.apiErrors.push(new Error("連線中斷"));
  thrown.imports.doImport();
  await flush();
  assert.strictEqual(thrown.state.importBusy, false);
  assert(
    thrown.calls.toasts.some(function (item) {
      return item.type === "err" && item.message === "連線中斷";
    })
  );
  console.log("5. 空回應與例外應各自顯示錯誤提示 ✓\n");

  const direct = createDeps();
  const directEntry = { payload: [["A"]] };
  direct.imports.handleImportResult(directEntry, { ok: true });
  assert.strictEqual(direct.state.imports.courseCodes.imported, true);
  direct.imports.handleImportResult(directEntry, { ok: false });
  assert(
    direct.calls.toasts.some(function (item) {
      return item.type === "err" && item.message === "匯入失敗";
    })
  );
  direct.imports.handleImportError("字串錯誤");
  assert(
    direct.calls.toasts.some(function (item) {
      return item.message === "字串錯誤";
    })
  );
  console.log("6. 直接呼叫結果與錯誤處理函式行為一致 ✓\n");

  console.log("✓ webapp/js/imports.js 匯入結果回呼測試全數通過！\n");
}

run().catch(function (error) {
  console.error(error);
  process.exit(1);
});
