import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { PricesModule } from '../prices/prices.module';

@Module({
  imports: [PricesModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
