import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TradesService } from './trades.service';
import type { NewTrade } from './trades.service';
import { getUid } from '../auth/firebase-auth';

async function requireUid(req: Request): Promise<string> {
  const uid = await getUid(req);
  if (!uid) throw new UnauthorizedException('請先登入');
  return uid;
}

@Controller('trades')
export class TradesController {
  constructor(private readonly service: TradesService) {}

  @Get()
  async findAll(@Req() req: Request, @Query('category') category?: string) {
    const data = await this.service.findAll({ category }, await getUid(req));
    return { data, total: data.length };
  }

  @Post()
  async create(@Req() req: Request, @Body() body: NewTrade) {
    const uid = await requireUid(req);
    if (
      !body.item_name?.trim() ||
      !body.price?.trim() ||
      !body.contact?.trim()
    ) {
      throw new BadRequestException(
        'item_name, price, and contact are required',
      );
    }
    return { data: await this.service.create(body, uid) };
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const uid = await requireUid(req);
    return { data: await this.service.remove(id, uid) };
  }
}
