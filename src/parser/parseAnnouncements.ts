import * as fs from 'fs';
import { load } from 'cheerio';

export interface ParsedAnnouncement {
  date: string;
  content: string;
}

export function parseAnnouncementFile(filepath: string): ParsedAnnouncement[] {
  const html = fs.readFileSync(filepath, 'utf-8');
  const $ = load(html) as any;
  const results: ParsedAnnouncement[] = [];

  // 公告表格：每列 2 欄（日期 / 內容）
  $('table').each((_, table) => {
    $(table).find('tr').each((i, tr) => {
      const $tds = $(tr).children('td');
      if ($tds.length < 2) return;

      const dateText = $tds.eq(0).text().trim();
      const contentText = $tds.eq(1).text().trim();

      // 日期格式：YYYY/MM/DD
      if (!dateText.match(/^\d{4}\/\d{2}\/\d{2}$/)) return;
      if (!contentText) return;

      results.push({ date: dateText, content: contentText });
    });
  });

  return results;
}
