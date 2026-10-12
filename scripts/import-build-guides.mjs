/**
 * import-build-guides.mjs
 * Usage: node scripts/import-build-guides.mjs [--dry-run]
 *
 * 把 crawl-build-guides.mjs 抓到 data/build-guides/*.json 的攻略內容寫進 builds：
 *   - gear / skills / stats 沿用既有格式（gear 另附 loadout、base、stats 等完整欄位）
 *   - merc：傭兵裝備與靈氣；guide：文章各段落、技能說明與進階面板
 * 以 guide_url 對應 source='build-journal' 的流派。fetch-build-journal.mjs 會重建這批 builds，
 * 重跑它之後要再跑一次本腳本。
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SITE = 'https://d2r-build-journal.pages.dev';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'data/build-guides');
const DRY_RUN = process.argv.includes('--dry-run');
const J = JSON.stringify;
const img = (p) => (p ? SITE + p : null);

function toItem(g) {
  return {
    slot: g.slot,
    item_name_zh: g.name,
    socket: g.meta.find((m) => m.startsWith('鑲孔')) ?? '－',
    props: g.stats.map((s) => s.text).join(' ') || '－',
    loadout: g.loadout,
    weapon_set: g.weaponSet,
    base: g.base,
    quality: g.quality,
    image: img(g.image),
    meta: g.meta,
    stats: g.stats,
  };
}

function toRow(d) {
  const t = d.telemetry;
  return {
    url: d.url.replace(/\/?$/, '/'),
    gear: d.gear.map(toItem),
    skills: d.skills.map((tree) => `${tree.tree}：${tree.skills.map((s) => s.label).join('／')}`),
    stats: { ...t.attributes, ...t.rates, ...Object.fromEntries(Object.entries(t.resistances).map(([k, v]) => [`${k}抗`, v])) },
    merc: { gear: d.merc.gear.map(toItem), support: d.merc.support },
    guide: {
      hero: d.hero, bar: d.bar, logic: d.logic, field: d.field,
      sections: d.sections.map(({ key, text }) => ({ key, text })),
      skills: d.skills, character: d.character, crawled_at: d.crawledAt,
    },
  };
}

const rows = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'))
  .map((f) => toRow(JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'))));

const db = new Database(path.join(ROOT, 'd2r.sqlite'));
const find = db.prepare("SELECT id FROM builds WHERE source = 'build-journal' AND guide_url = ?");
const unmatched = rows.filter((r) => !find.get(r.url));
console.log(`攻略 ${rows.length} 篇，對不到 build 的 ${unmatched.length} 篇${unmatched.map((r) => `\n  ${r.url}`).join('')}`);
if (DRY_RUN) {
  console.log('--dry-run：未寫入 DB');
  process.exit(0);
}

const have = new Set(db.prepare('PRAGMA table_info(builds)').all().map((c) => c.name));
for (const c of ['merc', 'guide']) if (!have.has(c)) db.exec(`ALTER TABLE builds ADD COLUMN ${c} text`);

const upd = db.prepare(`UPDATE builds SET gear=?, skills=?, stats=?, merc=?, guide=?
  WHERE source = 'build-journal' AND guide_url = ?`);
const n = db.transaction(() => rows.reduce((sum, r) =>
  sum + upd.run(J(r.gear), J(r.skills), J(r.stats), J(r.merc), J(r.guide), r.url).changes, 0))();
console.log(`更新 ${n} 筆 builds`);
