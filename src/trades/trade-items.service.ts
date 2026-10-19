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
  slot?: string;
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

// base_items files circlets under helms, but items gives them their own category
const CIRCLETS = new Set(['circlet', 'coronet', 'tiara', 'diadem']);

// Tradeable items the item DB doesn't have
const MISC: TradeItem[] = [
  { ref: 'misc:pk1', name: '恐懼之鑰', kind: 'misc', category: 'keys' },
  { ref: 'misc:pk2', name: '憎恨之鑰', kind: 'misc', category: 'keys' },
  { ref: 'misc:pk3', name: '毀滅之鑰', kind: 'misc', category: 'keys' },
  {
    ref: 'misc:talic',
    name: '塔力克的怨慟',
    kind: 'misc',
    category: 'statues',
  },
  {
    ref: 'misc:korlic',
    name: '科力克的苦痛',
    kind: 'misc',
    category: 'statues',
  },
  {
    ref: 'misc:madawc',
    name: '馬道克的怒火',
    kind: 'misc',
    category: 'statues',
  },
  {
    ref: 'misc:bulkathos',
    name: '布爾凱索的夢魘',
    kind: 'misc',
    category: 'statues',
  },
  {
    ref: 'misc:worusk',
    name: '沃魯斯克的終結',
    kind: 'misc',
    category: 'statues',
  },
];

@Injectable()
export class TradeItemsService {
  constructor(
    @InjectRepository(Item) private readonly items: Repository<Item>,
    @InjectRepository(Runeword)
    private readonly runewords: Repository<Runeword>,
    @InjectRepository(Rune) private readonly runes: Repository<Rune>,
    @InjectRepository(BaseItem) private readonly bases: Repository<BaseItem>,
  ) {}

  // The item DB is read-only at runtime, so the list is built once
  private list?: Promise<TradeItem[]>;

  all(): Promise<TradeItem[]> {
    // A failed build is not cached, so the next call retries
    return (this.list ??= this.build().catch((err) => {
      this.list = undefined;
      throw err;
    }));
  }

  async find(ref: string): Promise<TradeItem | undefined> {
    return (await this.all()).find((t) => t.ref === ref);
  }

  private async build(): Promise<TradeItem[]> {
    const [items, runewords, runes, bases] = await Promise.all([
      this.items.find({
        select: { id: true, name_zh: true, category: true },
        order: { id: 'ASC' },
      }),
      this.runewords.find({
        select: { id: true, name_zh: true, slot: true },
        order: { id: 'ASC' },
      }),
      this.runes.find({
        select: { number: true, name_zh: true },
        order: { number: 'ASC' },
      }),
      this.bases.find({
        select: { item_id: true, name_zh: true, gid: true },
        order: { id: 'ASC' },
      }),
    ]);
    // paladin shields are stored under both shields and pal-shields
    const seen = new Set<string>();
    const uniqueBases = bases.filter(
      (b) => !seen.has(b.item_id) && seen.add(b.item_id),
    );
    return [
      ...items.map(
        (i): TradeItem => ({
          ref: `item:${i.id}`,
          name: i.name_zh,
          kind: 'item',
          category: i.category,
        }),
      ),
      ...runewords.map(
        (r): TradeItem => ({
          ref: `runeword:${r.id}`,
          name: r.name_zh,
          kind: 'runeword',
          category: 'runewords',
          slot: r.slot,
        }),
      ),
      ...runes.map(
        (r): TradeItem => ({
          ref: `rune:${r.number}`,
          name: r.name_zh,
          kind: 'rune',
          category: 'runes',
        }),
      ),
      ...uniqueBases.map(
        (b): TradeItem => ({
          ref: `base:${b.item_id}`,
          name: b.name_zh,
          kind: 'base',
          category: CIRCLETS.has(b.item_id)
            ? 'circlets'
            : (BASE_CATEGORY[b.gid] ?? b.gid),
        }),
      ),
      ...MISC,
    ];
  }
}
