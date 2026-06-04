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
import { ItemStat } from '../src/items/entities/item-stat.entity';
import { StatDef } from '../src/items/entities/stat-def.entity';
import { ItemSet } from '../src/sets/entities/set.entity';
import { SetMember } from '../src/sets/entities/set-member.entity';
import { SetBonus } from '../src/sets/entities/set-bonus.entity';
import { Runeword } from '../src/runewords/entities/runeword.entity';
import { RunewordStat } from '../src/runewords/entities/runeword-stat.entity';
import { Build } from '../src/builds/entities/build.entity';
import { IasBreakpoint } from '../src/ias/entities/ias-breakpoint.entity';
import { Announcement } from '../src/announcements/entities/announcement.entity';
import { BaseItem } from '../src/base-items/entities/base-item.entity';
import { Skill } from '../src/skills/entities/skill.entity';

import { parseItemFile, buildStatLabel, ParsedStatEntry } from '../src/parser/parseItems';
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
    entities: [Item, ItemStat, StatDef, ItemSet, SetMember, SetBonus, Runeword, RunewordStat, Build, IasBreakpoint, Announcement, BaseItem, Skill],
    synchronize: true,
  });
  await ds.initialize();
  console.log('✅ SQLite 連線成功');

  // ─── 清空舊資料 ───
  await ds.getRepository(SetBonus).clear();
  await ds.getRepository(SetMember).clear();
  await ds.getRepository(ItemSet).clear();
  // await ds.getRepository(ItemStat).clear();
  // await ds.getRepository(RunewordStat).clear();
  await ds.getRepository(StatDef).clear();
  await ds.getRepository(Item).clear();
  await ds.getRepository(Runeword).clear();
  await ds.getRepository(Build).clear();
  await ds.getRepository(IasBreakpoint).clear();
  await ds.getRepository(Announcement).clear();
  await ds.getRepository(BaseItem).clear();
  await ds.getRepository(Skill).clear();
  console.log('🗑  舊資料已清除\n');

  // ─── 1. 獨特物品 ───
  console.log('📦 解析獨特物品...');
  const allItems: Partial<Item>[] = [];
  for (const conf of UNIQUE_ITEM_FILES) {
    const fp = path.join(HTM_DIR, conf.file);
    if (!fs.existsSync(fp)) continue;
    const parsed = parseItemFile(fp, conf.file);
    for (const p of parsed) {
      allItems.push({ ...nullToUndef(p), category: conf.category, tier: conf.tier });
    }
  }
  // D2R patch additions (items not in iya-backup)
  const patchPath = path.join(DATA_DIR, 'd2r-patch-items.json');
  if (fs.existsSync(patchPath)) {
    const patchItems: Partial<Item>[] = JSON.parse(fs.readFileSync(patchPath, 'utf-8'));
    allItems.push(...patchItems);
  }

  await ds.getRepository(Item).save(allItems);

  // ─── 建立 stat_defs（去重共用屬性） ───
  type SavedItem = Partial<Item> & { id?: number; stat_entries?: import('../src/parser/parseItems').ParsedStatEntry[] };
  const savedItems = allItems as SavedItem[];

  const defKeyMap = new Map<string, Partial<StatDef>>();
  for (const item of savedItems) {
    for (const e of item.stat_entries ?? []) {
      const key = `${e.label_zh}|${e.value_type}`;
      if (!defKeyMap.has(key)) {
        defKeyMap.set(key, nullToUndef({
          abbrev: e.abbrev,
          label_zh: e.label_zh,
          label_en: e.label_en,
          value_type: e.value_type,
        }));
      }
    }
  }

  const defKeys = [...defKeyMap.keys()];
  const savedDefs = await ds.getRepository(StatDef).save([...defKeyMap.values()]);
  const defById = new Map<string, StatDef>();
  for (let i = 0; i < defKeys.length; i++) defById.set(defKeys[i], savedDefs[i]);

  // ─── 寫入 item_stats ───
  const allStatRows: Partial<ItemStat>[] = [];
  for (const item of savedItems) {
    if (!item.id) continue;
    for (const e of item.stat_entries ?? []) {
      const key = `${e.label_zh}|${e.value_type}`;
      const def = defById.get(key);
      if (!def) continue;
      allStatRows.push({
        item: { id: item.id } as Item,
        stat_def: def,
        sort_order: e.sort_order,
        value_min: e.value_min ?? undefined,
        value_max: e.value_max ?? undefined,
        is_variable: e.is_variable,
        color: e.color,
      });
    }
  }
  // if (allStatRows.length > 0) await ds.getRepository(ItemStat).save(allStatRows);

  // ─── 生成 stats_v2 並比對 ───
  // 載入 item relation 取 item.id；stat_def 因 eager:true 自動載入
  const allItemStats = await ds.getRepository(ItemStat).find({
    relations: { item: true },
    order: { sort_order: 'ASC' },
  });
  const statsByItemId = new Map<number, typeof allItemStats>();
  for (const s of allItemStats) {
    const itemId = s.item?.id;
    if (!itemId) continue;
    if (!statsByItemId.has(itemId)) statsByItemId.set(itemId, []);
    statsByItemId.get(itemId)!.push(s);
  }

  let mismatches = 0;
  for (const item of savedItems) {
    if (!item.id || !item.stat_entries) continue; // 跳過 patch items（無 stat_entries）
    const statsRows = statsByItemId.get(item.id) ?? [];

    // 組 stats_v2：stat_def 經 eager 已 load；排除空 label（純紅色行）
    const v2 = statsRows
      .map((s) => ({
        label: buildStatLabel(s.value_min, s.value_max, s.stat_def?.label_zh ?? '', s.stat_def?.value_type ?? ''),
        color: s.color,
      }))
      .filter((s) => s.label !== '');
    await ds.getRepository(Item).update(item.id, { stats_v2: JSON.stringify(v2) });

    // 比對：舊 stats（排除紅色純平均傷害行）vs 新 stats_v2
    const oldStats: { label: string; color: string }[] = JSON.parse(item.stats || '[]');
    const oldMeaningful = oldStats.filter((s) => s.color !== '#FF0000');
    if (oldMeaningful.length !== v2.length) {
      if (mismatches === 0) console.log('  ⚠️  Stats 數量不符（舊→新）:');
      console.log(`     [${item.name_zh}] old=${oldMeaningful.length} new=${v2.length}`);
      mismatches++;
    }
  }
  if (mismatches === 0) console.log('  ✅ 所有物品 stats 數量一致');

  fs.writeFileSync(path.join(DATA_DIR, 'items.json'), JSON.stringify(allItems, null, 2));
  console.log(`   → ${allItems.length} 筆物品 / ${savedDefs.length} 種屬性定義 / ${allStatRows.length} 筆附加能力匯入\n`);

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
  type ParsedRW = Partial<Runeword> & { stat_entries?: ParsedStatEntry[] };
  const allRWs: ParsedRW[] = [];
  for (const file of RUNEWORD_FILES) {
    const fp = path.join(HTM_DIR, file);
    if (!fs.existsSync(fp)) continue;
    const parsed = parseRunewordFile(fp, file);
    allRWs.push(...(parsed as ParsedRW[]));
  }

  // 補充 stat_defs（符文字可能有 items 未覆蓋的詞條）
  const rwNewDefKeyMap = new Map<string, Partial<StatDef>>();
  for (const rw of allRWs) {
    for (const e of rw.stat_entries ?? []) {
      const key = `${e.label_zh}|${e.value_type}`;
      if (!defById.has(key) && !rwNewDefKeyMap.has(key)) {
        rwNewDefKeyMap.set(key, nullToUndef({ abbrev: e.abbrev, label_zh: e.label_zh, label_en: e.label_en, value_type: e.value_type }));
      }
    }
  }
  if (rwNewDefKeyMap.size > 0) {
    const rwNewKeys = [...rwNewDefKeyMap.keys()];
    const rwNewSavedDefs = await ds.getRepository(StatDef).save([...rwNewDefKeyMap.values()]);
    for (let i = 0; i < rwNewKeys.length; i++) defById.set(rwNewKeys[i], rwNewSavedDefs[i]);
  }

  await ds.getRepository(Runeword).save(allRWs);

  // ─── 寫入 runeword_stats ───
  const allRwStatRows: Partial<RunewordStat>[] = [];
  for (const rw of allRWs) {
    if (!rw.id) continue;
    for (const e of rw.stat_entries ?? []) {
      const key = `${e.label_zh}|${e.value_type}`;
      const def = defById.get(key);
      if (!def) continue;
      allRwStatRows.push({
        runeword: { id: rw.id } as Runeword,
        stat_def: def,
        sort_order: e.sort_order,
        value_min: e.value_min ?? undefined,
        value_max: e.value_max ?? undefined,
        is_variable: e.is_variable,
        color: e.color,
      });
    }
  }
  // if (allRwStatRows.length > 0) await ds.getRepository(RunewordStat).save(allRwStatRows);

  // ─── 生成 stat_labels 並比對 effects ───
  const allRwStats = await ds.getRepository(RunewordStat).find({
    relations: { runeword: true },
    order: { sort_order: 'ASC' },
  });
  const rwStatsByRwId = new Map<number, typeof allRwStats>();
  for (const s of allRwStats) {
    const rwId = s.runeword?.id;
    if (!rwId) continue;
    if (!rwStatsByRwId.has(rwId)) rwStatsByRwId.set(rwId, []);
    rwStatsByRwId.get(rwId)!.push(s);
  }

  let rwMismatches = 0;
  for (const rw of allRWs) {
    if (!rw.id) continue;
    const rows = rwStatsByRwId.get(rw.id) ?? [];
    const labels = rows.map((s) =>
      buildStatLabel(s.value_min, s.value_max, s.stat_def?.label_zh ?? '', s.stat_def?.value_type ?? ''),
    );
    await ds.getRepository(Runeword).update(rw.id, { stat_labels: JSON.stringify(labels) });

    const effects: string[] = JSON.parse(rw.effects ?? '[]');
    if (effects.length !== labels.length) {
      if (rwMismatches === 0) console.log('  ⚠️  Runeword stat 數量不符（effects→stat_labels）:');
      console.log(`     [${rw.name_zh}] effects=${effects.length} stat_labels=${labels.length}`);
      rwMismatches++;
    }
  }
  if (rwMismatches === 0) console.log('  ✅ 所有符文字 stat 數量一致');

  fs.writeFileSync(path.join(DATA_DIR, 'runewords.json'), JSON.stringify(allRWs, null, 2));
  console.log(`   → ${allRWs.length} 條符文字 / ${allRwStatRows.length} 筆效果詞條匯入\n`);

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

  // ─── 7. 基礎裝備 ───
  console.log('🗡  匯入基礎裝備...');
  const baseItemsPath = path.join(DATA_DIR, 'base-items.json');
  if (fs.existsSync(baseItemsPath)) {
    const baseItems: Partial<BaseItem>[] = JSON.parse(fs.readFileSync(baseItemsPath, 'utf-8'));
    const savedBaseItems = await ds.getRepository(BaseItem).save(baseItems);
    console.log(`   → ${savedBaseItems.length} 筆基礎裝備匯入`);

    // ─── 連結 Item.baseItemId ───
    const baseByEnLower = new Map<string, BaseItem>();
    const baseByZh = new Map<string, BaseItem>();
    for (const b of savedBaseItems) {
      if (b.name_en) baseByEnLower.set(b.name_en.toLowerCase(), b as BaseItem);
      if (b.name_zh) baseByZh.set(b.name_zh, b as BaseItem);
    }

    type SavedItemWithBase = Partial<Item> & { id?: number; base_type_zh?: string; base_type_en?: string };
    const itemsToLink = allItems as SavedItemWithBase[];
    const linkUpdates: Promise<unknown>[] = [];
    let linked = 0;
    for (const item of itemsToLink) {
      if (!item.id) continue;
      const base =
        (item.base_type_en ? baseByEnLower.get(item.base_type_en.toLowerCase()) : undefined) ??
        (item.base_type_zh ? baseByZh.get(item.base_type_zh) : undefined);
      if (base?.id) {
        linkUpdates.push(ds.getRepository(Item).update(item.id, { baseItemId: base.id }));
        linked++;
      }
    }
    await Promise.all(linkUpdates);
    console.log(`   → ${linked}/${itemsToLink.length} 筆物品連結基礎裝備\n`);
  } else {
    console.log('   ⚠️  找不到 data/base-items.json，請先執行 node scripts/fetch-base-items.mjs > data/base-items.json\n');
  }

  // ─── 8. 技能翻譯 ───
  console.log('⚔️  匯入技能翻譯...');
  const skillsPath = path.join(DATA_DIR, 'skills.json');
  if (fs.existsSync(skillsPath)) {
    const skills: Partial<Skill>[] = JSON.parse(fs.readFileSync(skillsPath, 'utf-8'));
    await ds.getRepository(Skill).save(skills);
    console.log(`   → ${skills.length} 筆技能翻譯匯入\n`);
  }

  /* ─── 9. 連結 item_stats → skills [SKIP: item_stats 不修改] ───
  console.log('🔗 連結 item_stats → skills...');
  {
    const allSkills = await ds.getRepository(Skill).find();
    const skillByName = new Map<string, Skill>();
    for (const skill of allSkills) {
      if (skill.name_zh_old) skillByName.set(skill.name_zh_old, skill);
      skillByName.set(skill.name_zh, skill);
    }
    // 源 HTML 異體譯名（不在 name_zh_old，需手動對映）
    const SKILL_NAME_TYPOS: Record<string, string> = {
      '火燄復甦': '焰痕衛哨',  // Wake of Fire；HTML 寫 火燄 而非 火焰
    };
    for (const [typo, canonical] of Object.entries(SKILL_NAME_TYPOS)) {
      const skill = skillByName.get(canonical);
      if (skill) skillByName.set(typo, skill);
    }

    // label_zh 已在 parseItems normalizeLabel 中剝掉 (限xxx)，直接比名稱即可
    const allStatDefs = await ds.getRepository(StatDef).find();
    const defToSkill = new Map<number, Skill>();
    for (const def of allStatDefs) {
      if (!def.label_zh) continue;
      const skill = skillByName.get(def.label_zh.trim());
      if (skill) defToSkill.set(def.id, skill);
    }

    const allItemStats = await ds.getRepository(ItemStat).find({ relations: { stat_def: true }, select: { id: true, stat_def: { id: true } } });
    const updates: Promise<unknown>[] = [];
    for (const stat of allItemStats) {
      const skill = stat.stat_def?.id != null ? defToSkill.get(stat.stat_def.id) : undefined;
      if (skill) updates.push(ds.getRepository(ItemStat).update(stat.id, { skill: { id: skill.id } as Skill }));
    }
    await Promise.all(updates);
    console.log(`   → ${updates.length} 筆 item_stats 連結技能完成\n`);
  } */

  /* ─── 10. 解析 proc 技能發動欄位 [SKIP: item_stats 不修改] ───
  console.log('🎯 解析 proc 技能發動欄位...');
  {
    const TRIGGER_MAP: Record<string, string> = {
      '打擊時': 'on_striking',
      '攻擊時': 'on_striking',
      '擊中時': 'on_striking',
      '擊中敵人時': 'on_striking',
      '命中時': 'on_striking',
      '受攻擊時': 'on_being_hit',
      '被擊中時': 'on_being_hit',
      '被擊中': 'on_being_hit',
      '當你殺死一敵人': 'on_kill',
      '當你死去': 'on_death',
    };

    // 格式1（含百分比）：打擊時2%機率發動/機會施展/機率施展 等級5 傷害加深
    const PROC_REGEX = /^(打擊時|受攻擊時|被擊中時?|攻擊時|擊中(?:敵人)?時|命中時|當你殺死一敵人|當你死去)[,，以有\s]*(\d+)\s*%\s*(?:機率發動|機會施展|機率施展)\s*等級\s*(\d+)\s*(?:-\s*(\d+))?\s*(?:之)?(.+)$/;
    // 格式2（無百分比）：被擊中時施展等級 1 傳送 / 被擊中 機會施展等級5衰弱
    const PROC_REGEX_NO_PCT = /^(打擊時|受攻擊時|被擊中時?|攻擊時|擊中(?:敵人)?時|命中時|當你殺死一敵人|當你死去)[,，以有\s]*(?:機率發動|機會施展|機率施展|施展)\s*等級\s*(\d+)\s*(?:-\s*(\d+))?\s*(.+)$/;

    const allSkills = await ds.getRepository(Skill).find();
    const skillByName = new Map<string, Skill>();
    for (const skill of allSkills) {
      if (skill.name_zh_old) skillByName.set(skill.name_zh_old, skill);
      skillByName.set(skill.name_zh, skill);
    }
    // 源資料已知異體譯名（不在 skills 表中，需手動對映）
    const ALT_SKILL_NAMES: Record<string, string> = {
      '衰弱': '削弱',       // Weaken（另一種譯法）
      '微靈暗視': '微暗靈視', // Dim Vision（字序有誤）
    };
    for (const [alt, canonical] of Object.entries(ALT_SKILL_NAMES)) {
      const skill = skillByName.get(canonical);
      if (skill) skillByName.set(alt, skill);
    }

    type ProcData = { proc_trigger: string; proc_chance: number | null; proc_level_min: number; proc_level_max: number; skill?: Skill };
    const defToProcMap = new Map<number, ProcData>();
    const allStatDefs = await ds.getRepository(StatDef).find();
    for (const def of allStatDefs) {
      const label = def.label_zh;
      if (!label) continue;
      let triggerRaw: string, chanceStr: string | undefined, levelMinStr: string, levelMaxStr: string | undefined, skillName: string;
      const m1 = label.match(PROC_REGEX);
      if (m1) {
        [, triggerRaw, chanceStr, levelMinStr, levelMaxStr, skillName] = m1;
      } else {
        const m2 = label.match(PROC_REGEX_NO_PCT);
        if (!m2) continue;
        [, triggerRaw, levelMinStr, levelMaxStr, skillName] = m2;
        chanceStr = undefined;
      }
      const trigger = TRIGGER_MAP[triggerRaw] ?? triggerRaw;
      const skill = skillByName.get(skillName.trim());
      defToProcMap.set(def.id, {
        proc_trigger: trigger,
        proc_chance: chanceStr != null ? parseInt(chanceStr, 10) : null,
        proc_level_min: parseInt(levelMinStr, 10),
        proc_level_max: parseInt(levelMaxStr ?? levelMinStr, 10),
        skill,
      });
    }

    const allItemStats = await ds.getRepository(ItemStat).find({ relations: { stat_def: true } });
    const updates: Promise<unknown>[] = [];
    for (const stat of allItemStats) {
      const proc = stat.stat_def?.id != null ? defToProcMap.get(stat.stat_def.id) : undefined;
      if (!proc) continue;
      updates.push(ds.getRepository(ItemStat).update(stat.id, {
        proc_trigger: proc.proc_trigger,
        proc_chance: proc.proc_chance,
        proc_level_min: proc.proc_level_min,
        proc_level_max: proc.proc_level_max,
        ...(proc.skill ? { skill: { id: proc.skill.id } as Skill } : {}),
      }));
    }
    await Promise.all(updates);
    console.log(`   → ${updates.length} 筆 proc 技能發動已解析\n`);
  } */

  /* ─── 10.5. 合併 proc stat_defs 為 trigger-level canonical label [SKIP: item_stats 不修改] ───
  // proc 數值已在 item_stats.proc_* 欄位，stat_def label 只需保留 trigger 類別
  console.log('🔀 合併 proc stat_defs...');
  {
    const TRIGGER_CANONICAL: Record<string, string> = {
      on_striking:  '打擊時機率發動技能',
      on_being_hit: '受攻擊時機率發動技能',
      on_kill:      '擊殺時機率發動技能',
      on_death:     '死亡時機率發動技能',
    };

    for (const [trigger, canonicalLabel] of Object.entries(TRIGGER_CANONICAL)) {
      const procStats = await ds.getRepository(ItemStat).find({
        where: { proc_trigger: trigger } as any,
        relations: { stat_def: true },
      });
      if (procStats.length === 0) continue;

      // 取得或建立 canonical stat_def
      let canonicalDef = await ds.getRepository(StatDef).findOne({
        where: { label_zh: canonicalLabel, value_type: 'boolean' } as any,
      });
      if (!canonicalDef) {
        [canonicalDef] = await ds.getRepository(StatDef).save([{ label_zh: canonicalLabel, value_type: 'boolean' }]);
      }

      // 收集待刪除的舊 stat_def ids
      const oldDefIds = new Set(
        procStats.map(s => s.stat_def?.id).filter((id): id is number => !!id && id !== canonicalDef!.id)
      );

      // 將所有 proc item_stats 指向 canonical stat_def
      await Promise.all(procStats.map(s =>
        ds.getRepository(ItemStat).update(s.id, { stat_def: { id: canonicalDef!.id } as StatDef })
      ));

      // 刪除已無 item_stats 的舊 stat_defs
      for (const defId of oldDefIds) {
        const remaining = await ds.getRepository(ItemStat).count({ where: { stat_def: { id: defId } } as any });
        if (remaining === 0) await ds.getRepository(StatDef).delete(defId);
      }
      console.log(`   ${trigger}: ${procStats.length} 筆 → "${canonicalLabel}"`);
    }
    console.log();
  } */

  /* ─── 11. 連結技能樹 stat_defs → skills (skill_type='tree') [SKIP: item_stats 不修改] ───
  console.log('🌳 連結技能樹 item_stats → skills...');
  {
    const treeSkills = await ds.getRepository(Skill).find({ where: { skill_type: 'tree' } as any });
    const treeByName = new Map<string, Skill>();
    for (const s of treeSkills) treeByName.set(s.name_zh, s);

    const allStatDefs = await ds.getRepository(StatDef).find();
    const treeDefToSkill = new Map<number, Skill>();
    for (const def of allStatDefs) {
      const skill = treeByName.get(def.label_zh);
      if (skill) treeDefToSkill.set(def.id, skill);
    }

    const updates: Promise<unknown>[] = [];
    for (const [defId, skill] of treeDefToSkill) {
      const stats = await ds.getRepository(ItemStat).find({
        where: { stat_def: { id: defId } } as any,
        relations: { stat_def: true },
      });
      for (const stat of stats) {
        if (stat.skill) continue; // 已由 step 9/10 設定，跳過
        updates.push(ds.getRepository(ItemStat).update(stat.id, { skill: { id: skill.id } as Skill }));
      }
    }
    await Promise.all(updates);
    console.log(`   → ${updates.length} 筆技能樹 item_stats 連結完成\n`);
  } */

  /* ─── 12. 合併個人技能 stat_def → canonical [SKIP: item_stats 不修改] ───
  // 每個「+X 技能名」不應各開一個 stat_def；統一改用 canonical stat_def，
  // 技能名稱由 item_stats.skill_id → skills.name_zh 取得。
  console.log('🏷  合併個人技能 stat_def → canonical...');
  {
    // canonical: value_type → { label_zh, id }
    const CANONICAL: Record<string, string> = {
      flat:         '個人技能等級',
      skill_charge: '技能充能',
      skill_grant:  '技能賦予',
    };
    const canonicalMap = new Map<string, StatDef>(); // value_type → StatDef
    for (const [vtype, label] of Object.entries(CANONICAL)) {
      let def = await ds.getRepository(StatDef).findOne({ where: { label_zh: label, value_type: vtype } as any });
      if (!def) [def] = await ds.getRepository(StatDef).save([{ label_zh: label, value_type: vtype }]);
      canonicalMap.set(vtype, def!);
    }

    const skillStats = await ds.getRepository(ItemStat).find({
      relations: { stat_def: true, skill: true },
    });

    const updates: Promise<unknown>[] = [];
    const oldDefIds = new Set<number>();
    for (const stat of skillStats) {
      const def = stat.stat_def;
      const skill = stat.skill;
      if (!def || !skill) continue;
      if (skill.skill_type === 'tree') continue;  // 技能樹由 step 11 處理
      if (stat.proc_trigger) continue;            // proc 由 step 10.5 處理
      const canonical = canonicalMap.get(def.value_type);
      if (!canonical || canonical.id === def.id) continue;
      oldDefIds.add(def.id);
      updates.push(ds.getRepository(ItemStat).update(stat.id, { stat_def: { id: canonical.id } as StatDef }));
    }
    await Promise.all(updates);
    console.log(`   → ${updates.length} 筆 item_stats 改用 canonical stat_def`);

    // 刪除已無任何 stats 引用的舊 stat_def
    let deleted = 0;
    for (const defId of oldDefIds) {
      const itemCnt = await ds.getRepository(ItemStat).count({ where: { stat_def: { id: defId } } as any });
      const rwCnt = await ds.getRepository(RunewordStat).count({ where: { stat_def: { id: defId } } as any });
      if (itemCnt === 0 && rwCnt === 0) { await ds.getRepository(StatDef).delete(defId); deleted++; }
    }
    console.log(`   → ${deleted} 個舊 stat_def 刪除\n`);
  } */

  // ─── 13. 重新生成 stats_v2（canonical stat_def 用 skill.name_zh 作為顯示名稱）───
  console.log('🔄 重新生成 stats_v2...');
  {
    // canonical label_zh 集合：遇到這些 stat_def 時改用 skill.name_zh
    const CANONICAL_LABELS = new Set(['個人技能等級', '技能充能', '技能賦予']);

    const allItemStatsForV2 = await ds.getRepository(ItemStat).find({
      relations: { item: true, stat_def: true, skill: true },
      order: { sort_order: 'ASC' },
    });
    const statsByItemId2 = new Map<number, typeof allItemStatsForV2>();
    for (const s of allItemStatsForV2) {
      const itemId = s.item?.id;
      if (!itemId) continue;
      if (!statsByItemId2.has(itemId)) statsByItemId2.set(itemId, []);
      statsByItemId2.get(itemId)!.push(s);
    }
    for (const [itemId, rows] of statsByItemId2) {
      const v2 = rows
        .map((s) => {
          const defLabel = s.stat_def?.label_zh ?? '';
          const labelZh = (s.skill?.name_zh && CANONICAL_LABELS.has(defLabel))
            ? s.skill.name_zh
            : defLabel;
          return {
            label: buildStatLabel(s.value_min, s.value_max, labelZh, s.stat_def?.value_type ?? ''),
            color: s.color,
          };
        })
        .filter((s) => s.label !== '');
      await ds.getRepository(Item).update(itemId, { stats_v2: JSON.stringify(v2) });
    }
    console.log(`   → ${statsByItemId2.size} 筆物品 stats_v2 重新生成\n`);
  }

  await ds.destroy();
  console.log('✅ 全部匯入完成！');
}

main().catch((e) => {
  console.error('❌ 匯入失敗:', e);
  process.exit(1);
});
