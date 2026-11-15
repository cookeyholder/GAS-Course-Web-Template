#!/usr/bin/env node
/**
 * 將 webapp/ 靜態前端內嵌為 GAS HtmlService 可用的單一 index.html。
 *
 * - 讀取 webapp/index.html 作為樣板
 * - 以 webapp/styles.css 內容取代 <!-- BUILD:CSS --> 區塊
 * - 依 <!-- BUILD:JS --> 區塊中的 <script src> 順序內嵌 JS
 * - 跳脫 </script 避免提前結束 script 標籤
 *
 * 用法：node scripts/build-webapp.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const TEMPLATE = path.join(ROOT, "webapp", "index.html");
const OUTPUT = path.join(ROOT, "index.html");

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function escapeScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}

function build() {
  if (!fs.existsSync(TEMPLATE)) {
    throw new Error("找不到前端樣板：" + TEMPLATE);
  }

  let html = read(TEMPLATE);

  const cssBlock = /<!-- BUILD:CSS -->([\s\S]*?)<!-- \/BUILD:CSS -->/;
  if (!cssBlock.test(html)) {
    throw new Error("index.html 缺少 BUILD:CSS 標記");
  }
  const css = read(path.join(ROOT, "webapp", "styles.css"));
  html = html.replace(cssBlock, function () {
    return "<style>\n" + css.trim() + "\n</style>";
  });

  const jsBlock = /<!-- BUILD:JS -->([\s\S]*?)<!-- \/BUILD:JS -->/;
  const match = html.match(jsBlock);
  if (!match) {
    throw new Error("index.html 缺少 BUILD:JS 標記");
  }

  const scripts = [];
  const scriptTag = /<script\s+src="([^"]+)"\s*><\/script>/g;
  let item;
  while ((item = scriptTag.exec(match[1])) !== null) {
    const relative = item[1];
    const file = path.join(ROOT, "webapp", relative);
    if (!fs.existsSync(file)) {
      throw new Error("找不到前端腳本：" + file);
    }
    scripts.push({ relative: relative, source: read(file) });
  }

  if (scripts.length === 0) {
    throw new Error("BUILD:JS 區塊中沒有任何 <script src>");
  }

  const inline = scripts.map(function (script) {
    return "  <script>\n/* " + script.relative + " */\n" + escapeScript(script.source.trim()) + "\n  </script>";
  }).join("\n");

  html = html.replace(jsBlock, function () {
    return inline;
  });

  html = html.replace(
    "<head>",
    "<head>\n  <!-- 本檔由 scripts/build-webapp.js 自動產生，請勿直接編輯；請修改 webapp/ 後重新建置 -->"
  );

  fs.writeFileSync(OUTPUT, html, "utf8");
  return {
    output: OUTPUT,
    bytes: Buffer.byteLength(html, "utf8"),
    scripts: scripts.map(function (script) { return script.relative; })
  };
}

if (require.main === module) {
  try {
    const result = build();
    console.log("已產生 " + path.relative(ROOT, result.output)
      + "（" + result.bytes.toLocaleString("en-US") + " bytes，內嵌 "
      + result.scripts.length + " 個腳本）");
    console.log("腳本順序：" + result.scripts.join(" → "));
  } catch (error) {
    console.error("[build-webapp] " + (error && error.message ? error.message : error));
    process.exitCode = 1;
  }
}

module.exports = { build: build };
