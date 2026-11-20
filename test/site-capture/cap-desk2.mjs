// Sam's laptop on the NEW coach website (coach-preview/desk/, 1440 x 900 at 2x, dark; THEME=light for the light pictures),
// before and after Arjun's top set lands, for the homepage's opening and its Today chapter (mkimg.py desk2):
//   desk2-ov-before.png     Overview before the set (Training: 7 of 52 sessions)  -> desk2-before-* (the opening's laptop)
//   desk2-ov-after.png      Overview after it (8 of 52)                           -> desk2-now (the Training tile, laid over the
//                           opening's laptop as Log set is tapped), desk2-ov-* (the window's second screen), needs2-*, needs2-ph-*
//   desk2-since-after.png   Lifters, "Trained since you looked": 9, Arjun's row in -> desk2-live-* (the window), desk2-win-*
//   desk2-since-before.png  the same list a moment earlier: 8, no Arjun           -> desk2-was-list, desk2-was-pos (what the
//                           window showed before, faded away as the set lands)
// Why these screens. Arjun's own page cannot stand beside his phone: the new site's demo has him on Mon 9 Nov, week 1,
// 180 x 3, and works his squat out as 205.5 kg where the lifter app (and the homepage) says 228. "Trained since you looked"
// is the new site's own picture of a set landing: one line a lifter, what was written, an arrow, what was lifted and how
// it felt. The page opens it on its first lifter (Elena); nothing of Arjun's numbers is on screen but his row.
// One capture-time patch, in the demo's own data as it loads (kit/data.js is never edited; lib.mjs patchDemo did the same to
// app.js): Arjun's Squat Day top set (Mon 9 Nov, written 1 x 3 @8, 180) is his phone's, 182.5 x 5 at RPE 8 (after), or the
// day is not lifted yet (before). The new site works everything else out from that itself (the list, the counts, his
// numbers). Every fact the patch and the homepage rest on is checked: a changed demo stops the capture.
// The screens' own crimson (Go through the 11 who need you; Plan the cut...) is drawn as its quiet neighbour is (mute):
// the homepage's screen has its own.
// desk2.json: where everything is, in desk px (the window's hold, the ring round Arjun's row, the patches, the Needs you
// table row by row with its words, the views and cuts the homepage uses). mkimg.py prints them for index.html / home.js.
import { writeFileSync } from 'node:fs';
import { launch, kitCtx, kitPage, mute, CAP, THEME } from './lib.mjs';
const SET = { w: 182.5, r: 5, rpe: 8 };   // Arjun's phone: Squat Day, 182.5 kg x 5 at RPE 8 (lifter-train, lifter-logged)
const patch = (mode) => `
;(function (mode) {
  var D = window.DEMO, l = D && D.lifters.filter(function (x) { return x.id === 'demo-a1'; })[0];
  var d = l && l.program && l.program.weeks[0] && l.program.weeks[0].days[0], e = d && d.exercises[0], s = e && e.sets[0];
  if (!s || l.name !== 'Arjun Mehta' || d.name !== 'Squat Day' || d.date !== '2026-11-09' || e.lift !== 'squat' || e.variant !== 'Competition' || s.w !== 180 || s.r !== 3 || s.rpe !== 8 || s.felt !== 8 || s.done !== 1)
    throw new Error('site-capture: the demo changed (Arjun Mehta, Squat Day, Mon 9 Nov, top set 180 x 3 @8)');
  var top = l.logs.filter(function (x) { return x.d === '2026-11-09' && x.lift === 'squat' && x.w === 180 && x.r === 3 && x.rpe === 8; });
  if (top.length !== 1) throw new Error('site-capture: the demo changed (Arjun Mehta, the logged top set)');
  if (mode === 'after') { s.w = ${SET.w}; s.r = ${SET.r}; top[0].w = ${SET.w}; top[0].r = ${SET.r}; }
  else { d.exercises.forEach(function (x) { x.sets.forEach(function (q) { delete q.done; delete q.felt; delete q.on; }); }); d.done = 0; l.logs = l.logs.filter(function (x) { return x.d !== '2026-11-09'; }); }
  window.__capPatch = mode;
})(${JSON.stringify(mode)});`;
const b = await launch(); const errs = [];
const R = `(e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); }`;
const state = {};
for (const mode of ['before', 'after']) {
  const ctx = await kitCtx(b);
  await ctx.route(/\/coach-preview\/kit\/data\.js(\?.*)?$/, async (route) => {
    const r = await route.fetch(); const body = await r.text();
    if (body.indexOf('window.DEMO = ') < 0) throw new Error('site-capture: kit/data.js no longer sets window.DEMO');
    await route.fulfill({ response: r, body: body + patch(mode), headers: { ...r.headers(), 'content-type': 'text/javascript' } });
  });
  // --- Overview
  let p = await kitPage(ctx, 'overview', '', { errs });
  if (await p.evaluate(() => window.__capPatch) !== mode) throw new Error('site-capture: the patch did not run (' + mode + ')');
  if (!(await mute(p, '^Go through the \\d+ who need', '^Add a lifter'))) throw new Error('site-capture: the Overview\'s action changed');
  await p.waitForTimeout(250);
  const ov = await p.evaluate(`(() => { const R = ${R};
    const text = (e) => { if (!e) return null; const rg = document.createRange(); rg.selectNodeContents(e); return R(rg); };
    const T = (e) => (e ? e.innerText.replace(/\\s+/g, ' ').trim() : '');
    const tile = document.querySelector('#charts .ch'), card = document.querySelector('.sec.need .card'), cols = document.querySelector('#need-cols');
    const title = [...document.querySelectorAll('.sec.need h2, .sec.need .sec-h')].find((x) => /^Needs you/.test(T(x)));
    const rows = [...document.querySelectorAll('#need .lrow')].map((x) => { const k = [...x.children]; return { r: R(x), who: T(x.querySelector('.nm')), why: T(x.querySelector('.who')).replace(T(x.querySelector('.nm')), '').trim(), now: T(k[1]), fix: T(x.querySelector('.fix') || x.querySelector('.act')), parts: k.map((c) => ({ c: c.className, r: R(c), t: text(c) })) }; });
    return { tile: R(tile), tileText: T(tile), card: R(card), cols: R(cols), colsText: T(cols), title: R(title), titleText: T(title), rows, facts: T(document.querySelector('#facts')), tb: R(document.querySelector('header.tb')), scrollY: window.scrollY }; })()`);
  await p.screenshot({ path: CAP + 'desk2-ov-' + mode + '.png' });
  await p.close();
  // --- Lifters, Trained since you looked (the page's own first lifter open)
  p = await kitPage(ctx, 'lifters', 'f=since', { errs });
  const redOk = await mute(p, '^Plan the cut', '^Message$');
  await p.waitForTimeout(250);
  const since = await p.evaluate(`(() => { const R = ${R}; const T = (e) => (e ? e.innerText.replace(/\\s+/g, ' ').trim() : '');
    const list = document.querySelector('#list'), rows = [...document.querySelectorAll('#list .lr')].map((x) => ({ r: R(x), who: T(x.querySelector('.nm')).replace(/[ ,]+$/, ''), t: T(x) }));
    return { hash: location.hash, list: R(list), head: R(document.querySelector('#list .lh')), headText: T(document.querySelector('#list .lh')), rows, pos: R(document.querySelector('header.tb .pos')), posText: T(document.querySelector('header.tb .pos-n')), tb: R(document.querySelector('header.tb')), open: T(document.querySelector('main h1, #pd h1, .lt h1') || document.querySelector('h1')), sel: T(document.querySelector('#list .lr.is-sel, #list .lr[aria-current], #list .lr.on') || null) }; })()`);
  await p.screenshot({ path: CAP + 'desk2-since-' + mode + '.png' });
  await p.close(); await ctx.close();
  state[mode] = { ov, since, redOk };
}
const B = state.before, A = state.after, bad = (m, x) => { throw new Error('site-capture: ' + m + ': ' + JSON.stringify(x)); };
// --- what the homepage rests on
const num = (t) => Number((/Training .*?(\d+) of (\d+) sessions/.exec(t) || [])[1]);
if (!(num(A.ov.tileText) === num(B.ov.tileText) + 1)) bad('the Overview\'s Training count did not go up by one', [B.ov.tileText, A.ov.tileText]);
const aj = A.since.rows.filter((x) => x.who === 'Arjun Mehta');
if (aj.length !== 1 || !/Mon Squat Day: 1 × 5 @8 → 182\.5 × 5, felt 8$/.test(aj[0].t)) bad('Arjun\'s row is not his phone\'s set', A.since.rows);
if (B.since.rows.some((x) => x.who === 'Arjun Mehta') || B.since.rows.length !== A.since.rows.length - 1) bad('before, Arjun should not be in the list', B.since.rows);
if (!/^Trained since you looked 9$/.test(A.since.headText) || !/^Trained since you looked 8$/.test(B.since.headText) || A.since.posText !== '1 of 9' || B.since.posText !== '1 of 8') bad('the list\'s counts changed', [B.since.headText, A.since.headText, B.since.posText, A.since.posText]);
if (A.since.rows[0].who !== B.since.rows[0].who || !A.ov.rows.length) bad('the open lifter changed with the set', [A.since.rows[0], B.since.rows[0]]);
const WANT = [['Priya Shah', /^Pain on today.s check-in$/, /^Autumn Open today$/, /^Use Safe openers, ask Priya$/], ['Sarah Kim', /^Low back 6\/10 on deadlift$/, /^Twice in 7 days$/, /^Swap to block pulls @6$/], ['Mei Tanaka', /^Left knee tight on squats$/, /^2 days$/, /^Cap squats at RPE 7$/],
  ['Tom Boyle', /^0\.3 kg over, asks if OK$/, /^Autumn Open today$/, /^Reply to Tom$/], ['Nina Petrova', /^Can only train Thu and Sat$/, /^Double shifts$/, /^Approve Thu and Sat$/], ['Elena Rossi', /^1\.4 kg over the 57 kg class$/, /^In 12 days$/, /^Plan the cut$/]];
WANT.forEach((w, i) => { const r = A.ov.rows[i]; if (!r || r.who !== w[0] || !w[1].test(r.why) || !w[2].test(r.now) || !w[3].test(r.fix)) bad('Needs you, row ' + (i + 1) + ' changed (the homepage\'s six steps name these rows)', r); });
if (!/^Lifter Why now Next step$/.test(A.ov.colsText) || A.ov.scrollY !== 0) bad('the Needs you table changed', A.ov.colsText);
// --- the views and cuts (desk px)
const r1 = (v) => Math.round(v * 10) / 10;
const S = A.since, O = A.ov, rowsO = O.rows.slice(0, 6);
const hold = [r1(S.list[0] - 8), r1(S.tb[1] + S.tb[3]), 756, 576];                       // the window at rest: the list and the open lifter beside it
const ring = aj[0].r;                                                                    // the ring round Arjun's row
const wasList = [r1(S.list[0] - 4), r1(S.tb[1] + S.tb[3]), r1(S.list[2] + 8), r1(900 - (S.tb[1] + S.tb[3]))];   // the list a moment earlier
const wasPos = [r1(S.pos[0] - 6), r1(S.pos[1] - 4), r1(S.pos[2] + 12), r1(S.pos[3] + 8)];  // "1 of 8"
if (!(ring[0] >= hold[0] && ring[1] >= hold[1] && ring[0] + ring[2] <= hold[0] + hold[2] && ring[1] + ring[3] <= hold[1] + hold[3])) bad('Arjun\'s row is outside the window', { ring, hold });
// Needs you: the right edge of the first two columns' words (phones see the lifter and why now), the rows, their marks
const nowRight = Math.max(...O.rows.slice(0, 7).map((x) => x.parts[1].t[0] + x.parts[1].t[2]));
const fixLeft = Math.min(...O.rows.slice(0, 7).map((x) => x.parts[2].t[0]));
if (!(nowRight + 8 <= fixLeft)) bad('no gap between Why now and Next step for the phone\'s cut', { nowRight, fixLeft });
const X0 = r1(O.card[0] - 36);                                                           // the views start left of the card: room for the row numbers
const listWide = { x: X0, w: 780 }, listPhone = { x: X0, w: r1(nowRight + 8 - X0) };
const grp = rowsO.map((x) => ({ left: r1(O.card[0] + 6), top: x.r[1], w: r1(O.card[2] - 12), wp: r1(nowRight + 2 - (O.card[0] + 6)), h: x.r[3] }));
const mk = rowsO.map((x) => ({ left: r1(O.card[0] - 30), top: r1(x.r[1] + x.r[3] / 2 - 11) }));
// the list's own figure (the still, and phones without motion): from the section's title to under the sixth row
const top = r1(O.title[1] - 14), bottom = r1(rowsO[5].r[1] + rowsO[5].r[3] + 10);
const needs = [r1(O.card[0] - 8), top, r1(O.card[2] + 16), r1(bottom - top)], needsPh = [r1(O.card[0] - 8), top, r1(nowRight + 8 - (O.card[0] - 8)), r1(bottom - top)];
const pins = rowsO.map((x) => r1(x.r[1] + x.r[3] / 2 - top));
const tile = O.tile;                                                                     // the opening's laptop: the Training tile, after
const out = { theme: THEME, set: SET, hold, ring, wasList, wasPos, listWide, listPhone, grp, mk, needs, needsPh, pins, tile, nowRight, fixLeft,
  before: { training: B.ov.tileText, head: B.since.headText, pos: B.since.posText, rows: B.since.rows.map((x) => x.t) },
  after: { training: A.ov.tileText, head: A.since.headText, pos: A.since.posText, rows: A.since.rows.map((x) => x.t), open: A.since.open, facts: O.facts },
  needRows: O.rows.slice(0, 7).map((x) => ({ who: x.who, why: x.why, now: x.now, fix: x.fix, r: x.r })), card: O.card, title: O.title, muted: [state.before.redOk, state.after.redOk], errs };
writeFileSync(CAP + 'desk2.json', JSON.stringify(out, null, 1));
console.log('Training', B.ov.tileText.slice(0, 40), '->', A.ov.tileText.slice(0, 40));
console.log('since', B.since.headText, B.since.posText, '->', A.since.headText, A.since.posText, '| open:', A.since.open, '| muted', out.muted.join(','));
console.log('Arjun\'s row', ring.join(','), '|', aj[0].t);
console.log('hold', hold.join(','), '| wasList', wasList.join(','), '| wasPos', wasPos.join(','), '| tile', tile.join(','));
console.log('Needs you', O.facts, '| card', O.card.join(','), '| nowRight', nowRight, 'fixLeft', fixLeft);
out.needRows.forEach((x, i) => console.log(String(i + 1).padStart(2), x.r.join(','), '|', x.who, '|', x.why, '|', x.now, '|', x.fix));
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
