import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ItemsService } from './items.service';

@Controller('items')
export class ItemsController {
  constructor(private readonly service: ItemsService) {}

  @Get()
  async findAll(
    @Query('category') category?: string,
    @Query('tier') tier?: string,
    @Query('search') search?: string,
  ) {
    const data = await this.service.findAll({ category, tier, search });
    return { data, total: data.length };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.service.findOne(id) };
  }
}
