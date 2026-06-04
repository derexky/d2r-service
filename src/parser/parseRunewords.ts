import * as fs from 'fs';
import { load } from 'cheerio';
import { ParsedStatEntry, parseStatLines, lineToEntry } from './parseItems';

export interface ParsedRuneword {
  name_zh: string;
  name_en: string;
  slot: string;       // weapon | armor | shield | helm
  socket_count: number;
  runes: string;      // JSON string[]
  version: string;
  effects: string;    // JSON string[] 原始文字，供比對用
  stat_entries: ParsedStatEntry[];
}

// runewa → weapon, runewb → shield, runewc → armor, runewed → helm
// Trunewa/b/c/d → 天梯版
function inferSlot(filename: string): { slot: string; version: string } {
  const base = filename.replace(/\.htm$/i, '').toLowerCase();
  if (base.includes('1.11') || base.startsWith('trunewd') || base === 'runewd') return { slot: 'helm', version: base.includes('1.11') ? '1.11' : '1.10' };
  if (base === 'runewc' || base.startsWith('trunewc')) return { slot: 'armor', version: base.startsWith('t') ? 'ladder' : '1.10' };
  if (base === 'runewb' || base.startsWith('trunewb')) return { slot: 'shield', version: base.startsWith('t') ? 'ladder' : '1.10' };
  if (base === 'runewa' || base.startsWith('trunewa')) return { slot: 'weapon', version: base.startsWith('t') ? 'ladder' : '1.10' };
  if (base === '1.11runew') return { slot: 'weapon', version: '1.11' };
  return { slot: 'weapon', version: '1.10' };
}

// "Amn安姆(11)+Tir特爾(3)" → ['Amn', 'Tir']
function extractRunes(text: string): string[] {
  // 英文符文名是大寫開頭、純 ASCII 字母
  const matches = text.match(/[A-Z][a-z]+/g) ?? [];
  // 過濾掉非符文詞（Socket, Melee, Weapons...）
  const validRunes = new Set([
    'El','Eld','Tir','Nef','Eth','Ith','Tal','Ral','Ort','Thul','Amn','Sol',
    'Shael','Dol','Hel','Io','Lum','Ko','Fal','Lem','Pul','Um','Mal','Ist',
    'Gul','Vex','Ohm','Lo','Sur','Ber','Jah','Cham','Zod',
  ]);
  return matches.filter((r) => validRunes.has(r));
}

// 從 slot/socket 欄位解析
function parseSocketCount(text: string): number {
  const match = text.match(/(\d+)\s*Socket/i) || text.match(/有\s*(\d+)\s*個凹槽/);
  return match ? parseInt(match[1]) : 2;
}

export function parseRunewordFile(filepath: string, filename: string): ParsedRuneword[] {
  const html = fs.readFileSync(filepath, 'utf-8');
  const $ = load(html);
  const { slot, version } = inferSlot(filename);
  const rws: ParsedRuneword[] = [];

  // 符文字頁的主 table 有 4 欄: 名稱 | 符文組合 | 材料 | 效果
  $('table').each((_, table) => {
    const $rows = $(table).find('tr');
    if ($rows.length < 2) return;

    // 確認是符文字 table（前三列中有 header 含「名稱」或「效果」）
    // 有些檔案在 header 前多一列 colSpan 標題列
    const earlyText = $rows.toArray().slice(0, 3).map((r) => $(r).text()).join('');
    if (!earlyText.includes('名稱') && !earlyText.includes('效果')) return;

    // 找到實際 header 列的 index，之後才是資料
    let headerRowIdx = 0;
    $rows.each((i, tr) => {
      if ($(tr).text().includes('名稱') || $(tr).text().includes('效果')) {
        headerRowIdx = i;
        return false;
      }
    });

    $rows.each((i, tr) => {
      if (i <= headerRowIdx) return; // 跳過標題與 header
      const $tds = $(tr).children('td');
      if ($tds.length < 4) return;

      const col0 = $tds.eq(0).text().trim();
      const col1 = $tds.eq(1).text().trim();
      const col2 = $tds.eq(2).text().trim();

      // 名稱欄：金色 = zh，黃色 = en
      const name_zh = $tds.eq(0).find('font[color="#808000"], b font').first().text().trim() || col0.split('\n')[0].trim();
      const name_en = $tds.eq(0).find('font[color="#FFFF00"]').first().text().trim();

      if (!name_zh) return;

      const runes = extractRunes(col1);
      const socket_count = parseSocketCount(col2);

      const rawLines = parseStatLines($tds.eq(3));
      const stat_entries = rawLines.map((line, i) => lineToEntry(line, i));
      const effects = rawLines.map((line) => line.segments.map((s) => s.text).join(' ').trim());

      rws.push({
        name_zh,
        name_en: name_en || '',
        slot,
        socket_count,
        runes: JSON.stringify(runes),
        version,
        effects: JSON.stringify(effects),
        stat_entries,
      });
    });
  });

  return rws;
}
