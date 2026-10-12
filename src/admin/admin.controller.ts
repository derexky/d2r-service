import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import type { ListQuery } from './admin.service';

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly service: AdminService) {}

  // 須宣告在 :table 之前，避免被當成資料表名稱
  @Get('tables')
  tables() {
    return this.service.tables();
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
