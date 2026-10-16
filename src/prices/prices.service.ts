import { Injectable } from '@nestjs/common';

export type Mode = 'sc' | 'hc';

const TRADERIE_URL = process.env.TRADERIE_URL ?? 'http://localhost:7432';

async function traderie(path: string, params: Record<string, string> = {}) {
  const res = await fetch(
    `${TRADERIE_URL}/api/prices/${path}?${new URLSearchParams(params)}`,
    {
      headers: { 'x-api-token': process.env.TRADERIE_TOKEN ?? '' },
    },
  );
  if (!res.ok) throw new Error(`traderie ${path}: HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

@Injectable()
export class PricesService {
  async getLatest(item: string, ladder: boolean, mode: Mode) {
    return traderie('latest', { item, ladder: String(ladder), mode });
  }

  // the tracked item lists change only when d2r-traderie syncs or redeploys
  private cache = new Map<string, { at: number; data: unknown }>();
  private static readonly CACHE_TTL = 5 * 60 * 1000;

  private async cached<T>(path: string): Promise<T> {
    const hit = this.cache.get(path);
    if (hit && Date.now() - hit.at < PricesService.CACHE_TTL)
      return hit.data as T;
    const data = (await traderie(path)) as T;
    this.cache.set(path, { at: Date.now(), data });
    return data;
  }

  getTrackedItems() {
    return this.cached<string[]>('items');
  }

  getTrackedGroups() {
    return this.cached<{ category: string; items: string[] }[]>('groups');
  }

  async getHistory(item: string, ladder: boolean, mode: Mode, limit = 24) {
    return traderie('history', {
      item,
      ladder: String(ladder),
      mode,
      limit: String(limit),
    });
  }
}
