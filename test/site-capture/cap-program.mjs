// Marcus's week in the Programs editor (desk-program.js, rebuilt 3 Nov), the desk at 1440 x 900, 2x, dark (THEME=light for a
// light version), the fixed day (lib.mjs). The editor jumps to his Bench Day by its day chip (the app's own jump: the sticky
// head and the days' chips stay, the card comes up under them), so the frame is the head plus the bench day:
//   prog-lifted.png   week 2 as he lifted it: bench written 152.5 x 3 @8, lifted @9.5 (the coral dot), "Take 1 suggestion";
//   prog-taken.png    Take 1 suggestion: the editor moves to week 3, his rule's 145 written in beside what week 2 lifted,
//                     "Send the changes to Marcus".
// The editor's crimson action is left out of the picture, its place kept (the homepage draws its own there, one crimson per
// screen, at each label's width: the two labels' widths differ, so a quiet copy under it would show beside the narrower
// one as the pictures cross); the day name the jump focuses is let go (no focus ring). prog.json: the editor's parts and where the page rings, lands and draws (desk px),
// and the action's own type. -> mkimg.py program.
import { writeFileSync } from 'node:fs';
import { launch, deskCtx, patchDemo, arjunTopSet, BASE, CAP as OUT } from './lib.mjs';
const b = await launch();
const ctx = await deskCtx(b, { dpr: 2 }); await patchDemo(ctx);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + 'coach.html?demo=1#programs', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(2200);
await arjunTopSet(p);
const click = (re, sel = 'button, [role="tab"], a') => p.evaluate(({ src, sel }) => { const x = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent).find((e) => new RegExp(src).test(e.textContent.replace(/\s+/g, ' ').trim())); if (x) x.click(); return !!x; }, { src: re.source, sel });
const R = (r) => [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10);
const boxOf = (re, sel) => p.evaluate(({ src, sel }) => { const e = [...document.querySelectorAll(sel)].filter((x) => x.offsetParent).find((x) => new RegExp(src).test(x.textContent.replace(/\s+/g, ' ').trim())); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); }, { src: re.source, sel });
// The action's own type and shape (the page draws its crimson in the editor's px).
const styleOf = (re) => p.evaluate((src) => { const e = [...document.querySelectorAll('#programArea button')].filter((x) => x.offsetParent).find((x) => new RegExp(src).test(x.textContent.trim())); if (!e) return null; const c = getComputedStyle(e); return ['font-family', 'font-size', 'font-weight', 'font-stretch', 'letter-spacing', 'padding-left', 'padding-right', 'height', 'border-radius', 'background-image', 'background-color', 'color'].reduce((o, k) => { o[k] = c.getPropertyValue(k); return o; }, {}); }, re.source);
const leaveOut = async () => { await p.evaluate(() => [...document.querySelectorAll('button')].filter((x) => x.offsetParent && /Take 1 suggestion|Send the changes to Marcus/.test(x.textContent)).forEach((x) => x.style.setProperty('visibility', 'hidden', 'important'))); await p.mouse.move(1430, 890); await p.waitForTimeout(250); };
// The Bench Day by its chip (the editor scrolls it up under the sticky head and chips), the name's focus let go.
const toBench = async () => {
  const ok = await p.evaluate(() => { const c = [...document.querySelectorAll('.dp-dchip')].find((x) => x.offsetParent && /Bench/.test(x.textContent)); if (c) c.click(); return !!c; });
  if (!ok) throw new Error('site-capture: no Bench chip in Marcus\'s week');
  await p.waitForTimeout(1400);
  await p.evaluate(() => { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); });
  await p.mouse.move(1430, 890); await p.waitForTimeout(300);
};
// The frame's parts, where they are now: the scroll, the stuck head and chips, the bench card, its top set's load and
// what it lifted (the line's own text and dot).
const parts = (week) => p.evaluate(({ week, label }) => {
  const R = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  const sc = document.getElementById('programArea'), q = (s) => document.querySelector(s);
  // Where a cell's own words sit (an input reads as text at rest): its left padding, then the value in its font.
  const textBox = (i) => { const c = getComputedStyle(i), r = i.getBoundingClientRect(), t = document.createElement('span'); ['font-family', 'font-size', 'font-weight', 'font-stretch', 'font-style', 'letter-spacing', 'font-variant-numeric', 'font-feature-settings', 'font-variation-settings', 'text-transform'].forEach((k) => t.style.setProperty(k, c.getPropertyValue(k))); t.style.cssText += ';position:fixed;left:0;top:0;white-space:pre;visibility:hidden'; t.textContent = i.value; document.body.appendChild(t); const w = t.getBoundingClientRect().width; t.remove(); const l = r.x + parseFloat(c.borderLeftWidth) + parseFloat(c.paddingLeft) + parseFloat(c.textIndent || 0); return [l, r.y, w, r.height].map((v) => Math.round(v * 10) / 10); };
  const card = [...document.querySelectorAll('.dp-day')].find((d) => /^Bench/.test((d.querySelector('.dp-day-name') || {}).value || ''));
  const inp = [...document.querySelectorAll('input')].find((x) => x.offsetParent && x.getAttribute('aria-label') === label);
  const row = inp && inp.closest('.dp-line'), lift = row && row.querySelector('.dp-lifted');
  const name = [...document.querySelectorAll('#programArea *')].find((x) => x.offsetParent && x.children.length === 0 && x.textContent.trim() === 'Marcus Doyle');
  return { scrollTop: sc && sc.scrollTop, head: R(q('.dp-head.is-pb')), stuck: !!q('.dp-head.is-pb.is-stuck'), name: R(name), chips: R(q('.dp-dchips')), card: R(card),
    load: inp ? { box: R(inp), value: inp.value, text: textBox(inp) } : null, row: R(row), lifted: lift ? { box: R(lift), text: lift.textContent.replace(/\s+/g, ' ').trim() } : null,
    liftHead: card ? [...card.querySelectorAll('*')].filter((x) => x.children.length === 0 && /lifted$/i.test(x.textContent.trim())).map((x) => x.textContent.trim())[0] : null };
}, { week, label: 'Bench, top set, load, week ' + week });
if (!(await click(/^MD ?Marcus Doyle/, 'button, li, [role="button"], a'))) throw new Error('site-capture: Marcus is not in the Programs list');
await p.waitForTimeout(1500);
const g = {};
await toBench();
g.lifted2 = await parts(2);
g.take = await boxOf(/^Take 1 suggestion$/, 'button');
g.takeStyle = await styleOf(/^Take 1 suggestion$/);
if (!g.take || !g.lifted2.load || g.lifted2.load.value !== '152.5 kg' || !g.lifted2.lifted || !/^152\.5 × 3 @9\.5/.test(g.lifted2.lifted.text) || !g.lifted2.stuck)
  throw new Error('site-capture: week 2 as lifted changed: ' + JSON.stringify(g));
await leaveOut(); await p.screenshot({ path: OUT + 'prog-lifted.png' });
// Take: the suggestion written into week 3 (the editor stays on the bench day; its chip again marks where it is).
await click(/^Take 1 suggestion$/); await p.waitForTimeout(900);
await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach((t) => t.remove()));
await toBench();
await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach((t) => t.remove()));
g.taken3 = await parts(3);
g.send = await boxOf(/^Send the changes to Marcus$/, 'button');
g.sendStyle = await styleOf(/^Send the changes to Marcus$/);
if (!g.send || !g.taken3.load || !/^145/.test(g.taken3.load.value) || !g.taken3.lifted || g.taken3.scrollTop !== g.lifted2.scrollTop || JSON.stringify(g.taken3.card) !== JSON.stringify(g.lifted2.card))
  throw new Error('site-capture: Take did not write 145 in the same frame: ' + JSON.stringify(g));
await leaveOut(); await p.screenshot({ path: OUT + 'prog-taken.png' });
// What the page draws (desk px): a ring round what week 2 lifted (its dot and line) and one round the 145 where it lands
// (the cell's words), each 10 px either side and the row's own 32 px; the action in its two states.
const pad = (bx, k) => [Math.round((bx[0] - k) * 10) / 10, bx[1], Math.round((bx[2] + 2 * k) * 10) / 10, bx[3]];
g.lifted = pad([g.lifted2.lifted.box[0], g.lifted2.load.box[1], g.lifted2.lifted.box[2], g.lifted2.load.box[3]], 10);
g.cell145 = { box: pad([g.taken3.load.text[0], g.taken3.load.box[1], g.taken3.load.text[2], g.taken3.load.box[3]], 10), value: g.taken3.load.value, input: g.taken3.load.box };
writeFileSync(OUT + 'prog.json', JSON.stringify({ g, errs }, null, 1));
console.log(JSON.stringify({ lifted: g.lifted, cell145: g.cell145, take: g.take, send: g.send, scroll: g.lifted2.scrollTop, card: g.lifted2.card, name: g.lifted2.name, chips: g.lifted2.chips, liftHead: [g.lifted2.liftHead, g.taken3.liftHead], liftText: [g.lifted2.lifted.text, g.taken3.lifted.text] }));
console.log('take style', JSON.stringify(g.takeStyle));
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
