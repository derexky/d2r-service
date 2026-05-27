/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import { load } from 'cheerio';

export interface ParsedBuild {
  class: string;
  name: string;
  test_info: string;
  stats: string;
  skills: string;
  gear: string;
  video_url: string;
  save_url: string;
}

function inferClass(filename: string): string {
  const base = filename.replace(/\.htm$/i, '').toUpperCase();
  if (base.startsWith('BAR')) return 'barbarian';
  if (base.startsWith('AMA')) return 'amazon';
  if (base.startsWith('ASS')) return 'assassin';
  if (base.startsWith('DRU')) return 'druid';
  if (base.startsWith('NEC')) return 'necromancer';
  if (base.startsWith('PAL')) return 'paladin';
  if (base.startsWith('SOR')) return 'sorceress';
  return 'unknown';
}

function parseStatsTable($table: any, $: any) {
  const stats: Record<string, string> = {};
  const skillLines: string[] = [];

  $table.find('tr').each((i: number, tr: any) => {
    const $tds = $(tr).children('td');
    if ($tds.length < 2) return;
    const leftText: string = $tds.eq(0).text().replace(/\s+/g, ' ').trim();
    const rightText: string = $tds.eq(1).text().replace(/\s+/g, ' ').trim();

    const statMatch = leftText.match(/^(力量|敏捷|體力|精力)[：:]\s*(\d+)/);
    if (statMatch) {
      stats[statMatch[1]] = leftText.match(/=\s*(\d+)/)?.[1] ?? '';
    }
    if (rightText && !rightText.includes('建議') && !rightText.includes('點數:')) {
      skillLines.push(rightText);
    }
  });

  return { stats, skills: skillLines.filter(Boolean) };
}

function parseGearTable($table: any, $: any) {
  const gear: { slot: string; item_name_zh: string; socket: string; props: string }[] = [];

  $table.find('tr').each((_i: number, tr: any) => {
    const $tds = $(tr).children('td');
    if ($tds.length < 4) return;
    const slot: string = $tds.eq(0).text().replace(/\s+/g, '').trim();
    const itemName: string = $tds.eq(1).text().replace(/\s+/g, ' ').trim();
    const socket: string = $tds.eq(2).text().replace(/\s+/g, ' ').trim();
    const props: string = $tds.eq(3).text().replace(/\s+/g, ' ').trim();
    if (!slot || slot.includes('分類') || slot.includes('裝備建議')) return;
    gear.push({ slot, item_name_zh: itemName, socket, props });
  });

  return gear;
}

export function parseBuildFile(filepath: string, filename: string): ParsedBuild[] {
  const html = fs.readFileSync(filepath, 'utf-8');
  const $ = load(html) as any;
  const charClass = inferClass(filename);

  const nameParagraphs = $('p[align="center"]').filter((_: number, el: any) =>
    $(el).find('font[color="#00ffff"], font[color="#00FFFF"]').length > 0,
  );
  const nameText: string = nameParagraphs.first().text().replace(/\s+/g, '').trim();

  let test_info = '';
  nameParagraphs.each((_: number, el: any) => {
    const t: string = $(el).text().trim();
    if (t.includes('測試等級') || t.includes('難度')) { test_info = t; return false; }
  });

  let video_url = '';
  $('param[name="movie"]').each((_: number, el: any) => { video_url = $(el).attr('value') ?? ''; return false; });
  if (!video_url) $('embed').each((_: number, el: any) => { video_url = $(el).attr('src') ?? ''; return false; });

  let save_url = '';
  $('a[href]').each((_: number, el: any) => {
    const href: string = $(el).attr('href') ?? '';
    if (href.includes('.rar')) { save_url = href; return false; }
  });

  const borderedTables = $('table[border="1"]');
  let statsData: Record<string, string> = {};
  let skillLines: string[] = [];
  let gearData: { slot: string; item_name_zh: string; socket: string; props: string }[] = [];

  if (borderedTables.length >= 1) {
    const result = parseStatsTable(borderedTables.eq(0), $);
    statsData = result.stats;
    skillLines = result.skills;
  }
  if (borderedTables.length >= 2) {
    gearData = parseGearTable(borderedTables.eq(1), $);
  }

  return [{
    class: charClass,
    name: nameText || filename.replace(/\.htm$/i, ''),
    test_info,
    stats: JSON.stringify(statsData),
    skills: JSON.stringify(skillLines),
    gear: JSON.stringify(gearData),
    video_url,
    save_url,
  }];
}
