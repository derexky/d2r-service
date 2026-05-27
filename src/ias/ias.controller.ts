import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { IasService } from './ias.service';

@Controller('ias')
export class IasController {
  constructor(private readonly service: IasService) {}

  // GET /api/ias/table?merc=act2&weapon=戰槍
  @Get('table')
  async getTable(
    @Query('merc') merc: string,
    @Query('weapon') weapon?: string,
  ) {
    const data = await this.service.getTable(merc, weapon);
    return { data, total: data.length };
  }

  // GET /api/ias/weapons?merc=act2
  @Get('weapons')
  async getWeapons(@Query('merc') merc: string) {
    const data = await this.service.getWeaponTypes(merc);
    return { data };
  }

  // GET /api/ias/calculate?merc=act2&weapon=戰槍&ias=30
  @Get('calculate')
  async calculate(
    @Query('merc') merc: string,
    @Query('weapon') weapon: string,
    @Query('ias', ParseIntPipe) ias: number,
  ) {
    const data = await this.service.calculate(merc, weapon, ias);
    return { data };
  }
}
