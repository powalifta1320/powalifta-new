// Marcus's week in the Programs editor (desk-program.js), the desk at 1440 x 900, 2x, dark (THEME=light for a light version), the fixed day (lib.mjs):
//   prog-lifted.png   week 2 as he lifted it: bench written 152.5 x 3 @8, lifted @9.5 (the coral dot), "Take 1 suggestion";
//   prog-taken.png    Take 1 suggestion: the editor moves to week 3, his rule's 145 written in, "Send the changes to Marcus".
// (The editor takes the suggestion from the lifted week: there is no week-3 card to show first.)
// The editor's crimson action is drawn quiet (the homepage draws its own over it: one crimson per screen).
// prog.json: the editor's box and where the page rings, lands and draws (desk px). -> mkimg.py program.
import { writeFileSync } from 'node:fs';
import { launch, deskCtx, patchDemo, arjunTopSet, BASE, CAP as OUT, THEME } from './lib.mjs';
const b = await launch();
const ctx = await deskCtx(b, { dpr: 2 }); await patchDemo(ctx);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + 'coach.html?demo=1#programs', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(2200);
await arjunTopSet(p);
const click = (re, sel = 'button, [role="tab"], a') => p.evaluate(({ src, sel }) => { const x = [...document.querySelectorAll(sel)].filter((e) => e.offsetParent).find((e) => new RegExp(src).test(e.textContent.replace(/\s+/g, ' ').trim())); if (x) x.click(); return !!x; }, { src: re.source, sel });
const leaf = (re) => p.evaluate((src) => { const e = [...document.querySelectorAll('*')].filter((x) => x.offsetParent && x.children.length === 0).find((x) => new RegExp(src).test(x.textContent.replace(/\s+/g, ' ').trim())); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); }, re.source);
const smallest = (re) => p.evaluate((src) => { const area = (x) => { const r = x.getBoundingClientRect(); return r.width * r.height; }; const all = [...document.querySelectorAll('*')].filter((x) => x.offsetParent && new RegExp(src).test(x.textContent.replace(/\s+/g, ' ').trim()) && x.getBoundingClientRect().x > 600).sort((m, n) => area(m) - area(n)); const e = all[0]; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); }, re.source);
const boxOf = (re, sel) => p.evaluate(({ src, sel }) => { const e = [...document.querySelectorAll(sel)].filter((x) => x.offsetParent).find((x) => new RegExp(src).test(x.textContent.replace(/\s+/g, ' ').trim())); if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); }, { src: re.source, sel });
const quiet = async () => { await p.evaluate((Q) => [...document.querySelectorAll('button')].filter((x) => x.offsetParent && /Take 1 suggestion|Send the changes to Marcus/.test(x.textContent)).forEach((x) => { ['background', 'background-image', 'box-shadow', 'border'].forEach((k) => x.style.setProperty(k, 'none', 'important')); x.style.setProperty('background-color', 'transparent', 'important'); x.style.setProperty('color', Q, 'important'); }), THEME === 'light' ? '#34343c' : '#c2c2cb'); await p.mouse.move(1430, 890); await p.waitForTimeout(250); };
if (!(await click(/^MD ?Marcus Doyle/, 'button, li, [role="button"], a'))) throw new Error('site-capture: Marcus is not in the Programs list');
await p.waitForTimeout(1500);
const g = {};
g.head = await smallest(/^Marcus Doyle$/);
g.panel = await p.evaluate(() => { const h = [...document.querySelectorAll('*')].find((x) => x.offsetParent && x.children.length === 0 && x.textContent.trim() === 'Marcus Doyle' && x.getBoundingClientRect().x > 500); let e = h; while (e && e.getBoundingClientRect().width < 700) e = e.parentElement; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
const inputBox = (label) => p.evaluate((l) => { const i = [...document.querySelectorAll('input')].find((x) => x.offsetParent && x.getAttribute('aria-label') === l); if (!i) return null; const r = i.getBoundingClientRect(); return { box: [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10), value: i.value }; }, label);
// The bench row as lifted: its own row (the top set's load cell) under the Bench Day card's "Lifted" column.
g.bench2 = await inputBox('Bench, top set, load, week 2');
g.liftedHead = await p.evaluate((y) => { const h = [...document.querySelectorAll('*')].filter((x) => x.offsetParent && x.children.length === 0 && x.textContent.trim() === 'Lifted').map((x) => x.getBoundingClientRect()).filter((r) => r.y < y && r.y > y - 90)[0]; return h ? [h.x, h.y, h.width, h.height] : null; }, g.bench2 && g.bench2.box[1]);
g.lifted = g.bench2 && g.liftedHead ? [Math.round(g.liftedHead[0] - 14), g.bench2.box[1], 132, g.bench2.box[3]] : null;
g.take = await boxOf(/^Take 1 suggestion$/, 'button');
if (!g.lifted || !g.take) throw new Error('site-capture: week 2 as lifted changed: ' + JSON.stringify(g));
await quiet(); await p.screenshot({ path: OUT + 'prog-lifted.png' });
// Take: the suggestion written into week 3.
await click(/^Take 1 suggestion$/); await p.waitForTimeout(800);
await p.evaluate(() => document.querySelectorAll('.toast, [class*="toast"]').forEach((t) => t.remove()));
g.cell145 = await inputBox('Bench, top set, load, week 3');
if (g.cell145 && !/^145/.test(g.cell145.value)) g.cell145 = null;
g.send = await boxOf(/^Send the changes to Marcus$/, 'button');
if (!g.cell145 || !g.send) throw new Error('site-capture: Take did not write 145: ' + JSON.stringify(g));
await quiet(); await p.screenshot({ path: OUT + 'prog-taken.png' });
writeFileSync(OUT + 'prog.json', JSON.stringify({ g, errs }, null, 1));
console.log(JSON.stringify(g));
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
