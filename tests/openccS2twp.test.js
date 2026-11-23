"use strict";

/**
 * OpenCC `s2tw`／`s2twp` 黃金案例、正體不變案例、邊界案例與版本中繼資料測試。
 * 所有簡體字與中國用語皆以 Unicode 跳脫表示，避免測試檔自身命中硬閘門。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const OpenCC = require("opencc");
const openccPackage = require("opencc/package.json");
const parserPackage = require("@babel/parser/package.json");

const converterS2tw = new OpenCC("s2tw.json");
const converterS2twp = new OpenCC("s2twp.json");

const SIMPLIFIED_PROJECT = "\u9879\u76ee";
const SIMPLIFIED_DATA = "\u6570\u636e";
const SIMPLIFIED_PERMISSION = "\u6743\u9650";
const SIMPLIFIED_ONLY = "\u4ec5";
const TRADITIONAL_PROJECT = "\u9805\u76ee";
const TRADITIONAL_DATA = "\u6578\u64da";
const TRADITIONAL_COURSE_CODE = "\u8ab2\u7a0b\u4ee3\u78bc";
const TRADITIONAL_PERMISSION = "\u6b0a\u9650";
const TRADITIONAL_REPORT_PROJECT = "\u5831\u544a\u9805\u76ee";
const TRADITIONAL_MOUSE = "\u9f20\u6a19";
const TRADITIONAL_SLIM_MOUSE = "\u6ed1\u9f20";

console.log("開始執行 OpenCC s2tw／s2twp 黃金案例測試...\n");

console.log("1. 版本中繼資料應精確鎖定...");
{
  assert.strictEqual(openccPackage.version, "1.4.2");
  assert.strictEqual(openccPackage.license, "Apache-2.0");
  assert.strictEqual(parserPackage.version, "7.29.15");
  console.log("   ✓ 版本中繼資料驗證通過！\n");
}

console.log("2. 黃金案例 s2tw 輸出字級正體、s2twp 輸出慣用語...");
{
  assert.strictEqual(converterS2tw.convertSync(SIMPLIFIED_PROJECT), TRADITIONAL_PROJECT);
  assert.strictEqual(converterS2twp.convertSync(SIMPLIFIED_PROJECT), "\u5c08\u6848");
  assert.strictEqual(converterS2tw.convertSync(SIMPLIFIED_DATA), TRADITIONAL_DATA);
  assert.strictEqual(converterS2twp.convertSync(SIMPLIFIED_DATA), "\u8cc7\u6599");
  assert.strictEqual(converterS2tw.convertSync(SIMPLIFIED_PERMISSION), TRADITIONAL_PERMISSION);
  assert.strictEqual(converterS2twp.convertSync(SIMPLIFIED_PERMISSION), "\u8a31\u53ef\u6b0a");
  assert.strictEqual(converterS2tw.convertSync(SIMPLIFIED_ONLY), "\u50c5");
  assert.strictEqual(converterS2twp.convertSync(SIMPLIFIED_ONLY), "\u50c5");
  console.log("   ✓ 黃金案例驗證通過！\n");
}

console.log("3. 正體詞在 s2tw 下不變、s2twp 會誤改...");
{
  const unchanged = [
    TRADITIONAL_PROJECT,
    TRADITIONAL_DATA,
    TRADITIONAL_COURSE_CODE,
    TRADITIONAL_PERMISSION,
    TRADITIONAL_REPORT_PROJECT
  ];
  unchanged.forEach(function (text) {
    assert.strictEqual(converterS2tw.convertSync(text), text);
  });
  assert.strictEqual(converterS2twp.convertSync(TRADITIONAL_PROJECT), "\u5c08\u6848");
  assert.strictEqual(converterS2twp.convertSync(TRADITIONAL_DATA), "\u8cc7\u6599");
  assert.strictEqual(converterS2twp.convertSync(TRADITIONAL_COURSE_CODE), "\u8ab2\u7a0b\u7a0b\u5f0f\u78bc");
  assert.strictEqual(converterS2twp.convertSync(TRADITIONAL_PERMISSION), "\u8a31\u53ef\u6b0a");
  assert.strictEqual(converterS2twp.convertSync(TRADITIONAL_REPORT_PROJECT), "\u5831\u544a\u5c08\u6848");
  console.log("   ✓ 正體不變與誤改對照驗證通過！\n");
}

console.log("4. 純正體慣用語邊界：鼠標不產生 s2tw 差異...");
{
  assert.strictEqual(converterS2tw.convertSync(TRADITIONAL_MOUSE), TRADITIONAL_MOUSE);
  assert.strictEqual(converterS2twp.convertSync(TRADITIONAL_MOUSE), TRADITIONAL_SLIM_MOUSE);
  console.log("   ✓ 鼠標邊界案例驗證通過！\n");
}

console.log("5. 由正體字組成的中國用語違規不產生 s2tw 差異...");
{
  const mainlandTerms = ["\u652f\u6301", "\u914d\u7f6e", "\u53bb\u91cd", "\u54c8\u5e0c"];
  mainlandTerms.forEach(function (text) {
    assert.strictEqual(converterS2tw.convertSync(text), text);
  });
  console.log("   ✓ 正體違規邊界案例驗證通過！\n");
}

console.log("6. 來源文件可查閱且記錄版本與提交溯源...");
{
  const sourcePath = path.join(__dirname, "..", "docs", "\u53c3\u8003\u8cc7\u6599", "opencc", "SOURCES.md");
  const content = fs.readFileSync(sourcePath, "utf8");
  assert.ok(content.includes("1.4.2"));
  assert.ok(content.includes("7.29.15"));
  assert.ok(content.includes("81935296ea8cb2c4661438b3e92835e4cf2d27c8"));
  assert.ok(content.includes("\\u9879\\u76ee"));
  console.log("   ✓ 來源文件查閱驗證通過！\n");
}

console.log("✓ OpenCC s2tw／s2twp 黃金案例測試全數通過！\n");
