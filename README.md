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
- DB：`/share/CACHEDEV1_DATA/homes/derexky/d2r-service-data/d2r.sqlite`（掛到容器的 `/data`，`DB_PATH` 指向它；映像檔不含 DB）
- 環境變數：`/share/homes/derexky/d2r-service.env`（`ADMIN_TOKEN`、`TRADERIE_URL=http://host.docker.internal:7432`、`TRADERIE_TOKEN`、`DB_PATH`、`FE_PUBLIC_DATA_DIR`）
- 容器：
  ```bash
  DOCKER_BUILDKIT=0 docker build -t d2r-service:latest /share/homes/derexky/d2r-service
  docker run -d --name d2r-service --network d2r --restart always \
    --add-host=host.docker.internal:host-gateway \
    -v /share/CACHEDEV1_DATA/homes/derexky/d2r-service-data:/data \
    --env-file /share/homes/derexky/d2r-service.env d2r-service:latest
  ```

### DB 在 NAS 和 repo 之間同步

NAS 那份是 myhost 後台改的對象，跟 repo 的 `d2r.sqlite` 是兩份檔案。**同一段時間只在一邊改**，否則拉回／推上會覆蓋另一邊的修改。

```bash
D=/share/CACHEDEV1_DATA/.qpkg/container-station/usr/bin/docker
DB=/share/CACHEDEV1_DATA/homes/derexky/d2r-service-data/d2r.sqlite

# 在 myhost 後台改完 → 拉回 repo，再 commit 並部署 Cloud Functions
ssh myhost "$D stop d2r-service >/dev/null && cat $DB; $D start d2r-service >/dev/null" > d2r.sqlite

# 在本機改了 repo 的 d2r.sqlite（腳本、匯入）→ 推上 NAS
ssh myhost "$D stop d2r-service >/dev/null && cat > $DB; $D start d2r-service >/dev/null" < d2r.sqlite
```

（停容器再複製，避免拷到寫到一半的檔案；DB 是 rollback journal 模式，停下來時檔案就是完整的。）

## 建置

```bash
npm run build
npm run start:prod
```
