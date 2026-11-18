"use strict";

/**
 * scripts/deploy.js 的 main 流程單元測試（G8.2）
 * 驗證命令列參數解析、環境變數優先順序、推送略過與輸出契約。
 */

const assert = require("assert");
const childProcess = require("child_process");
const helpers = require("./helpers/scriptsDeps.js");

// 搶在載入 deploy.js 前攔截子行程，避免任何測試失誤觸發實際推送。
const originalSpawnSync = childProcess.spawnSync;
childProcess.spawnSync = function () {
  throw new Error("測試中不得執行真實子行程");
};
const deploy = require("../scripts/deploy.js");
childProcess.spawnSync = originalSpawnSync;

/**
 * 建立可注入的部署流程依賴。
 *
 * @param {Object} [overrides] - 覆寫依賴
 * @returns {Object} 依賴與呼叫紀錄
 */
function createDeps(overrides) {
  const calls = [];
  const output = helpers.captureConsole();
  const deps = Object.assign(
    {
      run: function (command, args) {
        calls.push({ command: command, args: args.slice() });
      },
      log: function (message) {
        output.logs.push(String(message));
      },
      env: helpers.createEnv()
    },
    overrides || {}
  );
  return { deps: deps, calls: calls, output: output };
}

function runMain(args, overrides) {
  const context = createDeps(overrides);
  try {
    const result = deploy.main(args, context.deps);
    return { result: result, calls: context.calls, output: context.output };
  } finally {
    context.output.restore();
  }
}

function executedCommands(calls) {
  return calls.map(function (call) {
    return call.command + " " + call.args.join(" ");
  });
}

(async function run() {
  console.log("開始執行 scripts/deploy.js::main 測試...\n");

  console.log("1. 應匯出可測試的部署函式...");
  {
    assert.strictEqual(typeof deploy.main, "function", "應匯出 main");
    assert.strictEqual(typeof deploy.getArgValue, "function", "應匯出 getArgValue");
    assert.strictEqual(typeof deploy.resolveDeployOptions, "function", "應匯出 resolveDeployOptions");
    console.log("   ✓ 匯出介面驗證通過！\n");
  }

  console.log("2. --help / -h 應印出說明且不執行任何指令...");
  {
    ["--help", "-h"].forEach(function (flag) {
      const outcome = runMain([flag]);
      assert.strictEqual(outcome.calls.length, 0);
      assert(
        outcome.output.logs.some(function (line) {
          return line.indexOf("用法：node scripts/deploy.js") !== -1;
        })
      );
      assert(
        outcome.output.logs.some(function (line) {
          return line.indexOf("--no-push") !== -1;
        })
      );
    });
    console.log("   ✓ 說明輸出驗證通過！\n");
  }

  console.log("3. 無參數時應先推送再建立新部署...");
  {
    const outcome = runMain([]);
    assert.deepStrictEqual(executedCommands(outcome.calls), ["npm run push", "clasp deploy -d Web App 部署"]);
    assert.strictEqual(outcome.result.skipPush, false);
    assert.strictEqual(outcome.result.deploymentId, "");
    assert.strictEqual(outcome.result.description, "Web App 部署");
    assert.strictEqual(outcome.result.help, false);
    assert(
      outcome.output.logs.some(function (line) {
        return line.indexOf("已建立新部署，請使用 clasp deployments 查看 Deployment ID 與網址") !== -1;
      })
    );
    console.log("   ✓ 預設流程驗證通過！\n");
  }

  console.log("4. 指定 Deployment ID 時應更新既有部署...");
  {
    const outcome = runMain(["-i", "DEP-123"]);
    assert.deepStrictEqual(executedCommands(outcome.calls), [
      "npm run push",
      "clasp deploy -d Web App 部署 -i DEP-123"
    ]);
    assert(
      outcome.output.logs.some(function (line) {
        return line.indexOf("已更新既有部署（Deployment ID: DEP-123）") !== -1;
      })
    );
    console.log("   ✓ 既有部署驗證通過！\n");
  }

  console.log("5. 部署說明應可使用長短參數與等號形式...");
  {
    const short = runMain(["-d", "版本說明"]);
    assert.deepStrictEqual(short.calls[1].args, ["deploy", "-d", "版本說明"]);
    const long = runMain(["--description=另一說明", "--deployment-id=DEP-X"]);
    assert.deepStrictEqual(long.calls[1].args, ["deploy", "-d", "另一說明", "-i", "DEP-X"]);
    console.log("   ✓ 部署說明驗證通過！\n");
  }

  console.log("6. --no-push 應略過建置與推送...");
  {
    const outcome = runMain(["--no-push", "-i", "DEP-456"]);
    assert.deepStrictEqual(executedCommands(outcome.calls), ["clasp deploy -d Web App 部署 -i DEP-456"]);
    assert.strictEqual(outcome.result.skipPush, true);
    console.log("   ✓ 略過推送驗證通過！\n");
  }

  console.log("7. 環境變數應依 CLASP_DEPLOYMENT_ID、DEPLOYMENT_ID 順序回退...");
  {
    const first = runMain([], { env: helpers.createEnv({ CLASP_DEPLOYMENT_ID: "ENV-A", DEPLOYMENT_ID: "ENV-B" }) });
    assert.strictEqual(first.result.deploymentId, "ENV-A");
    assert.deepStrictEqual(first.calls[1].args, ["deploy", "-d", "Web App 部署", "-i", "ENV-A"]);

    const second = runMain([], { env: helpers.createEnv({ DEPLOYMENT_ID: "ENV-B" }) });
    assert.strictEqual(second.result.deploymentId, "ENV-B");

    const third = runMain(["--deployment-id", "CLI-ID"], {
      env: helpers.createEnv({ CLASP_DEPLOYMENT_ID: "ENV-A" })
    });
    assert.strictEqual(third.result.deploymentId, "CLI-ID");
    console.log("   ✓ 環境變數優先順序驗證通過！\n");
  }

  console.log("8. 未傳入 args 時應讀取 process.argv.slice(2)...");
  {
    const originalArgv = process.argv;
    try {
      process.argv = ["node", "scripts/deploy.js", "--no-push", "-i", "ARGV-ID"];
      const outcome = runMain(undefined);
      assert.deepStrictEqual(executedCommands(outcome.calls), ["clasp deploy -d Web App 部署 -i ARGV-ID"]);
    } finally {
      process.argv = originalArgv;
    }
    console.log("   ✓ process.argv 回退驗證通過！\n");
  }

  console.log("9. 指令執行失敗時應向外傳播，且不印出成功訊息...");
  {
    const context = createDeps();
    try {
      assert.throws(function () {
        deploy.main([], {
          run: function () {
            throw new Error("推送失敗");
          },
          log: context.deps.log,
          env: context.deps.env
        });
      }, /推送失敗/);
      assert.strictEqual(context.output.logs.length, 0, "失敗時不應印出成功訊息");
    } finally {
      context.output.restore();
    }
    console.log("   ✓ 失敗傳播驗證通過！\n");
  }

  console.log("✓ scripts/deploy.js::main 測試全數通過！\n");
})().catch(function (error) {
  console.error(error);
  process.exit(1);
});
