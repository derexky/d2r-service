import { TradeItemsService } from './trade-items.service';

const repo = (rows: object[]) => ({ find: jest.fn().mockResolvedValue(rows) });

function make() {
  const items = repo([
    { id: 18412, name_zh: '新生天堂裂擊', category: 'charms' },
    { id: 18200, name_zh: '龍鱗', category: 'class_specific', baseItemId: 1 },
  ]);
  const runewords = repo([{ id: 5, name_zh: '謎團', slot: 'weapon' }]);
  const runes = repo([{ number: 30, name_zh: '貝' }]);
  const bases = repo([
    {
      id: 1,
      item_id: 'crown_shield',
      name_zh: '冠冕之盾',
      gid: 'shields',
      item_types: ['ashd', 'shld'],
    },
    {
      id: 2,
      item_id: 'crown_shield',
      name_zh: '冠冕之盾',
      gid: 'pal-shields',
      item_types: ['ashd', 'shld'],
    },
    {
      id: 3,
      item_id: 'war_hammer',
      name_zh: '戰鎚',
      gid: 'hammers',
      item_types: ['hamm'],
    },
    {
      id: 4,
      item_id: 'katar',
      name_zh: '拳刃',
      gid: 'katars',
      item_types: ['h2h', 'mele'],
    },
    {
      id: 5,
      item_id: 'diadem',
      name_zh: '權冠',
      gid: 'helms',
      item_types: ['circ', 'helm'],
    },
    {
      id: 6,
      item_id: 'wolf_head',
      name_zh: '狼頭',
      gid: 'helms',
      item_types: ['pelt', 'helm'],
    },
    {
      id: 7,
      item_id: 'grand_matron_bow',
      name_zh: '主母之弓',
      gid: 'bows',
      item_types: ['abow', 'bow'],
    },
  ]);
  const setMembers = repo([
    { id: 5544, item_name_zh: '馬維娜的施展', slot: 'weapon', baseItemId: 7 },
    {
      id: 5550,
      item_name_zh: '塔.拉夏的判決',
      slot: 'amulet',
      baseItemId: null,
    },
  ]);
  return {
    service: new TradeItemsService(
      items as never,
      runewords as never,
      runes as never,
      bases as never,
      setMembers as never,
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
          ref: 'set:5544',
          name: '馬維娜的施展',
          kind: 'set',
          category: 'ama-bows',
        },
        {
          ref: 'set:5550',
          name: '塔.拉夏的判決',
          kind: 'set',
          category: 'amulets',
        },
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
          category: 'katars',
        },
        {
          ref: 'base:wolf_head',
          name: '狼頭',
          kind: 'base',
          category: 'dru-helms',
        },
        {
          ref: 'item:18200',
          name: '龍鱗',
          kind: 'item',
          category: 'pal-shields',
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
        category: 'pal-shields',
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
