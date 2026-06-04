import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';
import { Skill } from './entities/skill.entity';

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private readonly repo: Repository<Skill>,
  ) {}

  findAll(query: { class?: string; skill_tree?: string }) {
    const where: FindOptionsWhere<Skill> = {};
    if (query.class) where.class = query.class;
    if (query.skill_tree) where.skill_tree = query.skill_tree;
    return this.repo.find({ where, order: { class: 'ASC', skill_tree: 'ASC', name_en: 'ASC' } });
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }
}
