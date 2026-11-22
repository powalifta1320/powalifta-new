// The coach site's import screen in a real browser: pasted cells, a real .xlsx workbook, a Google Sheets link (the
// server function mocked), a column put right, a row re-marked, a name matched, and the save as a template and into a
// lifter's block. Every result is read from what the page stored.
// Needs a server on the repo root and playwright-core with a Chromium, like test/preview-editor.browser.mjs:
//   python3 -m http.server 4320 --bind 127.0.0.1 &
//   CHROME_PATH=… node test/preview-import.browser.mjs [outDir for pictures]
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch (e) { console.log('preview-import: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(0); }
const OUT = process.argv[2] || ''; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.env.BASE || 'http://127.0.0.1:4320').replace(/\/$/, '');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const shot = async (p, name) => { if (OUT) await p.screenshot({ path: path.join(OUT, name) }); };

// A real three-tab workbook, written with the vendored SheetJS the page itself reads with: a training log (which must
// be refused), a programme with weeks across, and a table of maxes.
const sandbox = vm.createContext({ console }); sandbox.window = sandbox; sandbox.self = sandbox;
for (const f of ['import-lib-fflate.js', 'import-lib-xlsx.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
const X = sandbox.XLSX, wb = X.utils.book_new();
X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Date', 'Exercise', 'Set 1 Weight', 'Set 1 Reps', 'Set 2 Weight', 'Set 2 Reps'], ['05/10/2026', 'Squat', 160, 5, 165, 5], ['05/10/2026', 'Bench', 105, 5, 105, 5]]), 'Training log');
X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Exercise', 'Week 1', 'Week 2', 'Week 3', 'Week 4'], ['Day 1 Squat and bench'], ['Squat', '1x3 @8, 3x5 75%', '1x2 @8, 3x4 78%', '1x1 @8.5, 3x3 82%', '3x3 70% @6'], ['Bench', '4x6 72.5%', '4x5 75%', '4x4 80%', '3x5 67.5%'],
  ['Barbell Row', '4x8 2RIR', '4x8 2RIR', '4x8 1RIR', '3x8 3RIR'], ['Day 2 Deadlift'], ['Deadlift', '1x3 @8, 2x3 75%', '1x2 @8, 2x3 78%', '1x1 @8.5, 2x2 82%', '2x3 70% @6'], ['Paused Bench', '4x5 @7', '4x4 @7.5', '4x3 @8', '3x4 @6'], ['Leg Curl', '3x12', '3x12', '3x10', '2x12']]), 'Block 3');
X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([['Lift', 'Max (kg)'], ['Squat', 190], ['Bench', 125], ['Deadlift', 225]]), 'Maxes');
const XLSX_BYTES = Buffer.from(X.write(wb, { type: 'array', bookType: 'xlsx' }));
const book = path.join(os.tmpdir(), 'powa-import-test-' + process.pid + '.xlsx'); fs.writeFileSync(book, XLSX_BYTES);

const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: OUT ? 2 : 1, serviceWorkers: 'block', colorScheme: 'dark' });
await ctx.route(/supabase\.co|plausible\.io/, (r) => r.abort('blockedbyclient'));
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra != null && extra !== '' ? '  (' + extra + ')' : '')); };
const sum = async () => (await p.locator('.im2-sum').innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const text = async (sel) => (await p.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
const openImport = async () => {
  await p.evaluate(() => { const b0 = document.querySelector('[data-import]'); if (b0) b0.click(); });
  await p.waitForTimeout(350);
  if (!(await p.locator('dialog.sheet.is-import[open]').count())) { await p.locator('[data-prog-menu]').first().click(); await p.waitForTimeout(250); await p.locator('.pop .mi', { hasText: 'Import' }).first().click(); await p.waitForTimeout(350); }
};

await p.goto(BASE + '/coach-preview/desk/programs.html?theme=dark&reset=1#id=demo-d6&week=5', { waitUntil: 'load' }); await p.waitForTimeout(1000);
await openImport();
ok('Import opens its own screen with three ways in', await p.locator('dialog.sheet.is-import[open]').count() === 1 && await p.locator('[data-im-src]').count() === 3);
ok('it says plainly that not every sheet reads', /you will be told, and nothing is imported/i.test(await text('.im2-lede')));

// 1. pasted cells: weeks across, day rows, a top set with its back-offs in one cell
const tsv = ['Exercise\tWeek 1\tWeek 2\tWeek 3', 'Day 1 Squat\t\t\t', 'Comp SQ\t1x3 @8, 3x5 75%\t1x2 @8, 3x4 78%\t1x1 @8.5', 'Kang squat\t3x8\t3x8\t3x30s', 'Day 2 Bench\t\t\t', 'CGBP\t4x6 @7\t4x5 @7.5\t4x4 @8'].join('\n');
await p.locator('#im2-paste').fill(tsv); await p.waitForTimeout(500);
ok('pasted cells are read at once: lines, days and weeks counted', /4 lines on 2 days over 3 weeks/.test(await sum()), await sum());
ok('the coach’s sheet is shown with what each column was read as', (await p.locator('.im2-role').first().inputValue()) === 'exercise' && (await p.locator('.im2-role').nth(1).inputValue()) === 'cell');
ok('a set it cannot read is said, with its own text and row', /1 set could not be read/.test(await sum()) && /3x30s/.test(await text('.im2-box')), (await text('.im2-box')).slice(0, 90));
ok('and marked in the sheet', await p.locator('.im2-t td.is-bad').count() === 1);
ok('a name the library does not know is listed to be matched', /Kang squat/.test(await text('.im2-res')) && await p.locator('[data-im-name]').count() === 1);
await shot(p, 'import-1-pasted.png');
// match it through the picker
await p.locator('[data-im-name]').click(); await p.waitForTimeout(250);
await p.keyboard.type('good mor'); await p.waitForTimeout(150); await p.keyboard.press('Enter'); await p.waitForTimeout(350);
ok('matched through the exercise picker, it reads as that exercise', await p.locator('[data-im-name]').count() === 0 && /Good morning/.test(await text('.im2-prev')));
// a row re-marked
await p.locator('.im2-kind', { hasText: 'Day' }).first().click(); await p.waitForTimeout(200);
await p.locator('.pop .mi', { hasText: 'Leave it out' }).click(); await p.waitForTimeout(300);
const heads = await p.locator('.im2-prev h4').allInnerTexts();
ok('a row marked Leave it out stops being a day\u2019s name', heads.join('|') === 'Day 1|Day 2 Bench', heads.join(' | '));
// a column switched off and on
await p.locator('.im2-role').nth(3).selectOption('skip'); await p.waitForTimeout(300);
ok('a column left out is left out of the programme', /over 2 weeks/.test(await sum()), await sum());
await p.locator('.im2-role').nth(3).selectOption('cell'); await p.waitForTimeout(300);
ok('and back in when it is put back', /over 3 weeks/.test(await sum()), await sum());

// 2. import as a template
const before = await p.evaluate(() => (PL.templates.list().data || []).length);
await p.locator('#im2-name').fill('Pasted block');
await p.locator('[data-im-to="tpl"]').click();
await p.locator('[data-im-go]').click(); await p.waitForTimeout(500);
const tpl = await p.evaluate(() => { const l = PL.templates.list().data || [], t = l.filter((x) => x.name === 'Pasted block')[0]; if (!t) return { n: l.length, names: l.map((x) => x.name) }; const got = PL.templates.get(t.id).data, g = BLOCK.from(got.json || got); return { n: l.length, weeks: g.weeks.length, names: g.rows.filter((r) => r.line === 0).map((r) => r.name), backs: g.rows.filter((r) => r.line > 0).length }; }).catch((e) => ({ err: String(e).slice(0, 200) }));
ok('Import saves it as a template: every week, lift and back-off line', tpl && tpl.n === before + 1 && tpl.weeks === 3 && (tpl.names || []).join() === 'Squat,Good morning,Close-grip bench' && tpl.backs === 1, JSON.stringify(tpl));
ok('the screen closes and says what was imported', await p.locator('dialog.sheet.is-import[open]').count() === 0 && /Imported 4 lines/.test(await text('.toasts')), await text('.toasts'));

// 3. a real workbook
await openImport();
await p.locator('[data-im-src="file"]').click(); await p.waitForTimeout(150);
await p.locator('#im2-file').setInputFiles(book); await p.waitForTimeout(2000);
ok('an .xlsx workbook is read in the browser, its tabs offered', await p.locator('.im2-tab').count() === 3, (await p.locator('.im2-tab').allInnerTexts()).join(', ') + ' ' + await text('.im2-err'));
ok('the tab that reads as a programme is the one shown', (await text('.im2-tab[aria-pressed="true"]')) === 'Block 3' && /8 lines on 2 days over 4 weeks/.test(await sum()), await sum());
await shot(p, 'import-2-workbook.png');
await p.locator('.im2-tab', { hasText: 'Training log' }).click(); await p.waitForTimeout(300);
ok('a tab that is a training log is refused in words, and nothing can be imported from it', /training log/i.test(await text('.im2-res')) && await p.locator('[data-im-go][disabled]').count() === 1);
await p.locator('.im2-tab', { hasText: 'Block 3' }).click(); await p.waitForTimeout(300);

// 4. into the lifter's block, from the week she is on
const cur = await p.evaluate(() => BLOCK.from(PL.programs.get('demo-d6').data).weeks.length);
await p.locator('[data-im-to="cur"]').click();
const label = await text('[data-im-to="cur"]');
await p.locator('[data-im-go]').click(); await p.waitForTimeout(700);
const into = await p.evaluate(() => { const g = BLOCK.from(PL.programs.get('demo-d6').data), c = g.weeks.findIndex((w) => w.state === 'next'); return { weeks: g.weeks.length, lifted: g.weeks.filter((w) => w.state === 'lifted').length, text: g.rows.filter((r) => r.lift === 'squat' && r.cells[g.weeks[c].uid]).map((r) => BLOCK.text(r.cells[g.weeks[c].uid])) }; });
ok('imported into the lifter’s block from the week named, lifted weeks untouched', /Mei.s block, from week \d/.test(label) && into.lifted === 3 && into.weeks >= cur && into.text.some((t) => /^\d @8/.test(t)), label + ' ' + JSON.stringify(into));

// 5. a Google Sheets link
await openImport();
await p.locator('[data-im-src="link"]').click(); await p.waitForTimeout(150);
await p.locator('#im2-link').fill('not a link'); await p.locator('[data-im-read]').click(); await p.waitForTimeout(200);
ok('something that is not a sheet’s link is said to be one', /not a Google Sheets link/.test(await text('.im2-err')));
await p.locator('#im2-link').fill('https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0');
await p.locator('[data-im-read]').click(); await p.waitForTimeout(900);
ok('on a copy with no server function it says so, and offers paste or a file', /runs on the live site|could not be reached|did not hand/i.test(await text('.im2-err')), (await text('.im2-err')).slice(0, 80));
let asked = null;
await p.route('**/api/sheet', async (r) => { asked = { method: r.request().method(), body: r.request().postData(), url: r.request().url() }; await r.fulfill({ status: 200, contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body: XLSX_BYTES }); });
await p.locator('[data-im-read]').click(); await p.waitForTimeout(1600);
ok('the link is read through the site’s own function, the sheet’s id in the body and never the address', asked && asked.method === 'POST' && /"id":"1Bxi/.test(asked.body) && !/1Bxi/.test(asked.url), JSON.stringify(asked).slice(0, 140));
ok('and the sheet reads like any workbook', /8 lines on 2 days over 4 weeks/.test(await sum()), await sum());
await shot(p, 'import-3-link.png');
await p.unroute('**/api/sheet');
await p.route('**/api/sheet', (r) => r.fulfill({ status: 403, contentType: 'application/json', body: '{"error":"private"}' }));
await p.locator('[data-im-read]').click(); await p.waitForTimeout(700);
ok('a sheet that is not shared says how to share it', /Anyone with the link/.test(await text('.im2-err')));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no script errors');
await b.close(); try { fs.unlinkSync(book); } catch (e) { /* gone */ }
process.exit(fail || errs.length ? 1 : 0);
