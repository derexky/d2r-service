import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { ReferenceService } from './reference.service';
import { Affix } from './entities/affix.entity';
import { BaseItem } from '../base-items/entities/base-item.entity';

const affix = (id: string, p: Partial<Affix>) =>
  ({
    id,
    item_types: [],
    excluded_types: [],
    class_specific: null,
    ...p,
  }) as unknown as Affix;

const AFFIXES = [
  affix('any-armor', { item_types: ['armo'] }),
  affix('weapon-only', { item_types: ['weap'] }),
  affix('armor-not-helm', { item_types: ['armo'], excluded_types: ['helm'] }),
  affix('assassin-only', { item_types: ['helm'], class_specific: 'ass' }),
  affix('barb-only', { item_types: ['helm'], class_specific: 'bar' }),
];

function service(base: Partial<BaseItem> | null) {
  const qb = {
    orderBy: () => qb,
    addOrderBy: () => qb,
    andWhere: () => qb,
    getMany: () => Promise.resolve(AFFIXES),
  };
  const affixes = {
    createQueryBuilder: () => qb,
  } as unknown as Repository<Affix>;
  const baseItems = {
    findOneBy: () => Promise.resolve(base),
  } as unknown as Repository<BaseItem>;
  const none = {} as Repository<never>;
  return new ReferenceService(
    affixes,
    baseItems,
    none,
    none,
    none,
    none,
    none,
    none,
  );
}

const ids = (rows: Affix[]) => rows.map((a) => a.id);

describe('ReferenceService.findAffixes with base', () => {
  it('matches spawn types through ancestors and honours excluded types', async () => {
    const rows = await service({ item_types: ['tors', 'armo'] }).findAffixes({
      base: '1',
    });
    expect(ids(rows)).toEqual(['any-armor', 'armor-not-helm']);
  });

  it('keeps class-specific affixes on generic items', async () => {
    const rows = await service({ item_types: ['helm', 'armo'] }).findAffixes({
      base: '1',
    });
    expect(ids(rows)).toEqual(['any-armor', 'assassin-only', 'barb-only']);
  });

  it("drops other classes' affixes from class items", async () => {
    const rows = await service({
      item_types: ['phlm', 'helm', 'armo', 'barb', 'clas'],
    }).findAffixes({ base: '1' });
    expect(ids(rows)).toEqual(['any-armor', 'barb-only']);
  });

  it('404s on an unknown base', async () => {
    await expect(service(null).findAffixes({ base: '9' })).rejects.toThrow(
      NotFoundException,
    );
  });
});
