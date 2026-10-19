# 掛單對應物品 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每筆掛單存一個明確的物品 `item_ref`。OCR 只負責預選，辨識錯了使用者可以搜尋改選；列表可以依物品篩選。

**Architecture:** d2r-service 從自己的唯讀物品資料庫（`items`、`runewords`、`runes`、`base_items`），加上寫在程式裡的鑰匙與雕像，組成物品清單，提供 `GET /api/trades/items`，也用這份清單檢查 POST 的 `item_ref`。d2r-traderie 的 `trades` 表新增 `item_ref` 欄位並支援依它篩選。前端用 `<datalist>` 選物品。

**Tech Stack:** NestJS 11 + TypeORM（d2r-service，Jest）、`node:sqlite`（d2r-traderie）、React 19 + TanStack Query（d2r-fe）。

Spec：`d2r-service/docs/superpowers/specs/2026-10-19-trade-item-refs-design.md`

每個 repo 都在 `feat/trade-item-refs` 分支上開發。d2r-service 和 d2r-fe 的工作目錄裡有使用者自己未提交的檔案，commit 時一律用 pathspec：`git commit -m ... -- <files>`。

---

### Task 1: d2r-traderie — `item_ref` 欄位與篩選

**Files:** Modify `d2r-traderie/src/trades/trades.service.ts`、`d2r-traderie/src/trades/trades.controller.ts`

- [ ] **Step 1: service**

在 `trades.service.ts`：

1. `NewTrade` 加上 `item_ref: string | null;`。
2. `CREATE TABLE` 的欄位清單在 `owner_uid      TEXT` 後面加一行 `item_ref       TEXT`（記得在 `owner_uid TEXT` 後補逗號）。
3. 把遷移那段：
```ts
    // tables created before accounts existed have no owner column
    const cols = this.db.prepare('PRAGMA table_info(trades)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'owner_uid')) this.db.exec('ALTER TABLE trades ADD COLUMN owner_uid TEXT');
```
換成：
```ts
    // tables created by earlier versions lack the newer columns
    const cols = this.db.prepare('PRAGMA table_info(trades)').all() as { name: string }[];
    for (const col of ['owner_uid', 'item_ref']) {
      if (!cols.some((c) => c.name === col)) this.db.exec(`ALTER TABLE trades ADD COLUMN ${col} TEXT`);
    }
```
4. `findAll` 換成：
```ts
  findAll(filters: { category?: string; item_ref?: string }) {
    const entries = Object.entries(filters).filter(([, v]) => v !== undefined) as [string, string][];
    const where = entries.length ? `WHERE ${entries.map(([k]) => `${k} = ?`).join(' AND ')}` : '';
    return this.db.prepare(`SELECT * FROM trades ${where} ORDER BY id DESC`).all(...entries.map(([, v]) => v));
  }
```
（鍵只會是 controller 傳入的 `category`、`item_ref`，不是使用者輸入，所以直接放進 SQL 沒有注入問題。）
5. `create` 的 INSERT 加上 `item_ref`：
```ts
      .prepare(
        `INSERT INTO trades (item_name, item_stats_raw, price, contact, category, owner_uid, item_ref)
         VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(t.item_name, t.item_stats_raw, t.price, t.contact, t.category, t.owner_uid, t.item_ref);
```

- [ ] **Step 2: controller**

```ts
  @Get()
  findAll(@Query('category') category?: string, @Query('item_ref') item_ref?: string) {
    return this.svc.findAll({ category, item_ref });
  }
```
`create` 傳給 service 的物件加 `item_ref: str('item_ref') || null,`。

- [ ] **Step 3: 驗證**

`npx tsc --noEmit -p tsconfig.json` 無輸出。接著用以下指令做端對端測試，`$S` 是 scratchpad：

```bash
cd /Users/derekyang/D2R/d2r-traderie && S=<scratchpad>
rm -f "$S/t5.db" "$S/t5.db-shm" "$S/t5.db-wal"
sqlite3 "$S/t5.db" "CREATE TABLE trades (id INTEGER PRIMARY KEY AUTOINCREMENT, item_name TEXT NOT NULL, item_stats_raw TEXT, price TEXT NOT NULL, contact TEXT NOT NULL, category TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), owner_uid TEXT);"
npx nest build >/dev/null
(DB_PATH="$S/t5.db" PORT=7498 node dist/src/main > "$S/tr5.log" 2>&1 &)
for i in $(seq 1 60); do curl -s localhost:7498/api/trades >/dev/null && break; sleep 0.5; done
sqlite3 "$S/t5.db" "PRAGMA table_info(trades)" | grep item_ref
P='content-type: application/json'
curl -s -XPOST localhost:7498/api/trades -H "$P" -d '{"item_name":"A","price":"1","contact":"c","owner_uid":"u","category":"charms","item_ref":"item:1"}' >/dev/null
curl -s -XPOST localhost:7498/api/trades -H "$P" -d '{"item_name":"B","price":"1","contact":"c","owner_uid":"u","category":"charms"}' >/dev/null
curl -s -XPOST localhost:7498/api/trades -H "$P" -d '{"item_name":"C","price":"1","contact":"c","owner_uid":"u","category":"rings","item_ref":"item:1"}' >/dev/null
curl -s 'localhost:7498/api/trades?item_ref=item:1' | grep -o '"item_name":"[A-Z]"' | tr '\n' ' '; echo
curl -s 'localhost:7498/api/trades?item_ref=item:1&category=charms' | grep -o '"item_name":"[A-Z]"'; echo
curl -s 'localhost:7498/api/trades' | grep -o '"item_name":"[A-Z]"' | wc -l
lsof -ti tcp:7498 -sTCP:LISTEN | xargs kill
```
Expected：`9|item_ref|TEXT|0||0`；`"item_name":"C" "item_name":"A"`；`"item_name":"A"`；`3`。

- [ ] **Step 4: Commit** `feat(trades): store which catalog item a listing is for and filter by it`

---

### Task 2: d2r-service — 物品清單

**Files:** Create `src/trades/trade-items.service.ts`、`src/trades/trade-items.service.spec.ts`

- [ ] **Step 1: 失敗的測試** `src/trades/trade-items.service.spec.ts`

```ts
import { TradeItemsService } from './trade-items.service';

const repo = (rows: object[]) => ({ find: jest.fn().mockResolvedValue(rows) });

function make() {
  const items = repo([{ id: 18412, name_zh: '新生天堂裂擊', category: 'charms' }]);
  const runewords = repo([{ id: 5, name_zh: '謎團' }]);
  const runes = repo([{ number: 30, name_zh: '貝' }]);
  const bases = repo([
    { item_id: 'crown_shield', name_zh: '冠冕之盾', gid: 'shields' },
    { item_id: 'crown_shield', name_zh: '冠冕之盾', gid: 'pal-shields' },
    { item_id: 'war_hammer', name_zh: '戰鎚', gid: 'hammers' },
    { item_id: 'katar', name_zh: '拳刃', gid: 'katars' },
  ]);
  return {
    service: new TradeItemsService(items as never, runewords as never, runes as never, bases as never),
    items,
  };
}

describe('TradeItemsService', () => {
  it('lists every source with refs and categories', async () => {
    const list = await make().service.all();
    expect(list).toEqual(
      expect.arrayContaining([
        { ref: 'item:18412', name: '新生天堂裂擊', kind: 'item', category: 'charms' },
        { ref: 'runeword:5', name: '謎團', kind: 'runeword', category: null },
        { ref: 'rune:30', name: '貝', kind: 'rune', category: 'runes' },
        { ref: 'base:war_hammer', name: '戰鎚', kind: 'base', category: 'maces' },
        { ref: 'base:katar', name: '拳刃', kind: 'base', category: 'class_specific' },
        { ref: 'misc:pk1', name: '恐懼之鑰', kind: 'misc', category: 'keys' },
        { ref: 'misc:talic', name: '塔力克的怨慟', kind: 'misc', category: 'statues' },
      ]),
    );
  });

  it('keeps one entry per base item', async () => {
    const list = await make().service.all();
    expect(list.filter((t) => t.ref === 'base:crown_shield')).toEqual([
      { ref: 'base:crown_shield', name: '冠冕之盾', kind: 'base', category: 'shields' },
    ]);
  });

  it('builds the list once', async () => {
    const { service, items } = make();
    await service.all();
    await service.all();
    expect(items.find).toHaveBeenCalledTimes(1);
  });

  it('finds an item by ref', async () => {
    const { service } = make();
    expect(await service.find('misc:pk3')).toMatchObject({ name: '毀滅之鑰' });
    expect(await service.find('item:999')).toBeUndefined();
  });
});
```

Run `npx jest src/trades/trade-items` → FAIL（找不到模組）。

- [ ] **Step 2: 實作** `src/trades/trade-items.service.ts`

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Item } from '../items/entities/item.entity';
import { Runeword } from '../runewords/entities/runeword.entity';
import { Rune } from '../reference/entities/rune.entity';
import { BaseItem } from '../base-items/entities/base-item.entity';

export interface TradeItem {
  ref: string;
  name: string;
  kind: 'item' | 'runeword' | 'rune' | 'base' | 'misc';
  category: string | null;
}

// base_items.gid values that differ from items.category
const BASE_CATEGORY: Record<string, string> = {
  clubs: 'maces',
  puremaces: 'maces',
  hammers: 'maces',
  throwings: 'throwing',
  'pal-shields': 'shields',
  orbs: 'class_specific',
  katars: 'class_specific',
};

// Tradeable items the item DB doesn't have
const MISC: TradeItem[] = [
  { ref: 'misc:pk1', name: '恐懼之鑰', kind: 'misc', category: 'keys' },
  { ref: 'misc:pk2', name: '憎恨之鑰', kind: 'misc', category: 'keys' },
  { ref: 'misc:pk3', name: '毀滅之鑰', kind: 'misc', category: 'keys' },
  { ref: 'misc:talic', name: '塔力克的怨慟', kind: 'misc', category: 'statues' },
  { ref: 'misc:korlic', name: '科力克的苦痛', kind: 'misc', category: 'statues' },
  { ref: 'misc:madawc', name: '馬道克的怒火', kind: 'misc', category: 'statues' },
  { ref: 'misc:bulkathos', name: '布爾凱索的夢魘', kind: 'misc', category: 'statues' },
  { ref: 'misc:worusk', name: '沃魯斯克的終結', kind: 'misc', category: 'statues' },
];

@Injectable()
export class TradeItemsService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(Runeword) private readonly runewords: Repository<Runeword>,
    @InjectRepository(Rune) private readonly runes: Repository<Rune>,
    @InjectRepository(BaseItem) private readonly bases: Repository<BaseItem>,
  ) {}

  // The item DB is read-only at runtime, so the list is built once
  private list?: Promise<TradeItem[]>;

  all(): Promise<TradeItem[]> {
    return (this.list ??= this.build());
  }

  async find(ref: string): Promise<TradeItem | undefined> {
    return (await this.all()).find((t) => t.ref === ref);
  }

  private async build(): Promise<TradeItem[]> {
    const [items, runewords, runes, bases] = await Promise.all([
      this.items.find({ select: { id: true, name_zh: true, category: true }, order: { id: 'ASC' } }),
      this.runewords.find({ select: { id: true, name_zh: true }, order: { id: 'ASC' } }),
      this.runes.find({ select: { number: true, name_zh: true }, order: { number: 'ASC' } }),
      this.bases.find({ select: { item_id: true, name_zh: true, gid: true }, order: { id: 'ASC' } }),
    ]);
    // paladin shields are stored under both shields and pal-shields
    const seen = new Set<string>();
    const uniqueBases = bases.filter((b) => !seen.has(b.item_id) && seen.add(b.item_id));
    return [
      ...items.map((i): TradeItem => ({ ref: `item:${i.id}`, name: i.name_zh, kind: 'item', category: i.category })),
      ...runewords.map((r): TradeItem => ({ ref: `runeword:${r.id}`, name: r.name_zh, kind: 'runeword', category: null })),
      ...runes.map((r): TradeItem => ({ ref: `rune:${r.number}`, name: r.name_zh, kind: 'rune', category: 'runes' })),
      ...uniqueBases.map((b): TradeItem => ({
        ref: `base:${b.item_id}`,
        name: b.name_zh,
        kind: 'base',
        category: BASE_CATEGORY[b.gid] ?? b.gid,
      })),
      ...MISC,
    ];
  }
}
```

- [ ] **Step 3:** `npx eslint --fix src/trades/trade-items.service.ts src/trades/trade-items.service.spec.ts && npx jest src/trades/trade-items` → 4 passed。

- [ ] **Step 4: 用真實 DB 確認顯示文字唯一**

```bash
cd /Users/derekyang/D2R/d2r-service && sqlite3 d2r.sqlite "
WITH b AS (SELECT name_zh, gid, MIN(id) FROM base_items GROUP BY item_id),
l AS (
  SELECT name_zh||'|item|'||category k FROM items
  UNION ALL SELECT name_zh||'|runeword' FROM runewords
  UNION ALL SELECT name_zh||'|rune' FROM runes
  UNION ALL SELECT name_zh||'|base|'||CASE gid WHEN 'clubs' THEN 'maces' WHEN 'puremaces' THEN 'maces' WHEN 'hammers' THEN 'maces' WHEN 'throwings' THEN 'throwing' WHEN 'pal-shields' THEN 'shields' WHEN 'orbs' THEN 'class_specific' WHEN 'katars' THEN 'class_specific' ELSE gid END FROM b)
SELECT k, COUNT(*) FROM l GROUP BY k HAVING COUNT(*) > 1;"
```
Expected：沒有輸出。如果有輸出，回報 DONE_WITH_CONCERNS 並附上輸出，不要自行改設計。

- [ ] **Step 5: Commit** `feat(trades): list the catalog items a listing can point at`（files：`src/trades/trade-items.service.ts src/trades/trade-items.service.spec.ts`）

---

### Task 3: d2r-service — API 接上物品清單

**Files:** Modify `src/trades/trades.module.ts`、`src/trades/trades.controller.ts`、`src/trades/trades.service.ts`、兩個 spec

- [ ] **Step 1: module**

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradesService } from './trades.service';
import { TradesController } from './trades.controller';
import { TradeItemsService } from './trade-items.service';
import { Item } from '../items/entities/item.entity';
import { Runeword } from '../runewords/entities/runeword.entity';
import { Rune } from '../reference/entities/rune.entity';
import { BaseItem } from '../base-items/entities/base-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Item, Runeword, Rune, BaseItem])],
  providers: [TradesService, TradeItemsService],
  controllers: [TradesController],
})
export class TradesModule {}
```

- [ ] **Step 2: service 測試**：在 `trades.service.spec.ts` 加上兩個測試：

```ts
  it('findAll passes item_ref to traderie', async () => {
    reply(200, []);
    await service.findAll({ category: 'charms', item_ref: 'item:1' }, null);
    expect(call()[0]).toMatch(/\/api\/trades\?category=charms&item_ref=item%3A1$/);
  });

  it('create forwards item_ref, defaulting to null', async () => {
    reply(201, row(1, 'u1'));
    await service.create({ item_name: 'SOJ', item_stats_raw: null, price: '1', contact: 'c', category: null }, 'u1');
    expect(JSON.parse(call()[1].body as string)).toMatchObject({ item_ref: null });
  });
```

- [ ] **Step 3: service 實作**（`trades.service.ts`）
  - `NewTrade` 加 `item_ref?: string | null;`
  - `findAll(query: { category?: string; item_ref?: string }, uid)`，query string 改成：
```ts
    const filters = Object.entries(query).filter(([, v]) => v !== undefined) as [string, string][];
    const qs = filters.length ? `?${new URLSearchParams(filters)}` : '';
```
  - `create` 組 `trade` 物件時加 `item_ref: body.item_ref || null,`

- [ ] **Step 4: controller 測試**（`trades.controller.spec.ts`）
  - `controller = new TradesController(service as never, tradeItems as never)`，其中 `tradeItems = { all: jest.fn().mockResolvedValue([]), find: jest.fn() }`，在 `beforeEach` 建立。
  - 原本的「lists trades」測試改成 `controller.findAll(req, 'rings')`，期望 `service.findAll` 收到 `({ category: 'rings', item_ref: undefined }, null)`。
  - 新增：
```ts
  it('rejects an unknown item_ref', async () => {
    uidMock.mockResolvedValue('u1');
    tradeItems.find.mockResolvedValue(undefined);
    await expect(controller.create(req, { ...body, item_ref: 'item:999' })).rejects.toThrow(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('accepts a known item_ref', async () => {
    uidMock.mockResolvedValue('u1');
    tradeItems.find.mockResolvedValue({ ref: 'item:1' });
    await controller.create(req, { ...body, item_ref: 'item:1' });
    expect(service.create).toHaveBeenCalled();
  });

  it('serves the item list', async () => {
    tradeItems.all.mockResolvedValue([{ ref: 'misc:pk1' }]);
    expect(await controller.items()).toEqual({ data: [{ ref: 'misc:pk1' }] });
  });
```
  （記得 import `BadRequestException`。）

- [ ] **Step 5: controller 實作**（`trades.controller.ts`）
  - constructor 加 `private readonly tradeItems: TradeItemsService`，並 import。
  - 在 `@Get()` 之前加：
```ts
  @Get('items')
  async items() {
    return { data: await this.tradeItems.all() };
  }
```
  - `findAll` 加參數 `@Query('item_ref') item_ref?: string`，呼叫改成 `this.service.findAll({ category, item_ref }, await getUid(req))`。參數順序：`(@Req() req, @Query('category') category?, @Query('item_ref') item_ref?)`。
  - `create` 在必填檢查之後加：
```ts
    if (body.item_ref && !(await this.tradeItems.find(body.item_ref))) {
      throw new BadRequestException('未知的物品');
    }
```

- [ ] **Step 6:** `npx eslint --fix src/trades && npx tsc --noEmit -p tsconfig.json && npx jest` → 全部通過。
- [ ] **Step 7: 實機確認**：`TRADERIE_URL=http://localhost:1 PORT=3098 node dist/src/main` 在背景啟動前先 `npm run build`，然後 `curl -s localhost:3098/api/trades/items | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print(len(d)); print([t for t in d if t["ref"] in ("item:18412","misc:pk1")])'`，預期約 1062 筆（409+104+33+508+8，底材去重後的實際數字以輸出為準），並列出這兩筆。結束後用 `lsof -ti tcp:3098 -sTCP:LISTEN | xargs kill` 關掉。
- [ ] **Step 8: Commit** `feat(trades): serve the item list and accept item_ref on listings`（files：`src/trades`）

---

### Task 4: d2r-fe — 分類與 API

**Files:** Modify `src/pages/items/itemCategories.ts`、`src/api/index.ts`；Create `src/pages/trade/tradeItems.ts`

- [ ] **Step 1:** `TRADE_CATEGORIES` 在 `{ label: '其他', value: 'other' }` 之前加：
```ts
  { label: '符文', value: 'runes' },
  { label: '鑰匙', value: 'keys' },
  { label: '先祖雕像', value: 'statues' },
```
並把 `其他` 那行上方的註解改為 `// Every items.category plus the extra trade-item kinds, and 其他 for anything else`（放在 `export const TRADE_CATEGORIES` 上方，取代原註解）。

- [ ] **Step 2:** `src/api/index.ts` 的 `createTrade` body 型別加 `item_ref?: string;`，並在 `deleteTrade` 後加：
```ts
  getTradeItems: () =>
    client.get('/trades/items').then((r) => r.data.data),
```

- [ ] **Step 3:** 建立 `src/pages/trade/tradeItems.ts`：
```ts
import { api } from '../../api';
import { TRADE_CATEGORIES } from '../items/itemCategories';

export interface TradeItem {
  ref: string;
  name: string;
  kind: 'item' | 'runeword' | 'rune' | 'base' | 'misc';
  category: string | null;
}

let cache: Promise<TradeItem[]> | undefined;

// The list never changes while the app runs; retry on the next call if it failed
export function loadTradeItems(): Promise<TradeItem[]> {
  cache ??= api.getTradeItems().catch((err: unknown) => {
    cache = undefined;
    throw err;
  });
  return cache;
}

// Unique per item: same-named items differ in kind or category (族長 axe vs sword, 毀滅 charm vs runeword)
export function itemLabel(t: TradeItem): string {
  const category = TRADE_CATEGORIES.find((c) => c.value === t.category)?.label ?? '';
  const kind =
    t.kind === 'runeword' ? '符文之語' : t.kind === 'rune' ? '符文' : t.kind === 'base' ? `底材・${category}` : category;
  return `${t.name}（${kind}）`;
}
```

- [ ] **Step 4:** `npm run build` 通過、`npx eslint src/pages/items/itemCategories.ts src/api src/pages/trade/tradeItems.ts` 無錯誤。
- [ ] **Step 5: Commit** `feat(trade): load the tradeable item list`

---

### Task 5: d2r-fe — 新增頁選物品

**Files:** Modify `src/pages/trade/TradeNew.tsx`

- [ ] **Step 1:** import 加 `useMemo`（從 react）、`useQuery`（`@tanstack/react-query`）、`import { itemLabel, loadTradeItems, type TradeItem } from './tradeItems';`。
- [ ] **Step 2:** `FormState` 加 `item_ref: string;`，初始 `form` 加 `item_ref: ''`。
- [ ] **Step 3:** 在 `const latestFile = useRef...` 之前加：
```tsx
  const { data: tradeItems = [] } = useQuery({
    queryKey: ['trade-items'],
    queryFn: loadTradeItems,
    staleTime: Infinity,
  });
  const byLabel = useMemo(() => new Map(tradeItems.map((t) => [itemLabel(t), t])), [tradeItems]);
  // what the name box shows: an option label once an item is picked, otherwise free text
  const [itemText, setItemText] = useState('');

  const pickItem = (text: string, hit?: TradeItem) => {
    setItemText(text);
    setForm((f) => ({
      ...f,
      item_name: hit ? hit.name : text,
      item_ref: hit?.ref ?? '',
      category: hit?.category ?? f.category,
    }));
  };
```
- [ ] **Step 4:** 在 `handleImage` 裡：
  - `Promise.all` 改成同時載入物品清單，並移除 `item-names.json`：
```tsx
      const [catalog, baseItemNames, terms] = await Promise.all([
        loadTradeItems(),
        loadList('/data/base-item-names.json'),
        loadList('/data/ocr-terms.json'),
      ]);

      // the name is usually the first line, but stray UI text can sit above it
      const nameHit = matchLine(lines.slice(0, 3), [...new Set(catalog.map((t) => t.name))]);
      const hit =
        nameHit &&
        (catalog.find((t) => t.name === nameHit.name && t.kind === 'item') ??
          catalog.find((t) => t.name === nameHit.name));
```
  - 原本的 `setForm((f) => ({ ...f, item_name: ..., item_stats_raw: ... }))` 換成：
```tsx
      setItemText(hit ? itemLabel(hit) : (lines[0] ?? ''));
      setForm((f) => ({
        ...f,
        item_name: hit ? hit.name : (lines[0] ?? ''),
        item_ref: hit?.ref ?? '',
        category: hit?.category ?? f.category,
        item_stats_raw: [base, ...rest.slice(1).map(correct)].filter(Boolean).join('\n'),
      }));
```
  - `useCallback` 的依賴維持 `[]`（只用到 setter 和模組層級函式）。
- [ ] **Step 5:** 物品名稱欄位換成：
```tsx
          <div>
            <label style={labelStyle}>物品名稱 *</label>
            <input
              style={{ ...inputStyle, color: '#808000' }}
              list="trade-item-options"
              value={itemText}
              onChange={(e) => pickItem(e.target.value, byLabel.get(e.target.value))}
              placeholder="輸入名稱搜尋"
            />
            <datalist id="trade-item-options">
              {[...byLabel.keys()].map((label) => (
                <option key={label} value={label} />
              ))}
            </datalist>
            <div style={{ color: form.item_ref ? '#5a8a5a' : '#666', fontSize: '10px', marginTop: '2px' }}>
              {form.item_ref ? `已對應：${itemText}` : '未對應物品，可直接輸入名稱'}
            </div>
            {errors.item_name && (
              <div style={{ color: '#ff4444', fontSize: '10px', marginTop: '2px' }}>
                {errors.item_name}
              </div>
            )}
          </div>
```
- [ ] **Step 6:** `handleSubmit` 的 `createTrade` 參數加 `item_ref: form.item_ref || undefined,`。
- [ ] **Step 7:** 如果 `loadList('/data/item-names.json')` 已無其他用途就不要留著；`loadList` 本身仍用於其他兩份檔案。`npm run build` 通過，`npx eslint src/pages/trade` 無錯誤。
- [ ] **Step 8: Commit** `feat(trade): pick the listed item from the catalog, with OCR as a suggestion`

---

### Task 6: d2r-fe — 列表依物品篩選

**Files:** Modify `src/pages/trade/TradeList.tsx`

- [ ] **Step 1:** `interface Trade` 加 `item_ref: string | null;`
- [ ] **Step 2:** 在 `const [category, setCategory] = useState('');` 下方加 `const [itemFilter, setItemFilter] = useState<{ ref: string; name: string } | null>(null);`，並把 `params` 換成：
```tsx
  const params = {
    ...(category && { category }),
    ...(itemFilter && { item_ref: itemFilter.ref }),
  };
```
  `queryKey` 改成 `['trades', category, itemFilter?.ref ?? null, user?.uid ?? null]`。
- [ ] **Step 3:** 在分類篩選列（`FILTER_CHIPS.map` 那個 `<div>`）之後、列表之前加：
```tsx
      {itemFilter && (
        <div style={{ marginBottom: '12px', fontSize: '12px', color: '#aaa' }}>
          物品：{itemFilter.name}{' '}
          <button onClick={() => setItemFilter(null)} style={actionStyle} aria-label="取消物品篩選">
            ✕
          </button>
        </div>
      )}
```
- [ ] **Step 4:** 卡片標題的物品名稱 `<span ...>{selected.item_name}</span>` 換成：有 `item_ref` 時顯示可點的按鈕：
```tsx
              {selected.item_ref ? (
                <button
                  onClick={() => {
                    setItemFilter({ ref: selected.item_ref!, name: selected.item_name });
                    setSelectedId(null);
                  }}
                  title="只看這個物品的掛單"
                  style={{ color: '#808000', fontWeight: 'bold', fontSize: '14px', textAlign: 'left', textDecoration: 'underline', cursor: 'pointer' }}
                >
                  {selected.item_name}
                </button>
              ) : (
                <span style={{ color: '#808000', fontWeight: 'bold', fontSize: '14px' }}>{selected.item_name}</span>
              )}
```
- [ ] **Step 5:** `npm run build` 通過、`npx eslint src/pages/trade` 無錯誤。
- [ ] **Step 6: Commit** `feat(trade): filter listings by item`

---

### Task 7: 本機整合測試（使用者手動）

啟動 d2r-traderie（7499，測試 DB）、d2r-service（3001）、d2r-fe（5173），檢查：

- 上傳截圖：物品名稱預選，下方顯示「已對應：…」，分類自動帶入。
- 把名稱改成錯誤的文字：顯示「未對應物品」；從下拉選正確物品：恢復對應。
- 選符文之語：分類不會被改掉，要自己選。
- 發布後在列表點開卡片，點物品名稱：列表只剩該物品，篩選列顯示「物品：名稱 ✕」。
- 新的分類「符文」「鑰匙」「先祖雕像」出現在新增頁與列表篩選。

### Task 8: 部署

順序：d2r-traderie（遷移 `item_ref`）→ d2r-service `api` function + d2r-fe hosting（使用者手動 `firebase deploy`）。
