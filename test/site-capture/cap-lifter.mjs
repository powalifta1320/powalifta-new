// -> lifter-pr.png, lifter-pr-base.png, lifter-progress.png, lifter-progress-base.png, lifter-geo.json:
//    site-img/home/lifter-pr-*, lifter-pr-base-*, lifter-progress-*, lifter-progress-base-* (mkimg.py lifter).
// The homepage's chapter for lifters: Arjun's phone (the real lifter app in the iPhone app layout, dark (THEME=light for a light version), 393 x 852 at 3x)
// carrying his own numbers, the ones Sam's desk shows (the coach demo's Arjun, demo-a1: squat 223, bench 150, deadlift
// 278 before today, the 74 kg class). He logs his top set as Sam wrote it (182.5 kg x 5 at RPE 8): the PR moment (228 kg,
// +5 kg), then Progress (656 kg, +21 kg in 4 weeks, the line climbing to it).
// Each screen is taken twice: as it is, and with the parts the homepage moves left out (the PR moment's plate, number and
// jump; Progress's line), which the page draws on top: lifter-geo.json says where, and in what type.
import { writeFileSync } from 'node:fs';
import { launch, phoneCtx, safeAreas, patchDemo, mute, BASE, CAP as OUT, THEME } from './lib.mjs';
const b = await launch();
const ctx = await phoneCtx(b, { theme: THEME, dpr: 3 }); await patchDemo(ctx);
const p = await ctx.newPage(); await safeAreas(ctx, p);
const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + 'athlete.html?demo=1', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1800);

// Arjun's own training in the lifter app: his logs (without today's squat sets: he logs his top set here), weigh-ins,
// meets and goal from the coach demo, his class the one Sam's desk shows (74 kg), his name. Checked: a demo that has
// changed under it stops the capture instead of quietly drawing other numbers.
const was = await p.evaluate(() => {
  const S = _buildCoachDemoData().store, A = 'demo-a1', me = user.id, t = todayISO();
  const his = (k) => (S[k] || []).filter((x) => x.athleteId === A).map((x) => Object.assign({}, x, { athleteId: me }));
  Store.update((s) => {
    s.workoutLogs = s.workoutLogs.filter((l) => l.athleteId !== me).concat(his('workoutLogs').filter((l) => !(l.date === t && l.lift === 'squat')));
    s.bodyweight = (s.bodyweight || []).filter((x) => x.athleteId !== me).concat(his('bodyweight'));
    s.meets = (s.meets || []).filter((x) => x.athleteId !== me).concat(his('meets'));
    s.goals = (s.goals || []).filter((x) => x.athleteId !== me).concat(his('goals').map((g) => Object.assign(g, { id: me, targetClass: 74 })));
  });
  user.name = 'Arjun Mehta';
  const pr = getLifetimePRs(me);
  return ['squat', 'bench', 'deadlift'].map((l) => Math.round(pr[l].e1rmComp));
});
if (was.join() !== '223,150,278') throw new Error('site-capture: Arjun\'s bests changed in the coach demo: ' + was.join(', ') + ' (expected 223, 150, 278)');

// His top set as Sam wrote it, on Train (as cap-phone.mjs), and Log set. The fixed clock runs the PR moment's 9 s goodbye at
// once, so long timers are held; the moment is taken as it ends (reduced motion: the plate landed, the number counted).
await p.evaluate(() => {
  const cur = getCurrentDay();
  Store.update((s) => { const pr = s.programs.find((x) => x.athleteId === user.id); const d = pr.weeks.find((w) => w.id === cur.week.id).days.find((x) => x.id === cur.day.id); const ex = d.exercises[0]; ex.sets[0].weight = 182.5; ex.sets[0].reps = 5; ex.sets[0].rpe = 8; });
  renderToday(); window.scrollTo(0, 0);
  const st = window.setTimeout; window.setTimeout = function (f, ms) { return ms >= 5000 ? 0 : st.apply(this, arguments); };
});
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector('.tdh-log').click());
await p.waitForTimeout(900);
const said = await p.evaluate(() => (document.querySelector('.prm-stage') || {}).innerText || '');
if (!/New PR\s+228\s*kg\s+\+5 kg/.test(said)) throw new Error('site-capture: the PR moment reads ' + JSON.stringify(said));
// One crimson per screen on the homepage: Share to Story is drawn as its quiet neighbour.
console.log('muted Share to Story', await mute(p, '^Share to Story$', '^Share with Iron Temple Barbell$'));
await p.waitForTimeout(200);
await p.screenshot({ path: OUT + 'lifter-pr.png' });
const pr = await p.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  const type = (e) => { const c = getComputedStyle(e); return { size: c.fontSize, weight: c.fontWeight, stretch: c.fontStretch, spacing: c.letterSpacing, line: c.lineHeight, color: c.color, family: c.fontFamily.slice(0, 40), bg: c.backgroundColor, pad: c.padding, radius: c.borderRadius }; };
  const q = (s) => document.querySelector('.pr-moment ' + s);
  return { plate: box(q('.prm-plate')), plateSvg: q('.prm-plate svg').outerHTML, plateFilter: getComputedStyle(q('.prm-plate')).filter,
    num: { box: box(q('.prm-val')), text: q('.prm-val').textContent, type: type(q('.prm-num')) }, unit: box(q('.prm-unit')),
    delta: { box: box(q('.prm-delta')), text: q('.prm-delta').textContent, type: type(q('.prm-delta')) },
    tag: box(q('.prm-tag')), sub: box(q('.prm-sub')), set: box(q('.prm-set')), acts: box(q('.prm-acts')), done: box(q('.prm-done')), text: q('.prm-stage').innerText };
});
// Without what moves: the plate, the number and the jump (their places kept).
await p.addStyleTag({ content: '.pr-moment .prm-plate, .pr-moment .prm-val, .pr-moment .prm-delta { visibility: hidden !important; }' });
await p.waitForTimeout(150);
await p.screenshot({ path: OUT + 'lifter-pr-base.png' });

// Done, the rest timer skipped, then Progress: his total with today's set in it, and the line that climbed to it.
await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /^Done$/.test(x.textContent.trim())); if (x) x.click(); });
await p.waitForTimeout(600);
await p.evaluate(() => { document.querySelectorAll('.pr-toast').forEach((e) => e.remove()); const s = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /^Skip$/.test(x.textContent.trim())); if (s) s.click(); });
await p.waitForTimeout(600);
await p.evaluate(() => { try { localStorage.setItem('powa-prog-chart', 'total'); sessionStorage.setItem('powa-prog-subtab', 'overview'); } catch (e) {} document.getElementById('tab-progress').click(); });
await p.waitForTimeout(1500);
const progSaid = await p.evaluate(() => (document.querySelector('.pg-hero') || {}).innerText || '');
if (!/656\s*kg[\s\S]*\+21 kg in 4 weeks[\s\S]*74 kg raw men/.test(progSaid)) throw new Error('site-capture: Progress reads ' + JSON.stringify(progSaid));
if (await p.evaluate(() => !!document.querySelector('.rest-dock:not([hidden]), .rest-bar.on'))) console.log('note: a rest timer is still docked');
await p.screenshot({ path: OUT + 'lifter-progress.png' });
const prog = await p.evaluate(() => {
  const box = (e) => { const r = e.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 10) / 10); };
  const svg = document.querySelector('.sc-svg'), vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect(), k = r.width / vb.width;
  const last = svg.querySelector('.sc-last').getBoundingClientRect();
  return { hero: box(document.querySelector('.pg-hero')), card: box(document.querySelector('.sc-card')), svg: box(svg), vb: [vb.width, vb.height],
    // The plot: the svg's top to the x labels' top (184 - 26 in its own units), with the last value's label.
    plot: [r.x, r.y, r.width, Math.round((vb.height - 26) * k * 10) / 10].map((v) => Math.round(v * 10) / 10), lastLabel: [last.x, last.y, last.width, last.height].map((v) => Math.round(v * 10) / 10),
    lifts: box([...document.querySelectorAll('.ui-label')].find((x) => /^Lifts$/.test(x.textContent.trim())) || document.body), tabbar: box(document.querySelector('.bottom-nav, .tabbar, nav.sidebar') || document.body),
    text: document.querySelector('.pg-hero').innerText };
});
// Without the line: its fill, the line, its last point and value (the dates under it stay).
await p.addStyleTag({ content: '.sc-svg > path, .sc-svg > circle, .sc-svg > .sc-last { visibility: hidden !important; }' });
await p.waitForTimeout(150);
await p.screenshot({ path: OUT + 'lifter-progress-base.png' });

writeFileSync(OUT + 'lifter-geo.json', JSON.stringify({ pr, prog, errs }, null, 1));
console.log('PR moment', JSON.stringify({ plate: pr.plate, num: pr.num, delta: pr.delta, acts: pr.acts, done: pr.done }));
console.log('Progress', JSON.stringify(prog));
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
