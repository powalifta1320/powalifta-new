// -> week2.png, week2.json: site-img/home/week2-*, week2-phone-* (mkimg.py week2).
// Next week on the NEW coach website (coach-preview/desk/programs.html, 1440 x 900 at 2x, dark; THEME=light for the light
// pictures): Marcus's week 3 as the page opens it for his job (programs.html#id=demo-d3 goes to week=3&row=change by itself):
// "4 changes to send", his bench "Last lifted, week 2: 152.5 x 3 @9.5" beside week 3's load, 145, the page's own selection on
// that cell. One real state: the new sheet shows what last week lifted and what next week says on the same line, and it has
// no "Take 1 suggestion" step (the rule's 145 is already an unsent change when the page opens), so there is no second picture.
// The sheet is scrolled inside its card, as a reader scrolls it: the page folds its own head away (the name moves into the
// top bar) and the whole of week 3 down to the bench day's back-offs fits the homepage's 10:7 frame.
// The page's crimson action, Send 4 changes to Marcus, is left out of the picture, its place kept: the homepage draws its
// own there (one crimson per screen). week2.json says where (desk px): the frame, the phone's narrower frame (no narrower
// window holds the top bar's action or the message whole, so phones get the sheet from its status line to the end of the
// bench day), the two rings (what week 2 lifted; the 145) and the action with its own type.
// Every fact the homepage's words and rings rest on is checked; a changed demo stops the capture.
import { writeFileSync } from 'node:fs';
import { launch, kitCtx, kitPage, CAP, THEME } from './lib.mjs';
const b = await launch(); const errs = [];
const ctx = await kitCtx(b);
const p = await kitPage(ctx, 'programs', 'id=demo-d3', { errs });
const hash = await p.evaluate(() => location.hash);
if (!/id=demo-d3/.test(hash) || !/week=3/.test(hash) || !/row=change/.test(hash)) throw new Error('site-capture: Marcus\'s job no longer opens week 3 at its change: ' + hash);
// scroll the sheet inside its card (the page's own sticky head folds away)
await p.evaluate(() => { const c = document.querySelector('.card.wk'); c.scrollTop = c.scrollHeight; });
await p.waitForTimeout(700); await p.mouse.move(1436, 896); await p.waitForTimeout(200);
const g = await p.evaluate(() => {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  const U = (a, c) => { const x = Math.min(a[0], c[0]), y = Math.min(a[1], c[1]); return [x, y, Math.max(a[0] + a[2], c[0] + c[2]) - x, Math.max(a[1] + a[3], c[1] + c[3]) - y].map((v) => Math.round(v * 10) / 10); };
  const q = (s, r) => (r || document).querySelector(s), T = (e) => (e ? e.innerText.replace(/\s+/g, ' ').trim() : '');
  const card = q('.card.wk'), lines = [...document.querySelectorAll('.wg-line')], days = [...document.querySelectorAll('.wg-day')];
  const bench = lines.find((x) => /^Bench\b/.test(T(x))), bo = bench && bench.nextElementSibling;
  const send = [...document.querySelectorAll('header.tb button')].find((x) => /^Send \d+ changes? to Marcus$/.test(T(x)));
  if (!card || !bench || !send) return null;
  const last = q('.wg-k-last', bench), ls = q('.wg-ls', last), lf = q('.wg-lf', last), load = q('.wg-k-load', bench), cs = getComputedStyle(send);
  // every run of words on the page, by the words' own extent (a range), to check the cuts against
  const leaf = [...document.querySelectorAll('#page *')].filter((e) => e.offsetParent && e.children.length === 0 && e.textContent.trim()).map((e) => { const rg = document.createRange(); rg.selectNodeContents(e); return { t: e.textContent.trim().slice(0, 40), r: R(rg) }; });
  return { card: R(card), wb: R(q('.card.wk .wb')), status: R(q('.wg-status')), head: R(q('.wg-head')), days: days.map((d) => ({ r: R(d), t: T(d) })), bench: { r: R(bench), t: T(bench) }, backoffs: { r: R(bo), t: T(bo) },
    lifted: { box: U(R(ls), R(lf)), text: T(ls) + ' ' + T(lf), tone: lf.className }, load: { box: R(load), text: T(load), changed: load.classList.contains('is-chg') },
    send: R(send), sendText: T(send), sendStyle: ['font-family', 'font-size', 'font-weight', 'font-stretch', 'letter-spacing', 'padding-left', 'padding-right', 'height', 'border-radius', 'background-image', 'color'].reduce((o, k) => { o[k] = cs.getPropertyValue(k); return o; }, {}),
    strip: T(q('.card.wk .wb')), statusText: T(q('.wg-status')), title: T(q('header.tb .tb-title')), colLast: T(q('.wg-head .wg-k-last') || q('.wg-head')), loadHead: R([...document.querySelectorAll('.wg-head *')].find((e) => e.children.length === 0 && /^Load \(kg\)$/.test(e.textContent.trim()))), leaf };
});
if (!g) throw new Error('site-capture: the Programs sheet changed (no .card.wk, bench line or Send action)');
if (g.lifted.text !== '152.5 × 3 @9.5' || !/tone-warn/.test(g.lifted.tone) || g.load.text !== '145' || !g.load.changed || g.sendText !== 'Send 4 changes to Marcus' || !/Week 3/.test(g.strip) || !/4 changes to send/.test(g.strip) || !/155 → 145/.test(g.strip) || !/was 155/.test(g.statusText) || g.title !== 'Marcus Doyle' || !/Week 2/.test(g.colLast) || !/^Back-offs/.test(g.backoffs.t) || g.days.length < 3 || !/Bench day/.test(g.days[1].t))
  throw new Error('site-capture: Marcus\'s week 3 changed: ' + JSON.stringify({ lifted: g.lifted, load: g.load, send: g.sendText, strip: g.strip, status: g.statusText, title: g.title, col: g.colLast }));
const r1 = (v) => Math.round(v * 10) / 10;
// The homepage's frame: the card with 16 px either side, from the top of the screen, at 10:7.
const W = g.card[2] + 32, frame = [r1(g.card[0] - 16), 0, r1(W), r1(W * 0.7)];
// Phones: the sheet from its status line to the end of the bench day, from 8 px inside the card to 8 px past the load column.
const phone = [r1(g.card[0] + 8), r1(g.status[1]), 0, r1(g.days[2].r[1] - g.status[1])]; phone[2] = r1(g.load.box[0] + g.load.box[2] + 8 - phone[0]);
const inside = (f, bx) => bx[0] >= f[0] && bx[1] >= f[1] && bx[0] + bx[2] <= f[0] + f[2] && bx[1] + bx[3] <= f[1] + f[3];
const hcut = (f) => g.leaf.filter((l) => l.r[0] < f[0] + f[2] && l.r[0] + l.r[2] > f[0] && l.r[1] < f[1] + f[3] && l.r[1] + l.r[3] > f[1] + f[3]);   // words across the bottom edge
const vcut = (f) => g.leaf.filter((l) => l.r[1] < f[1] + f[3] && l.r[1] + l.r[3] > f[1] && [f[0], f[0] + f[2]].some((x) => l.r[0] < x - 0.5 && l.r[0] + l.r[2] > x + 0.5));   // words across a side edge
const tcut = (f) => g.leaf.filter((l) => l.r[0] < f[0] + f[2] && l.r[0] + l.r[2] > f[0] && l.r[1] < f[1] - 0.5 && l.r[1] + l.r[3] > f[1] + 0.5);   // words across the top edge
for (const [nm, f] of [['frame', frame], ['phone', phone]]) {
  const bad = hcut(f).concat(vcut(f), tcut(f));
  if (bad.length || !inside(f, g.lifted.box) || !inside(f, g.load.box) || !inside(f, [g.backoffs.r[0] + 24, g.backoffs.r[1] + 8, 200, g.backoffs.r[3] - 16]))
    throw new Error('site-capture: the ' + nm + ' cut passes through words, or misses the bench day: ' + JSON.stringify({ f, bad, bench: g.bench.r, backoffs: g.backoffs.r }));
}
if (!inside(frame, g.send)) throw new Error('site-capture: the action is outside the frame: ' + JSON.stringify(g.send));
// The page's crimson action is left out (its place kept); the homepage draws its own at g.send.
await p.evaluate(() => { [...document.querySelectorAll('header.tb button')].filter((x) => /^Send \d+ changes? to Marcus$/.test(x.textContent.trim())).forEach((x) => x.style.setProperty('visibility', 'hidden', 'important')); });
await p.waitForTimeout(250);
await p.screenshot({ path: CAP + 'week2.png' });
// The rings (desk px): what week 2 lifted (its words, 8 px either side, 6 above and below) and the 145 (its cell, 3 px out).
const why = [r1(g.lifted.box[0] - 8), r1(g.lifted.box[1] - 6), r1(g.lifted.box[2] + 16), r1(g.lifted.box[3] + 12)];
const tap = [r1(g.load.box[0] - 3), r1(g.load.box[1] - 3), r1(g.load.box[2] + 6), r1(g.load.box[3] + 6)];
const out = { theme: THEME, hash, frame, phone, why, tap, send: g.send, sendText: g.sendText, sendStyle: g.sendStyle, lifted: g.lifted, load: g.load, strip: g.strip, status: g.statusText, bench: g.bench, backoffs: g.backoffs, days: g.days, errs };
writeFileSync(CAP + 'week2.json', JSON.stringify(out, null, 1));
console.log(JSON.stringify({ hash, frame, phone, why, tap, send: g.send, sendText: g.sendText, lifted: g.lifted.text, load: g.load.text, strip: g.strip, status: g.statusText }));
console.log('send style', JSON.stringify(g.sendStyle));
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
