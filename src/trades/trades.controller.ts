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
import { TradeItemsService, fitsRuneword } from './trade-items.service';
import { getUid } from '../auth/firebase-auth';

const QUALITIES = ['normal', 'magic', 'rare', 'crafted'];

async function requireUid(req: Request): Promise<string> {
  const uid = await getUid(req);
  if (!uid) throw new UnauthorizedException('請先登入');
  return uid;
}

@Controller('trades')
export class TradesController {
  constructor(
    private readonly service: TradesService,
    private readonly tradeItems: TradeItemsService,
  ) {}

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('category') category?: string,
    @Query('item_ref') item_ref?: string,
    @Query('base_ref') base_ref?: string,
  ) {
    const data = await this.service.findAll(
      { category, item_ref, base_ref },
      await getUid(req),
    );
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
    const item = body.item_ref
      ? await this.tradeItems.find(body.item_ref)
      : undefined;
    if (body.item_ref && !item) {
      throw new BadRequestException('未知的物品');
    }
    if (body.quality && !QUALITIES.includes(body.quality)) {
      throw new BadRequestException('未知的品質');
    }
    // only bases come in white, magic, rare or crafted
    const quality = item?.kind === 'base' ? body.quality || null : null;
    const base =
      item?.kind === 'runeword' && body.base_ref
        ? await this.tradeItems.find(body.base_ref)
        : undefined;
    if (
      item?.kind === 'runeword' &&
      body.base_ref &&
      !(base && fitsRuneword(base, item))
    ) {
      throw new BadRequestException('底材無法製作此符文之語');
    }
    return {
      data: await this.service.create(
        { ...body, quality, base_ref: base?.ref ?? null },
        uid,
      ),
    };
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const uid = await requireUid(req);
    return { data: await this.service.remove(id, uid) };
  }
}
