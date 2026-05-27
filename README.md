# d2r-service

易牙居 Diablo II: Resurrected 資料庫後端，使用 NestJS + SQLite 建置。

解析 `iya-backup/htm/` 中的原始 HTML 檔案，匯入 SQLite，再透過 REST API 提供給前端。

## 技術棧

- NestJS 11 + TypeScript
- TypeORM + better-sqlite3
- Cheerio（HTML 解析）

## API 端點

| 端點 | 說明 |
|------|------|
| `GET /items` | 獨特裝備列表，支援 `category`、`tier`、`class`、`search` 篩選 |
| `GET /items/:id` | 單筆裝備 |
| `GET /sets` | 套裝列表 |
| `GET /sets/:id` | 套裝詳情（含成員與加成） |
| `GET /runewords` | 符文字列表，支援 `slot` 篩選 |
| `GET /builds` | 攻略列表，支援 `class` 篩選 |
| `GET /builds/:id` | 攻略詳情 |
| `GET /ias/weapons` | IAS 可用武器類型 |
| `GET /ias/table` | IAS 斷點表 |
| `GET /ias/calculate` | 計算攻速斷點 |
| `GET /announcements` | 公告欄 |

所有列表端點回傳 `{ data: T[], total: number }`，單筆端點回傳 `{ data: T }`。

## 開發

```bash
npm install
npm run start:dev
```

伺服器預設監聽 `http://localhost:3000`。

## 資料匯入

需先確認 `iya-backup` 專案位於 `/Users/derekyang/iya-backup`。

```bash
npm run import
```

腳本會清空舊資料，重新解析所有 HTML 並寫入 `d2r.sqlite`。

## 建置

```bash
npm run build
npm run start:prod
```
