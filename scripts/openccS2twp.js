"use strict";

/**
 * @file openccS2twp.js
 * @description 官方 opencc Node 套件之薄封裝，僅供本機開發與 CI 品質工具使用。
 *              套件採延遲載入與實例快取，載入、建構或轉換失敗皆轉為
 *              OpenCcUnavailableError，由語言檢查器降級處理，不得拖垮既有硬閘門。
 *              本模組不得被 GAS 後端、前端程式或打包產物載入。
 */

/** 官方套件名稱 */
const PACKAGE_NAME = "opencc";

/** 期望套件版本（精確鎖定） */
const PACKAGE_VERSION = "1.4.2";

/** 套件授權 */
const LICENSE = "Apache-2.0";

/** 候選定位設定（字級） */
const CONFIG_S2TW = "s2tw.json";

/** 慣用語建議設定（字級＋片語） */
const CONFIG_S2TWP = "s2twp.json";

/** 可用設定白名單 */
const SUPPORTED_CONFIGS = Object.freeze([CONFIG_S2TW, CONFIG_S2TWP]);

/** 執行期標記，明確僅供 Node 工具鏈 */
const RUNTIME = "node-toolchain-only";

/** 一般不可用診斷碼 */
const CODE_UNAVAILABLE = "OPENCC_UNAVAILABLE";

/** 平台二進位缺失診斷碼 */
const CODE_BINARY_MISSING = "OPENCC_BINARY_MISSING";

/** smoke 黃金案例：s2tw 輸出字級正體 */
const GOLDEN_CASES_S2TW = Object.freeze([
  ["\u9879\u76ee", "\u9805\u76ee"],
  ["\u6570\u636e", "\u6578\u64da"],
  ["\u6743\u9650", "\u6b0a\u9650"],
  ["\u4ec5", "\u50c5"]
]);

/** smoke 黃金案例：s2twp 輸出臺灣慣用語 */
const GOLDEN_CASES_S2TWP = Object.freeze([
  ["\u9879\u76ee", "\u5c08\u6848"],
  ["\u6570\u636e", "\u8cc7\u6599"],
  ["\u6743\u9650", "\u8a31\u53ef\u6b0a"],
  ["\u4ec5", "\u50c5"]
]);

/** smoke 正體不變案例：這些字串不得被 s2tw 改變 */
const INVARIANT_TEXTS = Object.freeze(["\u9805\u76ee", "\u6578\u64da", "\u8ab2\u7a0b\u4ee3\u78bc", "\u6b0a\u9650"]);

/**
 * @description 套件不可用時之結構化錯誤，code 為 OPENCC_UNAVAILABLE 或 OPENCC_BINARY_MISSING。
 */
class OpenCcUnavailableError extends Error {
  /**
   * @param {string} message - 錯誤訊息
   * @param {*} [cause] - 原始錯誤
   * @param {string} [code] - 診斷碼
   */
  constructor(message, cause, code) {
    super(message);
    this.name = "OpenCcUnavailableError";
    this.code = code || CODE_UNAVAILABLE;
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * @description 依原始錯誤判定診斷碼，避免將平台二進位缺失誤報為一般語言問題。
 * @param {*} error - 原始錯誤
 * @returns {string} 診斷碼
 */
function classifyOpenCcError(error) {
  const code = error && error.code;
  const message = error && error.message ? String(error.message) : String(error);
  if (code === "ERR_DLOPEN_FAILED" || message.indexOf("@opencc/opencc-") !== -1) {
    return CODE_BINARY_MISSING;
  }
  return CODE_UNAVAILABLE;
}

/**
 * @description 將任意錯誤轉為結構化不可用錯誤；已是結構化錯誤時原樣回傳。
 * @param {*} error - 原始錯誤
 * @param {string} fallbackMessage - 無錯誤訊息時使用前綴
 * @returns {OpenCcUnavailableError} 結構化錯誤
 */
function toOpenCcError(error, fallbackMessage) {
  if (error instanceof OpenCcUnavailableError) return error;
  const detail = error && error.message ? String(error.message) : String(error);
  return new OpenCcUnavailableError(fallbackMessage + "：" + detail, error, classifyOpenCcError(error));
}

/**
 * @description 解析並驗證轉換設定，未指定時使用 s2twp 做為預設。
 * @param {string} [configName] - 設定檔名稱
 * @returns {string} 白名單內的設定檔名稱
 * @throws {OpenCcUnavailableError} 設定不在白名單時
 */
function resolveConfig(configName) {
  if (configName === undefined || configName === null || configName === "") return CONFIG_S2TWP;
  if (SUPPORTED_CONFIGS.indexOf(configName) !== -1) return configName;
  throw new OpenCcUnavailableError("不支援的 OpenCC 轉換設定：" + String(configName));
}

/**
 * @description 預設延遲載入官方套件；例外由 createConverter 統一封裝。
 * @returns {Function} opencc 建構函式
 */
function defaultLoadOpenCc() {
  return require(PACKAGE_NAME);
}

/**
 * @description 讀取已安裝套件版本，讀取失敗時回傳 null 供降級判斷。
 * @returns {?string} 已安裝版本
 */
function defaultReadVersion() {
  try {
    return require(PACKAGE_NAME + "/package.json").version || null;
  } catch (error) {
    return null;
  }
}

/**
 * @description 建立可注入載入器之轉換模組，供契約測試模擬降級路徑。
 * @param {{loadOpenCc?: Function, readVersion?: Function}} [options] - 選項
 * @returns {{createConverter: Function, convertText: Function, getMetadata: Function}} 轉換模組
 */
function createOpenCcModule(options) {
  const settings = options || {};
  const loadOpenCc = settings.loadOpenCc || defaultLoadOpenCc;
  const readVersion = settings.readVersion || defaultReadVersion;
  const instances = new Map();

  /**
   * @description 取得指定設定的轉換器實例，首次呼叫時才建立並依設定快取。
   * @param {string} [configName] - 設定檔名稱
   * @returns {Object} 具 convertSync 方法之轉換器
   * @throws {OpenCcUnavailableError} 套件或設定不可用時
   */
  function createConverter(configName) {
    const config = resolveConfig(configName);
    if (instances.has(config)) return instances.get(config);

    let OpenCC;
    try {
      OpenCC = loadOpenCc();
    } catch (error) {
      throw toOpenCcError(error, "無法載入 " + PACKAGE_NAME + " 套件");
    }
    if (typeof OpenCC !== "function") {
      throw new OpenCcUnavailableError("套件未匯出可用之建構函式");
    }

    let instance;
    try {
      instance = new OpenCC(config);
    } catch (error) {
      throw toOpenCcError(error, "無法建立 " + config + " 轉換器");
    }
    if (!instance || typeof instance.convertSync !== "function") {
      throw new OpenCcUnavailableError("轉換器缺少 convertSync 方法");
    }

    instances.set(config, instance);
    return instance;
  }

  /**
   * @description 將文字以指定設定轉換為臺灣正體；非字串輸入原值回傳。
   * @param {*} text - 待轉換文字
   * @param {string} [configName] - 設定檔名稱，預設為 s2twp
   * @returns {*} 轉換結果或非字串原值
   * @throws {OpenCcUnavailableError} 套件不可用時
   */
  function convertText(text, configName) {
    if (typeof text !== "string") return text;
    const converter = createConverter(configName);
    try {
      return converter.convertSync(text);
    } catch (error) {
      throw toOpenCcError(error, "OpenCC 轉換失敗");
    }
  }

  /**
   * @description 取得套件中繼資料，供報告與可用性檢查使用。
   * @returns {{packageName: string, expectedVersion: string, installedVersion: ?string, license: string,
   *            s2twConfig: string, s2twpConfig: string, runtime: string, nodeVersion: string}} 中繼資料
   */
  function getMetadata() {
    return {
      packageName: PACKAGE_NAME,
      expectedVersion: PACKAGE_VERSION,
      installedVersion: readVersion(),
      license: LICENSE,
      s2twConfig: CONFIG_S2TW,
      s2twpConfig: CONFIG_S2TWP,
      runtime: RUNTIME,
      nodeVersion: process.version
    };
  }

  return {
    createConverter: createConverter,
    convertText: convertText,
    getMetadata: getMetadata
  };
}

const defaultModule = createOpenCcModule();

/**
 * @description 執行可用性 smoke：版本、兩組黃金案例與正體不變案例皆須通過。
 * @param {{module?: Object}} [options] - 選項，可注入轉換模組
 * @returns {{ok: boolean, metadata: Object}} smoke 結果
 * @throws {OpenCcUnavailableError} 任一案例如失敗
 */
function runSmoke(options) {
  const settings = options || {};
  const module = settings.module || defaultModule;
  const metadata = module.getMetadata();

  if (metadata.installedVersion !== PACKAGE_VERSION) {
    throw new OpenCcUnavailableError(
      "OpenCC 版本不符：預期 " + PACKAGE_VERSION + "，實際 " + String(metadata.installedVersion)
    );
  }

  GOLDEN_CASES_S2TW.forEach(function (item) {
    const actual = module.convertText(item[0], CONFIG_S2TW);
    if (actual !== item[1]) {
      throw new OpenCcUnavailableError("s2tw 黃金案例不符：" + String(actual));
    }
  });

  GOLDEN_CASES_S2TWP.forEach(function (item) {
    const actual = module.convertText(item[0], CONFIG_S2TWP);
    if (actual !== item[1]) {
      throw new OpenCcUnavailableError("s2twp 黃金案例不符：" + String(actual));
    }
  });

  INVARIANT_TEXTS.forEach(function (text) {
    const actual = module.convertText(text, CONFIG_S2TW);
    if (actual !== text) {
      throw new OpenCcUnavailableError("s2tw 正體不變案例不符：" + String(actual));
    }
  });

  return { ok: true, metadata: metadata };
}

/**
 * @description 命令列入口，目前僅支援 `--smoke`；失敗時輸出診斷碼並回非零結束碼。
 * @param {Array<string>} [argv] - 命令列參數
 * @param {{module?: Object, log?: Function, error?: Function}} [options] - 選項
 * @returns {number} 成功為 0，失敗為 1
 */
function main(argv, options) {
  const args = Array.isArray(argv) ? argv : process.argv.slice(2);
  const settings = options || {};
  const log = settings.log || console.log;
  const error = settings.error || console.error;

  if (args.indexOf("--smoke") === -1) {
    error("用法：node scripts/openccS2twp.js --smoke");
    return 1;
  }

  try {
    const result = runSmoke({ module: settings.module || defaultModule });
    log("✓ OpenCC 可用性 smoke 通過（opencc " + result.metadata.installedVersion + "）");
    return 0;
  } catch (caught) {
    const code = caught && caught.code ? caught.code : CODE_UNAVAILABLE;
    const message = caught && caught.message ? caught.message : String(caught);
    error("✗ OpenCC 可用性 smoke 失敗 [" + code + "]：" + message);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  PACKAGE_NAME: PACKAGE_NAME,
  PACKAGE_VERSION: PACKAGE_VERSION,
  LICENSE: LICENSE,
  CONFIG_S2TW: CONFIG_S2TW,
  CONFIG_S2TWP: CONFIG_S2TWP,
  SUPPORTED_CONFIGS: SUPPORTED_CONFIGS,
  RUNTIME: RUNTIME,
  CODE_UNAVAILABLE: CODE_UNAVAILABLE,
  CODE_BINARY_MISSING: CODE_BINARY_MISSING,
  GOLDEN_CASES_S2TW: GOLDEN_CASES_S2TW,
  GOLDEN_CASES_S2TWP: GOLDEN_CASES_S2TWP,
  INVARIANT_TEXTS: INVARIANT_TEXTS,
  OpenCcUnavailableError: OpenCcUnavailableError,
  classifyOpenCcError: classifyOpenCcError,
  toOpenCcError: toOpenCcError,
  resolveConfig: resolveConfig,
  createOpenCcModule: createOpenCcModule,
  createConverter: defaultModule.createConverter,
  convertText: defaultModule.convertText,
  getMetadata: defaultModule.getMetadata,
  runSmoke: runSmoke,
  main: main
};
