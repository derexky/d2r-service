# 掛單對應物品設計

## 目標

- 每筆掛單可以對應到一個明確的物品（`item_ref`），不靠名稱文字比對。
- OCR 只負責預選，辨識錯誤時，使用者可以搜尋並改選正確的物品。
- 列表可以依物品篩選。

不做：物品圖片、屬性搜尋、和成交查價比價。

## 物品清單

由 d2r-service 的 `GET /api/trades/items` 提供，回傳 `{ data: TradeItem[] }`：

```ts
interface TradeItem {
  ref: string;
  name: string;
  kind: 'item' | 'runeword' | 'rune' | 'base' | 'misc';
  category: string | null;
  slot?: string; // runewords only: weapon | armor | shield | helm
}
```

| kind | 來源 | ref | category |
|---|---|---|---|
| item | `items` | `item:<id>` | `items.category` |
| runeword | `runewords` | `runeword:<id>` | `null`，使用者自己選；另帶 `slot` |
| rune | `runes` | `rune:<number>` | `runes` |
| base | `base_items`，依 `item_id` 去重 | `base:<item_id>` | `gid` 換算後的值 |
| misc | 寫在程式裡 | `misc:<code>` | `keys` 或 `statues` |

`base` 的 `gid` 換算規則：

- `clubs`、`puremaces`、`hammers` → `maces`
- `throwings` → `throwing`
- `pal-shields` → `shields`
- `orbs`、`katars` → `class_specific`
- 其餘 `gid` 原樣沿用

`misc` 共 8 個：

- 鑰匙：`pk1` 恐懼之鑰、`pk2` 憎恨之鑰、`pk3` 毀滅之鑰
- 先祖雕像：`talic` 塔力克的怨慟、`korlic` 科力克的苦痛、`madawc` 馬道克的怒火、`bulkathos` 布爾凱索的夢魘、`worusk` 沃魯斯克的終結

物品資料庫在執行期間是唯讀的，所以清單只在第一次請求時建立，之後都用快取。

## 選項顯示

前端組合選項的顯示文字，格式為「名稱（種類・分類）」：

- item → `名稱（分類）`，例如「族長（斧類）」
- runeword → `名稱（符文之語・部位）`，部位為武器／盔甲／盾牌／頭盔。同一個符文之語可以做在不同部位，屬性也不同，例如精神有武器版和盾牌版
- rune → `名稱（符文）`
- base → `名稱（底材・分類）`
- misc → `名稱（分類）`

組合後的顯示文字必須唯一，實作時用真實資料庫驗證。

## 儲存與 API

**d2r-traderie**

- `trades` 新增 `item_ref TEXT`，沿用 `owner_uid` 的 PRAGMA 遷移方式。
- `GET /api/trades` 接受 `category`、`item_ref` 兩個參數，可以組合使用。
- `POST` 接受 `item_ref`，可省略，省略時存 `NULL`。

**d2r-service**

- `GET /trades` 新增 `item_ref` 參數，原樣轉給 d2r-traderie。
- `POST /trades`：`item_ref` 有值時，必須存在於物品清單，否則回 400「未知的物品」。

## 前端

**`TRADE_CATEGORIES`**：在「其他」之前加入 `runes` 符文、`keys` 鑰匙、`statues` 先祖雕像。

**TradeNew**

- 物品名稱輸入框加上 `<datalist>`，選項是物品清單的顯示文字。
- 輸入的文字等於某個選項時，該物品即為已選取：
  - `item_name` 設為物品名稱，不含括號裡的說明。
  - `item_ref` 設為該物品的 `ref`。
  - `category` 為 `null` 以外的值時，帶入分類。
- 輸入的文字不等於任何選項時，`item_ref` 清空，`item_name` 就是輸入的文字。
- 輸入框下方顯示目前狀態：「已對應：顯示文字」或「未對應物品，可直接輸入名稱」。
- OCR 改成比對物品清單的名稱。比對成功時，自動選取該物品。同名的物品有多個時，優先選 `kind` 為 `item` 的。

**TradeList**

- 篩選加上 `item_ref` 條件。
- 跳出卡片上，有 `item_ref` 的物品名稱可以點，點了就依該物品篩選並關閉卡片。
- 篩選列顯示「物品：名稱 ✕」，按 ✕ 取消篩選。

## 測試

- d2r-service：
  - `TradeItemsService` 單元測試：各 kind 的 ref 與 category、base 去重、gid 換算。
  - controller 與 service 測試：POST 時 `item_ref` 不存在回 400；GET 會轉送 `item_ref`。
  - 用真實的 `d2r.sqlite` 驗證顯示文字沒有重複。
- d2r-traderie：curl 驗證 `item_ref` 欄位遷移、篩選條件組合。
- d2r-fe：build、lint，以及手動測試。
