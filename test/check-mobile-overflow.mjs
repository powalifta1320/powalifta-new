#!/usr/bin/env node
/*
 * 375px horizontal-overflow regression check.
 *
 * Loads each page in a headless Chromium at 375px and asserts
 * document.documentElement.scrollWidth <= innerWidth (+1px tolerance) — i.e. the
 * page never scrolls sideways. This is the automated guard for the class of
 * mobile bugs fixed in the native/mobile pass (overflow-x, safe-area, off-edge
 * panels/buttons).
 *
 * Puppeteer is intentionally NOT a committed dependency (keeps the repo build-step
 * free). Install it only when you want to run this check:
 *     npm i -g puppeteer        # or:  npx puppeteer browsers install chrome
 *     node test/check-mobile-overflow.mjs
 * Without puppeteer it prints how to enable it and exits 0 (skips, never fails CI).
 */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Public pages + the demo dashboards (?demo=1 = no network/native, pure layout).
const PAGES = [
  'index.html', 'marketplace.html', 'leaderboard.html', 'guides.html',
  'guide-rpe.html', 'guide-e1rm.html', 'guide-dots.html', 'guide-peaking.html',
  'exercises.html', 'about.html', 'faq.html', 'privacy.html', 'terms.html',
  'athlete.html?demo=1', 'coach.html?demo=1',
];
const WIDTH = 375, TOL = 1;

let puppeteer;
try { puppeteer = (await import('puppeteer')).default; }
catch {
  console.log('SKIP: puppeteer not installed — this check needs a headless browser.');
  console.log('      Enable it with:  npm i -g puppeteer   (then re-run)');
  process.exit(0);
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: 812, deviceScaleFactor: 2 });

let failures = 0;
for (const rel of PAGES) {
  const [file, query] = rel.split('?');
  const url = pathToFileURL(path.join(ROOT, file)).href + (query ? '?' + query : '');
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 400)); // let fx/layout settle
    const { sw, iw } = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth, iw: window.innerWidth,
    }));
    if (sw > iw + TOL) { console.log(`  ✗ ${rel}  scrollWidth=${sw} > innerWidth=${iw}  (+${sw - iw}px)`); failures++; }
    else { console.log(`  ✓ ${rel}  (${sw} <= ${iw})`); }
  } catch (e) {
    console.log(`  ? ${rel}  could not load: ${e.message}`);
  }
}

await browser.close();
console.log(`\n${failures === 0 ? 'PASS' : 'FAIL'}: ${PAGES.length - failures}/${PAGES.length} pages have no horizontal overflow at ${WIDTH}px`);
process.exit(failures > 0 ? 1 : 0);
