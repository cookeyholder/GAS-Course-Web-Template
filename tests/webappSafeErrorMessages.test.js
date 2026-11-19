"use strict";

/**
 * 前端安全錯誤訊息測試。
 * 驗證原始例外文字不外顯，僅顯示後端安全訊息或明確標記的安全文案。
 */

const assert = require("assert");
const safeErrors = require("../webapp/js/errorMessages.js");

console.log("開始執行前端安全錯誤訊息測試...\n");

console.log("1. 原始 Error 不得外顯，應使用備援文案...");
{
  const message = safeErrors.resolveUserMessage(new Error("內部堆疊資訊"), "後端執行失敗，請稍後再試");
  assert.strictEqual(message, "後端執行失敗，請稍後再試");
  console.log("   ✓ 原始例外遮蔽驗證通過！\n");
}

console.log("2. 後端安全結果訊息應可顯示...");
{
  const result = { ok: false, error: "server_error", message: "後端執行失敗，請稍後再試" };
  assert.strictEqual(safeErrors.resolveUserMessage(result, "備援"), "後端執行失敗，請稍後再試");
  console.log("   ✓ 後端結果訊息驗證通過！\n");
}

console.log("3. 明確標記的安全例外應可顯示...");
{
  const error = safeErrors.createSafeError("Google 登入服務載入失敗");
  assert.strictEqual(error.message, "Google 登入服務載入失敗");
  assert.strictEqual(safeErrors.resolveUserMessage(error, "備援"), "Google 登入服務載入失敗");
  console.log("   ✓ 安全例外標記驗證通過！\n");
}

console.log("4. 字串與空值一律使用備援文案...");
{
  assert.strictEqual(safeErrors.resolveUserMessage("隨機字串", "備援"), "備援");
  assert.strictEqual(safeErrors.resolveUserMessage(null, "備援"), "備援");
  console.log("   ✓ 未知輸入驗證通過！\n");
}

console.log("✓ 前端安全錯誤訊息測試全數通過！\n");
