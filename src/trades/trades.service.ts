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

  async findAll(query: { category?: string }): Promise<Trade[]> {
    const where: Partial<Trade> = {};
    if (query.category !== undefined) where.category = query.category;
    return this.repo.find({ where, order: { created_at: 'DESC' } });
  }

  async create(body: Pick<Trade, 'item_name' | 'item_stats_raw' | 'price' | 'contact' | 'category'>): Promise<Trade> {
    return this.repo.save(this.repo.create(body));
  }
}
