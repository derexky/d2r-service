import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from '../items/entities/item.entity';
import { BaseItem } from '../base-items/entities/base-item.entity';
import { SyncService } from './sync.service';

@Module({
  imports: [TypeOrmModule.forFeature([Item, BaseItem])],
  providers: [SyncService],
})
export class SyncModule {}
