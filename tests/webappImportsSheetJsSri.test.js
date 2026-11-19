"use strict";

/**
 * SheetJS CDN 版本固定與 SRI 驗證測試（task 1.7）
 * 確認僅使用單一版本、動態載入的 <script> 附帶 integrity 與 crossorigin。
 */

const assert = require("assert");
const importsModule = require("../webapp/js/imports.js");

console.log("開始執行 SheetJS CDN SRI 測試...\n");

const EXPECTED_SRI = "sha384-EnyY0/GSHQGSxSgMwaIPzSESbqoOLSexfnSMN2AP+39Ckmn92stwABZynq1JyzdT";

console.log("1. SheetJS CDN 應固定單一版本 0.20.3...");
{
  assert.strictEqual(importsModule.SHEETJS_VERSION, "0.20.3");
  assert.strictEqual(importsModule.SHEETJS_CDN.length, 1);
  assert.strictEqual(importsModule.SHEETJS_CDN[0], "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");
  const joined = importsModule.SHEETJS_CDN.join(" ");
  assert.strictEqual(joined.indexOf("0.18.5"), -1, "不得混用舊版 0.18.5");
  console.log("   ✓ 版本固定驗證通過！\n");
}

console.log("2. SRI 應為真實 sha384 雜湊...");
{
  assert.strictEqual(importsModule.SHEETJS_SRI, EXPECTED_SRI);
  assert(/^sha384-[A-Za-z0-9+/]{64}={0,2}$/.test(importsModule.SHEETJS_SRI));
  console.log("   ✓ SRI 格式驗證通過！\n");
}

console.log("3. 動態載入的 script 應設定 integrity 與 crossorigin...");
{
  const created = [];
  const doc = {
    head: {
      appendChild: function (element) {
        created.push(element);
      }
    },
    createElement: function (tag) {
      return { tagName: tag, src: "", async: false, integrity: "", crossOrigin: "", onload: null, onerror: null };
    }
  };
  const win = { XLSX: null };
  const mod = importsModule.createImportsModule({ window: win, document: doc });
  // 不等待載入完成：未觸發 onload 時 Promise 保持 pending，不影響測試結束。
  mod.loadSheetJs();

  assert.strictEqual(created.length, 1);
  const script = created[0];
  assert.strictEqual(script.tagName, "script");
  assert.strictEqual(script.src, importsModule.SHEETJS_CDN[0]);
  assert.strictEqual(script.integrity, EXPECTED_SRI);
  assert.strictEqual(script.crossOrigin, "anonymous");
  console.log("   ✓ script 完整性驗證通過！\n");
}

console.log("✓ SheetJS CDN SRI 測試全數通過！\n");
