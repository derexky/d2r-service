/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import { load } from 'cheerio';

export interface ParsedItem {
  name_zh: string;
  name_en: string;
  category: string;
  tier: string;
  class_restrict: string | null;
  image_path: string | null;
  base_type_zh: string | null;
  base_type_en: string | null;
  level_req: number | null;
  stats: string;
}

function inferMeta(filename: string): { category: string; tier: string; class_restrict: string | null } {
  const base = filename.replace(/\.htm$/i, '');
  const tierMap: Record<string, string> = { '1': 'normal', '2': 'exceptional', '3': 'elite' };
  const classItemMap: Record<string, string> = {
    baritem: 'barbarian', amaitem: 'amazon', assitem: 'assassin',
    druitem: 'druid', necitem: 'necromancer', palitem: 'paladin', soritem: 'sorceress',
  };
  if (classItemMap[base.toLowerCase()]) {
    return { category: 'class_specific', tier: 'mixed', class_restrict: classItemMap[base.toLowerCase()] };
  }
  const match = base.match(/^([A-Za-z]+)(\d)$/);
  if (match) return { category: match[1].toLowerCase(), tier: tierMap[match[2]] ?? 'normal', class_restrict: null };
  return { category: base.toLowerCase(), tier: 'normal', class_restrict: null };
}

function normalizeImagePath(src: string): string | null {
  if (!src) return null;
  const match = src.match(/([^/\\]+\.(?:gif|jpg|jpeg|png))/i);
  if (!match) return null;
  return `/assets/img/${match[1].split('?')[0]}`;
}

function parseStats($td: any): { label: string; color: string }[] {
  const stats: { label: string; color: string }[] = [];

  function walk(node: any, currentColor: string) {
    if (node.type === 'text') {
      const text = (node.data as string).replace(/\s+/g, ' ').trim();
      if (text && text !== '　' && text !== ' ') stats.push({ label: text, color: currentColor });
    } else if (node.type === 'tag') {
      let color = currentColor;
      if (node.name === 'font' && node.attribs?.color) color = (node.attribs.color as string).toUpperCase();
      for (const child of node.children ?? []) walk(child, color);
    }
  }

  const el = $td.get(0);
  if (el) for (const child of (el as any).children ?? []) walk(child, '#FFFFFF');

  const merged: { label: string; color: string }[] = [];
  for (const s of stats) {
    const last = merged[merged.length - 1];
    if (last && last.color === s.color) last.label = (last.label + ' ' + s.label).trim();
    else merged.push({ ...s });
  }
  return merged.filter((s) => s.label.length > 0);
}

export function parseItemFile(filepath: string, filename: string): ParsedItem[] {
  const html = fs.readFileSync(filepath, 'utf-8');
  const $ = load(html);
  const { category, tier, class_restrict } = inferMeta(filename);
  const items: ParsedItem[] = [];

  $('table').each((_, table) => {
    const $table = $(table);
    const rows = $table.children('tbody').children('tr').add($table.children('tr') as any);

    rows.each((_, tr) => {
      const $tds = $(tr).children('td');
      if ($tds.length < 2) return;

      const $left = $tds.eq(0);
      const $right = $tds.eq(1);

      // Some class-item files put <a name> in the right td
      let anchor = $left.find('a[name]').first();
      if (!anchor.length) anchor = $right.find('a[name]').first();
      if (!anchor.length) return;

      // Some class-item files use <span><font> instead of <b><font>
      const name_zh =
        $left.find('b font[color="#808000"]').first().text().trim() ||
        $left.find('font[color="#808000"]').first().text().trim() ||
        anchor.attr('name')?.trim() || '';
      if (!name_zh) return;

      const img = $left.find('img').first();
      const image_path = normalizeImagePath(img.attr('src') ?? '');

      const yellowFont = $left.find('font[color="#FFFF00"]').filter((_, el) => $(el as any).text().trim().length > 0).first();
      const yellowLines = (yellowFont.html() ?? '').split(/<br\s*\/?>/i);
      const name_en = load(yellowLines[0] ?? '')('body').text().trim();
      const base_type_en = load(yellowLines[1] ?? '')('body').text().trim() || null;

      const leftClone = $left.clone();
      leftClone.find('b, font[color="#808000"], font[color="#FFFF00"], img, a').remove();
      const base_type_zh = leftClone.text().replace(/\s+/g, ' ').replace(/　/g, '').trim() || null;

      const rightText = $right.text();
      const levelMatch = rightText.match(/等級需求[：:]\s*(\d+)/) || rightText.match(/須要等級[：:]\s*(\d+)/);
      const level_req = levelMatch ? parseInt(levelMatch[1]) : null;

      const stats = parseStats($right);

      items.push({ name_zh, name_en, category, tier, class_restrict, image_path, base_type_zh, base_type_en, level_req, stats: JSON.stringify(stats) });
    });
  });

  return items;
}
