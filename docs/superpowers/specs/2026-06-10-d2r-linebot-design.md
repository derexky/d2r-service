---
name: d2r-linebot-design
description: LINE bot for querying D2R price statistics from Firebase Firestore
metadata:
  type: project
---

# D2R LINE Bot — Design Spec

**Date:** 2026-06-10

## Overview

A standalone LINE bot that allows users to query D2R item price statistics directly from Firebase Firestore. Responds to text commands with the top 10 most common trade prices for a given item.

## Architecture

New project: `d2r-linebot` (separate repo/directory from `d2r-service`)

**Stack:** Node.js + TypeScript + Express + `@line/bot-sdk` + `firebase-admin`

```
d2r-linebot/
├── src/
│   ├── index.ts          # Express server entry point, LINE webhook handler
│   ├── firebase.ts       # Firebase Admin init + getLatest Firestore query
│   └── price-handler.ts  # Command parsing, query, response formatting
├── .env.example
├── package.json
└── tsconfig.json
```

## Commands

Single command: `/price <item> [hc] [ladder]`

**Parsing rules:**
- Extract `hc` and `ladder` as flags (case-insensitive) from anywhere after `/price`
- Everything remaining after removing flags is the item name (trimmed)
- Defaults: mode = `sc`, ladder = `false`
- Examples:
  - `/price ber rune` → item=`ber rune`, sc, non-ladder
  - `/price ber rune ladder` → item=`ber rune`, sc, ladder
  - `/price ber rune hc` → item=`ber rune`, hc, non-ladder
  - `/price ber rune hc ladder` → item=`ber rune`, hc, ladder
  - `/price ber rune ladder hc` → same as above (order doesn't matter)

Messages that don't start with `/price` are ignored (no reply).

## Firebase Query

Replicates `PricesService.getLatest` from `d2r-service`:

```
price_snapshots/{item}/{ladder|nonladder}_{sc|hc}
  → orderBy synced_at desc, limit 1
```

**Document shape:**
```typescript
interface PriceSnapshot {
  synced_at?: { _seconds: number };
  price?: {
    count: number;
    top: { items: { name: string; quantity: number }[]; freq: number }[];
  };
  trade_window?: {
    earliest?: { _seconds: number };
    latest?: { _seconds: number };
  };
}
```

## Response Format

**Found (LINE text message):**
```
📊 Ber Rune | Ladder SC
樣本: 42 筆 | 更新: 6/10 14:30

#1  Jah Rune — 15次
#2  Ohm + Vex — 12次
#3  2× Ist — 8次
...（最多 10 筆）

成交區間: 6/8 – 6/10
```

- Items with `quantity > 1` are rendered as `2× ItemName`
- Multiple items in one price are joined with ` + `
- Timestamps formatted as `M/D HH:mm` (zh-TW locale)
- Show at most 10 entries from `price.top`

**Not found:**
```
找不到「ber rune」的價格資料（ladder sc）
```

**Parse error (no item name):**
```
用法：/price <物品名稱> [hc] [ladder]
例如：/price ber rune ladder
```

## Environment Variables

| Variable | Description |
|---|---|
| `LINE_CHANNEL_SECRET` | LINE channel secret for webhook signature verification |
| `LINE_CHANNEL_ACCESS_TOKEN` | LINE channel access token for sending replies |
| `GOOGLE_APPLICATION_CREDENTIALS` | Path to Firebase service account JSON |
| `PORT` | HTTP server port (default: 3000) |

## Error Handling

- LINE signature verification failure → 400 response (handled by `@line/bot-sdk` middleware)
- Firebase query error → reply "查詢失敗，請稍後再試"
- Unknown command (not `/price`) → no reply (silently ignore)

## Out of Scope

- `/items` list command (not requested)
- Price history (`getHistory`)
- Rich menus or quick reply buttons
- Authentication/user management
