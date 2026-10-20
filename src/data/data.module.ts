import { Module } from '@nestjs/common';
import { TradesModule } from '../trades/trades.module';
import { DataController } from './data.controller';

@Module({
  imports: [TradesModule],
  controllers: [DataController],
})
export class DataModule {}
