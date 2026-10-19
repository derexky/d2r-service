import { HttpException, Injectable } from '@nestjs/common';

const TRADERIE_URL = process.env.TRADERIE_URL ?? 'http://localhost:7432';

export interface NewTrade {
  item_name: string;
  item_stats_raw: string | null;
  price: string;
  contact: string;
  category: string | null;
  item_ref?: string | null;
  quality?: string | null;
  base_ref?: string | null;
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
function toPublic(
  { owner_uid, contact, ...rest }: TradeRow,
  uid: string | null,
) {
  return {
    ...rest,
    ...(uid ? { contact } : {}),
    mine: uid !== null && owner_uid === uid,
  };
}

@Injectable()
export class TradesService {
  async findAll(
    query: { category?: string; item_ref?: string; base_ref?: string },
    uid: string | null,
  ) {
    const filters = Object.entries(query).filter(([, v]) => v !== undefined);
    const qs = filters.length ? `?${new URLSearchParams(filters)}` : '';
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
      item_ref: body.item_ref || null,
      quality: body.quality || null,
      base_ref: body.base_ref || null,
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
