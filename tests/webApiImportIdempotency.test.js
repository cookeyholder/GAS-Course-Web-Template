"use strict";

/**
 * 匯入冪等測試（task 2.6）。
 * 驗證相同 importId 重送時直接回傳前次結果，不重複清除與寫入。
 */

const assert = require("assert");
const api = require("../webApi.js");

console.log("開始執行匯入冪等測試...\n");

function withStubbed(obj, key, stub, fn) {
  const had = Object.prototype.hasOwnProperty.call(obj, key);
  const prev = obj[key];
  obj[key] = stub;
  try {
    return fn();
  } finally {
    if (had) obj[key] = prev;
    else delete obj[key];
  }
}

function withGlobal(name, value, fn) {
  const had = Object.prototype.hasOwnProperty.call(global, name);
  const prev = global[name];
  global[name] = value;
  try {
    return fn();
  } finally {
    if (had) global[name] = prev;
    else delete global[name];
  }
}

const NORMALIZED_ROW = ["114", "1", "1", "114", "C1", "程式設計", "23", "305", "1", "0", "3", "1", "3", "3"];

function makePayload(importId) {
  return {
    csrfToken: "csrf-ok",
    rows: [NORMALIZED_ROW],
    preNormalized: true,
    importId: importId
  };
}

console.log("1. 相同 importId 重送只寫入一次並標記 idempotent...");
{
  const importId = "test-idem-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  let writeCalls = 0;
  withStubbed(
    api,
    "authorizeWebApiAction",
    function () {
      return { ok: true, session: { role: "admin", csrfToken: "csrf-ok" } };
    },
    function () {
      withGlobal(
        "importNormalizedCourseCodes",
        function (rows) {
          writeCalls += 1;
          return { ok: true, rows: rows.length, stats: { expandedRows: rows.length } };
        },
        function () {
          const first = api.routeWebApiAction("importCourseCodes", makePayload(importId));
          const second = api.routeWebApiAction("importCourseCodes", makePayload(importId));
          assert.strictEqual(first.ok, true);
          assert.strictEqual(second.ok, true);
          assert.strictEqual(second.idempotent, true, "命中快取應標記 idempotent");
          assert.strictEqual(second.rows, first.rows);
          assert.strictEqual(writeCalls, 1, "相同 importId 不得重複寫入");
        }
      );
    }
  );
  console.log("   ✓ 相同 importId 冪等驗證通過！\n");
}

console.log("2. 不同 importId 仍各自寫入...");
{
  const base = "test-idem-diff-" + Date.now() + "-" + Math.random().toString(36).slice(2, 10);
  let writeCalls = 0;
  withStubbed(
    api,
    "authorizeWebApiAction",
    function () {
      return { ok: true, session: { role: "admin", csrfToken: "csrf-ok" } };
    },
    function () {
      withGlobal(
        "importNormalizedCourseCodes",
        function (rows) {
          writeCalls += 1;
          return { ok: true, rows: rows.length, writeId: writeCalls };
        },
        function () {
          const first = api.routeWebApiAction("importCourseCodes", makePayload(base + "-a"));
          const second = api.routeWebApiAction("importCourseCodes", makePayload(base + "-b"));
          assert.strictEqual(first.ok, true);
          assert.strictEqual(second.ok, true);
          assert.strictEqual(second.idempotent, undefined);
          assert.strictEqual(writeCalls, 2);
        }
      );
    }
  );
  console.log("   ✓ 不同 importId 寫入驗證通過！\n");
}

console.log("3. 無 importId 時不快取，且空白／過長 id 被忽略...");
{
  let writeCalls = 0;
  withStubbed(
    api,
    "authorizeWebApiAction",
    function () {
      return { ok: true, session: { role: "admin", csrfToken: "csrf-ok" } };
    },
    function () {
      withGlobal(
        "importNormalizedCourseCodes",
        function (rows) {
          writeCalls += 1;
          return { ok: true, rows: rows.length };
        },
        function () {
          [undefined, "", "   ", "x".repeat(201)].forEach(function (importId) {
            const r = api.routeWebApiAction("importCourseCodes", makePayload(importId));
            assert.strictEqual(r.ok, true);
            assert.strictEqual(r.idempotent, undefined);
          });
          assert.strictEqual(writeCalls, 4, "無效 importId 不得命中快取");
        }
      );
    }
  );
  assert.strictEqual(api.getCachedImportResult(""), null);
  assert.strictEqual(api.getCachedImportResult("x".repeat(201)), null);
  console.log("   ✓ 無效 importId 驗證通過！\n");
}

console.log("✓ 匯入冪等測試全數通過！\n");
