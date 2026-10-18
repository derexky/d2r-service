/**
 * fetch-build-journal.mjs
 * Usage: node scripts/fetch-build-journal.mjs [--dry-run] [--builds-only]
 *
 * 從 d2r-build-journal.pages.dev 抓取資料並寫入 d2r.sqlite：
 *   - affixes / runes / mercenaries / breakpoints / experience_ratios / monsters / monster_levels：每次整表重建
 *   - skills：補詳細資料欄位並新增術士技能；base_items：補分段打孔上限；
 *     builds：以 source='build-journal' 寫入網站流派（重跑只替換這批）
 *   - items / item_sets / set_members / set_bonuses：只補 DB 缺少的暗金與套裝
 *
 * 網站是純靜態站，資料打包在 Vite chunk 裡。檔名 hash 與壓縮後的變數名都會隨部署變動，
 * 所以從首頁沿 assets/*.js 引用找出前綴相符的 chunk，再以資料內容的開頭特徵定位常值。
 */
import Database from 'better-sqlite3';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const SITE = 'https://d2r-build-journal.pages.dev';
const DB_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../d2r.sqlite');
const DRY_RUN = process.argv.includes('--dry-run');
// 只重建 builds：其他表已有後續腳本（如 import_affixes.py）的修正，不宜整表蓋回
const BUILDS_ONLY = process.argv.includes('--builds-only');
const CHUNKS = [
  'd2Catalog-', 'referenceData-', 'EquipmentArchive-', 'page-', 'BreakpointCenter-',
  'experienceMechanics-', 'MonsterDatabase-', 'SkillCodex-',
];

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
      const body = await get(`${SITE}/assets/${file}`);
      if (prefix) found[prefix] = body;
      // 資料 chunk 也要往下追：工具台各分頁是由 page chunk 延遲載入的
      queue.push(body);
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

// 從 anchor 命中處（須為常值的第一個字元）配對括號取出整段常值，在空 context 求值；
// ctx 用來補上常值內呼叫到的小工具函式
function literalAt(code, anchor, ctx = {}) {
  const m = anchor.exec(code);
  if (!m) throw new Error(`資料格式改變：找不到 ${anchor}`);
  let depth = 0;
  let quote = null;
  for (let i = m.index; i < code.length; i++) {
    const c = code[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '`' || c === '"' || c === "'") quote = c;
    else if ('{[('.includes(c)) depth++;
    else if ('}])'.includes(c) && --depth === 0) {
      return vm.runInNewContext(`(${code.slice(m.index, i + 1)})`, ctx, { timeout: 5000 });
    }
  }
  throw new Error(`${anchor} 括號不平衡`);
}

// 斷點表用 o([IAS門檻...], 起始幀數) 產生 [門檻, 幀數] 配對；工具函式名稱會被壓縮，先找出來
function extractBreakpoints(code) {
  const helper = code.match(/([\w$]+)=\(e,t\)=>e\.map\(\(e,n\)=>\[e,t-n\]\)/);
  if (!helper) throw new Error('BreakpointCenter 格式改變：找不到斷點產生函式');
  return literalAt(code, /\{fcr:\{/, { [helper[1]]: (e, t) => e.map((v, n) => [v, t - n]) });
}

// 首頁卡片：有攻略的是 <a href="/builds/...">，其餘是 <button>
async function fetchGuides(html) {
  const guides = new Map();
  for (const [, url, name] of html.matchAll(/<a class="card[^"]*" href="(\/builds\/[^"]+)".*?<strong>([^<]+)<\/strong>/g)) {
    const page = await get(SITE + url);
    guides.set(name, {
      url: SITE + url,
      title: page.match(/<title>([^<｜]+)/)?.[1] ?? null,
      description: page.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? null,
    });
  }
  return guides;
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

// SQLite 沒有 ADD COLUMN IF NOT EXISTS
function addColumns(db, table, columns) {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, type] of Object.entries(columns)) {
    if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
  }
}

// 術士是新職業，skills 表還沒有它的技能樹代碼
const WARLOCK_TREES = { 惡魔束縛: 'demon', 邪異武器: 'eldritch', 混沌技藝: 'chaos' };

const norm = (s) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const nz = (s) => (s ?? '').replace(/\s/g, '');

async function main() {
  const chunks = await findChunks();
  const { t: catalog, n: runewords, r: runes } = evalDataModule(chunks['d2Catalog-']);
  const { t: affixes, n: mercs, r: socketBases } = evalDataModule(chunks['referenceData-']);
  // 套裝門檻表：{套裝名:{partial:[{pieces,stats}],full:[...]}}
  const setBonuses = literalAt(chunks['EquipmentArchive-'], /(?<==)\{[^{}=,:]+:\{partial:\[/);
  const breakpoints = extractBreakpoints(chunks['BreakpointCenter-']);
  const expRatios = literalAt(chunks['experienceMechanics-'], /\[\{level:0,ratio:/);
  const buildClasses = literalAt(chunks['page-'], /\[\{name:`[^`]+`,en:`[^`]+`,mark:/);
  const monsters = literalAt(chunks['MonsterDatabase-'], /\[\{key:`(monster|super):/);
  const monsterImages = literalAt(chunks['MonsterDatabase-'], /\{"(monster|super):/);
  const monsterLevels = literalAt(chunks['MonsterDatabase-'], /\[\{level:\d+,normal:\{/);
  const skills = literalAt(chunks['SkillCodex-'], /\[\{id:\d+,classKey:`/);
  const guides = await fetchGuides(await get(`${SITE}/`));
  const breakpointRows = Object.entries(breakpoints).flatMap(([type, groups]) =>
    Object.entries(groups).map(([key, g]) => ({ type, key, ...g })));
  const builds = buildClasses.flatMap((c) => c.builds.map((b) => ({ ...b, c, guide: guides.get(b.name) })));
  console.log(`抓到：裝備 ${catalog.length}、符文之語 ${runewords.length}、符文 ${runes.length}、詞綴 ${affixes.length}、` +
    `傭兵 ${mercs.length}、打孔底材 ${socketBases.length}、套裝加成 ${Object.keys(setBonuses).length}、` +
    `斷點 ${breakpointRows.length}、經驗衰減 ${expRatios.length}、怪物 ${monsters.length}、怪物等級 ${monsterLevels.length}、` +
    `技能 ${skills.length}、流派 ${builds.length}（攻略 ${guides.size}）`);

  const db = new Database(DB_PATH);
  const migrate = () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS affixes (
        id varchar PRIMARY KEY NOT NULL, kind varchar NOT NULL, name_zh varchar NOT NULL, name_en varchar,
        level integer, required_level integer, affix_group integer, rare boolean NOT NULL DEFAULT 0,
        types text, excluded_types text, mods text);
      CREATE TABLE IF NOT EXISTS runes (
        number integer PRIMARY KEY NOT NULL, code varchar NOT NULL, name_zh varchar NOT NULL, name_en varchar,
        level integer, image_path varchar);
      CREATE TABLE IF NOT EXISTS mercenaries (
        key varchar PRIMARY KEY NOT NULL, label varchar NOT NULL, act integer, min_level integer,
        equipment varchar, skills text, points text);
      CREATE TABLE IF NOT EXISTS breakpoints (
        id varchar PRIMARY KEY NOT NULL, type varchar NOT NULL, key varchar NOT NULL, label varchar NOT NULL,
        note text, pairs text NOT NULL);
      CREATE TABLE IF NOT EXISTS experience_ratios (level integer PRIMARY KEY NOT NULL, ratio integer NOT NULL);
      CREATE TABLE IF NOT EXISTS monster_levels (
        level integer PRIMARY KEY NOT NULL, normal text, nightmare text, hell text);
      CREATE TABLE IF NOT EXISTS monsters (
        key varchar PRIMARY KEY NOT NULL, monster_id varchar NOT NULL, name_zh varchar NOT NULL, name_en varchar,
        family varchar, family_zh varchar, kind varchar, acts text, flags text, levels text, resistances text,
        herald_eligible boolean NOT NULL DEFAULT 0, terror_eligible boolean NOT NULL DEFAULT 0, image_path varchar);
      -- 已併入 skills／base_items／builds 的舊版獨立表
      DROP TABLE IF EXISTS socket_bases;
      DROP TABLE IF EXISTS skill_codex;
      DROP TABLE IF EXISTS build_guides;
    `);
    // 與既有表重疊的資料改為補欄位，不另建表
    addColumns(db, 'skills', {
      req_level: 'integer', kind: 'varchar', damage: 'text', weapon_percent: 'integer', summary: 'text', detail: 'text',
    });
    addColumns(db, 'base_items', { max_sockets_1: 'integer', max_sockets_2: 'integer', max_sockets_3: 'integer' });
    addColumns(db, 'builds', { rating: 'integer', guide_url: 'varchar', description: 'text', source: 'varchar' });
  };

  const J = JSON.stringify;
  const img = (p) => (p ? SITE + p : null);

  // ─── 新資料集：整表重建 ───
  const replaceReference = db.transaction(() => {
    db.exec(`DELETE FROM affixes; DELETE FROM runes; DELETE FROM mercenaries; DELETE FROM breakpoints;
      DELETE FROM experience_ratios; DELETE FROM monster_levels; DELETE FROM monsters;`);
    const a = db.prepare('INSERT INTO affixes VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    for (const x of affixes) {
      a.run(x.id, x.kind, x.name, x.en, x.level, x.requiredLevel, x.group, x.rare ? 1 : 0,
        J(x.types), J(x.excludedTypes), J(x.mods));
    }
    const r = db.prepare('INSERT INTO runes VALUES (?,?,?,?,?,?)');
    for (const x of runes) r.run(x.number, x.code, x.name, x.en, x.level, img(x.image));
    const m = db.prepare('INSERT INTO mercenaries VALUES (?,?,?,?,?,?,?)');
    for (const x of mercs) m.run(x.key, x.label, x.act, x.minimum, x.equipment, J(x.skills), J(x.points));
    const bp = db.prepare('INSERT INTO breakpoints VALUES (?,?,?,?,?,?)');
    for (const x of breakpointRows) bp.run(`${x.type}:${x.key}`, x.type, x.key, x.label, x.note ?? null, J(x.pairs));
    const ex = db.prepare('INSERT INTO experience_ratios VALUES (?,?)');
    for (const x of expRatios) ex.run(x.level, x.ratio);
    const ml = db.prepare('INSERT INTO monster_levels VALUES (?,?,?,?)');
    for (const x of monsterLevels) ml.run(x.level, J(x.normal), J(x.nightmare), J(x.hell));
    const mo = db.prepare('INSERT INTO monsters VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
    for (const x of monsters) {
      mo.run(x.key, x.id, x.nameZh, x.nameEn, x.family, x.familyZh, x.kind, J(x.acts), J(x.flags), J(x.levels),
        J(x.resistances), x.heraldEligible ? 1 : 0, x.terrorEligible ? 1 : 0, img(monsterImages[x.key]?.src));
    }
  });

  // ─── 補進既有表：skills / base_items / builds ───
  const mergeExisting = db.transaction(() => {
    // 既有技能以 (職業, 英文名) 對應並補上詳細資料；DB 沒有的（術士）新增。
    // 常用欄位獨立成欄，其餘（數值公式、效果判定、投射物…）收進 detail
    const findSkill = db.prepare('SELECT id FROM skills WHERE class = ? AND lower(trim(name_en)) = lower(?)');
    const updSkill = db.prepare(`UPDATE skills SET req_level=?, kind=?, damage=?, weapon_percent=?, summary=?, detail=?
      WHERE id=?`);
    const insSkill = db.prepare(`INSERT INTO skills (name_en, name_zh, class, skill_tree, req_level, kind, damage,
      weapon_percent, summary, detail) VALUES (?,?,?,?,?,?,?,?,?,?)`);
    let added = 0;
    // id／classKey／className 由 skills 既有欄位表達，不收進 detail
    // eslint-disable-next-line no-unused-vars
    for (const { id, classKey, className, classEn, tree, level, en, zh, kind, damage, weaponPercent, summary, ...rest } of skills) {
      const cls = classEn.toLowerCase();
      const values = [level, kind, J(damage), weaponPercent ?? null, summary, J(rest)];
      const hit = findSkill.get(cls, en);
      if (hit) updSkill.run(...values, hit.id);
      else {
        insSkill.run(en, zh, cls, WARLOCK_TREES[tree] ?? tree, ...values);
        added++;
      }
    }

    // 打孔上限依物品等級分 3 段（1–25／26–40／41+）；英文拼法不一時改用中文名
    const updBase = db.prepare(`UPDATE base_items SET max_sockets_1=?, max_sockets_2=?, max_sockets_3=?
      WHERE lower(name_en) = lower(?) OR (name_zh = ? AND NOT EXISTS
        (SELECT 1 FROM base_items WHERE lower(name_en) = lower(?)))`);
    const unmatched = socketBases.filter((x) => updBase.run(x.max1, x.max2, x.max3, x.en, x.name, x.en).changes === 0);

    console.log(`技能新增 ${added} 招；打孔對不到的底材 ${unmatched.length} 筆：${unmatched.map((x) => x.name).join('、')}`);
  });

  const replaceBuilds = db.transaction(() => {
    // 網站流派以 source 區分，重跑時只替換這批，不動既有 builds
    db.prepare("DELETE FROM builds WHERE source = 'build-journal'").run();
    const insBuild = db.prepare(`INSERT INTO builds (class, name, test_info, rating, guide_url, description, source)
      VALUES (?,?,?,?,?,?,'build-journal')`);
    for (const b of builds) {
      insBuild.run(b.c.en.toLowerCase(), b.name, b.guide?.title ?? null, b.rating, b.guide?.url ?? null,
        b.guide?.description ?? null);
    }
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

  migrate();
  replaceBuilds();
  if (!BUILDS_ONLY) {
    replaceReference();
    mergeExisting();
    fillMissing();
  }
  console.log('寫入完成');
}

main().catch((e) => { console.error(e.message); process.exit(1); });
