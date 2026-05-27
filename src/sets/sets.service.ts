import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ItemSet } from './entities/set.entity';

@Injectable()
export class SetsService {
  constructor(
    @InjectRepository(ItemSet)
    private readonly repo: Repository<ItemSet>,
  ) {}

  findAll() {
    return this.repo.find({ order: { id: 'ASC' } });
  }

  findOne(id: number) {
    return this.repo.findOne({
      where: { id },
      relations: { members: true, bonuses: true },
    });
  }
}
