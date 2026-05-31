/**
 * fetch-d2r-world.mjs
 * Usage: node scripts/fetch-d2r-world.mjs <gid> [lang]
 *   gid  : unique item category, e.g. shields, orbs, helms, rings, jewels …
 *   lang : zh-TW (default) or en-US
 *
 * Output: JSON array of items, each with { id, name, ename, bname, grade, itemclass, stats[] }
 *         stats[] is an array of { label, color } objects matching the patch-items format.
 */
import CryptoJS from 'crypto-js';
import LZString from 'lz-string';
import https from 'https';

// AES key embedded in _app bundle: n.g.ff="d2rw", n.g.gk=1231
const AES_KEY = 'd2rw' + 1231;

// Build ID — update if d2r.world redeploys
const BUILD_ID = 'R_OhhIhHr6wNVERCnEthm';

function decrypt(webdata) {
  const key = CryptoJS.enc.Utf8.parse(AES_KEY);
  const raw = CryptoJS.AES.decrypt(webdata, key, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7,
  }).toString(CryptoJS.enc.Utf8);
  return JSON.parse(LZString.decompressFromUTF16(raw));
}

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolve(d));
      })
      .on('error', reject);
  });
}

// Map cli_attrs style code → hex colour (matches d2r-patch-items.json convention)
function styleColor(s) {
  const map = {
    m: '#00FFFF', s: '#00FFFF',   // magic / skill name
    p: '#FFFFFF', pk: '#FFFFFF', pn: '#FFFFFF', // property / white
    n: '#FFFFFF',                  // normal text (mixed with blue)
    v: '#FF00FF',                  // variable placeholder
    y: '#FFFF00',                  // yellow (fixed bonus header)
    g: '#00FF00',                  // green (set bonus)
    r: '#FF4444',
  };
  return map[s] || '#FFFFFF';
}

/**
 * Flatten a cli_attrs entry into a human-readable label + dominant colour.
 * Entries with v=true are variable; we combine text parts as-is.
 */
function attrsToStats(cliAttrs) {
  const stats = [];
  for (const [, entries] of Object.entries(cliAttrs)) {
    for (const entry of entries) {
      if (entry.isprop) continue; // skip "需要等級：" line
      const label = entry.ts.map((t) => t.t).join('').trim();
      if (!label) continue;
      // Dominant color: use the first non-white token's color, else entry color
      const color = styleColor(entry.s);
      stats.push({ label, color });
    }
  }
  return stats;
}

async function main() {
  const gid  = process.argv[2];
  const lang = process.argv[3] || 'zh-TW';

  if (!gid) {
    console.error('Usage: node fetch-d2r-world.mjs <gid> [lang]');
    process.exit(1);
  }

  const url = `https://d2r.world/_next/data/${BUILD_ID}/${lang}/info/item/unique/${gid}.json`;
  const raw = await get(url);

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.error('Failed to parse response. Check gid or BUILD_ID.');
    process.exit(1);
  }

  const data = decrypt(parsed.pageProps.webdata);
  const results = [];

  for (const section of data.pagedata.sections) {
    for (const item of section.items) {
      const stats = item.cli_attrs ? attrsToStats(item.cli_attrs) : [];
      results.push({
        id:        item.id,
        name:      item.name,      // zh name
        ename:     item.ename,     // en name
        bname:     item.bname,     // base type zh
        grade:     item.grade,
        itemclass: item.itemclass,
        section:   section.id,
        stats,
      });
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
