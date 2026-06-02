import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BaseItem } from './entities/base-item.entity';
import { BaseItemsService } from './base-items.service';
import { BaseItemsController } from './base-items.controller';

@Module({
  imports: [TypeOrmModule.forFeature([BaseItem])],
  controllers: [BaseItemsController],
  providers: [BaseItemsService],
})
export class BaseItemsModule {}
