# d2r-service 後端開發計劃

## 專案概述

將 `iya-backup` 靜態 HTM 網站的**結構化資料**抽出，以 NestJS REST API 提供給 `d2rfe` 前端使用。

## 技術棧

| 項目 | 技術 |
|------|------|
| 框架 | NestJS + TypeScript |
| 資料庫 | SQLite（via TypeORM） |
| HTML 解析 | Cheerio |
| 資料來源 | `/Users/derekyang/iya-backup/htm/*.htm` |
| Port | 3001 |

---

## 目錄結構

```
d2r-service/
├── src/
│   ├── app.module.ts
│   ├── main.ts
│   ├── database/
│   │   └── database.module.ts       ← TypeORM SQLite 設定
│   ├── items/                       ← 獨特物品（武器/防具/職業專屬）
│   │   ├── items.module.ts
│   │   ├── items.controller.ts
│   │   ├── items.service.ts
│   │   └── entities/item.entity.ts
│   ├── sets/                        ← 成套裝備
│   │   ├── sets.module.ts
│   │   ├── sets.controller.ts
│   │   ├── sets.service.ts
│   │   └── entities/
│   │       ├── set.entity.ts
│   │       ├── set-member.entity.ts
│   │       └── set-bonus.entity.ts
│   ├── runewords/                   ← 符文字
│   │   ├── runewords.module.ts
│   │   ├── runewords.controller.ts
│   │   ├── runewords.service.ts
│   │   └── entities/runeword.entity.ts
│   ├── builds/                      ← 角色攻略
│   │   ├── builds.module.ts
│   │   ├── builds.controller.ts
│   │   ├── builds.service.ts
│   │   └── entities/build.entity.ts
│   ├── ias/                         ← IAS 攻擊速度計算器
│   │   ├── ias.module.ts
│   │   ├── ias.controller.ts
│   │   ├── ias.service.ts           ← 含計算邏輯
│   │   └── entities/ias-breakpoint.entity.ts
│   ├── crafted/                     ← 手工藝品
│   │   ├── crafted.module.ts
│   │   ├── crafted.controller.ts
│   │   ├── crafted.service.ts
│   │   └── entities/crafted-item.entity.ts
│   ├── announcements/               ← 公告欄
│   │   ├── announcements.module.ts
│   │   ├── announcements.controller.ts
│   │   ├── announcements.service.ts
│   │   └── entities/announcement.entity.ts
│   └── parser/                      ← Cheerio 解析器（供 import 腳本使用）
│       ├── parseItems.ts
│       ├── parseSets.ts
│       ├── parseRunewords.ts
│       ├── parseBuilds.ts
│       ├── parseIAS.ts
│       ├── parseCrafted.ts
│       └── parseAnnouncements.ts
├── scripts/
│   └── import.ts                    ← 批次執行所有解析器 → 寫入 SQLite
├── data/                            ← 解析後的中間 JSON（版本控管用）
│   ├── items.json
│   ├── sets.json
│   ├── runewords.json
│   ├── builds.json
│   ├── ias.json
│   └── crafted.json
├── d2r.sqlite                       ← SQLite 資料庫檔案（gitignore）
└── package.json
```

---

## Phase 0｜專案初始化

- [ ] `nest new d2r-service` 建立 NestJS 專案
- [ ] 安裝依賴：`@nestjs/typeorm typeorm better-sqlite3 cheerio @nestjs/config`
- [ ] 設定 TypeORM SQLite 連線（`database.module.ts`）
- [ ] 設定 CORS（允許 `http://localhost:5173`）
- [ ] 驗證：`npm run start:dev` 啟動正常

---

## Phase 1｜TypeORM Entities（資料庫 Schema）

### Item（獨特物品）
```typescript
@Entity()
class Item {
  @PrimaryGeneratedColumn() id: number
  @Column() name_zh: string          // 牙齒
  @Column() name_en: string          // The Gnasher
  @Column() category: string         // axes | bows | armors | helms ...
  @Column() tier: string             // normal | exceptional | elite
  @Column({ nullable: true }) class_restrict: string  // null | barbarian ...
  @Column({ nullable: true }) image_path: string
  @Column({ nullable: true }) base_type: string       // 手斧 / Hand Axe
  @Column({ nullable: true }) level_req: number
  @Column('text') stats: string      // JSON: [{ label, value, color }]
}
```

### Set / SetMember / SetBonus（成套裝備）
```typescript
@Entity() class ItemSet {
  id, name_zh, name_en
  @OneToMany() members: SetMember[]
  @OneToMany() bonuses: SetBonus[]
}
@Entity() class SetMember { id, set_id, item_name_zh, slot }
@Entity() class SetBonus { id, set_id, pieces_required: number, effects: string }
```

### Runeword（符文字）
```typescript
@Entity() class Runeword {
  id, name_zh, name_en
  slot: string         // weapon | armor | shield | helm
  socket_count: number
  runes: string        // JSON: ['Amn', 'Tir']
  version: string      // 1.09 | 1.10 | 1.11 | 1.13
  effects: string      // JSON: string[]
}
```

### Build（角色攻略）
```typescript
@Entity() class Build {
  id
  class: string        // barbarian | amazon | assassin | druid | necromancer | paladin | sorceress
  name: string         // 近戰野蠻人
  test_info: string    // 測試等級：地獄 毀滅的王座 8人難度
  stats: string        // JSON: { str, dex, vit, ene, ... }
  skills: string       // JSON: [{ name, points, priority }]
  gear: string         // JSON: [{ slot, item_name_zh, socket, props }]
  video_url: string
  save_url: string
}
```

### IasBreakpoint（IAS 計算器）
```typescript
@Entity() class IasBreakpoint {
  id
  merc_type: string    // act1 | act2 | act5
  weapon_type: string
  base_speed: number
  breakpoints: string  // JSON: [{ ias_required, frames, attacks_per_sec }]
}
```

### CraftedItem（手工藝品）
```typescript
@Entity() class CraftedItem {
  id
  category: string     // hit | life | cast | defense
  name_zh: string
  base_type: string
  ingredients: string  // JSON: [{ type, name }]
  fixed_effects: string // JSON: string[]
}
```

### Announcement（公告欄）
```typescript
@Entity() class Announcement {
  id
  date: string
  content: string
}
```

- [ ] 建立所有 entity 檔案
- [ ] `synchronize: true` 自動建表
- [ ] 驗證：啟動後 SQLite 檔案自動建立

---

## Phase 2｜Cheerio 解析器

### 原始 HTM 分類對應

| 解析器 | 來源 HTM | 資料量 |
|--------|----------|--------|
| `parseItems.ts` | Axes1-3, Bows1-3, Swords1-3, Armors1-3, Helms1-3... | ~36 檔 |
| `parseClassItems.ts` | baritem, amaitem, assitem, druitem, necitem, palitem, soritem | 7 檔 |
| `parseSets.ts` | Set01–Set32 | 32 檔 |
| `parseRunewords.ts` | runewa–d, Trunewa–d, 1.11runew | ~10 檔 |
| `parseBuilds.ts` | BAR1–12, AMA1–7, ASS1–7, DRU1–8, NEC1–9, PAL1–12, SOR1–14 | ~60 檔 |
| `parseIAS.ts` | ACT1IAS, ACT2IAS, ACT5IAS | 3 檔 |
| `parseCrafted.ts` | crafteditems.htm | 1 檔 |
| `parseAnnouncements.ts` | right.htm, newright.htm | 2 檔 |

### 解析規則（各類型）

**獨特物品（Axes1.htm 為例）**
```
每個 <tr> = 一件物品
  <td>[0]：
    <a name="..."> → anchor（中文名）
    <img src> → image_path
    第一個 <b> → name_zh
    黃色 <font> → name_en + base_type（英文）
    下一行文字 → base_type（中文）
  <td>[1]：
    逐行解析 → stats[]
    顏色 class → color（青色=#00FFFF / 紫色=#FF00FF）
```

**符文字（runewa.htm 為例）**
```
每個 <tr>（跳過 header）= 一條符文字
  col[0]：name_zh（金色 font）+ name_en（黃色 font）
  col[1]：符文名稱列表（"Amn安姆(11)+Tir特爾(3)" → ['Amn','Tir']）
  col[2]：凹槽數 + 底座類型
  col[3]：效果列表（逐行）
```

**角色攻略（BAR1.htm 為例）**
```
<p align="center"> 第一個 → build name
<font color="#00ffff"> 測試等級 → test_info
第一個 <table border="1"> → stats 配點（左欄 / 右欄）
<object>/<embed> src → video_url
<a href="*.rar"> → save_url
第二個 <table border="1"> → gear[]（4欄：分類/名稱/鑲入/屬性）
```

- [ ] 實作 `parseItems.ts`（最多樣，先做）
- [ ] 實作 `parseRunewords.ts`
- [ ] 實作 `parseBuilds.ts`
- [ ] 實作 `parseSets.ts`
- [ ] 實作 `parseIAS.ts`
- [ ] 實作 `parseCrafted.ts`
- [ ] 實作 `parseAnnouncements.ts`
- [ ] 實作 `scripts/import.ts`（批次執行，輸出 JSON + 寫入 SQLite）
- [ ] 驗證：執行 import 後資料筆數正確

---

## Phase 3｜NestJS API 路由

### 端點清單

```
# 獨特物品
GET  /api/items                   ?category=axes&tier=normal&class=all
GET  /api/items/:id

# 成套裝備
GET  /api/sets
GET  /api/sets/:id                → 含 members + bonuses

# 符文字
GET  /api/runewords               ?slot=weapon&version=1.13
GET  /api/runewords/:id

# 角色攻略
GET  /api/builds                  ?class=barbarian
GET  /api/builds/:id

# IAS 計算器
GET  /api/ias/table               ?merc=act2&weapon=spear
GET  /api/ias/calculate           ?merc=act2&weapon=spear&ias=30
                                  → { frames, attacks_per_sec, next_breakpoint }

# 手工藝品
GET  /api/crafted                 ?category=hit

# 公告欄
GET  /api/announcements
```

### 統一回應格式
```json
{ "data": [...], "total": 42 }
```

- [ ] 實作 `items` module（controller + service）
- [ ] 實作 `sets` module
- [ ] 實作 `runewords` module
- [ ] 實作 `builds` module
- [ ] 實作 `ias` module（含計算邏輯）
- [ ] 實作 `crafted` module
- [ ] 實作 `announcements` module
- [ ] 驗證：curl 各端點回傳正確資料

---

## 進度追蹤

| Phase | 狀態 | 備註 |
|-------|------|------|
| 0 初始化 | 待開始 | |
| 1 Entities | 待開始 | |
| 2 解析器 | 待開始 | |
| 3 API | 待開始 | |
