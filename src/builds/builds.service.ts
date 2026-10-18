import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Build } from './entities/build.entity';

@Injectable()
export class BuildsService {
  constructor(
    @InjectRepository(Build)
    private readonly repo: Repository<Build>,
  ) {}

  // 列表只回卡片要用的欄位；有內容的排前面，再依評分（SQLite DESC 時 null 墊底）
  async findAll(query: { class?: string; source?: string }) {
    const where: Partial<Build> = {};
    if (query.class) where.class = query.class;
    if (query.source) where.source = query.source;
    const rows = await this.repo.find({ where, order: { rating: 'DESC', id: 'ASC' } });
    return rows
      .map((b) => ({
        id: b.id,
        class: b.class,
        name: b.name,
        rating: b.rating,
        description: b.description,
        test_info: b.test_info,
        source: b.source,
        has_detail: !!(b.stats || b.skills || b.gear || b.merc || b.guide),
      }))
      .sort((a, b) => Number(b.has_detail) - Number(a.has_detail));
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }
}
