import * as fs from 'fs';
import { load } from 'cheerio';

export interface IASBreakpoint {
  ias_required: string;   // "0" | "210up" 等
  frames: string;         // "10" | "9.5" 等（攻擊階段/幀數）
}

export interface ParsedIAS {
  merc_type: string;     // act1 | act2 | act5
  weapon_type: string;
  base_speed: number;
  breakpoints: string;   // JSON: IASBreakpoint[]
}

function inferMercType(filename: string): string {
  const base = filename.toUpperCase();
  if (base.includes('ACT1')) return 'act1';
  if (base.includes('ACT2')) return 'act2';
  if (base.includes('ACT5')) return 'act5';
  return 'unknown';
}

export function parseIASFile(filepath: string, filename: string): ParsedIAS[] {
  const html = fs.readFileSync(filepath, 'utf-8');
  const $ = load(html) as any;
  const merc_type = inferMercType(filename);
  const results: ParsedIAS[] = [];

  // 每個 border="1" table = 一種武器類型
  $('table[border="1"]').each((_, table) => {
    const $rows = $(table).find('tr');
    if ($rows.length < 3) return;

    // 第一列：武器類型名稱（colspan 合併欄）
    const headerRow = $rows.first();
    const weapon_type = headerRow.text().trim();
    if (!weapon_type) return;

    // 第二列：欄位標題（準度% / 階段）
    // 第三列起：資料列
    const breakpoints: IASBreakpoint[] = [];

    $rows.each((i, tr) => {
      if (i < 2) return; // 跳過 header 兩列
      const $tds = $(tr).children('td');
      if ($tds.length < 2) return;

      const ias_required = $tds.eq(0).text().trim();
      const frames = $tds.eq(1).text().trim();
      if (ias_required && frames) {
        breakpoints.push({ ias_required, frames });
      }
    });

    if (breakpoints.length === 0) return;

    // base_speed = 第一列 frames（IAS=0 時的基礎幀數）
    const base_speed = parseFloat(breakpoints[0]?.frames ?? '10') || 10;

    results.push({
      merc_type,
      weapon_type,
      base_speed,
      breakpoints: JSON.stringify(breakpoints),
    });
  });

  return results;
}
