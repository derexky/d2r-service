/**
 * 資料匯入腳本
 * 解析 iya-backup/htm/*.htm → 寫入 d2r.sqlite
 *
 * 執行方式：
 *   npx ts-node -r tsconfig-paths/register scripts/import.ts
 */
import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { DataSource } from 'typeorm';

import { Item } from '../src/items/entities/item.entity';
import { ItemSet } from '../src/sets/entities/set.entity';
import { SetMember } from '../src/sets/entities/set-member.entity';
import { SetBonus } from '../src/sets/entities/set-bonus.entity';
import { Runeword } from '../src/runewords/entities/runeword.entity';
import { Build } from '../src/builds/entities/build.entity';
import { IasBreakpoint } from '../src/ias/entities/ias-breakpoint.entity';
import { Announcement } from '../src/announcements/entities/announcement.entity';

import { parseItemFile } from '../src/parser/parseItems';
import { parseRunewordFile } from '../src/parser/parseRunewords';
import { parseBuildFile } from '../src/parser/parseBuilds';
import { parseSetFile } from '../src/parser/parseSets';
import { parseIASFile } from '../src/parser/parseIAS';
import { parseAnnouncementFile } from '../src/parser/parseAnnouncements';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 設定路徑
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const HTM_DIR = path.resolve('/Users/derekyang/iya-backup/htm');
const DB_PATH = path.resolve(__dirname, '../d2r.sqlite');
const DATA_DIR = path.resolve(__dirname, '../data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 分類對應設定
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 獨特物品 HTM 前綴 → { category, tier }
const UNIQUE_ITEM_FILES: { file: string; category: string; tier: string; class_restrict?: string }[] = [
  // 武器
  { file: 'Axes1.htm', category: 'axes', tier: 'normal' },
  { file: 'Axes2.htm', category: 'axes', tier: 'exceptional' },
  { file: 'Axes3.htm', category: 'axes', tier: 'elite' },
  { file: 'Bows1.htm', category: 'bows', tier: 'normal' },
  { file: 'Bows2.htm', category: 'bows', tier: 'exceptional' },
  { file: 'Bows3.htm', category: 'bows', tier: 'elite' },
  { file: 'Crossbows1.htm', category: 'crossbows', tier: 'normal' },
  { file: 'Crossbows2.htm', category: 'crossbows', tier: 'exceptional' },
  { file: 'Crossbows3.htm', category: 'crossbows', tier: 'elite' },
  { file: 'Daggers1.htm', category: 'daggers', tier: 'normal' },
  { file: 'Daggers2.htm', category: 'daggers', tier: 'exceptional' },
  { file: 'Daggers3.htm', category: 'daggers', tier: 'elite' },
  { file: 'Maces1.htm', category: 'maces', tier: 'normal' },
  { file: 'Maces2.htm', category: 'maces', tier: 'exceptional' },
  { file: 'Maces3.htm', category: 'maces', tier: 'elite' },
  { file: 'Polearms1.htm', category: 'polearms', tier: 'normal' },
  { file: 'Polearms2.htm', category: 'polearms', tier: 'exceptional' },
  { file: 'Polearms3.htm', category: 'polearms', tier: 'elite' },
  { file: 'Scepters1.htm', category: 'scepters', tier: 'normal' },
  { file: 'Scepters2.htm', category: 'scepters', tier: 'exceptional' },
  { file: 'Scepters3.htm', category: 'scepters', tier: 'elite' },
  { file: 'Swords1.htm', category: 'swords', tier: 'normal' },
  { file: 'Swords2.htm', category: 'swords', tier: 'exceptional' },
  { file: 'Swords3.htm', category: 'swords', tier: 'elite' },
  { file: 'Staves1.htm', category: 'staves', tier: 'normal' },
  { file: 'Staves2.htm', category: 'staves', tier: 'exceptional' },
  { file: 'Staves3.htm', category: 'staves', tier: 'elite' },
  { file: 'Wands1.htm', category: 'wands', tier: 'normal' },
  { file: 'Wands2.htm', category: 'wands', tier: 'exceptional' },
  { file: 'Wands3.htm', category: 'wands', tier: 'elite' },
  { file: 'Spears1.htm', category: 'spears', tier: 'normal' },
  { file: 'Spears2.htm', category: 'spears', tier: 'exceptional' },
  { file: 'Spears3.htm', category: 'spears', tier: 'elite' },
  { file: 'Throwing.htm', category: 'throwing', tier: 'normal' },
  { file: 'Throwing2.htm', category: 'throwing', tier: 'exceptional' },
  { file: 'Throwing3.htm', category: 'throwing', tier: 'elite' },
  { file: 'Javelins3.htm', category: 'javelins', tier: 'elite' },
  { file: 'AmazonWapons.htm', category: 'amazon_weapons', tier: 'normal' },
  { file: 'AmazonWapons2.htm', category: 'amazon_weapons', tier: 'exceptional' },
  { file: 'AmazonWapons3.htm', category: 'amazon_weapons', tier: 'elite' },
  { file: 'AssassinKatars.htm', category: 'katars', tier: 'mixed' },
  // 防具
  { file: 'Armors1.htm', category: 'armors', tier: 'normal' },
  { file: 'Armors2.htm', category: 'armors', tier: 'exceptional' },
  { file: 'Armors3.htm', category: 'armors', tier: 'elite' },
  { file: 'Helms1.htm', category: 'helms', tier: 'normal' },
  { file: 'Helms2.htm', category: 'helms', tier: 'exceptional' },
  { file: 'Helms3.htm', category: 'helms', tier: 'elite' },
  { file: 'Shields1.htm', category: 'shields', tier: 'normal' },
  { file: 'Shields2.htm', category: 'shields', tier: 'exceptional' },
  { file: 'Shields3.htm', category: 'shields', tier: 'elite' },
  { file: 'Belts1.htm', category: 'belts', tier: 'normal' },
  { file: 'Belts2.htm', category: 'belts', tier: 'exceptional' },
  { file: 'Belts3.htm', category: 'belts', tier: 'elite' },
  { file: 'Boots1.htm', category: 'boots', tier: 'normal' },
  { file: 'Boots2.htm', category: 'boots', tier: 'exceptional' },
  { file: 'Boots3.htm', category: 'boots', tier: 'elite' },
  { file: 'Gloves1.htm', category: 'gloves', tier: 'normal' },
  { file: 'Gloves2.htm', category: 'gloves', tier: 'exceptional' },
  { file: 'Gloves3.htm', category: 'gloves', tier: 'elite' },
  { file: 'Amulets.htm', category: 'amulets', tier: 'mixed' },
  { file: 'rings.htm', category: 'rings', tier: 'mixed' },
  { file: 'jewels.htm', category: 'jewels', tier: 'mixed' },
  { file: 'Charms.htm', category: 'charms', tier: 'mixed' },
  { file: 'Circlets1.htm', category: 'circlets', tier: 'mixed' },
  { file: 'MightyBelt1.htm', category: 'belts', tier: 'elite' },
  // 職業專屬
  { file: 'BarbarianHelms.htm', category: 'barb_helms', tier: 'mixed', class_restrict: 'barbarian' },
  { file: 'DruidPeltsHelms.htm', category: 'druid_pelts', tier: 'mixed', class_restrict: 'druid' },
  { file: 'PaladinShields.htm', category: 'pal_shields', tier: 'mixed', class_restrict: 'paladin' },
  { file: 'SorceressOrbs.htm', category: 'sor_orbs', tier: 'mixed', class_restrict: 'sorceress' },
  { file: 'ncerShrunkenHeads.htm', category: 'nec_heads', tier: 'mixed', class_restrict: 'necromancer' },
  // 職業專屬獨特（baritem 等）
  { file: 'baritem.htm', category: 'class_specific', tier: 'mixed', class_restrict: 'barbarian' },
  { file: 'amaitem.htm', category: 'class_specific', tier: 'mixed', class_restrict: 'amazon' },
  { file: 'assitem.htm', category: 'class_specific', tier: 'mixed', class_restrict: 'assassin' },
  { file: 'druitem.htm', category: 'class_specific', tier: 'mixed', class_restrict: 'druid' },
  { file: 'necitem.htm', category: 'class_specific', tier: 'mixed', class_restrict: 'necromancer' },
  { file: 'palitem.htm', category: 'class_specific', tier: 'mixed', class_restrict: 'paladin' },
  { file: 'soritem.htm', category: 'class_specific', tier: 'mixed', class_restrict: 'sorceress' },
];

const RUNEWORD_FILES = [
  'runewa.htm', 'runewb.htm', 'runewc.htm', 'runewd.htm',
  'Trunewa.htm', 'Trunewb.htm', 'Trunewc.htm', 'Trunewd.htm',
  '1.11runew.htm',
];

const BUILD_FILES = [
  ...Array.from({ length: 12 }, (_, i) => `BAR${i + 1}.htm`),
  ...Array.from({ length: 7 }, (_, i) => `AMA${i + 1}.htm`),
  ...Array.from({ length: 7 }, (_, i) => `ASS${i + 1}.htm`),
  ...Array.from({ length: 8 }, (_, i) => `DRU${i + 1}.htm`),
  ...Array.from({ length: 9 }, (_, i) => `NEC${i + 1}.htm`),
  ...Array.from({ length: 12 }, (_, i) => `PAL${i + 1}.htm`),
  ...Array.from({ length: 14 }, (_, i) => `SOR${i + 1}.htm`),
];

const SET_FILES = Array.from({ length: 32 }, (_, i) => `Set${String(i + 1).padStart(2, '0')}.htm`);

const IAS_FILES = ['ACT1IAS.htm', 'ACT2IAS.htm', 'ACT5IAS.htm'];

const ANNOUNCEMENT_FILES = ['right.htm', 'newright.htm'];

// null → undefined（TypeORM Partial 相容）
function nullToUndef<T extends object>(obj: T): { [K in keyof T]: Exclude<T[K], null> | undefined } {
  const result: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) result[k] = v === null ? undefined : v;
  return result as { [K in keyof T]: Exclude<T[K], null> | undefined };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 主程式
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
async function main() {
  console.log('🚀 d2r-service 資料匯入開始\n');

  const ds = new DataSource({
    type: 'better-sqlite3',
    database: DB_PATH,
    entities: [Item, ItemSet, SetMember, SetBonus, Runeword, Build, IasBreakpoint, Announcement],
    synchronize: true,
  });
  await ds.initialize();
  console.log('✅ SQLite 連線成功');

  // ─── 清空舊資料 ───
  await ds.getRepository(SetBonus).clear();
  await ds.getRepository(SetMember).clear();
  await ds.getRepository(ItemSet).clear();
  await ds.getRepository(Item).clear();
  await ds.getRepository(Runeword).clear();
  await ds.getRepository(Build).clear();
  await ds.getRepository(IasBreakpoint).clear();
  await ds.getRepository(Announcement).clear();
  console.log('🗑  舊資料已清除\n');

  // ─── 1. 獨特物品 ───
  console.log('📦 解析獨特物品...');
  const allItems: Partial<Item>[] = [];
  for (const conf of UNIQUE_ITEM_FILES) {
    const fp = path.join(HTM_DIR, conf.file);
    if (!fs.existsSync(fp)) continue;
    const parsed = parseItemFile(fp, conf.file);
    for (const p of parsed) {
      allItems.push({ ...nullToUndef(p), category: conf.category, tier: conf.tier, class_restrict: conf.class_restrict });
    }
  }
  // D2R patch additions (items not in iya-backup)
  const patchPath = path.join(DATA_DIR, 'd2r-patch-items.json');
  if (fs.existsSync(patchPath)) {
    const patchItems: Partial<Item>[] = JSON.parse(fs.readFileSync(patchPath, 'utf-8'));
    allItems.push(...patchItems);
  }

  await ds.getRepository(Item).save(allItems);
  fs.writeFileSync(path.join(DATA_DIR, 'items.json'), JSON.stringify(allItems, null, 2));
  console.log(`   → ${allItems.length} 筆物品匯入\n`);

  // ─── 2. 成套裝備 ───
  console.log('💚 解析成套裝備...');
  let setCount = 0;
  for (const file of SET_FILES) {
    const fp = path.join(HTM_DIR, file);
    if (!fs.existsSync(fp)) continue;
    const parsed = parseSetFile(fp);
    if (!parsed) continue;

    const setEntity = ds.getRepository(ItemSet).create({
      name_zh: parsed.name_zh,
      name_en: parsed.name_en,
      tier: parsed.tier,
    });
    const saved = await ds.getRepository(ItemSet).save(setEntity);

    const memberEntities = parsed.members.map((m) =>
      ds.getRepository(SetMember).create({ ...m, set: saved }),
    );
    await ds.getRepository(SetMember).save(memberEntities);

    const bonusEntities = parsed.bonuses.map((b) =>
      ds.getRepository(SetBonus).create({ ...b, set: saved }),
    );
    await ds.getRepository(SetBonus).save(bonusEntities);
    setCount++;
  }
  console.log(`   → ${setCount} 套套裝匯入\n`);

  // ─── 3. 符文字 ───
  console.log('⚔️  解析符文字...');
  const allRWs: Partial<Runeword>[] = [];
  for (const file of RUNEWORD_FILES) {
    const fp = path.join(HTM_DIR, file);
    if (!fs.existsSync(fp)) continue;
    const parsed = parseRunewordFile(fp, file);
    allRWs.push(...parsed);
  }
  await ds.getRepository(Runeword).save(allRWs);
  fs.writeFileSync(path.join(DATA_DIR, 'runewords.json'), JSON.stringify(allRWs, null, 2));
  console.log(`   → ${allRWs.length} 條符文字匯入\n`);

  // ─── 4. 角色攻略 ───
  console.log('🧙 解析角色攻略...');
  const allBuilds: Partial<Build>[] = [];
  for (const file of BUILD_FILES) {
    const fp = path.join(HTM_DIR, file);
    if (!fs.existsSync(fp)) continue;
    const parsed = parseBuildFile(fp, file);
    allBuilds.push(...parsed);
  }
await ds.getRepository(Build).save(allBuilds);
  fs.writeFileSync(path.join(DATA_DIR, 'builds.json'), JSON.stringify(allBuilds, null, 2));
  console.log(`   → ${allBuilds.length} 筆攻略匯入\n`);

  // ─── 5. IAS 表格 ───
  console.log('⚡ 解析 IAS 攻速表...');
  const allIAS: Partial<IasBreakpoint>[] = [];
  for (const file of IAS_FILES) {
    const fp = path.join(HTM_DIR, file);
    if (!fs.existsSync(fp)) continue;
    const parsed = parseIASFile(fp, file);
    allIAS.push(...parsed);
  }
  await ds.getRepository(IasBreakpoint).save(allIAS);
  fs.writeFileSync(path.join(DATA_DIR, 'ias.json'), JSON.stringify(allIAS, null, 2));
  console.log(`   → ${allIAS.length} 筆 IAS 資料匯入\n`);

  // ─── 6. 公告欄 ───
  console.log('📢 解析公告欄...');
  const allAnn: Partial<Announcement>[] = [];
  for (const file of ANNOUNCEMENT_FILES) {
    const fp = path.join(HTM_DIR, file);
    if (!fs.existsSync(fp)) continue;
    allAnn.push(...parseAnnouncementFile(fp));
  }
  // 去重（同日期+內容）
  const uniqueAnn = allAnn.filter(
    (a, idx, arr) => arr.findIndex((b) => b.date === a.date && b.content === a.content) === idx,
  );
  await ds.getRepository(Announcement).save(uniqueAnn);
  console.log(`   → ${uniqueAnn.length} 筆公告匯入\n`);

  await ds.destroy();
  console.log('✅ 全部匯入完成！');
}

main().catch((e) => {
  console.error('❌ 匯入失敗:', e);
  process.exit(1);
});
