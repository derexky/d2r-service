import { HttpException, Injectable } from '@nestjs/common';

const TRADERIE_URL = process.env.TRADERIE_URL ?? 'http://localhost:7432';

export interface NewTrade {
  item_name: string;
  item_stats_raw: string | null;
  price: string;
  contact: string;
  category: string | null;
}

// Trades live in d2r-traderie's SQLite: this service's own DB is a read-only copy on Cloud Run
async function traderieTrades(init: RequestInit = {}, query = '') {
  const res = await fetch(`${TRADERIE_URL}/api/trades${query}`, {
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

@Injectable()
export class TradesService {
  async findAll(query: { category?: string }) {
    const qs =
      query.category === undefined
        ? ''
        : `?${new URLSearchParams({ category: query.category })}`;
    return (await traderieTrades({}, qs)) as unknown[];
  }

  create(body: NewTrade) {
    return traderieTrades({ method: 'POST', body: JSON.stringify(body) });
  }
}
