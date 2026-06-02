import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { BaseItemsService } from './base-items.service';

@Controller('base-items')
export class BaseItemsController {
  constructor(private readonly service: BaseItemsService) {}

  @Get()
  async findAll(@Query() query: { gid?: string; category?: string; grade?: string }) {
    const data = await this.service.findAll(query);
    return { data, total: data.length };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.service.findOne(id) };
  }
}
