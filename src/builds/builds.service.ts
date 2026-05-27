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

  findAll(query: { class?: string }) {
    const where: Partial<Build> = {};
    if (query.class) where.class = query.class;
    return this.repo.find({ where, order: { id: 'ASC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }
}
