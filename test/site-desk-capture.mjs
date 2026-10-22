// site-desk-capture.mjs: the homepage's coach-desk stills, captured from the live desk.
//
// Re-run this whenever the desk (coach.html?demo=1) changes. From the repo root:
//   node test/site-desk-capture.mjs [deskBase]
// deskBase defaults to http://127.0.0.1:4191 (any local server of this repo works).
// Needs playwright-core (like test/uiscan.mjs: npm i -g playwright-core && npx playwright install
// chromium; the headless shell path is below) and cwebp + sips (macOS).
//
// It plays the "Monday in 40 seconds" sequence on the real desk at 1440x900 (2x) and writes,
// into site-img/:
//   desk-<name>.webp        the full frame, 2160 wide (each kept well under 200 KB)
//   desk-<name>-1440.webp   the same frame, 1440 wide (srcset for 1x screens)
//   desk-<name>-m.webp      a phone crop of just what the beat is about (<picture> under 600px)
// and og.png (1200x630, the Today queue and review). Frames:
//   today   Today, worst first (the hero, and beat 1)
//   next    J x4: Marcus, "Bench @9.5 vs @8"
//   week    O: his program grid, week 2 written over lifted; week 3 bench edited in place
//   done    E: Marcus done, "Reviewed 1 of 15", the next athlete open
//   caught  E until "All caught up"
//
// Every crop is built from element bounds and snapped to column edges, then nudged until no
// line of text, chip, button or input crosses its edge (it prints PASS/FAIL per crop). It rewrites,
// in index.html, the style on each data-crop="N" (and data-crop="hero"):
//   --cx/--cy/--cz   the 16:10 crop (top-left and width, fractions of the frame)
//   --hx/--hy/--hw/--hh   the box the pinned laptop rings when the beat plays
// and the width/height on each phone <source>.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core')); } // PLAYWRIGHT_CORE: a path to a local copy
catch (e) { console.log('site-desk-capture: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(1); }

const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell';
const DESK = (process.argv[2] || 'http://127.0.0.1:4191').replace(/\/$/, '');
const SITE = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IMG = join(SITE, 'site-img');
const TMP = join(tmpdir(), 'powa-site-capture');
mkdirSync(TMP, { recursive: true });
const W = 1440, H = 900, DPR = 2, MAX_BYTES = 130 * 1024; // the brief's cap is 200 KB a still
const failures = [];

const browser = await chromium.launch({ executablePath: EXE });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, serviceWorkers: 'block', reducedMotion: 'reduce' });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem('powa-consent', 'essential');
    localStorage.setItem('powa-theme', 'dark');
    localStorage.setItem('powa-tour-coach-done', '1');
    localStorage.setItem('powa-pb-view', 'grid');
  } catch (e) {}
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

const settle = (ms = 500) => page.waitForTimeout(ms);
async function key(k, n = 1, gap = 260) { for (let i = 0; i < n; i++) { await page.keyboard.press(k); await settle(gap); } }
async function blur() { await page.evaluate(() => { const a = document.activeElement; if (a && a.blur && !a.classList.contains('pg-cell')) a.blur(); }); }
async function clean() {
  await page.addStyleTag({ content: '.demo-banner{display:none!important} *{caret-color:transparent} .pg-cell:focus{caret-color:auto}' });
  await blur();
}

// ---- Geometry -----------------------------------------------------------------------------
// Bounding box (CSS px) of the union of the elements the function returns.
async function box(fn) {
  return page.evaluate((src) => {
    const els = [].concat((0, eval)('(' + src + ')')()).filter(Boolean);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    els.forEach((e) => { const r = e.getBoundingClientRect(); if (!r.width && !r.height) return; x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); });
    return isFinite(x0) ? { x0, y0, x1, y1 } : null;
  }, fn.toString());
}
// Every line of visible text, every control and icon, and every chip, as [l, t, r, b].
async function inkRects() {
  return page.evaluate(() => {
    const out = [], vw = innerWidth, vh = innerHeight;
    // What's actually painted: each box cut to its clipping ancestors (cells, scrollers).
    const clipOf = (el) => {
      let c = [0, 0, vw, vh];
      for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.overflowX !== 'visible' || s.overflowY !== 'visible' || /input|textarea/i.test(e.tagName)) {
          const r = e.getBoundingClientRect();
          c = [Math.max(c[0], r.left), Math.max(c[1], r.top), Math.min(c[2], r.right), Math.min(c[3], r.bottom)];
        }
      }
      return c;
    };
    const add = (r, el, soft) => {
      const c = el ? clipOf(el) : [0, 0, vw, vh];
      const l = Math.max(r.left, c[0]), t = Math.max(r.top, c[1]), rr = Math.min(r.right, c[2]), b = Math.min(r.bottom, c[3]);
      if (rr - l > 1 && b - t > 1) out.push(soft ? [l, t, rr, b, 1] : [l, t, rr, b]);
    };
    const seen = (el) => { for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; } return true; };
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let n;
    while ((n = walk.nextNode())) {
      if (!n.nodeValue.trim() || !n.parentElement || !seen(n.parentElement)) continue;
      range.selectNodeContents(n);
      for (const r of range.getClientRects()) add(r, n.parentElement);
    }
    document.querySelectorAll('input, textarea, button, select, svg, img, canvas').forEach((e) => { if (seen(e)) add(e.getBoundingClientRect(), e.parentElement); });
    // Chips, keycaps and avatars: small boxes with a fill of their own.
    document.querySelectorAll('span, i, b, em, kbd, small, a, div').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width > 260 || r.height > 48 || r.width < 6 || !seen(e)) return;
      const bg = getComputedStyle(e).backgroundColor, m = bg.match(/rgba?\(([^)]+)\)/);
      if (m && (m[1].split(',')[3] === undefined || parseFloat(m[1].split(',')[3]) > 0.04)) add(r, e.parentElement, true);
    });
    return out;
  });
}
// Does any ink cross an edge of the crop {x, y, w, h}? (The frame's own edges don't count.)
function crossings(c, ink) {
  const hit = [];
  const X = [c.x, c.x + c.w], Y = [c.y, c.y + c.h];
  for (const [l, t, r, b] of ink) {
    for (const x of X) if (x > 0.5 && x < W - 0.5 && l < x - 0.5 && r > x + 0.5 && b > c.y && t < c.y + c.h) hit.push(['x', x, l, t, r, b]);
    for (const y of Y) if (y > 0.5 && y < H - 0.5 && t < y - 0.5 && b > y + 0.5 && r > c.x && l < c.x + c.w) hit.push(['y', y, l, t, r, b]);
  }
  return hit;
}
// Search for a clean crop: x fixed, width from w0 to w1 (or w1 down to w0), top from y0 to y1.
// aspect = w/h (16:10 for the laptop crops), or h0..h1 for free-height phone crops.
// Text, controls and chips must all stay whole; if no crop in range manages that, chips (the
// "soft" ink: a pill's fill) may be cut, but text never.
function snap(name, ink, o) {
  const hard = ink.filter((r) => !r[4]);
  const strict = snapIn(name, ink, Object.assign({}, o, { quiet: true }));
  if (!strict.k) return snapIn(name, ink, Object.assign({}, o, { x: strict.x, w0: strict.w, w1: strict.w, y0: strict.y, y1: strict.y, h0: strict.h, h1: strict.h, widest: false }));
  return snapIn(name + (o.quiet ? '' : ' (text)'), hard, o);
}
function snapIn(name, ink, { x, w0, w1 = w0, y0 = 0, y1 = y0, aspect, h0, h1 = h0, widest, quiet }) {
  const ws = [], ys = [], hs = [];
  for (let w = w0; w <= w1 + 0.01; w += 2) ws.push(w);
  if (widest) ws.reverse(); // prefer the widest clean crop (keeps a pane's right edge)
  for (let y = y0; y <= y1 + 0.01; y += 2) ys.push(y);
  if (!aspect) for (let h = h0; h <= h1 + 0.01; h += 2) hs.push(h);
  let best = null;
  outer: for (const w of ws) {
    for (const y of ys) {
      for (const h of aspect ? [w / aspect] : hs) {
        const c = { x, y, w: Math.min(w, W - x), h };
        if (c.y + c.h > H + 0.01) continue;
        const k = crossings(c, ink).length;
        if (!best || k < best.k) { best = c; best.k = k; }
        if (!k) break outer;
      }
    }
  }
  if (!best) best = { x, y: y0, w: w0, h: aspect ? w0 / aspect : h0 };
  const hits = crossings(best, ink);
  if (quiet) return best;
  console.log((hits.length ? 'FAIL ' : 'PASS ') + name.padEnd(12) + ' crop ' + [best.x, best.y, best.w, best.h].map((v) => Math.round(v)).join(',') + (hits.length ? '  cuts ' + hits.length + ' (first at ' + hits[0][0] + '=' + Math.round(hits[0][1]) + ')' : ''));
  if (hits.length) { failures.push(name); if (process.env.DEBUG) hits.slice(0, 6).forEach((h) => console.log('   ', h.map((v) => typeof v === 'number' ? Math.round(v) : v).join(' '))); }
  return best;
}
const frac = (c) => ({ x: +(c.x / W).toFixed(4), y: +(c.y / H).toFixed(4), z: +(c.w / W).toFixed(4) });
const ring = (b, pad = 6) => b && ({ hx: +((b.x0 - pad) / W).toFixed(4), hy: +((b.y0 - pad) / H).toFixed(4), hw: +((b.x1 - b.x0 + pad * 2) / W).toFixed(4), hh: +((b.y1 - b.y0 + pad * 2) / H).toFixed(4) });

// ---- Output -------------------------------------------------------------------------------
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
async function shoot(name) {
  const png = join(TMP, name + '.png');
  await page.screenshot({ path: png });
  console.log('desk-' + name + '.webp', webp(png, join(IMG, 'desk-' + name + '.webp'), 2160), '| -1440', webp(png, join(IMG, 'desk-' + name + '-1440.webp'), 1440));
  try { unlinkSync(png); } catch (e) {}
}
const phone = {};
async function shootPhone(name, c) {
  const png = join(TMP, name + '-m.png');
  const clip = { x: Math.round(c.x), y: Math.round(c.y), width: Math.round(c.w), height: Math.round(c.h) };
  await page.screenshot({ path: png, clip });
  phone[name] = { w: clip.width * DPR, h: clip.height * DPR };
  console.log('desk-' + name + '-m.webp', webp(png, join(IMG, 'desk-' + name + '-m.webp')), clip.width * DPR + 'x' + clip.height * DPR);
  try { unlinkSync(png); } catch (e) {}
}

const crops = {};
const cols = async () => box(() => document.getElementById('deskToday')).then(async (q) => ({ q, c: await box(() => document.getElementById('deskTodayCentre')) }));
// The Today desk: from the queue's left edge (the sidebar and its logo stay out) to the
// review pane's right edge, top of the frame; the bottom edge lands between lines.
async function todayCrop(name, ink) {
  const { q, c } = await cols();
  const body = await box(() => [...document.querySelectorAll('#deskTodayCentre > *')]);
  // The review pane stays whole (its content's right edge is the floor); the right edge may run
  // into the next pane's empty gutter. Widest first, then lower, until no ink crosses an edge.
  const minRight = Math.min(body ? body.x1 + 2 : c.x1 - 30, c.x1);
  return snap(name, ink, { x: q.x0, w0: minRight - q.x0, w1: c.x1 - q.x0 + 12, y0: 0, y1: 26, aspect: 16 / 10, widest: true });
}

await page.goto(DESK + '/coach.html?demo=1');
await settle(3500);
await clean();
await page.mouse.click(5, 450); // focus the page, not a control
await settle(300);

// 1. Today, worst first. Also the hero (Today column to the frame's right edge) and og.png.
{
  const ink = await inkRects();
  const { q } = await cols();
  const c = await todayCrop('1 today', ink);
  crops[1] = Object.assign(frac(c), ring(await box(() => document.querySelector('#deskToday .dk-qrow'))));
  const hc = snap('hero', ink, { x: q.x0, w0: W - q.x0 - 40, w1: W - q.x0, y0: 0, y1: 12, aspect: 16 / 10 });
  crops.hero = frac(hc);
  // Phone: the queue alone, title to the fifth athlete.
  const rows = await page.evaluate(() => [...document.querySelectorAll('#deskToday .dk-qrow')].slice(0, 5).map((r) => r.getBoundingClientRect().bottom));
  const { c: centre } = await cols();
  await shootPhone('today', snap('1 today m', ink, { x: q.x0, w0: centre.x0 - q.x0, y0: 0, h0: rows[4] + 4, h1: rows[4] + 40 }));
  // og.png: the queue and the review, 1200x630.
  const og = snap('og', ink, { x: q.x0, w0: c.w - 60, w1: c.w + 30, y0: 0, y1: 16, aspect: 1200 / 630 });
  const ogPng = join(TMP, 'og-src.png');
  await page.screenshot({ path: ogPng, clip: { x: og.x, y: og.y, width: og.w, height: og.h } });
  execFileSync('sips', ['-s', 'format', 'png', '-z', '630', '1200', ogPng, '--out', join(SITE, 'og.png')], { stdio: 'ignore' });
  console.log('og.png', Math.round(statSync(join(SITE, 'og.png')).size / 1024) + ' KB');
}
await shoot('today');

// 2. J through the queue to Marcus.
await key('j', 4);
await blur();
{
  const ink = await inkRects();
  const c = await todayCrop('2 next', ink);
  const need = await box(() => {
    const centre = document.getElementById('deskTodayCentre');
    const sec = centre ? [...centre.querySelectorAll('.dk-sec')].find((e) => /What needs you/.test(e.textContent || '')) : null;
    if (!sec) return null;
    // The first reason row: the smallest element holding the first chip and its words.
    const chip = [...sec.querySelectorAll('*')].find((e) => /@\d/.test(e.textContent || '') && e.children.length === 0);
    let row = chip;
    while (row && row.parentElement !== sec && row.getBoundingClientRect().width < sec.getBoundingClientRect().width * 0.9) row = row.parentElement;
    return row || sec;
  });
  crops[2] = Object.assign(frac(c), ring(need, 4));
  // Phone: his name, the actions and what needs you.
  const m = await box(() => { const c = document.getElementById('deskTodayCentre'); const sec = c ? [...c.querySelectorAll('.dk-sec')].find((e) => /What needs you/.test(e.textContent || '')) : null; return [c && c.querySelector('.dk-rv-head'), sec]; });
  await shootPhone('next', snap('2 next m', ink, { x: m.x0 - 16, w0: m.x1 - m.x0 + 32, y0: 0, h0: m.y1 + 14, h1: m.y1 + 40 }));
}
await shoot('next');

// 3. O: his program, written over lifted; week 3 bench edited in place.
await key('o', 1, 1800);
const cells = page.locator('.pg-grid input.pg-cell');
const n = await cells.count();
let editIdx = -1;
for (let i = 0; i < n; i++) {
  const row = await cells.nth(i).evaluate((el) => (el.closest('tr') || el).innerText || '');
  if (/bench/i.test(row)) { editIdx = i + 2; break; } // the row's first cell is week 1; week 3 is two along
}
if (editIdx >= 0 && editIdx < n) {
  const c = cells.nth(editIdx);
  await c.click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  await page.keyboard.type('1x3 152.5kg @8, 2x5 137.5kg @7', { delay: 12 });
  await settle(300);
  // Commit it (blur).
  await c.evaluate((el) => el.blur());
  await settle(600);
}
// With the cell inspector open (Written / Lifted / Fill the weeks after), the grid pane is
// narrow: keep it at week 1 + week 2 (written over lifted, day labels in place) and let the
// inspector show week 3 as just written.
const inspector = await page.evaluate(() => { const x = document.getElementById('deskCtx'); return !!(x && x.getBoundingClientRect().width > 100); });
await page.evaluate(() => { const sc = document.querySelector('.pg-grid-scroll'); if (sc) sc.scrollLeft = 0; });
await settle(400);
// If the grid's week header sits low (an older, single-column builder), scroll it up so a
// 16:10 crop of name + week 2 + week 3 can start at the header.
await page.evaluate(() => { const t = document.querySelector('.pg-grid'); if (t && t.getBoundingClientRect().top > 300) scrollBy(0, t.getBoundingClientRect().top - 150); });
await settle(500);
if (process.env.DEBUG) await page.screenshot({ path: join(TMP, 'dbg-week.png') });
{
  const ink = await inkRects();
  const g = await page.evaluate(() => {
    const t = document.querySelector('.pg-grid'), head = t && t.querySelector('tr');
    const bench = [...t.querySelectorAll('tr')].find((tr) => tr.querySelector('input.pg-cell') && /bench/i.test(tr.innerText || ''));
    const ins = bench ? [...bench.querySelectorAll('input.pg-cell')] : [];
    const r = (e) => { const b = e.getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; };
    // The edited cell, cut to what its scroller shows.
    const sc = document.querySelector('.pg-grid-scroll'), clip = sc ? r(sc) : { x0: 0, y0: 0, x1: innerWidth, y1: innerHeight };
    const w3 = ins[2] && r(ins[2]);
    if (w3) { w3.x0 = Math.max(w3.x0, clip.x0); w3.x1 = Math.min(w3.x1, clip.x1); }
    return { table: r(t), head: r(head), w3, bench: bench && r(bench), scroll: clip };
  });
  let c;
  if (inspector) {
    // The grid pane and the inspector: from the pane's left edge to the frame's right edge.
    const list = await box(() => document.getElementById('dkPbList'));
    const x = Math.max(list ? list.x1 : 0, g.scroll.x0 - 16);
    c = snap('3 week', ink, { x, w0: W - x - 30, w1: W - x, y0: 0, y1: 24, aspect: 16 / 10, widest: true });
  } else {
    // A single-column builder: name + week 2 + week 3, from the week header down.
    const x = g.table.x0 - 8;
    c = snap('3 week', ink, { x, w0: g.w3.x1 + 1 - x, w1: g.w3.x1 + 1 - x + 60, y0: g.head.y0 - 30, y1: g.head.y0 - 1, aspect: 16 / 10 });
  }
  // The ring: the inspector's Written line (week 3, just edited), or the edited cell itself.
  const written = inspector ? await box(() => {
    const ctx = document.getElementById('deskCtx');
    const label = ctx && [...ctx.querySelectorAll('*')].find((e) => e.children.length === 0 && /^\s*Written\s*$/.test(e.textContent || ''));
    let row = label;
    while (row && row.parentElement && row.getBoundingClientRect().width < ctx.getBoundingClientRect().width * 0.6) row = row.parentElement;
    return row;
  }) : null;
  crops[3] = Object.assign(frac(c), ring(written || g.w3, written ? 4 : 2));
}
await shoot('week');
// Phone: weeks 1 and 4 folded away, the name column narrowed: name, week 2 (written over
// lifted) and week 3 (being edited), header to the bench row.
await page.addStyleTag({ content: [
  '.pg-grid tr > :nth-child(2), .pg-grid tr > :nth-child(5), .pg-grid tr.pg-fold { display: none !important; }',
  '.pg-grid { min-width: 0 !important; width: max-content !important; }',
  '.pg-grid tbody th, .pg-grid .pg-corner { min-width: 0 !important; width: 96px !important; max-width: 96px !important; white-space: normal !important; line-height: 1.25; padding-top: 6px !important; padding-bottom: 6px !important; }'
].join('\n') });
// Fold away the days before bench day, so the header sits right above it.
await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.pg-grid tbody tr')];
  const k = rows.findIndex((tr) => tr.classList.contains('pg-day') && /bench/i.test(tr.innerText || ''));
  rows.slice(0, Math.max(0, k)).forEach((tr) => tr.classList.add('pg-fold'));
});
await page.evaluate(() => { const sc = document.querySelector('.pg-grid-scroll'); if (sc) sc.scrollLeft = 0; });
await settle(400);
{
  const ink = await inkRects();
  const g = await page.evaluate(() => {
    const t = document.querySelector('.pg-grid'), head = t.querySelector('tr');
    const bench = [...t.querySelectorAll('tbody tr')].find((tr) => tr.querySelector('input.pg-cell') && /bench/i.test(tr.innerText || ''));
    const vis = [...bench.querySelectorAll('input.pg-cell')].filter((i) => i.offsetParent);
    const r = (e) => { const b = e.getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; };
    return { table: r(t), head: r(head), bench: r(bench), last: r(vis[vis.length - 1]) };
  });
  // Name, week 2 (written over lifted) and week 3 (being edited); header to the bench row.
  const x = g.table.x0;
  await shootPhone('week', snap('3 week m', ink, { x, w0: g.last.x1 + 1 - x, y0: g.head.y0, h0: g.bench.y1 - g.head.y0 + 1, h1: g.bench.y1 - g.head.y0 + 12 }));
}

// 4. Back to Today, E: done, the next athlete opens.
await page.keyboard.press('Escape');
await settle(300);
await page.evaluate(() => { const t = [...document.querySelectorAll('.sidebar-tab, [data-go]')].find((b) => /^\s*Today/.test(b.textContent || '')); if (t) t.click(); });
await settle(1200);
await page.evaluate(() => scrollTo(0, 0));
await page.mouse.click(5, 450);
const marcus = page.locator('#deskToday .dk-qrow', { hasText: 'Marcus' }).first();
if (await marcus.count()) { await marcus.click(); await settle(400); }
await key('e', 1, 700);
await blur();
await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
if (process.env.DEBUG) { await page.screenshot({ path: join(TMP, 'dbg-done.png') }); console.log(await page.evaluate(() => { const e = document.elementFromPoint(254, 540); return e ? e.outerHTML.slice(0, 200) + ' | ' + (e.parentElement && e.parentElement.className) : 'none'; })); }
{
  const ink = await inkRects();
  if (process.env.DEBUG) console.log('ink rows', JSON.stringify(ink.filter((r) => r[0] < 540 && r[1] > 470 && r[3] < 620).map((r) => r.map(Math.round))));
  const c = await todayCrop('4 done', ink);
  crops[4] = Object.assign(frac(c), ring(await box(() => document.querySelector('.dk-progress-text')), 6));
  const { q, c: centre } = await cols();
  const sel = await box(() => document.querySelector('#deskToday .dk-qrow.is-sel'));
  await shootPhone('done', snap('4 done m', ink, { x: q.x0, w0: centre.x0 - q.x0, y0: 0, h0: sel.y1 + 4, h1: sel.y1 + 40 }));
}
await shoot('done');

// 5. E until All caught up.
for (let guard = 0; guard < 25; guard++) {
  const done = await page.evaluate(() => !!document.querySelector('.dk-caught') && !document.querySelector('#deskToday .dk-qrow.is-sel[data-lane="q"]'));
  if (done && await page.evaluate(() => /All caught up/.test(document.body.innerText))) break;
  await key('e', 1, 220);
}
await settle(3600); // let the undo toast leave
{
  const ink = await inkRects();
  const { q } = await cols();
  // The ring, the title, the line under it and its button (not the who-trained table).
  const caught = await box(() => { const t = document.querySelector('.dk-done-title'); const p = t && t.parentElement; return p ? [...p.children].filter((e) => !e.classList.contains('dk-sec') && e.getBoundingClientRect().height < 120) : [t]; });
  const c = snap('5 caught', ink, { x: q.x0, w0: caught.x1 + 28 - q.x0, w1: caught.x1 + 220 - q.x0, y0: 0, y1: 12, aspect: 16 / 10 });
  crops[5] = Object.assign(frac(c), ring(caught, 14));
  await shootPhone('caught', snap('5 caught m', ink, { x: caught.x0 - 40, w0: caught.x1 - caught.x0 + 80, w1: caught.x1 - caught.x0 + 120, y0: caught.y0 - 28, y1: caught.y0 - 20, h0: caught.y1 - caught.y0 + 50, h1: caught.y1 - caught.y0 + 80 }));
}
await shoot('caught');

await browser.close();

// ---- Write the crops into index.html --------------------------------------------------------
const idxPath = join(SITE, 'index.html');
let html = readFileSync(idxPath, 'utf8');
for (const [beat, c] of Object.entries(crops)) {
  const re = new RegExp('(data-crop="' + beat + '"[^>]*?style=")[^"]*(")');
  if (!re.test(html)) { console.log('beat', beat, 'no data-crop element in index.html'); continue; }
  const ringVars = c.hx != null ? ';--hx:' + c.hx + ';--hy:' + c.hy + ';--hw:' + c.hw + ';--hh:' + c.hh : '';
  html = html.replace(re, '$1--cx:' + c.x + ';--cy:' + c.y + ';--cz:' + c.z + ringVars + '$2');
}
for (const [name, s] of Object.entries(phone)) {
  const re = new RegExp('(<source media="\\(max-width: 600px\\)" srcset="site-img/desk-' + name + '-m\\.webp")[^>]*>', 'g');
  html = html.replace(re, '$1 width="' + s.w + '" height="' + s.h + '">');
}
writeFileSync(idxPath, html);
console.log('crops', JSON.stringify(crops));
if (errors.length) console.log('[desk page errors]', errors.join(' | '));
if (failures.length) { console.log('Crops that still cut text:', failures.join(', ')); process.exitCode = 1; }
