import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaseItem } from '../base-items/entities/base-item.entity';
import { TradesModule } from '../trades/trades.module';
import { SyncService } from './sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([BaseItem]), TradesModule],
  providers: [SyncService],
})
export class SyncModule {}
