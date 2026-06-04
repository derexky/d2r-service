import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Runeword } from './entities/runeword.entity';

@Injectable()
export class RunewordsService {
  constructor(
    @InjectRepository(Runeword)
    private readonly repo: Repository<Runeword>,
  ) {}

  findAll(query: { slot?: string; version?: string }) {
    const where: FindOptionsWhere<Runeword> = {};
    if (query.slot) where.slot = query.slot;
    if (query.version) where.version = query.version;
    return this.repo.find({
      where,
      relations: { stat_list: true },
      order: { id: 'ASC', stat_list: { sort_order: 'ASC' } },
    });
  }

  findOne(id: number) {
    return this.repo.findOne({
      where: { id },
      relations: { stat_list: true },
      order: { stat_list: { sort_order: 'ASC' } },
    });
  }
}
