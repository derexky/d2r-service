import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './entities/item.entity';
import { ItemStat } from './entities/item-stat.entity';
import { StatDef } from './entities/stat-def.entity';
import { ItemsService } from './items.service';
import { ItemsController } from './items.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Item, ItemStat, StatDef])],
  providers: [ItemsService],
  controllers: [ItemsController],
})
export class ItemsModule {}
