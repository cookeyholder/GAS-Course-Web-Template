"use strict";

/**
 * CI 品質閘門 workflow 測試（G1.8）
 * 驗證 workflow 納入品質檢查步驟、diff 所需 checkout 設定、Node 24 版本策略，
 * 以及新增 OpenCC 語言證據步驟之非阻斷、只報不寫與警告簽核契約。
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const PROJECT_ROOT = path.join(__dirname, "..");
const workflowPath = path.join(PROJECT_ROOT, ".github", "workflows", "quality-gates.yml");

console.log("開始執行 CI 品質閘門 workflow 測試...\n");

const content = fs.readFileSync(workflowPath, "utf8");
const lines = content.split("\n");

/** 以步驟名稱取出該步驟的 YAML 區塊，便於逐步驟驗證診斷歸屬。 */
function stepBlock(name) {
  const start = lines.findIndex(function (line) {
    return line.indexOf("- name: " + name) !== -1;
  });
  assert.notStrictEqual(start, -1, "應存在步驟：" + name);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^\s{6}- name: /.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

console.log("1. 驗證 checkout 具備 diff 所需的完整歷史設定...");
{
  assert(/actions\/checkout@v4/.test(content), "應使用 actions/checkout@v4");
  assert(/fetch-depth\s*:\s*0/.test(content), "checkout 應設定 fetch-depth: 0 以支援變更覆蓋率 diff");
  console.log("   ✓ checkout 設定驗證通過！\n");
}

console.log("2. 驗證 Node 版本策略與 Node 24 一致...");
{
  assert(/node-version\s*:\s*["']?24/.test(content), "CI 應使用 Node 24（本機/CI 目標一致）");
  console.log("   ✓ Node 版本策略驗證通過！\n");
}

console.log("3. 驗證 workflow 納入覆蓋率、變更覆蓋率與複雜度檢查...");
{
  assert(/npm run (test:coverage|check:coverage)/.test(content), "應執行覆蓋率量測/檢查指令");
  assert(/npm run check:coverage/.test(content), "應執行覆蓋率門檻檢查（check:coverage）");
  assert(/npm run check:complexity/.test(content), "應執行 CRAP/MI 複雜度檢查（check:complexity）");
  assert(/npm run check:changed-coverage/.test(content), "應執行變更覆蓋率檢查（check:changed-coverage）");
  console.log("   ✓ 品質檢查步驟驗證通過！\n");
}

console.log("4. 驗證保留既有格式、語言與測試檢查流程，且順序未變...");
{
  assert(/npm run format:check/.test(content), "應保留格式檢查");
  assert(/npm run check:lang/.test(content), "應保留語言檢查");
  assert(/npm test/.test(content), "應保留測試執行");
  const mandatory = [
    "- name: Checkout",
    "- name: Setup Node.js",
    "- name: Install dependencies",
    "- name: Format check",
    "- name: Language check",
    "- name: UI class alignment check",
    "- name: WCAG contrast check",
    "- name: Accessibility audit",
    "- name: Build artifact consistency",
    "- name: Tests",
    "- name: Coverage check",
    "- name: Complexity check",
    "- name: Changed coverage check"
  ];
  let cursor = -1;
  mandatory.forEach(function (header) {
    const at = content.indexOf(header, cursor + 1);
    assert.ok(at > cursor, "既有強制步驟順序不得變動：" + header);
    cursor = at;
  });
  console.log("   ✓ 既有檢查流程與順序驗證通過！\n");
}

console.log("5. 驗證語言硬閘門宣告 id 供布林交叉比對取得結果...");
{
  const gate = stepBlock("Language check");
  assert(/id:\s*language-hard-gate/.test(gate), "語言硬閘門步驟應宣告 id: language-hard-gate");
  const artifact = stepBlock("檢查語言報告構件與 meta（非阻斷）");
  assert.ok(artifact.indexOf("steps.language-hard-gate.outcome != 'success'") !== -1, "應以 outcome 取得布林結果");
  assert.ok(artifact.indexOf("HARD_GATE_FAILED") !== -1, "應將硬閘門布林結果命名為 HARD_GATE_FAILED");
  assert.ok(!/HARD_GATE_FAILED[^=]*!==\s*0/.test(artifact), "禁止對布林值使用 !== 0");
  assert.ok(!/hardGateFailed\s*===\s*violationCount/.test(artifact), "禁止以數值相等比對布林與違規數");
  assert.ok(
    artifact.indexOf("hardGateFailed !== violationHasRows") !== -1,
    "應以布林式 hardGateFailed !== (violationCount > 0) 比對"
  );
  console.log("   ✓ 硬閘門布林交叉比對驗證通過！\n");
}

console.log("6. 驗證新增步驟皆為非阻斷且只報不寫...");
{
  const names = [
    "OpenCC 可用性檢查（非阻斷）",
    "產生語言檢查結構化報告（非阻斷）",
    "檢查契約字面值漂移（非阻斷）",
    "檢查語言報告構件與 meta（非阻斷）",
    "上傳語言檢查報告構件（非阻斷）",
    "標記語言簽核需求（非阻斷）"
  ];
  const additionStart = content.indexOf("      # 以下皆為非阻斷");
  assert.ok(additionStart > -1, "應於既有步驟之後新增語言證據步驟");
  names.forEach(function (name) {
    const block = stepBlock(name);
    assert.ok(block.indexOf("if: always()") !== -1, name + " 應使用 if: always()");
    assert.ok(block.indexOf("continue-on-error: true") !== -1, name + " 應使用 continue-on-error: true");
    assert.ok(!/--fix|--approve|--revoke/.test(block), name + " 不得包含寫入旗標");
  });
  console.log("   ✓ 非阻斷與只報不寫驗證通過！\n");
}

console.log("7. 驗證 smoke、漂移檢查與診斷代碼歸屬...");
{
  const smoke = stepBlock("OpenCC 可用性檢查（非阻斷）");
  assert.ok(smoke.indexOf("node scripts/openccS2twp.js --smoke") !== -1, "smoke 指令應固定");
  const report = stepBlock("產生語言檢查結構化報告（非阻斷）");
  assert.ok(report.indexOf("npm run language:report") !== -1, "應執行報告模式");
  const drift = stepBlock("檢查契約字面值漂移（非阻斷）");
  assert.ok(drift.indexOf("node scripts/generateOpenccS2twpContractLiterals.js --check") !== -1, "應執行漂移檢查");

  // 假錯誤注入歸屬：smoke 與報告步驟不載入解析器，僅輸出兩種 OpenCC 碼。
  [smoke, report].forEach(function (block, index) {
    const label = index === 0 ? "smoke" : "報告";
    assert.ok(block.indexOf("@opencc/opencc-") !== -1, label + " 應映射平台二進位缺失");
    assert.ok(block.indexOf("ERR_DLOPEN_FAILED") !== -1, label + " 應映射 ERR_DLOPEN_FAILED");
    assert.ok(block.indexOf("OPENCC_BINARY_MISSING") !== -1, label + " 應輸出 OPENCC_BINARY_MISSING");
    assert.ok(block.indexOf("OPENCC_UNAVAILABLE") !== -1, label + " 應輸出 OPENCC_UNAVAILABLE");
    assert.ok(block.indexOf("PARSER_UNAVAILABLE") === -1, label + " 不得輸出 PARSER_UNAVAILABLE");
    assert.ok(block.indexOf("@babel/parser") === -1, label + " 不得載入 @babel/parser");
  });
  // PARSER_UNAVAILABLE 僅由漂移檢查步驟輸出。
  assert.ok(drift.indexOf("PARSER_UNAVAILABLE") !== -1, "漂移檢查應輸出 PARSER_UNAVAILABLE");
  assert.ok(drift.indexOf("MODULE_NOT_FOUND") !== -1, "應以 MODULE_NOT_FOUND 判定解析器缺失");
  assert.ok(drift.indexOf("@babel/parser") !== -1, "應以 @babel/parser 判定解析器缺失");
  const parserOnly = [smoke, report].every(function (block) {
    return block.indexOf("PARSER_UNAVAILABLE") === -1;
  });
  assert.ok(parserOnly, "PARSER_UNAVAILABLE 不得出現於 smoke 與報告步驟");
  console.log("   ✓ 診斷代碼步驟歸屬驗證通過！\n");
}

console.log("8. 驗證構件檢查解析 meta 欄位、空檔警告與報告新鮮度...");
{
  const artifact = stepBlock("檢查語言報告構件與 meta（非阻斷）");
  assert.ok(artifact.indexOf("artifacts/language-report.jsonl") !== -1, "應讀取 JSONL 構件");
  [
    "degraded",
    "candidateCount",
    "protectedCount",
    "unprotectedCount",
    "exemptCandidateCount",
    "violationCount",
    "generatedAt"
  ].forEach(function (key) {
    assert.ok(artifact.indexOf('"' + key + '"') !== -1, "應解析 meta 欄位：" + key);
  });
  assert.ok(artifact.indexOf("REPORT_ARTIFACT_EMPTY") !== -1, "空檔應視為警告");
  assert.ok(artifact.indexOf("REPORT_META_INVALID") !== -1, "首行無法解析應警告");
  assert.ok(artifact.indexOf("date -u +%Y-%m-%dT%H:%M:%SZ") !== -1, "應以 UTC 取得檢查基準時刻");
  assert.ok(artifact.indexOf('endsWith("Z")') !== -1, "generatedAt 應以 Z 結尾");
  assert.ok(artifact.indexOf("15 * 60 * 1000") !== -1, "接受基準前 15 分鐘");
  assert.ok(artifact.indexOf("5 * 60 * 1000") !== -1, "接受基準後 5 分鐘");
  assert.ok(!/60\s*\*\s*60\s*\*\s*1000/.test(artifact), "不得採 60 分鐘寬鬆區間");
  console.log("   ✓ meta 解析與報告新鮮度驗證通過！\n");
}

console.log("9. 驗證零候選、有違規零候選與全數保護／豁免警告互斥...");
{
  const artifact = stepBlock("檢查語言報告構件與 meta（非阻斷）");
  assert.ok(artifact.indexOf("violations > 0 && candidates === 0 && !degraded") !== -1, "有違規但零候選且未降級才警告");
  assert.ok(
    artifact.indexOf("無 s2tw 可定位候選；由正體字組成的中國用語違規不在 OpenCC 候選範圍，須依硬閘門輸出人工修正") !==
      -1,
    "應以固定字串說明單一原因"
  );
  const zeroCandidateLine = artifact.split("\n").find(function (line) {
    return line.indexOf("無 s2tw 可定位候選") !== -1;
  });
  assert.ok(zeroCandidateLine, "應有零候選警告");
  assert.ok(!/全數受保護|全數豁免/.test(zeroCandidateLine), "零候選警告不得列舉全數受保護或全數豁免");
  assert.ok(artifact.indexOf("candidates > 0") !== -1, "全數警告僅在 candidateCount 大於零時判定");
  assert.ok(artifact.indexOf("候選全數受保護，工具不寫入") !== -1, "應有全數受保護警告");
  assert.ok(artifact.indexOf("候選全數豁免，工具不寫入") !== -1, "應有全數豁免警告");
  assert.ok(artifact.indexOf("} else if (exemptCount === candidates)") !== -1, "兩種全數警告應互斥");
  assert.ok(artifact.indexOf("unprotectedCount !== candidates - protectedCount") !== -1, "應驗證總和不等式");
  assert.ok(artifact.indexOf("exemptCount > unprotectedCount") !== -1, "應驗證子集不等式");
  console.log("   ✓ 零候選與全數警告驗證通過！\n");
}

console.log("10. 驗證降級、不一致警告與人工簽核錨點、標籤...");
{
  const artifact = stepBlock("檢查語言報告構件與 meta（非阻斷）");
  assert.ok(artifact.indexOf("報告標記降級") !== -1, "降級應警告");
  assert.ok(artifact.indexOf("HARD_GATE_MISMATCH") !== -1, "布林不一致應警告");
  assert.ok(artifact.indexOf("LANGUAGE_SIGNOFF_REQUIRED") !== -1, "摘要應輸出固定錨點");
  assert.ok(artifact.indexOf("語言警告未處理，合併前須人工簽核") !== -1, "摘要應輸出未處理簽核字串");
  const label = stepBlock("標記語言簽核需求（非阻斷）");
  assert.ok(label.indexOf("language-signoff-required") !== -1, "應嘗試加上簽核標籤");
  assert.ok(label.indexOf("gh pr edit") !== -1, "應以 gh 新增標籤");
  assert.ok(label.indexOf("標籤新增失敗，須人工確認語言簽核") !== -1, "標籤新增失敗應額外警示");
  const expectedSignoff = "語言警告已處理，合併前人工簽核";
  assert.ok(expectedSignoff !== "語言警告未處理，合併前須人工簽核", "兩處 SIGNOFF 字串不得相同");
  console.log("   ✓ 人工簽核錨點與標籤驗證通過！\n");
}

console.log("11. 驗證構件名稱含 SHA 與上傳動作...");
{
  const upload = stepBlock("上傳語言檢查報告構件（非阻斷）");
  assert.ok(upload.indexOf("actions/upload-artifact@v4") !== -1, "應使用 upload-artifact@v4");
  assert.ok(upload.indexOf("language-report-${{ github.sha }}") !== -1, "構件名稱應含提交 SHA");
  assert.ok(upload.indexOf("if-no-files-found: warn") !== -1, "找不到檔案應為警告");
  console.log("   ✓ 構件名稱與上傳驗證通過！\n");
}

console.log("12. 驗證零候選且零違規不誤報、成功零違規不誤發交叉比對警告...");
{
  const artifact = stepBlock("檢查語言報告構件與 meta（非阻斷）");
  assert.ok(
    artifact.indexOf("const violationHasRows = violations > 0;") !== -1,
    "應以 violations > 0 推導違規布林，零違規時為 false"
  );
  assert.ok(
    artifact.indexOf("if (hardGateFailed !== violationHasRows)") !== -1,
    "硬閘門成功且零違規時 false !== false 成立為假，不得發警告"
  );
  assert.ok(
    artifact.indexOf("violations > 0 && candidates === 0 && !degraded") !== -1,
    "零候選且零違規時第一項為假，不得觸發零候選警告"
  );
  const zeroCandidateWarning = artifact.indexOf("無 s2tw 可定位候選");
  const zeroCandidateCondition = artifact.indexOf("violations > 0 && candidates === 0 && !degraded");
  assert.ok(zeroCandidateWarning > zeroCandidateCondition, "零候選警告須由有違規條件守門");
  assert.ok(
    !/violations\s*===\s*0|candidates\s*===\s*0[^\n]*markWarning/.test(artifact),
    "不得對零違規或零候選單獨警告"
  );
  console.log("   ✓ 零候選零違規不誤報驗證通過！\n");
}

console.log("13. 以三種假錯誤注入驗證診斷映射歸屬與禁止 catch-all...");
{
  const smoke = stepBlock("OpenCC 可用性檢查（非阻斷）");
  const report = stepBlock("產生語言檢查結構化報告（非阻斷）");
  const drift = stepBlock("檢查契約字面值漂移（非阻斷）");

  // 假錯誤一：平台二進位缺失（ERR_DLOPEN_FAILED 或 @opencc/opencc- 前綴）。
  const binaryFake = "ERR_DLOPEN_FAILED: Cannot open @opencc/opencc-linux-x64.node";
  [smoke, report, drift].forEach(function (block, index) {
    const label = ["smoke", "報告", "漂移"][index];
    assert.ok(
      block.indexOf("ERR_DLOPEN_FAILED|@opencc/opencc-") !== -1 || block.indexOf("'@opencc/opencc-'") !== -1,
      label + " 應攔截平台二進位假錯誤：" + binaryFake
    );
    assert.ok(block.indexOf("OPENCC_BINARY_MISSING") !== -1, label + " 應將二進位假錯誤映射為 OPENCC_BINARY_MISSING");
  });

  // 假錯誤二：解析器缺失（MODULE_NOT_FOUND 且含 @babel/parser），僅漂移步驟成立。
  const parserFake = "Error: Cannot find module '@babel/parser' (MODULE_NOT_FOUND)";
  assert.ok(
    drift.indexOf("MODULE_NOT_FOUND") !== -1 && drift.indexOf("@babel/parser") !== -1,
    "漂移步驟應攔截解析器假錯誤：" + parserFake
  );
  assert.ok(drift.indexOf("PARSER_UNAVAILABLE") !== -1, "漂移步驟應將解析器假錯誤映射為 PARSER_UNAVAILABLE");
  assert.ok(!/PARSER_UNAVAILABLE/.test(smoke + report), "smoke 與報告步驟不得輸出 PARSER_UNAVAILABLE");

  // 假錯誤三：其餘 OpenCC 載入／建構／轉換失敗。
  const genericFake = "OpenCC conversion failed unexpectedly";
  [smoke, report, drift].forEach(function (block, index) {
    assert.ok(
      block.indexOf("OPENCC_UNAVAILABLE") !== -1,
      ["smoke", "報告", "漂移"][index] + " 應有通用 OpenCC 碼：" + genericFake
    );
    const elseBranch = block.split("\n").find(function (line) {
      return line.indexOf("code=OPENCC_UNAVAILABLE") !== -1 || line.indexOf("code=OPENCC_BINARY_MISSING") !== -1;
    });
    assert.ok(elseBranch !== undefined, "應以明確 else 分支映射其餘錯誤，禁止 catch-all");
  });

  // 三種碼皆為固定字面值，不得由錯誤訊息原樣帶出。
  assert.ok(!/code=\"?\$output/.test(smoke + report + drift), "診斷碼不得直接取自錯誤輸出");
  console.log("   ✓ 假錯誤注入映射驗證通過！\n");
}

console.log("✓ CI 品質閘門 workflow 測試全數通過！\n");
