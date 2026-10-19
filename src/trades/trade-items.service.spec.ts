import { TradeItemsService } from './trade-items.service';

const repo = (rows: object[]) => ({ find: jest.fn().mockResolvedValue(rows) });

function make() {
  const items = repo([
    { id: 18412, name_zh: '新生天堂裂擊', category: 'charms' },
  ]);
  const runewords = repo([{ id: 5, name_zh: '謎團', slot: 'weapon' }]);
  const runes = repo([{ number: 30, name_zh: '貝' }]);
  const bases = repo([
    { item_id: 'crown_shield', name_zh: '冠冕之盾', gid: 'shields' },
    { item_id: 'crown_shield', name_zh: '冠冕之盾', gid: 'pal-shields' },
    { item_id: 'war_hammer', name_zh: '戰鎚', gid: 'hammers' },
    { item_id: 'katar', name_zh: '拳刃', gid: 'katars' },
    { item_id: 'diadem', name_zh: '權冠', gid: 'helms' },
  ]);
  return {
    service: new TradeItemsService(
      items as never,
      runewords as never,
      runes as never,
      bases as never,
    ),
    items,
  };
}

describe('TradeItemsService', () => {
  it('lists every source with refs and categories', async () => {
    const list = await make().service.all();
    expect(list).toEqual(
      expect.arrayContaining([
        {
          ref: 'item:18412',
          name: '新生天堂裂擊',
          kind: 'item',
          category: 'charms',
        },
        {
          ref: 'runeword:5',
          name: '謎團',
          kind: 'runeword',
          category: 'runewords',
          slot: 'weapon',
        },
        { ref: 'rune:30', name: '貝', kind: 'rune', category: 'runes' },
        {
          ref: 'base:war_hammer',
          name: '戰鎚',
          kind: 'base',
          category: 'maces',
        },
        {
          ref: 'base:katar',
          name: '拳刃',
          kind: 'base',
          category: 'class_specific',
        },
        {
          ref: 'base:diadem',
          name: '權冠',
          kind: 'base',
          category: 'circlets',
        },
        { ref: 'misc:pk1', name: '恐懼之鑰', kind: 'misc', category: 'keys' },
        {
          ref: 'misc:talic',
          name: '塔力克的怨慟',
          kind: 'misc',
          category: 'statues',
        },
      ]),
    );
  });

  it('keeps one entry per base item', async () => {
    const list = await make().service.all();
    expect(list.filter((t) => t.ref === 'base:crown_shield')).toEqual([
      {
        ref: 'base:crown_shield',
        name: '冠冕之盾',
        kind: 'base',
        category: 'shields',
      },
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
