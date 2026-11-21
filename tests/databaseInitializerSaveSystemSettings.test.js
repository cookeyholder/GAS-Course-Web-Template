"use strict";

/**
 * saveSystemSettings 單元測試（G3.1）
 * 驗證系統設定儲存於記憶體與試算表模式之正規化、更新與附加行為。
 */

const assert = require("assert");
const db = require("../databaseInitializer.js");

console.log("開始執行 saveSystemSettings 測試...\n");

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

function snapshotMemoryConfig() {
  const settings = db.readSystemSettings();
  return {
    學年度: settings["學年度"],
    學期: settings["學期"],
    系統名稱: settings["系統名稱"],
    "OAuth Client ID": settings["OAuth Client ID"],
    "OAuth Client Secret": settings["OAuth Client Secret"],
    登入白名單限制啟用: settings["登入白名單限制啟用"],
    "Google 登入允許網域": settings["Google 登入允許網域"]
  };
}

function restoreMemoryConfig(snapshot) {
  withGlobals({ SpreadsheetApp: undefined }, function () {
    db.saveSystemSettings(snapshot);
  });
}

console.log("1. 記憶體模式（無 SpreadsheetApp、無 ss）應儲存並正規化設定...");
{
  const before = snapshotMemoryConfig();
  try {
    const result = withGlobals({ SpreadsheetApp: undefined }, function () {
      return db.saveSystemSettings({
        schoolYear: "115",
        semester: "2",
        systemName: "測試系統",
        clientId: "cid",
        clientSecret: "sec",
        restrictWhitelist: true,
        allowedLoginDomain: "  @EXAMPLE.COM  ",
        自訂記憶體未知鍵: "數值123"
      });
    });
    assert.deepStrictEqual(result, { ok: true });
    const saved = withGlobals({ SpreadsheetApp: undefined }, function () {
      return db.readSystemSettings();
    });
    assert.strictEqual(saved["學年度"], "115");
    assert.strictEqual(saved.schoolYear, "115");
    assert.strictEqual(saved["學期"], "2");
    assert.strictEqual(saved.semester, "2");
    assert.strictEqual(saved["系統名稱"], "測試系統");
    assert.strictEqual(saved.systemName, "測試系統");
    assert.strictEqual(saved["OAuth Client ID"], "cid");
    assert.strictEqual(saved.clientId, "cid");
    assert.strictEqual(saved["OAuth Client Secret"], "sec");
    assert.strictEqual(saved.clientSecret, "sec");
    assert.strictEqual(saved["登入白名單限制啟用"], "true");
    assert.strictEqual(saved.restrictWhitelist, true);
    assert.strictEqual(saved["Google 登入允許網域"], "example.com");
    assert.strictEqual(saved.allowedLoginDomain, "example.com");
    assert.strictEqual(saved["自訂記憶體未知鍵"], "數值123");
    console.log("   ✓ 記憶體模式正規化儲存驗證通過！\n");
  } finally {
    restoreMemoryConfig(before);
  }
}

console.log("2. 記憶體模式應支援中文鍵名與布林/網域反向正規化...");
{
  const before = snapshotMemoryConfig();
  try {
    withGlobals({ SpreadsheetApp: undefined }, function () {
      db.saveSystemSettings({
        學年度: "113",
        學期: "1",
        系統名稱: "中文鍵系統",
        "OAuth Client ID": "cid2",
        "OAuth Client Secret": "sec2",
        登入白名單限制啟用: "否",
        "Google 登入允許網域": "Domain.EDU"
      });
    });
    const saved = withGlobals({ SpreadsheetApp: undefined }, function () {
      return db.readSystemSettings();
    });
    assert.strictEqual(saved.schoolYear, "113");
    assert.strictEqual(saved.systemName, "中文鍵系統");
    assert.strictEqual(saved.clientId, "cid2");
    assert.strictEqual(saved.restrictWhitelist, false);
    assert.strictEqual(saved.allowedLoginDomain, "domain.edu");
    console.log("   ✓ 中文鍵名與反向正規化驗證通過！\n");
  } finally {
    restoreMemoryConfig(before);
  }
}

console.log("3. 記憶體模式空值、null 與 undefined 應依欄位規則正規化...");
{
  const before = snapshotMemoryConfig();
  try {
    withGlobals({ SpreadsheetApp: undefined }, function () {
      db.saveSystemSettings({
        systemName: null,
        clientId: undefined,
        restrictWhitelist: null,
        allowedLoginDomain: null
      });
    });
    const saved = withGlobals({ SpreadsheetApp: undefined }, function () {
      return db.readSystemSettings();
    });
    // readSystemSettings 對空系統名稱回傳預設名稱，其餘空值欄位回傳空字串/false
    assert.strictEqual(saved["系統名稱"], "");
    assert.strictEqual(saved.systemName, "Google Apps Script 應用程式範本");
    assert.strictEqual(saved["OAuth Client ID"], "");
    assert.strictEqual(saved.clientId, "");
    assert.strictEqual(saved["登入白名單限制啟用"], "false");
    assert.strictEqual(saved.restrictWhitelist, false);
    assert.strictEqual(saved["Google 登入允許網域"], "");
    assert.strictEqual(saved.allowedLoginDomain, "");
    console.log("   ✓ 空值正規化驗證通過！\n");
  } finally {
    restoreMemoryConfig(before);
  }
}

function makeSheet(initialRows) {
  const rows = initialRows.map(function (r) {
    return r.slice();
  });
  let lastRow = rows.length;
  return {
    getRange: function (a, b, c, d) {
      if (a === "A2:B30") {
        return {
          getValues: function () {
            const out = [];
            for (let i = 1; i <= 29; i++) {
              out.push(rows[i] ? [rows[i][0], rows[i][1]] : ["", ""]);
            }
            return out;
          },
          setValues: function (values) {
            for (let i = 0; i < values.length; i++) {
              const idx = i + 1;
              rows[idx] = [values[i][0], values[i][1]];
              if (idx + 1 > lastRow) lastRow = idx + 1;
            }
          }
        };
      }
      if (b === 1 && d === 2) {
        return {
          setValues: function (values) {
            for (let i = 0; i < values.length; i++) {
              rows[a + i] = [values[i][0], values[i][1]];
            }
            lastRow = Math.max(lastRow, a + values.length);
          }
        };
      }
      throw new Error("unexpected range");
    },
    getLastRow: function () {
      return lastRow;
    },
    _rows: rows
  };
}

console.log("4. 試算表模式應更新既有設定、正規化值並保留未更新欄位...");
{
  const sheet = makeSheet([
    ["設定項目", "設定數值"],
    ["學年度", "114"],
    ["學期", "1"],
    ["系統名稱", "舊系統"],
    ["OAuth Client ID", "old"],
    ["OAuth Client Secret", "oldsec"],
    ["登入白名單限制啟用", "false"],
    ["Google 登入允許網域", ""]
  ]);
  const ss = {
    getSheetByName: function (name) {
      assert.strictEqual(name, db.SHEET_SYSTEM_CONFIG);
      return sheet;
    }
  };
  const result = db.saveSystemSettings(
    {
      schoolYear: "116",
      restrictWhitelist: "1",
      allowedLoginDomain: "@Mail.Example.com",
      clientId: "newcid"
    },
    ss
  );
  assert.deepStrictEqual(result, { ok: true });
  assert.strictEqual(sheet._rows[1][1], "116");
  assert.strictEqual(sheet._rows[2][1], "1"); // unchanged
  assert.strictEqual(sheet._rows[3][1], "舊系統"); // unchanged
  assert.strictEqual(sheet._rows[4][1], "newcid");
  assert.strictEqual(sheet._rows[5][1], "oldsec"); // unchanged
  assert.strictEqual(sheet._rows[6][1], "true");
  assert.strictEqual(sheet._rows[7][1], "mail.example.com");
  console.log("   ✓ 試算表更新與正規化驗證通過！\n");
}

console.log("5. 試算表模式遇到未知鍵應附加於最後一列...");
{
  const sheet = makeSheet([
    ["設定項目", "設定數值"],
    ["學年度", "114"],
    ["學期", "1"]
  ]);
  const ss = {
    getSheetByName: function () {
      return sheet;
    }
  };
  db.saveSystemSettings(
    {
      schoolYear: "117",
      customKey: "custom-value",
      另一設定: "值"
    },
    ss
  );
  assert.strictEqual(sheet._rows[1][1], "117");
  // 未知鍵會附加在 sheet.getLastRow() + 1；因 A2:B30 更新會擴展 lastRow，故以內容搜尋確認附加
  const appended = sheet._rows
    .filter(function (r) {
      return r && (r[0] === "customKey" || r[0] === "另一設定");
    })
    .map(function (r) {
      return [r[0], r[1]];
    })
    .sort(function (a, b) {
      const ak = String(a[0]);
      const bk = String(b[0]);
      if (ak < bk) return -1;
      if (ak > bk) return 1;
      return 0;
    });
  assert.deepStrictEqual(appended, [
    ["customKey", "custom-value"],
    ["另一設定", "值"]
  ]);
  console.log("   ✓ 未知鍵附加驗證通過！\n");
}

console.log("6. 試算表模式找不到設定工作表時應拋出錯誤...");
{
  const ss = {
    getSheetByName: function () {
      return null;
    }
  };
  assert.throws(function () {
    db.saveSystemSettings({ schoolYear: "114" }, ss);
  }, /找不到工作表/);
  console.log("   ✓ 缺少工作表錯誤驗證通過！\n");
}

console.log("7. settings 為空或未提供時應安全執行（記憶體模式）...");
{
  const before = snapshotMemoryConfig();
  try {
    withGlobals({ SpreadsheetApp: undefined }, function () {
      assert.deepStrictEqual(db.saveSystemSettings(), { ok: true });
      assert.deepStrictEqual(db.saveSystemSettings(null), { ok: true });
      assert.deepStrictEqual(db.saveSystemSettings({}), { ok: true });
    });
    const after = snapshotMemoryConfig();
    assert.deepStrictEqual(after, before);
    console.log("   ✓ 空設定安全執行驗證通過！\n");
  } finally {
    restoreMemoryConfig(before);
  }
}

console.log("8. 試算表模式超過 29 列時應分塊寫入超過的列數（mergedValues.length > 29）...");
{
  const rows = [];
  for (let i = 0; i < 29; i++) {
    rows.push(["設定" + i, "值" + i]);
  }
  let extraAppended = null;
  const mockSheet = {
    getLastRow: function () {
      return 29;
    },
    getRange: function (r, c, numRows, numCols) {
      if (typeof r === "string" && r === "A2:B30") {
        return {
          getValues: function () {
            return rows.slice();
          },
          setValues: function () {}
        };
      }
      return {
        setValues: function (v) {
          extraAppended = v;
        }
      };
    }
  };
  const mockSs = {
    getSheetByName: function () {
      return mockSheet;
    }
  };
  const extraSettings = {
    新設定A: "A",
    新設定B: "B"
  };
  const res = db.saveSystemSettings(extraSettings, mockSs);
  assert.strictEqual(res.ok, true);
  assert.ok(extraAppended !== null, "應呼叫 extraRows setValues");
  assert.strictEqual(extraAppended.length, 2);
  console.log("   ✓ 超過 29 列分塊寫入驗證通過！\n");
}

console.log("9. 試算表模式存在延伸列（row 31+）時，更新應讀入延伸列並就地更新，不產生重複鍵...");
{
  const existingRows = [];
  for (let i = 0; i < 29; i++) {
    existingRows.push(["設定" + i, "值" + i]);
  }
  // 第 31 列與第 32 列為先前附加之延伸列
  existingRows.push(["延伸設定A", "舊值A"]);
  existingRows.push(["延伸設定B", "舊值B"]);

  let savedValues = null;
  let extraAppended = null;
  const mockSheet = {
    getLastRow: function () {
      return 32;
    },
    getRange: function (r, c, numRows, numCols) {
      if (r === 2 && c === 1 && numRows === 31 && numCols === 2) {
        return {
          getValues: function () {
            return existingRows.map(function (row) {
              return row.slice();
            });
          },
          setValues: function (v) {
            savedValues = v;
          }
        };
      }
      return {
        setValues: function (v) {
          extraAppended = v;
        }
      };
    }
  };
  const mockSs = {
    getSheetByName: function () {
      return mockSheet;
    }
  };
  const updates = {
    延伸設定A: "新值A_已更新"
  };
  const res = db.saveSystemSettings(updates, mockSs);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(extraAppended, null, "不應附加新列");
  assert.ok(savedValues !== null, "應寫回延伸範圍");
  assert.strictEqual(savedValues.length, 31);
  const updatedEntry = savedValues.find(function (r) {
    return r[0] === "延伸設定A";
  });
  assert.deepStrictEqual(updatedEntry, ["延伸設定A", "新值A_已更新"]);
  const duplicates = savedValues.filter(function (r) {
    return r[0] === "延伸設定A";
  });
  assert.strictEqual(duplicates.length, 1, "絕不應產生重複鍵");
  console.log("   ✓ 延伸列讀取與就地更新驗證通過！\n");
}

console.log("✓ saveSystemSettings 測試全數通過！\n");
