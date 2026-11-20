"use strict";

/**
 * moduleDependencyGraph.test.js（task 1.1）
 * 以靜態掃描建立後端模組相依圖，驗證三節點循環相依
 * （databaseInitializer → activityLogger → activityLogBuilders → databaseInitializer）
 * 被正確偵測；並以人造環反向驗證「無環檢查」確實會失敗，避免假驗證。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
console.log("開始執行 moduleDependencyGraph 測試...\n");

/**
 * 掃描根目錄所有後端 .js 模組的 require() 與 resolveDependency_ 呼叫，
 * 建立相依邊清單。忽略自環（例如 gasRuntime 內的延遲自我 require）。
 *
 * @returns {Array<{from: string, to: string}>} 相依邊清單
 */
function scanBackendEdges() {
  const files = fs.readdirSync(root).filter(function (file) {
    return file.endsWith(".js");
  });
  const requireRe = /require\(\s*["']\.\/([\w-]+\.js)["']\s*\)/g;
  const resolveRe = /resolveDependency_\(\s*["'][^"']*["']\s*,\s*["']\.\/([\w-]+\.js)["']/g;
  const edges = [];

  files.forEach(function (file) {
    const source = file.replace(/\.js$/, "");
    const text = fs.readFileSync(path.join(root, file), "utf8");
    const targets = new Set();
    let match;
    while ((match = requireRe.exec(text)) !== null) targets.add(match[1]);
    while ((match = resolveRe.exec(text)) !== null) targets.add(match[1]);
    targets.forEach(function (targetFile) {
      const target = targetFile.replace(/\.js$/, "");
      if (target === source) return;
      edges.push({ from: source, to: target });
    });
  });

  return edges;
}

/**
 * 找出相依圖中的所有簡單環。
 *
 * @param {Array<{from: string, to: string}>} edges - 相依邊清單
 * @returns {Array<Array<string>>} 環的節點序列清單
 */
function findCycles(edges) {
  const adjacency = new Map();
  edges.forEach(function (edge) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  });

  const nodes = Array.from(adjacency.keys()).sort();
  const cycles = [];

  nodes.forEach(function (start) {
    const stack = [start];
    const onStack = new Set([start]);

    function visit(node) {
      (adjacency.get(node) || []).forEach(function (next) {
        if (next === start && stack.length > 1) {
          cycles.push(stack.slice());
        } else if (!onStack.has(next) && nodes.indexOf(next) !== -1) {
          stack.push(next);
          onStack.add(next);
          visit(next);
          stack.pop();
          onStack.delete(next);
        }
      });
    }

    visit(start);
  });

  const seen = new Set();
  return cycles.filter(function (cycle) {
    const key = cycle.slice().sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

console.log("1. 靜態掃描應偵測到三節點循環相依...");
{
  const edges = scanBackendEdges();
  const cycle = findCycles(edges).find(function (candidate) {
    return (
      candidate.length === 3 &&
      candidate.indexOf("databaseInitializer") !== -1 &&
      candidate.indexOf("activityLogger") !== -1 &&
      candidate.indexOf("activityLogBuilders") !== -1
    );
  });
  assert(cycle, "應偵測到 databaseInitializer → activityLogger → activityLogBuilders → databaseInitializer 三節點環");
  console.log("   ✓ 三節點環偵測成功：" + cycle.join(" → ") + " → " + cycle[0] + "\n");
}

console.log("2. 驗證環的三條相依邊皆來自原始碼掃描...");
{
  const edges = scanBackendEdges();
  const hasEdge = function (from, to) {
    return edges.some(function (edge) {
      return edge.from === from && edge.to === to;
    });
  };
  assert(hasEdge("databaseInitializer", "activityLogger"), "應掃描到 databaseInitializer → activityLogger");
  assert(hasEdge("activityLogger", "activityLogBuilders"), "應掃描到 activityLogger → activityLogBuilders");
  assert(hasEdge("activityLogBuilders", "databaseInitializer"), "應掃描到 activityLogBuilders → databaseInitializer");
  console.log("   ✓ 三條相依邊來源驗證通過！\n");
}

console.log("3. 反向斷言：人為注入環時無環檢查必須失敗...");
{
  const assertAcyclic = function (edges, label) {
    const cycles = findCycles(edges);
    assert.strictEqual(cycles.length, 0, label + " 應無環，但發現：" + JSON.stringify(cycles));
  };

  const acyclic = [
    { from: "moduleA", to: "moduleB" },
    { from: "moduleB", to: "moduleC" }
  ];
  assertAcyclic(acyclic, "乾淨圖");

  const injected = acyclic.concat([{ from: "moduleC", to: "moduleA" }]);
  assert.throws(
    function () {
      assertAcyclic(injected, "人造環圖");
    },
    /應無環/,
    "人為注入環時，無環檢查必須失敗"
  );
  console.log("   ✓ 人造環反向驗證通過（檢查邏輯非假驗證）\n");
}

console.log("✓ moduleDependencyGraph.test.js 測試全數通過！\n");
