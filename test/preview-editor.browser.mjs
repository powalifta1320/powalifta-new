// The coach site's Programs editor, driven as a coach would in a real browser, every move checked in the saved programme
// (never only on the screen): change a lift that is already entered, find one by a short name, add one the library does
// not know, type and step numbers, drag a lift to another day, move and duplicate it from the keys, duplicate a day, and
// walk it all back with ⌘Z.
// Needs a server on the repo root and playwright-core with a Chromium (not repo dependencies, like test/uiscan.mjs):
//   python3 -m http.server 4320 --bind 127.0.0.1 &
//   CHROME_PATH=… node test/preview-editor.browser.mjs [outDir for pictures]
// BASE=http://127.0.0.1:4320 by default. Exit code 0 = every check passed and the page logged no error.
import fs from 'node:fs';
import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch (e) { console.log('preview-editor: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(0); }
const OUT = process.argv[2] || ''; if (OUT) fs.mkdirSync(OUT, { recursive: true });
const BASE = (process.env.BASE || 'http://127.0.0.1:4320').replace(/\/$/, '');
const URL = BASE + '/coach-preview/desk/programs.html?theme=dark&reset=1#id=demo-d6&week=5';
const shot = async (p, name) => { if (OUT) await p.screenshot({ path: path.join(OUT, name) }); };
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2, serviceWorkers: 'block', colorScheme: 'dark' });
await ctx.route(/supabase\.co|plausible\.io/, (r) => r.abort('blockedbyclient'));
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)));
p.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra != null && extra !== '' ? '  (' + extra + ')' : '')); };
// the stored programme: each day's exercise names this week, and a line's text
const week = () => p.evaluate(() => { const g = BLOCK.from(PL.programs.get('demo-d6').data), c = 4, w = g.weeks[c]; const o = {}; g.days.forEach((d) => { o[d.name] = g.rows.filter((r) => r.day === d.name && r.line === 0 && r.cells[w.uid]).map((r) => r.name); }); return { days: o, weeks: g.weeks.length, dayNames: g.days.map((d) => d.name), rows: g.rows.length, snap: JSON.stringify(g.rows.map((r) => [r.day, r.name, r.line, Object.keys(r.cells).length])) }; });
const line = (day, name) => p.evaluate(([d, n]) => { const g = BLOCK.from(PL.programs.get('demo-d6').data), c = 4, w = g.weeks[c], r = g.rows.findIndex((x) => x.day === d && x.name === n && x.line === 0); return r < 0 ? null : { text: g.rows[r].cells[w.uid] ? BLOCK.text(g.rows[r].cells[w.uid]) : null, lift: g.rows[r].lift, variant: g.rows[r].variant }; }, [day, name]);
const toast = async () => { await p.waitForTimeout(120); return (await p.locator('.toasts').innerText().catch(() => '')).replace(/\s+/g, ' ').trim(); };

await p.goto(URL, { waitUntil: 'load' }); await p.waitForTimeout(1000);
const start = await week();
ok('the week opens in Simple with every day on the page', await p.locator('.sv[data-simple]').count() === 1 && await p.locator('.sv-day').count() === 3, (await p.locator('.sv-row').count()) + ' lines');
await shot(p, '1-week.png');

// 1. change a lift that is already entered
await p.locator('.sv-day').first().locator('.sv-name', { hasText: 'Leg press' }).click();
await p.waitForTimeout(250);
ok('clicking a lift opens the picker', await p.locator('.pop.is-pick:popover-open').count() === 1);
await p.keyboard.type('hack');
await p.waitForTimeout(150);
await shot(p, '2-picker.png');
await p.keyboard.press('Enter'); await p.waitForTimeout(350);
let w1 = await week();
ok('the line is now the exercise picked, in the programme', w1.days['Squat Day'].includes('Hack squat') && !w1.days['Squat Day'].includes('Leg press'), w1.days['Squat Day'].join(', '));
ok('weeks already lifted keep the old exercise, and the words say so', /from week 5 on/i.test(await toast()), await toast());

// 2. short names and a name of the coach's own
await p.locator('.sv-day').nth(1).locator('.sv-name').nth(1).click(); await p.waitForTimeout(200);
await p.keyboard.type('cgbp'); await p.waitForTimeout(120);
ok('"cgbp" finds Close-grip bench first', (await p.locator('.pk-o[aria-selected="true"] .pk-n').innerText()) === 'Close-grip bench');
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
ok('Esc closes the picker and changes nothing', await p.locator('.pop.is-pick:popover-open').count() === 0 && (await week()).snap === w1.snap);

// 3. add an exercise the library does not know
await p.locator('.sv-day').nth(1).locator('[data-sv-add]').click(); await p.waitForTimeout(200);
await p.keyboard.type('tyre flip'); await p.waitForTimeout(120);
await p.keyboard.press('Enter'); await p.waitForTimeout(200);
ok('a new name asks once which lift it counts toward', /Which lift does Tyre flip count toward/.test(await p.locator('.pop.is-pick').innerText()));
await shot(p, '3-which-lift.png');
await p.locator('[data-pk-lift=""]').click(); await p.waitForTimeout(350);
let w2 = await week();
ok('it is added to the day, as an accessory with three tens', w2.days['Bench Day'].slice(-1)[0] === 'Tyre flip' && (await line('Bench Day', 'Tyre flip')).text === '3x10' && (await line('Bench Day', 'Tyre flip')).lift == null, JSON.stringify(await line('Bench Day', 'Tyre flip')));
ok('the new line’s Sets is in hand, ready to type over', await p.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-sv-field')) === 'sets');

// 4. type and step numbers
await p.keyboard.type('4'); await p.keyboard.press('Tab'); await p.keyboard.type('8'); await p.keyboard.press('Tab'); await p.keyboard.type('7'); await p.keyboard.press('Enter');
await p.waitForTimeout(250);
ok('typing sets, reps and RPE saves each', (await line('Bench Day', 'Tyre flip')).text === '4x8 @7', (await line('Bench Day', 'Tyre flip')).text);
const sets = p.locator('.sv-day').first().locator('.sv-row').first().locator('[data-sv-field="sets"]');
const before = await sets.inputValue();
await sets.focus(); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(600);
const stepsBefore = await p.evaluate(() => (PL.programs.history ? PL.programs.history('demo-d6') : null));
ok('three presses of ↑ are three more sets, saved as one change', await p.evaluate(() => { const g = BLOCK.from(PL.programs.get('demo-d6').data), w = g.weeks[4], r = g.rows.findIndex((x) => x.day === 'Squat Day' && x.line === 0 && x.cells[w.uid]); return g.rows[r].cells[w.uid].n; }) === Number(before) + 3, before + ' → ' + (Number(before) + 3));
await p.keyboard.press('Meta+z'); await p.waitForTimeout(300);
ok('⌘Z takes all three back in one step', await p.evaluate(() => { const g = BLOCK.from(PL.programs.get('demo-d6').data), w = g.weeks[4], r = g.rows.findIndex((x) => x.day === 'Squat Day' && x.line === 0 && x.cells[w.uid]); return g.rows[r].cells[w.uid].n; }) === Number(before));

// 5. drag a lift to another day
const w3 = await week();
const mover = w3.days['Squat Day'][w3.days['Squat Day'].length - 1];
const grip = p.locator('.sv-day').first().locator('.sv-ex').last().locator('[data-sv-grip]');
await grip.scrollIntoViewIfNeeded();
await p.locator('.sv-day').first().locator('.sv-ex').last().hover();
const gb = await grip.boundingBox();
const target = p.locator('.sv-day').nth(1).locator('.sv-ex').nth(1);
await p.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await p.mouse.down();
await p.mouse.move(gb.x + 30, gb.y + 40, { steps: 4 });
const tb = await target.boundingBox();
await p.mouse.move(tb.x + 200, tb.y + 4, { steps: 12 }); await p.waitForTimeout(120);
ok('a rule shows where the line will land while it is dragged', await p.locator('.sv-dropline').count() === 1 && await p.locator('.sv-ghost').count() === 1);
await shot(p, '4-dragging.png');
await p.mouse.up(); await p.waitForTimeout(400);
const w4 = await week();
ok('dropped on another day, it is on that day in the programme, second in line', w4.days['Bench Day'][1] === mover && !w4.days['Squat Day'].includes(mover), 'Bench day: ' + w4.days['Bench Day'].join(', '));
ok('nothing is left behind from the drag', await p.locator('.sv-ghost, .sv-dropline').count() === 0);

// 6. move it from the keys, duplicate it
await p.locator('.sv-day').nth(1).locator('.sv-ex').nth(1).locator('[data-sv-field="sets"]').first().focus();
await p.keyboard.press('Alt+Shift+ArrowUp'); await p.waitForTimeout(300);
const w5 = await week();
ok('⌥⇧↑ moves the line up one place', w5.days['Bench Day'][0] === mover, w5.days['Bench Day'].join(', '));
await p.locator('.sv-day').nth(1).locator('.sv-ex').first().locator('[data-sv-field="sets"]').first().focus();
await p.keyboard.press('Meta+d'); await p.waitForTimeout(300);
const w6 = await week();
ok('⌘D duplicates the line right under it', w6.days['Bench Day'][0] === mover && w6.days['Bench Day'][1] === mover, w6.days['Bench Day'].slice(0, 3).join(', '));

// 7. the day and the week: duplicate
await p.locator('.sv-day').first().locator('[data-sv-daymenu]').click(); await p.waitForTimeout(200);
await p.locator('.mi', { hasText: 'Duplicate the day' }).click(); await p.waitForTimeout(400);
const w7 = await week();
ok('Duplicate the day adds a day with the same lifts', w7.dayNames.includes('Squat Day 2') && JSON.stringify(w7.days['Squat Day 2']) === JSON.stringify(w7.days['Squat Day']), w7.dayNames.join(', '));
await shot(p, '5-after.png');

// 7b. pick lifts, copy them, paste them on another day; and rows copied out of a spreadsheet
const copyFrom = (sel) => p.evaluate((q) => { const el = document.querySelector(q), dt = new DataTransfer(); el.focus(); el.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return { text: dt.getData('text/plain'), lines: dt.getData('application/x-powa-lines') }; }, sel);
const pasteInto = (sel, data) => p.evaluate(([q, d]) => { const el = document.querySelector(q), dt = new DataTransfer(); if (d.text) dt.setData('text/plain', d.text); if (d.lines) dt.setData('application/x-powa-lines', d.lines); el.focus(); el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, [sel, data]);
const dl = '.sv-day[data-sv-day="Deadlift Day"]';
const grips = p.locator('.sv-day[data-sv-day="Squat Day"] [data-sv-grip]');
await p.locator('.sv-day[data-sv-day="Squat Day"] .sv-ex').first().hover(); await grips.first().click(); await p.waitForTimeout(150);
await p.locator('.sv-day[data-sv-day="Squat Day"] .sv-ex').nth(1).hover(); await grips.nth(1).click({ modifiers: ['Shift'] }); await p.waitForTimeout(150);
ok('a click on a grip picks the lift, shift picks the run to it', await p.locator('.sv-ex.is-picked').count() === 2 && /2 lifts picked/.test(await p.locator('[data-sv-status]').innerText()));
const clip = await copyFrom('.sv-day[data-sv-day="Squat Day"] .sv-name');
const copied = JSON.parse(clip.lines || '[]');
ok('⌘C copies the picked lifts with every line of theirs, and as plain rows too', copied.length >= 2 && clip.text.split('\n').length === copied.length && /\t/.test(clip.text), clip.text.replace(/\t/g, ' | ').replace(/\n/g, ' // '));
const dBefore = (await week()).days['Deadlift Day'];
await pasteInto(dl + ' .sv-row [data-sv-field="sets"]', clip); await p.waitForTimeout(450);
const dAfter = (await week()).days['Deadlift Day'];
const mains = copied.filter((x) => !x.line).map((x) => x.name);
ok('⌘V pastes them under the line in hand on another day', dAfter.length === dBefore.length + mains.length && dAfter.slice(1, 1 + mains.length).join() === mains.join(), dAfter.join(', '));
ok('with their sets as they were', (await line('Deadlift Day', mains[0])).text === copied[0].text, JSON.stringify(await line('Deadlift Day', mains[0])));
await pasteInto(dl + ' .sv-row [data-sv-field="sets"]', { text: 'Hack squat\t3x10 @8\nLeg extension\t3x15' }); await p.waitForTimeout(450);
const dSheet = (await week()).days['Deadlift Day'];
ok('rows copied out of a spreadsheet paste in as lifts', dSheet.includes('Hack squat') && dSheet.includes('Leg extension') && (await line('Deadlift Day', 'Hack squat')).text === '3x10 @8', dSheet.join(', '));
await p.locator(dl + ' .sv-row [data-sv-field="reps"]').first().focus();
await pasteInto(dl + ' .sv-row [data-sv-field="reps"]', { text: '7' }); await p.waitForTimeout(200);
ok('one value pasted into a field stays the field’s own business', (await week()).days['Deadlift Day'].length === dSheet.length);
await p.keyboard.press('Escape'); await p.waitForTimeout(100);

// 8. undo everything, back to where the week began
let n = 0;
for (; n < 40; n++) { const s = (await week()).snap; if (s === start.snap) break; await p.locator('.sv-chip').first().focus(); await p.keyboard.press('Meta+z'); await p.waitForTimeout(180); }
const end = await week();
ok('⌘Z walks every change back to the week as it opened', end.snap === start.snap, n + ' undos');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no script errors');
await b.close();
process.exit(fail || errs.length ? 1 : 0);
