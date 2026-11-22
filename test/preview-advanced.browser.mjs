// The coach site's Programs page in Advanced, in a real browser: a click on a cell stays in Advanced (22 Nov: it used to
// flip the page to Simple), the Week grid changes a lifted line's exercise by typing and suggests short names, the line
// and week menus carry the new moves (change, duplicate, move to a day, copy and duplicate a week, insert a week where
// asked), and switching views leaves no listeners behind. Every result is read from the saved programme.
// Needs a server on the repo root and playwright-core with a Chromium, like test/preview-editor.browser.mjs:
//   python3 -m http.server 4320 --bind 127.0.0.1 &
//   CHROME_PATH=… node test/preview-advanced.browser.mjs
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch (e) { console.log('preview-advanced: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(0); }
const BASE = (process.env.BASE || 'http://127.0.0.1:4320').replace(/\/$/, '');
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1, serviceWorkers: 'block', colorScheme: 'dark' });
await ctx.route(/supabase\.co|plausible\.io/, (r) => r.abort('blockedbyclient'));
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
let pass = 0, fail = 0; const ok = (n, c, x) => { c ? pass++ : fail++; console.log((c ? 'ok   ' : 'FAIL ') + n + (x != null && x !== '' ? '  (' + x + ')' : '')); };
const names = () => p.evaluate(() => { const g = BLOCK.from(PL.programs.get('demo-d6').data), w = g.weeks[4]; return g.rows.filter((r) => r.day === 'Squat Day' && r.line === 0 && r.cells[w.uid]).map((r) => r.name); });
await p.goto(BASE + '/coach-preview/desk/programs.html?theme=dark&reset=1#id=demo-d6&week=5', { waitUntil: 'load' }); await p.waitForTimeout(1000);
await p.locator('.tb [data-mode="advanced"]').click(); await p.waitForTimeout(500);   /* as a coach does: the choice is kept */
ok('Advanced opens on the Week grid', await p.locator('#wg [role=grid], #wg .wg').count() >= 1 && await p.locator('.sv').count() === 0);
// type a new exercise into a lifted line's Exercise cell
const cell = p.locator('#wg .wg-k-ex[title="Leg press"]').first();
await cell.click(); await p.keyboard.press('F2'); await p.waitForTimeout(150);
await p.keyboard.press('Meta+a'); await p.keyboard.type('bss'); await p.waitForTimeout(250);
const sug = await p.locator('.wg-sug .wg-opt').allInnerTexts();
ok('typing "bss" in the cell suggests Bulgarian split squat', sug.includes('Bulgarian split squat'), sug.join(', '));
await p.keyboard.press('Enter'); await p.waitForTimeout(400);
const n1 = await names();
ok('a line with lifted weeks takes the new exercise from this week on (it used to be refused)', n1.includes('Bulgarian split squat') && !n1.includes('Leg press'), n1.join(', '));
// the line's menu
const more = p.locator('#wg [data-more]').nth(1);
await p.locator('#wg .wg-k-ex[title^="Paused squat"]').first().click({ button: 'right' }); await p.waitForTimeout(250);
const items = await p.locator('.pop .mi').allInnerTexts();
ok('the line’s moves carry Change the exercise, Duplicate and Move to another day', ['Change the exercise', 'Duplicate', 'Move to another day'].every((t) => items.some((i) => i.indexOf(t) === 0)), items.map((x) => x.split('\n')[0]).join(' | '));
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
// the week's menu
await p.evaluate(() => { document.querySelectorAll('#pd .wk, #pd, main').forEach((x) => { x.scrollTop = 0; }); }); await p.waitForTimeout(150); await p.locator('[data-week-menu]').first().click(); await p.waitForTimeout(250);
const wk = await p.locator('.pop .mi').allInnerTexts();
ok('the week’s moves carry Copy this week onto and Duplicate this week', wk.some((i) => /^Copy this week onto/.test(i)) && wk.some((i) => /^Duplicate this week/.test(i)), wk.map((x) => x.split('\n')[0]).join(' | '));
await p.locator('.pop .mi', { hasText: 'Duplicate this week' }).click(); await p.waitForTimeout(500);
const weeks = await p.evaluate(() => { const g = BLOCK.from(PL.programs.get('demo-d6').data); return { n: g.weeks.length, same: g.rows.every((r) => { const a = r.cells[g.weeks[4].uid], z = r.cells[g.weeks[5].uid]; return r.only || (!a && !z) || (a && z && BLOCK.text(a) === BLOCK.text(z)); }), hash: location.hash }; });
ok('Duplicate this week adds a copy as the next week and opens it', weeks.n === 7 && weeks.same && /week=6/.test(weeks.hash), JSON.stringify(weeks));
// insert a week before: it lands before, not at the end
await p.evaluate(() => { document.querySelectorAll('#pd .wk, #pd, main').forEach((x) => { x.scrollTop = 0; }); }); await p.waitForTimeout(150); await p.locator('[data-week-menu]').first().click(); await p.waitForTimeout(250);
await p.locator('.pop .mi', { hasText: 'Insert a week before' }).click(); await p.waitForTimeout(500);
const ins = await p.evaluate(() => { const g = BLOCK.from(PL.programs.get('demo-d6').data); return { n: g.weeks.length, empty: g.rows.every((r) => !r.cells[g.weeks[5].uid]), last: g.rows.some((r) => r.cells[g.weeks[7].uid]) }; });
ok('Insert a week before puts an empty week before this one (it used to go at the end)', ins.n === 8 && ins.empty && ins.last, JSON.stringify(ins));
// the Block grid, then back and forth: one grid's listeners at a time
const count = () => p.evaluate(() => window.__keyN);
await p.evaluate(() => { window.__keyN = 0; const add = document.addEventListener.bind(document), rem = document.removeEventListener.bind(document); document.addEventListener = (t, f, o) => { if (t === 'keydown' || t === 'paste' || t === 'copy') window.__keyN++; return add(t, f, o); }; document.removeEventListener = (t, f, o) => { if (t === 'keydown' || t === 'paste' || t === 'copy') window.__keyN--; return rem(t, f, o); }; });
for (let i = 0; i < 4; i++) { await p.locator('.tb [data-view="block"]').click(); await p.waitForTimeout(250); await p.locator('.tb [data-view="week"]').click(); await p.waitForTimeout(250); }
const leak = await count();
ok('switching Week and Block four times leaves no extra document listeners', leak <= 2, 'net listeners added: ' + leak);
await p.locator('.tb [data-view="block"]').click(); await p.waitForTimeout(400);
ok('the Block grid opens', await p.locator('#wg .sx, #wg [data-sheet], #wg').count() >= 1 && await p.locator('.sv').count() === 0);
await p.locator('.tb [data-mode="simple"]').click(); await p.waitForTimeout(400);
ok('back to Simple, the week still reads', await p.locator('.sv[data-simple] .sv-day').count() > 0);
console.log('\n' + pass + ' passed, ' + fail + ' failed'); console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no script errors');
await b.close();
process.exit(fail || errs.length ? 1 : 0);
