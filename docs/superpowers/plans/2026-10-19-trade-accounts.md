# 交易市集帳號系統 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 發掛單需要 Google 登入，聯絡方式只給登入使用者看，賣家可以下架自己的掛單。

**Architecture:** d2r-fe 用 Firebase Auth 做 Google 登入，請求時帶 ID token；d2r-service 用 `firebase-admin` 驗證 token 取得 `uid`，依登入狀態過濾回應，再帶 `owner_uid` 轉發給 d2r-traderie；d2r-traderie 的 SQLite 存 `owner_uid`，下架時以 `id + owner_uid` 比對。

**Tech Stack:** NestJS 11、`node:sqlite`（d2r-traderie）、`firebase-admin` 13（d2r-service）、React 19 + Vite + `firebase` web SDK + TanStack Query（d2r-fe）、Jest（d2r-service）。

Spec：`d2r-service/docs/superpowers/specs/2026-10-19-trade-accounts-design.md`

---

## 檔案結構

| Repo | 檔案 | 動作 | 職責 |
|---|---|---|---|
| d2r-traderie | `src/trades/trades.service.ts` | 修改 | `owner_uid` 欄位、遷移、`remove()` |
| d2r-traderie | `src/trades/trades.controller.ts` | 修改 | `owner_uid` 必填、`DELETE /api/trades/:id` |
| d2r-service | `src/auth/firebase-auth.ts` | 新增 | `getUid(req)`：驗證 Bearer ID token |
| d2r-service | `src/auth/firebase-auth.spec.ts` | 新增 | `getUid` 測試 |
| d2r-service | `src/trades/trades.service.ts` | 修改 | `toPublic()`、帶 uid 的 `findAll/create/remove` |
| d2r-service | `src/trades/trades.service.spec.ts` | 修改 | service 測試 |
| d2r-service | `src/trades/trades.controller.ts` | 修改 | 讀 uid、401、`DELETE` 路由 |
| d2r-service | `src/trades/trades.controller.spec.ts` | 新增 | 401 與 uid 傳遞測試 |
| d2r-fe | `.env` | 新增 | `VITE_FIREBASE_*`（公開的 web config） |
| d2r-fe | `src/auth.ts` | 新增 | Firebase 初始化、`signIn/logOut/useUser` |
| d2r-fe | `src/api/client.ts` | 修改 | 自動帶 `Authorization` |
| d2r-fe | `src/api/index.ts` | 修改 | `deleteTrade` |
| d2r-fe | `src/components/layout/AuthButton.tsx` | 新增 | 登入／登出按鈕 |
| d2r-fe | `src/components/layout/NavTree.tsx` | 修改 | 放入 `AuthButton` |
| d2r-fe | `src/pages/trade/TradeList.tsx` | 修改 | 聯絡方式鎖定、下架 |
| d2r-fe | `src/pages/trade/TradeNew.tsx` | 修改 | 未登入顯示登入提示 |

d2r-fe 沒有測試框架，前端以 `npm run build`、`npm run lint` 和手動測試驗證。

---

### Task 1: d2r-traderie — `owner_uid` 與下架 API

**Files:**
- Modify: `d2r-traderie/src/trades/trades.service.ts`
- Modify: `d2r-traderie/src/trades/trades.controller.ts`

- [ ] **Step 1: 改 service**

`d2r-traderie/src/trades/trades.service.ts` 全檔換成：

```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface NewTrade {
  item_name: string;
  item_stats_raw: string | null;
  price: string;
  contact: string;
  category: string | null;
  owner_uid: string;
}

// Player trade listings from d2r-fe, kept here because this DB lives on a persistent volume
@Injectable()
export class TradesService implements OnModuleInit {
  private db!: DatabaseSync;

  onModuleInit() {
    const path = process.env.DB_PATH ?? 'data/traderie.db';
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS trades (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        item_name      TEXT NOT NULL,
        item_stats_raw TEXT,
        price          TEXT NOT NULL,
        contact        TEXT NOT NULL,
        category       TEXT,
        created_at     TEXT NOT NULL DEFAULT (datetime('now')),
        owner_uid      TEXT
      );
    `);
    // tables created before accounts existed have no owner column
    const cols = this.db.prepare('PRAGMA table_info(trades)').all() as { name: string }[];
    if (!cols.some((c) => c.name === 'owner_uid')) this.db.exec('ALTER TABLE trades ADD COLUMN owner_uid TEXT');
  }

  findAll(category?: string) {
    return category === undefined
      ? this.db.prepare('SELECT * FROM trades ORDER BY id DESC').all()
      : this.db.prepare('SELECT * FROM trades WHERE category = ? ORDER BY id DESC').all(category);
  }

  create(t: NewTrade) {
    return this.db
      .prepare(
        `INSERT INTO trades (item_name, item_stats_raw, price, contact, category, owner_uid)
         VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
      )
      .get(t.item_name, t.item_stats_raw, t.price, t.contact, t.category, t.owner_uid);
  }

  // false when the trade does not exist or belongs to someone else
  remove(id: number, owner_uid: string): boolean {
    return this.db.prepare('DELETE FROM trades WHERE id = ? AND owner_uid = ?').run(id, owner_uid).changes > 0;
  }
}
```

- [ ] **Step 2: 改 controller**

`d2r-traderie/src/trades/trades.controller.ts` 全檔換成：

```ts
import {
  BadRequestException, Body, Controller, Delete, Get, NotFoundException, Param, ParseIntPipe, Post, Query,
} from '@nestjs/common';
import { TradesService } from './trades.service';

@Controller('trades')
export class TradesController {
  constructor(private readonly svc: TradesService) {}

  @Get()
  findAll(@Query('category') category?: string) {
    return this.svc.findAll(category);
  }

  // owner_uid comes from d2r-service, which verified the user's Firebase ID token
  @Post()
  create(@Body() body?: Record<string, unknown>) {
    const str = (k: string) => (typeof body?.[k] === 'string' ? (body[k] as string).trim() : '');
    const [item_name, price, contact, owner_uid] = [str('item_name'), str('price'), str('contact'), str('owner_uid')];
    if (!item_name || !price || !contact || !owner_uid) {
      throw new BadRequestException('item_name, price, contact, and owner_uid are required');
    }
    return this.svc.create({
      item_name,
      price,
      contact,
      owner_uid,
      item_stats_raw: str('item_stats_raw') || null,
      category: str('category') || null,
    });
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number, @Query('owner_uid') owner_uid?: string) {
    if (!owner_uid || !this.svc.remove(id, owner_uid)) throw new NotFoundException(`trade ${id} not found`);
    return { id };
  }
}
```

- [ ] **Step 3: 型別檢查**

Run: `cd /Users/derekyang/D2R/d2r-traderie && npx tsc --noEmit -p tsconfig.json`
Expected: 無輸出、exit 0

- [ ] **Step 4: 端對端驗證（含遷移）**

先建一個沒有 `owner_uid` 的舊表，確認啟動後會補欄位。`$S` 是 scratchpad 目錄。

```bash
cd /Users/derekyang/D2R/d2r-traderie && S=<scratchpad>
rm -f $S/t2.db* && sqlite3 $S/t2.db "CREATE TABLE trades (id INTEGER PRIMARY KEY AUTOINCREMENT, item_name TEXT NOT NULL, item_stats_raw TEXT, price TEXT NOT NULL, contact TEXT NOT NULL, category TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));"
npx nest build >/dev/null
(DB_PATH=$S/t2.db PORT=7499 node dist/src/main > $S/tr2.log 2>&1 &)
for i in $(seq 1 30); do curl -s localhost:7499/api/trades >/dev/null && break; sleep 0.5; done
sqlite3 $S/t2.db "PRAGMA table_info(trades)" | grep owner_uid
curl -s -XPOST localhost:7499/api/trades -H 'content-type: application/json' -d '{"item_name":"SOJ","price":"3 Ber","contact":"a#1"}'; echo
curl -s -XPOST localhost:7499/api/trades -H 'content-type: application/json' -d '{"item_name":"SOJ","price":"3 Ber","contact":"a#1","owner_uid":"u1"}'; echo
curl -s -XDELETE 'localhost:7499/api/trades/1?owner_uid=u2'; echo
curl -s -XDELETE 'localhost:7499/api/trades/1?owner_uid=u1'; echo
pkill -f "dist/src/main"
```

Expected（依序）：
- `7|owner_uid|TEXT|0||0`
- `{"message":"item_name, price, contact, and owner_uid are required",...,"statusCode":400}`
- `{"id":1,...,"owner_uid":"u1"}`
- `{"message":"trade 1 not found",...,"statusCode":404}`
- `{"id":1}`

- [ ] **Step 5: Commit**

```bash
cd /Users/derekyang/D2R/d2r-traderie
git add src/trades
git commit -m "feat(trades): record listing owners and let them take listings down"
```

---

### Task 2: d2r-service — `getUid`

**Files:**
- Create: `d2r-service/src/auth/firebase-auth.ts`
- Test: `d2r-service/src/auth/firebase-auth.spec.ts`

- [ ] **Step 1: 寫失敗的測試**

`d2r-service/src/auth/firebase-auth.spec.ts`：

```ts
import type { Request } from 'express';

const mockVerifyIdToken = jest.fn();
jest.mock('firebase-admin/app', () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}));
jest.mock('firebase-admin/auth', () => ({
  getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
}));

import { getUid } from './firebase-auth';

const req = (authorization?: string) =>
  ({ headers: { authorization } }) as unknown as Request;

describe('getUid', () => {
  beforeEach(() => mockVerifyIdToken.mockReset());

  it('returns null without an Authorization header', async () => {
    expect(await getUid(req())).toBeNull();
    expect(mockVerifyIdToken).not.toHaveBeenCalled();
  });

  it('returns null for a non-Bearer header', async () => {
    expect(await getUid(req('Basic abc'))).toBeNull();
  });

  it('returns the uid of a valid token', async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: 'u1' });
    expect(await getUid(req('Bearer tok'))).toBe('u1');
    expect(mockVerifyIdToken).toHaveBeenCalledWith('tok');
  });

  it('returns null when verification fails', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('expired'));
    expect(await getUid(req('Bearer tok'))).toBeNull();
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `cd /Users/derekyang/D2R/d2r-service && npx jest src/auth`
Expected: FAIL，`Cannot find module './firebase-auth'`

- [ ] **Step 3: 實作**

`d2r-service/src/auth/firebase-auth.ts`：

```ts
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import type { Request } from 'express';

// Verifying ID tokens only needs the project id, so this also works locally without credentials
const app =
  getApps()[0] ??
  initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'd2r-diablo' });

// The signed-in user's uid, or null when the request has no valid Firebase ID token
export async function getUid(req: Request): Promise<string | null> {
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
  if (!token) return null;
  try {
    return (await getAuth(app).verifyIdToken(token)).uid;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: 確認測試通過**

Run: `cd /Users/derekyang/D2R/d2r-service && npx jest src/auth && npx tsc --noEmit -p tsconfig.json && npx eslint src/auth`
Expected: `Tests: 4 passed`，tsc 和 eslint 無輸出

- [ ] **Step 5: Commit**

```bash
cd /Users/derekyang/D2R/d2r-service
git add src/auth
git commit -m "feat(auth): read the signed-in user from a Firebase ID token"
```

---

### Task 3: d2r-service — service 依登入狀態過濾

**Files:**
- Modify: `d2r-service/src/trades/trades.service.ts`
- Test: `d2r-service/src/trades/trades.service.spec.ts`

- [ ] **Step 1: 寫失敗的測試**

`d2r-service/src/trades/trades.service.spec.ts` 全檔換成：

```ts
import { HttpException } from '@nestjs/common';
import { TradesService } from './trades.service';

const row = (id: number, owner_uid: string | null) => ({
  id,
  item_name: 'SOJ',
  item_stats_raw: null,
  price: '3 Ber',
  contact: 'a#1',
  category: 'rings',
  created_at: '2026-10-19 00:00:00',
  owner_uid,
});

describe('TradesService', () => {
  const service = new TradesService();
  let fetchMock: jest.SpyInstance;

  const reply = (status: number, body: unknown) =>
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
  const call = (i = 0) => fetchMock.mock.calls[i] as [string, RequestInit];

  beforeEach(() => {
    fetchMock = jest.spyOn(global, 'fetch');
  });
  afterEach(() => fetchMock.mockRestore());

  it('findAll passes category filter to traderie', async () => {
    reply(200, []);
    await service.findAll({ category: 'rings' }, null);
    expect(call()[0]).toMatch(/\/api\/trades\?category=rings$/);
  });

  it('findAll hides contact and owner from signed-out users', async () => {
    reply(200, [row(1, 'u1')]);
    const [t] = await service.findAll({}, null);
    expect(t).not.toHaveProperty('contact');
    expect(t).not.toHaveProperty('owner_uid');
    expect(t).toMatchObject({ id: 1, mine: false });
  });

  it('findAll shows contact to signed-in users and marks their own trades', async () => {
    reply(200, [row(1, 'u1'), row(2, 'u2')]);
    const [a, b] = await service.findAll({}, 'u1');
    expect(a).toMatchObject({ contact: 'a#1', mine: true });
    expect(b).toMatchObject({ contact: 'a#1', mine: false });
    expect(a).not.toHaveProperty('owner_uid');
  });

  it('create sends the token uid as owner, ignoring one in the body', async () => {
    reply(201, row(1, 'u1'));
    const result = await service.create(
      {
        item_name: 'SOJ',
        item_stats_raw: null,
        price: '3 Ber',
        contact: 'a#1',
        category: 'rings',
        owner_uid: 'someone-else',
      } as never,
      'u1',
    );
    expect(JSON.parse(call()[1].body as string)).toMatchObject({ owner_uid: 'u1' });
    expect(call()[1].method).toBe('POST');
    expect(result).toMatchObject({ id: 1, mine: true });
    expect(result).not.toHaveProperty('owner_uid');
  });

  it('remove sends id and owner to traderie', async () => {
    reply(200, { id: 5 });
    await service.remove(5, 'u1');
    expect(call()[0]).toMatch(/\/api\/trades\/5\?owner_uid=u1$/);
    expect(call()[1].method).toBe('DELETE');
  });

  it('passes traderie errors through with status', async () => {
    reply(404, { message: 'trade 5 not found' });
    await expect(service.remove(5, 'u1')).rejects.toThrow(HttpException);
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `cd /Users/derekyang/D2R/d2r-service && npx jest src/trades/trades.service`
Expected: FAIL（`service.remove is not a function`、`mine` 不存在等）

- [ ] **Step 3: 實作**

`d2r-service/src/trades/trades.service.ts` 全檔換成：

```ts
import { HttpException, Injectable } from '@nestjs/common';

const TRADERIE_URL = process.env.TRADERIE_URL ?? 'http://localhost:7432';

export interface NewTrade {
  item_name: string;
  item_stats_raw: string | null;
  price: string;
  contact: string;
  category: string | null;
}

interface TradeRow extends NewTrade {
  id: number;
  created_at: string;
  owner_uid: string | null;
}

// Trades live in d2r-traderie's SQLite: this service's own DB is a read-only copy on Cloud Run
async function traderieTrades(init: RequestInit = {}, suffix = '') {
  const res = await fetch(`${TRADERIE_URL}/api/trades${suffix}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-api-token': process.env.TRADERIE_TOKEN ?? '',
    },
  });
  const data = (await res.json().catch(() => null)) as unknown;
  if (!res.ok)
    throw new HttpException(
      (data as { message?: string } | null)?.message ??
        `traderie trades: HTTP ${res.status}`,
      res.status,
    );
  return data;
}

// The owner's uid never leaves this service; contact is only for signed-in users
function toPublic({ owner_uid, contact, ...rest }: TradeRow, uid: string | null) {
  return {
    ...rest,
    ...(uid ? { contact } : {}),
    mine: uid !== null && owner_uid === uid,
  };
}

@Injectable()
export class TradesService {
  async findAll(query: { category?: string }, uid: string | null) {
    const qs =
      query.category === undefined
        ? ''
        : `?${new URLSearchParams({ category: query.category })}`;
    const rows = (await traderieTrades({}, qs)) as TradeRow[];
    return rows.map((r) => toPublic(r, uid));
  }

  async create(body: NewTrade, uid: string) {
    const trade = {
      item_name: body.item_name,
      item_stats_raw: body.item_stats_raw,
      price: body.price,
      contact: body.contact,
      category: body.category,
      owner_uid: uid,
    };
    const row = (await traderieTrades({
      method: 'POST',
      body: JSON.stringify(trade),
    })) as TradeRow;
    return toPublic(row, uid);
  }

  remove(id: number, uid: string) {
    return traderieTrades(
      { method: 'DELETE' },
      `/${id}?${new URLSearchParams({ owner_uid: uid })}`,
    );
  }
}
```

- [ ] **Step 4: 確認測試通過**

Run: `cd /Users/derekyang/D2R/d2r-service && npx eslint --fix src/trades/trades.service.ts src/trades/trades.service.spec.ts && npx jest src/trades/trades.service`
Expected: `Tests: 6 passed`。controller 還在用舊簽名，tsc 會報錯，Task 4 會修好，這一步先不跑 tsc。

- [ ] **Step 5: 不 commit**，和 Task 4 一起 commit（中間狀態無法編譯）。

---

### Task 4: d2r-service — controller 讀 uid 並加下架路由

**Files:**
- Modify: `d2r-service/src/trades/trades.controller.ts`
- Test: `d2r-service/src/trades/trades.controller.spec.ts`

- [ ] **Step 1: 寫失敗的測試**

`d2r-service/src/trades/trades.controller.spec.ts`：

```ts
import { UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { TradesController } from './trades.controller';
import { TradesService } from './trades.service';
import { getUid } from '../auth/firebase-auth';

jest.mock('../auth/firebase-auth', () => ({ getUid: jest.fn() }));

const uidMock = getUid as jest.Mock;
const req = {} as Request;
const body = {
  item_name: 'SOJ',
  item_stats_raw: null,
  price: '3 Ber',
  contact: 'a#1',
  category: 'rings',
};

describe('TradesController', () => {
  let service: { findAll: jest.Mock; create: jest.Mock; remove: jest.Mock };
  let controller: TradesController;

  beforeEach(() => {
    service = {
      findAll: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 1 }),
      remove: jest.fn().mockResolvedValue({ id: 1 }),
    };
    controller = new TradesController(service as unknown as TradesService);
  });

  it('lists trades for signed-out users with a null uid', async () => {
    uidMock.mockResolvedValue(null);
    await controller.findAll(req, 'rings');
    expect(service.findAll).toHaveBeenCalledWith({ category: 'rings' }, null);
  });

  it('rejects create without sign-in', async () => {
    uidMock.mockResolvedValue(null);
    await expect(controller.create(req, body)).rejects.toThrow(UnauthorizedException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it('creates with the signed-in uid', async () => {
    uidMock.mockResolvedValue('u1');
    await controller.create(req, body);
    expect(service.create).toHaveBeenCalledWith(body, 'u1');
  });

  it('rejects delete without sign-in', async () => {
    uidMock.mockResolvedValue(null);
    await expect(controller.remove(req, 1)).rejects.toThrow(UnauthorizedException);
  });

  it('deletes with the signed-in uid', async () => {
    uidMock.mockResolvedValue('u1');
    await controller.remove(req, 7);
    expect(service.remove).toHaveBeenCalledWith(7, 'u1');
  });
});
```

- [ ] **Step 2: 確認測試失敗**

Run: `cd /Users/derekyang/D2R/d2r-service && npx jest src/trades/trades.controller`
Expected: FAIL（`controller.remove is not a function`，參數順序也不對）

- [ ] **Step 3: 實作**

`d2r-service/src/trades/trades.controller.ts` 全檔換成：

```ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TradesService } from './trades.service';
import type { NewTrade } from './trades.service';
import { getUid } from '../auth/firebase-auth';

async function requireUid(req: Request): Promise<string> {
  const uid = await getUid(req);
  if (!uid) throw new UnauthorizedException('請先登入');
  return uid;
}

@Controller('trades')
export class TradesController {
  constructor(private readonly service: TradesService) {}

  @Get()
  async findAll(@Req() req: Request, @Query('category') category?: string) {
    const data = await this.service.findAll({ category }, await getUid(req));
    return { data, total: data.length };
  }

  @Post()
  async create(@Req() req: Request, @Body() body: NewTrade) {
    const uid = await requireUid(req);
    if (
      !body.item_name?.trim() ||
      !body.price?.trim() ||
      !body.contact?.trim()
    ) {
      throw new BadRequestException(
        'item_name, price, and contact are required',
      );
    }
    return { data: await this.service.create(body, uid) };
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const uid = await requireUid(req);
    return { data: await this.service.remove(id, uid) };
  }
}
```

- [ ] **Step 4: 確認全部通過**

Run: `cd /Users/derekyang/D2R/d2r-service && npx eslint --fix src/trades src/auth && npx tsc --noEmit -p tsconfig.json && npx jest`
Expected: tsc 無輸出；jest 全部 PASS（原有 16 個中 trades service 的 4 個換成 6 個，加上 auth 4 個、controller 5 個，共 27 個）

- [ ] **Step 5: Commit**

```bash
cd /Users/derekyang/D2R/d2r-service
git add src/trades
git commit -m "feat(trades): require sign-in to post or take down listings and to see contacts"
```

---

### Task 5: d2r-fe — Firebase Auth 與 API token

**Files:**
- Create: `d2r-fe/.env`
- Create: `d2r-fe/src/auth.ts`
- Modify: `d2r-fe/src/api/client.ts`
- Modify: `d2r-fe/src/api/index.ts`

- [ ] **Step 1: 安裝 SDK**

Run: `cd /Users/derekyang/D2R/d2r-fe && npm install firebase`
Expected: `package.json` 的 dependencies 出現 `"firebase"`

- [ ] **Step 2: 取得 web config 寫進 `.env`**

Run: `cd /Users/derekyang/D2R/d2r-fe && npx firebase apps:sdkconfig web`
若顯示沒有 web app，先停下來請使用者在 Firebase Console（專案 `d2r-diablo` → 專案設定 → 新增網頁應用程式）建立，再重跑。

把輸出的值寫成 `d2r-fe/.env`（這些是公開設定，可以 commit）：

```
VITE_FIREBASE_API_KEY=<apiKey>
VITE_FIREBASE_AUTH_DOMAIN=d2r-diablo.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=d2r-diablo
VITE_FIREBASE_APP_ID=<appId>
```

- [ ] **Step 3: 建 `src/auth.ts`**

```ts
import { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
});

export const auth = getAuth(app);
export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logOut = () => signOut(auth);

// undefined while Firebase restores the saved session, null when signed out
export function useUser() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  return user;
}
```

- [ ] **Step 4: client 自動帶 token**

`d2r-fe/src/api/client.ts` 全檔換成：

```ts
import axios from 'axios';
import { auth } from '../auth';

const client = axios.create({
  baseURL: '/api',
});

// waits for the saved session so the first request after a reload is already signed in
client.interceptors.request.use(async (config) => {
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default client;
```

- [ ] **Step 5: 加 `deleteTrade`**

`d2r-fe/src/api/index.ts` 在 `createTrade` 那段之後（`}) => client.post('/trades', body).then((r) => r.data.data),` 的下一行）加入：

```ts
  deleteTrade: (id: number) =>
    client.delete(`/trades/${id}`).then((r) => r.data.data),
```

- [ ] **Step 6: 驗證**

Run: `cd /Users/derekyang/D2R/d2r-fe && npm run build && npm run lint`
Expected: 兩者都成功、無錯誤

- [ ] **Step 7: Commit**

```bash
cd /Users/derekyang/D2R/d2r-fe
git add package.json package-lock.json .env src/auth.ts src/api/client.ts src/api/index.ts
git commit -m "feat(auth): sign in with Google and send the ID token with API calls"
```

---

### Task 6: d2r-fe — 導覽列登入按鈕

**Files:**
- Create: `d2r-fe/src/components/layout/AuthButton.tsx`
- Modify: `d2r-fe/src/components/layout/NavTree.tsx`

`NavTree` 同時用在 `Sidebar` 和 `MobileDrawer`，放在這裡兩邊都有。

- [ ] **Step 1: 建 `AuthButton.tsx`**

```tsx
import { logOut, signIn, useUser } from '../../auth';

export default function AuthButton() {
  const user = useUser();
  if (user === undefined) return null;

  return (
    <div className="px-4 pt-4 pb-2 text-[13px] text-[#aaa398]">
      {user ? (
        <div className="flex justify-between items-center gap-2">
          <span className="truncate">{user.displayName ?? user.email}</span>
          <button onClick={logOut} className="shrink-0 hover:text-white">
            登出
          </button>
        </div>
      ) : (
        <button onClick={signIn} className="hover:text-white">
          Google 登入
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 放進 NavTree**

`d2r-fe/src/components/layout/NavTree.tsx`：

在 import 區加：

```tsx
import AuthButton from './AuthButton';
```

把檔尾的 `NavTree` 改成：

```tsx
export default function NavTree() {
  return (
    <nav className="py-2">
      <AuthButton />
      {NAV.map((item) => (
        <NavNode key={item.label} item={item} />
      ))}
    </nav>
  );
}
```

- [ ] **Step 3: 驗證**

Run: `cd /Users/derekyang/D2R/d2r-fe && npm run build && npm run lint`
Expected: 成功

- [ ] **Step 4: Commit**

```bash
cd /Users/derekyang/D2R/d2r-fe
git add src/components/layout/AuthButton.tsx src/components/layout/NavTree.tsx
git commit -m "feat(auth): add a sign-in button to the navigation"
```

---

### Task 7: d2r-fe — 列表頁鎖聯絡方式、可下架

**Files:**
- Modify: `d2r-fe/src/pages/trade/TradeList.tsx`

- [ ] **Step 1: 改 import 與型別**

檔案開頭的 import 換成：

```tsx
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { isAxiosError } from 'axios';
import { api } from '../../api';
import { signIn, useUser } from '../../auth';
```

`interface Trade` 換成：

```tsx
interface Trade {
  id: number;
  item_name: string;
  item_stats_raw: string | null;
  price: string;
  contact?: string; // only sent to signed-in users
  category: string | null;
  created_at: string;
  mine: boolean;
}
```

- [ ] **Step 2: 改元件開頭的 state 與 query**

把 `export default function TradeList() {` 到 `copyContact` 結束（含）這段換成：

```tsx
export default function TradeList() {
  const [category, setCategory] = useState('');
  const params = category ? { category } : undefined;
  const user = useUser();
  const queryClient = useQueryClient();

  const { data: trades = [], isLoading } = useQuery<Trade[]>({
    // uid in the key refetches on sign-in/out, since contacts and "mine" depend on it
    queryKey: ['trades', category, user?.uid ?? null],
    queryFn: () => api.getTrades(params),
    enabled: user !== undefined,
  });

  const copyContact = (contact: string) => {
    navigator.clipboard.writeText(contact).catch(() => {
      window.prompt('複製聯絡方式：', contact);
    });
  };

  const takeDown = async (trade: Trade) => {
    if (!window.confirm(`確定下架「${trade.item_name}」？`)) return;
    try {
      await api.deleteTrade(trade.id);
    } catch (err) {
      const status = isAxiosError(err) ? err.response?.status : undefined;
      window.alert(status === 401 ? '請重新登入' : status === 404 ? '掛單不存在' : '下架失敗');
    }
    queryClient.invalidateQueries({ queryKey: ['trades'] });
  };
```

- [ ] **Step 3: 改每筆掛單右側的按鈕**

把整個「聯繫」`<button ...>聯繫</button>` 換成下面這段（樣式沿用原本的）：

```tsx
              {trade.contact ? (
                <button
                  onClick={() => copyContact(trade.contact!)}
                  title={trade.contact}
                  style={actionStyle}
                >
                  聯繫
                </button>
              ) : (
                <button onClick={signIn} style={actionStyle}>
                  登入查看
                </button>
              )}
              {trade.mine && (
                <button onClick={() => takeDown(trade)} style={actionStyle}>
                  下架
                </button>
              )}
```

並在 `truncate` 函式下方加入共用樣式：

```tsx
const actionStyle: React.CSSProperties = {
  background: '#191714',
  border: '1px solid #302c26',
  color: '#aaa',
  padding: '2px 8px',
  borderRadius: '2px',
  fontSize: '11px',
  cursor: 'pointer',
  flexShrink: 0,
};
```

- [ ] **Step 4: 驗證**

Run: `cd /Users/derekyang/D2R/d2r-fe && npm run build && npm run lint`
Expected: 成功。若 `React.CSSProperties` 報找不到 `React`，改成 `import type { CSSProperties } from 'react'` 並用 `CSSProperties`。

- [ ] **Step 5: Commit**

```bash
cd /Users/derekyang/D2R/d2r-fe
git add src/pages/trade/TradeList.tsx
git commit -m "feat(trade): show contacts only to signed-in users and let owners take listings down"
```

---

### Task 8: d2r-fe — 新增頁需要登入

**Files:**
- Modify: `d2r-fe/src/pages/trade/TradeNew.tsx`

- [ ] **Step 1: 加 import**

在 `TradeNew.tsx` 的 import 區加：

```tsx
import { signIn, useUser } from '../../auth';
```

- [ ] **Step 2: 加登入閘門**

在 `export default function TradeNew() {` 內第一行（`const navigate = useNavigate();` 之後）加入：

```tsx
  const user = useUser();
```

在 `return (` 前面加入（所有 hook 都已呼叫過，early return 不違反 hook 規則）：

```tsx
  if (user === undefined) return null;
  if (user === null) {
    return (
      <div>
        <BackButton fallback="/trade" />
        <p className="mb-3 text-[13px] text-[#aaa398]">發布掛單需要先登入。</p>
        <button onClick={signIn} className="text-[13px] hover:text-white">
          Google 登入
        </button>
      </div>
    );
  }
```

- [ ] **Step 3: 送出失敗的 401 提示**

把 `handleSubmit` 的 `try { ... } finally { ... }` 換成：

```tsx
    try {
      await api.createTrade({
        item_name: form.item_name.trim(),
        item_stats_raw: form.item_stats_raw.trim() || undefined,
        price: form.price.trim(),
        contact: form.contact.trim(),
        category: form.category || undefined,
      });
      navigate('/trade');
    } catch (err) {
      window.alert(isAxiosError(err) && err.response?.status === 401 ? '請重新登入' : '發布失敗');
    } finally {
      setSubmitting(false);
    }
```

並在 import 區加 `import { isAxiosError } from 'axios';`。

- [ ] **Step 4: 驗證**

Run: `cd /Users/derekyang/D2R/d2r-fe && npm run build && npm run lint`
Expected: 成功

- [ ] **Step 5: Commit**

```bash
cd /Users/derekyang/D2R/d2r-fe
git add src/pages/trade/TradeNew.tsx
git commit -m "feat(trade): ask for sign-in before posting a listing"
```

---

### Task 9: 本機整合測試

需要 Task 10 Step 1（Firebase Console 啟用 Google 登入）先完成，`localhost` 預設就在 Authorized domains 裡。

- [ ] **Step 1: 啟動三個服務**

```bash
# d2r-traderie（暫時 DB）
cd /Users/derekyang/D2R/d2r-traderie && npx nest build && DB_PATH=<scratchpad>/t3.db PORT=7499 node dist/src/main
# d2r-service（指向本機 traderie）
cd /Users/derekyang/D2R/d2r-service && TRADERIE_URL=http://localhost:7499 TRADERIE_TOKEN= npm run start:dev
# d2r-fe
cd /Users/derekyang/D2R/d2r-fe && npm run dev
```

- [ ] **Step 2: 手動檢查清單**

- 未登入開 `/trade`：每筆顯示「登入查看」，沒有「下架」。
- 未登入開 `/trade/new`：只看到登入提示。
- `curl -s -XPOST localhost:3001/api/trades -H 'content-type: application/json' -d '{"item_name":"x","price":"1","contact":"c"}'` 回 401。
- 登入後發一筆：列表出現，有「聯繫」和「下架」。
- 換另一個 Google 帳號登入：同一筆有「聯繫」但沒有「下架」。
- 用原帳號按「下架」：確認後消失。
- 重新整理頁面：仍是登入狀態，聯絡方式直接顯示。

---

### Task 10: 部署

- [ ] **Step 1（使用者手動）**：Firebase Console → `d2r-diablo` → Authentication → Sign-in method 啟用 Google；Settings → Authorized domains 確認有正式網域（`d2r-diablo.web.app` 及自訂網域）。
- [ ] **Step 2**：push d2r-traderie，並用 `deploy-traderie-myhost` 技能部署。部署後確認：

```bash
cd /Users/derekyang/D2R/d2r-service && set -a && . ./.env && set +a
curl -s -XPOST -H "x-api-token: $TRADERIE_TOKEN" -H 'content-type: application/json' -d '{"item_name":"x","price":"1","contact":"c"}' "$TRADERIE_URL/api/trades"
```

Expected: 400，訊息包含 `owner_uid`（不會寫入資料）。

- [ ] **Step 3**：push d2r-service 與 d2r-fe。
- [ ] **Step 4（使用者手動，自動模式會擋）**：

```bash
cd /Users/derekyang/D2R/d2r-fe && npx firebase deploy --only functions:d2r-api,hosting
```

- [ ] **Step 5**：正式站重跑 Task 9 Step 2 的檢查清單。
