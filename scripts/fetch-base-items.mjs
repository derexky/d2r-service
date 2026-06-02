/**
 * fetch-base-items.mjs
 * Usage: node scripts/fetch-base-items.mjs [lang]
 *   lang : zh-TW (default) or en-US
 *
 * Output: JSON array of base items, each with:
 *   { item_id, name_zh, name_en, gid, category, grade, qlvl, max_sockets, attrs }
 */
import CryptoJS from 'crypto-js';
import LZString from 'lz-string';
import https from 'https';

const AES_KEY = 'd2rw' + 1231;
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

function extractSocketVal(socketEntry) {
  if (typeof socketEntry === 'string') return parseInt(socketEntry) || 0;
  if (typeof socketEntry === 'object' && socketEntry !== null) {
    if (socketEntry.txt) return parseInt(socketEntry.txt) || 0;
  }
  return 0;
}

function extractAttrVal(val) {
  if (typeof val === 'string') return val;
  if (typeof val === 'object' && val !== null) return val.txt || '';
  return '';
}

async function fetchSubpage(gid, category, lang) {
  const url = `https://d2r.world/_next/data/${BUILD_ID}/${lang}/info/item/base/${gid}.json`;
  const raw = await get(url);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    process.stderr.write(`Failed to parse ${gid}\n`);
    return [];
  }

  const data = decrypt(parsed.pageProps.webdata);
  const results = [];

  for (const section of data.pagedata.sections) {
    for (const tbl of section.itemtbls) {
      const count = tbl.name.length;
      for (let i = 0; i < count; i++) {
        const grade = tbl.grade?.[i] || (i === 0 ? 'normal' : i === 1 ? 'exceptional' : 'elite');
        const attrs = {};
        let maxSockets = null;
        let qlvl = null;

        for (const [attrKey, values] of Object.entries(tbl.attrs)) {
          if (attrKey === 'qlvl') {
            qlvl = parseInt(values[i]) || null;
            continue;
          }
          if (attrKey === '鑲孔') {
            maxSockets = extractSocketVal(values[i]);
            attrs[attrKey] = extractAttrVal(values[i]);
            continue;
          }
          attrs[attrKey] = extractAttrVal(values[i]);
        }

        results.push({
          item_id: tbl.id[i],
          name_zh: tbl.name[i],
          name_en: tbl.ename?.[i] || null,
          gid,
          category,
          grade,
          qlvl,
          max_sockets: maxSockets,
          image_path: tbl.img ? `/assets/img${tbl.img.replace('/img/items/base', '/base')}` : null,
          attrs: JSON.stringify(attrs),
        });
      }
    }
  }

  return results;
}

async function main() {
  const lang = process.argv[2] || 'zh-TW';

  // First fetch the index page to get all subpages
  const indexRaw = await get(`https://d2r.world/_next/data/${BUILD_ID}/${lang}/info/item/base.json`);
  const indexParsed = JSON.parse(indexRaw);
  const indexData = decrypt(indexParsed.pageProps.webdata);
  const subpages = indexData.subpages;

  const allItems = [];

  for (const subpage of subpages) {
    process.stderr.write(`Fetching ${subpage.gid} (${subpage.title})...\n`);
    const items = await fetchSubpage(subpage.gid, subpage.category, lang);
    process.stderr.write(`  → ${items.length} items\n`);
    allItems.push(...items);
  }

  process.stderr.write(`\nTotal: ${allItems.length} base items\n`);
  console.log(JSON.stringify(allItems, null, 2));
}

main().catch((e) => { process.stderr.write(e.message + '\n'); process.exit(1); });
