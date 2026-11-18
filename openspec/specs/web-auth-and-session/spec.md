# web-auth-and-session Specification

## Purpose

定義本範本多情境登入流程（mock、GIS、GAS ActiveUser/帳號切換）、ID Token 與登入授權驗證強化，以及 Session 與 CSRF 保護行為。

## Requirements

### Requirement: 多情境登入流程（Mock / GIS / GAS ActiveUser）
系統 SHALL 依執行環境與公開設定提供可用的登入路徑：`?mock=true` 時可使用 mock 登入；一般網頁環境可使用 Google Identity Services（GIS）credential 登入；GAS HtmlService 容器環境 SHALL 提供不依賴 GIS 彈窗的帳號切換與 ActiveUser 登入流程，以避免沙箱網域 `origin_mismatch`。前端啟動時 MUST 先取得公開設定，並依序處理 OAuth 回呼初始登入結果（`INITIAL_AUTH`）與帳號切換請求（`switch=1`/設定旗標），再決定是否還原既有 session。

#### Scenario: 一般網頁環境使用 GIS 登入
- **WHEN** 使用者於非 GAS 容器且非 mock 環境開啟系統且後端已設定 OAuth Client ID
- **THEN** 前端顯示 GIS 登入按鈕並於取得 credential 後呼叫 `login` 建立 session

#### Scenario: GAS 容器環境改用帳號切換與 ActiveUser 登入
- **WHEN** 使用者於 GAS HtmlService 容器環境開啟系統並觸發 Google 帳號登入/切換
- **THEN** 前端導向帳號選擇流程並於回到 Web App 後以 `loginWithActiveUser` 建立 session，且不得要求 GIS 彈窗作為唯一登入方式

#### Scenario: 啟動時處理 OAuth 回呼初始登入結果
- **WHEN** `doGet` 以授權碼流程完成登入並注入 `INITIAL_AUTH`
- **THEN** 前端在初始化階段套用登入成功或顯示明確錯誤訊息，並清理網址上的敏感查詢參數

### Requirement: ID Token 與登入授權驗證強化
後端 MUST 驗證 Google ID Token 的有效性與身分資訊，至少包含簽發者（`iss`）、Email 驗證狀態（`email_verified`）與受眾（`aud` 與系統設定 Client ID 相符）。系統 SHALL 支援可選的允許登入網域限制；當設定網域時，僅允許符合網域的帳號登入。登入與 session 建立流程 MUST 持續套用既有授權規則（白名單限制、帳號停用、角色指派與首次管理員開通機制），不得因新流程而繞過。

#### Scenario: ID Token 驗證失敗時拒絕登入
- **WHEN** `login` 收到 issuer 不符、Email 未驗證、aud 不符或缺少必要欄位的 ID Token
- **THEN** 後端回傳 `ok: false` 與明確錯誤代碼/訊息，且不建立 session

#### Scenario: 啟用網域限制時拒絕非允許網域帳號
- **WHEN** 系統已設定允許登入網域且使用者帳號網域不符
- **THEN** 後端拒絕 `login` 或 `loginWithActiveUser` 並回傳可理解的授權錯誤

### Requirement: Session 與 CSRF 保護
系統 SHALL 為成功登入與有效 session 還原流程提供 session token 與 CSRF token。所有寫入型 Web API action MUST 驗證 CSRF token 與有效 session；驗證失敗時 MUST 拒絕請求且不得執行資料寫入。登出與 session 失效流程 MUST 清除或使對應憑證失效，避免舊憑證持續用於寫入。

#### Scenario: 寫入型請求缺少或帶錯 CSRF token
- **WHEN** 已登入使用者呼叫寫入型 action 但未提供或提供錯誤的 CSRF token
- **THEN** 後端回傳 CSRF 驗證失敗錯誤且不執行寫入操作

#### Scenario: 登入成功後前端可取得 session 與 CSRF token
- **WHEN** 使用者透過任一支援的登入路徑成功登入
- **THEN** 回應包含可用的 session token 與 csrfToken，前端可用於後續 API 呼叫與寫入驗證
