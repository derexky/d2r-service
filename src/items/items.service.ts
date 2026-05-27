import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Like } from 'typeorm';
import { Item } from './entities/item.entity';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly repo: Repository<Item>,
  ) {}

  findAll(query: { category?: string; tier?: string; class_restrict?: string; search?: string }) {
    const where: FindManyOptions<Item>['where'] = {};
    if (query.category) where.category = query.category;
    if (query.tier) where.tier = query.tier;
    if (query.class_restrict && query.class_restrict !== 'all') where.class_restrict = query.class_restrict;
    if (query.search) where.name_zh = Like(`%${query.search}%`);
    return this.repo.find({ where, order: { id: 'ASC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }
}
