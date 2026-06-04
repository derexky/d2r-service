import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Trade } from './entities/trade.entity';

@Injectable()
export class TradesService {
  constructor(
    @InjectRepository(Trade)
    private readonly repo: Repository<Trade>,
  ) {}

  findAll(query: { category?: string }) {
    const where: Partial<Trade> = {};
    if (query.category) where.category = query.category;
    return this.repo.find({ where, order: { created_at: 'DESC' } });
  }

  create(body: Pick<Trade, 'item_name' | 'item_stats_raw' | 'price' | 'contact' | 'category'>) {
    return this.repo.save(this.repo.create(body));
  }
}
