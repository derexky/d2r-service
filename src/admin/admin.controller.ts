import {
  All,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import type { ListQuery } from './admin.service';
import { PricesService } from '../prices/prices.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly prices: PricesService,
  ) {}

  // 須宣告在 :table 之前，避免被當成資料表名稱
  @Get('tables')
  tables() {
    return this.service.tables();
  }

  // d2r-traderie 的價格追蹤清單（存在 traderie 自己的 DB，改了立即生效，不用重新部署）
  @Get('tracked')
  listTracked() {
    return this.prices.listTracked();
  }

  @Post('tracked')
  addTracked(@Body() body: Record<string, unknown>) {
    return this.prices.addTracked(body);
  }

  @Patch('tracked/:name')
  updateTracked(
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.prices.updateTracked(name, body);
  }

  @Delete('tracked/:name')
  removeTracked(@Param('name') name: string) {
    return this.prices.removeTracked(name);
  }

  // d2r-traderie 的低價通知與價值表，method 與路徑原樣轉發到 traderie 的 /api/prices/...
  @All(['alerts', 'alerts/*rest', 'values', 'values/*rest'])
  traderie(@Req() req: Request, @Body() body: unknown) {
    const path = req.originalUrl.replace(/^\/api\/admin\//, '');
    return this.prices.proxyAdmin(req.method, path, body);
  }

  @Get(':table')
  list(@Param('table') table: string, @Query() query: ListQuery) {
    return this.service.list(table, query);
  }

  @Get(':table/:id')
  get(@Param('table') table: string, @Param('id') id: string) {
    return this.service.get(table, id);
  }

  @Post(':table')
  create(@Param('table') table: string, @Body() body: Record<string, unknown>) {
    return this.service.create(table, body);
  }

  @Patch(':table/:id')
  update(
    @Param('table') table: string,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.update(table, id, body);
  }

  @Delete(':table/:id')
  remove(@Param('table') table: string, @Param('id') id: string) {
    return this.service.remove(table, id);
  }
}
