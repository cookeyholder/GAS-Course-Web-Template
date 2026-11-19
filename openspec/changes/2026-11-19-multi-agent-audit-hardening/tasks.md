## 1. 安全與 RBAC 強化

- [x] 1.1 移除 `webApi.js` `hasPermission` 的 `/^get[A-Z]/` 通配授權，於 `ROLE_PERMISSIONS` 明確列舉 `getSession`、`getCourseIndex`、`getSystemSettings`、`getAccounts`、`logout` 等動作，並補回 staff/viewer 所需的 session 還原與登出權限；新增權限矩陣回歸測試。
- [x] 1.2 `getSystemSettings` 路由依角色遮蔽 `clientSecret`（僅 admin 可見），補測試驗證 viewer/staff 取得設定時不含機密欄位、admin 仍可取得。
- [x] 1.3 調整 `createSessionForEmail` 流程：先讀白名單再判斷是否為空，僅在明確 bootstrap 情境呼叫 `bootstrapAdminIfNeeded`，寫入置於獨立短鎖臨界區並重複檢查，避免並發覆寫與首位登入者搶占 admin。
- [x] 1.4 OAuth state nonce 一次性驗證：前端以 `sessionStorage` 保存 nonce 並随 state 送出；後端解析並驗證 nonce 與 `redirectUri` 綁定，失敗拒絕回呼；補 tests 驗證重放/不符 nonce 被拒。
- [x] 1.5 `doGet` 授權碼回呼寫入路徑補 `LockService` 保護（`tryLock`／`finally releaseLock`），覆蓋 `handleOAuthCodeCallback → createSessionForEmail → saveWhitelist` 鏈。
- [x] 1.6 前端 API 端點白名單：`config.js` 不再接受任意 `?api=`，僅允許同源或設定檔允許的 GAS 端點；補測試驗證惡意端點被拒且 token 不外送。
- [x] 1.7 SheetJS CDN 固定單一版本並補 `integrity`／`crossorigin`，移除 0.18.5 與 0.20.3 混用。
- [x] 1.8 正式建置產物停用 mock：`build-webapp.js` 排除 `mock.js` 或在 `index.html` 標記正式環境忽略 `?mock=true`，本機 `webapp/` 開發仍可使用；補建置測試。
- [x] 1.9 匯入防護：後端增加筆數/欄數上限與 `preNormalized` 為 14 欄二維陣列的結構驗證，超限回傳明確錯誤；補測試。
- [x] 1.10 課程索引寫入套用 `sanitizeRowMatrix`（保留 `@` 純文字格式），補公式注入測試。
- [x] 1.11 `validateTokenInfoClaims_` 明確檢查 `exp`/`iat`（含合理 clock skew），並將 4 處直接回傳 `err.message` 改為通用錯誤代碼與可本地化訊息；補測試。

## 2. 效能與渲染

- [x] 2.1 `getNormalizedCourses` 改為先以原始列索引篩選，再只對該頁資料呼叫 `mapCourseIndexRow_`，消除 N 個物件配置；補大量資料分頁測試。
- [x] 2.2 新增 `getCourseIndexStats` 輕量 action（只回傳總筆數），概覽頁改用此 API；前端改為進入課程分頁才抓清單，並加入相同參數的 in-flight Promise 去重。
- [x] 2.3 將 `expandCourseRow`（後端）與 `courseData.js`（前端）中與學期無關的 7 個欄位計算提升到 `for (s<6)` 迴圈外，維持前後端同構。
- [x] 2.4 格式化範圍限縮至實際寫入資料列（不使用 `getMaxRows()` 墊高），合併表頭 Range 呼叫，並同步調整 `tests/subjectCodeTransformerImportNormalizedCourseCodes.test.js:298` 的範圍斷言。
- [x] 2.5 `pickCourseSheetRows` 改為單次遍歷工作表並快取 `sheet_to_json` 結果，找不到特色表頭時不重複解析；補測試。
- [x] 2.6 鎖粒度調整：將 `login`/`loginWithActiveUser` 移出 `WEB_API_LOCKED_ACTIONS`，外部 HTTP 在鎖外完成；前端 `lock_timeout` 重試加入 jitter 與總時間上限，大型匯入停用自動重試；補併發/重試測試。
- [x] 2.7 前端差異渲染第一步：重建前記錄並還原 `activeElement.id`／`selectionStart`，搜尋改為明確觸發（Enter/按搜尋）並以請求序號捨棄過期回應；補焦點與請求去重測試。

## 3. UI/UX 與無障礙

- [x] 3.1 class/CSS 對齊：將 39 個未定義 class 映射到既有 CSS class，補 `.table`、`.btn.secondary`、分頁與 768px 以下 RWD 規則；以自動比對腳本驗證 0 個遺漏。
- [x] 3.2 上傳區鍵盤可操作：`uploadDropzone` 補 `tabindex="0"`、`role="button"`、`aria-label` 與 Enter/Space 處理，或改用可聚焦 `<label for="fileInput">`。
- [x] 3.3 Modal 無障礙：補 `role="dialog"`、`aria-modal="true"`、`aria-labelledby`、初始焦點、Tab 焦點陷阱、Esc 關閉與關閉後焦點還原。
- [x] 3.4 表單標籤關聯：所有 `<label>` 補 `for`，控制項補 `aria-label`／`aria-labelledby`，加入 `sr-only` 樣式；覆蓋帳號、系統設定、課程搜尋與風格選單。
- [x] 3.5 對比與焦點指標：將淺色 `--ink-3` 調至 ≥ 4.5:1、`.input:focus`／`.select:focus` outline 改為 `--accent`，錯誤/警告 Toast 加 `role="alert"`；以對比計算腳本驗證。
- [x] 3.6 操作回饋：白名單刪除加確認對話框、saving 時禁用操作按鈕、載入中狀態提示、Session 過期明確文案、登出防重複與失敗回饋、非提交按鈕補 `type="button"`、表格 `<th>` 補 `scope="col"`。

## 4. 可維護性與測試防線

- [ ] 4.1 強化同構測試：將 `tests/courseCodeNormalization.test.js` 改為 `deepStrictEqual(backendResult.rows, frontendResult.rows)` 並逐一比對 7 張對照表與 `NORMALIZED_COURSE_HEADERS`，讓內容漂移立即失敗。
- [ ] 4.2 抽出共用純 JS 模組 `courseNormalizationShared.js`，後端 `subjectCodeTransformer.js` 直接引用、前端由 `scripts/build-webapp.js` 注入，消除兩份重複實作。
- [ ] 4.3 統一相依解析：建立單一 `resolveDependency_`（module.exports → globalThis → fallback）與 `getActiveSpreadsheetSafe_`，取代三套重疊機制；移除 `Object.assign(globalThis)` 與空 catch，改為 fail-fast 並白名單注入。
- [ ] 4.4 清理死碼與重複：`webApiSuccess`、`DEPARTMENT_CODES`、`DEPARTMENT_NAMES`、`safeTrim`、`generateUniqueId` 移除或改為衍生；合併 `getSystemConfigSheet_`／`getRequiredSystemConfigSheet_`；統一角色名稱、工作表名稱與版本號來源。
- [ ] 4.5 建立 `ACTION_REGISTRY` 單一登錄來源，讓 `WEB_API_PUBLIC_ACTIONS`／`WRITE_ACTIONS`／`LOCKED_ACTIONS`／`ROLE_PERMISSIONS`／路由 switch／mock handler 由同一定義產生，並加測試驗證 action 與 mock handler 一致。
- [ ] 4.6 mock 與 state.js：讓 mock `getCourseIndex` 接收篩選/分頁參數並與後端回應形狀一致；新增 `tests/webappState.test.js` 覆蓋 setState 合併、listener 順序/拋錯隔離與 unsubscribe。
- [ ] 4.7 工具鏈與閘門：`package.json` watch 先建置；CI 加入 JS class 必須存在於 CSS、對比度與建置產物一致性檢查；拆分 `checkChangedCoverage.js:getDiff` 降低 CRAP 至 < 30；auth 六處 `.then()` 補 `.catch()` 與網域大小寫一致。

## 5. 文件、驗證與封存

- [ ] 5.1 同步 `README.md` 與 `docs/` 中 RBAC、首次管理員開通、API 端點、mock 模式、OAuth nonce 與部署設定說明。
- [ ] 5.2 完整驗證：執行 `npm test`、`npm run format:check`、`npm run check:lang`、`npm run test:coverage`、`npm run check:coverage`、`npm run check:changed-coverage`、`npm run check:complexity`、`npm run build:webapp`，並以 `index.html?mock=true` 驗證渲染。
