import { Controller, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { RunewordsService } from './runewords.service';

@Controller('runewords')
export class RunewordsController {
  constructor(private readonly service: RunewordsService) {}

  @Get()
  async findAll(
    @Query('slot') slot?: string,
    @Query('version') version?: string,
  ) {
    const data = await this.service.findAll({ slot, version });
    return { data, total: data.length };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.service.findOne(id) };
  }
}
