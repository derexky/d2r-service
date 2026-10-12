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

  findAll(query: { class?: string; source?: string }) {
    const where: Partial<Build> = {};
    if (query.class) where.class = query.class;
    if (query.source) where.source = query.source;
    return this.repo.find({ where, order: { id: 'ASC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }
}
