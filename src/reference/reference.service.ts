import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Like, Repository } from 'typeorm';
import { Affix } from './entities/affix.entity';
import { Rune } from './entities/rune.entity';
import { SocketBase } from './entities/socket-base.entity';
import { Mercenary } from './entities/mercenary.entity';

@Injectable()
export class ReferenceService {
  constructor(
    @InjectRepository(Affix) private readonly affixes: Repository<Affix>,
    @InjectRepository(Rune) private readonly runes: Repository<Rune>,
    @InjectRepository(SocketBase)
    private readonly socketBases: Repository<SocketBase>,
    @InjectRepository(Mercenary)
    private readonly mercenaries: Repository<Mercenary>,
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

  findSocketBases(query: { type?: string; search?: string }) {
    const where: FindOptionsWhere<SocketBase> = {};
    if (query.type) where.type = query.type;
    if (query.search) where.name_zh = Like(`%${query.search}%`);
    return this.socketBases.find({
      where,
      order: { type: 'ASC', qlvl: 'ASC' },
    });
  }

  findMercenaries() {
    return this.mercenaries.find({ order: { act: 'ASC', min_level: 'ASC' } });
  }
}
