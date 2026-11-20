#!/usr/bin/env node
"use strict";

/**
 * captureGoldenLogSnapshot.js（task 1.3）
 *
 * 以代表性請求擷取 Web API 寫入的操作日誌快照，供 task 4.2 驗證
 * `activityLogInterceptor.js` 拆分前後的日誌內容與筆數一致。
 *
 * 動態欄位（timestamp／requestId／durationMs）在輸出前正規化，
 * 使快照可跨執行、跨重構穩定比對。
 *
 * 用法：node scripts/captureGoldenLogSnapshot.js [輸出路徑]
 * 預設輸出：openspec/changes/refactor-cohesion-and-coupling/golden-log-snapshot.json
 */

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const defaultOutput = path.join(
  root,
  "openspec",
  "changes",
  "refactor-cohesion-and-coupling",
  "golden-log-snapshot.json"
);
const outputPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultOutput;
const api = require(path.join(root, "webApi.js"));

/** 代表性請求：涵蓋成功、失敗、不寫日誌與各類錯誤路徑。 */
const CASES = [
  { label: "invalid_json", payload: "{bad json" },
  { label: "missing_action", payload: {} },
  { label: "ping", payload: { action: "ping" } },
  { label: "getPublicConfig", payload: { action: "getPublicConfig" } },
  { label: "getSystemSettings_missing_token", payload: { action: "getSystemSettings" } },
  { label: "getCourseIndex_missing_token", payload: { action: "getCourseIndex", page: 1 } },
  {
    label: "saveSystemSettings_csrf_failure",
    payload: { action: "saveSystemSettings", token: "tok", csrfToken: "bad" }
  }
];

/** 移除每次執行皆不同的動態欄位，保留可比的日誌內容。 */
function normalizeRecord(record) {
  return {
    category: record.category,
    action: record.action,
    result: record.result,
    email: record.email,
    name: record.name,
    role: record.role,
    summary: record.summary,
    detail: record.detail,
    errorCode: record.errorCode
  };
}

function capture() {
  const records = [];
  const originalCreateContext = api.createWebApiLogContext;
  const originalAppend = api.appendActivityLog;

  api.createWebApiLogContext = function (action, startTime) {
    const context = originalCreateContext(action, startTime);
    context.requestId = "req_GOLDEN";
    context.startTime = 1700000000000;
    return context;
  };
  api.appendActivityLog = function (record) {
    records.push(record);
  };

  const cases = CASES.map(function (entry) {
    const start = records.length;
    let result;
    try {
      result = api.executeWebApi(entry.payload, {});
    } catch (error) {
      result = { ok: false, error: "thrown", message: error && error.message ? error.message : String(error) };
    }
    const written = records.slice(start);
    return {
      label: entry.label,
      requestOk: result.ok === true,
      requestError: result.error || "",
      logCount: written.length,
      logs: written.map(normalizeRecord)
    };
  });

  api.createWebApiLogContext = originalCreateContext;
  api.appendActivityLog = originalAppend;

  return cases;
}

const cases = capture();
const snapshot = {
  description: "重構前日誌 golden snapshot，供 task 4.2 比對 activityLogInterceptor 拆分前後一致性",
  cases: cases
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2) + "\n", "utf8");
console.log("已寫入 golden log snapshot：" + outputPath);
console.log(
  "代表性請求數：" +
    cases.length +
    "，日誌總筆數：" +
    cases.reduce(function (sum, c) {
      return sum + c.logCount;
    }, 0)
);
