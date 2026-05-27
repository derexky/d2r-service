import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Runeword } from './entities/runeword.entity';
import { RunewordsService } from './runewords.service';
import { RunewordsController } from './runewords.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Runeword])],
  providers: [RunewordsService],
  controllers: [RunewordsController],
})
export class RunewordsModule {}
