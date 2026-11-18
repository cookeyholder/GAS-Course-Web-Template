"use strict";

/**
 * @file deploy.js
 * @description 輔助部署腳本：建置前端、推送至 Apps Script，並以固定 Deployment ID
 *              或新部署方式發布 Web App。
 *
 * 使用方式：
 *   node scripts/deploy.js
 *   node scripts/deploy.js --deployment-id <DEPLOYMENT_ID>
 *   node scripts/deploy.js -i <DEPLOYMENT_ID> -d "版本說明"
 *   CLASP_DEPLOYMENT_ID=<DEPLOYMENT_ID> npm run deploy
 *
 * 選項：
 *   --deployment-id, -i  指定既有 Deployment ID（維持固定 Web App 網址）
 *   --description, -d    部署說明文字
 *   --no-push            略過建置與推送（僅執行 clasp deploy）
 *   --help, -h           顯示說明
 */

const { spawnSync } = require("child_process");

const DEPLOYMENT_ID_NAMES = ["--deployment-id", "-i"];
const DESCRIPTION_NAMES = ["--description", "-d"];
const HELP_NAMES = ["--help", "-h"];
const NO_PUSH_NAMES = ["--no-push"];
const DEFAULT_DESCRIPTION = "Web App 部署";

/**
 * 比對單一參數是否為指定旗標或等號形式。
 *
 * @param {string} arg - 目前參數
 * @param {string[]} names - 可接受之旗標名稱
 * @returns {{name: string, inline: boolean}|null} 比對結果
 */
function matchArgName(arg, names) {
  const candidates = Array.isArray(names) ? names : [];
  for (let index = 0; index < candidates.length; index += 1) {
    const name = candidates[index];
    if (arg === name) return { name: name, inline: false };
    if (arg.indexOf(name + "=") === 0) return { name: name, inline: true };
  }
  return null;
}

/**
 * 由命令列參數取得旗標值，支援 `-i VALUE` 與 `-i=VALUE` 兩種形式。
 *
 * @param {string[]} argv - 命令列參數
 * @param {string[]} names - 可接受之旗標名稱
 * @returns {string} 旗標值；不存在時為空字串
 */
function getArgValue(argv, names) {
  const args = Array.isArray(argv) ? argv : [];
  for (let index = 0; index < args.length; index += 1) {
    const match = matchArgName(args[index], names);
    if (!match) continue;
    return match.inline ? args[index].slice(match.name.length + 1) : args[index + 1] || "";
  }
  return "";
}

function hasFlag(argv, names) {
  return argv.some(function (arg) {
    return names.indexOf(arg) !== -1;
  });
}

function printHelp(log) {
  log(
    [
      "用法：node scripts/deploy.js [選項]",
      "",
      "選項：",
      "  -i, --deployment-id <ID>  使用既有 Deployment ID 更新部署（保持網址固定）",
      "  -d, --description <文字>  部署說明",
      "      --no-push             略過 npm run push（不建置、不推送）",
      "  -h, --help                顯示此說明",
      "",
      "環境變數：",
      "  CLASP_DEPLOYMENT_ID / DEPLOYMENT_ID  預設 Deployment ID"
    ].join("\n")
  );
}

function run(command, args) {
  console.log("> " + [command].concat(args).join(" "));
  const result = spawnSync(command, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) {
    throw result.error;
  }
  if (typeof result.status === "number" && result.status !== 0) {
    process.exit(result.status);
  }
}

/**
 * 建立部署流程使用的依賴，預設為命令列環境。
 *
 * @param {Object} [deps] - 可注入的輸出、指令執行與環境變數
 * @returns {Object} 部署流程依賴
 */
function createDeployContext(deps) {
  const options = deps || {};
  return {
    log: typeof options.log === "function" ? options.log : console.log,
    run: typeof options.run === "function" ? options.run : run,
    env: options.env || process.env,
    args: Array.isArray(options.args) ? options.args : process.argv.slice(2)
  };
}

/**
 * 解析部署選項，並維持命令列優先於環境變數之順序。
 *
 * @param {string[]} args - 命令列參數
 * @param {Object} env - 環境變數
 * @returns {{help: boolean, deploymentId: string, description: string, skipPush: boolean}} 部署選項
 */
function resolveDeployOptions(args, env) {
  const environment = env || {};
  return {
    help: false,
    deploymentId:
      getArgValue(args, DEPLOYMENT_ID_NAMES) || environment.CLASP_DEPLOYMENT_ID || environment.DEPLOYMENT_ID || "",
    description: getArgValue(args, DESCRIPTION_NAMES) || DEFAULT_DESCRIPTION,
    skipPush: hasFlag(args, NO_PUSH_NAMES)
  };
}

/**
 * 建立 clasp deploy 的參數陣列。
 *
 * @param {Object} settings - 部署選項
 * @returns {string[]} clasp 參數
 */
function buildDeployArgs(settings) {
  const deployArgs = ["deploy", "-d", settings.description];
  if (settings.deploymentId) {
    deployArgs.push("-i", settings.deploymentId);
  }
  return deployArgs;
}

/**
 * 印出部署完成訊息。
 *
 * @param {Function} log - 輸出函式
 * @param {string} deploymentId - 部署識別碼
 */
function printDeploymentResult(log, deploymentId) {
  if (deploymentId) {
    log("\n✓ 已更新既有部署（Deployment ID: " + deploymentId + "）");
  } else {
    log("\n✓ 已建立新部署，請使用 clasp deployments 查看 Deployment ID 與網址");
  }
}

/**
 * 部署流程進入點。
 *
 * @param {string[]} [argv] - 命令列參數，省略時讀取 process.argv
 * @param {Object} [deps] - 可注入的輸出、指令執行與環境變數
 * @returns {Object} 解析後的部署選項
 */
function main(argv, deps) {
  const context = createDeployContext(deps);
  const args = Array.isArray(argv) ? argv : context.args;
  if (hasFlag(args, HELP_NAMES)) {
    printHelp(context.log);
    return { help: true, deploymentId: "", description: "", skipPush: false };
  }

  const settings = resolveDeployOptions(args, context.env);
  if (!settings.skipPush) {
    context.run("npm", ["run", "push"]);
  }
  context.run("clasp", buildDeployArgs(settings));
  printDeploymentResult(context.log, settings.deploymentId);
  return settings;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error("部署失敗：" + (error && error.message ? error.message : String(error)));
    process.exit(1);
  }
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getArgValue: getArgValue,
    hasFlag: hasFlag,
    resolveDeployOptions: resolveDeployOptions,
    buildDeployArgs: buildDeployArgs,
    printDeploymentResult: printDeploymentResult,
    main: main
  };
}
