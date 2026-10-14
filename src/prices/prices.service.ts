import { Injectable } from '@nestjs/common';

export type Mode = 'sc' | 'hc';

const TRADERIE_URL = process.env.TRADERIE_URL ?? 'http://localhost:7432';

async function traderie(path: string, params: Record<string, string> = {}) {
  const res = await fetch(`${TRADERIE_URL}/api/prices/${path}?${new URLSearchParams(params)}`, {
    headers: { 'x-api-token': process.env.TRADERIE_TOKEN ?? '' },
  });
  if (!res.ok) throw new Error(`traderie ${path}: HTTP ${res.status}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

@Injectable()
export class PricesService {
  async getLatest(item: string, ladder: boolean, mode: Mode) {
    return traderie('latest', { item, ladder: String(ladder), mode });
  }

  private trackedItemsCache: string[] | null = null;
  private trackedItemsCacheTime = 0;
  private static readonly CACHE_TTL = 5 * 60 * 1000;

  async getTrackedItems(): Promise<string[]> {
    const now = Date.now();
    if (this.trackedItemsCache && now - this.trackedItemsCacheTime < PricesService.CACHE_TTL) {
      return this.trackedItemsCache;
    }
    this.trackedItemsCache = (await traderie('items')) as string[];
    this.trackedItemsCacheTime = now;
    return this.trackedItemsCache;
  }

  async getHistory(item: string, ladder: boolean, mode: Mode, limit = 24) {
    return traderie('history', { item, ladder: String(ladder), mode, limit: String(limit) });
  }
}
