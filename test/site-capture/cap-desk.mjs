// Sam's laptop (the coach's desk, 1440 x 900 at 2x, light): Lifters with Arjun's page open, before and after his top set
// (182.5 kg x 5 at RPE 8) lands, and once more with the numbers that change left out (the homepage draws them live).
// Also records where everything is (desk-values.json): the changing numbers and their regions on Arjun's page, and the
// Lifters list row by row (name, why, rectangle), which the homepage's numbered pins and rings follow.
//   desk-arjun-before.png  -> site-img/home/desk-before-*, was-hero*, was-sq*, was-tr2, was-pips2 (mkimg.py)
//   desk-arjun-after.png   -> win-after-*, win-list-*
//   desk-arjun-blank.png   -> desk-live-*, win-live-*
import { writeFileSync } from 'node:fs';
import { launch, deskCtx, patchDemo, arjunTopSet, mute, BASE, CAP } from './lib.mjs';
const b = await launch();
const ctx = await deskCtx(b, { theme: process.env.THEME || 'light', dpr: 2 }); await patchDemo(ctx);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + 'coach.html?demo=1', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(2000);
await arjunTopSet(p);
const goto = async (re) => { await p.evaluate((src) => { const it = [...document.querySelectorAll('.dk-item')]; const b = it.find((x) => new RegExp(src).test(x.innerText)); if (b) b.click(); }, re.source); await p.waitForTimeout(1300); };
const openArjun = async () => {
  await goto(/^Lifters/);
  await p.evaluate(() => { const r = [...document.querySelectorAll('.cl-row')].find((x) => /Arjun Mehta/.test(x.innerText)); if (r) r.click(); });
  await p.waitForTimeout(1400); await p.mouse.move(1430, 890); await p.waitForTimeout(300);
};
await openArjun();
const TARGETS = { total: '.cl-hnum b', chip: '.cl-chip.up', sqPr: '.l-sq .cl-pr-b', sqNum: '.l-sq .cl-lv b', sqDelta: '.l-sq .cl-ld, .l-sq .cl-lv .cl-d, .l-sq [class*="delta"]', sqFoot: '.l-sq .cl-lf',
  trNum: '.cl-page .t-training .cl-big3', trFoot: '.cl-page .t-training .cl-tf', rowKg: '.cl-row.is-sel .cl-n b' };
const REGIONS = { heroViz: '.cl-hc', sqViz: '.l-sq .cl-vz-lift', trViz: '.cl-page .t-training .cl-viz', rowPips: '.cl-row.is-sel .cl-pips', sqCard: '.l-sq', page: '.cl-page', head: '.cl-hero, .cl-head, .cl-top' };
const measure = () => p.evaluate(({ T, R }) => {
  const props = ['font-family', 'font-size', 'font-weight', 'font-stretch', 'letter-spacing', 'line-height', 'color', 'font-variant-numeric', 'background-color', 'border-radius', 'padding', 'white-space'];
  const out = { nodes: {}, regions: {}, list: [] };
  for (const [k, s] of Object.entries(T)) { const e = document.querySelector(s); if (!e) { out.nodes[k] = null; continue; }
    const r = e.getBoundingClientRect(), cs = getComputedStyle(e), st = {}; props.forEach((q) => { st[q] = cs.getPropertyValue(q); });
    out.nodes[k] = { sel: s, text: e.innerText.replace(/\s+/g, ' ').trim(), rect: [r.x, r.y, r.width, r.height], style: st }; }
  for (const [k, s] of Object.entries(R)) { const e = document.querySelector(s); if (!e) { out.regions[k] = null; continue; } const r = e.getBoundingClientRect(); out.regions[k] = { sel: s, rect: [r.x, r.y, r.width, r.height], text: e.innerText.replace(/\s+/g, ' ').trim().slice(0, 160) }; }
  // The Lifters list, top to bottom: each row's group, name, line and rectangle.
  document.querySelectorAll('.cl-row').forEach((row) => {
    const r = row.getBoundingClientRect(); if (r.width < 2) return;
    let g = row.parentElement, head = null;
    while (g && !head) { let s = g.previousElementSibling; while (s && !head) { if (/\bcl-g/.test(s.className) || /^h[2-4]$/i.test(s.tagName)) head = s; s = s.previousElementSibling; } g = g.parentElement; if (g && g.classList.contains('cl-page')) break; }
    out.list.push({ text: row.innerText.replace(/\s+/g, ' ').trim().slice(0, 120), group: head ? head.innerText.replace(/\s+/g, ' ').trim().slice(0, 40) : '', rect: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10) });
  });
  return out;
}, { T: TARGETS, R: REGIONS });
// The one crimson on the homepage's screen is its own: the red fix on Arjun's card (his first job, in the app's order:
// "See the cut plan" today) is drawn as its quiet neighbour.
const RED = '^See the cut plan$|^Reply to Arjun$|^Open meet day$', QUIET = '^Message Arjun$|^Program$|^Open the block$';
console.log('muted the card\'s red fix', await mute(p, RED, QUIET));
await p.waitForTimeout(200);
const after = await measure();
await p.screenshot({ path: CAP + 'desk-arjun-after.png' });
// The same page with the changing words and numbers left out: the website draws them live on top.
await p.evaluate((T) => { const st = document.createElement('style'); st.id = 'blank'; const sels = Object.values(T).join(','); st.textContent = sels + '{color:transparent!important;-webkit-text-fill-color:transparent!important} ' + Object.values(T).map((x) => x.split(',').map((y) => y + ' *').join(',')).join(',') + '{opacity:0!important} .l-sq .cl-pr-b{visibility:hidden!important}'; document.head.appendChild(st); }, TARGETS);
await p.waitForTimeout(200);
await p.screenshot({ path: CAP + 'desk-arjun-blank.png' });
await p.evaluate(() => document.getElementById('blank').remove());
// Before: today's squat sets out of the store.
await p.evaluate(() => { const t = todayISO(); Store.update((s) => { s.workoutLogs = s.workoutLogs.filter((l) => !(l.athleteId === 'demo-a1' && l.date === t && l.lift === 'squat')); }); });
await openArjun();
await mute(p, RED, QUIET);
await p.waitForTimeout(200);
const before = await measure();
await p.screenshot({ path: CAP + 'desk-arjun-before.png' });
writeFileSync(CAP + 'desk-values.json', JSON.stringify({ after, before, errs }, null, 1));
console.log(errs.join(' | ') || 'clean');
for (const k of Object.keys(TARGETS)) console.log(k, '|', before.nodes[k] && before.nodes[k].text, '->', after.nodes[k] && after.nodes[k].text, after.nodes[k] && after.nodes[k].rect.map(Math.round).join(','));
console.log('\nThe Lifters list (after):'); after.list.forEach((x, i) => console.log(String(i + 1).padStart(2), x.rect.join(','), '|', x.group, '|', x.text));
await b.close(); process.exit(0);
