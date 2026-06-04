# 交易掛單 + OCR 功能實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓玩家上傳 D2R 截圖，Tesseract.js 辨識物品屬性並填入交易掛單表單，發布至 `/trades` API 供其他玩家瀏覽。

**Architecture:** 後端在 `d2r-service` 新增 NestJS `trades` 模組（entity + service + controller）；前端在 `d2r-fe` 新增 TradeList（緊湊列表）和 TradeNew（左右分割 + OCR）兩個頁面，Tesseract.js 在瀏覽器端執行 OCR，結果自動填入表單。

**Tech Stack:** NestJS + TypeORM + better-sqlite3（後端）；React + Tesseract.js v4 + @tanstack/react-query + react-router-dom（前端）

---

## Task 1: Trade Entity + SQLite Table

**Files:**
- Create: `d2r-service/src/trades/entities/trade.entity.ts`

- [ ] **Step 1: Create entity file**

```typescript
// d2r-service/src/trades/entities/trade.entity.ts
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('trades')
export class Trade {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  item_name!: string;

  @Column('text', { nullable: true })
  item_stats_raw!: string;

  @Column()
  price!: string;

  @Column()
  contact!: string;

  @Column({ nullable: true })
  category!: string;

  @CreateDateColumn()
  created_at!: Date;
}
```

- [ ] **Step 2: Create the trades table in SQLite**

Run from `d2r-service/`:
```bash
sqlite3 d2r.sqlite "CREATE TABLE IF NOT EXISTS trades (id INTEGER PRIMARY KEY AUTOINCREMENT, item_name VARCHAR NOT NULL, item_stats_raw TEXT, price VARCHAR NOT NULL, contact VARCHAR NOT NULL, category VARCHAR, created_at DATETIME DEFAULT (datetime('now')));"
```

Verify:
```bash
sqlite3 d2r.sqlite ".tables"
```
Expected: output includes `trades`

---

## Task 2: Trades Service (TDD)

**Files:**
- Create: `d2r-service/src/trades/trades.service.spec.ts`
- Create: `d2r-service/src/trades/trades.service.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// d2r-service/src/trades/trades.service.spec.ts
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TradesService } from './trades.service';
import { Trade } from './entities/trade.entity';

const mockRepo = {
  find: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
};

describe('TradesService', () => {
  let service: TradesService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TradesService,
        { provide: getRepositoryToken(Trade), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<TradesService>(TradesService);
    jest.clearAllMocks();
  });

  it('findAll passes category filter', async () => {
    mockRepo.find.mockResolvedValue([]);
    await service.findAll({ category: 'rings' });
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { category: 'rings' },
      order: { created_at: 'DESC' },
    });
  });

  it('findAll with no category omits where filter', async () => {
    mockRepo.find.mockResolvedValue([]);
    await service.findAll({});
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: {},
      order: { created_at: 'DESC' },
    });
  });

  it('create saves and returns new trade', async () => {
    const body = {
      item_name: 'SOJ',
      item_stats_raw: '+1 all skills',
      price: '3 Ber',
      contact: 'abc#1234',
      category: 'rings',
    };
    mockRepo.create.mockReturnValue(body);
    mockRepo.save.mockResolvedValue({ id: 1, ...body });
    const result = await service.create(body);
    expect(result).toMatchObject({ id: 1, item_name: 'SOJ', price: '3 Ber' });
  });
});
```

- [ ] **Step 2: Run to confirm failure**

Run from `d2r-service/`:
```bash
npm test -- --testPathPattern=trades.service.spec
```
Expected: `Cannot find module './trades.service'`

- [ ] **Step 3: Implement service**

```typescript
// d2r-service/src/trades/trades.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trade } from './entities/trade.entity';

@Injectable()
export class TradesService {
  constructor(
    @InjectRepository(Trade)
    private readonly repo: Repository<Trade>,
  ) {}

  findAll(query: { category?: string }) {
    const where: Partial<Trade> = {};
    if (query.category) where.category = query.category;
    return this.repo.find({ where, order: { created_at: 'DESC' } });
  }

  create(body: Pick<Trade, 'item_name' | 'item_stats_raw' | 'price' | 'contact' | 'category'>) {
    return this.repo.save(this.repo.create(body));
  }
}
```

- [ ] **Step 4: Run to confirm tests pass**

```bash
npm test -- --testPathPattern=trades.service.spec
```
Expected: PASS (3 tests)

---

## Task 3: Trades Controller + Module

**Files:**
- Create: `d2r-service/src/trades/trades.controller.ts`
- Create: `d2r-service/src/trades/trades.module.ts`

- [ ] **Step 1: Create controller**

```typescript
// d2r-service/src/trades/trades.controller.ts
import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TradesService } from './trades.service';
import { Trade } from './entities/trade.entity';

@Controller('trades')
export class TradesController {
  constructor(private readonly service: TradesService) {}

  @Get()
  async findAll(@Query('category') category?: string) {
    const data = await this.service.findAll({ category });
    return { data, total: data.length };
  }

  @Post()
  async create(
    @Body() body: Pick<Trade, 'item_name' | 'item_stats_raw' | 'price' | 'contact' | 'category'>,
  ) {
    return { data: await this.service.create(body) };
  }
}
```

- [ ] **Step 2: Create module**

```typescript
// d2r-service/src/trades/trades.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Trade } from './entities/trade.entity';
import { TradesService } from './trades.service';
import { TradesController } from './trades.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Trade])],
  providers: [TradesService],
  controllers: [TradesController],
})
export class TradesModule {}
```

---

## Task 4: Register Module + Smoke Test

**Files:**
- Modify: `d2r-service/src/app.module.ts`

- [ ] **Step 1: Register TradesModule in AppModule**

Replace the entire contents of `d2r-service/src/app.module.ts`:

```typescript
// d2r-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ItemsModule } from './items/items.module';
import { SetsModule } from './sets/sets.module';
import { RunewordsModule } from './runewords/runewords.module';
import { BuildsModule } from './builds/builds.module';
import { IasModule } from './ias/ias.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { BaseItemsModule } from './base-items/base-items.module';
import { SkillsModule } from './skills/skills.module';
import { TradesModule } from './trades/trades.module';

@Module({
  imports: [
    DatabaseModule,
    ItemsModule,
    SetsModule,
    RunewordsModule,
    BuildsModule,
    IasModule,
    AnnouncementsModule,
    BaseItemsModule,
    SkillsModule,
    TradesModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Start server and smoke test**

Run from `d2r-service/`:
```bash
npm run start:dev
```

In a separate terminal:
```bash
# GET returns empty list
curl http://localhost:3001/api/trades
# Expected: {"data":[],"total":0}

# POST creates a trade
curl -X POST http://localhost:3001/api/trades \
  -H "Content-Type: application/json" \
  -d '{"item_name":"Stone of Jordan","item_stats_raw":"+1 所有技能\n+25 魔力","price":"3 Ber","contact":"abc#1234","category":"rings"}'
# Expected: {"data":{"id":1,"item_name":"Stone of Jordan",...}}

# GET returns the created trade
curl http://localhost:3001/api/trades
# Expected: {"data":[{"id":1,...}],"total":1}
```

- [ ] **Step 3: Commit backend**

```bash
cd /Users/derekyang/d2r-service
git add src/trades/ src/app.module.ts
git commit -m "feat: add trades module with GET /trades and POST /trades"
```

---

## Task 5: Install Tesseract.js

- [ ] **Step 1: Install package**

Run from `d2r-fe/`:
```bash
cd /Users/derekyang/d2r-fe && npm install tesseract.js
```

Expected: `tesseract.js` appears in `d2r-fe/package.json` dependencies.

---

## Task 6: Frontend API Methods

**Files:**
- Modify: `d2r-fe/src/api/index.ts`

- [ ] **Step 1: Add getTrades and createTrade**

In `d2r-fe/src/api/index.ts`, add before the closing `};`:

```typescript
  // Trades
  getTrades: (params?: Record<string, string>) =>
    client.get('/trades', { params }).then((r) => r.data.data),
  createTrade: (body: {
    item_name: string;
    item_stats_raw?: string;
    price: string;
    contact: string;
    category?: string;
  }) => client.post('/trades', body).then((r) => r.data.data),
```

---

## Task 7: TradeList Page

**Files:**
- Create: `d2r-fe/src/pages/trade/TradeList.tsx`

- [ ] **Step 1: Create component**

```tsx
// d2r-fe/src/pages/trade/TradeList.tsx
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api';

interface Trade {
  id: number;
  item_name: string;
  item_stats_raw: string | null;
  price: string;
  contact: string;
  category: string | null;
  created_at: string;
}

const FILTER_CHIPS = [
  { label: '全部', value: '' },
  { label: '戒指', value: 'rings' },
  { label: '護身符', value: 'amulets' },
  { label: '護符', value: 'charms' },
  { label: '頭部', value: 'helms' },
  { label: '盔甲', value: 'armors' },
  { label: '武器', value: 'weapons' },
  { label: '盾牌', value: 'shields' },
  { label: '其他', value: 'other' },
];

function truncate(text: string | null, max = 60): string {
  if (!text) return '';
  const single = text.replace(/\n/g, ' / ');
  return single.length > max ? single.slice(0, max) + '…' : single;
}

export default function TradeList() {
  const [category, setCategory] = useState('');
  const params = category ? { category } : undefined;

  const { data: trades = [], isLoading } = useQuery<Trade[]>({
    queryKey: ['trades', category],
    queryFn: () => api.getTrades(params),
  });

  const copyContact = (contact: string) => {
    navigator.clipboard.writeText(contact);
  };

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '12px',
        }}
      >
        <h1 className="text-xl font-bold" style={{ color: '#808000' }}>
          交易市集
        </h1>
        <Link
          to="/trade/new"
          style={{
            background: '#1a1400',
            border: '1px solid #808000',
            color: '#808000',
            padding: '4px 14px',
            borderRadius: '2px',
            fontSize: '12px',
            textDecoration: 'none',
          }}
        >
          + 掛單
        </Link>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '12px' }}>
        {FILTER_CHIPS.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            style={{
              background: category === c.value ? '#1a1400' : 'transparent',
              border: `1px solid ${category === c.value ? '#808000' : '#333'}`,
              color: category === c.value ? '#808000' : '#666',
              padding: '2px 10px',
              borderRadius: '10px',
              fontSize: '11px',
              cursor: 'pointer',
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ color: '#555', fontSize: '13px' }}>載入中…</div>
      ) : trades.length === 0 ? (
        <div style={{ color: '#555', fontSize: '13px' }}>暫無掛單</div>
      ) : (
        <div>
          {trades.map((trade) => (
            <div
              key={trade.id}
              style={{
                border: '1px solid #606000',
                background: '#0d0d00',
                padding: '6px 10px',
                marginBottom: '3px',
                display: 'flex',
                gap: '10px',
                alignItems: 'center',
                borderRadius: '2px',
              }}
            >
              <div
                style={{
                  color: '#808000',
                  fontWeight: 'bold',
                  width: '140px',
                  flexShrink: 0,
                  fontSize: '13px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {trade.item_name}
              </div>
              <div
                style={{
                  flex: 1,
                  color: '#6060ff',
                  fontSize: '11px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {truncate(trade.item_stats_raw)}
              </div>
              <div style={{ color: '#ff8c00', fontSize: '12px', flexShrink: 0 }}>
                {trade.price}
              </div>
              <button
                onClick={() => copyContact(trade.contact)}
                title={trade.contact}
                style={{
                  background: '#1a1a1a',
                  border: '1px solid #333',
                  color: '#aaa',
                  padding: '2px 8px',
                  borderRadius: '2px',
                  fontSize: '11px',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                聯繫
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

## Task 8: TradeNew Page (OCR + Form)

**Files:**
- Create: `d2r-fe/src/pages/trade/TradeNew.tsx`

- [ ] **Step 1: Create component**

```tsx
// d2r-fe/src/pages/trade/TradeNew.tsx
import { useState, useCallback } from 'react';
import Tesseract from 'tesseract.js';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';

const CATEGORIES = [
  { label: '請選擇', value: '' },
  { label: '戒指', value: 'rings' },
  { label: '護身符', value: 'amulets' },
  { label: '護符', value: 'charms' },
  { label: '頭部', value: 'helms' },
  { label: '盔甲', value: 'armors' },
  { label: '武器', value: 'weapons' },
  { label: '盾牌', value: 'shields' },
  { label: '手套', value: 'gloves' },
  { label: '腰帶', value: 'belts' },
  { label: '靴類', value: 'boots' },
  { label: '其他', value: 'other' },
];

interface FormState {
  item_name: string;
  item_stats_raw: string;
  price: string;
  contact: string;
  category: string;
}

const inputStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #333',
  color: '#aaa',
  padding: '4px 8px',
  width: '100%',
  borderRadius: '2px',
  fontSize: '13px',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  color: '#666',
  fontSize: '11px',
  display: 'block',
  marginBottom: '2px',
};

export default function TradeNew() {
  const navigate = useNavigate();
  const [ocrProgress, setOcrProgress] = useState<number | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [ocrRaw, setOcrRaw] = useState('');
  const [form, setForm] = useState<FormState>({
    item_name: '',
    item_stats_raw: '',
    price: '',
    contact: '',
    category: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const handleImage = useCallback(async (file: File) => {
    setImageUrl(URL.createObjectURL(file));
    setOcrProgress(0);
    setOcrRaw('');

    try {
      const result = await Tesseract.recognize(file, 'chi_tra+eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setOcrProgress(Math.round(m.progress * 100));
          }
        },
      });

      const text = result.data.text.trim();
      setOcrRaw(text);

      const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
      setForm((f) => ({
        ...f,
        item_name: lines[0] ?? '',
        item_stats_raw: lines.slice(1).join('\n'),
      }));
    } catch {
      setOcrRaw('⚠ OCR 辨識失敗，請手動填入屬性');
    } finally {
      setOcrProgress(null);
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file?.type.startsWith('image/')) handleImage(file);
    },
    [handleImage],
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImage(file);
    },
    [handleImage],
  );

  const handleField =
    (field: keyof FormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));

  const validate = () => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.item_name.trim()) errs.item_name = '必填';
    if (!form.price.trim()) errs.price = '必填';
    if (!form.contact.trim()) errs.contact = '必填';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSubmitting(true);
    try {
      await api.createTrade({
        item_name: form.item_name.trim(),
        item_stats_raw: form.item_stats_raw.trim() || undefined,
        price: form.price.trim(),
        contact: form.contact.trim(),
        category: form.category || undefined,
      });
      navigate('/trade');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4" style={{ color: '#808000' }}>
        建立交易掛單
      </h1>
      <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start' }}>
        {/* Left: upload + OCR output */}
        <div style={{ flex: 1 }}>
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => document.getElementById('ocr-file-input')?.click()}
            style={{
              border: '2px dashed #444',
              background: '#111',
              padding: '32px 16px',
              textAlign: 'center',
              cursor: 'pointer',
              borderRadius: '2px',
              marginBottom: '12px',
              minHeight: '120px',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="截圖"
                style={{ maxWidth: '100%', maxHeight: '200px', objectFit: 'contain' }}
              />
            ) : (
              <>
                <div style={{ fontSize: '24px' }}>📷</div>
                <div style={{ color: '#555', fontSize: '12px' }}>拖曳或點選 D2R 截圖</div>
              </>
            )}
          </div>
          <input
            id="ocr-file-input"
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleFileInput}
          />

          {ocrProgress !== null && (
            <div style={{ color: '#808000', fontSize: '12px', marginBottom: '8px' }}>
              辨識中… {ocrProgress}%
            </div>
          )}

          {ocrRaw && (
            <div
              style={{
                background: '#0a0a0a',
                border: '1px solid #222',
                padding: '10px',
                borderRadius: '2px',
              }}
            >
              <div style={{ color: '#444', fontSize: '10px', marginBottom: '4px' }}>
                OCR 原始輸出
              </div>
              <pre style={{ color: '#555', fontSize: '10px', whiteSpace: 'pre-wrap', margin: 0 }}>
                {ocrRaw}
              </pre>
            </div>
          )}
        </div>

        {/* Right: form */}
        <form
          onSubmit={handleSubmit}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div>
            <label style={labelStyle}>物品名稱 *</label>
            <input
              style={{ ...inputStyle, color: '#808000' }}
              value={form.item_name}
              onChange={handleField('item_name')}
            />
            {errors.item_name && (
              <div style={{ color: '#ff4444', fontSize: '10px', marginTop: '2px' }}>
                {errors.item_name}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>屬性描述</label>
            <textarea
              style={{ ...inputStyle, color: '#6060ff', minHeight: '80px', resize: 'vertical' }}
              value={form.item_stats_raw}
              onChange={handleField('item_stats_raw')}
            />
          </div>

          <div>
            <label style={labelStyle}>物品類別</label>
            <select style={inputStyle} value={form.category} onChange={handleField('category')}>
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelStyle}>價格 *</label>
            <input
              style={inputStyle}
              value={form.price}
              onChange={handleField('price')}
              placeholder="例：3 Ber、FG 議價"
            />
            {errors.price && (
              <div style={{ color: '#ff4444', fontSize: '10px', marginTop: '2px' }}>
                {errors.price}
              </div>
            )}
          </div>

          <div>
            <label style={labelStyle}>聯絡方式 *</label>
            <input
              style={inputStyle}
              value={form.contact}
              onChange={handleField('contact')}
              placeholder="Discord tag 或遊戲 ID"
            />
            {errors.contact && (
              <div style={{ color: '#ff4444', fontSize: '10px', marginTop: '2px' }}>
                {errors.contact}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              background: '#1a1400',
              border: '1px solid #808000',
              color: '#808000',
              padding: '8px 20px',
              cursor: submitting ? 'wait' : 'pointer',
              borderRadius: '2px',
              fontSize: '13px',
            }}
          >
            {submitting ? '發布中…' : '刊登掛單'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

---

## Task 9: Routes + NavTree

**Files:**
- Modify: `d2r-fe/src/App.tsx`
- Modify: `d2r-fe/src/components/layout/NavTree.tsx`

- [ ] **Step 1: Add imports and routes to App.tsx**

Add two imports at the top of `d2r-fe/src/App.tsx` (with the other page imports):
```typescript
import TradeList from './pages/trade/TradeList';
import TradeNew from './pages/trade/TradeNew';
```

Add two routes inside `<Route element={<AppShell />}>`, before the `about` route:
```tsx
<Route path="trade" element={<TradeList />} />
<Route path="trade/new" element={<TradeNew />} />
```

- [ ] **Step 2: Add nav entry to NavTree.tsx**

In `d2r-fe/src/components/layout/NavTree.tsx`, add before `{ label: '關於易牙居', to: '/about' }`:
```typescript
{ label: '交易市集', to: '/trade' },
```

- [ ] **Step 3: Verify in browser**

With both servers running (`npm run start:dev` in `d2r-service/`, `npm run dev` in `d2r-fe/`):

1. Open http://localhost:5173/trade — should show "交易市集" heading, category filter chips, empty state "暫無掛單", and "+ 掛單" button
2. Click "+ 掛單" → navigates to http://localhost:5173/trade/new — should show split layout: upload zone on left, form on right
3. Click the upload zone, select any image → should show OCR progress then fill `item_name` and `item_stats_raw` fields
4. Fill in price and contact, click "刊登掛單" → redirects back to `/trade` and shows the new listing
5. Sidebar nav should show "交易市集" link

- [ ] **Step 4: Commit frontend**

```bash
cd /Users/derekyang/d2r-fe
git add src/pages/trade/ src/api/index.ts src/App.tsx src/components/layout/NavTree.tsx package.json package-lock.json
git commit -m "feat: add trade listing pages with Tesseract.js OCR"
```
