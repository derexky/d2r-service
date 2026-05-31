/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fs from 'fs';
import { load } from 'cheerio';

export interface ParsedSetMember {
  item_name_zh: string;
  item_name_en: string;
  slot: string;
  stats: string; // JSON: { label, color }[]
}

export interface ParsedSetBonus {
  pieces_required: string;
  effects: string; // JSON: string[]
}

export interface ParsedSet {
  name_zh: string;
  name_en: string;
  tier: string;
  members: ParsedSetMember[];
  bonuses: ParsedSetBonus[];
}

// 從成員 stats 文字中解析部分/完整套裝加成（綠色字 = 套裝加成）
function extractBonuses(stats: { label: string; color: string }[]): {
  memberStats: { label: string; color: string }[];
  setBonuses: { pieces_required: string; effects: string[] }[];
} {
  const memberStats: { label: string; color: string }[] = [];
  const bonusLines: string[] = [];

  for (const s of stats) {
    // 綠色 #00FF00 或 #00C400 = 套裝加成
    if (s.color === '#00FF00' || s.color === '#00C400' || s.color === '#008000') {
      bonusLines.push(s.label);
    } else {
      memberStats.push(s);
    }
  }

  // 從 bonusLines 推斷 pieces_required
  // e.g. "+150 防禦(2 件)" → 2
  const setBonuses: Map<string, string[]> = new Map();
  for (const line of bonusLines) {
    const match = line.match(/\((\d+)\s*件(?:套裝)?\)/);
    const key = match ? match[1] + '件' : '完整套裝';
    if (!setBonuses.has(key)) setBonuses.set(key, []);
    setBonuses.get(key)!.push(line);
  }

  return {
    memberStats,
    setBonuses: Array.from(setBonuses.entries()).map(([pieces_required, effects]) => ({
      pieces_required,
      effects,
    })),
  };
}

function normalizeImagePath(src: string): string | null {
  if (!src) return null;
  const match = src.match(/([^/\\]+\.(?:gif|jpg|jpeg|png))/i);
  if (!match) return null;
  return `/assets/img/${match[1].split('?')[0]}`;
}

function parseStats($td: any, $: any) {
  const stats: { label: string; color: string }[] = [];

  function walk(node: any, currentColor: string) {
    if (node.type === 'text') {
      const text = (node.data as string).replace(/\s+/g, ' ').trim();
      if (text && text !== '　') stats.push({ label: text, color: currentColor });
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

export function parseSetFile(filepath: string): ParsedSet | null {
  const html = fs.readFileSync(filepath, 'utf-8');
  const $ = load(html) as unknown as any;

  // 套裝名稱：第一個綠色大字
  let name_zh = '';
  let name_en = '';
  $('p').first().find('font, span').each((_, el) => {
    const text = $(el).text().trim();
    if (!text) return;
    const color = ($(el).attr('color') ?? '').toUpperCase();
    const style = $(el).attr('style') ?? '';
    const isGreen = color === '#00FF00' || style.includes('#00FF00') || style.includes('#00ff00');
    if (isGreen) {
      if (!name_zh) name_zh = text;
      else if (!name_en && /[A-Za-z]/.test(text)) name_en = text;
    }
  });

  if (!name_zh) {
    // fallback: title
    name_zh = $('title').text().replace('易牙居-成套裝備/', '').trim();
  }

  const members: ParsedSetMember[] = [];
  const allBonusMaps: Map<string, string[]> = new Map();

  // 找主 table（含物品資料）
  $('table').each((_, table) => {
    const $rows = $(table).children('tbody').children('tr').add($(table).children('tr'));

    $rows.each((_, tr) => {
      const $tds = $(tr).children('td');
      // 套裝成員列：左 td 有 <a name> + 圖片，右 td 有 stats
      if ($tds.length < 2) return;

      const $left = $tds.eq(0);
      const $right = $tds.eq(1);

      let anchor = $left.find('a[name]').first();
      if (!anchor.length) anchor = $right.find('a[name]').first();
      if (!anchor.length) return;

      const item_name_zh =
        $left.find('font[color="#00FF00"]').first().text().trim() ||
        $right.find('font[color="#00FF00"]').first().text().trim() ||
        anchor.attr('name')?.trim() || '';
      if (!item_name_zh) return;

      const yellowFont = $left.find('font[color="#FFFF00"]').first();
      const yellowLines = (yellowFont.html() ?? '').split(/<br\s*\/?>/i);
      const item_name_en = load(yellowLines[0] ?? '')('body').text().trim();

      // slot 推斷
      const baseTypeText = $left.clone().find('font[color="#FFFF00"]').remove().end().text().trim();
      let slot = '';
      const slotMap: [string, string][] = [
        ['盾', 'shield'], ['防', 'armor'], ['頭盔', 'helm'], ['面盔', 'helm'],
        ['手套', 'gloves'], ['靴子', 'boots'], ['鞋', 'boots'], ['腰帶', 'belt'],
        ['項鍊', 'amulet'], ['護身符', 'amulet'], ['戒指', 'ring'], ['武器', 'weapon'],
        ['刀', 'weapon'], ['斧', 'weapon'], ['杖', 'weapon'], ['棍', 'weapon'],
        ['劍', 'weapon'], ['錘', 'weapon'], ['矛', 'weapon'], ['弓', 'weapon'],
        ['甲', 'armor'], ['鎧', 'armor'], ['袍', 'armor'],
      ];
      for (const [zh, s] of slotMap) {
        if (baseTypeText.includes(zh)) { slot = s; break; }
      }

      const rawStats = parseStats($right, $);
      const { memberStats, setBonuses } = extractBonuses(rawStats);

      // 合併套裝加成
      for (const { pieces_required, effects } of setBonuses) {
        if (!allBonusMaps.has(pieces_required)) allBonusMaps.set(pieces_required, []);
        for (const e of effects) {
          if (!allBonusMaps.get(pieces_required)!.includes(e)) {
            allBonusMaps.get(pieces_required)!.push(e);
          }
        }
      }

      members.push({
        item_name_zh,
        item_name_en,
        slot,
        stats: JSON.stringify(memberStats),
      });
    });
  });

  // 套裝加成：有些頁面把完整加成放在 rowspan td
  const bonusCell = $('td[rowSpan], td[rowspan]').filter((_, el) => {
    return $(el).find('font[color="#FFFF00"]').length > 0;
  }).first();

  if (bonusCell.length) {
    const bonusText = bonusCell.text();
    const fullBonusLines = bonusText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && l !== '　');
    let currentKey = '完整套裝';
    for (const line of fullBonusLines) {
      const match = line.match(/\((\d+)\s*件\)/);
      if (match) currentKey = match[1] + '件';
      if (!allBonusMaps.has(currentKey)) allBonusMaps.set(currentKey, []);
      if (!allBonusMaps.get(currentKey)!.includes(line)) {
        allBonusMaps.get(currentKey)!.push(line);
      }
    }
  }

  const bonuses: ParsedSetBonus[] = Array.from(allBonusMaps.entries()).map(([pieces_required, effects]) => ({
    pieces_required,
    effects: JSON.stringify(effects),
  }));

  if (!name_zh || members.length === 0) return null;

  return {
    name_zh,
    name_en,
    tier: 'normal',
    members,
    bonuses,
  };
}
