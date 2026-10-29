// -> thread-before.png, thread-after.png: site-img/home/thread-*, thread-reply, thread-seen, thread-sent (mkimg.py thread).
// Arjun's thread with his coach (the real lifter app, Coach tab, iPhone app layout, dark, 393x852 at 3x):
// his top set sent as a card at 10:42, then (after) "Seen · 10:43" and Sam's reply at 10:44.
import { writeFileSync } from 'node:fs';
import { launch, phoneCtx, safeAreas, patchDemo, BASE, CAP as OUT } from './lib.mjs';
const DPR = Number(process.env.DPR || 3);
const b = await launch();
async function shoot(stage) {
  const ctx = await phoneCtx(b, { theme: 'dark', dpr: DPR }); await patchDemo(ctx);
  const p = await ctx.newPage(); await safeAreas(ctx, p);
  const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
  await p.goto(BASE + 'athlete.html?demo=1', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(1800);
  const info = await p.evaluate((stage) => {
    const s = Store.get(); const t = todayISO(); const me = user.id;
    const coachId = (s.athletes || []).length ? null : null;
    const msgs = (s.messages || []);
    const anyCoach = msgs.find((m) => m.senderId !== me) || {};
    const DC = anyCoach.senderId || (msgs[0] && msgs[0].coachId);
    Store.update((st) => {
      const n = (st.sessionNotes || []).find((x) => x.id === 'demo-note-today');
      if (n) n.coachComment = 'Top set today is 182.5 for 5 at 8. Film it and send it over, I want eyes on your brace out of the hole.';
      st.messages = (st.messages || []).filter((m) => !/^pg-/.test(m.id));
      st.messages.push({ id: 'pg-set', coachId: DC, athleteId: me, senderId: me, body: 'Competition Squat: 182.5 kg × 5 @ RPE 8 (e1RM 228 kg)', meta: { type: 'set', lift: 'squat', name: 'Competition Squat', weightKg: 182.5, reps: 5, rpe: 8, e1rmKg: 228.07, pr: true }, createdAt: t + 'T10:42:00Z', readAt: stage === 'after' ? t + 'T10:43:00Z' : null });
      if (stage === 'after') st.messages.push({ id: 'pg-reply', coachId: DC, athleteId: me, senderId: DC, body: 'PR by 5, and right on the 8 I wrote. Same weight next week, then we push.', createdAt: t + 'T10:44:00Z', readAt: null });
    });
    return { me, DC, n: msgs.length, ids: msgs.map((m) => m.id).slice(-6) };
  }, stage);
  await p.evaluate(() => { const x = [...document.querySelectorAll('button, a')].find((x) => x.offsetParent && /^Coach$/.test(x.innerText.trim())); if (x) x.click(); });
  await p.waitForTimeout(1600);
  // the list scrolls to its end, as the app does on a new message
  await p.evaluate(() => { document.querySelectorAll('.msg-list, [class*="msg-list"], .msgs').forEach((l) => { l.scrollTop = l.scrollHeight; }); window.scrollTo(0, document.body.scrollHeight); });
  await p.waitForTimeout(700);
  await p.screenshot({ path: OUT + 'thread-' + stage + '.png' });
  const geo = await p.evaluate(() => {
    const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
    const rows = [...document.querySelectorAll('.msg-row, .msg-status, .msg-daysep, .msg-note')].filter((e) => { const b = e.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; }).map((e) => ({ cls: e.className, t: e.innerText.replace(/\s+/g, ' ').slice(0, 60), rect: r(e) }));
    const head = r(document.querySelector('.pane.active .pane-head, .coach-head, header, .app-head'));
    const comp = r([...document.querySelectorAll('textarea, input')].find((x) => /Message/i.test(x.placeholder || '')));
    const tab = r(document.querySelector('.tabbar, .tab-bar, nav.bottom, .bottom-nav, .bnav'));
    return { rows, head, comp, tab, scrollY };
  });
  await ctx.close();
  return { info, geo, errs };
}
const res = { before: await shoot('before'), after: await shoot('after') };
writeFileSync(OUT + 'thread.json', JSON.stringify(res, null, 1));
for (const k of ['before', 'after']) { console.log(k, JSON.stringify(res[k].info), res[k].errs.join('|') || 'clean'); res[k].geo.rows.forEach((x) => console.log('  ', x.cls.slice(0, 30), x.rect.join(','), x.t)); console.log('  comp', res[k].geo.comp, 'tab', res[k].geo.tab, 'head', res[k].geo.head); }
await b.close(); process.exit(0);
