## Purpose

定義操作日誌讀取動作的角色權限邊界與管理員角色的明確列舉規則，確保日誌內容僅由系統管理員取得，且後端驗證不依賴前端隱藏或隱式通配。

## ADDED Requirements

### Requirement: 操作日誌讀取動作限系統管理員

`getActivityLog` MUST 在 `ACTIONS` 登錄表中明確宣告僅 `admin` 可呼叫，且 MUST NOT 被加入任何非管理員角色的授權清單。管理員角色由角色權限產生函式明確列舉所有已登錄 action，MUST NOT 使用 `["*"]` 之類的隱式通配規則；既有 `api.test.js` 等 RBAC 測試 MUST 隨此變更回歸通過。非管理員呼叫時後端 MUST 拒絕並回傳通用的禁止存取錯誤，不得回傳任何日誌內容；前端操作日誌頁籤 MUST 依角色過濾，不得僅依靠前端隱藏作為唯一防線。

#### Scenario: 管理員可讀取操作日誌

- **WHEN** 系統管理員呼叫 `getActivityLog`
- **THEN** 回傳分頁的日誌清單，含概要欄位與詳情

#### Scenario: 非管理員呼叫被拒絕

- **WHEN** `staff` 或 `viewer` 角色呼叫 `getActivityLog`
- **THEN** 後端回傳禁止存取錯誤，且不回傳任何日誌內容

#### Scenario: 前端隱藏不取代後端驗證

- **WHEN** 非管理員以任何方式繞過前端直接發送 `getActivityLog` 請求
- **THEN** 後端仍拒絕請求，不會因為前端隱藏而放行

#### Scenario: 管理員權限採明確列舉

- **WHEN** 查詢管理員角色的授權清單
- **THEN** 清單明確列出所有已登錄 action（含 `getActivityLog`），且不含 `*` 通配項目
