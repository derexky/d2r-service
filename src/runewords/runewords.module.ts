import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Runeword } from './entities/runeword.entity';
import { RunewordStat } from './entities/runeword-stat.entity';
import { StatDef } from '../items/entities/stat-def.entity';
import { RunewordsService } from './runewords.service';
import { RunewordsController } from './runewords.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Runeword, RunewordStat, StatDef])],
  providers: [RunewordsService],
  controllers: [RunewordsController],
})
export class RunewordsModule {}
