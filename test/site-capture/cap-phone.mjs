// -> phone-train.png, phone-logged.png: site-img/home/lifter-train-*, lifter-logged-* (mkimg.py phone).
// Arjun's phone (the real lifter app in the iPhone app layout, dark (THEME=light for a light version), 393x852 at 3x): Train with his top set
// (182.5 kg x 5, the coach wrote @8, he picks 8), then the same screen once Log set is pressed and the PR sheet is done.
import { writeFileSync } from 'node:fs';
import { launch, phoneCtx, safeAreas, patchDemo, BASE, CAP as OUT, THEME } from './lib.mjs';
const b = await launch();
const ctx = await phoneCtx(b, { theme: THEME, dpr: 3 }); await patchDemo(ctx);
const p = await ctx.newPage(); await safeAreas(ctx, p);
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + 'athlete.html?demo=1', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1800);
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
await p.screenshot({ path: OUT + 'phone-train.png' });
const geo = await p.evaluate(() => {
  const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
  const txt = (re) => { const e = [...document.querySelectorAll('.today-hero *')].find((x) => x.children.length === 0 && re.test(x.textContent)); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
  return { log: r('.tdh-log'), hero: r('.today-hero'), rpe: r('.rpe-track, .rpe-scale, .tdh-rpe'), knob: r('.rpe-knob'), hint: r('.rpe-hint'), load: txt(/^182\.5$/), note: r('.tn-group.tn-coach, .today-note') };
});
console.log(JSON.stringify(geo));
// Log set: the PR sheet, then Done: the set card moves to set 2 and the rest timer docks.
await p.evaluate(() => document.querySelector('.tdh-log').click());
await p.waitForTimeout(1700);
await p.screenshot({ path: OUT + 'phone-pr.png' });
await p.evaluate(() => { const x = [...document.querySelectorAll('button, a')].find((x) => x.offsetParent && /^Done$/.test(x.textContent.trim())); if (x) x.click(); });
await p.waitForTimeout(1600);
await p.evaluate(() => {
  const t = [...document.querySelectorAll('.tn-text')].find((e) => /Before today/.test(e.textContent));
  if (t) t.textContent = 'Top set today is 182.5 for 5 at 8. Film it and send it over, I want eyes on your brace out of the hole.';
  window.scrollTo(0, 0);
});
await p.waitForTimeout(400);
await p.screenshot({ path: OUT + 'phone-logged.png' });
const geo2 = await p.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10); }; return { log: r('.tdh-log'), hero: r('.today-hero'), dock: r('.rest-dock, .rest-bar, [class*="rest-"]') }; });
console.log('logged', JSON.stringify(geo2));
writeFileSync(OUT + 'phone-geo.json', JSON.stringify({ geo, errs }, null, 1));
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
