import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { BuildsService } from './builds.service';

@Controller('builds')
export class BuildsController {
  constructor(private readonly service: BuildsService) {}

  @Get()
  async findAll(@Query('class') charClass?: string) {
    const data = await this.service.findAll({ class: charClass });
    return { data, total: data.length };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.service.findOne(id) };
  }
}
