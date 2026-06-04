import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindManyOptions, Like, In } from 'typeorm';
import { Item } from './entities/item.entity';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private readonly repo: Repository<Item>,
  ) {}

  findAll(query: { category?: string; tier?: string; search?: string }) {
    const where: FindManyOptions<Item>['where'] = {};
    if (query.category) where.category = query.category;
    if (query.tier) where.tier = In([query.tier, 'mixed']);
    if (query.search) where.name_zh = Like(`%${query.search}%`);
    return this.repo.find({ where, order: { id: 'ASC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }
}
