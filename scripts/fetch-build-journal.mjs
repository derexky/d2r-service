/**
 * fetch-build-journal.mjs
 * Usage: node scripts/fetch-build-journal.mjs [--dry-run]
 *
 * 從 d2r-build-journal.pages.dev 抓取資料並寫入 d2r.sqlite：
 *   - affixes / runes / socket_bases / mercenaries：每次整表重建
 *   - items / item_sets / set_members / set_bonuses：只補 DB 缺少的暗金與套裝
 *
 * 資料來源是網站 Vite 打包後的純資料 chunk（var e=[...];export{...}），
 * 檔名 hash 會隨部署變動，所以從首頁沿 assets/*.js 引用找出前綴相符的 chunk。
 */
import Database from 'better-sqlite3';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const SITE = 'https://d2r-build-journal.pages.dev';
const DB_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../d2r.sqlite');
const DRY_RUN = process.argv.includes('--dry-run');
const CHUNKS = ['d2Catalog-', 'referenceData-', 'EquipmentArchive-'];

// 任務道具不是可交易／配裝用的暗金
const QUEST_CODES = new Set(['hfh', 'hst', 'msf', 'vip', 'qf1', 'qf2']);

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.text();
}

async function findChunks() {
  const found = {};
  const seen = new Set();
  const queue = [await get(`${SITE}/`)];
  while (queue.length && CHUNKS.some((p) => !found[p])) {
    const src = queue.shift();
    for (const [, file] of src.matchAll(/assets\/([\w.-]+\.js)/g)) {
      if (seen.has(file)) continue;
      seen.add(file);
      const prefix = CHUNKS.find((p) => file.startsWith(p));
      // 只往下追非資料 chunk 的引用；資料 chunk 抓到即可
      const body = await get(`${SITE}/assets/${file}`);
      if (prefix) found[prefix] = body;
      else queue.push(body);
    }
  }
  const missing = CHUNKS.filter((p) => !found[p]);
  if (missing.length) throw new Error(`找不到 chunk：${missing.join(', ')}`);
  return found;
}

// 在空 context 執行資料 chunk，把 `export{n,t as r}` 改寫成回傳物件
function evalDataModule(code) {
  const m = code.match(/export\s*\{([^}]*)\}\s*;?\s*$/);
  if (!m) throw new Error('資料 chunk 格式改變：找不到 export');
  const pairs = m[1].split(',').map((s) => {
    const [local, exported = local] = s.trim().split(/\s+as\s+/);
    return `${JSON.stringify(exported)}:${local}`;
  });
  return vm.runInNewContext(`${code.slice(0, m.index)};({${pairs.join(',')}})`, {}, { timeout: 5000 });
}

// 從 EquipmentArchive 取出套裝門檻表：{套裝名:{partial:[{pieces,stats}],full:[...]}}
function extractSetBonuses(code) {
  const at = code.indexOf(':{partial:[');
  const start = code.lastIndexOf('={', at) + 1;
  if (at < 0 || start <= 0) throw new Error('EquipmentArchive 格式改變：找不到套裝加成表');
  let depth = 0;
  let quote = null;
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '`' || c === '"' || c === "'") quote = c;
    else if (c === '{' || c === '[') depth++;
    else if (c === '}' || c === ']') {
      if (--depth === 0) return vm.runInNewContext(`(${code.slice(start, i + 1)})`, {}, { timeout: 5000 });
    }
  }
  throw new Error('套裝加成表括號不平衡');
}

const SLOT_CATEGORY = {
  頭盔: 'helms', 護甲: 'armors', 盾牌: 'shields', 手套: 'gloves', 靴子: 'boots',
  腰帶: 'belts', 咒符: 'charms', 珠寶: 'jewels',
};
const SUBTYPE_CATEGORY = {
  項鍊: 'amulets', 戒指: 'rings',
  弓: 'bows', 亞馬遜弓: 'bows', 十字弓: 'crossbows', 斧: 'axes', 劍: 'swords', 匕首: 'daggers',
  魔杖: 'wands', 權杖: 'scepters', 法杖: 'staves', 長柄武器: 'polearms', 長矛: 'spears',
  釘頭錘: 'maces', 錘: 'maces', 棍棒: 'maces', 標槍: 'javelins', 投擲刀: 'throwing', 投擲斧: 'throwing',
  法球: 'class_specific', 拳刃: 'class_specific', 亞馬遜長矛: 'class_specific', 亞馬遜標槍: 'class_specific',
};
const SET_SLOT = {
  頭盔: 'helm', 護甲: 'armor', 盾牌: 'shield', 手套: 'gloves', 靴子: 'boots', 腰帶: 'belt', 武器: 'weapon',
};

// 底材基礎資訊；要求後接空格，避免「傷害／等級 +1」這類魔法屬性被誤判
const WHITE = /^(基礎防禦|需求\S*|武器速度|(單手|雙手|投擲|踢擊)?傷害) /;

// 轉成既有 items.stats / set_members.stats 的 [{label,color}] 格式
function toStatLabels(item) {
  const lines = item.stats.filter((s) => !s.startsWith('底材鑲孔上限'));
  const out = lines.map((label) => ({
    label,
    color: WHITE.test(label) ? '#FFFFFF' : label.startsWith('套裝加成') ? '#00FF00' : '#00FFFF',
  }));
  if (item.level) out.unshift({ label: `等級需求: ${item.level}`, color: '#FFFFFF' });
  return JSON.stringify(out);
}

const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nz = (s) => (s ?? '').replace(/\s/g, '');

async function main() {
  const chunks = await findChunks();
  const { t: catalog, n: runewords, r: runes } = evalDataModule(chunks['d2Catalog-']);
  const { t: affixes, n: mercs, r: socketBases } = evalDataModule(chunks['referenceData-']);
  const setBonuses = extractSetBonuses(chunks['EquipmentArchive-']);
  console.log(`抓到：裝備 ${catalog.length}、符文之語 ${runewords.length}、符文 ${runes.length}、詞綴 ${affixes.length}、` +
    `傭兵 ${mercs.length}、打孔底材 ${socketBases.length}、套裝加成 ${Object.keys(setBonuses).length}`);

  const db = new Database(DB_PATH);
  db.exec(`
    CREATE TABLE IF NOT EXISTS affixes (
      id varchar PRIMARY KEY NOT NULL, kind varchar NOT NULL, name_zh varchar NOT NULL, name_en varchar,
      level integer, required_level integer, affix_group integer, rare boolean NOT NULL DEFAULT 0,
      types text, excluded_types text, mods text);
    CREATE TABLE IF NOT EXISTS runes (
      number integer PRIMARY KEY NOT NULL, code varchar NOT NULL, name_zh varchar NOT NULL, name_en varchar,
      level integer, image_path varchar);
    CREATE TABLE IF NOT EXISTS socket_bases (
      code varchar PRIMARY KEY NOT NULL, name_zh varchar NOT NULL, name_en varchar, type varchar, qlvl integer,
      max_sockets_1 integer, max_sockets_2 integer, max_sockets_3 integer, image_path varchar);
    CREATE TABLE IF NOT EXISTS mercenaries (
      key varchar PRIMARY KEY NOT NULL, label varchar NOT NULL, act integer, min_level integer,
      equipment varchar, skills text, points text);
  `);

  const J = JSON.stringify;
  const img = (p) => (p ? SITE + p : null);

  // ─── 新資料集：整表重建 ───
  const replaceReference = db.transaction(() => {
    db.exec('DELETE FROM affixes; DELETE FROM runes; DELETE FROM socket_bases; DELETE FROM mercenaries;');
    const a = db.prepare('INSERT INTO affixes VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    for (const x of affixes) {
      a.run(x.id, x.kind, x.name, x.en, x.level, x.requiredLevel, x.group, x.rare ? 1 : 0,
        J(x.types), J(x.excludedTypes), J(x.mods));
    }
    const r = db.prepare('INSERT INTO runes VALUES (?,?,?,?,?,?)');
    for (const x of runes) r.run(x.number, x.code, x.name, x.en, x.level, img(x.image));
    const s = db.prepare('INSERT INTO socket_bases VALUES (?,?,?,?,?,?,?,?,?)');
    for (const x of socketBases) s.run(x.code, x.name, x.en, x.type, x.level, x.max1, x.max2, x.max3, img(x.image));
    const m = db.prepare('INSERT INTO mercenaries VALUES (?,?,?,?,?,?,?)');
    for (const x of mercs) m.run(x.key, x.label, x.act, x.minimum, x.equipment, J(x.skills), J(x.points));
  });

  // ─── 補缺漏的暗金／套裝 ───
  const col = (sql) => db.prepare(sql).pluck().all();
  const haveEn = [...col('SELECT name_en FROM items'), ...col('SELECT item_name_en FROM set_members')].map(norm).filter(Boolean);
  const haveEnSet = new Set(haveEn);
  const haveZh = new Set([...col('SELECT name_zh FROM items'), ...col('SELECT item_name_zh FROM set_members')].map(nz));
  // ponytail: 前綴比對處理 DB 舊譯名較短的情況（"The General's" vs "The General's Tan Do Li Ga"）
  const exists = (i) => haveEnSet.has(norm(i.en)) || haveZh.has(nz(i.name)) ||
    haveEn.some((n) => n.length >= 8 && norm(i.en).startsWith(n));
  const missing = catalog.filter((i) => i.kind !== '一般底材' && !QUEST_CODES.has(i.code) && !exists(i));

  const baseByZh = db.prepare('SELECT id, name_en, grade FROM base_items WHERE name_zh = ?');
  const insertItem = db.prepare(`INSERT INTO items (name_zh, name_en, category, tier, image_path, base_type_zh,
    base_type_en, level_req, stats, baseItemId) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const setIdByZh = new Map(db.prepare('SELECT id, name_zh FROM item_sets').all().map((s) => [nz(s.name_zh), s.id]));
  const insertSet = db.prepare("INSERT INTO item_sets (name_zh, name_en, tier) VALUES (?, NULL, 'normal')");
  const insertBonus = db.prepare('INSERT INTO set_bonuses (pieces_required, effects, setId) VALUES (?,?,?)');
  const insertMember = db.prepare('INSERT INTO set_members (item_name_zh, item_name_en, slot, stats, setId) VALUES (?,?,?,?,?)');

  const fillMissing = db.transaction(() => {
    for (const i of missing) {
      if (i.kind === '套裝') {
        let setId = setIdByZh.get(nz(i.setName));
        if (!setId) {
          setId = insertSet.run(i.setName).lastInsertRowid;
          setIdByZh.set(nz(i.setName), setId);
          const b = setBonuses[i.setName];
          for (const p of b?.partial ?? []) insertBonus.run(`${p.pieces}件`, J(p.stats), setId);
          if (b?.full?.length) insertBonus.run('完整套裝', J(b.full), setId);
        }
        const slot = i.slot === '飾品' ? (i.subtype === '戒指' ? 'ring' : 'amulet') : SET_SLOT[i.slot] ?? '';
        insertMember.run(i.name, i.en, slot, toStatLabels(i), setId);
      } else {
        const base = baseByZh.get(i.base);
        const category = SLOT_CATEGORY[i.slot] ?? SUBTYPE_CATEGORY[i.subtype] ?? i.subtype;
        insertItem.run(i.name, i.en, category, base?.grade ?? 'normal', img(i.image), i.base,
          base?.name_en ?? null, i.level || null, toStatLabels(i), base?.id ?? null);
      }
    }
  });

  console.log(`缺少的裝備 ${missing.length} 件：`);
  for (const i of missing) console.log(`  ${i.kind} ${i.name} (${i.en})${i.setName ? ` ← ${i.setName}` : ''}`);
  if (DRY_RUN) return console.log('--dry-run：未寫入 DB');

  replaceReference();
  fillMissing();
  console.log('寫入完成');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
