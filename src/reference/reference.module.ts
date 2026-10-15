import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Affix } from './entities/affix.entity';
import { BaseItem } from '../base-items/entities/base-item.entity';
import { Rune } from './entities/rune.entity';
import { Mercenary } from './entities/mercenary.entity';
import { Breakpoint } from './entities/breakpoint.entity';
import { ExperienceRatio } from './entities/experience-ratio.entity';
import { Monster } from './entities/monster.entity';
import { MonsterLevel } from './entities/monster-level.entity';
import { ReferenceService } from './reference.service';
import { ReferenceController } from './reference.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Affix,
      BaseItem,
      Rune,
      Mercenary,
      Breakpoint,
      ExperienceRatio,
      Monster,
      MonsterLevel,
    ]),
  ],
  controllers: [ReferenceController],
  providers: [ReferenceService],
})
export class ReferenceModule {}
