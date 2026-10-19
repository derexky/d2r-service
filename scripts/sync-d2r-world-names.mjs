/**
 * sync-d2r-world-names.mjs
 * Usage: node scripts/sync-d2r-world-names.mjs [--dry-run]
 *
 * Replaces the Chinese names of uniques (items), set items (set_members) and runewords with the
 * current zh-TW names on d2r.world, matched by English name. The DB was scraped from an older
 * translation (格利風之眼 for 獅鷲之眼), which also breaks OCR name matching on the trade page.
 */
import CryptoJS from 'crypto-js';
import LZString from 'lz-string';
import Database from 'better-sqlite3';

// Same build id and AES key as fetch-d2r-world.mjs; update both if d2r.world redeploys
const BUILD_ID = 'R_OhhIhHr6wNVERCnEthm';
const AES_KEY = 'd2rw' + 1231;
const DRY_RUN = process.argv.includes('--dry-run');

async function page(path) {
  const url = `https://d2r.world/_next/data/${BUILD_ID}/zh-TW/info/item/${path}.json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  const raw = CryptoJS.AES.decrypt((await res.json()).pageProps.webdata, CryptoJS.enc.Utf8.parse(AES_KEY), {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8);
  return JSON.parse(LZString.decompressFromUTF16(raw));
}

const norm = (s) => (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

// DB English names that d2r.world spells differently
const ALIASES = {
  "the general's": "the general's tan do li ga",
  'stone of jordan': 'the stone of jordan',
  "ancient's pledge": "ancients' pledge",
};

// English name → set of Chinese names, from every { name, ename } object in the page data
function collect(node, out) {
  if (Array.isArray(node)) node.forEach((n) => collect(n, out));
  else if (node && typeof node === 'object') {
    if (typeof node.name === 'string' && typeof node.ename === 'string') {
      const key = norm(node.ename);
      out.set(key, (out.get(key) ?? new Set()).add(node.name));
    }
    Object.values(node).forEach((n) => collect(n, out));
  }
  return out;
}

async function names(kind) {
  const index = await page(kind);
  const out = collect(index, new Map());
  for (const { gid } of index.subpages ?? []) collect(await page(`${kind}/${gid}`), out);
  return out;
}

const TABLES = [
  { kind: 'unique', table: 'items', zh: 'name_zh', en: 'name_en' },
  { kind: 'sets', table: 'set_members', zh: 'item_name_zh', en: 'item_name_en' },
  { kind: 'runewords', table: 'runewords', zh: 'name_zh', en: 'name_en' },
];

const db = new Database('d2r.sqlite');
for (const { kind, table, zh, en } of TABLES) {
  const web = await names(kind);
  const update = db.prepare(`UPDATE ${table} SET ${zh} = ? WHERE id = ?`);
  const changed = [];
  const unmatched = [];
  const ambiguous = [];
  for (const row of db.prepare(`SELECT id, ${zh} AS zh, ${en} AS en FROM ${table}`).all()) {
    const key = norm(row.en);
    const found = web.get(ALIASES[key] ?? key);
    if (!found) unmatched.push(row.en);
    else if (found.size > 1) ambiguous.push(`${row.en}: ${[...found].join(' / ')}`);
    else {
      const [name] = found;
      // keep our variant suffix where d2r.world shares one name, e.g. 彩虹刻面：火焰／死亡
      if (name !== row.zh && !row.zh.startsWith(`${name}：`)) changed.push({ id: row.id, from: row.zh, to: name });
    }
  }
  if (!DRY_RUN) db.transaction(() => changed.forEach((c) => update.run(c.to, c.id)))();
  console.log(`== ${table}: ${changed.length} renamed${DRY_RUN ? ' (dry run)' : ''}`);
  for (const c of changed) console.log(`  ${c.from} → ${c.to}`);
  if (unmatched.length) console.log(`  not on d2r.world: ${unmatched.map(norm).join(', ')}`);
  if (ambiguous.length) console.log(`  skipped, several names: ${ambiguous.join('; ')}`);
}
