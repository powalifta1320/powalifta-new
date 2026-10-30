// -> brand-train.png: site-img/home/brand-* (mkimg.py brand).
// The lifter app wearing the coach's branding (athlete.html?demo=1&brand=1: Pro and Premium), iPhone app layout,
// dark, 393x852 at 3x. The same day and set as the opening's phone (182.5 kg x 5, written @8, the coach's note).
import { launch, phoneCtx, safeAreas, patchDemo, BASE, CAP as OUT } from './lib.mjs';
const b = await launch();
const ctx = await phoneCtx(b, { theme: 'dark', dpr: 3 }); await patchDemo(ctx);
const p = await ctx.newPage(); await safeAreas(ctx, p);
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + 'athlete.html?demo=1&brand=1', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1800);
await p.evaluate(() => {
  const cur = getCurrentDay();
  Store.update((s) => { const pr = s.programs.find((x) => x.athleteId === user.id); const d = pr.weeks.find((w) => w.id === cur.week.id).days.find((x) => x.id === cur.day.id); const ex = d.exercises[0]; ex.sets[0].weight = 182.5; ex.sets[0].reps = 5; ex.sets[0].rpe = 8; });
  renderToday();
});
await p.waitForTimeout(900);
await p.evaluate(() => {
  const t = [...document.querySelectorAll('.tn-text')].find((e) => /Before today/.test(e.textContent));
  if (t) t.textContent = 'Top set today is 182.5 for 5 at 8. Film it and send it over, I want eyes on your brace out of the hole.';
  window.scrollTo(0, 0);
});
await p.waitForTimeout(500);
await p.screenshot({ path: OUT + 'brand-train.png' });
const geo = await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v)); }; return { log: r('.tdh-log'), hero: r('.today-hero'), team: r('.tdh-team, [class*="brand-row"], [class*="team"]') }; });
console.log(JSON.stringify(geo), errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
