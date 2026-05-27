import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ItemSet } from './entities/set.entity';
import { SetMember } from './entities/set-member.entity';
import { SetBonus } from './entities/set-bonus.entity';
import { SetsService } from './sets.service';
import { SetsController } from './sets.controller';

@Module({
  imports: [TypeOrmModule.forFeature([ItemSet, SetMember, SetBonus])],
  providers: [SetsService],
  controllers: [SetsController],
})
export class SetsModule {}
