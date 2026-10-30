// Marcus's week on the desk (1440 x 900 at 2x, light), one aligned demo (patchDemo): week 2 as he lifted it (bench
// @9.5 where Sam wrote 8), before and after Take (145, Sam's rule).
// -> week-before.png, week-after.png: site-img/home/week-before-*, week-after-* (mkimg.py week).
import { writeFileSync } from 'node:fs';
import { launch, deskCtx, patchDemo, BASE, CAP as OUT } from './lib.mjs';
const b = await launch();
const ctx = await deskCtx(b, { theme: 'light', dpr: 2 }); await patchDemo(ctx);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + 'coach.html?demo=1', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(2000);
// Arjun's staged top set, as on every other capture (so the roster's numbers agree).
await p.evaluate(() => { Store.update((s) => { const l = s.workoutLogs.find((x) => x.id === 'demo-clog-46'); l.weight = 182.5; l.reps = 5; l.rpe = 8; l.e1rm = calcE1RM(182.5, 5, 8); l.e1rmComp = calcCompE1RM(182.5, 5, 8, 'squat', 'Competition'); }); });
const goto = async (re) => { await p.evaluate((src) => { const it = [...document.querySelectorAll('.dk-item')]; const b = it.find((x) => new RegExp(src).test(x.innerText)); if (b) b.click(); }, re.source); await p.waitForTimeout(1300); };
const rect = (sel) => p.evaluate((s) => { const e = typeof s === 'string' ? document.querySelector(s) : null; if (!e) return null; const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }, sel);
const mute = (redRe, quietRe) => p.evaluate(({ r, q }) => {
  const red = [...document.querySelectorAll('button, a')].find((x) => x.offsetParent && new RegExp(r).test(x.textContent));
  const quiet = [...document.querySelectorAll('button, a')].find((x) => x.offsetParent && new RegExp(q).test(x.textContent.trim()));
  if (red && quiet) { const c = getComputedStyle(quiet); ['background', 'background-color', 'background-image', 'color', 'box-shadow', 'border', 'font-weight'].forEach((k) => red.style.setProperty(k, c.getPropertyValue(k), 'important')); return true; }
  return false;
}, { r: redRe, q: quietRe });
const info = {};
// 1. Marcus's week.
await p.evaluate(() => { location.hash = 'athlete=demo-d3'; }); await p.waitForTimeout(1800);
await p.evaluate(() => window.scrollTo(0, 0)); await p.mouse.move(1430, 890); await p.waitForTimeout(400);
info.weekHead = await p.evaluate(() => { const h = [...document.querySelectorAll('h2, h3, .dk-h, div')].find((x) => x.children.length < 3 && /^Week 2, as they lifted it$/.test(x.textContent.trim())); if (!h) return null; const r = h.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
info.chip = await p.evaluate(() => { const c = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /Drop to 145/.test(x.textContent)); if (!c) return null; const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
info.cell = await p.evaluate(() => { const i = [...document.querySelectorAll('input')].filter((x) => x.offsetParent).find((x) => /155/.test(x.value)); if (!i) return null; const r = i.getBoundingClientRect(); const cs = getComputedStyle(i); return { rect: [r.x, r.y, r.width, r.height], value: i.value, font: [cs.fontSize, cs.fontWeight, cs.fontFamily.slice(0, 40), cs.color, cs.paddingLeft, cs.borderRadius, cs.borderColor] }; });
info.take = await p.evaluate(() => { const c = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /Take 1 suggestion/.test(x.textContent)); if (!c) return null; const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
await p.screenshot({ path: OUT + 'week-before.png' });
await p.evaluate(() => { const c = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /Drop to 145/.test(x.textContent)); if (c) c.click(); });
await p.waitForTimeout(1200); await p.mouse.move(1430, 890); await p.waitForTimeout(300);
info.pub = await p.evaluate(() => { const c = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /Publish week 3/.test(x.textContent)); if (!c) return null; const r = c.getBoundingClientRect(); const cs = getComputedStyle(c); return { rect: [r.x, r.y, r.width, r.height], text: c.textContent.trim(), bg: cs.backgroundImage.slice(0, 120) + ' ' + cs.backgroundColor, color: cs.color, radius: cs.borderRadius, font: cs.fontSize + ' ' + cs.fontWeight, html: c.innerHTML.slice(0, 900) }; });
info.took = await p.evaluate(() => { const c = [...document.querySelectorAll('*')].find((x) => x.children.length === 0 && /^Took 145$/.test(x.textContent.trim())); if (!c) return null; const r = c.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
await p.screenshot({ path: OUT + 'week-after.png' });
writeFileSync(OUT + 'week.json', JSON.stringify({ info, errs }, null, 1));
console.log(JSON.stringify(info, null, 1).slice(0, 3000));
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
