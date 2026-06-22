import { Injectable, OnModuleInit } from '@nestjs/common';
import * as admin from 'firebase-admin';

export type Mode = 'sc' | 'hc';
type Combo = `${'ladder' | 'nonladder'}_${Mode}`;

function comboKey(ladder: boolean, mode: Mode): Combo {
  return `${ladder ? 'ladder' : 'nonladder'}_${mode}`;
}

@Injectable()
export class PricesService implements OnModuleInit {
  private db!: admin.firestore.Firestore;

  onModuleInit() {
    if (!admin.apps.length) admin.initializeApp();
    this.db = admin.firestore();
  }

  async getLatest(item: string, ladder: boolean, mode: Mode) {
    const snap = await this.db
      .collection('price_snapshots')
      .doc(item)
      .collection(comboKey(ladder, mode))
      .orderBy('synced_at', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data();
  }

  private trackedItemsCache: string[] | null = null;
  private trackedItemsCacheTime = 0;
  private static readonly CACHE_TTL = 5 * 60 * 1000;

  async getTrackedItems(): Promise<string[]> {
    const now = Date.now();
    if (this.trackedItemsCache && now - this.trackedItemsCacheTime < PricesService.CACHE_TTL) {
      return this.trackedItemsCache;
    }
    const docs = await this.db.collection('price_snapshots').listDocuments();
    this.trackedItemsCache = docs.map((d) => d.id);
    this.trackedItemsCacheTime = now;
    return this.trackedItemsCache;
  }

  async getHistory(item: string, ladder: boolean, mode: Mode, limit = 24) {
    const snap = await this.db
      .collection('price_snapshots')
      .doc(item)
      .collection(comboKey(ladder, mode))
      .orderBy('synced_at', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((d) => d.data());
  }
}
