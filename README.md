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

## myhost（d2r-admin 後端）

d2r-admin 的線上版在 myhost，後端是這個 repo 用 `Dockerfile` 建的容器，只開 docker 網路 `d2r` 給 d2r-admin 的 nginx 連，不對外。正式 API 仍在 Cloud Functions。

- 原始碼：`/share/homes/derexky/d2r-service`（不是 git repo，`.deployed-commit` 記錄已部署的 commit）
- data volume：`/share/CACHEDEV1_DATA/homes/derexky/d2r-service-data`（掛到容器的 `/data`，放 GCS 金鑰；DB 正本在 GCS，見下方）
- 環境變數：`/share/homes/derexky/d2r-service.env`（`CF_ACCESS_TEAM_DOMAIN=ancient-water-976c.cloudflareaccess.com`、`CF_ACCESS_AUD`（d2r-admin 這個 Access 應用程式的 AUD tag）：設了就只認 Cloudflare Access 的 JWT，不看 `ADMIN_TOKEN`；`TRADERIE_URL=https://traderie.derexky.com`（QNAP 擋掉容器從自訂網路連回 host 的 7432，所以走公開網址）、`TRADERIE_TOKEN`，以及下面 GCS 那幾個）
- 容器：
  ```bash
  DOCKER_BUILDKIT=0 docker build -t d2r-service:latest /share/homes/derexky/d2r-service
  docker run -d --name d2r-service --network d2r --restart always \
    -v /share/CACHEDEV1_DATA/homes/derexky/d2r-service-data:/data \
    --env-file /share/homes/derexky/d2r-service.env d2r-service:latest
  ```

### 遊戲資料 DB：正本在 GCS

`d2r.sqlite` 的正本是 GCS 上的一個物件（`DB_GCS_URI=gs://<bucket>/d2r.sqlite`），見 `src/database/db-sync.service.ts`：

- 每個程序啟動時下載最新版到本機，之後每個請求最多每分鐘問一次 GCS 有沒有新版，有就換上。
- admin 的新增／修改／刪除在同一個請求內把整個 DB 上傳回 GCS（只有設了 `DB_GCS_WRITE=true` 的環境能寫，也就是 myhost）。上傳用 `ifGenerationMatch`，期間若有別人上傳過，這次修改會被撤回並回 409。
- 正式站（Cloud Functions）只讀，後台改完最多一分鐘生效，不用重新部署。
- 沒設 `DB_GCS_URI` 時照舊用本機檔案（`DB_PATH` 或 repo 的 `d2r.sqlite`），本機開發不受影響。

各環境要設的變數：

| 環境 | 變數 |
|---|---|
| Cloud Functions | `.env` 加 `DB_GCS_URI`；執行的 service account 要有該 bucket 的 `storage.objects.get` |
| myhost 容器 | env 檔加 `DB_GCS_URI`、`DB_GCS_WRITE=true`、`GOOGLE_APPLICATION_CREDENTIALS=/data/gcs-key.json`（service account 金鑰放在 data volume，要有 `roles/storage.objectUser`）；`DB_PATH` 不再需要 |

用腳本或匯入改 DB 時，先拉最新版、改完再推回去（`--if-generation-match` 防止蓋掉期間後台的修改）：

```bash
URI=gs://<bucket>/d2r.sqlite
GEN=$(gcloud storage objects describe $URI --format='value(generation)')
gcloud storage cp $URI d2r.sqlite
# ...跑腳本改 d2r.sqlite...
gcloud storage cp d2r.sqlite $URI --if-generation-match=$GEN
```

repo 裡的 `d2r.sqlite` 只是本機開發用的副本，也是 Cloud Functions 沒設 `DB_GCS_URI` 時的備援。

## 建置

```bash
npm run build
npm run start:prod
```
