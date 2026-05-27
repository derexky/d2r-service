import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Runeword } from './entities/runeword.entity';

@Injectable()
export class RunewordsService {
  constructor(
    @InjectRepository(Runeword)
    private readonly repo: Repository<Runeword>,
  ) {}

  findAll(query: { slot?: string; version?: string }) {
    const where: Partial<Runeword> = {};
    if (query.slot) where.slot = query.slot;
    if (query.version) where.version = query.version;
    return this.repo.find({ where, order: { id: 'ASC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }
}
