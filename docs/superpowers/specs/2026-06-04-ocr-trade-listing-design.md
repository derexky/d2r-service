# D2R 交易掛單 + OCR 功能設計

**日期：** 2026-06-04
**範疇：** d2r-service（後端）+ d2r-fe（前端）

---

## 功能目標

讓玩家上傳 D2R 遊戲截圖，系統自動辨識物品名稱與屬性，填入交易掛單表單，玩家只需補填價格和聯絡方式即可快速發布交易。

---

## 架構總覽

```
玩家上傳截圖
    │
    ▼
Tesseract.js（瀏覽器端，chi_tra + eng）
    │ 辨識原始文字
    ▼
前端解析：第一行 → 物品名稱，其餘 → 屬性描述
    │ 自動填入表單欄位（可手動修改）
    ▼
玩家補填：價格 + 聯絡方式
    │ 送出
    ▼
POST /trades → NestJS → SQLite
```

---

## 後端：新增 `trades` 模組（d2r-service）

### Trade Entity

| 欄位 | 型態 | 說明 |
|---|---|---|
| id | number | Primary key，自動遞增 |
| item_name | string | 物品名稱（OCR 辨識，玩家可編輯） |
| item_stats_raw | text | 屬性原始文字，換行分隔（OCR 辨識，玩家可編輯） |
| price | string | 價格（自由文字，例：`3 Ber`、`FG 議價`） |
| contact | string | 聯絡方式（Discord tag 或遊戲 ID） |
| category | string | 物品類別（nullable，供篩選用） |
| created_at | datetime | 建立時間，自動填入 |

### API

**`GET /trades`**
- 回傳所有掛單（依 `created_at` 降冪排列）
- 支援 query param：`?category=rings`

**`POST /trades`**
- Body：`{ item_name, item_stats_raw, price, contact, category? }`
- 建立新掛單，回傳完整 Trade 物件

### 模組結構

```
src/trades/
  entities/
    trade.entity.ts
  trades.module.ts
  trades.controller.ts
  trades.service.ts
```

---

## 前端：新增 `trade` 頁面（d2r-fe）

### 路由

| 路徑 | 頁面 | 說明 |
|---|---|---|
| `/trade` | TradeList | 瀏覽所有掛單 |
| `/trade/new` | TradeNew | 建立掛單（含 OCR） |

### TradeNew 頁面（建立掛單）

**版面：左右分割**

- **左側：** 圖片上傳區 + OCR 辨識結果顯示
- **右側：** 表單（自動填入 + 手動補填）

**OCR 流程：**
1. 使用者拖曳或點選圖片（支援 PNG/JPG）
2. 瀏覽器執行 Tesseract.js（語言包：`chi_tra + eng`）
3. 辨識期間顯示 loading 狀態
4. 辨識完成後：
   - 原始文字第一行 → 填入 `item_name` 欄位
   - 其餘行 → 填入 `item_stats_raw` textarea
5. 所有欄位皆可手動修改
6. 送出前驗證：`item_name`、`price`、`contact` 不可空白

**表單欄位：**
- 物品名稱（text input）
- 屬性描述（textarea，多行，可編輯）
- 物品類別（select，可選，例：戒指 / 盔甲 / 武器 / 其他）
- 價格（text input，自由輸入）
- 聯絡方式（text input，Discord/遊戲 ID）

### TradeList 頁面（瀏覽掛單）

**樣式：緊湊列表**

每筆掛單一行顯示：
```
[類別圖示] 物品名稱 | 屬性摘要（截斷）... | 價格 | [聯繫按鈕]
```

- 點「聯繫」複製聯絡方式到剪貼簿
- 頂部有類別篩選 chips（全部 / 戒指 / 盔甲 / 武器 / ...）
- 依建立時間降冪排列（最新在上）

### API 整合（src/api/index.ts）

新增：
- `getTrades(params?)` → `GET /trades`
- `createTrade(body)` → `POST /trades`

---

## OCR 技術選擇

- **套件：** `tesseract.js` v4（瀏覽器端，無需後端安裝）
- **語言：** `chi_tra`（繁體中文）+ `eng`（英文，物品英文名）
- **限制：** D2R 彩色文字在黑色背景上辨識率偏低，玩家需預期手動校正

---

## 未在此次範疇內

- 使用者帳號 / 登入系統（掛單無需帳號，用聯絡方式取代）
- 圖片上傳儲存（OCR 後不保留原始圖片）
- 掛單刪除 / 下架（後續可加）
- 交易議價 / 訊息系統（後續可加）
