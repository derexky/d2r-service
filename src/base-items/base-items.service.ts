import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { BaseItem } from './entities/base-item.entity';

@Injectable()
export class BaseItemsService {
  constructor(
    @InjectRepository(BaseItem)
    private readonly repo: Repository<BaseItem>,
  ) {}

  findAll(query: { gid?: string; category?: string; grade?: string }) {
    const where: FindOptionsWhere<BaseItem> = {};
    if (query.gid) where.gid = query.gid;
    if (query.category) where.category = query.category;
    if (query.grade) where.grade = query.grade;
    return this.repo.find({ where, order: { gid: 'ASC', qlvl: 'ASC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }
}
