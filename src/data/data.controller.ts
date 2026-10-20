import { Controller, Get, Header } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TradeItemsService } from '../trades/trade-items.service';

const CJK_RUN = /[一-鿿]{2,}/g;

// Tooltip wording split into CJK runs (numbers break lines apart on screen too), used to snap OCR misreads
// to real terms. Only our DB wording is used: d2data's older translation would pull correct reads to the
// wrong word. base_info labels are left out: they hold stale spellings such as 須要等級
export function ocrTerms(texts: (string | null)[]): string[] {
  const runs = texts.flatMap((t) => (t ? (t.match(CJK_RUN) ?? []) : []));
  return [...new Set(runs)].sort();
}

// Lists the trade pages load whole; the CDN keeps them for a minute, so admin edits show up within ~2 minutes
@Controller('data')
export class DataController {
  constructor(
    private readonly ds: DataSource,
    private readonly tradeItems: TradeItemsService,
  ) {}

  @Get('trade-items')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=60')
  tradeItemList() {
    return this.tradeItems.all();
  }

  @Get('base-item-names')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=60')
  async baseItemNames() {
    const rows: { name_zh: string | null }[] = await this.ds.query(
      'SELECT name_zh FROM base_items',
    );
    return rows.map((r) => r.name_zh).filter(Boolean);
  }

  @Get('ocr-terms')
  @Header('Cache-Control', 'public, max-age=60, s-maxage=60')
  async ocrTermList() {
    const col = async (sql: string) => {
      const rows: { t: string | null }[] = await this.ds.query(sql);
      return rows.map((r) => r.t);
    };
    const [labels, skills, bases, baseTypes, affixStats] = await Promise.all([
      col(
        "SELECT label_zh AS t FROM stat_defs WHERE value_type != 'base_info'",
      ),
      col('SELECT name_zh AS t FROM skills'),
      col('SELECT name_zh AS t FROM base_items'),
      col('SELECT DISTINCT base_type_zh AS t FROM items'),
      col('SELECT stats AS t FROM affixes WHERE stats IS NOT NULL'),
    ]);
    return ocrTerms([
      ...labels,
      ...skills,
      ...bases,
      ...baseTypes,
      ...affixStats.flatMap((s) => JSON.parse(s ?? '[]') as string[]),
    ]);
  }
}
