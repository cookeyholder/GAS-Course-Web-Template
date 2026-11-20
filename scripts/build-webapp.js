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
const CSS_BLOCK = /<!-- BUILD:CSS -->([\s\S]*?)<!-- \/BUILD:CSS -->/;
const JS_BLOCK = /<!-- BUILD:JS -->([\s\S]*?)<!-- \/BUILD:JS -->/;
const SCRIPT_TAG = /<script\s+src="([^"]+)"\s*><\/script>/g;
const BUILD_COMMENT = "<!-- 本檔由 scripts/build-webapp.js 自動產生，請勿直接編輯；請修改 webapp/ 後重新建置 -->";
const PRODUCTION_FLAG = "<script>window.MEA_PRODUCTION_BUILD = true;</script>";
/** 後端可讀取的版本來源檔名，需隨 npm run push 上傳至 GAS。 */
const VERSION_GENERATED_FILE = "version.generated.js";
/** 版本來源全域變數名稱，前端與後端共用。 */
const VERSION_GLOBAL_NAME = "__PACKAGE_VERSION__";

/**
 * 跳脫腳本內容中的結尾標籤。
 *
 * @param {string} source - 原始腳本內容
 * @returns {string} 跳脫後內容
 */
function escapeScript(source) {
  return source.replace(/<\/script/gi, "<\\/script");
}

/**
 * 建立可注入路徑與檔案系統的建置器。
 *
 * @param {Object} [options] - root、template、css、webappDir、output 與 fs
 * @returns {{build: Function}} 建置介面
 */
function createBuilder(options) {
  const settings = options || {};
  const fsApi = settings.fs || fs;
  const root = settings.root || ROOT;
  const templatePath = settings.template || path.join(root, "webapp", "index.html");
  const cssPath = settings.css || path.join(root, "webapp", "styles.css");
  const webappDir = settings.webappDir || path.join(root, "webapp");
  const outputPath = settings.output || path.join(root, "index.html");
  const packagePath = settings.package || path.join(root, "package.json");
  const versionGeneratedPath = settings.versionGenerated || path.join(root, VERSION_GENERATED_FILE);

  function read(file) {
    return fsApi.readFileSync(file, "utf8");
  }

  /**
   * 由 package.json 讀取版本號（版本號單一來源，task 5.1）。
   *
   * @returns {string} 套件版本號
   */
  function readPackageVersion() {
    if (!fsApi.existsSync(packagePath)) {
      throw new Error("找不到 package.json：" + packagePath);
    }
    let parsed;
    try {
      parsed = JSON.parse(read(packagePath));
    } catch (error) {
      throw new Error("package.json 格式錯誤：" + packagePath);
    }
    const version = parsed && parsed.version;
    if (typeof version !== "string" || version.trim() === "") {
      throw new Error("package.json 缺少有效的 version 欄位：" + packagePath);
    }
    return version.trim();
  }

  /**
   * 產生後端可讀取的版本來源檔（GAS 全域掛載 + Node 匯出）。
   *
   * @param {string} version - 套件版本號
   * @returns {string} 版本模組原始碼
   */
  function buildVersionSource(version) {
    return [
      "/**",
      " * 由 scripts/build-webapp.js 從 package.json 產生，請勿直接編輯。",
      " * 後端可讀取的版本來源（task 5.1）；GAS 全域掛載，Node 由 module.exports 匯出。",
      " */",
      '"use strict";',
      "",
      "const PACKAGE_VERSION = " + JSON.stringify(version) + ";",
      "",
      'if (typeof module !== "undefined" && module.exports) module.exports = { PACKAGE_VERSION: PACKAGE_VERSION };',
      'if (typeof globalThis !== "undefined") globalThis.' + VERSION_GLOBAL_NAME + " = PACKAGE_VERSION;",
      ""
    ].join("\n");
  }

  /**
   * 注入前端版本全域標記（task 5.1）。
   *
   * @param {string} html - 原始 HTML
   * @param {string} version - 套件版本號
   * @returns {string} 注入後的 HTML
   */
  function insertVersionFlag(html, version) {
    const flag = "<script>window." + VERSION_GLOBAL_NAME + " = " + JSON.stringify(version) + ";</script>";
    return html.replace("<head>", "<head>\n  " + flag);
  }

  function readTemplate() {
    if (!fsApi.existsSync(templatePath)) {
      throw new Error("找不到前端樣板：" + templatePath);
    }
    return read(templatePath);
  }

  function replaceCss(html) {
    if (!CSS_BLOCK.test(html)) {
      throw new Error("index.html 缺少 BUILD:CSS 標記");
    }
    const css = read(cssPath);
    return html.replace(CSS_BLOCK, function () {
      return "<style>\n" + css.trim() + "\n</style>";
    });
  }

  function collectScripts(source) {
    const scripts = [];
    const scriptTag = new RegExp(SCRIPT_TAG.source, "gi");
    let item;
    while ((item = scriptTag.exec(source)) !== null) {
      const relative = item[1];
      const file = path.join(webappDir, relative);
      if (!fsApi.existsSync(file)) {
        throw new Error("找不到前端腳本：" + file);
      }
      scripts.push({ relative: relative, source: read(file) });
    }
    return scripts;
  }

  function inlineScripts(scripts) {
    return scripts
      .map(function (script) {
        return "  <script>\n/* " + script.relative + " */\n" + escapeScript(script.source.trim()) + "\n  </script>";
      })
      .join("\n");
  }

  function replaceJs(html, match) {
    const scripts = collectScripts(match[1]);
    if (scripts.length === 0) {
      throw new Error("BUILD:JS 區塊中沒有任何 <script src>");
    }
    return {
      html: html.replace(JS_BLOCK, function () {
        return inlineScripts(scripts);
      }),
      scripts: scripts
    };
  }

  function insertBuildComment(html) {
    return html.replace("<head>", "<head>\n  " + BUILD_COMMENT);
  }

  /** 標記此檔為正式建置產物；前端 config.js 據此忽略 ?mock=true。 */
  function insertProductionFlag(html) {
    return html.replace("<head>", "<head>\n  " + PRODUCTION_FLAG);
  }

  function build() {
    const version = readPackageVersion();
    let html = readTemplate();
    html = replaceCss(html);

    const match = html.match(JS_BLOCK);
    if (!match) {
      throw new Error("index.html 缺少 BUILD:JS 標記");
    }

    const jsResult = replaceJs(html, match);
    html = insertVersionFlag(insertProductionFlag(insertBuildComment(jsResult.html)), version);
    fsApi.mkdirSync(path.dirname(outputPath), { recursive: true });
    fsApi.writeFileSync(outputPath, html, "utf8");
    // 後端可讀取的版本來源需與前端同一版本，並隨 push 上傳（task 5.1）。
    fsApi.writeFileSync(versionGeneratedPath, buildVersionSource(version), "utf8");

    return {
      output: outputPath,
      version: version,
      versionGenerated: versionGeneratedPath,
      bytes: Buffer.byteLength(html, "utf8"),
      scripts: jsResult.scripts.map(function (script) {
        return script.relative;
      })
    };
  }

  return { build: build };
}

/**
 * 建置前端單檔；傳入 options 可改變輸出位置，供測試隔離使用。
 *
 * @param {Object} [options] - 建置選項
 * @returns {{output: string, bytes: number, scripts: string[]}} 建置結果
 */
function build(options) {
  return createBuilder(options).build();
}

if (require.main === module) {
  try {
    const result = build();
    console.log(
      "已產生 " +
        path.relative(ROOT, result.output) +
        "（" +
        result.bytes.toLocaleString("en-US") +
        " bytes，內嵌 " +
        result.scripts.length +
        " 個腳本）"
    );
    console.log("腳本順序：" + result.scripts.join(" → "));
    console.log("套件版本：" + result.version + "（後端來源：" + path.relative(ROOT, result.versionGenerated) + "）");
  } catch (error) {
    console.error("[build-webapp] " + (error && error.message ? error.message : error));
    process.exitCode = 1;
  }
}

module.exports = {
  build: build,
  createBuilder: createBuilder,
  escapeScript: escapeScript,
  VERSION_GENERATED_FILE: VERSION_GENERATED_FILE,
  VERSION_GLOBAL_NAME: VERSION_GLOBAL_NAME
};
