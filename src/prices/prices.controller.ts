import { BadRequestException, Controller, Get, Query } from '@nestjs/common';
import { PricesService, Mode } from './prices.service';

@Controller('prices')
export class PricesController {
  constructor(private readonly svc: PricesService) {}

  @Get('items')
  getTrackedItems() {
    return this.svc.getTrackedItems();
  }

  @Get('latest')
  async getLatest(
    @Query('item') item: string,
    @Query('ladder') ladder: string,
    @Query('mode') mode: string,
  ) {
    if (!item?.trim()) throw new BadRequestException('item is required');
    return this.svc.getLatest(item.trim(), ladder === 'true', validateMode(mode));
  }

  @Get('history')
  async getHistory(
    @Query('item') item: string,
    @Query('ladder') ladder: string,
    @Query('mode') mode: string,
    @Query('limit') limit?: string,
  ) {
    if (!item?.trim()) throw new BadRequestException('item is required');
    return this.svc.getHistory(
      item.trim(),
      ladder === 'true',
      validateMode(mode),
      limit ? Math.min(parseInt(limit, 10), 168) : 24,
    );
  }
}

function validateMode(mode: string): Mode {
  if (mode === 'hc') return 'hc';
  return 'sc';
}
