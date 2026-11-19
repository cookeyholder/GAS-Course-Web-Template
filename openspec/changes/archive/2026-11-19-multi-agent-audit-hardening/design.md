## Context

本專案目前通過全部品質閘門，但四個獨立審查面向（安全性、效能、UI/UX、可維護性）在主代理逐項查證後確認多項真實缺陷。現況關鍵事實：

- RBAC 的 `hasPermission` 以 `/^get[A-Z]/` + `read` 通配授權，加上 `getSystemSettings` 無角色檢查與 `clientSecret` 明文回傳，形成可重現的越權讀取。
- 首次管理員開通在白名單檢查之前執行，搭配 `access: ANYONE` 部署設定，首位登入者即為管理員。
- 登入 action 納入全域 Script Lock 且鎖內執行外部 HTTP；課程查詢每次全表映射；前端每次 `setState` 完整重繪且失去輸入焦點。
- 前端 100 個 class 中 39 個沒有 CSS 定義；多處 WCAG 對比與表單標籤缺失。
- 前後端 1NF 正規化邏輯完整重複，但同構測試只比筆數；後端存在三套 dependency resolver 與 `Object.assign(globalThis)` 污染。

既有系統為原生 JS、GAS V8 與 Node 雙棲、前端開發時模組化／發布時由 `scripts/build-webapp.js` 內嵌為單一 `index.html`。品質基準線與 CI 閘門已建立，任何修改都必須維持六道閘門通過且 ratchet 不回退。

## Goals / Non-Goals

**Goals:**

- 消除所有已查證的安全缺陷，特別是機密外洩與權限搶占，並建立可測試的防護（授權明確列舉、敏感欄位遮蔽、nonce 一次性驗證、寫入鎖覆蓋回呼路徑）。
- 將高資料量情境下的查詢與登入成本從「全表線性映射」與「鎖內外部 HTTP」改善為「分頁後映射」與「短臨界區寫入」。
- 讓前端渲染不再因每次狀態更新而摧毀輸入焦點，並修復鍵盤無法上傳、對話框語意、標籤關聯、class/CSS 對齊與 WCAG 對比。
- 建立前後端正規化單一事實來源與深度同構測試，消除「內容漂移不會被攔截」的風險。
- 維持既有 GIS／ActiveUser／OAuth 雙軌登入、mock 模式、RBAC 角色與所有既有 action 的向後相容（除明確列為 BREAKING 的安全修正外）。

**Non-Goals:**

- 不重寫前端框架或後端架構，不引入 React/Vue 等外部框架，維持原生 JS 與現有 build script。
- 不變更 108 課綱 1NF 正規化的商業規則本身（39 欄展開、不剔除科目），僅消除重複實作與常數因子浪費。
- 不強制在本次達成 GAS 線上環境的效能數字目標；需部署驗證的項目僅記錄觀測方式。
- 不新增第三方 runtime 相依；SheetJS 仍由 CDN 載入，但補上固定版本與 SRI。
- 不變更 `appsscript.json` 的部署存取模型（`access: ANYONE` 配合應用層白名單是有意的公開入口設計）；改以收緊開通順序與白名單檢查防護。

## Decisions

### 1. RBAC 採「明確列舉 + 敏感欄位遮蔽」雙層防護，而非只移除通配規則

移除 `hasPermission` 的 `/^get[A-Z]/` 隱式授權，改為在 `ROLE_PERMISSIONS` 明確列舉 `getSession`、`getCourseIndex`、`getSystemSettings`、`getAccounts` 等讀取動作，並為 staff/viewer 補回原本被通配規則授權的 `getSession`（session 還原所需）與 `logout`。同時在 `getSystemSettings` 路由依角色遮蔽 `clientSecret`（僅 admin 可見），使即使未來新增 `getXxx` action 也不會因遺漏列舉而自動獲得敏感資料存取權。

理由：單純移除通配規則會破壞既有 session 還原與登出；單純遮蔽欄位則無法阻止未授權的角色列舉新動作。兩層一起做才能同時修復 SEC-H1 與可維護性 L-1 的隱性規則。

### 2. 首次管理員開通改為「白名單為空 + 明確 bootstrap 旗標 + 寫入鎖」三條件

調整 `createSessionForEmail` 流程：先檢查白名單，僅在白名單為空且請求上下文明確標示為初次開通情境時呼叫 `bootstrapAdminIfNeeded`，且該寫入在獨立短臨界區的 LockService 保護下完成（重複檢查避免並發覆寫）。一般 `login`／`loginWithActiveUser` 請求在白名單非空時直接走 `restrictWhitelist` 拒絕未授權帳號。

理由：保留「首次管理員不致鎖死」的原設計意圖，但不再讓任何匿名首次登入者自動取得 admin。

### 3. OAuth state nonce 採「前端產生並存放、後端一次性和綁定 redirectUri 驗證」

前端 `encodeAuthState` 產生的 nonce 由 `sessionStorage` 保存並随 authorization request 送出；後端 `resolveOAuthRedirectUri` 解析並驗證 `nonce` 與保存值一致（一次性消耗）、且 `redirectUri` 必須與設定/Web App URL 相符才接受回呼。驗證失敗回傳明確錯誤而不建立 session。

理由：現況 nonce 完全被忽略，等於沒有 CSRF 防護。需在前端與後端同時落地，且需向後相容既有的 `state=redirectUri` 編碼格式。

### 4. 全域鎖僅保護「短暫且本地的寫入」，外部 HTTP 移到鎖外

將 `login`／`loginWithActiveUser` 從 `WEB_API_LOCKED_ACTIONS` 移除；先完成 Google token 驗證（含 `UrlFetchApp.fetch`）再進入需要寫白名單的短臨界區。`importCourseCodes` 保留鎖，但鎖範圍限縮在清除與分批寫入區段。前端對 `lock_timeout` 的重試加入 jitter 與總時間上限，並對大型匯入停用自動重試，改由使用者明確重試。

理由：鎖內外部 HTTP 會把 N 個登入序列化為 N 倍網路延遲；同時保留寫入排他性以符合專案規範。

### 5. 課程查詢採「先篩選原始列、再映射分頁」並補輕量統計

`getNormalizedCourses` 改為先用原始 `row` 索引做關鍵字/學年/學期/科別比對，取得符合的列索引後只對該頁的 30 筆呼叫 `mapCourseIndexRow_`。另新增 `getCourseIndexStats` action 只回傳總筆數，讓概覽頁不必觸發 `getCourseIndex` 全表讀取。前端在真正進入課程分頁時才抓清單，並以 in-flight Promise 避免相同參數的重複請求。

理由：見效最快且風險最低；不引入 CacheService 是因為 ScriptCache 單值 100 KB 限制與失效策略需額外驗證，先以「延遲映射」消除主要物件建立成本。

### 6. 前端渲染採「差異渲染 + 焦點保存」兩段式修復

第一段（低風險）：在 `render()` 重建前記錄 `document.activeElement.id` 與 `selectionStart`，重建後還原；同時把搜尋從 `oninput` 自動觸發改為「Enter/按搜尋」觸發，並以請求序號捨棄過期回應，消除雙重請求與 IME 中斷。第二段：將 `#app` 拆分為 header／navbar／content 掛載點，`loading` 狀態只更新內容區，避免整頁重繪。

理由：先以低風險修復解決可預見的操作中斷，再逐步改為局部更新，降低一次重構風險。

### 7. UI 樣式採「以現有 CSS class 為準」的對齊策略，而非兩份並存

將 JS 產生的 39 個未定義 class 映射到 CSS 既有 class（`upload-dropzone→dropzone`、`modal-header→modal-head`、`modal-footer→modal-foot`、`login-container→login-wrap`、`app-layout→app-shell` 等），補上 `.table`、`.btn.secondary`、分頁與 RWD 規則；同時調整 `--ink-3` 與 `.input:focus` outline 來達到 WCAG AA，並在 CI 加入 class/CSS 對比檢查防止回退。

理由：CSS 已有 13 種風格的完整設計系統，新增第二套 class 會讓風格覆寫更難維護。

### 8. 可維護性採「單一事實來源 + 測試守衛」優先於大重構

先強化同構測試為 `deepStrictEqual(rows)` 並逐一比對 7 張對照表，讓漂移立即被攔截；接著抽出共用純 JS 模組 `courseNormalizationShared.js`，由後端直接引用、前端由 build script 注入。同時統一 dependency resolver 為單一 `resolveDependency_`（module.exports → globalThis → fallback）、移除 `Object.assign(globalThis)` 與死碼、建立 `ACTION_REGISTRY` 單一登錄來源、常數集中、mock 回應形狀與後端一致。

理由：先讓測試守衛就位，再移動程式碼，可在每一步都確認無漂移。

## Risks / Trade-offs

- **[風險] 移除通配授權破壞既有讀取動作** → 明確列舉所有 `getXxx` 與 `logout`，並新增權限矩陣測試逐項驗證 staff/viewer 可 session 還原與登出。
- **[風險] bootstrap 順序調整影響首次部署體驗** → 保留「白名單為空時可開通」的路徑，但需文件說明首次管理者應先由試算表/部署者預先設定白名單，或由明確的開通入口觸發。
- **[風險] OAuth nonce 驗證與既有 `state` 編碼不相容** → 新增向後相容解析（舊格式僅含 redirectUri 時降級但不接受敏感寫入），並在文件說明 migrated 行為。
- **[風險] 深度同構測試因空白/註解差異失敗** → 先以正規化空白比對函式來源，再逐步收斂為逐字相同；對照表與資料列採 `deepStrictEqual`。
- **[風險] class 對齊造成大範圍 CSS/JS diff** → 以別名規則過渡（新舊 class 並存一段時間），再分批移除舊 class；每次改動後建置並以瀏覽器 mock 模式抽驗。
- **[風險] 品質閘門 ratchet 回退** → 每個 task 完成後執行六道閘門；`checkChangedCoverage` 要求 80% lines/70% branches，新增函式需同時補測試。
- **[取捨] 個人(task)粒度 commit 造成歷史較長** → 依使用者要求每完成一個 task 即提交，commit 訊息採繁體中文 Conventional Commits，便於逐項回滾。

## Migration Plan

1. **提案與查證（本階段）**：完成 proposal/design/tasks/spec delta，先提交提案文件，再開始程式碼變更。
2. **階段一：安全強化**：RBAC 與 secret 遮蔽 → bootstrap 順序 → OAuth nonce/回呼鎖 → API 端點白名單/SRI/mock → 匯入上限與 sanitizer → ID Token exp 與錯誤訊息。
3. **階段二：效能與渲染**：延遲映射與統計 API → hoist → 格式化範圍 → 工作表單次解析 → 鎖粒度與重試 → 差異渲染與焦點。
4. **階段三：UI/UX 與無障礙**：class/CSS 對齊 → 鍵盤上傳 → Modal/label → 對比與 focus → 載入/確認/提示 → RWD 與 toast。
5. **階段四：可維護性與測試防線**：深度同構測試 → 共用模組 → resolver/全域污染/死碼 → action registry/常數 → state.js/mock 測試 → 工具鏈與 CI。
6. **同步與封存**：`openspec-sync-specs` 同步 7 份 delta 到 main specs → `openspec-archive-change` 封存提案 → 推送分支並發起 Pull Request。

**Rollback 策略**：每個 task 一個 commit，可用 `git revert <hash>` 單獨回退；若某階段造成閘門失敗，先停在該階段修正，不繼續下一階段。

## Open Questions

- 首次管理員開通是否要額外提供「需部署者預先寫入白名單」的設定旗標，或維持「白名單為空且明確標記 bootstrap 請求」即可？目前設計採後者，需與部署文件一致。
- OAuth nonce 是否要強制驗證（可能影響既有已部署用戶的回呼），或先以「記錄警告 + 可選嚴格模式」過渡？目前設計採強制驗證。
- 大型匯入分段上傳是否需要在本次實作，或先以明確上限與停用自動重試降低風險？目前設計先做上限與停用重試，分段上傳列為後續。
- CacheService 快取課程索引是否納入本次？目前因 100 KB 限制與失效策略不納入，僅保留為後續最佳化選項。
