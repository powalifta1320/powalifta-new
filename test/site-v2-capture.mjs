// site-v2-capture.mjs: the homepage's product stills (website v2), captured from the live demos.
//
// Re-run it whenever the desk (coach.html?demo=1) or the lifter app (athlete.html?demo=1) changes.
// Last fitted to the desk "our own" (desk-own, 2026-10-22: vault Specs/Desk + website v2 → Positioning):
// Today in plain sentences, the lifter page's session cards with next week beside them, and the
// Roster's live board. From the repo root, with any local server of this repo running:
//   node test/site-v2-capture.mjs [base]        base defaults to http://127.0.0.1:4193
//   node test/site-v2-capture.mjs --own [base]  only the #only and switch.html stills (no desk)
// Needs playwright-core (npm i -g playwright-core, or PLAYWRIGHT_CORE=<path to its index.mjs>; the
// headless shell path is below), cwebp, sips.
//
// Writes, into site-img/:
//   desk-hero.webp, desk-hero-1440.webp     Today, worst first (the hero laptop), 2160 and 1440 wide
//   desk-hero-m.webp                        the hero on phones: the Today list from its header to just
//                                           past the landing row, 2x
//   desk-table.webp, desk-table-1x.webp     #desk: Marcus Doyle's lifter page, cut to its sessions (2x
//                                           and 1x): week 2 as session cards, each set marked against
//                                           the RPE written, week 3 beside each set and the suggestion
//                                           from what he lifted (Drop to …, Hold)
//   desk-table-m.webp                       the same on phones: his Bench Day card, from a 1024-wide
//                                           desk (the cards fold "Next" under each set), 2x
//   desk-roster.webp, desk-roster-1440.webp #roster: the Roster's live board (the section shows a window)
//   app-train.webp                          the lifter's Train screen, 393x852 @2x, as the iPhone app
//   own-meet.webp                           #only: the meet-day board (meetday.js), flight A's openers marked
//   own-next.webp                           #only: the lifter's phone on meet day, "your next attempt"
//   own-review.webp                         #only: a form check under review, at the frame the coach marked
//   own-pain.webp                           #only: Tell your coach, the knee, how bad
//   own-ready.webp                          #only: How do you feel today? with last night's heart data
//   own-cut.webp                            #only: Make weight and the trend down to the class line
//   own-import.webp                         switch.html: a written log pasted into Import training history
// and og.jpg (1200x630, Today and the lifter it opens on; JPEG keeps it far under 300 KB).
//
// Then it rewrites, in index.html (and switch.html), the style on every element with data-cap="NAME" to the box of
// the thing it points at, as fractions of its still (--x --y --w --h), so the site's overlays (the
// hero's landing row and Log set press, the three numbered notes on the lifter page) and the phone
// crops follow the product when it moves:
//   land      the lifter row a logged set lands on (hero)
//   log       the Log set button on the phone (hero)
//   hero-m    the hero's window on phones: the Today list down past that row (--mx --my --mw --mh)
//   pin1-3    #desk's three notes: the set lifted over what was written (red), week 3's field beside
//             it, the suggestion (--x.. on the 1440 frame; --px --py --pw --ph on the 1024x640 frame
//             the phone still comes from)
//   table     the window #desk shows (--cx --cy --cw --ch); table-m its phone window (--mx.., 1024x640)
//   roster, roster-m   the window #roster shows of its still, on laptops and on phones
// Each lookup is by visible text where it can be, so it survives a re-skin; when one fails, the
// script says so and leaves that element's old values in place. After a re-skin, re-read the copy
// beside each still (index.html #desk, #roster) against what the new capture actually shows.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdirSync, unlinkSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

let chromium;
try { ({ chromium } = await import(process.env.PLAYWRIGHT_CORE || 'playwright-core')); }
catch (e) { console.log('site-v2-capture: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(1); }

const EXE = process.env.HOME + '/Library/Caches/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-mac-arm64/chrome-headless-shell';
// --own: only the #only stills (the meet-day board, a form check, the lifter's phone), not the desk's.
const OWN_ONLY = process.argv.includes('--own');
const BASE = (process.argv.slice(2).find((a) => !a.startsWith('--')) || 'http://127.0.0.1:4193').replace(/\/$/, '');
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
// pre '' writes --x --y --w --h; 'p' the phone frame's --px --py --pw --ph, merged onto the same name.
function frac(name, b, fw = W, fh = H, pre = '') {
  if (!b) { misses.push(name + (pre ? ' (' + pre + ')' : '')); console.log('  MISS', name, pre); return; }
  const f = (v) => +v.toFixed(4);
  caps[name] = Object.assign(caps[name] || {}, { ['--' + pre + 'x']: f(b.x / fw), ['--' + pre + 'y']: f(b.y / fh), ['--' + pre + 'w']: f(b.w / fw), ['--' + pre + 'h']: f(b.h / fh) });
}
// Writes the frame's window (x0, y0)-(x1, y1) on its own at the capture's 2x (and, with `one`, a 1x
// copy), and returns the still sizes for the <img> width/height.
const stills = {};
async function cut(p, name, file, pre, one) {
  const m = caps[name];
  if (!m) return;
  const clip = { x: Math.round(m['--' + pre + 'x'] * W), y: Math.round(m['--' + pre + 'y'] * H), width: Math.round(m['--' + pre + 'w'] * W), height: Math.round(m['--' + pre + 'h'] * H) };
  const png = join(TMP, file + '.png');
  await p.screenshot({ path: png, clip });
  stills[file] = { w: clip.width * 2, h: clip.height * 2 };
  console.log(file + '.webp', webp(png, join(IMG, file + '.webp')), clip.width * 2 + 'x' + clip.height * 2);
  if (one) { stills[file + '-1x'] = { w: clip.width, h: clip.height }; console.log(file + '-1x.webp', webp(png, join(IMG, file + '-1x.webp'), clip.width)); }
  try { unlinkSync(png); } catch (e) {}
}
// A free window from (x0, y0) to (x1, y1), CSS px of the frame. pre 'c' writes the desktop crop
// (--cx --cy --cw --ch), 'm' the phone one (--mx --my --mw --mh).
function win(name, x0, y0, x1, y1, pre) {
  const f = (v) => +v.toFixed(4);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(W, x1); y1 = Math.min(H, y1);
  caps[name] = { ['--' + pre + 'x']: f(x0 / W), ['--' + pre + 'y']: f(y0 / H), ['--' + pre + 'w']: f((x1 - x0) / W), ['--' + pre + 'h']: f((y1 - y0) / H) };
}

const errors = [];
const tableShots = {};
if (!OWN_ONLY) {
// ---- The desk -----------------------------------------------------------------------------
const desk = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'dark' });
await desk.addInitScript(() => {
  try {
    localStorage.setItem('powa-consent', 'essential');
    localStorage.setItem('powa-theme', 'dark');
    localStorage.setItem('powa-tour-coach-done', '1');
  } catch (e) {}
});
const page = await desk.newPage();
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

// 1. Today: the hero. The landing row is the lifter whose phone is in front of the laptop: the
// phone demo (athlete.html?demo=1) is Arjun Mehta's, and he is on the desk's Today list.
{
  frac('land', await find(page, /^\s*Arjun Mehta\s*$/, { minW: 280 }));
  // Phones: the Today list at reading size, from its own header ("Today · 0 of 14 handled", so
  // the worst-first top row is in it) down to one row past the landing row. It ends on a row
  // boundary (the row pitch is read off the landing row's next row), so no sliver of another row shows.
  const ln = caps.land;
  const head = await find(page, /^\s*Today\s*$/, { within: '.dash-main, main' });
  const pitch = !ln ? 66 : await page.evaluate(({ y, h }) => {
    // The landing row and the first list row that starts below it.
    const rows = [...document.querySelectorAll('button, a, li, [role="option"], [role="button"], [tabindex]')].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 260 && r.width < 420 && r.height > 40 && r.height < 120);
    const below = rows.filter((r) => r.top >= y + h - 2).sort((a, b) => a.top - b.top)[0];
    return below ? below.top - y : 70;
  }, { y: ln['--y'] * H, h: ln['--h'] * H });
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
  // og.jpg: Today and the lifter it opens on, 1200x630, as a JPEG (a PNG of this is ~700 KB).
  if (head) {
    const x = Math.max(0, head.x - 24), w = Math.min(W - x, 1000), h = Math.round(w * 630 / 1200);
    const ogPng = join(TMP, 'og.png');
    await page.screenshot({ path: ogPng, clip: { x, y: 0, width: w, height: h } });
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '84', '-z', '630', '1200', ogPng, '--out', join(SITE, 'og.jpg')], { stdio: 'ignore' });
    console.log('og.jpg', Math.round(statSync(join(SITE, 'og.jpg')).size / 1024) + ' KB');
    try { unlinkSync(ogPng); } catch (e) {}
  }
  try { unlinkSync(png); } catch (e) {}
}

// 2. The lifter page (#desk): Marcus Doyle from Today. His week 2 as session cards, each set's
// marker against the RPE written, week 3 beside each set, and a suggestion from what he lifted. The
// three pins: the set he lifted over what was written (the red "+1.5" and the lifted set beside it),
// week 3's field on that row, and the row's suggestion. Found from the one red RPE gap on the page
// (its colour, not a class), then the input and the button on the same row.
const pinBoxes = (p) => p.evaluate(() => {
  const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();
  const red = (e) => { const m = getComputedStyle(e).color.match(/\d+/g).map(Number); return m[0] > 190 && m[1] < 140; };
  const gap = [...document.querySelectorAll('body *')].find((e) => /^\+\d+(\.\d+)?$/.test(own(e)) && red(e) && e.getBoundingClientRect().width > 0);
  if (!gap) return null;
  let row = gap.parentElement;
  while (row && !(row.querySelector('input') && row.querySelector('button'))) row = row.parentElement;
  if (!row) return null;
  const card = row.closest('article, section') || row.parentElement;
  const bx = (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, b: r.bottom, r: r.right }; };
  const chip = [...row.querySelectorAll('button')].find((x) => /\S/.test(x.innerText || '') && x.getAttribute('aria-disabled') !== 'true');
  // The lifted set and its gap: the union of what's drawn in that cell (the cell itself can span the row).
  const kids = [...gap.parentElement.children].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0);
  const u = { x: Math.min(...kids.map((r) => r.left)), y: Math.min(...kids.map((r) => r.top)), r: Math.max(...kids.map((r) => r.right)), b: Math.max(...kids.map((r) => r.bottom)) };
  const got = { x: u.x, y: u.y, w: u.r - u.x, h: u.b - u.y, r: u.r, b: u.b };
  return { got, input: bx(row.querySelector('input')), chip: chip ? bx(chip) : null, chipText: chip ? chip.innerText.replace(/\s+/g, ' ').trim() : '', card: bx(card) };
});
{
  if (!(await clickText(/^\s*Marcus Doyle\s*$/))) misses.push('lifter page (Marcus Doyle)');
  await settle(page, 800);
  await page.addStyleTag({ content: HIDE });
  await neutralCoach(page);
  await page.evaluate(() => { const a = document.activeElement; if (a && a.blur) a.blur(); });
  await settle(page, 300);
  const pb = await pinBoxes(page);
  if (pb) { frac('pin1', pb.got); frac('pin2', pb.input); frac('pin3', pb.chip); console.log('  suggestion on the red row:', pb.chipText); }
  else misses.push('pin1-3 (no red RPE gap on the lifter page)');
  // The window: from the "Week N, as they lifted it" heading down to the last session card.
  const headB = await find(page, /^\s*Week \d+, as they lifted it\s*$/);
  const last = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('article[aria-label]')].filter((e) => /Day$/.test(e.getAttribute('aria-label')) && e.getBoundingClientRect().height > 0);
    if (!cards.length) return null;
    const r = cards[cards.length - 1].getBoundingClientRect(), r0 = cards[0].getBoundingClientRect();
    return { bottom: r.bottom, left: r0.left, right: r0.right };
  });
  if (headB && last) win('table', last.left - 20, headB.y - 22, last.right + 20, last.bottom + 18, 'c');
  else misses.push('table window');
  await cut(page, 'table', 'desk-table', 'c', true);
  if (stills['desk-table']) { tableShots['desk-table'] = stills['desk-table']; tableShots['desk-table-1x'] = stills['desk-table-1x']; }
}
// The phone still: the same lifter page on a 1024x640 desk (16:10 like the laptop frame), where each
// card folds "Next" under its set. Only the red row's card, cut from its edge to just past the
// suggestion; for the shot the week-3 field is narrowed so the suggestion sits beside it.
{
  const FW = 1024, FH = 640;
  await page.setViewportSize({ width: FW, height: FH });
  await settle(page, 1200);
  await page.evaluate(() => {
    const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();
    const red = (e) => { const m = getComputedStyle(e).color.match(/\d+/g).map(Number); return m[0] > 190 && m[1] < 140; };
    const gap = [...document.querySelectorAll('body *')].find((e) => /^\+\d+(\.\d+)?$/.test(own(e)) && red(e) && e.getBoundingClientRect().width > 0);
    const card = gap && (gap.closest('article') || gap.parentElement);
    if (card) card.scrollIntoView({ block: 'center' });
  });
  await page.addStyleTag({ content: 'input[aria-label$=", week 3"],input[aria-label*=", week "]{flex:0 0 210px!important;width:210px!important;max-width:210px!important}' });
  await settle(page, 500);
  const pb = await pinBoxes(page);
  if (pb && pb.chip) {
    const f = (v) => +v.toFixed(4);
    const x0 = Math.max(0, pb.card.x), y0 = Math.max(0, pb.card.y), x1 = Math.min(FW, Math.max(pb.chip.r, pb.got.r) + 18), y1 = Math.min(FH, pb.card.b);
    caps['table-m'] = { '--mx': f(x0 / FW), '--my': f(y0 / FH), '--mw': f((x1 - x0) / FW), '--mh': f((y1 - y0) / FH) };
    frac('pin1', pb.got, FW, FH, 'p'); frac('pin2', pb.input, FW, FH, 'p'); frac('pin3', pb.chip, FW, FH, 'p');
    const png = join(TMP, 'desk-table-m.png'), clip = { x: Math.round(x0), y: Math.round(y0), width: Math.round(x1 - x0), height: Math.round(y1 - y0) };
    await page.screenshot({ path: png, clip });
    tableShots['desk-table-m'] = { w: clip.width * 2, h: clip.height * 2 };
    console.log('desk-table-m.webp', webp(png, join(IMG, 'desk-table-m.webp')), clip.width * 2 + 'x' + clip.height * 2);
    try { unlinkSync(png); } catch (e) {}
  } else misses.push('table-m (phone frame)');
  await page.setViewportSize({ width: W, height: H });
  await settle(page, 1200);
}

// 3. The Roster's live board (#roster): one row per lifter, live.
{
  await page.keyboard.press('Escape');
  await settle(page, 300);
  if (!(await clickText(/^\s*Roster\s*$/))) misses.push('roster nav');
  await settle(page, 600);
  const title = await find(page, /^\s*Roster\s*$/, { within: 'main' });
  const lifter = await find(page, /^\s*Lifter\s*$/), pain = await find(page, /^\s*Pain\s*$/, { within: 'main' });
  if (title && lifter) {
    // Laptops: the title line (who's training now) and the board from Lifter across to Pain.
    const x1 = pain ? pain.x + pain.w + 130 : lifter.x + 1000;
    win('roster', title.x - 24, title.y - 22, x1, title.y - 22 + (x1 - title.x + 24) * 0.63, 'c');
    // Phones: the title line, then names, this week's marks and readiness.
    const ready = await find(page, /^\s*Readiness\s*$/, { within: 'main' });
    const top = title.y - 18; // the title line too: who is training now
    const mx1 = ready ? ready.x + ready.w + 40 : lifter.x + 460;
    const mx0 = Math.min(title.x, lifter.x) - 22;
    win('roster-m', mx0, top, mx1, top + (mx1 - mx0) * 0.8, 'm');
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
} // !OWN_ONLY

// ---- What only POWALIFTA does (index.html #only) ----------------------------------------------
// The section under the roster: real stills of what a coach gets beyond the set that lands live
// (the hero already shows that). None of them is the coach desk itself, so a desk re-skin doesn't
// date them: the meet-day board (meetday.js) beside the lifter's "your next attempt", a form check
// under review (video-review.js), the lifter's morning readiness from Apple Health, making weight
// against the class line, and a pain report on its way to the coach. The phone stills are slices of
// the screen, cut to the one card (or sheet) the site's sentence is about. Every lookup is by
// visible text; a miss is reported and the old file is kept.
const ownShots = {};
async function ownStill(p, name, clip, resize) {
  if (!clip || clip.width < 40 || clip.height < 40) { misses.push(name); console.log('  MISS', name); return; }
  clip = { x: Math.max(0, Math.round(clip.x)), y: Math.max(0, Math.round(clip.y)), width: Math.round(clip.width), height: Math.round(clip.height) };
  const png = join(TMP, name + '.png');
  await p.screenshot({ path: png, clip });
  const w = resize || clip.width * 2;
  console.log(name + '.webp', webp(png, join(IMG, name + '.webp'), resize), w + 'x' + Math.round(clip.height * w / clip.width));
  ownShots[name] = { w, h: Math.round(clip.height * w / clip.width) };
  try { unlinkSync(png); } catch (e) {}
}
// The demo's placeholder names read as watermarks in a still: the account is "Head Coach", the
// lifter demo's own lifter "Jordan Reyes" (text only, in the page).
async function neutralNames(p) {
  await neutralCoach(p);
  await p.addStyleTag({ content: '.ai-launcher{display:none!important}' }); // the assistant's button floats over every screen
  await p.evaluate(() => {
    for (const e of document.querySelectorAll('body *')) for (const n of e.childNodes) {
      if (n.nodeType === 3 && /\bDemo Lifter\b/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace(/\bDemo Lifter\b/g, 'Jordan Reyes');
    }
  });
}
let mdState = null;
{
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2, serviceWorkers: 'block', reducedMotion: 'reduce', colorScheme: 'dark' });
  await ctx.addInitScript(() => {
    try { localStorage.setItem('powa-consent', 'essential'); localStorage.setItem('powa-theme', 'dark'); localStorage.setItem('powa-tour-coach-done', '1'); } catch (e) {}
  });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push('own: ' + e.message));
  // 1. The meet-day board, flight A's first round marked: each opener declared (Enter) and passed (G),
  // then the first second attempt. A laptop-narrow window (1100) keeps the board dense; the still
  // runs from the meet's name down past the board and the lifter-up card.
  await p.setViewportSize({ width: 1100, height: 720 });
  await p.goto(BASE + '/coach.html?demo=1');
  await settle(p, 3500);
  await p.mouse.click(5, 450);
  if (await p.evaluate(() => { if (typeof openMeetDayBoard !== 'function') return false; openMeetDayBoard('demo-md-1'); return true; })) {
    await settle(p, 1500);
    for (const k of ['Enter', 'g', 'Enter', 'g', 'Enter', 'g', 'Enter', 'g']) { await p.keyboard.press(k); await settle(p, 450); }
    await p.addStyleTag({ content: HIDE });
    await neutralNames(p);
    // The demo's save state reads "Saved · demo"; a real board says "All marks saved".
    await p.evaluate(() => { for (const e of document.querySelectorAll('body *')) for (const n of e.childNodes) if (n.nodeType === 3 && n.nodeValue.trim() === 'Saved · demo') n.nodeValue = 'All marks saved'; });
    await settle(p, 300);
    // The bottom of the board (the box round the "Lot" column head, at least a few rows tall) and of
    // the lifter-up card.
    const bottom = await p.evaluate(() => {
      const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();
      const climb = (t, minW, minH) => {
        let e = [...document.querySelectorAll('body *')].find((x) => own(x).startsWith(t) && x.getBoundingClientRect().width > 0);
        while (e && (e.getBoundingClientRect().width < minW || e.getBoundingClientRect().height < minH)) e = e.parentElement;
        return e ? e.getBoundingClientRect().bottom : 0;
      };
      return Math.max(climb('Lot', 600, 200), climb('First up', 300, 200));
    });
    if (bottom > 200) await ownStill(p, 'own-meet', { x: 0, y: 0, width: 1100, height: Math.min(720, bottom + 10) }, 2000);
    else misses.push('own-meet');
    mdState = await p.evaluate(() => localStorage.getItem('powa-md-demo-srv'));
  } else misses.push('own-meet (no meetday.js)');
  await p.setViewportSize({ width: W, height: H });
  // 2. A form check under review: the clip at the frame the coach marked (bar path, arrow, the angle).
  // A smaller window keeps the player's black side bars narrow.
  const VW = 900, VH = 860;
  await p.setViewportSize({ width: VW, height: VH });
  await p.goto(BASE + '/coach.html?demo=1');
  await settle(p, 3500);
  await p.mouse.click(5, 450);
  if (await p.evaluate(() => typeof openVideoReview === 'function' && openVideoReview('demo-fc-0'))) {
    await settle(p, 2500);
    const t = await p.evaluate(() => new Promise((res) => {
      const v = document.querySelector('video');
      if (!v) return res(null);
      v.addEventListener('seeked', () => res(v.currentTime), { once: true });
      v.currentTime = 2.85;
      setTimeout(() => res(v.currentTime), 3000);
    }));
    await settle(p, 800);
    await p.addStyleTag({ content: HIDE });
    await neutralNames(p);
    // Under the header, down to the scrubber: the clip with the marks, the controls, and the coach's
    // panel (what they judged, the drawings, the reply). The tool row stays out.
    const cut = await p.evaluate(() => {
      const v = document.querySelector('video'), sc = document.querySelector('input[type="range"]');
      if (!v) return null;
      const r = v.getBoundingClientRect(), s = sc && sc.getBoundingClientRect().height ? sc.getBoundingClientRect() : null;
      return { top: r.top - 16, bottom: (s ? s.bottom : r.bottom + 60) + 8 };
    });
    if (t != null && cut) await ownStill(p, 'own-review', { x: 0, y: Math.max(0, cut.top), width: VW, height: Math.min(VH, cut.bottom) - Math.max(0, cut.top) }, 1600);
    else misses.push('own-review');
  } else misses.push('own-review (no video-review.js)');
  await ctx.close();
}
// The lifter's phone, as the iPhone app (the same set-up as app-train above).
async function phoneCtx(height, init) {
  const ctx = await browser.newContext({ viewport: { width: 393, height }, deviceScaleFactor: 2, serviceWorkers: 'block', isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: 'dark' });
  await ctx.addInitScript((md) => {
    try {
      localStorage.setItem('powa-consent', 'essential'); localStorage.setItem('powa-theme', 'dark');
      if (md) localStorage.setItem('powa-md-demo-srv', md);
    } catch (e) {}
    window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {}, registerPlugin: () => new Proxy({}, { get: () => async () => ({}) }) };
  }, init || null);
  const p = await ctx.newPage();
  const cdp = await ctx.newCDPSession(p);
  try { await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, bottom: 34, left: 0, right: 0 } }); } catch (e) {}
  p.on('pageerror', (e) => errors.push('own phone: ' + e.message));
  return { ctx, p };
}
// The box of the closest ancestor of the element with this own text that is at least minW wide.
const boxOf = (p, re, minW) => find(p, re, { minW: minW || 300 });
{
  // 3. Readiness: Train before the first set, "How do you feel today?" with last night's heart data.
  const { ctx, p } = await phoneCtx(852);
  await p.goto(BASE + '/athlete.html?demo=1');
  await settle(p, 3500);
  await p.addStyleTag({ content: HIDE });
  await neutralNames(p);
  await settle(p, 300);
  const row = await boxOf(p, /^\s*How do you feel today\?\s*$/, 280);
  if (row) await ownStill(p, 'own-ready', { x: row.x, y: row.y, width: row.w, height: row.h }); // the card itself, to its edges
  else misses.push('own-ready');
  // 4. A pain report: Tell your coach → the knee → how bad.
  if (await p.evaluate(() => { if (typeof openPainSheet !== 'function') return false; openPainSheet({ phase: 'warmup', where: 'Before training' }); return true; })) {
    await settle(p, 900);
    const knee = await find(p, /^\s*L knee\s*$/, { up: 'button' });
    if (knee) { await p.mouse.click(knee.x + knee.w / 2, knee.y + knee.h / 2); await settle(p, 900); }
    await neutralNames(p);
    const sheet = await boxOf(p, /^\s*Tell your coach\s*$/, 360), foot = await find(p, /^\s*Niggle\s*$/);
    if (sheet && foot) await ownStill(p, 'own-pain', { x: 0, y: sheet.y, width: 393, height: foot.y + foot.h + 22 - sheet.y });
    else misses.push('own-pain');
  } else misses.push('own-pain');
  await ctx.close();
}
{
  // 5. Making weight: the Bodyweight screen scrolled so Make weight sits under the header, down to
  // the end of the trend (the class line), above the tab bar.
  const { ctx, p } = await phoneCtx(852);
  await p.goto(BASE + '/athlete.html?demo=1');
  await settle(p, 3500);
  await p.evaluate(() => { const t = document.querySelector('.sidebar-tab[data-tab="bodyweight"]'); if (t) t.click(); });
  await settle(p, 1500);
  await p.addStyleTag({ content: HIDE });
  const end = await p.evaluate(async () => {
    const own = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join('').trim();
    const at = (t) => [...document.querySelectorAll('body *')].find((e) => own(e) === t && e.getBoundingClientRect().width > 0);
    const mw = at('Make weight');
    if (mw) { window.scrollBy(0, mw.getBoundingClientRect().top - 150); await new Promise((r) => setTimeout(r, 600)); }
    let c = at('Trend'); while (c && !c.nextElementSibling) c = c.parentElement;
    const card = c && c.nextElementSibling;
    return mw && card ? { top: mw.getBoundingClientRect().top, bottom: card.getBoundingClientRect().bottom } : null;
  });
  await settle(p, 400);
  if (end) await ownStill(p, 'own-cut', { x: 0, y: end.top - 22, width: 393, height: Math.min(852, end.bottom + 18) - (end.top - 22) });
  else misses.push('own-cut');
  await ctx.close();
}
{
  // 7. switch.html: a coach bringing a lifter's history in, on the phone. A month of a written
  // training journal pasted into Import training history, read before anything is saved.
  const { ctx, p } = await phoneCtx(1000);
  await p.goto(BASE + '/coach.html?demo=1');
  await settle(p, 4000);
  if (await p.evaluate(() => { if (typeof openHistoryImport !== 'function') return false; openHistoryImport('demo-a1'); return true; })) {
    await settle(p, 1200);
    const journal = ['3 Feb 2026', 'Squat 170x5 @7, 175x5 @8, 175x5 @8.5', 'Bench 115x5 @8, 115x5 @8', '10 Feb 2026', 'Deadlift 210x3 @8, 220x2 @8.5', 'Squat 180x3 @8',
      '17 Feb 2026', 'Squat 185x3 @8.5, 180x4 @8', 'Bench 120x3 @8.5', '24 Feb 2026', 'Deadlift 225x2 @9', 'Bench 122.5x2 @9', '3 Mar 2026', 'Squat 190x2 @9'].join('\n');
    // The sheet's paste box: the visible textarea the import sheet itself holds.
    const filled = await p.evaluate((text) => {
      // The import sheet is the newest sheet: its textarea is the last one on the page.
      const t = [...document.querySelectorAll('.ui-sheet textarea, [role="dialog"] textarea, textarea.imp-text')].filter((x) => x.getBoundingClientRect().height > 0).pop();
      if (!t) return false;
      t.value = text; t.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }, journal);
    await settle(p, 1500);
    await p.addStyleTag({ content: HIDE });
    await neutralNames(p);
    await p.evaluate(() => { for (const t of document.querySelectorAll('textarea')) t.scrollTop = 0; });
    const sheet = await boxOf(p, /^\s*Import training history\s*$/, 360), go = await find(p, /^\s*Import \d+ sets?\b/, { up: 'button' });
    if (filled && sheet && go) await ownStill(p, 'own-import', { x: 0, y: sheet.y, width: 393, height: go.y + go.h + 20 - sheet.y });
    else misses.push('own-import');
  } else misses.push('own-import (no switch-kit.js)');
  await ctx.close();
}
{
  // 6. The lifter's phone on meet day: meet mode with "your next attempt" from the board above
  // (its state is handed over, so the phone and the board tell the same flight).
  const { ctx, p } = await phoneCtx(852, mdState);
  await p.goto(BASE + '/athlete.html?demo=1' + (mdState ? '' : '&meetday=1'));
  await settle(p, 3500);
  if (await p.evaluate(() => { if (typeof openMeetMode !== 'function') return false; openMeetMode(); return true; })) {
    await settle(p, 2500);
    // The bouncer may stop a heavy opener first (its own slab): take its advice, as a lifter would.
    const ok = await find(p, /^\s*Open at [\d.]+ ?kg\s*$/i, { up: 'button' });
    if (ok) { await p.mouse.click(ok.x + ok.w / 2, ok.y + ok.h / 2); await settle(p, 1500); }
    await p.addStyleTag({ content: HIDE });
    const slab = await p.evaluate(() => { const s = document.querySelector('.md-next-slab:not([hidden])'); if (!s) return null; const r = s.getBoundingClientRect(); return { y: r.top, h: r.height }; });
    const head = await find(p, /^\s*Meet day\s*$/);
    if (slab && head) await ownStill(p, 'own-next', { x: 0, y: head.y - 26, width: 393, height: slab.y + slab.h + 18 - (head.y - 26) });
    else misses.push('own-next (no board running on the phone)');
  } else misses.push('own-next');
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
  // The #only stills are cut to their story, so their sizes change with the product too.
  for (const [name, d] of Object.entries(ownShots)) html = html.replace(new RegExp('(src="site-img/' + name + '\\.webp" width=")\\d+(" height=")\\d+', 'g'), '$1' + d.w + '$2' + d.h);
  writeFileSync(file, html);
  console.log(page + ': ' + n + ' boxes written.');
}
if (misses.length) console.log('Not found (old values kept): ' + misses.join(', '));
if (process.env.DEBUG) console.log(JSON.stringify(caps));
if (errors.length) console.log('Page errors:\n  ' + errors.slice(0, 6).join('\n  '));
