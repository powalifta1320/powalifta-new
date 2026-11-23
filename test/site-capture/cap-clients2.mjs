// -> clients2.png, clients2.json: site-img/home/clients2-*, clients2-ph-* (mkimg.py clients2).
// Clients on the NEW coach website (coach-preview/desk/clients.html, 1440 x 900 at 2x, dark; THEME=light for the light
// pictures), as it opens: the To do list (who is late: Tomas 12 days, Tom 5 days) beside November's money ($980 of
// $3,480 in, $370 late, $2,130 to come). Nothing is patched and nothing is drawn over it.
// Two cuts, both measured here and written to clients2.json (mkimg.py reads them; nothing is typed by hand):
//   desk   the list card and the month card with 16 px either side, from under the top bar (so the screen's own crimson,
//          Remind Tomas, stays out of a homepage screen) to 24 px under the month card;
//   phone  the list card's top at its own width and the old phone picture's 251 : 328, ending between two lifters.
// A cut that would pass through a line of text stops the capture.
import { writeFileSync } from 'node:fs';
import { launch, kitCtx, kitPage, CAP, THEME } from './lib.mjs';
const b = await launch(); const errs = [];
const ctx = await kitCtx(b);
const p = await kitPage(ctx, 'clients', '', { errs });
const g = await p.evaluate(() => {
  const R = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  const q = (s) => document.querySelector(s);
  const td = q('.card.td'), mo = q('.card.mo'), tb = q('header.tb');
  if (!td || !mo || !tb) return null;
  // every line of text on the page (leaf elements with words), to check a cut against
  const lines = [...document.querySelectorAll('#main *')].filter((e) => e.offsetParent && e.children.length === 0 && e.textContent.trim()).map((e) => { const rg = document.createRange(); rg.selectNodeContents(e); return { t: e.textContent.trim().slice(0, 40), r: R(rg) }; });
  const rows = [...td.querySelectorAll('.lrow')].map((e) => ({ r: R(e), t: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 90) }));
  return { td: R(td), mo: R(mo), tb: R(tb), rows, lines, month: mo.innerText.replace(/\s+/g, ' ').trim().slice(0, 200), facts: (q('#facts') || {}).innerText || '' };
});
if (!g) throw new Error('site-capture: the Clients page changed (no .card.td, .card.mo or header.tb)');
if (!/^(TN )?Tomas Novak/.test(g.rows[0].t) || !/12 days late/.test(g.rows[0].t) || !/^(TB )?Tom Boyle/.test(g.rows[1].t) || !/5 days late/.test(g.rows[1].t) || !/\$980/.test(g.month) || !/\$370 late/.test(g.month))
  throw new Error('site-capture: the Clients demo changed: ' + JSON.stringify({ rows: g.rows.slice(0, 2), month: g.month }));
const r1 = (v) => Math.round(v * 10) / 10;
// no line of text may straddle a horizontal cut at y between x0 and x1
const clean = (y, x0, x1) => g.lines.filter((l) => l.r[0] < x1 && l.r[0] + l.r[2] > x0 && l.r[1] < y && l.r[1] + l.r[3] > y);
const desk = [r1(g.td[0] - 16), r1(g.tb[1] + g.tb[3]), r1(g.mo[0] + g.mo[2] + 16 - (g.td[0] - 16)), 0];
desk[3] = r1(g.mo[1] + g.mo[3] + 24 - desk[1]);
const cutD = clean(desk[1] + desk[3], desk[0], desk[0] + desk[2]);
if (cutD.length) throw new Error('site-capture: the desk cut passes through ' + JSON.stringify(cutD));
const phone = [g.td[0], g.td[1], g.td[2], Math.round(g.td[2] * 328 / 251)];
/* 23 Nov: the To do cards are taller now; a cut that would land inside a lifter ends in the gap above them instead */
const hit = g.rows.find((x) => x.r[1] + 8 < phone[1] + phone[3] && x.r[1] + x.r[3] - 8 > phone[1] + phone[3]);
if (hit) phone[3] = r1(hit.r[1] - 4 - phone[1]);
const cutP = clean(phone[1] + phone[3], phone[0], phone[0] + phone[2]);
const inRow = g.rows.filter((x) => x.r[1] + 8 < phone[1] + phone[3] && x.r[1] + x.r[3] - 8 > phone[1] + phone[3]);
if (cutP.length || inRow.length) throw new Error('site-capture: the phone cut passes through ' + JSON.stringify(cutP.concat(inRow)));
await p.screenshot({ path: CAP + 'clients2.png' });
writeFileSync(CAP + 'clients2.json', JSON.stringify({ theme: THEME, desk, phone, rows: g.rows.slice(0, 4), month: g.month, facts: g.facts, errs }, null, 1));
console.log('desk cut', desk.join(','), '| phone cut', phone.join(','));
console.log('rows', g.rows.slice(0, 3).map((x) => x.t).join(' | ')); console.log('month', g.month);
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
