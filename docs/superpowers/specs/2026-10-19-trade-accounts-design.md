# 交易市集帳號系統設計

## 目標

- 發布掛單需要用 Google 帳號登入。
- 聯絡方式只給登入的使用者看。
- 賣家可以下架自己的掛單。

不做：管理員刪除、編輯掛單、「我的掛單」頁、限流、其他登入方式。

## 架構

```
d2r-fe ──Bearer idToken──▶ d2r-service (Firebase function) ──x-api-token + owner_uid──▶ d2r-traderie (NAS SQLite)
```

- d2r-service 是唯一對外的驗證點：用 `firebase-admin` 驗證 Firebase ID token，取出 `uid`。
- d2r-traderie 只認 API token，信任 d2r-service 傳來的 `owner_uid`。
- `owner_uid` 不會傳到前端。

## d2r-traderie

- `trades` 表新增欄位 `owner_uid TEXT`。啟動時用 `PRAGMA table_info(trades)` 檢查，沒有這個欄位就 `ALTER TABLE trades ADD COLUMN owner_uid TEXT`。
- `GET /api/trades?category=`：維持不變，回傳完整資料列，包含 `owner_uid`。
- `POST /api/trades`：除了原本的必填欄位，`owner_uid` 也必填，缺少回 400。
- `DELETE /api/trades/:id?owner_uid=<uid>`：執行 `DELETE ... WHERE id = ? AND owner_uid = ?`，沒有刪到任何資料列就回 404，成功回 `{ id }`。

## d2r-service

- 新增 `src/auth/firebase-auth.ts`：`getUid(req): Promise<string | null>`
  - 讀取 `Authorization: Bearer <token>`，用 `firebase-admin` 的 `verifyIdToken` 驗證。
  - 沒有帶 token 或驗證失敗都回 `null`。
- `GET /trades`
  - 不需登入，`uid` 可以是 `null`。
  - 每筆資料移除 `owner_uid`，另加 `mine = (uid !== null && owner_uid === uid)`。
  - `uid` 為 `null` 時移除 `contact`。
  - 回應格式維持 `{ data, total }`。
- `POST /trades`
  - `uid` 為 `null` 時回 401。
  - 轉發給 d2r-traderie 時，`owner_uid` 一律設為 `uid`，body 裡傳來的 `owner_uid` 會被忽略。
  - 回應的那筆資料同樣移除 `owner_uid`。
- `DELETE /trades/:id`
  - `uid` 為 `null` 時回 401。
  - 轉發給 d2r-traderie 的 `DELETE`，d2r-traderie 回 404 時原樣傳回前端。

## d2r-fe

- 新增依賴 `firebase`，新增 `src/auth.ts`，內容包括：
  - `initializeApp`（設定值放在 `VITE_FIREBASE_*` 環境變數）
  - `signInWithPopup(GoogleAuthProvider)`、`signOut`
  - `useUser()` hook，以 `onAuthStateChanged` 為基礎
- axios client 加 interceptor：已登入時帶上 `Authorization: Bearer ${await user.getIdToken()}`。
- 導覽列加上登入／登出按鈕，登入後顯示使用者名稱。
- `TradeList`
  - 沒登入時，聯絡方式按鈕顯示「登入查看」，點了會開啟登入視窗。
  - `mine` 為 true 的掛單顯示「下架」按鈕，確認後呼叫 `DELETE` 並重新抓列表。
  - 登入或登出時重新抓列表：`queryKey` 加上 `uid`。
- `TradeNew`：沒登入時不顯示表單，只顯示登入提示和登入按鈕。

## 錯誤處理

- token 過期：`getIdToken()` 會自動更新。
- 收到 401：前端顯示「請重新登入」。
- 下架時收到 404：前端顯示「掛單不存在」，並重新抓列表。

## 測試

- d2r-service `trades.service.spec.ts` 或 controller spec，mock `fetch` 和 `getUid`，涵蓋以下情境：
  - 沒登入時的 GET：沒有 `contact` 和 `owner_uid`，`mine` 為 false。
  - 已登入時的 GET：有 `contact`，自己的掛單 `mine` 為 true。
  - POST 時 body 帶了別人的 `owner_uid`：轉發出去的仍是 token 裡的 `uid`。
  - 沒登入時 POST 或 DELETE：回 401。
- d2r-traderie：本機用暫時的資料庫啟動，用 curl 驗證：
  - `owner_uid` 必填。
  - 用錯的 `owner_uid` 刪除回 404，用對的刪除成功。
  - 欄位遷移：已經存在、但沒有 `owner_uid` 欄位的表，啟動後會補上。

## 部署順序

1. 在 Firebase Console 啟用 Google 登入，並把正式網域加進 Authorized domains。
2. 部署 d2r-traderie（遷移欄位，新增 DELETE）。
3. 部署 d2r-service 的 `api` function。
4. 部署 d2r-fe hosting，需要先設好 `VITE_FIREBASE_*`。
