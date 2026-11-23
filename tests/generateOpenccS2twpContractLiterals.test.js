"use strict";

/**
 * `scripts/generateOpenccS2twpContractLiterals.js` 契約字面值清冊產生器測試。
 *
 * 覆蓋 AST 字面值提取、豁免註解與跳脫負面字面值排除、解析失敗可見性、
 * 可重複生成、漂移警告與移除閾值，以及產生清冊前後硬閘門違規數不變。
 * 所有簡體負面字面值皆以 Unicode 跳脫或碼位組合表示。
 */

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const generator = require("../scripts/generateOpenccS2twpContractLiterals.js");
const languageCheck = require("../scripts/languageCheck.js");

console.log("開始執行契約字面值清冊產生器測試...\n");

/**
 * @description 建立隔離的臨時目錄。
 * @returns {string} 臨時目錄路徑
 */
function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "opencode-contract-literals-"));
}

/**
 * @description 擷取輸出函式所記錄的訊息。
 * @returns {{lines: string[], capture: Function}} 紀錄陣列與擷取函式
 */
function createCapture() {
  const lines = [];
  return {
    lines: lines,
    capture: function (message) {
      lines.push(message);
    }
  };
}

console.log("1. 常數與中文字／跳脫判定...");
{
  assert.strictEqual(generator.VERSION, 1);
  assert.strictEqual(generator.IGNORE_MARKER, "language-check: ignore");
  assert.strictEqual(generator.containsCjk("契約字面值"), true);
  assert.strictEqual(generator.containsCjk("plain ASCII"), false);
  assert.strictEqual(generator.containsCjk(null), false);
  assert.strictEqual(generator.isEscapedLiteral('"\\u9879\\u76ee"'), true);
  assert.strictEqual(generator.isEscapedLiteral('"\\x5b9e\\x4f8b"'), true);
  assert.strictEqual(generator.isEscapedLiteral('"一般字串"'), false);
  assert.strictEqual(generator.isEscapedLiteral('"路徑 C:\\\\users"'), false);
  assert.strictEqual(generator.isEscapedLiteral(null), false);
  assert.strictEqual(generator.getRaw({ extra: { raw: "`字面值`" } }), "`字面值`");
  assert.strictEqual(generator.getRaw({}), "");
  console.log("   ✓ 常數與判定驗證通過！\n");
}

console.log("2. AST 字面值提取與豁免...");
{
  const tempDir = createTempDir();
  try {
    const source = [
      'const value = "契約字面值";',
      "const pattern = /操作日誌/;",
      'const escaped = "\\u9879\\u76ee";',
      'const ignored = "不應收錄的字串"; // language-check: ignore',
      'const ascii = "ASCII only";'
    ].join("\n");
    const file = path.join(tempDir, "sample.js");
    fs.writeFileSync(file, source, "utf8");
    const lines = source.split(/\r?\n/);
    assert.deepStrictEqual(generator.extractFromFile(file).sort(), ["契約字面值", "操作日誌"]);
    assert.strictEqual(generator.isIgnoredLine({ loc: { start: { line: 4 } } }, lines), true);
    assert.strictEqual(generator.isIgnoredLine({ loc: { start: { line: 1 } } }, lines), false);
    assert.strictEqual(generator.isIgnoredLine({}, lines), false);
    assert.strictEqual(generator.isIgnoredLine(null, lines), false);
    const found = new Set();
    generator.visitNode(null, lines, found);
    generator.visitNode([], lines, found);
    generator.visitNode({ type: "Identifier", name: "x" }, lines, found);
    assert.strictEqual(found.size, 0);
    console.log("   ✓ AST 提取與豁免驗證通過！\n");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log("3. 遞迴收集與解析失敗可見性...");
{
  const tempDir = createTempDir();
  try {
    fs.mkdirSync(path.join(tempDir, "nested"));
    fs.writeFileSync(path.join(tempDir, "b.js"), 'const b = "操作日誌";\n', "utf8");
    fs.writeFileSync(path.join(tempDir, "nested", "a.js"), 'const a = "契約字面值";\n', "utf8");
    fs.writeFileSync(path.join(tempDir, "nested", "skip.txt"), "忽略此檔", "utf8");
    const files = generator.collectTestFiles(tempDir);
    assert.strictEqual(files.length, 2);
    assert.ok(files[0].endsWith("b.js"));
    assert.ok(files[1].endsWith(path.join("nested", "a.js")));

    const broken = path.join(tempDir, "broken.js");
    fs.writeFileSync(broken, "const value = ;\n", "utf8");
    const failures = [];
    assert.deepStrictEqual(generator.extractFromFile(broken, failures), []);
    assert.strictEqual(failures.length, 1);
    assert.ok(failures[0].file.endsWith("broken.js"));
    assert.ok(failures[0].message.length > 0);
    assert.deepStrictEqual(generator.extractFromFile(broken, null), []);
    const status = generator.collectContractLiteralsWithStatus(tempDir);
    assert.ok(status.literals.includes("契約字面值"));
    assert.strictEqual(status.parseFailures.length, 1);
    assert.deepStrictEqual(generator.collectTestFiles(path.join(tempDir, "不存在")), []);
    console.log("   ✓ 遞迴收集與解析失敗驗證通過！\n");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log("4. 清冊讀寫、可重複生成與硬閘門違規數不變...");
{
  const tempDir = createTempDir();
  try {
    const manifestPath = path.join(tempDir, "scripts", "openccS2twpContractLiterals.json");
    assert.strictEqual(generator.main([], { outputPath: manifestPath, log: function () {} }), 0);
    const first = fs.readFileSync(manifestPath, "utf8");
    assert.strictEqual(generator.main([], { outputPath: manifestPath, log: function () {} }), 0);
    assert.strictEqual(fs.readFileSync(manifestPath, "utf8"), first);
    assert.ok(generator.readManifest(manifestPath).length > 0);
    assert.deepStrictEqual(generator.readManifest(path.join(tempDir, "不存在.json")), []);

    const bytes = generator.writeManifest(["甲", "乙"], path.join(tempDir, "nested", "manifest.json"));
    assert.ok(bytes > 0);
    assert.deepStrictEqual(generator.readManifest(path.join(tempDir, "nested", "manifest.json")), ["甲", "乙"]);
    fs.writeFileSync(path.join(tempDir, "invalid.json"), "not json", "utf8");
    assert.deepStrictEqual(generator.readManifest(path.join(tempDir, "invalid.json")), []);
    fs.writeFileSync(path.join(tempDir, "wrong-shape.json"), '{"version":1}', "utf8");
    assert.deepStrictEqual(generator.readManifest(path.join(tempDir, "wrong-shape.json")), []);

    const projectDir = createTempDir();
    try {
      const testDir = path.join(projectDir, "tests");
      fs.mkdirSync(testDir);
      const simplified = String.fromCharCode(0x9879);
      fs.writeFileSync(path.join(testDir, "bad.js"), 'const value = "' + simplified + '";\n', "utf8");
      const before = languageCheck.checkProject(projectDir);
      assert.ok(before.length > 0, "基準違規數應大於零");
      generator.writeManifest(["契約字面值"], path.join(projectDir, "scripts", "openccS2twpContractLiterals.json"));
      assert.strictEqual(languageCheck.checkProject(projectDir).length, before.length);
    } finally {
      fs.rmSync(projectDir, { recursive: true, force: true });
    }

    const brokenDir = path.join(tempDir, "broken-tests");
    fs.mkdirSync(brokenDir);
    fs.writeFileSync(path.join(brokenDir, "broken.js"), "const value = ;\n", "utf8");
    const error = createCapture();
    assert.strictEqual(
      generator.main([], { testsDir: brokenDir, outputPath: manifestPath, error: error.capture, log: function () {} }),
      1
    );
    assert.ok(
      error.lines.some(function (line) {
        return line.includes("契約字面值解析失敗");
      })
    );
    console.log("   ✓ 重複生成、讀寫與違規數不變驗證通過！\n");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log("5. --check 漂移警告與移除閾值...");
{
  const tempDir = createTempDir();
  try {
    const testsDir = path.join(tempDir, "tests");
    fs.mkdirSync(testsDir);
    fs.writeFileSync(path.join(testsDir, "current.js"), 'const value = "契約字面值";\n', "utf8");
    const manifestPath = path.join(tempDir, "manifest.json");
    generator.writeManifest(["舊有字面值"], manifestPath);

    const log = createCapture();
    const error = createCapture();
    assert.strictEqual(
      generator.main(["--check"], {
        testsDir: testsDir,
        outputPath: manifestPath,
        log: log.capture,
        error: error.capture
      }),
      0
    );
    assert.ok(
      log.lines.some(function (line) {
        return line.includes("新增：契約字面值");
      })
    );
    assert.ok(
      log.lines.some(function (line) {
        return line.includes("目前字面值筆數：1");
      })
    );
    assert.deepStrictEqual(error.lines, []);

    generator.writeManifest(["契約字面值"], manifestPath);
    const noDrift = createCapture();
    assert.strictEqual(
      generator.main(["--check"], { testsDir: testsDir, outputPath: manifestPath, log: noDrift.capture }),
      0
    );
    assert.ok(noDrift.lines.includes("契約字面值清冊無漂移。"));

    const fewRemovals = ["契約字面值"];
    for (let index = 0; index < 4; index += 1) fewRemovals.push("額外字面值" + index);
    generator.writeManifest(fewRemovals, manifestPath);
    const smallRemoval = createCapture();
    assert.strictEqual(
      generator.main(["--check"], { testsDir: testsDir, outputPath: manifestPath, log: smallRemoval.capture }),
      0
    );
    assert.ok(
      smallRemoval.lines.some(function (line) {
        return line.includes("契約字面值清冊漂移警告");
      })
    );

    const many = [];
    for (let index = 0; index < 20; index += 1) many.push("字面值" + index);
    generator.writeManifest(many, manifestPath);
    const errorOnRemoval = createCapture();
    assert.strictEqual(
      generator.main(["--check"], {
        testsDir: testsDir,
        outputPath: manifestPath,
        log: function () {},
        error: errorOnRemoval.capture
      }),
      1
    );
    assert.ok(
      errorOnRemoval.lines.some(function (line) {
        return line.includes("契約字面值大量移除 20 筆（閾值 10）");
      })
    );

    const brokenDir = path.join(tempDir, "broken-tests");
    fs.mkdirSync(brokenDir);
    fs.writeFileSync(path.join(brokenDir, "broken.js"), "const value = ;\n", "utf8");
    const errorOnParse = createCapture();
    assert.strictEqual(
      generator.main(["--check"], {
        testsDir: brokenDir,
        outputPath: manifestPath,
        log: function () {},
        error: errorOnParse.capture
      }),
      1
    );
    assert.ok(
      errorOnParse.lines.some(function (line) {
        return line.includes("契約字面值解析失敗");
      })
    );

    assert.deepStrictEqual(generator.compareWithManifest([], []), {
      drifted: false,
      added: [],
      removed: []
    });
    assert.strictEqual(generator.compareWithManifest(undefined, ["甲"]).drifted, true);
    const defaultManifestResult = generator.compareWithManifest(["甲"], undefined);
    assert.strictEqual(typeof defaultManifestResult.drifted, "boolean");
    assert.ok(Array.isArray(defaultManifestResult.added));
    console.log("   ✓ 漂移警告與移除閾值驗證通過！\n");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

console.log("✓ 契約字面值清冊產生器測試全數通過！\n");
