import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Affix } from './entities/affix.entity';
import { Rune } from './entities/rune.entity';
import { Mercenary } from './entities/mercenary.entity';
import { Breakpoint } from './entities/breakpoint.entity';
import { ExperienceRatio } from './entities/experience-ratio.entity';
import { Monster } from './entities/monster.entity';
import { MonsterLevel } from './entities/monster-level.entity';

@Injectable()
export class ReferenceService {
  constructor(
    @InjectRepository(Affix) private readonly affixes: Repository<Affix>,
    @InjectRepository(Rune) private readonly runes: Repository<Rune>,
    @InjectRepository(Mercenary)
    private readonly mercenaries: Repository<Mercenary>,
    @InjectRepository(Breakpoint)
    private readonly breakpoints: Repository<Breakpoint>,
    @InjectRepository(ExperienceRatio)
    private readonly experienceRatios: Repository<ExperienceRatio>,
    @InjectRepository(Monster) private readonly monsters: Repository<Monster>,
    @InjectRepository(MonsterLevel)
    private readonly monsterLevels: Repository<MonsterLevel>,
  ) {}

  findAffixes(query: { kind?: string; type?: string; search?: string }) {
    const qb = this.affixes
      .createQueryBuilder('a')
      .orderBy('a.level', 'ASC')
      .addOrderBy('a.id', 'ASC');
    if (query.kind) qb.andWhere('a.kind = :kind', { kind: query.kind });
    // types 存成 JSON 陣列字串，以 "值" 比對避免子字串誤中（如「咒符」命中「特大咒符」）
    if (query.type)
      qb.andWhere('a.types LIKE :type', {
        type: `%${JSON.stringify(query.type)}%`,
      });
    if (query.search)
      qb.andWhere('a.name_zh LIKE :search', { search: `%${query.search}%` });
    return qb.getMany();
  }

  findRunes() {
    return this.runes.find({ order: { number: 'ASC' } });
  }

  findMercenaries() {
    return this.mercenaries.find({ order: { act: 'ASC', min_level: 'ASC' } });
  }

  findBreakpoints(query: { type?: string }) {
    const where: FindOptionsWhere<Breakpoint> = {};
    if (query.type) where.type = query.type;
    return this.breakpoints.find({ where, order: { type: 'ASC', id: 'ASC' } });
  }

  findExperienceRatios() {
    return this.experienceRatios.find({ order: { level: 'ASC' } });
  }

  findMonsterLevels() {
    return this.monsterLevels.find({ order: { level: 'ASC' } });
  }

  findMonsters(query: {
    search?: string;
    family?: string;
    kind?: string;
    act?: string;
  }) {
    const qb = this.monsters
      .createQueryBuilder('m')
      .orderBy('m.kind', 'ASC')
      .addOrderBy('m.name_zh', 'ASC');
    if (query.family)
      qb.andWhere('m.family = :family', { family: query.family });
    if (query.kind) qb.andWhere('m.kind = :kind', { kind: query.kind });
    // acts 是 JSON 數字陣列，如 [2] 或 [1,3]
    if (query.act)
      qb.andWhere(
        `EXISTS (SELECT 1 FROM json_each(m.acts) WHERE json_each.value = :act)`,
        { act: +query.act },
      );
    if (query.search)
      qb.andWhere('(m.name_zh LIKE :search OR m.name_en LIKE :search)', {
        search: `%${query.search}%`,
      });
    return qb.getMany();
  }

  async findMonster(key: string) {
    const monster = await this.monsters.findOneBy({ key });
    if (!monster) throw new NotFoundException();
    return monster;
  }
}
