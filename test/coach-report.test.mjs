// The coach's week (coach-report.js), run under Node: the core the app, the push and the Monday email
// share, the server's copy of it, and the job a cron run picks. No Deno, no network.
// Run: node test/coach-report.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { world, storeFor, rowsFor as worldRows } from './coach-report-fixture.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

const WEB = path.join(ROOT, 'coach-report.js'), SRV = path.join(ROOT, 'supabase/functions/_shared/coach-report.js');
t('the server copy is byte-identical to the app copy', () => {
  ok(fs.existsSync(WEB), 'coach-report.js is missing');
  ok(fs.existsSync(SRV), 'supabase/functions/_shared/coach-report.js is missing');
  ok(fs.readFileSync(WEB).equals(fs.readFileSync(SRV)), 'the two copies differ: copy coach-report.js over the server one');
});
try { await import(WEB); } catch (e) { console.log('LOAD', e.message); }
const CR = globalThis.CoachReport;
t('loads as a side-effect script and sets globalThis.CoachReport', () => ok(CR && typeof CR.teamWeek === 'function', 'no CoachReport'));
if (!CR) { console.log(`\nRESULT: ${pass} passed, ${fail + 1} failed`); process.exit(1); }

// ---------------------------------------------------------------- fixtures
// A block: `perWeek` days with one exercise of three sets, 4 weeks, the first `doneWeeks` all logged.
const block = (perWeek, doneWeeks, opts = {}) => Array.from({ length: 4 }, (_, wi) => ({
  number: wi + 1,
  days: Array.from({ length: perWeek + (opts.restDay ? 1 : 0) }, (_, di) => ({
    name: di === perWeek ? 'Rest' : 'Day ' + (di + 1),
    exercises: di === perWeek ? [] : [{ lift: 'squat', sets: Array.from({ length: 3 }, () => ({ weight: 100, reps: 5, rpe: 8, completed: wi < doneWeeks, skipped: false })) }]
  }))
}));
const TODAY = '2026-10-26';   // a Monday: the report covers 19–25 Oct
const A = [
  { id: 'a1', name: 'Arjun Mehta' }, { id: 'a2', name: 'Tom Becker' }, { id: 'a3', name: 'Leo Park' }, { id: 'a4', name: 'Sarah Kim' },
  { id: 'a5', name: 'Nina Petrova' }, { id: 'a6', name: 'Priya Shah' }, { id: 'a7', name: 'Kofi Mensah' }, { id: 'a8', name: 'Tom Kowalski' }
];
const PROGRAMS = { a1: block(4, 1), a2: block(4, 1), a3: block(3, 0, { restDay: true }), a4: block(3, 1), a6: block(4, 1), a7: block(3, 4), a8: block(3, 0) };
// The log: [athlete, date, lift, e1rmComp]
const LOGS = [
  ['a1', '2026-09-28', 'squat', 200], ['a1', '2026-10-01', 'bench', 140], ['a1', '2026-10-19', 'squat', 205.2], ['a1', '2026-10-20', 'bench', 139],
  ['a1', '2026-10-22', 'deadlift', 250], ['a1', '2026-10-24', 'squat', 201], ['a1', '2026-10-26', 'squat', 230],   // the 26th is after the week
  ['a2', '2026-10-21', 'squat', 160], ['a2', '2026-10-21', 'bench', 100], ['a2', '2026-10-01', 'squat', 170],
  ['a4', '2026-10-20', 'bench', 80], ['a4', '2026-10-23', 'bench', 80.04],                                       // +0.04 over is not a PR
  ['a6', '2026-10-19', 'squat', 150], ['a6', '2026-10-21', 'squat', 150],
  ['a7', '2026-10-25', 'deadlift', 190],
  ['a3', '2026-10-12', 'squat', 120]
];
const PAINS = [
  { athleteId: 'a4', day: '2026-10-20', bodyPart: 'knee' }, { athleteId: 'a4', day: '2026-10-23', bodyPart: 'knee' },
  { athleteId: 'a4', day: '2026-10-21', bodyPart: 'hip', resolvedAt: '2026-10-22T10:00:00Z' },   // resolved: not news
  { athleteId: 'a2', day: '2026-10-12', bodyPart: 'low_back' }                                    // before the week
];
const CHECKINS = [{ athleteId: 'a5', createdAt: '2026-10-05T09:00:00Z' }, { athleteId: 'a1', createdAt: '2026-10-05T09:00:00Z' }, { athleteId: 'a1', createdAt: '2026-10-21T09:00:00Z' }];
const ANSWERS = [{ athleteId: 'a3', period: '2026-08-01' }];   // checked in, but long ago: not "missing"
const FORMCHECKS = [{ athleteId: 'a3', coachReply: null }, { athleteId: 'a3', coachReply: null }, { athleteId: 'a1', coachReply: 'Hips up' }, { athleteId: 'zz', coachReply: null }];
const BILLING = [
  { athleteId: 'a2', coachId: 'c1', amountCents: 22000, currency: 'USD', nextDue: '2026-10-20', status: 'active' },
  { athleteId: 'a3', coachId: 'c1', amountCents: 9000, currency: 'EUR', nextDue: '2026-10-25', status: 'active' },
  { athleteId: 'a4', coachId: 'c1', amountCents: 15000, currency: 'USD', nextDue: '2026-10-01', status: 'paused' },
  { athleteId: 'a5', coachId: 'c1', amountCents: 15000, currency: 'USD', nextDue: '2026-11-01', status: 'active' }
];
const MEETS = [
  { athleteId: 'a1', name: 'Autumn Open', date: '2026-11-07' }, { athleteId: 'a2', name: 'autumn open ', date: '2026-11-07' },
  { athleteId: 'a4', name: 'Winter Classic', date: '2026-12-20' }, { athleteId: 'a6', name: 'Spring Cup', date: '2026-10-10' }
];
const BUSY = [{ athleteId: 'a6', weekStart: '2026-10-19', days: 2, status: 'approved' }, { athleteId: 'a2', weekStart: '2026-10-19', days: 1, status: 'pending' }];
const store = {
  athletes: A.map(a => Object.assign({ coachId: 'c1' }, a)).concat([{ id: 'x1', name: 'Other Coach Lifter', coachId: 'c2' }]),
  programs: Object.keys(PROGRAMS).map(id => ({ athleteId: id, weeks: PROGRAMS[id] })),
  workoutLogs: LOGS.map(([athleteId, date, lift, e1rmComp], i) => ({ id: 'l' + i, athleteId, date, lift, e1rmComp })).concat([{ athleteId: 'x1', date: '2026-10-20', lift: 'squat', e1rmComp: 300 }]),
  painReports: PAINS, checkins: CHECKINS, checkinAnswers: ANSWERS, clientBilling: BILLING, meets: MEETS, scheduleRequests: BUSY
};
// The same fixture as the edge function reads it (snake_case + coach_week_stats rows).
function statsFor(from, to) {
  const rFrom = CR.addDays(to, -27), pFrom = CR.addDays(to, -55);
  return A.map(a => {
    const mine = LOGS.filter(l => l[0] === a.id && l[1] <= to);
    const lifts = {};
    mine.forEach(([, d, L, e]) => {
      const x = lifts[L] || (lifts[L] = { during: null, before: null, recent: null, prior: null });
      if (d >= from) x.during = Math.max(x.during || 0, e); else x.before = Math.max(x.before || 0, e);
      if (d >= rFrom) x.recent = Math.max(x.recent || 0, e); else if (d >= pFrom) x.prior = Math.max(x.prior || 0, e);
    });
    return { athlete_id: a.id, sessions: new Set(mine.filter(l => l[1] >= from).map(l => l[1])).size, lifts };
  });
}
const rowsFor = (from, to) => ({
  athletes: A.slice(),
  programs: Object.keys(PROGRAMS).map(id => ({ athlete_id: id, coach_id: 'c1', weeks: JSON.stringify(PROGRAMS[id]), updated_at: '2026-10-01T00:00:00Z' }))
    .concat([{ athlete_id: 'a1', coach_id: 'c9', weeks: [], updated_at: '2026-10-25T00:00:00Z' }]),   // someone else's program: the coach's own wins
  stats: statsFor(from, to),
  statsBefore: statsFor(CR.addDays(from, -7), CR.addDays(to, -7)),
  pains: PAINS.map(p => ({ athlete_id: p.athleteId, day: p.day, body_part: p.bodyPart, resolved_at: p.resolvedAt || null })),
  checkins: CHECKINS.map(c => ({ athlete_id: c.athleteId, created_at: c.createdAt })),
  checkinAnswers: ANSWERS.map(a => ({ athlete_id: a.athleteId, period: a.period })),
  formChecks: FORMCHECKS.map(f => ({ athlete_id: f.athleteId, coach_reply: f.coachReply })),
  billing: BILLING.map(b => ({ athlete_id: b.athleteId, coach_id: b.coachId, amount_cents: b.amountCents, currency: b.currency, next_due: b.nextDue, status: b.status })),
  meets: MEETS.map(m => ({ athlete_id: m.athleteId, name: m.name, meet_date: m.date })),
  busy: BUSY.map(b => ({ athlete_id: b.athleteId, week_start: b.weekStart, days: b.days, status: b.status }))
});

// ---------------------------------------------------------------- dates
t('the report week is last Monday to last Sunday, whatever day it runs', () => {
  eq(CR.lastWeek('2026-10-26'), { from: '2026-10-19', to: '2026-10-25', today: '2026-10-26' });
  eq(CR.lastWeek('2026-10-27').from, '2026-10-19');
  eq(CR.lastWeek('2026-11-01').to, '2026-10-25');                // a Sunday: still the week before
  eq(CR.lastWeek('2026-01-05'), { from: '2025-12-29', to: '2026-01-04', today: '2026-01-05' });
  eq(CR.weekSoFar('2026-10-29'), { from: '2026-10-26', to: '2026-10-29', today: '2026-10-29' });
});
t('labels: a week range, a day, how soon', () => {
  eq(CR.rangeLabel('2026-10-19', '2026-10-25'), '19–25 Oct');
  eq(CR.rangeLabel('2026-09-28', '2026-10-04'), '28 Sep – 4 Oct');
  eq(CR.dayLabel('2026-11-07'), 'Sat 7 Nov');
  eq([0, 1, 12, 21, 28].map(CR.whenText), ['today', 'tomorrow', 'in 12 days', 'in 3 weeks', 'in 4 weeks']);
});

// ---------------------------------------------------------------- sessions planned
t('planned sessions: the first week with a set still to do, days with work only', () => {
  eq(CR.plannedPerWeek(block(4, 1)), 4);
  eq(CR.plannedPerWeek(block(3, 0, { restDay: true })), 3);   // a rest day has no sets
  eq(CR.plannedPerWeek(JSON.stringify(block(5, 2))), 5);      // the database's JSON text
  eq(CR.plannedPerWeek([]), 0); eq(CR.plannedPerWeek(null), 0); eq(CR.plannedPerWeek('not json'), 0);
});
t('planned sessions: skipped sets are done; a finished block plans nothing', () => {
  const w = block(3, 0); w.forEach(wk => wk.days.forEach(d => d.exercises.forEach(e => e.sets.forEach(s => { s.skipped = true; }))));
  eq(CR.plannedPerWeek(w), 0);
  eq(CR.plannedPerWeek(block(3, 4)), 0);
  const mixed = block(4, 0); mixed[0].days[0].exercises[0].sets.forEach(s => { s.completed = true; });   // day 1 done, the rest to do
  eq(CR.plannedPerWeek(mixed), 4);
});

// ---------------------------------------------------------------- PRs
t('a PR beats a real earlier best by more than 0.05 kg', () => {
  const p = CR.prsFromStats([
    { athleteId: 'a', lifts: { squat: { during: 205, before: 200 }, bench: { during: 100.04, before: 100 }, deadlift: { during: 180, before: null } } },
    { athleteId: 'b', lifts: { squat: { during: null, before: 200 }, ohp: { during: 90, before: 50 } } }, null, { athleteId: 'c' }
  ]);
  eq(p, [{ athleteId: 'a', lift: 'squat', e1rm: 205, before: 200 }]);
});

// ---------------------------------------------------------------- the team's week
const W = CR.lastWeek(TODAY);
const team = CR.teamWeek(CR.fromStore(store, 'c1', Object.assign({ formChecks: FORMCHECKS }, W)), W);
t('the roster and who trained', () => {
  eq(team.of, 8); eq(team.trained, 5);                    // a1, a2, a4, a6, a7
  eq([team.sessionsDone, team.sessionsPlanned], [9, 19]); // capped at each plan; a6's agreed busy week plans 2
});
t('behind: none of their sessions, or two or more short; worst first', () => {
  eq(team.behind.map(b => [b.id, b.done, b.planned]), [['a3', 0, 3], ['a8', 0, 3], ['a2', 1, 4]]);
  ok(!team.behind.some(b => b.id === 'a4'), 'one short (2 of 3) is not behind');
  ok(!team.behind.some(b => b.id === 'a7'), 'a finished block is not behind');
  ok(!team.behind.some(b => b.id === 'a6'), 'an agreed busy week (2 of 2) is not behind');
});
t('pain: who and how often in the week, open reports only', () => eq(team.pain.map(p => [p.id, p.n]), [['a4', 2]]));
t('PRs: the week\'s best against the best before it', () => eq(team.prs.map(p => [p.id, p.lift, p.e1rm]), [['a1', 'squat', 205.2]]));
t('form checks waiting, roster only', () => { eq(team.formChecks, 2); eq(team.formCheckWho, [{ id: 'a3', name: 'Leo Park', n: 2 }]); });
t('check-ins missing: checked in during the month before, not last week', () => eq(team.checkinsMissing.map(c => c.id), ['a5']));
t('meets in the next 8 weeks, one entry per meet', () => {
  eq(team.meets.map(m => [m.name, m.date, m.days, m.lifters.map(l => l.id)]), [['Autumn Open', '2026-11-07', 12, ['a1', 'a2']], ['Winter Classic', '2026-12-20', 55, ['a4']]]);
});
t('money: overdue on the coach\'s record, totalled in the most common currency', () => {
  eq([team.overdue.n, team.overdue.total, team.overdue.currency, team.overdue.mixed], [2, 22000, 'USD', true]);
  eq(team.overdue.who.map(w => [w.id, w.daysLate]), [['a2', 6], ['a3', 1]]);
});
t('the app and the server build the same week from the same data', () => {
  const srv = CR.teamWeek(CR.fromRows(rowsFor(W.from, W.to), { coachId: 'c1', today: TODAY }), W);
  eq(srv, team);
});
t('the server may hand over planned sessions instead of the block (it drops the JSON as it reads)', () => {
  const rows = rowsFor(W.from, W.to);
  rows.programs = rows.programs.map(p => ({ athlete_id: p.athlete_id, coach_id: p.coach_id, updated_at: p.updated_at, planned: CR.plannedPerWeek(p.weeks), weeks_left: CR.weeksLeft(p.weeks) }));
  eq(CR.teamWeek(CR.fromRows(rows, { coachId: 'c1', today: TODAY }), W), team);
  const S = CR.weekSoFar('2026-10-29');
  const lean = Object.assign(CR.fromRows(rows, { coachId: 'c1', today: '2026-10-29' }), { sessions: { a1: 2, a3: 1, a6: 1 } });
  eq(CR.midweekBehind(lean, '2026-10-29').map(x => [x.id, x.planned]), [['a2', 4], ['a4', 3], ['a8', 3]]);
});
t('an empty roster, and a lifter with nothing at all', () => {
  const none = CR.teamWeek({}, W);
  eq([none.of, none.trained, none.behind.length, none.overdue.n], [0, 0, 0, 0]);
  eq(CR.reportPush(none), null);
  eq(CR.worthSending(none), false);
  const one = CR.teamWeek({ athletes: [{ id: 'q', name: '' }] }, W);
  eq([one.of, one.trained, one.sessionsPlanned], [1, 0, 0]);
  eq(CR.worthSending(one), false);   // nobody trained, nothing waiting: a dormant team gets no email
});
t('worth sending, needs count and who to start with', () => {
  eq(CR.worthSending(team), true);
  eq(CR.needsCount(team), 5);         // a4 pain, a3 + a8 + a2 behind, a3 form checks, a5 check-in
  eq(CR.firstUp(team), { id: 'a4', name: 'Sarah Kim' });
});

// ---------------------------------------------------------------- the Thursday check
t('Thursday: Mon–Wed gone, floor(planned × 3/7) expected, worst first; two Toms told apart', () => {
  const S = CR.weekSoFar('2026-10-29');
  const input = Object.assign(CR.fromStore(store, 'c1', S), { sessions: { a1: 2, a2: 0, a3: 1, a4: 0, a6: 0, a8: 0 } });
  input.busy = CR.busyRows([{ athleteId: 'a6', weekStart: '2026-10-26', days: 1 }]);
  const list = CR.midweekBehind(input, '2026-10-29');
  eq(list.map(x => [x.id, x.done, x.planned, x.expected]), [['a2', 0, 4, 1], ['a4', 0, 3, 1], ['a8', 0, 3, 1]]);
  eq(CR.midweekPush(list), { title: '3 lifters haven’t trained this week', body: 'Tom B. 0 of 4 · Sarah 0 of 3 · Tom K. 0 of 3' });
});
t('Thursday push: one lifter by name; behind but not idle; more than three', () => {
  eq(CR.midweekPush([{ id: 'a', name: 'Tom Becker', done: 0, planned: 4 }]), { title: 'Tom hasn’t trained this week', body: '0 of 4 sessions so far' });
  eq(CR.midweekPush([{ id: 'a', name: 'Leo Park', done: 1, planned: 6 }]), { title: 'Leo is behind this week', body: '1 of 6 sessions so far' });
  const four = [['Tom', 0, 4], ['Leo', 0, 3], ['Ana', 1, 6], ['Dev', 0, 3]].map(([name, done, planned], i) => ({ id: 'i' + i, name, done, planned }));
  eq(CR.midweekPush(four), { title: '4 lifters are behind this week', body: 'Tom 0 of 4 · Leo 0 of 3 · Ana 1 of 6 · +1 more' });
  eq(CR.midweekPush([]), null);
});

// ---------------------------------------------------------------- the Monday push
t('Monday push: trained, PRs, behind', () => {
  eq(CR.reportPush(team), { title: 'Your team’s week', body: '5 of 8 trained · 1 PR · 3 behind' });
  const calm = Object.assign({}, team, { prs: [], behind: [] });
  eq(CR.reportPush(calm).body, '5 of 8 trained');
  eq(CR.reportPush(Object.assign({}, team, { prs: [1, 2, 3, 4].map(() => team.prs[0]), behind: [] })).body, '5 of 8 trained · 4 PRs');
});

// ---------------------------------------------------------------- the Monday email
const mail = CR.reportEmail(team, { coachName: 'Mia Coach', unsubUrl: 'https://powalifta.com/unsubscribe.html?token=t&r=coach', appUrl: 'https://www.powalifta.com/coach.html', unit: 'kg' });
t('email: subject is the push, sections in the coach\'s triage order', () => {
  eq(mail.subject, 'Your team’s week: 5 of 8 trained · 1 PR · 3 behind');
  const at = (s) => mail.html.indexOf(s);
  ok(at('Needs you') > 0 && at('Needs you') < at('Wins') && at('Wins') < at('>Meets') && at('>Meets') < at('Next week to write') && at('Next week to write') < at('Money and roster') && at('Money and roster') < at('Every lifter'), 'order');
  ok(at('Pain reported') < at('Behind') && at('Behind') < at('form checks to review') && at('form checks to review') < at('No check-in last week'), 'needs-you order');
});
t('email: one red button, Open Today, to the app', () => {
  eq((mail.html.match(/background:#ff3b4a/g) || []).length, 1);
  eq((mail.html.match(/>Open Today</g) || []).length, 1);
  ok(mail.html.includes('href="https://www.powalifta.com/coach.html"'), 'app link');
  ok(mail.text.includes('Open Today: https://www.powalifta.com/coach.html'), 'text link');
});
t('email: the numbers a coach decides on', () => {
  ok(/Wins <span[^>]*>1 e1RM PR<\/span>/.test(mail.html), 'Wins counts the PRs'); ok(/Squat <span[^>]*>205 kg<\/span>/.test(mail.html), 'the PR: lift and e1RM in kg');
  ok(mail.text.includes('Wins (e1RM PRs)\n- Arjun Mehta: squat 205 kg'), 'the PR in the text');
  ok(mail.text.includes('Behind: Leo Park 0 of 3, Tom Kowalski 0 of 3, Tom Becker 1 of 4'), 'behind in the text');
  ok(mail.text.includes('2 payments overdue: $220 (plus other currencies)'), 'money');
  ok(mail.text.includes('- Autumn Open, Sat 7 Nov (in 12 days)\n  Arjun Mehta\n  Tom Becker\n'), 'the meet');
  ok(mail.preheader === '5 lifters need you this week, starting with Sarah Kim.', mail.preheader);
});
t('email: one row per lifter in Wins, each PR with its lift', () => {
  const two = CR.teamWeek({ athletes: [{ id: 'k', name: 'Kenji Sato' }], sessions: { k: 4 }, prs: [{ athleteId: 'k', lift: 'deadlift', e1rm: 245 }, { athleteId: 'k', lift: 'bench', e1rm: 150 }] }, W);
  const m = CR.reportEmail(two, {});
  const wins = m.html.slice(m.html.indexOf('>Wins'), m.html.indexOf('>Every lifter'));
  eq((wins.match(/>Kenji Sato</g) || []).length, 1, 'the name once in Wins');
  ok(m.html.indexOf('Bench <span') < m.html.indexOf('Deadlift <span'), 'lifts in squat, bench, deadlift order');
  ok(m.text.includes('- Kenji Sato: bench 150 kg, deadlift 245 kg'), m.text);
});
t('email: a big team stays short (8 names a line, 8 PR rows, then how many more)', () => {
  const people = Array.from({ length: 30 }, (_, i) => ({ id: 'p' + i, name: 'Lifter ' + String(i).padStart(2, '0') }));
  const big = CR.teamWeek({ athletes: people, programs: people.map(a => ({ athleteId: a.id, planned: 3 })), sessions: { p0: 3 },
    prs: people.slice(0, 12).map(a => ({ athleteId: a.id, lift: 'squat', e1rm: 150 })) }, W);
  eq(big.behind.length, 29);
  const m = CR.reportEmail(big, {});
  ok(m.html.includes('and 21 more'), 'behind: 8 names, then and 21 more');
  ok(!m.html.includes('Lifter 29'), 'no 29th name');
  eq((m.html.match(/Squat <span/g) || []).length, 8, 'eight PR rows');
  ok(m.html.includes('4 more lifters with PRs'), 'then how many more');
  ok(m.text.includes('and 21 more'), 'the text too');
});
t('email: every name and link is escaped', () => {
  const evil = CR.teamWeek(CR.fromStore({
    athletes: [{ id: 'e', coachId: 'c', name: '<img src=x onerror=alert(1)> "Q" & co' }],
    workoutLogs: [{ athleteId: 'e', date: '2026-10-20', lift: 'squat', e1rmComp: 100 }],
    meets: [{ athleteId: 'e', name: '<script>x()</script>', date: '2026-11-01' }]
  }, 'c', W), W);
  const m = CR.reportEmail(evil, { coachName: '<b>Boss</b>', unsubUrl: 'https://x.test/u?token="><script>', appUrl: 'https://www.powalifta.com/coach.html' });
  ok(!/<img src=x/.test(m.html) && !/<script>/.test(m.html) && !/<b>Boss/.test(m.html), 'raw HTML leaked');
  ok(m.html.includes('&lt;img src=x onerror=alert(1)&gt; &quot;Q&quot; &amp; co'), 'name escaped');
  ok(m.html.includes('href="https://x.test/u?token=&quot;&gt;&lt;script&gt;"'), 'unsubscribe link escaped');
});
t('email: empty sections are left out; a calm week says so', () => {
  const calm = CR.teamWeek({ athletes: [{ id: 'z', name: 'Zoe' }], sessions: { z: 3 }, programs: [{ athleteId: 'z', weeks: block(3, 0) }] }, W);
  const m = CR.reportEmail(calm, {});
  ['Wins', 'Meets', 'Money and roster', 'Strength', 'Effort', 'Next week to write'].forEach(sec => ok(!m.html.includes('>' + sec), 'empty section shown: ' + sec));
  ok(m.html.includes('>Every lifter'), 'every lifter, always');
  ok(m.html.includes('Everyone trained as planned.'), 'calm line');
  eq(m.preheader, 'Nobody needs you this week.');
});
t('email and push never name the body part', () => {
  const srvTeam = CR.teamWeek(CR.fromRows(rowsFor(W.from, W.to), { coachId: 'c1', today: TODAY }), W);
  const m = CR.reportEmail(srvTeam, { coachName: 'Mia' });
  const all = [m.subject, m.html, m.text, m.preheader, JSON.stringify(CR.reportPush(srvTeam))].join(' ');
  ['neck', 'shoulder', 'chest', 'upper back', 'elbow', 'wrist', 'low back', 'low_back', 'hip', 'knee', 'ankle'].forEach(p => ok(!new RegExp('\\b' + p + '\\b', 'i').test(all), 'mentions ' + p));
});
t('email in lbs', () => {
  const m = CR.reportEmail(team, { unit: 'lbs' });
  ok(m.html.includes('452 lbs'), 'e1RM 205.2 kg = 452 lbs');
});

// ================================================================ v2 (2 Nov): more of what a coach decides on
// The world of test/coach-report-fixture.mjs: Sam Ellis and the demo team (20), Mia (3, the free plan full, lbs), Big
// Barbell (60), Dan (5, no billing, no meets), a dormant coach. Monday 2 Nov: the report covers 26 Oct to 1 Nov.
const WD = world(), W2 = CR.lastWeek(WD.today);
const UNIT = { 'c-mia': 'lbs' };
const optOf = (c) => Object.assign({ now: WD.now, unit: UNIT[c] || 'kg' }, W2);
const appTeamOf = (c) => { const s = storeFor(WD.tables, c); return CR.teamWeek(CR.fromStore(s.store, c, Object.assign({ formChecks: s.formChecks, plan: s.plan, now: WD.now }, W2)), optOf(c)); };
const srvTeamOf = (c) => CR.teamWeek(CR.fromRows(worldRows(CR, WD.tables, c, W2), { coachId: c, today: WD.today, now: WD.now }), optOf(c));
const COACHES = ['c-sam', 'c-mia', 'c-big', 'c-dan', 'c-quiet'];
const TEAMS = {};
COACHES.forEach(c => { TEAMS[c] = appTeamOf(c); });
const sam = TEAMS['c-sam'];
const mailOf = (c) => CR.reportEmail(TEAMS[c], { coachName: 'Coach', unit: UNIT[c] || 'kg', unsubUrl: 'https://powalifta.com/unsubscribe.html?token=t&r=coach', appUrl: 'https://www.powalifta.com/coach.html' });

t('v2: the app and the server build the same week for every coach (20, 3, 60 lifters, no billing or meets, dormant)', () => {
  COACHES.forEach(c => eq(srvTeamOf(c), TEAMS[c], c));
  eq(COACHES.map(c => TEAMS[c].of), [20, 3, 60, 5, 2]);
});
t('a dormant team gets no report; every other coach does', () => {
  eq(COACHES.map(c => CR.worthSending(TEAMS[c])), [true, true, true, true, false]);
  // A meet more than 4 weeks out doesn't wake a quiet team up (v1's window), but shows in Meets.
  const far = CR.teamWeek({ athletes: [{ id: 'z', name: 'Zoe' }], meets: [{ athleteId: 'z', name: 'Far Open', date: CR.addDays(W2.today, 40) }] }, optOf('x'));
  eq([far.meets.length, CR.worthSending(far)], [1, false]);
  const near = CR.teamWeek({ athletes: [{ id: 'z', name: 'Zoe' }], meets: [{ athleteId: 'z', name: 'Near Open', date: CR.addDays(W2.today, 20) }] }, optOf('x'));
  eq(CR.worthSending(near), true);
  const wrote = CR.teamWeek({ athletes: [{ id: 'z', name: 'Zoe' }], threads: [{ athleteId: 'z', lastAt: new Date(WD.now - 30 * 3600000).toISOString(), lastSenderId: 'z' }] }, optOf('x'));
  eq(CR.worthSending(wrote), true, 'their words waiting are worth a Monday');
});

// ---------------------------------------------------------------- 1. week over week
t('week over week: trained and sessions against the week before, counted the same way', () => {
  eq([sam.trained, sam.of, sam.sessionsDone, sam.sessionsPlanned], [18, 20, 54, 64]);
  eq(sam.prev, { trained: 19, sessionsDone: 49, sessionsPlanned: 64 });
  eq([CR.vsText(54, 49), CR.vsText(18, 19), CR.vsText(3, 3)], ['5 more than the week before', '1 fewer than the week before', 'the same as the week before']);
  const one = (o) => CR.teamWeek(Object.assign({ athletes: [{ id: 'x', name: 'X' }], programs: [{ athleteId: 'x', planned: 4 }], sessions: { x: 4 } }, o), W2);
  eq(one({ sessionsBefore: { x: 6 } }).prev, { trained: 1, sessionsDone: 4, sessionsPlanned: 4 }, 'capped at the plan, like the week');
  eq(one({ sessionsBefore: { x: 2 }, busy: [{ athleteId: 'x', weekStart: CR.addDays(W2.from, -7), days: 2 }] }).prev, { trained: 1, sessionsDone: 2, sessionsPlanned: 2 }, 'the week before\'s own agreed busy week');
  eq(one({}).prev, null, 'no week before given (the server couldn\'t read it): no comparison');
  const m = mailOf('c-sam');
  ok(m.text.includes('18 of 20 trained (1 fewer than the week before) · 54 of 64 sessions (5 more than the week before) · 3 PRs'), 'the text');
  ok(m.html.includes('lifters trained, 1 fewer than the week before') && /5 more sessions than the week before<\/span> · <span[^>]*>3 PRs<\/span> · <span[^>]*>3 behind/.test(m.html) && m.html.includes('The week before'), 'the card');
  eq([CR.vsText(4, 4, 'sessions'), CR.vsText(2, 5, 'sessions'), CR.vsText(6, 5, 'sessions')], ['as many sessions as the week before', '3 fewer sessions than the week before', '1 more session than the week before']);
});

// ---------------------------------------------------------------- 2. strength over 4 weeks, stalling
t('strength: who got stronger over 4 weeks, each lift\'s median and share up, the biggest movers, who stalled', () => {
  const st = sam.strength;
  eq([st.n, st.up, st.down], [17, 15, 2]);
  eq(['squat', 'bench', 'deadlift'].map(L => [st.lifts[L].n, st.lifts[L].up, CR.deltaText(st.lifts[L].median, 'kg')]), [[17, 14, '+3 kg'], [17, 10, '+3 kg'], [17, 12, '+3 kg']]);
  eq(st.movers.map(m => [m.name, CR.deltaText(m.kg, 'kg')]), [['Kofi Mensah', '+20 kg'], ['Leo Grant', '+15 kg'], ['Callum Ward', '+13 kg']]);
  eq(st.stalled.map(s => s.name), ['Jonah Reed', 'Tom Boyle']);
  ok(!sam.everyone.find(x => x.name === 'Nina Petrova').change && sam.everyone.find(x => x.name === 'Nina Petrova').change === null, 'a lifter with no 4 weeks before has no change (not 0)');
});
t('strength: both windows or nothing; a whole unit decides up in the coach\'s unit; stalling is the app\'s 0.05 kg rule', () => {
  const M = (lifts) => ({ athleteId: 'x', lifts });
  const T1 = (lifts, unit) => CR.teamWeek({ athletes: [{ id: 'x', name: 'X' }], momentum: [M(lifts)] }, Object.assign({}, W2, { unit })).strength;
  eq(T1({ squat: { recent: 200, prior: null }, bench: { recent: 0, prior: 120 } }).n, 0, 'one window only: not compared');
  const half = T1({ squat: { recent: 200.4, prior: 200 } });
  eq([half.up, half.stalled.length], [0, 0], '+0.4 kg: not stronger in kg, not stalled either');
  eq(T1({ squat: { recent: 200.4, prior: 200 } }, 'lbs').up, 1, '+0.9 lb rounds to 1 lb: stronger in lbs');
  eq(T1({ squat: { recent: 200.04, prior: 200 }, bench: { recent: 120, prior: 121 } }).stalled.length, 1, 'nothing up by more than 0.05 kg: stalled');
  eq(CR.deltaText(-2.5, 'kg') + ' ' + CR.deltaText(2.5, 'kg') + ' ' + CR.deltaText(0.2, 'kg') + ' ' + CR.deltaText(10, 'lbs'), '−3 kg +3 kg 0 kg +22 lbs');
  const med = CR.teamWeek({ athletes: ['a', 'b', 'c', 'd'].map(id => ({ id, name: id })), momentum: [[10], [2], [4], [-6]].map((d, i) => M({ squat: { recent: 100 + d[0], prior: 100 } })).map((m, i) => Object.assign(m, { athleteId: 'abcd'[i] })) }, W2).strength;
  eq([med.lifts.squat.median, med.lifts.squat.up, med.lifts.squat.down], [3, 3, 1], 'the median of an even count is the middle two\'s mean');
});

// ---------------------------------------------------------------- 3. effort: the app's own definition
// The app's functions, lifted out of its files as they are and run here: app.js programLoggedSets and _exShortTitle,
// coach-lifters.js clEffort (the top set), coach-app.js caEffortOf / caEffortSplit / caEffortBins.
function extractFn(src, head) {
  const at = src.indexOf(head);
  if (at < 0) throw new Error('not found: ' + head);
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) { if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) break; }
  return src.slice(at, i + 1);
}
const APP = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8'), LIFTERS = fs.readFileSync(path.join(ROOT, 'coach-lifters.js'), 'utf8'), HOME = fs.readFileSync(path.join(ROOT, 'coach-app.js'), 'utf8');
const appCtx = vm.createContext({ Math, Number, String, Object, Array, isFinite, Date, JSON });
vm.runInContext([
  "const MAIN_LIFTS = ['squat', 'bench', 'deadlift']; const LIFT_LABELS = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift', push: 'Push', pull: 'Pull', legs: 'Legs', cardio: 'Cardio', other: 'Other' };",
  "function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }",
  "function todayIso() { return '2099-01-01'; }",
  extractFn(APP, 'function programLoggedSets('), extractFn(APP, 'function _exShortTitle('),
  extractFn(LIFTERS, 'function clEffort('),
  HOME.slice(HOME.indexOf('var HALF = '), HOME.indexOf(';', HOME.indexOf('var HALF = ')) + 1),
  extractFn(HOME, 'function caEffortOf('), extractFn(HOME, 'function caEffortSplit('), extractFn(HOME, 'function caEffortBins('),
  'this.app = { programLoggedSets, clEffort, caEffortOf, caEffortSplit, caEffortBins };'].join('\n'), appCtx);
const APPFN = appCtx.app;
// Well-formed blocks the app reads without throwing: top sets and back-offs by RPE, ranges, attempts, RIR, ties.
let sd = 11;
const rnd = () => { sd ^= sd << 13; sd >>>= 0; sd ^= sd >>> 17; sd ^= sd << 5; sd >>>= 0; return sd / 4294967296; };
const pickR = (a) => a[Math.floor(rnd() * a.length)];
function genProgram(to) {
  return Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => ({ days: Array.from({ length: 1 + Math.floor(rnd() * 4) }, () => ({ exercises: Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => {
    const lift = pickR(['squat', 'bench', 'deadlift', 'squat', null, 'other', 'push']), ex = { lift, variant: pickR(['Competition', 'Paused', '']), exerciseName: lift && lift !== 'push' ? '' : pickR(['Row', 'Dips', '']), sets: [] };
    const date = CR.addDays(to, -Math.floor(rnd() * 9));
    for (let k = 0; k < 1 + Math.floor(rnd() * 4); k++) {
      const rpe = pickR([7, 7.5, 8, 8.5, 9, '8', '']), done = rnd() < 0.85;
      const s = { weight: pickR([100, 102.5, 105, 105, '110']), reps: 3, rpe, completed: done, completedAt: done ? date + (rnd() < 0.3 ? 'T18:00:00Z' : '') : null, actualRpe: done ? pickR([7, 7.5, 8, 8.5, 9, 9.5, 10, '9', null]) : null };
      if (rnd() < 0.2) s.rpeHi = pickR([8, 9, '9', '']);
      if (rnd() < 0.05) s.attempt = 1;
      if (rnd() < 0.08) s.rir = true;
      ex.sets.push(s);
    }
    return ex;
  }) })) }));
}
t('effort: the top sets are the app\'s (clEffort: the heaviest of each lift each day, the first of equals)', () => {
  let n = 0;
  for (let k = 0; k < 300; k++) {
    const weeks = genProgram(W2.to);
    const app = APPFN.clEffort({ weeks }, W2.to, 1e9).filter(x => x.date >= W2.from).map(x => [x.date, x.w, x.felt, x.wrote]).sort();
    const mine = CR.topSets(CR.effortSets(weeks, W2.from, W2.to), W2.from, W2.to).map(x => [x.d, Number(x.w) || 0, Number(x.f), CR.effortOf({ rpe: x.r, rpeHi: x.h, actualRpe: x.f }) ? CR.effortOf({ rpe: x.r, rpeHi: x.h, actualRpe: x.f }).wrote : NaN])
      .filter(x => isFinite(x[2]) && isFinite(x[3])).sort();
    eq(JSON.stringify(mine), JSON.stringify(app), 'block ' + k);
    n += app.length;
  }
  ok(n > 300, 'compared ' + n + ' top sets');
});
t('effort: placed and split as the app\'s Effort tile does (caEffortOf, caEffortBins, caEffortSplit\'s who ran hot)', () => {
  for (let k = 0; k < 200; k++) {
    const people = ['a', 'b', 'c', 'd'].map(id => ({ id, name: 'Lifter ' + id, weeks: genProgram(W2.to) }));
    const team = CR.teamWeek({ athletes: people, effort: people.map(p => ({ athleteId: p.id, sets: CR.effortSets(p.weeks, W2.from, W2.to) })) }, W2);
    const sets = [];
    people.forEach(p => CR.topSets(CR.effortSets(p.weeks, W2.from, W2.to), W2.from, W2.to).forEach(x => sets.push({ id: p.id, name: p.name, set: { rpe: x.r, rpeHi: x.h, actualRpe: x.f }, title: CR.exTitle(x), date: x.d })));
    const bins = APPFN.caEffortBins(sets), split = APPFN.caEffortSplit(sets);
    eq(team.effort.bins, Array.from(bins), 'bins ' + k);
    eq([team.effort.total, team.effort.over], [split.total, split.harder], 'total and harder ' + k);
    eq(JSON.stringify(team.effort.hot.map(h => [h.id, h.why, h.avg, h.count, h.n, h.worst.over, h.worst.title])), JSON.stringify(split.hot.map(h => [h.id, h.why, h.avg, h.count, h.n, h.worst.over, h.worst.title])), 'who ran hot ' + k);
  }
});
t('effort: last week\'s top sets for Sam\'s team, at or under, half a point over, a point or more over, who ran hot', () => {
  const E = sam.effort;
  eq([E.total, E.atOrUnder, E.half, E.over, E.pct], [57, 48, 6, 3, 84]);
  eq(E.hot.map(h => [h.name, CR.hotText(h)]), [['Marcus Doyle', 'Bench @9.5, you wrote 8'], ['Leo Grant', 'Squat @9, you wrote 8'], ['Ines Duarte', '3 top sets, +0.5 on average']]);
  const m = mailOf('c-sam');
  ok(m.html.includes('84%</span>') && m.html.includes('at or under what you wrote') && m.text.includes('- 84% at or under: 48 at or under, 6 half a point over, 3 a point or more over'), 'in the email');
  ok(m.text.includes('- Marcus Doyle: Bench @9.5, you wrote 8'), 'the worst line');
  eq([CR.effortParts({ atOrUnder: 4, half: 0, over: 0 }), CR.effortParts({ atOrUnder: 4, half: 0, over: 2 })].map(p => p.map(x => x[1]).join(', ')),
    ['4 at or under, nobody over', '4 at or under, 2 a point or more over'], 'zero parts drop out');
  eq(CR.effortSets([{ draft: true, days: [{ exercises: [{ lift: 'squat', sets: [{ completed: true, completedAt: W2.from, rpe: 8, actualRpe: 9 }] }] }] }], W2.from, W2.to), [], 'a draft week has no sets');
});

// ---------------------------------------------------------------- 4. their words waiting
t('their words: their last message (12 hours old or more) or a note with no reply, from the last 4 weeks, longest first', () => {
  eq(sam.words.map(w => [w.name, w.message, w.notes, w.days]), [['Arjun Mehta', true, 0, 2], ['Mei Tanaka', false, 1, 2], ['Kofi Mensah', true, 0, 1]]);
  const T1 = (threads, notes) => CR.teamWeek({ athletes: [{ id: 'x', name: 'X' }], threads, notes }, Object.assign({}, W2, { now: WD.now })).words;
  const h = (n) => new Date(WD.now - n * 3600000).toISOString();
  eq(T1([{ athleteId: 'x', lastAt: h(11), lastSenderId: 'x' }]).length, 0, '11 hours: not waiting yet');
  eq(T1([{ athleteId: 'x', lastAt: h(29 * 24), lastSenderId: 'x' }]).length, 0, 'older than 4 weeks: the app has it');
  eq(T1([{ athleteId: 'x', lastAt: h(40), lastSenderId: 'x' }, { athleteId: 'x', lastAt: h(20), lastSenderId: 'coach' }]).length, 0, 'the coach answered after');
  eq(T1([], [{ athleteId: 'x', date: CR.addDays(WD.today, -3) }, { athleteId: 'x', date: CR.addDays(WD.today, -40) }]).map(w => [w.notes, w.days]), [[1, 3]]);
  eq([CR.wordsWhat({ message: true, notes: 2 }), CR.wordsWhat({ message: false, notes: 1 }), CR.wordsText({ days: 0 })], ['a message and 2 notes', 'a note', 'today']);
  // The server's threads: only this coach's (a lifter's old thread with another coach isn't theirs to answer).
  const rows = { athletes: [{ id: 'x', name: 'X' }], threads: [{ coach_id: 'other', athlete_id: 'x', last_at: h(40), last_sender_id: 'x' }] };
  eq(CR.teamWeek(CR.fromRows(rows, { coachId: 'me', today: WD.today, now: WD.now }), Object.assign({}, W2, { now: WD.now })).words.length, 0);
});

// ---------------------------------------------------------------- 5. meets, 8 weeks, bodyweight against the class
t('meets: the next 8 weeks, each lifter\'s latest weigh-in (2 weeks) against the class', () => {
  eq(sam.meets.map(m => [m.name, m.days, m.lifters.map(l => [l.name, CR.meetLifterText(l, 'kg').text, CR.meetLifterText(l, 'kg').over])]), [
    ['Autumn Open', 5, [['Priya Shah', '62.4 kg for the 63 kg, 0.6 under', false], ['Tom Boyle', '92.1 kg for the 93 kg, 0.9 under', false]]],
    ['State Championships', 12, [['Elena Rossi', '58.4 kg for the 57 kg, 1.4 over', true]]],
    ['Autumn Classic', 33, [['Sofia Alvarez', '75.1 kg for the 76 kg, 0.9 under', false]]],
    ['Nationals Qualifier', 47, [['Amara Okafor', '84 kg class, no weigh-in in 2 weeks', false]]]]);
  eq([CR.classLimit('57'), CR.classLimit('57 kg'), CR.classLimit('57,5'), CR.classLimit('120+'), CR.classLimit(''), CR.classLimit('-57')], [57, 57, 57.5, null, null, null]);
  eq(CR.meetLifterText({ cls: '57 kg', limit: 57, bw: 58.4, over: 1.4 }, 'lbs').text, '128.7 lbs for the 57 kg, 3.1 over', 'in the coach\'s unit');
  eq(CR.meetLifterText({ cls: '120+', limit: null, bw: 125, over: null }, 'kg').text, '', 'no ceiling: nothing to say');
  const m = mailOf('c-sam');
  ok(/Elena Rossi<\/span> · <span style="color:#ffb35c;">58\.4 kg for the 57 kg, 1\.4 over/.test(m.html), 'amber when over');
  ok(/Sofia Alvarez<\/span> · <span style="color:#b8b8c0;">75\.1 kg for the 76 kg/.test(m.html), 'plain when under');
  ok(!m.html.includes('Winter Open'), 'a meet 10 weeks out isn\'t listed');
});

// ---------------------------------------------------------------- 6. next week to write, weeks left, drafts
t('weeks left: from the current week to the end; 0 finished; null without weeks; drafts left out', () => {
  eq([CR.weeksLeft(block(4, 1)), CR.weeksLeft(block(4, 3)), CR.weeksLeft(block(4, 4)), CR.weeksLeft([]), CR.weeksLeft(null), CR.weeksLeft(JSON.stringify(block(3, 0)))], [3, 1, 0, null, null, 4]);
  const d = (w) => Object.assign({}, w, { draft: true });
  const b = block(4, 3);
  eq(CR.weeksLeft(b.concat([d(block(1, 0)[0])])), 1, 'a draft fifth week: the block still ends this week');
  eq(CR.weeksLeft([d(b[0])]), null, 'only a draft');
  eq(CR.plannedPerWeek([b[0], d(block(5, 0)[0]), block(3, 0)[0]]), 3, 'a draft week with sets to do plans nothing: the next live week does');
  eq(CR.plannedPerWeek([Object.assign({}, block(5, 0)[0], { draft: 'true' })]), 5, 'only "draft": true is a draft');
  eq(sam.toWrite.map(x => [x.name, x.why]), [['Callum Ward', 'finished'], ['Hannah Berg', 'none'], ['Elena Rossi', 'ends'], ['Priya Shah', 'ends']]);
  const m = mailOf('c-sam');
  ok(m.text.includes('Next week to write\n- Block finished: Callum Ward\n- No block yet: Hannah Berg\n- Block ends this week: Elena Rossi, Priya Shah'), 'the text');
  // A block known only by its planned sessions (an older lean read): nothing said about its end.
  eq(CR.teamWeek({ athletes: [{ id: 'x', name: 'X' }], programs: [{ athleteId: 'x', planned: 3 }] }, W2).toWrite, []);
});

// ---------------------------------------------------------------- 7. money and roster
t('money: overdue and due in the next 7 days; applications waiting; seats from the plan in force', () => {
  eq([sam.overdue.n, sam.overdue.total, sam.overdue.who.map(w => [w.name, w.daysLate])], [2, 40000, [['Tomas Novak', 12], ['Tom Boyle', 5]]]);
  eq([sam.due.n, sam.due.total, sam.due.who.map(w => [w.name, w.inDays])], [2, 42000, [['Sarah Kim', 2], ['Elena Rossi', 6]]]);
  eq([sam.applications, sam.seats], [2, { tier: 'pro', limit: 25, lifters: 20, invites: 2, used: 22 }]);
  eq([CR.seatsText(sam.seats), CR.seatsText(TEAMS['c-mia'].seats), CR.seatsText(TEAMS['c-big'].seats), CR.seatsText(TEAMS['c-dan'].seats)],
    ['22 of 25 used (20 lifters, 2 open invites)', '3 of 3 used: full', '60 lifters, no limit on your plan', '5 of 10 used']);
  const now = WD.now, day = 864e5;
  eq([CR.effectiveTier('pro', new Date(now - 4 * day).toISOString(), now), CR.effectiveTier('pro', new Date(now - 2 * day).toISOString(), now), CR.effectiveTier('gold', null, now), CR.effectiveTier(undefined, null, now)],
    ['free', 'pro', 'free', 'free'], 'a lapsed plan is free after 3 days (powa_effective_tier)');
  const m = mailOf('c-sam');
  ok(m.text.includes('- 2 payments overdue: $400 (Tomas Novak 12 days, Tom Boyle 5 days)\n- 2 due this week: $420 (Sarah Kim Wed, Elena Rossi Sun)\n- 2 applications waiting, from your profile\n- Seats: 22 of 25 used (20 lifters, 2 open invites)'), 'the text');
  ok(/>Seats<\/div>/.test(mailOf('c-mia').html) && mailOf('c-mia').html.includes('3 of 3 used: full'), 'a full plan in amber');
});

// ---------------------------------------------------------------- 8. every lifter
t('every lifter: one line each, in the triage order, their word on the right', () => {
  eq(sam.everyone.map(x => x.name + ':' + x.flag.word), ['Priya Shah:Pain', 'Sarah Kim:Pain', 'Elena Rossi:Meet in 12 days', 'Tom Boyle:Meet in 5 days', 'Jonah Reed:Behind', 'Nina Petrova:Behind', 'Tomas Novak:Behind',
    'Dev Patel:PR', 'Leo Grant:PR', 'Sofia Alvarez:PR', 'Amara Okafor:On plan', 'Arjun Mehta:On plan', 'Grace Liu:On plan', 'Ines Duarte:On plan', 'Kofi Mensah:On plan', 'Marcus Doyle:On plan', 'Mei Tanaka:On plan',
    'Ryan O’Neill:On plan', 'Callum Ward:Block done', 'Hannah Berg:No block']);
  const x = sam.everyone[0];
  eq(CR.everyText(x, 'kg'), '3 of 3 sessions · +5 kg in 4 weeks');
  eq(CR.everyText(sam.everyone.find(y => y.name === 'Hannah Berg'), 'kg'), 'no sessions');
  ok(mailOf('c-sam').text.includes('- Callum Ward: 3 sessions · +13 kg in 4 weeks · Block done'), 'the text');
});

// ---------------------------------------------------------------- the email: order, caps, empty sections, email-safe
t('the v2 email: sections in order, one red, email-safe (tables and inline styles, no pictures, no classes)', () => {
  const m = mailOf('c-sam'), at = (s) => m.html.indexOf(s);
  const order = ['>Needs you', '>Strength', '>Effort', '>Wins', '>Meets', '>Next week to write', '>Money and roster', '>Every lifter', '>Open Today<'];
  order.forEach((s, i) => ok(at(s) > 0 && (i === 0 || at(order[i - 1]) < at(s)), 'order at ' + s));
  eq((m.html.match(/background:#ff3b4a/g) || []).length, 1, 'one red');
  ok(!/<img|<svg|class=|<style/i.test(m.html), 'no pictures, classes or style blocks');
  ok(/<td width="\d+%" style="height:6px;line-height:6px;font-size:0;background:#34d982;">&nbsp;<\/td>/.test(m.html), 'bars are table cells');
  ok(m.html.indexOf('#38c6ff') > at('>Strength') && m.html.indexOf('#38c6ff') < at('>Effort'), 'lift colours only on the lifts');
  const tx = m.text, tOrder = ['Needs you', 'Strength (', 'Effort (', 'Wins (', 'Meets (', 'Next week to write', 'Money and roster', 'Every lifter', 'Open Today:'];
  tOrder.forEach((s, i) => ok(tx.indexOf(s) > 0 && (i === 0 || tx.indexOf(tOrder[i - 1]) < tx.indexOf(s)), 'text order at ' + s));
});
t('a 60-lifter team stays readable: 8 names a line, 5 who ran hot, 6 meets, 25 lifters, then how many more', () => {
  const big = TEAMS['c-big'], m = mailOf('c-big');
  ok(big.behind.length > 8 && /Behind<\/div><div[^>]*>(?:(?!<\/div>).)*and \d+ more/.test(m.html), 'behind: 8 names, then and N more');
  ok(big.effort.hot.length > 5 && m.html.includes((big.effort.hot.length - 5) + ' more ran hot'), 'hot: ' + big.effort.hot.length);
  ok(big.meets.length > 6 && m.html.includes((big.meets.length - 6) + ' more meets'), 'meets: ' + big.meets.length);
  ok(m.html.includes('and 35 more in the app') && m.text.includes('- and 35 more in the app'), 'every lifter: 25 of 60');
  const evRows = m.html.slice(m.html.indexOf('>Every lifter')).match(/<td style="font-family:[^"]*font-weight:600;color:#f4f4f6;">/g) || [];
  eq(evRows.length, 25, 'twenty-five lifter rows');
  ok(m.html.length < 102400, 'under Gmail\'s 102 KB clip: ' + m.html.length);
});
t('empty sections stay out: no billing, no meets, no PRs', () => {
  const m = mailOf('c-dan'), dan = TEAMS['c-dan'];
  eq([dan.meets.length, dan.overdue.n, dan.due.n, dan.prs.length], [0, 0, 0, 0]);
  ok(!m.html.includes('>Meets') && !m.html.includes('>Wins') && !m.text.includes('Meets (') && !m.text.includes('Wins ('), 'no meets, no wins');
  ok(m.html.includes('>Money and roster') && !m.html.includes('overdue') && !m.html.includes('due this week'), 'money and roster: the seats only');
});
t('the lbs coach: PRs, changes and loads in lbs', () => {
  const m = mailOf('c-mia');
  ok(/Deadlift <span[^>]*>\d+ lbs<\/span>/.test(m.html) && /\+\d+ lbs/.test(m.text) && !/\d kg/.test(m.text), 'all lbs');
  ok(m.html.includes('Cy &lt;script&gt;Park&lt;/script&gt;') && !m.html.includes('<script>'), 'names escaped');
});
t('privacy: never a body part, never their words, in the subject, push, preheader, email or text', () => {
  const words = ['Can we move Friday', 'Is the deadlift single', 'Weigh-in is at 8', 'Quick question', 'Left knee felt tight', 'Back felt better', 'Hips shooting', 'sore'];
  const parts = ['neck', 'shoulder', 'chest', 'upper back', 'elbow', 'wrist', 'low back', 'low_back', 'hip', 'knee', 'ankle'];
  COACHES.forEach(c => {
    const m = mailOf(c), all = [m.subject, m.preheader, m.html, m.text, JSON.stringify(CR.reportPush(TEAMS[c])), JSON.stringify(TEAMS[c])].join(' ');
    words.forEach(w => ok(!all.includes(w), c + ' quotes "' + w + '"'));
    parts.forEach(p => ok(!new RegExp('\\b' + p + '\\b', 'i').test(all), c + ' names ' + p));
  });
});

// ---------------------------------------------------------------- the server's jobs
t('jobs by UTC weekday: Monday digest + report, Thursday midweek, else nothing', () => {
  eq(CR.jobPlan({}, '2026-10-26T14:00:00Z'), { jobs: ['digest', 'coach-report'], today: '2026-10-26', dryRun: false, error: null });
  eq(CR.jobPlan({}, '2026-10-29T14:00:00Z').jobs, ['midweek']);
  eq(CR.jobPlan(null, '2026-10-27T14:00:00Z').jobs, []);
  eq(CR.jobPlan({}, '2026-11-01T14:00:00Z').jobs, []);
});
t('jobs: an explicit job and day (the cron secret already checked), dry runs only on true', () => {
  eq(CR.jobPlan({ job: 'midweek', today: '2026-10-26', dryRun: true }, '2026-10-30'), { jobs: ['midweek'], today: '2026-10-26', dryRun: true, error: null });
  eq(CR.jobPlan({ dryRun: 'yes' }, '2026-10-26').dryRun, false);
  ok(CR.jobPlan({ job: 'everything' }, '2026-10-26').error, 'unknown job accepted');
  ok(CR.jobPlan({ today: '2026-02-30' }, '2026-10-26').error, 'impossible date accepted');
  ok(CR.jobPlan({ today: "2026-10-26'; drop" }, '2026-10-26').error === null, 'today is cut to its date part');
});
t('busy weeks: approved only, snapped to their Monday, either shape', () => {
  eq(CR.busyRows([{ athlete_id: 'a', week_start: '2026-10-21', days: '2', status: 'APPROVED' }, { athleteId: 'b', weekStart: '2026-10-19', agreedDays: 1 },
    { athleteId: 'c', weekStart: '2026-10-19', days: 2, status: 'declined' }, { athleteId: 'd', weekStart: 'soon', days: 2 }, null, 'x']),
    [{ athleteId: 'a', weekStart: '2026-10-19', days: 2 }, { athleteId: 'b', weekStart: '2026-10-19', days: 1 }]);
  eq(CR.busyRows(undefined), []);
});
t('money and loads in words', () => {
  eq([CR.money(44000, 'USD'), CR.money(9250, 'EUR'), CR.money(120000, 'GBP'), CR.money(500, 'nope')], ['$440', '€92.50', '£1,200', '$5']);
  eq([CR.loadText(182.5, 'kg'), CR.loadText(183.7, 'lbs'), CR.e1rmText(205.2, 'kg'), CR.e1rmText(205.2, 'lb')], ['182.5', '405', '205 kg', '452 lbs']);
});

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
