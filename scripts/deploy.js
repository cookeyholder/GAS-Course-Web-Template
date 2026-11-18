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

function getArgValue(argv, names) {
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    for (let i = 0; i < names.length; i += 1) {
      const name = names[i];
      if (arg === name) return argv[index + 1] || "";
      if (arg.indexOf(name + "=") === 0) return arg.slice(name.length + 1);
    }
  }
  return "";
}

function hasFlag(argv, names) {
  return argv.some(function (arg) {
    return names.indexOf(arg) !== -1;
  });
}

function printHelp() {
  console.log(
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

function main(argv) {
  const args = Array.isArray(argv) ? argv : process.argv.slice(2);
  if (hasFlag(args, ["--help", "-h"])) {
    printHelp();
    return;
  }

  const deploymentId =
    getArgValue(args, ["--deployment-id", "-i"]) || process.env.CLASP_DEPLOYMENT_ID || process.env.DEPLOYMENT_ID || "";
  const description = getArgValue(args, ["--description", "-d"]) || "Web App 部署";
  const skipPush = hasFlag(args, ["--no-push"]);

  if (!skipPush) {
    run("npm", ["run", "push"]);
  }

  const deployArgs = ["deploy", "-d", description];
  if (deploymentId) {
    deployArgs.push("-i", deploymentId);
  }
  run("clasp", deployArgs);

  if (deploymentId) {
    console.log("\n✓ 已更新既有部署（Deployment ID: " + deploymentId + "）");
  } else {
    console.log("\n✓ 已建立新部署，請使用 clasp deployments 查看 Deployment ID 與網址");
  }
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
    main: main
  };
}
