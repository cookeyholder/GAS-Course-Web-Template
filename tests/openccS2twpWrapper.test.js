"use strict";

/**
 * `scripts/openccS2twp.js` 外殼契約測試。
 *
 * 覆蓋延遲載入、依設定快取、兩組黃金案例、正體不變、非字串原值回傳、
 * 三類降級路徑、版本／設定驗證、smoke 與命令列結束碼。
 * 所有簡體字與中國用語以 Unicode 跳脫表示，避免測試檔自身命中硬閘門。
 */

const assert = require("assert");
const childProcess = require("child_process");
const path = require("path");
const converter = require("../scripts/openccS2twp.js");

const S2TW = converter.CONFIG_S2TW;
const S2TWP = converter.CONFIG_S2TWP;
const SIMPLIFIED_PROJECT = "\u9879\u76ee";
const TRADITIONAL_PROJECT = "\u9805\u76ee";
const S2TWP_PROJECT = "\u5c08\u6848";

console.log("開始執行 OpenCC 外殼契約測試...\n");

console.log("1. 常數與中繼資料...");
{
  assert.strictEqual(converter.PACKAGE_NAME, "opencc");
  assert.strictEqual(converter.PACKAGE_VERSION, "1.4.2");
  assert.strictEqual(converter.LICENSE, "Apache-2.0");
  assert.strictEqual(S2TW, "s2tw.json");
  assert.strictEqual(S2TWP, "s2twp.json");
  assert.deepStrictEqual(Array.from(converter.SUPPORTED_CONFIGS), [S2TW, S2TWP]);
  assert.strictEqual(converter.RUNTIME, "node-toolchain-only");

  const metadata = converter.getMetadata();
  assert.strictEqual(metadata.packageName, "opencc");
  assert.strictEqual(metadata.expectedVersion, "1.4.2");
  assert.strictEqual(metadata.installedVersion, "1.4.2");
  assert.strictEqual(metadata.license, "Apache-2.0");
  assert.strictEqual(metadata.s2twConfig, "s2tw.json");
  assert.strictEqual(metadata.s2twpConfig, "s2twp.json");
  assert.strictEqual(metadata.runtime, "node-toolchain-only");
  assert.match(metadata.nodeVersion, /^v\d+\./);

  const missing = converter.createOpenCcModule({
    readVersion: function () {
      return null;
    }
  });
  assert.strictEqual(missing.getMetadata().installedVersion, null);
  console.log("   ✓ 常數與中繼資料驗證通過！\n");
}

console.log("2. 兩組黃金案例、預設設定與冪等...");
{
  assert.strictEqual(converter.GOLDEN_CASES_S2TW.length, 4);
  assert.strictEqual(converter.GOLDEN_CASES_S2TWP.length, 4);
  assert.strictEqual(converter.INVARIANT_TEXTS.length, 4);
  converter.GOLDEN_CASES_S2TW.forEach(function (item) {
    assert.strictEqual(converter.convertText(item[0], S2TW), item[1]);
  });
  converter.GOLDEN_CASES_S2TWP.forEach(function (item) {
    assert.strictEqual(converter.convertText(item[0], S2TWP), item[1]);
  });
  assert.strictEqual(converter.convertText(SIMPLIFIED_PROJECT, S2TW), TRADITIONAL_PROJECT);
  assert.strictEqual(converter.convertText(SIMPLIFIED_PROJECT, S2TWP), S2TWP_PROJECT);
  assert.strictEqual(converter.convertText(SIMPLIFIED_PROJECT), S2TWP_PROJECT, "未指定設定時使用 s2twp");

  [S2TW, S2TWP].forEach(function (config) {
    const once = converter.convertText(SIMPLIFIED_PROJECT, config);
    assert.strictEqual(converter.convertText(once, config), once, "重複轉換應冪等：" + config);
  });
  converter.INVARIANT_TEXTS.forEach(function (text) {
    assert.strictEqual(converter.convertText(text, S2TW), text, "正體字在 s2tw 下應不變");
  });
  console.log("   ✓ 黃金案例、預設設定與冪等驗證通過！\n");
}

console.log("3. 非字串輸入原值回傳...");
{
  const objectInput = { value: SIMPLIFIED_PROJECT };
  const arrayInput = [SIMPLIFIED_PROJECT];
  [null, undefined, 42, true, objectInput, arrayInput].forEach(function (input) {
    assert.strictEqual(converter.convertText(input, S2TW), input);
  });
  assert.strictEqual(converter.convertText("", S2TW), "");
  console.log("   ✓ 非字串原值回傳驗證通過！\n");
}

console.log("4. 延遲載入與依設定快取...");
{
  const calls = { load: 0, construct: [] };
  function FakeOpenCC(config) {
    calls.construct.push(config);
    this.config = config;
    this.convertSync = function (text) {
      return text + ":" + config;
    };
  }
  const mod = converter.createOpenCcModule({
    loadOpenCc: function () {
      calls.load += 1;
      return FakeOpenCC;
    }
  });
  assert.strictEqual(calls.load, 0, "模組建立時不得載入套件");
  assert.strictEqual(calls.construct.length, 0, "模組建立時不得建立轉換器");
  const first = mod.createConverter(S2TW);
  assert.strictEqual(mod.createConverter(S2TW), first);
  assert.strictEqual(calls.load, 1);
  assert.strictEqual(calls.construct.length, 1);
  const second = mod.createConverter(S2TWP);
  assert.notStrictEqual(second, first);
  assert.strictEqual(calls.load, 2);
  assert.strictEqual(calls.construct.length, 2);
  assert.strictEqual(mod.convertText("abc", S2TW), "abc:" + S2TW);
  assert.strictEqual(calls.load, 2, "convertText 應沿用快取實例");
  console.log("   ✓ 延遲載入與快取驗證通過！\n");
}

console.log("5. 載入、建構與轉換三類降級路徑...");
{
  const loadError = new Error("套件遺失");
  const loadFailure = converter.createOpenCcModule({
    loadOpenCc: function () {
      throw loadError;
    }
  });
  assert.throws(
    function () {
      loadFailure.createConverter(S2TW);
    },
    function (error) {
      return (
        error instanceof converter.OpenCcUnavailableError &&
        error.code === converter.CODE_UNAVAILABLE &&
        error.cause === loadError &&
        error.message.indexOf("無法載入") !== -1
      );
    }
  );

  const plainFailure = converter.createOpenCcModule({
    loadOpenCc: function () {
      throw "純字串例外";
    }
  });
  assert.throws(
    function () {
      plainFailure.convertText("abc", S2TW);
    },
    function (error) {
      return error.code === converter.CODE_UNAVAILABLE && error.message.indexOf("純字串例外") !== -1;
    }
  );

  const original = new converter.OpenCcUnavailableError(" already ", undefined, "CUSTOM_CODE");
  const passthrough = converter.createOpenCcModule({
    loadOpenCc: function () {
      throw original;
    }
  });
  assert.throws(
    function () {
      passthrough.createConverter(S2TW);
    },
    function (error) {
      return error === original && error.code === "CUSTOM_CODE";
    }
  );

  const notAFunction = converter.createOpenCcModule({
    loadOpenCc: function () {
      return {};
    }
  });
  assert.throws(
    function () {
      notAFunction.createConverter(S2TW);
    },
    function (error) {
      return error instanceof converter.OpenCcUnavailableError && error.message.indexOf("建構函式") !== -1;
    }
  );

  const binaryErrorA = new Error("dlopen 失敗");
  binaryErrorA.code = "ERR_DLOPEN_FAILED";
  const binaryFailureA = converter.createOpenCcModule({
    loadOpenCc: function () {
      function Broken() {
        throw binaryErrorA;
      }
      return Broken;
    }
  });
  assert.throws(
    function () {
      binaryFailureA.createConverter(S2TWP);
    },
    function (error) {
      return error.code === converter.CODE_BINARY_MISSING && error.cause === binaryErrorA;
    }
  );

  const binaryErrorB = new Error("找不到 @opencc/opencc-linux-x64");
  const binaryFailureB = converter.createOpenCcModule({
    loadOpenCc: function () {
      function Broken() {
        throw binaryErrorB;
      }
      return Broken;
    }
  });
  assert.throws(
    function () {
      binaryFailureB.createConverter(S2TW);
    },
    function (error) {
      return error.code === converter.CODE_BINARY_MISSING;
    }
  );

  const missingMethod = converter.createOpenCcModule({
    loadOpenCc: function () {
      return function Incomplete() {
        return {};
      };
    }
  });
  assert.throws(
    function () {
      missingMethod.convertText("abc", S2TW);
    },
    function (error) {
      return error.code === converter.CODE_UNAVAILABLE && error.message.indexOf("convertSync") !== -1;
    }
  );

  const convertError = new Error("轉換失敗");
  const convertFailure = converter.createOpenCcModule({
    loadOpenCc: function () {
      function Broken() {
        this.convertSync = function () {
          throw convertError;
        };
      }
      return Broken;
    }
  });
  assert.throws(
    function () {
      convertFailure.convertText("abc", S2TW);
    },
    function (error) {
      return error.code === converter.CODE_UNAVAILABLE && error.cause === convertError;
    }
  );

  const structured = new converter.OpenCcUnavailableError("內部錯誤", undefined, converter.CODE_BINARY_MISSING);
  const structuredFailure = converter.createOpenCcModule({
    loadOpenCc: function () {
      function Broken() {
        this.convertSync = function () {
          throw structured;
        };
      }
      return Broken;
    }
  });
  assert.throws(
    function () {
      structuredFailure.convertText("abc", S2TW);
    },
    function (error) {
      return error === structured;
    }
  );
  console.log("   ✓ 三類降級路徑與診斷碼驗證通過！\n");
}

console.log("6. 設定白名單與診斷碼分類...");
{
  assert.strictEqual(converter.resolveConfig(), S2TWP);
  assert.strictEqual(converter.resolveConfig(null), S2TWP);
  assert.strictEqual(converter.resolveConfig(""), S2TWP);
  assert.strictEqual(converter.resolveConfig(S2TW), S2TW);
  assert.strictEqual(converter.resolveConfig(S2TWP), S2TWP);
  assert.throws(
    function () {
      converter.resolveConfig("unknown.json");
    },
    function (error) {
      return error instanceof converter.OpenCcUnavailableError && error.message.indexOf("不支援") !== -1;
    }
  );
  assert.throws(
    function () {
      converter.createConverter("unknown.json");
    },
    function (error) {
      return error.code === converter.CODE_UNAVAILABLE;
    }
  );
  assert.throws(
    function () {
      converter.convertText("abc", "unknown.json");
    },
    function (error) {
      return error.code === converter.CODE_UNAVAILABLE;
    }
  );

  const dlopen = { code: "ERR_DLOPEN_FAILED", message: "x" };
  assert.strictEqual(converter.classifyOpenCcError(dlopen), converter.CODE_BINARY_MISSING);
  assert.strictEqual(
    converter.classifyOpenCcError(new Error("缺少 @opencc/opencc-darwin-arm64")),
    converter.CODE_BINARY_MISSING
  );
  assert.strictEqual(converter.classifyOpenCcError(new Error("其他")), converter.CODE_UNAVAILABLE);
  assert.strictEqual(converter.classifyOpenCcError(null), converter.CODE_UNAVAILABLE);
  console.log("   ✓ 設定白名單與診斷碼驗證通過！\n");
}

console.log("7. smoke 黃金案例與版本核對...");
{
  const result = converter.runSmoke();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.metadata.installedVersion, "1.4.2");

  function makeModule(overrides) {
    const settings = overrides || {};
    return {
      getMetadata: function () {
        if (settings.badVersion) {
          const metadata = converter.getMetadata();
          metadata.installedVersion = "0.0.0";
          return metadata;
        }
        if (settings.metadataError) throw settings.metadataError;
        return converter.getMetadata();
      },
      convertText: function (text, config) {
        if (settings.badS2tw && config === S2TW && text === converter.GOLDEN_CASES_S2TW[0][0]) return "\u0000";
        if (settings.badS2twp && config === S2TWP && text === converter.GOLDEN_CASES_S2TWP[0][0]) return "\u0000";
        if (settings.badInvariant && config === S2TW && text === converter.INVARIANT_TEXTS[0]) return "\u0000";
        return converter.convertText(text, config);
      }
    };
  }

  assert.throws(
    function () {
      converter.runSmoke({ module: makeModule({ badVersion: true }) });
    },
    function (error) {
      return error.code === converter.CODE_UNAVAILABLE && error.message.indexOf("版本不符") !== -1;
    }
  );
  [
    [{ badS2tw: true }, "s2tw 黃金案例不符"],
    [{ badS2twp: true }, "s2twp 黃金案例不符"],
    [{ badInvariant: true }, "s2tw 正體不變案例不符"]
  ].forEach(function (item) {
    assert.throws(
      function () {
        converter.runSmoke({ module: makeModule(item[0]) });
      },
      function (error) {
        return error.code === converter.CODE_UNAVAILABLE && error.message.indexOf(item[1]) !== -1;
      }
    );
  });
  assert.strictEqual(converter.runSmoke({ module: makeModule() }).ok, true);
  console.log("   ✓ smoke 案例與版本核對驗證通過！\n");
}

console.log("8. 命令列結束碼與真實 smoke...");
{
  const logs = { out: [], err: [] };
  const log = function (text) {
    logs.out.push(text);
  };
  const error = function (text) {
    logs.err.push(text);
  };
  const options = { log: log, error: error };

  assert.strictEqual(converter.main([], options), 1);
  assert.ok(logs.err[0].indexOf("用法") !== -1);
  assert.strictEqual(converter.main(["--smoke"], options), 0);
  assert.ok(logs.out[0].indexOf("smoke 通過") !== -1);

  const failingModule = {
    getMetadata: function () {
      return converter.getMetadata();
    },
    convertText: function () {
      throw new converter.OpenCcUnavailableError("人為失敗");
    }
  };
  logs.err.length = 0;
  assert.strictEqual(converter.main(["--smoke", "--other"], { module: failingModule, log: log, error: error }), 1);
  assert.ok(logs.err[0].indexOf("[" + converter.CODE_UNAVAILABLE + "]") !== -1);

  const unexpected = {
    getMetadata: function () {
      throw new Error("非預期錯誤");
    }
  };
  logs.err.length = 0;
  assert.strictEqual(converter.main(["--smoke"], { module: unexpected, log: log, error: error }), 1);
  assert.ok(logs.err[0].indexOf("[" + converter.CODE_UNAVAILABLE + "]") !== -1);

  const script = path.join(__dirname, "..", "scripts", "openccS2twp.js");
  const spawned = childProcess.spawnSync(process.execPath, [script, "--smoke"], { encoding: "utf8" });
  assert.strictEqual(spawned.status, 0, "真實 smoke 應回 0，stderr：" + spawned.stderr);
  assert.ok(spawned.stdout.indexOf("smoke 通過") !== -1);
  console.log("   ✓ 命令列結束碼與真實 smoke 驗證通過！\n");
}

console.log("✓ OpenCC 外殼契約測試全數通過！\n");
