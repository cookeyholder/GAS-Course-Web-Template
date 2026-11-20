"use strict";

/**
 * checkLogChainDependency.js（task 2.3）
 *
 * 在全新 Node 行程中依序載入 databaseInitializer → activityLogger →
 * activityLogBuilders 完整鏈，攔截 Module._load 記錄實際 require 呼叫，
 * 驗證 activityLogBuilders 不再逆向依賴 databaseInitializer／gasRuntime。
 *
 * 用法：
 *   node tests/helpers/checkLogChainDependency.js [root] [--inject-cycle]
 * --inject-cycle 會在人為檢查輸入中加入一條逆向邊，用於證明檢查邏輯會失敗。
 */

const path = require("path");
const Module = require("module");

const root =
  process.argv[2] && process.argv[2].indexOf("--") !== 0
    ? path.resolve(process.argv[2])
    : path.resolve(__dirname, "../..");
const injectCycle = process.argv.indexOf("--inject-cycle") !== -1;
const chain = ["databaseInitializer.js", "activityLogger.js", "activityLogBuilders.js"];
const loads = [];

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  loads.push({ request: request, parent: parent ? parent.filename : "" });
  return originalLoad.apply(this, arguments);
};

try {
  chain.forEach(function (file) {
    require(path.join(root, file));
  });
} finally {
  Module._load = originalLoad;
}

const relevantRe = /\.\/(databaseInitializer|activityLogger|activityLogBuilders|gasRuntime)\.js$/;
const edges = loads
  .filter(function (entry) {
    return relevantRe.test(entry.request);
  })
  .map(function (entry) {
    return { from: path.basename(entry.parent), to: path.basename(entry.request) };
  });

if (injectCycle) {
  edges.push({ from: "activityLogBuilders.js", to: "databaseInitializer.js" });
}

const reverse = edges.filter(function (edge) {
  return (
    edge.from === "activityLogBuilders.js" && (edge.to === "databaseInitializer.js" || edge.to === "gasRuntime.js")
  );
});

if (reverse.length > 0) {
  console.error("偵測到 activityLogBuilders 逆向相依：" + JSON.stringify(reverse));
  process.exit(1);
}

console.log("載入鏈相依方向正確，activityLogBuilders 無逆向相依。");
