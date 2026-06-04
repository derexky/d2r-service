import { BadRequestException, Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TradesService } from './trades.service';
import { Trade } from './entities/trade.entity';

@Controller('trades')
export class TradesController {
  constructor(private readonly service: TradesService) {}

  @Get()
  async findAll(@Query('category') category?: string) {
    const data = await this.service.findAll({ category });
    return { data, total: data.length };
  }

  @Post()
  async create(
    @Body() body: Pick<Trade, 'item_name' | 'item_stats_raw' | 'price' | 'contact' | 'category'>,
  ) {
    if (!body.item_name?.trim() || !body.price?.trim() || !body.contact?.trim()) {
      throw new BadRequestException('item_name, price, and contact are required');
    }
    return { data: await this.service.create(body) };
  }
}
