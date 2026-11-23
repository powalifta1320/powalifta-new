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
// the crimson is the send from the first moment; what stands in its way is asked when it is pressed, never its label
const cta0 = (await p.locator('[data-primary]').innerText()).trim();
ok('the crimson says Send, with the lifter’s note still open', cta0 === 'Send week 5 to Mei' && /Cap squats at RPE 7/.test(await p.locator('.hd-words').innerText()), cta0);
await p.locator('[data-primary]').click(); await p.waitForTimeout(300);
const ask = await p.locator('.pop').innerText().catch(() => '');
ok('pressed with the note open, the send asks once, with their words and both answers', /note is still open/.test(ask) && /Left knee/.test(ask) && /Cap squats at RPE 7/.test(ask) && /Send as written/.test(ask), ask.replace(/\s+/g, ' ').slice(0, 110));
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
ok('and nothing was sent', (await p.locator('[data-primary]').innerText()).trim() === 'Send week 5 to Mei' && !/sent to Mei/.test(await toast()));
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

// 7c. what the cold review of 22 Nov asked for: the pick bar, a right-click, values that do not read, the crimson
const sq = '.sv-day[data-sv-day="Squat Day"]';
await p.locator(sq + ' .sv-ex').first().hover(); await p.locator(sq + ' [data-sv-grip]').first().click(); await p.waitForTimeout(150);
ok('picked lifts get a bar of things to do with them', await p.locator('[data-sv-acts]').isVisible() && /1 lift picked/.test(await p.locator('[data-sv-status]').innerText()));
const sqBefore = (await week()).days['Squat Day'];
await p.locator('[data-sv-do="dup"]').click(); await p.waitForTimeout(400);
const sqDup = (await week()).days['Squat Day'];
ok('Duplicate on the bar duplicates the picked lift', sqDup.length === sqBefore.length + 1 && sqDup[1] === sqDup[0], sqDup.join(', '));
await p.locator(sq + ' .sv-ex').nth(1).hover(); await p.locator(sq + ' [data-sv-grip]').nth(1).click(); await p.waitForTimeout(150);
await p.keyboard.press('Backspace'); await p.waitForTimeout(400);
ok('⌫ deletes the picked lift, with an Undo', (await week()).days['Squat Day'].join() === sqBefore.join() && /deleted\. Undo/.test(await toast()), await toast());
await p.locator(sq + ' .sv-row').first().click({ button: 'right', position: { x: 60, y: 14 } }); await p.waitForTimeout(250);
const ctxMenu = await p.locator('[role=menu]').innerText().catch(() => '');
ok('a right-click on a line opens its menu', /Change the exercise/.test(ctxMenu) && /Duplicate/.test(ctxMenu), ctxMenu.replace(/\s+/g, ' ').slice(0, 90));
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
const eff = p.locator(sq + ' .sv-row [data-sv-field="effort"]').first(), effWas = await eff.inputValue(), sqText = (await line('Squat Day', sqBefore[0])).text;
await eff.click(); await eff.fill('abc8'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
const errText = await p.locator(sq + ' .sv-err').first().innerText().catch(() => '');
ok('a value that does not read is refused at its field, with the reason', !!errText && (await eff.getAttribute('aria-invalid')) === 'true' && (await line('Squat Day', sqBefore[0])).text === sqText, errText);
await p.keyboard.press('Escape'); await p.waitForTimeout(150);
ok('Esc puts back what was there', (await eff.inputValue()) === effWas && (await p.locator(sq + ' .sv-err').count()) === 0);
const cta = () => p.locator('[data-primary]').innerText();
ok('the crimson is the send, and says so the whole time', /^Send week 5 to Mei$/.test((await cta()).trim()), await cta());
const firstY = await p.evaluate(() => Math.round(document.querySelector('#wg .sv-row').getBoundingClientRect().top + document.querySelector('.wk').scrollTop));
ok('the first lift starts in the top third of the window', firstY < 300, 'y ' + firstY);
const y0 = await p.evaluate(() => Math.round(document.querySelector('.wb').getBoundingClientRect().top));
await p.locator(sq + ' .sv-row [data-sv-field="sets"]').first().focus(); await p.keyboard.press('Tab'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(500); await p.keyboard.press('ArrowDown'); await p.waitForTimeout(500);
const y1 = await p.evaluate(() => Math.round(document.querySelector('.wb').getBoundingClientRect().top));
ok('nothing jumps when the keys take the week, and the week keeps its name on screen', y0 === y1 && await p.locator('#wk-h').isVisible(), y0 + ' → ' + y1);

// 7d. from the second cold review of 22 Nov
const sets0 = p.locator(sq + ' .sv-row [data-sv-field="sets"]').first(), setsWas = await sets0.inputValue();
await sets0.click(); await sets0.fill(String(+setsWas + 1)); await p.keyboard.press('Tab'); await p.waitForTimeout(350);
const dh = await p.locator(sq + ' .sv-dh').boundingBox();
await p.mouse.click(dh.x + dh.width - 120, dh.y + dh.height / 2); await p.waitForTimeout(150);
await p.keyboard.press('Meta+z'); await p.waitForTimeout(450);
ok('⌘Z undoes the week’s last change wherever the last click was', (await p.locator(sq + ' .sv-row [data-sv-field="sets"]').first().inputValue()) === setsWas && !/Nothing to undo/.test(await toast()), await toast());
const s2 = p.locator(sq + ' .sv-row [data-sv-field="sets"]').first();
await s2.click(); await s2.fill('40'); await p.keyboard.press('Tab'); await p.waitForTimeout(350);
ok('a value that does not read, left behind, goes back to what is saved, and the page says so', (await p.locator(sq + ' .sv-row [data-sv-field="sets"]').first().inputValue()) === setsWas && /40.*was not saved.*Sets are 1 to 20/.test(await toast()), await toast());
const labels = await p.evaluate(() => [...document.querySelectorAll('#wg .sv-in')].map((x) => x.getAttribute('aria-label') || ''));
ok('every field says what it is to a screen reader', labels.length > 40 && labels.every((x) => x.length > 6) && /^Sets, /.test(labels[0]), labels[0]);
await p.locator(sq + ' [data-sv-rename]').click(); await p.waitForTimeout(250);
await p.locator('#sv-rn').fill('SBD Heavy'); await p.keyboard.press('Enter'); await p.waitForTimeout(450);
ok('a day keeps its own capitals', (await p.locator('.sv-day').first().locator('h3').innerText()).trim() === 'SBD heavy', await p.locator('.sv-day').first().locator('h3').innerText());

// 8. undo everything, back to where the week began (the week bar's own Undo button)
let n = 0;
for (; n < 60; n++) { const s = (await week()).snap; if (s === start.snap) break; await p.locator('[data-wk-undo]').click(); await p.waitForTimeout(180); }
const end = await week();
ok('Undo on the week bar walks every change back to the week as it opened', end.snap === start.snap, n + ' undos');

// 9. round 3 (23 Nov, the owner chose "A library of programs" and "One switch, three views"): Programs opens on a library of
// cards; a program needs no lifter and opens in the same editor; one switch for Simple · Week sheet · Block sheet
{
  const LIB = BASE + '/coach-preview/desk/programs.html?theme=dark&reset=1';
  const c2 = await b.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', colorScheme: 'dark' });
  await c2.route(/supabase\.co|plausible\.io/, (r) => r.abort('blockedbyclient'));
  await c2.addInitScript(() => { try { localStorage.setItem('powa-r6-side', 'fold'); localStorage.setItem('powa-r6-prog-mode', 'simple'); } catch (e) {} });
  const q = await c2.newPage();
  q.on('pageerror', (e) => errs.push(e.message.slice(0, 300)));
  q.on('console', (m) => { if (m.type() === 'error' && !/ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 300)); });
  await q.goto(LIB, { waitUntil: 'load' }); await q.waitForTimeout(900);
  const lib = await q.evaluate(() => ({ due: document.querySelectorAll('[data-group="due"] .pc').length, mine: document.querySelectorAll('[data-group="mine"] .pc').length, crimson: (document.querySelector('[data-primary]') || {}).textContent, lefts: [...new Set([...document.querySelectorAll('[data-group="due"] .pc')].map((x) => Math.round(x.getBoundingClientRect().left)))].length, filters: [...document.querySelectorAll('[data-lib-filter]')].map((x) => x.textContent) }));
  ok('Programs opens on a library: due this week first, your own programs beside them, three cards across at 1440', lib.due >= 9 && lib.mine >= 2 && lib.lefts === 3, JSON.stringify(lib));
  ok('its one crimson is New program, and its filter is one control of four', lib.crimson === 'New program' && lib.filters.join() === 'All,Due,Not assigned,Sent', lib.crimson + ' · ' + lib.filters.join(', '));
  const al = await q.evaluate(() => { const out = []; document.querySelectorAll('.pc-what').forEach((w) => { const t = w.querySelector('.tg'), s = w.querySelector('.pc-wt'); if (!t || !s) return; const base = (el) => { const r = document.createRange(); r.selectNodeContents(el); const rs = r.getClientRects(); return rs.length ? rs[rs.length - 1].bottom : el.getBoundingClientRect().bottom; }; out.push({ dy: Math.round(Math.abs(base(t) - base(s)) * 10) / 10, x: Math.round(t.getBoundingClientRect().left - w.closest('.pc').getBoundingClientRect().left) }); }); return out; });
  ok('every flag sits on the line of the words it goes with, in the same place on every card', al.length >= 3 && al.every((x) => x.dy <= 2) && new Set(al.map((x) => x.x)).size === 1, JSON.stringify(al.slice(0, 4)));
  // the sidebar: pinned, the page sits beside it; hovered open, it covers no card
  await q.mouse.move(30, 400); await q.waitForTimeout(600);
  const cov = await q.evaluate(() => { const sw = document.querySelector('.side').getBoundingClientRect().width, open = parseFloat(getComputedStyle(document.querySelector('.side .it .l')).opacity) > 0.5; const left = Math.min(...[...document.querySelectorAll('.pc, #ql-q, .lib-t')].map((x) => x.getBoundingClientRect().left)); return { open, sw: Math.round(sw), left: Math.round(left) }; });
  ok('with the sidebar hovered open, nothing on the library is under it', cov.open && cov.left >= cov.sw, JSON.stringify(cov));
  await q.mouse.move(900, 500); await q.waitForTimeout(400);
  // keys: the arrows walk the cards, Enter opens, Esc comes back
  await q.locator('.pc').first().focus(); await q.keyboard.press('ArrowRight'); await q.waitForTimeout(80);
  const k1 = await q.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-card'));
  await q.keyboard.press('Enter'); await q.waitForTimeout(700);
  const k2 = await q.evaluate(() => ({ hash: location.hash, h1: (document.querySelector('#pd #ttl') || {}).textContent }));
  ok('→ moves to the next card and Enter opens it in the editor', !!k1 && /id=/.test(k2.hash) && !!k2.h1, k1 + ' → ' + JSON.stringify(k2));
  await q.keyboard.press('Escape'); await q.waitForTimeout(150); await q.keyboard.press('Escape'); await q.waitForTimeout(500);
  ok('Esc goes back to the library, the card it opened in hand', (await q.locator('.lib').count()) === 1 && await q.evaluate((k) => document.activeElement && document.activeElement.getAttribute('data-card') === k, k1));
  // search over exercises
  await q.locator('#ql-q').fill('tricep'); await q.waitForTimeout(300);
  const found = await q.evaluate(() => [...document.querySelectorAll('.pc')].length);
  await q.locator('#ql-q').fill('zzqx'); await q.waitForTimeout(300);
  const none = await q.evaluate(() => document.querySelectorAll('.pc').length), said = /No program, lifter or exercise/.test(await q.locator('.lib').innerText());
  await q.locator('#ql-q').fill(''); await q.waitForTimeout(300);
  ok('the search finds programs by an exercise in them, and says when nothing matches', found >= 1 && none === 0 && said, found + ' found, ' + none + ' for nonsense');
  // New program: no lifter
  await q.locator('[data-primary]').click(); await q.waitForTimeout(400);
  await q.locator('#np-name').fill('Test base'); await q.locator('[data-np-days="4"]').click();
  await q.locator('[data-np-go]').click(); await q.waitForTimeout(700);
  const np = await q.evaluate(() => { const id = (location.hash.match(/prog=([^&]+)/) || [])[1], t = id && PL.templates.list().data.filter((x) => x.id === id)[0]; return { id, name: t && t.name, weeks: t && t.weeks, days: t && t.perWeek, crimson: document.querySelector('[data-primary]').textContent, simple: !!document.querySelector('.sv[data-simple]'), focus: document.activeElement && document.activeElement.className }; });
  ok('New program needs no lifter: named, 4 weeks, 4 days, it opens in the editor to write', !!np.id && np.name === 'Test base' && np.weeks === 4 && np.days === 4 && np.simple && /sv-qin/.test(np.focus || ''), JSON.stringify(np));
  ok('a program of nobody’s has Assign to a lifter… as its crimson', np.crimson === 'Assign to a lifter…', np.crimson);
  const lines = () => q.evaluate((id) => { const j = PL.templates.get(id).data, u = j.weeks[0].uid; return j.rows.filter((r) => r.cells[u]).map((r) => r.name + ' ' + BLOCK.text(BLOCK.cellOf(r.cells[u]))); }, np.id);
  await q.keyboard.type('squat 3x5 @8'); await q.keyboard.press('Enter'); await q.waitForTimeout(250);
  await q.keyboard.type('db row 3x10 30kg'); await q.keyboard.press('Enter'); await q.waitForTimeout(400);
  const l1 = await lines();
  ok('quick add writes the program’s day, kilos kept', l1.join() === 'Squat 3x5 @8,Dumbbell row 3x10 30kg', l1.join(' | '));
  await q.keyboard.press('Meta+z'); await q.waitForTimeout(300); const l2 = await lines();
  await q.keyboard.press('Meta+Shift+z'); await q.waitForTimeout(300); const l3 = await lines();
  ok('⌘Z and ⇧⌘Z walk a program’s edits too', l2.length === 1 && l3.length === 2, l2.length + ' → ' + l3.length);
  // one switch, three views
  const sw = await q.evaluate(() => ({ segs: [...document.querySelectorAll('.tb .seg')].length, labels: [...document.querySelectorAll('.tb [data-look]')].map((x) => x.textContent) }));
  ok('one switch in the toolbar: Simple · Week sheet · Block sheet', sw.segs === 1 && sw.labels.join() === 'Simple,Week sheet,Block sheet', JSON.stringify(sw));
  const seen = [];
  for (const v of ['block', 'week', 'simple']) { await q.locator('.tb [data-look="' + v + '"]').click(); await q.waitForTimeout(350); seen.push(await q.evaluate(() => (document.querySelector('#wg .sx-c') ? 'block' : document.querySelector('#wg .wg-line') ? 'week' : document.querySelector('.sv') ? 'simple' : '?') + ':' + document.querySelectorAll('.tb .seg').length)); }
  ok('one click to any view, and no second switch appears', seen.join() === 'block:1,week:1,simple:1', seen.join(', '));
  await q.keyboard.press('Alt+Digit3'); await q.waitForTimeout(300); const a3 = await q.evaluate(() => document.querySelector('.tb [data-look][aria-pressed="true"]').dataset.look);
  await q.keyboard.press('Alt+Digit1'); await q.waitForTimeout(300); const a1 = await q.evaluate(() => document.querySelector('.tb [data-look][aria-pressed="true"]').dataset.look);
  ok('⌥3 and ⌥1 switch the view from the keys', a3 === 'block' && a1 === 'simple', a3 + ', ' + a1);
  // its header: rename in place, Open a copy
  await q.locator('[data-prog-name]').click(); await q.waitForTimeout(150); await q.keyboard.press('Meta+a'); await q.keyboard.type('Test base A'); await q.keyboard.press('Enter'); await q.waitForTimeout(400);
  ok('the name is renamed where it is', (await q.locator('#pd #ttl').innerText()).trim() === 'Test base A' && await q.evaluate((id) => PL.templates.list().data.some((t) => t.id === id && t.name === 'Test base A'), np.id));
  await q.locator('#pd [data-prog-menu]').click(); await q.waitForTimeout(300);
  const pm = (await q.locator('.pop .mi').allInnerTexts()).map((x) => x.split('\n')[0]);
  ok('its menu holds weeks, days a week, a copy, Share, import, rename and delete, seven at most', pm.length <= 7 && ['Weeks', 'Days a week', 'Open a copy', 'Share', 'Rename'].every((x) => pm.indexOf(x) >= 0), pm.join(' | '));
  await q.locator('.pop .mi', { hasText: 'Open a copy' }).click(); await q.waitForTimeout(600);
  const cp = await q.evaluate(() => ({ hash: location.hash, h1: document.querySelector('#pd #ttl').textContent }));
  ok('Open a copy makes one of your programs and opens it', /prog=tpl-test-base-a-copy/.test(cp.hash) && /Test base A copy/.test(cp.h1), JSON.stringify(cp));
  // assign it to a lifter: their start, with it picked
  await q.locator('[data-primary]').click(); await q.waitForTimeout(400);
  await q.locator('#nb-q').type('hann'); await q.waitForTimeout(200); await q.keyboard.press('Enter'); await q.waitForTimeout(700);
  const sp = await q.evaluate(() => ({ crimson: document.querySelector('[data-primary]').textContent, pick: (document.querySelector('[data-start-opt][aria-checked="true"]') || {}).textContent || '' }));
  ok('Assign to a lifter… opens their start with this program picked', /Start Hannah/.test(sp.crimson) && /Test base A copy/.test(sp.pick), JSON.stringify(sp));
  // old links still land
  await q.goto(BASE + '/coach-preview/desk/programs.html?theme=dark#tab=templates&tpl=tpl-strength-block', { waitUntil: 'load' }); await q.waitForTimeout(800);
  const old = await q.evaluate(() => ({ h1: document.querySelector('#pd #ttl').textContent, grid: !!document.querySelector('#wg .sv, #wg .wg-line, #wg .sx-c'), hash: location.hash }));
  ok('an old template link opens the program in the editor, editable', /Strength Block/.test(old.h1) && old.grid && /prog=tpl-strength-block/.test(old.hash), JSON.stringify(old));
  await c2.close();
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no script errors');
await b.close();
process.exit(fail || errs.length ? 1 : 0);
