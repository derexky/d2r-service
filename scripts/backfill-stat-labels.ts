/**
 * 補齊 runewords.stat_labels 欄位
 * 執行方式：
 *   npx ts-node -r tsconfig-paths/register scripts/backfill-stat-labels.ts
 */
import 'reflect-metadata';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { Runeword } from '../src/runewords/entities/runeword.entity';
import { RunewordStat } from '../src/runewords/entities/runeword-stat.entity';
import { StatDef } from '../src/items/entities/stat-def.entity';
import { Item } from '../src/items/entities/item.entity';
import { ItemStat } from '../src/items/entities/item-stat.entity';
import { Skill } from '../src/skills/entities/skill.entity';
import { Build } from '../src/builds/entities/build.entity';
import { IasBreakpoint } from '../src/ias/entities/ias-breakpoint.entity';
import { Announcement } from '../src/announcements/entities/announcement.entity';
import { BaseItem } from '../src/base-items/entities/base-item.entity';
import { ItemSet } from '../src/sets/entities/set.entity';
import { SetMember } from '../src/sets/entities/set-member.entity';
import { SetBonus } from '../src/sets/entities/set-bonus.entity';
import { buildStatLabel } from '../src/parser/parseItems';

const DB_PATH = path.resolve(__dirname, '../d2r.sqlite');

async function main() {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: DB_PATH,
    entities: [Item, ItemStat, StatDef, ItemSet, SetMember, SetBonus, Runeword, RunewordStat, Build, IasBreakpoint, Announcement, BaseItem, Skill],
    synchronize: true, // 自動新增 stat_labels 欄位
  });
  await ds.initialize();
  console.log('✅ 連線成功，schema 已同步');

  const allStats = await ds.getRepository(RunewordStat).find({
    relations: { runeword: true },
    order: { sort_order: 'ASC' },
  });

  const byRwId = new Map<number, RunewordStat[]>();
  for (const s of allStats) {
    const id = s.runeword?.id;
    if (!id) continue;
    if (!byRwId.has(id)) byRwId.set(id, []);
    byRwId.get(id)!.push(s);
  }

  const runewords = await ds.getRepository(Runeword).find({ order: { id: 'ASC' } });
  let mismatches = 0;

  for (const rw of runewords) {
    const rows = byRwId.get(rw.id) ?? [];
    const labels = rows.map((s) =>
      buildStatLabel(s.value_min, s.value_max, s.stat_def?.label_zh ?? '', s.stat_def?.value_type ?? ''),
    );
    await ds.getRepository(Runeword).update(rw.id, { stat_labels: JSON.stringify(labels) });

    const effects: string[] = JSON.parse(rw.effects ?? '[]');
    if (effects.length !== labels.length) {
      if (mismatches === 0) console.log('\n⚠️  數量不符 (effects → stat_labels):');
      console.log(`   [${rw.name_zh}] effects=${effects.length} stat_labels=${labels.length}`);
      mismatches++;
    }
  }

  if (mismatches === 0) console.log('✅ 所有符文字 stat 數量一致');
  console.log(`\n完成：${runewords.length} 條符文字 stat_labels 已寫入`);
  await ds.destroy();
}

main().catch((e) => {
  console.error('❌ 失敗:', e);
  process.exit(1);
});
