import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { SetsService } from './sets.service';

@Controller('sets')
export class SetsController {
  constructor(private readonly service: SetsService) {}

  @Get()
  async findAll() {
    const data = await this.service.findAll();
    return { data, total: data.length };
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return { data: await this.service.findOne(id) };
  }
}
