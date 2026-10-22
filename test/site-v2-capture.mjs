// site-v2-capture.mjs: the homepage's product stills (website v2), captured from the live demos.
//
// Re-run it whenever the desk (coach.html?demo=1) or the lifter app (athlete.html?demo=1) changes.
// The desk is being re-skinned (vault: Specs/Desk + website v2), so this is meant to be run again
// once that lands. From the repo root, with any local server of this repo running:
//   node test/site-v2-capture.mjs [base]        base defaults to http://127.0.0.1:4193
// Needs playwright-core (npm i -g playwright-core; the headless shell path is below), cwebp, sips.
//
// Writes, into site-img/:
//   desk-hero.webp, desk-hero-1440.webp     Today, worst first (the hero laptop), 2160 and 1440 wide
//   desk-hero-m.webp                        the hero on phones: the Today list from its header to just
//                                           past the landing row, 2x
//   desk-table.webp, desk-table-1x.webp     an athlete's program grid, cut to its window (2x and 1x):
//                                           written over lifted, next week typed in place, the "fill
//                                           the weeks after" suggestions
//   desk-table-m.webp                       the same grid on phones: names and week 2, 2x
//   desk-roster.webp, desk-roster-1440.webp the whole roster on one screen
//   app-train.webp                          the lifter's Train screen, 393x852 @2x, as the iPhone app
// and og.png (1200x630, the Today queue and review).
//
// Then it rewrites, in index.html (and switch.html), the style on every element with data-cap="NAME" to the box of
// the thing it points at, as fractions of its still (--x --y --w --h), so the site's overlays (the
// hero's landing row and Log set press, the three numbered notes on the table) and the phone crops
// follow the product when it moves:
//   land      the athlete row a logged set lands on (hero)
//   log       the Log set button on the phone (hero)
//   hero-m    the hero's window on phones: the Today list down past that row (--mx --my --mw --mh)
//   pin1-3    the table's three notes: a set lifted over its RPE, next week typed in place,
//             the suggestions for the weeks after
//   table, roster       the window each section shows of its still (--cx --cy --cw --ch)
//   table-m, roster-m   the same on phones (--mx --my --mw --mh)
// Each lookup is by visible text, not class names, so it survives a re-skin; when one fails, the
// script says so and leaves that element's old values in place. After a re-skin, re-read the copy
// beside each still (index.html #table, #roster) against what the new capture actually shows.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core')); }
catch (e) { console.log('site-v2-capture: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(1); }

const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const BASE = (process.argv[2] || 'http://127.0.0.1:4193').replace(/\/$/, '');
const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMG = join(SITE, 'site-img');
const TMP = join(tmpdir(), 'powa-site-v2-capture');
mkdirSync(TMP, { recursive: true });
const W = 1440, H = 900, MAX_BYTES = 140 * 1024;
const caps = {};
let heroM = null; // the phone still's size, written onto its <source>
const misses = [];

const browser = await chromium.launch({ executablePath: EXE, timeout: 240000 });
const settle = (p, ms = 500) => p.waitForTimeout(ms);
// The demo's own chrome never shows in a product shot: the banner, the docked "Live demo ·
// Nothing saves" card (desk.js .dk-demo), toasts, the cookie bar.
const HIDE = '.demo-banner,.dk-demo,#powa-conn-banner,.toast,#toast,.cc-banner,[class*="cookie"]{display:none!important}*{caret-color:transparent!important}';
// The demo signs in as "Demo Coach": in a still it reads as a watermark, so the account shows a
// neutral "Head Coach" (text only, in the page; desk.js is untouched).
async function neutralCoach(p) {
  await p.evaluate(() => {
    const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();
    for (const e of document.querySelectorAll('body *')) {
      const t = own(e);
      if (t === 'Demo Coach') e.firstChild && [...e.childNodes].forEach((n) => { if (n.nodeType === 3 && n.nodeValue.trim()) n.nodeValue = n.nodeValue.replace('Demo Coach', 'Head Coach'); });
      else if (t === 'DC' && /\bav\b|-av\b|dk-me/.test(String(e.className))) e.textContent = 'HC';
    }
  });
}

function webp(png, out, resize) {
  let q = 82;
  for (;;) {
    const args = ['-quiet', '-q', String(q), '-m', '6', '-sharp_yuv'];
    if (resize) args.push('-resize', String(resize), '0');
    execFileSync('cwebp', [...args, png, '-o', out]);
    const size = statSync(out).size;
    if (size <= MAX_BYTES || q <= 56) return Math.round(size / 1024) + ' KB q' + q;
    q -= 4;
  }
}
// Box (CSS px) of the first element whose own text matches re, walked up to the nearest ancestor
// that passes `up` (a row, a button). Runs in the page.
async function find(page, re, opts = {}) {
  return page.evaluate(({ src, flags, within, upSel, minW, color }) => {
    const rx = new RegExp(src, flags);
    const root = within ? document.querySelector(within) : document.body;
    if (!root) return null;
    const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
    const all = [...root.querySelectorAll('*')].filter((e) => {
      const own = [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('') || (e.tagName === 'INPUT' ? e.value : '');
      if (!rx.test(own) || !vis(e)) return false;
      if (color) { const m = getComputedStyle(e).color.match(/\d+/g).map(Number); if (!(m[0] > 190 && m[1] < 140)) return false; }
      return true;
    });
    let e = all[0];
    if (!e) return null;
    if (upSel) { const u = e.closest(upSel); if (u) e = u; }
    if (minW) { while (e.parentElement && e.getBoundingClientRect().width < minW) e = e.parentElement; }
    const r = e.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }, { src: re.source, flags: re.flags, within: opts.within || null, upSel: opts.up || null, minW: opts.minW || 0, color: !!opts.red });
}
function frac(name, b, fw = W, fh = H) {
  if (!b) { misses.push(name); console.log('  MISS', name); return; }
  const f = (v) => +v.toFixed(4);
  caps[name] = { '--x': f(b.x / fw), '--y': f(b.y / fh), '--w': f(b.w / fw), '--h': f(b.h / fh) };
}
// A free window from (x0, y0) to (x1, y1), CSS px of the frame. pre 'c' writes the desktop crop
// (--cx --cy --cw --ch), 'm' the phone one (--mx --my --mw --mh).
function win(name, x0, y0, x1, y1, pre) {
  const f = (v) => +v.toFixed(4);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  caps[name] = { ['--' + pre + 'x']: f(x0 / W), ['--' + pre + 'y']: f(y0 / H), ['--' + pre + 'w']: f((x1 - x0) / W), ['--' + pre + 'h']: f((y1 - y0) / H) };
}

// ---- The desk -----------------------------------------------------------------------------
const desk = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'dark' });
await desk.addInitScript(() => {
  try {
    localStorage.setItem('powa-consent', 'essential');
    localStorage.setItem('powa-theme', 'dark');
    localStorage.setItem('powa-tour-coach-done', '1');
    localStorage.setItem('powa-pb-view', 'grid');
  } catch (e) {}
});
const page = await desk.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
async function shoot(name) {
  await page.addStyleTag({ content: HIDE });
  await neutralCoach(page);
  await page.evaluate(() => { const a = document.activeElement; if (a && a.blur && !/INPUT|TEXTAREA/.test(a.tagName)) a.blur(); });
  await settle(page, 300);
  const png = join(TMP, name + '.png');
  await page.screenshot({ path: png });
  console.log('desk-' + name + '.webp', webp(png, join(IMG, 'desk-' + name + '.webp'), 2160), '| -1440', webp(png, join(IMG, 'desk-' + name + '-1440.webp'), 1440));
  return png;
}
async function clickText(re, within) {
  const b = await find(page, re, { within });
  if (!b) return false;
  await page.mouse.click(b.x + Math.min(b.w / 2, 40), b.y + b.h / 2);
  await settle(page, 1200);
  return true;
}

await page.goto(BASE + '/coach.html?demo=1');
await settle(page, 3500);
await page.mouse.click(5, 450);

// 1. Today: the hero. The landing row is an athlete who trains today (Arjun in the demo).
{
  frac('land', await find(page, /^\s*Arjun Mehta\s*$/, { minW: 280 }));
  const list = await find(page, /^\s*Today\s*$/, { minW: 260 });
  // Phones: the Today list at reading size, from its own header ("Today · 0 of 15 handled", so
  // the worst-first top row is in it) down to one row past the landing row. It ends on a row
  // boundary (the row pitch is read off the row above), so no sliver of another row shows.
  const ln = caps.land, above = await find(page, /^\s*Marcus Doyle\s*$/, { minW: 280 });
  const head = await find(page, /^\s*Today\s*$/, { within: '.dash-main, main' });
  const pitch = ln && above ? ln['--y'] * H - above.y : 66;
  if (ln) {
    const top = head && head.y < ln['--y'] * H ? head.y - 10 : ln['--y'] * H - 6 * pitch;
    win('hero-m', ln['--x'] * W - 8, top, (ln['--x'] + ln['--w']) * W + 8, (ln['--y'] + ln['--h']) * H + pitch, 'm');
  } else misses.push('hero-m');
  const png = await shoot('hero');
  // The phone still: that window on its own, at the capture's 2x.
  if (caps['hero-m']) {
    const m = caps['hero-m'], mPng = join(TMP, 'hero-m.png');
    const clip = { x: Math.round(m['--mx'] * W), y: Math.round(m['--my'] * H), width: Math.round(m['--mw'] * W), height: Math.round(m['--mh'] * H) };
    await page.screenshot({ path: mPng, clip });
    console.log('desk-hero-m.webp', webp(mPng, join(IMG, 'desk-hero-m.webp')), clip.width * 2 + 'x' + clip.height * 2);
    heroM = { w: clip.width * 2, h: clip.height * 2 };
    try { unlinkSync(mPng); } catch (e) {}
  }
  // og.png: the queue and the review, 1200x630.
  if (list) {
    const x = Math.max(0, list.x), w = Math.min(W - x, 1000), h = Math.round(w * 630 / 1200);
    const ogPng = join(TMP, 'og.png');
    await page.screenshot({ path: ogPng, clip: { x, y: 0, width: w, height: h } });
    execFileSync('sips', ['-s', 'format', 'png', '-z', '630', '1200', ogPng, '--out', join(SITE, 'og.png')], { stdio: 'ignore' });
    console.log('og.png', Math.round(statSync(join(SITE, 'og.png')).size / 1024) + ' KB');
  }
  try { unlinkSync(png); } catch (e) {}
}

// 2. Programs → Marcus: written over lifted, next week typed in place.
// This still is cut to its own window and written at the capture's 2x (desk-table.webp, plus a
// 1x desk-table-1x.webp), with a separate phone window (desk-table-m.webp): the names and
// week 2, cut where week 2's text ends, so a phone shows it at reading size. For the shot only, the athlete list beside the grid is folded away (it sits outside
// the window anyway) and the two visible weeks share the grid's width, so the typed week 3
// fits whole instead of being cut mid-number; each day's label is moved to where the grid is
// scrolled to, so the day rows aren't blank bands.
const tableShots = {};
{
  const ok = (await clickText(/^\s*Programs\s*$/)) && (await clickText(/^\s*Marcus Doyle\s*$/));
  if (!ok) { await page.keyboard.press('j'); await page.keyboard.press('o'); await settle(page, 1800); }
  await page.addStyleTag({ content: '.dk-pb-list{display:none!important} section:has(> .dk-pb-list){grid-template-columns:minmax(0,1fr)!important}' });
  await settle(page, 400);
  const benchCell = () => page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr')].filter((tr) => /bench/i.test(tr.innerText || '') && tr.querySelectorAll('input, [contenteditable="true"]').length >= 3);
    const ins = rows[0] ? [...rows[0].querySelectorAll('input, [contenteditable="true"]')] : [];
    if (!ins[2]) return null;
    const r = ins[2].getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  // Scroll the grid so week 2 (lifted under written) starts at the sticky name column.
  const scrollToWeek2 = () => page.evaluate(() => {
    const head = [...document.querySelectorAll('th, [role="columnheader"]')].find((h) => /^\s*Week 2\b/.test(h.innerText || ''));
    const sc = head && head.closest('.pg-grid-scroll, [class*="scroll"]');
    const first = head && head.parentElement && head.parentElement.firstElementChild;
    if (sc && first) sc.scrollLeft += head.getBoundingClientRect().left - first.getBoundingClientRect().right;
  });
  // Type next week's bench into week 3, the way a coach writes it in a sheet.
  await page.evaluate(() => {
    const rows = [...document.querySelectorAll('tr')].filter((tr) => /bench/i.test(tr.innerText || '') && tr.querySelectorAll('input, [contenteditable="true"]').length >= 3);
    const ins = rows[0] ? [...rows[0].querySelectorAll('input, [contenteditable="true"]')] : [];
    if (ins[2]) ins[2].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  const cell = await benchCell();
  if (cell) {
    await page.mouse.click(cell.x + 20, cell.y + cell.h / 2);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
    await page.keyboard.type('1x3 152.5kg @8, 2x5 137.5kg @7', { delay: 10 });
    await page.keyboard.press('Tab'); // commit
    await settle(page, 400);
    await scrollToWeek2();
    await settle(page, 300);
    // Click the edited cell again: its inspector opens beside the grid.
    const again = await benchCell();
    if (again) { await page.mouse.click(again.x + 30, again.y + again.h / 2); await settle(page, 900); }
    // Now the grid's width is final: weeks 2 and 3 share it, week 4 starts just past the edge.
    const wk = await page.evaluate(() => {
      const sc = document.querySelector('.pg-grid-scroll'), corner = document.querySelector('.pg-grid .pg-corner');
      return sc && corner ? Math.floor((sc.clientWidth - corner.getBoundingClientRect().width) / 2) : 0;
    });
    if (wk > 150) await page.addStyleTag({ content: `.pg-grid td{min-width:${wk}px!important;width:${wk}px}` });
    await settle(page, 300);
    await scrollToWeek2();
    await page.evaluate(() => {
      const sc = document.querySelector('.pg-grid-scroll');
      if (sc) document.querySelectorAll('.pg-grid tr.pg-day > *').forEach((th) => { th.style.paddingLeft = (sc.scrollLeft + 14) + 'px'; });
    });
    await settle(page, 300);
  } else misses.push('table edit');
  frac('pin1', (await find(page, /@9\.5/, { red: true })) || (await find(page, /\d×\d+ @9\.5/)));
  // pin 2 is the edited cell itself (the desk draws its own outline round it, so the site draws
  // only the number there), clipped to the grid.
  const edited = await page.evaluate(() => {
    const a = document.activeElement;
    if (!a || !/INPUT|TEXTAREA/.test(a.tagName) && a.contentEditable !== 'true') return null;
    const box = (a.closest('td') || a).getBoundingClientRect(), sc = a.closest('.pg-grid-scroll');
    const c = sc ? sc.getBoundingClientRect() : { left: 0, right: innerWidth };
    const x0 = Math.max(box.left, c.left), x1 = Math.min(box.right, c.right);
    return { x: x0, y: box.top, w: Math.max(0, x1 - x0), h: box.height };
  });
  frac('pin2', edited && edited.w > 40 ? edited : await find(page, /152\.5\s*kg @8, 2x5/));
  frac('pin3', await find(page, /Fill the weeks after/, { minW: 200 }));
  // The windows. Desktop: the grid pane (with its title bar) and the inspector, down to where the
  // weekly totals start. Phones: the names, week 2 and week 3, from the column heads down.
  const g = await page.evaluate(() => {
    const sc = document.querySelector('.pg-grid-scroll'), t = sc && sc.querySelector('table');
    if (!sc || !t) return null;
    const s = sc.getBoundingClientRect(), th = t.querySelector('thead') || t.rows[0];
    const sum = t.querySelector('tr.pg-sum, tfoot tr');
    const heads = [...t.rows[0].cells];
    const w3 = heads.find((h) => /^\s*Week 3\b/.test(h.innerText || ''));
    // Phones: where week 2's own text ends (written and lifted), so the phone window can stop
    // there and keep the text at reading size; and the last lift row's bottom (no half "Rest" row).
    const w2 = heads.findIndex((h) => /^\s*Week 2\b/.test(h.innerText || ''));
    let w2text = 0, liftBottom = 0;
    for (const tr of t.rows) {
      if (tr.querySelector('input, [contenteditable="true"]')) liftBottom = Math.max(liftBottom, tr.getBoundingClientRect().bottom);
      const c = w2 >= 0 && tr.cells.length === heads.length ? tr.cells[w2] : null;
      if (!c) continue;
      // Text nodes only (the cell's inputs and blocks span the whole column).
      const tw = document.createTreeWalker(c, NodeFilter.SHOW_TEXT);
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.nodeValue.trim()) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        for (const r of rg.getClientRects()) if (r.width > 0) w2text = Math.max(w2text, r.right);
      }
      for (const inp of c.querySelectorAll('input, textarea')) {
        if (!inp.value) continue;
        // An input's text has no box of its own: measure a copy in the same type.
        const cs = getComputedStyle(inp), m = document.createElement('span');
        for (const k of ['fontFamily', 'fontSize', 'fontWeight', 'fontStretch', 'letterSpacing', 'wordSpacing', 'fontFeatureSettings', 'fontVariantNumeric']) m.style[k] = cs[k];
        m.style.cssText += ';position:absolute;visibility:hidden;white-space:pre';
        m.textContent = inp.value; document.body.appendChild(m);
        w2text = Math.max(w2text, inp.getBoundingClientRect().left + parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth) + m.getBoundingClientRect().width);
        m.remove();
      }
    }
    return { left: s.left, top: th.getBoundingClientRect().top, right: s.right, bottom: sum ? sum.getBoundingClientRect().top : null, w3right: w3 ? Math.min(s.right, w3.getBoundingClientRect().right) : s.right, w2text, liftBottom };
  });
  const p1 = caps.pin1, p2 = caps.pin2;
  if (g && p1 && p2) {
    const px = (c, k) => c['--' + k] * (k === 'x' || k === 'w' ? W : H);
    const bottom = g.bottom || Math.max(px(p1, 'y') + px(p1, 'h'), px(p2, 'y') + px(p2, 'h')) + 160;
    // Both windows end on the last lift row, so no half day-label row ("Rest") shows at the edge.
    win('table', g.left - 24, 0, W, (g.liftBottom || bottom) + 1, 'c');
    // Phones: the names and week 2 only (written over lifted, pin 1), at reading size; week 3
    // and the inspector stay on the desktop still, and pin 2/3's notes read on their own.
    const mRight = g.w2text > g.left + 200 ? g.w2text + 20 : g.w3right + 1;
    win('table-m', g.left, g.top, mRight, (g.liftBottom || bottom) + 1, 'm');
  } else misses.push('table window');
  await page.addStyleTag({ content: HIDE });
  await neutralCoach(page);
  await page.evaluate(() => { const a = document.activeElement; if (a && a.blur && !/INPUT|TEXTAREA/.test(a.tagName)) a.blur(); });
  await settle(page, 300);
  for (const [name, pre, out] of [['table', 'c', 'desk-table'], ['table-m', 'm', 'desk-table-m']]) {
    const m = caps[name];
    if (!m) continue;
    const clip = { x: Math.round(m['--' + pre + 'x'] * W), y: Math.round(m['--' + pre + 'y'] * H), width: Math.round(m['--' + pre + 'w'] * W), height: Math.round(m['--' + pre + 'h'] * H) };
    const png = join(TMP, out + '.png');
    await page.screenshot({ path: png, clip });
    tableShots[out] = { w: clip.width * 2, h: clip.height * 2 };
    console.log(out + '.webp', webp(png, join(IMG, out + '.webp')), clip.width * 2 + 'x' + clip.height * 2);
    if (name === 'table') { console.log(out + '-1x.webp', webp(png, join(IMG, out + '-1x.webp'), clip.width)); tableShots[out + '-1x'] = { w: clip.width, h: clip.height }; }
    try { unlinkSync(png); } catch (e) {}
  }
}

// 3. The whole roster.
{
  await page.keyboard.press('Escape');
  await settle(page, 300);
  if (!(await clickText(/^\s*Roster\s*$/))) misses.push('roster nav');
  const head = await find(page, /^\s*Athlete\s*$/);
  if (head) {
    win('roster', head.x - 50, 0, head.x - 50 + 0.62 * W, 0.62 * H, 'c');
    win('roster-m', head.x - 36, head.y - 16, head.x - 36 + 500, head.y + 384, 'm');
  } else misses.push('roster window');
  const png = await shoot('roster');
  try { unlinkSync(png); } catch (e) {}
}
await desk.close();

// ---- The lifter's Train screen, as the iPhone app ------------------------------------------
{
  const PW = 393, PH = 852;
  const ctx = await browser.newContext({ viewport: { width: PW, height: PH }, deviceScaleFactor: 2, serviceWorkers: 'block', isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: 'dark' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('powa-consent', 'essential'); localStorage.setItem('powa-theme', 'dark'); } catch (e) {}
    // The app's own layout (html.native): bottom tab bar, no web chrome. Native calls answer empty.
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {}, registerPlugin: () => new Proxy({}, { get: () => async () => ({}) }) };
  });
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } }); } catch (e) { console.log('  no safe-area override in this Chromium: the status bar sits on the title'); }
  p.on('pageerror', (e) => errors.push('athlete: ' + e.message));
  await p.goto(BASE + '/athlete.html?demo=1');
  await settle(p, 3500);
  await p.addStyleTag({ content: HIDE });
  await settle(p, 300);
  const log = await find(p, /^\s*Log set\s*$/, { up: 'button' });
  frac('log', log, PW, PH);
  const png = join(TMP, 'app-train.png');
  await p.screenshot({ path: png });
  console.log('app-train.webp', webp(png, join(IMG, 'app-train.webp')));
  try { unlinkSync(png); } catch (e) {}
  await ctx.close();
}
await browser.close();

// ---- Write the boxes into the pages ----------------------------------------------------------
// index.html carries all of them; switch.html shows the table's phone window (data-cap="table-m")
// at every width.
for (const page of ['index.html', 'switch.html']) {
  const file = join(SITE, page);
  let html = readFileSync(file, 'utf8');
  let n = 0;
  for (const [name, vars] of Object.entries(caps)) {
    const style = Object.entries(vars).map(([k, v]) => k + ':' + v).join(';');
    const re = new RegExp('(data-cap="' + name + '"[^>]*?style=")[^"]*(")', 'g');
    if (!re.test(html)) { if (page === 'index.html') console.log('  index.html has no data-cap="' + name + '" with a style attribute'); continue; }
    re.lastIndex = 0;
    html = html.replace(re, '$1' + style + '$2');
    n++;
  }
  if (heroM) html = html.replace(/(srcset="site-img\/desk-hero-m\.webp" width=")\d+(" height=")\d+/, '$1' + heroM.w + '$2' + heroM.h);
  // The table stills are cut to their windows, so their sizes change with every capture.
  const ts = tableShots;
  if (ts['desk-table-m']) html = html.replace(/(srcset="site-img\/desk-table-m\.webp" width=")\d+(" height=")\d+/, '$1' + ts['desk-table-m'].w + '$2' + ts['desk-table-m'].h);
  if (ts['desk-table-m']) html = html.replace(/(src="site-img\/desk-table-m\.webp" width=")\d+(" height=")\d+/, '$1' + ts['desk-table-m'].w + '$2' + ts['desk-table-m'].h); // switch.html
  if (ts['desk-table'] && ts['desk-table-1x']) html = html.replace(/(src="site-img\/desk-table\.webp" srcset="site-img\/desk-table-1x\.webp )\d+(w, site-img\/desk-table\.webp )\d+(w"[^>]*? width=")\d+(" height=")\d+/, '$1' + ts['desk-table-1x'].w + '$2' + ts['desk-table'].w + '$3' + ts['desk-table'].w + '$4' + ts['desk-table'].h);
  writeFileSync(file, html);
  console.log(page + ': ' + n + ' boxes written.');
}
if (misses.length) console.log('Not found (old values kept): ' + misses.join(', '));
if (process.env.DEBUG) console.log(JSON.stringify(caps));
if (errors.length) console.log('Page errors:\n  ' + errors.slice(0, 6).join('\n  '));
