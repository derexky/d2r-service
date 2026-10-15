/**
 * fetch-d2r-world-affixes.mjs
 * Usage: node scripts/fetch-d2r-world-affixes.mjs [lang]
 * Crawls d2r.world magic/rare item pages (all subpages) and writes
 * data/affixes/{magic,rare}[.<lang>].json (no suffix for zh-TW): [{ gid, title, category, prefixes, suffixes }]
 * Numbers are hidden as PUA chars; decoded via data/affixes/font-map.json
 * (see scripts/decode_d2rworld_font.py).
 */
import CryptoJS from 'crypto-js';
import LZString from 'lz-string';
import fs from 'fs';

const lang = process.argv[2] || 'zh-TW';
const fontMap = JSON.parse(fs.readFileSync('data/affixes/font-map.json', 'utf8'));
const decode = (t) => t.replace(/[\uf100-\uf8ff]/g, (c) => fontMap[c] ?? c);

async function pagedata(path) {
  const html = await (await fetch(`https://d2r.world/${lang}/info/item/${path}`, { headers: { 'User-Agent': 'Mozilla/5.0' } })).text();
  const nd = JSON.parse(html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s)[1]);
  const raw = CryptoJS.AES.decrypt(nd.props.pageProps.webdata, CryptoJS.enc.Utf8.parse('d2rw1231'), {
    mode: CryptoJS.mode.ECB, padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8);
  return JSON.parse(LZString.decompressFromUTF16(raw));
}

const row = (r) => ({
  name: r.affixname,
  alvl: r.alvl,
  both: r.both, // true = also rolls on rare items
  stats: r.cli_attrs.map((a) => decode(a.ts.map((t) => t.t).join('').trim())),
});
// each group is [{ rows, top }]; keep tiers, drop the summary "top" row
const groups = (gs) => gs.map((g) => g.flatMap((x) => x.rows.map(row)));

fs.mkdirSync('data/affixes', { recursive: true });
for (const kind of ['magic', 'rare']) {
  const { subpages } = await pagedata(kind);
  const out = [];
  for (const sp of subpages) {
    const d = (await pagedata(`${kind}/${sp.gid}`)).pagedata.data;
    out.push({
      gid: sp.gid, title: sp.title, category: sp.category,
      prefixes: groups(d.prefixes_groups || []),
      suffixes: groups(d.suffixes_groups || []),
    });
    console.error(kind, sp.gid, out.at(-1).prefixes.length, out.at(-1).suffixes.length);
  }
  fs.writeFileSync(`data/affixes/${kind}${lang === 'zh-TW' ? '' : '.' + lang}.json`, JSON.stringify(out, null, 2));
}
