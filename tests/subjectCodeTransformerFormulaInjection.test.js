"use strict";

/**
 * 課程代碼寫入公式注入防護測試（task 1.10）
 * 驗證 writeCourseIndexRowsInChunks_ 寫入前套用 sanitizeRowMatrix，
 * 並保留既有純文字格式（setNumberFormat("@")）。
 */

const assert = require("assert");
const transformer = require("../subjectCodeTransformer.js");
const utilities = require("../utilities.js");

console.log("開始執行課程代碼公式注入防護測試...\n");

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

function makeSheet() {
  const ops = [];
  let maxCols = transformer.NORMALIZED_COURSE_HEADERS.length;
  let maxRows = 1;
  let frozenRows = 0;
  const range = {
    setValues: function (values) {
      ops.push({ type: "setValues", values: JSON.parse(JSON.stringify(values)) });
      return range;
    },
    setFontWeight: function () {
      return range;
    },
    setNumberFormat: function (format) {
      ops.push({ type: "setNumberFormat", format: format });
      return range;
    },
    setFontSize: function () {
      return range;
    }
  };
  const sheet = {
    ops: ops,
    clearContents: function () {
      ops.push({ type: "clearContents" });
    },
    getMaxColumns: function () {
      return maxCols;
    },
    insertColumnsAfter: function (at, howMany) {
      maxCols += howMany;
    },
    getMaxRows: function () {
      return maxRows;
    },
    getFrozenRows: function () {
      return frozenRows;
    },
    setFrozenRows: function (n) {
      frozenRows = n;
    },
    getRange: function () {
      return range;
    }
  };
  return sheet;
}

console.log("1. 寫入前應跳脫公式注入字元...");
{
  const sheet = makeSheet();
  const ss = {
    getSheetByName: function () {
      return sheet;
    },
    insertSheet: function () {
      return sheet;
    }
  };
  const rows = [
    [
      "114",
      "=SUM(A1:A2)",
      "+cmd|'/c calc'!A1",
      "-cmd",
      "@SUM(A1)",
      "\tsheet",
      "\rcell",
      "群",
      "科",
      "類",
      "式",
      "屬",
      "必",
      "2"
    ]
  ];
  let sanitizeCalls = 0;
  const result = withGlobals(
    {
      SpreadsheetApp: undefined,
      safeApplySheetFontSize: function () {},
      sanitizeRowMatrix: function (matrix) {
        sanitizeCalls += 1;
        return utilities.sanitizeRowMatrix(matrix);
      }
    },
    function () {
      return transformer.importNormalizedCourseCodes(rows, { spreadsheet: ss, preNormalized: true });
    }
  );

  assert.strictEqual(result.ok, true);
  assert.strictEqual(sanitizeCalls, 1);
  const dataWrite = sheet.ops.filter(function (op) {
    return op.type === "setValues" && op.values[0][1] === "'=SUM(A1:A2)";
  });
  assert.strictEqual(dataWrite.length, 1);
  assert.strictEqual(dataWrite[0].values[0][1], "'=SUM(A1:A2)");
  assert.strictEqual(dataWrite[0].values[0][2], "'+cmd|'/c calc'!A1");
  assert.strictEqual(dataWrite[0].values[0][3], "'-cmd");
  assert.strictEqual(dataWrite[0].values[0][4], "'@SUM(A1)");
  assert.strictEqual(dataWrite[0].values[0][5], "'\tsheet");
  assert.strictEqual(dataWrite[0].values[0][6], "'\rcell");
  console.log("   ✓ 公式注入跳脫驗證通過！\n");
}

console.log("2. 純文字格式設定應仍舊保留...");
{
  const sheet = makeSheet();
  const ss = {
    getSheetByName: function () {
      return sheet;
    },
    insertSheet: function () {
      return sheet;
    }
  };
  withGlobals(
    {
      SpreadsheetApp: undefined,
      safeApplySheetFontSize: function () {},
      sanitizeRowMatrix: utilities.sanitizeRowMatrix
    },
    function () {
      transformer.importNormalizedCourseCodes([], { spreadsheet: ss, preNormalized: true });
    }
  );
  const formats = sheet.ops.filter(function (op) {
    return op.type === "setNumberFormat";
  });
  assert.strictEqual(formats.length, 1);
  assert.strictEqual(formats[0].format, "@");
  console.log("   ✓ 純文字格式保留驗證通過！\n");
}

console.log("3. 未提供 sanitizeRowMatrix 時應安全降級不影響寫入...");
{
  const sheet = makeSheet();
  const ss = {
    getSheetByName: function () {
      return sheet;
    },
    insertSheet: function () {
      return sheet;
    }
  };
  const result = withGlobals(
    {
      SpreadsheetApp: undefined,
      safeApplySheetFontSize: function () {},
      sanitizeRowMatrix: undefined
    },
    function () {
      return transformer.importNormalizedCourseCodes(
        [["114", "=A1", "1", "1", "C1", "S", "G", "D", "T", "F", "A", "必", "1", "1"]],
        { spreadsheet: ss, preNormalized: true }
      );
    }
  );
  assert.strictEqual(result.ok, true);
  console.log("   ✓ 降級路徑驗證通過！\n");
}

console.log("✓ 課程代碼公式注入防護測試全數通過！\n");
