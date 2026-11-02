// coach-report-ui.js's time-zone sync under Node, awaited (tests.html's runner doesn't await): once a load, a coach's
// pick is read and this device's time zone saved when theirs is none or another; never in the demo, for a lifter or
// signed out; never before the schedule's migration; a failing read or write never throws.
// Run: node test/coach-report-ui.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
globalThis.window = globalThis;
(0, eval)(fs.readFileSync(path.join(ROOT, 'coach-report.js'), 'utf8'));
(0, eval)(fs.readFileSync(path.join(ROOT, 'coach-report-ui.js'), 'utf8'));
const U = globalThis.CoachReportUI;

let pass = 0, fail = 0;
const t = async (name, fn) => { try { await fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const fakeDb = (row, o) => {
  o = o || {};
  const calls = { get: 0, update: [] };
  return { calls,
    getEmailPrefs: async () => { calls.get++; if (o.readFails) throw new Error('offline'); return row; },
    updateEmailPrefs: async (id, patch) => { calls.update.push([id, patch]); if (o.writeFails) throw new Error('offline'); return row; } };
};
const coach = { id: 'c1', userType: 'coach' };
const sync = (db, o) => U.syncSchedule(Object.assign({ user: coach, db, tz: 'Europe/London', demo: false, force: true }, o));

await t('a coach with no zone: one read, this device\'s zone saved, the pick kept; the same load asks no more', async () => {
  const db = fakeDb({ reportDay: 'mon', reportHour: 7, tz: null, scheduleReady: true });
  await sync(db);
  await U.syncSchedule({ user: coach, db, tz: 'Europe/London', demo: false });
  eq([db.calls.get, db.calls.update], [1, [['c1', { tz: 'Europe/London' }]]]);
  eq(U.schedule(), { day: 'mon', hour: 7, tz: 'Europe/London', ready: true });
});
await t('the same zone: no write; another (travelling): the new one', async () => {
  const same = fakeDb({ reportDay: 'sun', reportHour: 18, tz: 'Europe/London', scheduleReady: true });
  await sync(same);
  eq(same.calls.update, []);
  const moved = fakeDb({ reportDay: 'sun', reportHour: 18, tz: 'Europe/London', scheduleReady: true });
  await sync(moved, { tz: 'America/New_York' });
  eq(moved.calls.update, [['c1', { tz: 'America/New_York' }]]);
});
await t('the demo, a lifter, signed out: nothing read, nothing written', async () => {
  for (const o of [{ demo: true }, { user: { id: 'a1', userType: 'athlete' } }, { user: null }]) {
    const db = fakeDb({ tz: null, scheduleReady: true });
    await sync(db, o);
    eq([db.calls.get, db.calls.update.length], [0, 0], JSON.stringify(o));
  }
});
await t('before the schedule\'s migration, or a zone the browser doesn\'t know: read, nothing written', async () => {
  const old = fakeDb({ tz: null, scheduleReady: false });
  await sync(old);
  eq([old.calls.get, old.calls.update.length, U.schedule().ready], [1, 0, false]);
  const odd = fakeDb({ tz: null, scheduleReady: true });
  await sync(odd, { tz: 'Not/AZone' });
  eq(odd.calls.update.length, 0);
});
await t('a failing read or write never throws: the report keeps Sunday 18:00', async () => {
  U.setSchedule({});
  const r1 = await sync(fakeDb(null, { readFails: true }));
  eq([r1.day, r1.hour], ['sun', 18]);
  const w = fakeDb({ tz: null, scheduleReady: true }, { writeFails: true });
  const r2 = await sync(w);
  eq([w.calls.update.length, r2.tz], [1, null], 'tried once, not saved');
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
