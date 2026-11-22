// Advanced on the coach site's Programs page, as a sheet (22 Nov, after a cold review called it "a weak Sheets copy"):
// the Week grid's gutter, whole-line cut and paste and line moves from the keys; the Block grid's one-line cells, six
// weeks across, a repaint after every write, the week bar's arrows, and a fill that carries a series on.
// Needs a server on the repo root and playwright-core with a Chromium (as test/preview-editor.browser.mjs):
//   python3 -m http.server 4320 --bind 127.0.0.1 &
//   CHROME_PATH=… node test/preview-grids.browser.mjs [outDir for pictures]
import fs from 'node:fs';
import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch (e) { console.log('preview-grids: playwright-core not installed.'); process.exit(0); }
const OUT = process.argv[2] || ''; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.env.BASE || 'http://127.0.0.1:4320').replace(/\/$/, '');
const URL = BASE + '/coach-preview/desk/programs.html?theme=dark&reset=1#id=demo-d6&week=5';
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 1, serviceWorkers: 'block', colorScheme: 'dark' });
await ctx.route(/supabase\.co|plausible\.io/, (r) => r.abort('blockedbyclient'));
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra != null && extra !== '' ? '  (' + extra + ')' : '')); };
const shot = async (name) => { if (OUT) await p.screenshot({ path: path.join(OUT, name) }); };
const day = (d) => p.evaluate((dn) => { const g = BLOCK.from(PL.programs.get('demo-d6').data), w = g.weeks[4]; return g.rows.filter((r) => r.day === dn && r.line === 0 && r.cells[w.uid]).map((r) => r.name); }, d);
const lifter = () => p.locator('#ttl').innerText();
const toast = async () => { await p.waitForTimeout(120); return (await p.locator('.toasts').innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); };
const open = async (view) => { await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(800); await p.locator('.tb [data-mode="advanced"]').click(); await p.waitForTimeout(350); await p.locator('.tb [data-view="' + view + '"]').click(); await p.waitForTimeout(450); };

// ---------------------------------------------------------------- the Week grid
await open('week');
const rowH = await p.evaluate(() => Math.round(document.querySelector('#wg .wg-line').getBoundingClientRect().height));
const shown = await p.evaluate(() => { const c = document.querySelector('.wk').getBoundingClientRect(); return [...document.querySelectorAll('#wg .wg-line')].filter((r) => { const x = r.getBoundingClientRect(); return x.top >= c.top && x.bottom <= c.bottom; }).length; });
ok('rows are a sheet’s height, and a laptop shows the week', rowH <= 32 && shown >= 10, rowH + ' px, ' + shown + ' lines in view');
const guts = p.locator('#wg .wg-line [data-gut]');
ok('every line has its number in a gutter', (await guts.count()) >= 10 && (await guts.first().innerText()).trim() === '1');
await guts.nth(3).click(); await p.waitForTimeout(150);
ok('a click on the gutter takes the whole line', (await p.locator('#wg .wg-line.is-whole').count()) === 1 && (await p.locator('#wg .wg-line.is-whole .wg-k-ex').innerText()).includes('Leg press'));
await guts.nth(4).click({ modifiers: ['Shift'] }); await p.waitForTimeout(150);
ok('shift takes the run of lines to it', (await p.locator('#wg .wg-line.is-whole').count()) === 2);
const sq0 = await day('Squat Day');
// ⌘X on whole lines: gone from the week, no shell; ⌘V puts them back under the line in hand
const clip = await p.evaluate(() => { const el = document.activeElement, dt = new DataTransfer(); el.dispatchEvent(new ClipboardEvent('cut', { clipboardData: dt, bubbles: true, cancelable: true })); return { text: dt.getData('text/plain'), html: dt.getData('text/html'), rows: dt.getData('application/x-powa-rows') }; });
await p.waitForTimeout(400);
const sq1 = await day('Squat Day'), nRows = () => p.evaluate(() => BLOCK.from(PL.programs.get('demo-d6').data).rows.length), rows0 = await nRows();
ok('⌘X on whole lines marks them to move; nothing is emptied and no shell is left', sq1.join() === sq0.join() && (await p.locator('#wg .wg-line.is-cut').count()) === 2 && /2 lines cut/.test(await toast()), await toast());
await p.locator('#wg .wg-k-ex[title^="Squat"]').first().click(); await p.waitForTimeout(150);
await p.evaluate((c) => { const el = document.activeElement, dt = new DataTransfer(); dt.setData('text/plain', c.text); dt.setData('text/html', c.html); dt.setData('application/x-powa-rows', c.rows); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, clip);
await p.waitForTimeout(450);
const sq2 = await day('Squat Day');
ok('⌘V moves them under the line in hand: the same lines, none copied', sq2.length === sq0.length && sq2[1] === 'Leg press' && sq2[2] === 'Hanging leg raise' && (await nRows()) === rows0 && (await p.locator('#wg .wg-line.is-cut').count()) === 0, sq2.join(', ') + ' · ' + rows0 + ' rows');
// ⌥⇧↓ moves the line in hand and never the lifter
await p.locator('#wg .wg-k-ex[title^="Squat"]').first().click(); await p.waitForTimeout(150);
const before = await day('Squat Day'), who = await lifter();
await p.keyboard.press('Alt+Shift+ArrowDown'); await p.waitForTimeout(400);
const after = await day('Squat Day');
ok('⌥⇧↓ moves the line down one place, and the lifter stays', after[0] === before[1] && after[1] === before[0] && (await lifter()) === who, after.join(', ') + ' · ' + await lifter());
await p.keyboard.press('Alt+Shift+ArrowUp'); await p.waitForTimeout(400);
ok('⌥⇧↑ moves it back', (await day('Squat Day')).join() === before.join());
await shot('grids-week.png');

// ---------------------------------------------------------------- the Block grid
await open('block');
const cols = await p.evaluate(() => { const c = document.querySelector('#wg').getBoundingClientRect(); return [...document.querySelectorAll('#wg .sx-wh')].filter((h) => { const x = h.getBoundingClientRect(); return x.left >= c.left && x.right <= c.right + 1; }).length; });
const bRow = await p.evaluate(() => Math.round(document.querySelector('#wg .sx-lr').getBoundingClientRect().height));
ok('six weeks sit across a laptop, one line a cell', cols >= 6 && bRow <= 32, cols + ' weeks, ' + bRow + ' px rows');
const dom = (r, c) => p.locator('#sxc-' + r + '-' + c).innerText().then((t) => t.replace(/\s+/g, ' ').trim());
const model = (r, c) => p.evaluate(([r0, c0]) => { const g = BLOCK.from(PL.programs.get('demo-d6').data), row = g.rows[r0], u = g.weeks[c0].uid; return row.cells[u] ? BLOCK.text(row.cells[u]) : ''; }, [r, c]);
const had = await model(4, 5);
await p.locator('#sxc-4-5').click(); await p.waitForTimeout(150); await p.keyboard.press('Delete'); await p.waitForTimeout(400);
ok('Delete clears the cell in the programme and on the screen', (await model(4, 5)) === '' && !/\d/.test(await dom(4, 5)), JSON.stringify(had) + ' → ' + JSON.stringify(await dom(4, 5)));
ok('and says so, with Undo', /Cleared 1 cell\. Undo/.test(await toast()), await toast());
const src = await model(3, 5);
await p.locator('#sxc-3-5').click(); await p.waitForTimeout(120);
const cp = await p.evaluate(() => { const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/plain'); });
await p.locator('#sxc-4-5').click(); await p.waitForTimeout(120);
await p.evaluate((t) => { const dt = new DataTransfer(); dt.setData('text/plain', t); document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, cp);
await p.waitForTimeout(400);
ok('a paste lands in the programme and the cell shows it at once', (await model(4, 5)) === src && /\d/.test(await dom(4, 5)), cp + ' → ' + await dom(4, 5));
await p.locator('#sxc-0-4').dblclick(); await p.waitForTimeout(200);
ok('the editor writes one set out, as the cell reads it', /^1x3 @8/.test(await p.locator('.sx-ed').inputValue()), await p.locator('.sx-ed').inputValue());
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
await p.locator('#sxc-0-4').click(); await p.waitForTimeout(120);
await p.locator('[data-wk-step="1"]').click(); await p.waitForTimeout(350);
const cur = await p.evaluate(() => (document.querySelector('#wg .sx-c.is-cur') || { id: '' }).id);
ok('the week bar’s arrow moves the week in hand in the Block view', cur === 'sxc-0-5' && /Week 6/.test(await p.locator('#wk-h').innerText()), cur + ', ' + await p.locator('#wk-h').innerText());
// a fill carries a series on; one week alone takes the coach's own step on a main lift
const series = await p.evaluate(() => {
  const l = DEMO.lifters.filter((x) => { const g = BLOCK.build(x); return g.weeks.length >= 4 && g.weeks.every((w) => w.state !== 'lifted') && g.rows.some((r) => r.lift === 'squat' && r.line === 0); })[0];
  const g = BLOCK.build(l), r = g.rows.findIndex((x) => x.lift === 'squat' && x.line === 0), c0 = g.weeks.findIndex((w, k) => !g.isRO(r, k));
  g.rows[r].prog = 'same'; g.set(r, c0, '3x5 100kg'); g.set(r, c0 + 1, '3x5 102.5kg');
  SHEET.fill(g, { r0: r, r1: r }, c0 + 1, c0 + 3, { c0: c0 });
  const a = [0, 1, 2, 3].map((k) => BLOCK.text(g.rows[r].cells[g.weeks[c0 + k].uid]));
  const acc = g.rows.findIndex((x) => !x.lift && x.line === 0 && x.cells[g.weeks[c0].uid]); g.rows[acc].prog = 'same'; g.set(acc, c0, '3x10 40kg');
  SHEET.fill(g, { r0: acc, r1: acc }, c0, c0 + 1, {});
  g.set(r, c0 + 1, '3x5 100kg'); SHEET.fill(g, { r0: r, r1: r }, c0 + 1, c0 + 2, {});
  return { a, acc: BLOCK.text(g.rows[acc].cells[g.weeks[c0 + 1].uid]), one: BLOCK.text(g.rows[r].cells[g.weeks[c0 + 2].uid]) };
});
ok('two weeks picked set the pace: 100, 102.5 carry on as 105, 107.5', series.a.join(' | ') === '3x5 100kg | 3x5 102.5kg | 3x5 105kg | 3x5 107.5kg', series.a.join(' | '));
ok('one week of a squat dragged on takes the coach’s own step; an accessory is copied', /102\.5kg$/.test(series.one) && /40kg$/.test(series.acc), series.one + ' · ' + series.acc);
await shot('grids-block.png');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no script errors');
await b.close();
process.exit(fail || errs.length ? 1 : 0);
