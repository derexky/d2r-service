import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TradesService } from './trades.service';
import { TradesController } from './trades.controller';
import { TradeItemsService } from './trade-items.service';
import { Item } from '../items/entities/item.entity';
import { Runeword } from '../runewords/entities/runeword.entity';
import { Rune } from '../reference/entities/rune.entity';
import { BaseItem } from '../base-items/entities/base-item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Item, Runeword, Rune, BaseItem])],
  providers: [TradesService, TradeItemsService],
  controllers: [TradesController],
})
export class TradesModule {}
