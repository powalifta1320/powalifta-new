// The Monday report's and Thursday check's server side, the parts that need no Deno: the push rules
// _shared/push-deliver.ts follows (the same as send-push's) and the grouping send-weekly-digest's coach
// jobs do before they hand rows to coach-report.js. Run under Node (type stripping).
// Run: node test/coach-jobs.test.mjs
import { CATEGORY_COL, prefColumn, isMuted, safePath, isPushHost, isApnsToken, collapseId } from '../supabase/functions/_shared/push-rules.ts';
import { chunk, rosterByCoach, indexByAthlete, pick, leanPrograms, unsubLink, maskEmail } from '../supabase/functions/send-weekly-digest/coach-jobs.ts';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

// ---------------------------------------------------------------- push rules
t('categories map to their switch; alerts is the coach\'s new one; anything else is never muted', () => {
  eq(CATEGORY_COL, { messages: 'push_messages', form_checks: 'push_form_checks', program: 'push_program', alerts: 'push_alerts' });
  eq([prefColumn('alerts'), prefColumn('form_checks'), prefColumn('buddy'), prefColumn(''), prefColumn('__proto__')], ['push_alerts', 'push_form_checks', null, null, null]);
});
t('muted only by an explicit false: no row, no column, null all send', () => {
  eq(isMuted({ push_alerts: false }, 'alerts'), true);
  eq([isMuted({ push_alerts: true }, 'alerts'), isMuted({ push_alerts: null }, 'alerts'), isMuted({}, 'alerts'), isMuted(null, 'alerts'), isMuted({ push_alerts: false }, 'buddy')], [false, false, false, false, false]);
});
t('a push opens our own path only (send-push\'s rule)', () => {
  eq(safePath('/coach.html?report=week'), '/coach.html?report=week');
  eq(safePath('/coach.html#x'), '/coach.html');
  eq([safePath('https://evil.test/x'), safePath('//evil.test'), safePath('/..//evil.test'), safePath('/\\evil.test'), safePath('javascript:alert(1)'), safePath(null)],
    ['/athlete.html', '/athlete.html', '/athlete.html', '/athlete.html', '/athlete.html', '/athlete.html']);
  eq(safePath('nope', '/coach.html'), '/coach.html');
});
t('web push endpoints only at the push services; APNs tokens are hex', () => {
  ok(isPushHost('https://fcm.googleapis.com/fcm/send/abc'), 'fcm');
  ok(isPushHost('https://web.push.apple.com/QW'), 'apple web push');
  ok(isPushHost('https://updates.push.services.mozilla.com/wpush/v2/x'), 'mozilla');
  ok(!isPushHost('https://evil.test/fcm.googleapis.com/'), 'look-alike');
  ok(!isPushHost('http://fcm.googleapis.com/x'), 'http');
  ok(isApnsToken('a'.repeat(64)) && !isApnsToken('xyz') && !isApnsToken('a'.repeat(63)) && !isApnsToken(null), 'apns');
});
t('a tag collapses repeats on iOS too, when it fits APNs\' 64 bytes', () => {
  eq(collapseId('powa-report'), 'powa-report');
  eq(collapseId('x'.repeat(65)), null);
  eq(collapseId(''), null);
  eq(collapseId('powa-pr-é'), null);   // ASCII only
});

// ---------------------------------------------------------------- the coach jobs' grouping
t('the roster by coach: linked lifters only, never a lifter coaching themselves', () => {
  const m = rosterByCoach([
    { id: 'a1', name: 'Ana', coach_id: 'c1' }, { id: 'a2', name: 'Ben', coach_id: 'c1' }, { id: 'a3', name: 'Cy', coach_id: 'c2' },
    { id: 's1', name: 'Solo', coach_id: null }, { id: 'c1', name: 'Coach', coach_id: null }, { id: 'w', name: 'Weird', coach_id: 'w' }, null
  ]);
  eq([...m.keys()].sort(), ['c1', 'c2']);
  eq(m.get('c1'), [{ id: 'a1', name: 'Ana' }, { id: 'a2', name: 'Ben' }]);
});
t('chunks of ids for .in() reads', () => {
  eq(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  eq(chunk([], 200), []);
});
t('rows by athlete, picked for a coach\'s lifters', () => {
  const idx = indexByAthlete([{ athlete_id: 'a1', v: 1 }, { athlete_id: 'a2', v: 2 }, { athlete_id: 'a1', v: 3 }, { v: 4 }]);
  eq(pick(idx, ['a1', 'zz']).map(r => r.v), [1, 3]);
  eq(pick(idx, []), []);
});
t('programs read lean: planned sessions worked out, the JSON dropped', () => {
  const weeks = [{ days: [{ exercises: [{ sets: [{ completed: false }] }] }, { exercises: [{ sets: [{ completed: false }] }] }, { exercises: [] }] }];
  const lean = leanPrograms([{ athlete_id: 'a1', coach_id: 'c1', updated_at: 'u', weeks }, { athlete_id: 'a2', coach_id: 'c1', updated_at: 'u', weeks: JSON.stringify(weeks) }, { athlete_id: 'a3', weeks: null }]);
  eq(lean, [{ athlete_id: 'a1', coach_id: 'c1', updated_at: 'u', planned: 2 }, { athlete_id: 'a2', coach_id: 'c1', updated_at: 'u', planned: 2 }, { athlete_id: 'a3', coach_id: null, updated_at: null, planned: 0 }]);
  ok(!('weeks' in lean[0]), 'no JSON kept');
});
t('the unsubscribe link: the coach\'s token, marked as the Monday report', () => {
  eq(unsubLink('https://powalifta.com/unsubscribe.html?token=', '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed'), 'https://powalifta.com/unsubscribe.html?token=1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed&r=coach');
  eq(unsubLink('https://powalifta.com/unsubscribe.html?token=', null), '');
  eq(unsubLink('https://x.test/u/', 'a&b'), 'https://x.test/u/a%26b');
});
t('dry-run previews show a coach\'s email masked', () => {
  eq([maskEmail('mia.coach@gmail.com'), maskEmail('a@b.co'), maskEmail('nope'), maskEmail(null)], ['m•••h@gmail.com', 'a•••@b.co', '', '']);
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
