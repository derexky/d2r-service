/**
 * crawl-build-guides.mjs
 * Usage: node scripts/crawl-build-guides.mjs [slug-filter]
 *
 * 用 Playwright 逐頁渲染 d2r-build-journal 的流派攻略頁，存成 data/build-guides/<class>-<slug>.json。
 * 角色介面（配裝／技能／面板／傭兵／實戰）是點擊後才渲染的，所以不能只抓 SSR HTML；
 * 這裡只負責把畫面上的內容原樣收下來，整理進 DB 另由匯入腳本處理。
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const SITE = 'https://d2r-build-journal.pages.dev';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data/build-guides');
const filter = process.argv[2];
const CONCURRENCY = 4;

const txt = (s) => (s ?? '').replace(/\s+/g, ' ').trim();

// 以下函式在瀏覽器內執行
function readTooltip(el) {
  if (!el) return null;
  const t = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  return {
    slot: t(el.querySelector('.d2TooltipSlot')?.textContent),
    name: t(el.querySelector('h3')?.textContent),
    base: t(el.querySelector('small')?.textContent) || null,
    quality: [...el.classList].find((c) => c !== 'd2ItemTooltip') ?? null,
    image: el.querySelector('img')?.getAttribute('src') ?? null,
    meta: [...el.querySelectorAll('.d2ItemMeta > *')].map((e) => t(e.textContent)),
    stats: [...el.querySelectorAll('ul > li')].map((li) => ({
      text: t([...li.childNodes].filter((n) => n.nodeName !== 'EM').map((n) => n.textContent).join('')),
      important: li.classList.contains('important'),
    })),
  };
}

function readSections(root) {
  const t = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
  return [...root.querySelectorAll(':scope > section')].map((s) => ({
    key: s.className.split(' ')[0],
    text: s.innerText.trim(),
    pairs: [...s.querySelectorAll('dl > div, article')].map((e) => {
      const kids = [...e.children].map((c) => t(c.textContent)).filter(Boolean);
      return kids.length >= 2 ? kids : null;
    }).filter(Boolean),
  }));
}

async function clickAll(page, selector, fn) {
  const els = page.locator(selector);
  const n = await els.count();
  const out = [];
  for (let i = 0; i < n; i++) {
    await els.nth(i).click();
    await page.waitForTimeout(120);
    out.push(await fn(els.nth(i), i));
  }
  return out;
}

async function openTab(page, en) {
  await page.locator('.d2PlannerTabs button').filter({ hasText: en }).click();
  await page.waitForTimeout(300);
}

const viewText = (page) => page.locator('.d2Planner .d2View').first().innerText();

async function crawlGear(page) {
  await openTab(page, 'LOADOUT');
  const loadouts = page.locator('.d2LoadoutSwitcher button');
  const nLoadouts = Math.max(await loadouts.count(), 1);
  const gear = [];
  const seen = new Set();
  for (let l = 0; l < nLoadouts; l++) {
    let loadout = null;
    if (await loadouts.count()) {
      await loadouts.nth(l).click();
      await page.waitForTimeout(200);
      loadout = txt(await loadouts.nth(l).locator('b').innerText());
    }
    // 武器組 I／II 會換掉武器欄的 hotspot，兩組都要點
    const sets = page.locator('.d2WeaponTabs.left button');
    const nSets = Math.max(await sets.count(), 1);
    for (let w = 0; w < nSets; w++) {
      if (await sets.count()) {
        await sets.nth(w).click();
        await page.waitForTimeout(200);
      }
      const weaponSet = (await sets.count()) ? txt(await sets.nth(w).innerText()) : null;
      await clickAll(page, '.d2GearHotspot', async (h) => {
        const label = await h.getAttribute('aria-label');
        const key = `${loadout}|${label}`;
        if (seen.has(key)) return;
        seen.add(key);
        const item = await page.locator('.d2Inspector .d2ItemTooltip').evaluate(readTooltip).catch(() => null);
        gear.push({ loadout, weaponSet, label, ...item });
      });
    }
  }
  return gear;
}

async function crawlSkills(page) {
  await openTab(page, 'SKILL TREE');
  return clickAll(page, '.d2SkillTreeTabs button', async (tab) => ({
    tree: txt(await tab.innerText()),
    skills: await clickAll(page, '.d2SkillHotspot', async (h) => ({
      label: await h.getAttribute('aria-label'),
      detail: (await page.locator('.d2SkillInspector').innerText()).trim(),
    })),
  }));
}

async function crawlCharacter(page) {
  await openTab(page, 'CHARACTER');
  const summary = (await page.locator('.d2PanelInspector > section').first().innerText()).trim();
  const groups = await clickAll(page, '.d2PanelGroupTabs button', async (tab) => ({
    group: txt(await tab.innerText()),
    rows: await page.locator('.d2AdvancedGrid article').evaluateAll((els) =>
      els.map((e) => [...e.children].map((c) => c.textContent.replace(/\s+/g, ' ').trim()))),
  }));
  return { summary, groups };
}

async function crawlMerc(page) {
  await openTab(page, 'MERCENARY');
  const gear = await clickAll(page, '.d2MercHotspot', async (h) => ({
    label: await h.getAttribute('aria-label'),
    ...(await page.locator('.d2MercInspector .d2ItemTooltip').evaluate(readTooltip).catch(() => null)),
  }));
  const support = await page.locator('.d2MercInspector .d2AuraCard').evaluateAll((els) => els.map((e) => e.innerText.trim()));
  return { gear, support, text: (await viewText(page)).trim() };
}

async function crawlPage(page, url) {
  const res = await page.goto(url, { waitUntil: 'networkidle' });
  if (!res.ok()) throw new Error(`${res.status()} ${url}`);
  const head = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name=description]')?.content ?? null,
    hero: document.querySelector('.iceGuideHeroCopy')?.innerText.trim() ?? null,
    bar: Object.fromEntries([...document.querySelectorAll('.d2PlannerBar dl > div')]
      .map((d) => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.trim()])),
  }));
  // 工作台區塊就是角色介面本身，下面逐分頁抓，這裡略過避免重複
  const sections = (await page.locator('.iceGuideMain').evaluate(readSections)).filter((s) => s.key !== 'iceGuideWorkbench');
  const telemetry = await page.locator('.iceGuideTelemetry').evaluate((el) => ({
    attributes: Object.fromEntries([...el.querySelectorAll('dl > div')]
      .map((d) => [d.querySelector('dt').textContent.trim(), d.querySelector('dd').textContent.trim()])),
    rates: Object.fromEntries([...el.querySelectorAll('.iceTelemetryRates article')]
      .map((a) => [a.querySelector('span').textContent.trim(), a.querySelector('b').textContent.trim()])),
    resistances: Object.fromEntries([...el.querySelectorAll('.d2ResValue')]
      .map((r) => [r.querySelector('small').textContent.trim(), r.querySelector('b').textContent.trim()])),
  }));
  await openTab(page, 'BUILD LOGIC');
  const logic = (await viewText(page)).trim();
  const gear = await crawlGear(page);
  const skills = await crawlSkills(page);
  const character = await crawlCharacter(page);
  const merc = await crawlMerc(page);
  await openTab(page, 'FIELD NOTES');
  const field = (await viewText(page)).trim();
  return { url, crawledAt: new Date().toISOString(), ...head, telemetry, sections, logic, gear, skills, character, merc, field };
}

async function main() {
  const home = await (await fetch(`${SITE}/`)).text();
  const paths = [...new Set(home.match(/\/builds\/[\w-]+\/[\w-]+\//g))].filter((p) => !filter || p.includes(filter));
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const failed = [];
  const queue = [...paths];
  // 每個 worker 一個分頁，各自從佇列取下一頁
  const worker = async () => {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    for (let p; (p = queue.shift());) {
      const [, cls, slug] = p.split('/').filter(Boolean);
      try {
        const data = await crawlPage(page, SITE + p);
        fs.writeFileSync(path.join(OUT, `${cls}-${slug}.json`), JSON.stringify({ class: cls, slug, ...data }, null, 2));
        console.log(`✓ ${cls}/${slug}：裝備 ${data.gear.length}、技能樹 ${data.skills.length}、傭兵裝 ${data.merc.gear.length}`);
      } catch (e) {
        failed.push(p);
        console.error(`✗ ${p}：${e.message}`);
      }
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  await browser.close();
  console.log(`完成 ${paths.length - failed.length}/${paths.length}，輸出 ${OUT}`);
  if (failed.length) process.exit(1);
}

main();
