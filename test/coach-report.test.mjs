// The coach's week (coach-report.js), run under Node: the core the app, the push and the Monday email
// share, the server's copy of it, and the job a cron run picks. No Deno, no network.
// Run: node test/coach-report.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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
  return A.map(a => {
    const mine = LOGS.filter(l => l[0] === a.id && l[1] <= to);
    const lifts = {};
    mine.forEach(([, d, L, e]) => { const x = lifts[L] || (lifts[L] = { during: null, before: null }); if (d >= from) x.during = Math.max(x.during || 0, e); else x.before = Math.max(x.before || 0, e); });
    return { athlete_id: a.id, sessions: new Set(mine.filter(l => l[1] >= from).map(l => l[1])).size, lifts };
  });
}
const rowsFor = (from, to) => ({
  athletes: A.slice(),
  programs: Object.keys(PROGRAMS).map(id => ({ athlete_id: id, coach_id: 'c1', weeks: JSON.stringify(PROGRAMS[id]), updated_at: '2026-10-01T00:00:00Z' }))
    .concat([{ athlete_id: 'a1', coach_id: 'c9', weeks: [], updated_at: '2026-10-25T00:00:00Z' }]),   // someone else's program: the coach's own wins
  stats: statsFor(from, to),
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
t('meets in the next 4 weeks, one entry per meet', () => {
  eq(team.meets.map(m => [m.name, m.date, m.days, m.lifters.map(l => l.id)]), [['Autumn Open', '2026-11-07', 12, ['a1', 'a2']]]);
});
t('money: overdue on the coach\'s record, totalled in the most common currency', () => {
  eq([team.overdue.n, team.overdue.total, team.overdue.currency, team.overdue.mixed], [2, 22000, 'USD', true]);
  eq(team.overdue.who.map(w => [w.id, w.daysLate]), [['a2', 6], ['a3', 1]]);
});
t('the app and the server build the same week from the same data', () => {
  const srv = CR.teamWeek(CR.fromRows(rowsFor(W.from, W.to), { coachId: 'c1', today: TODAY }), W);
  eq(srv, team);
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
  ok(at('Needs you') > 0 && at('Needs you') < at('Wins') && at('Wins') < at('Coming up') && at('Coming up') < at('Money'), 'order');
  ok(at('Pain reported') < at('Behind') && at('Behind') < at('form checks to review') && at('form checks to review') < at('No check-in last week'), 'needs-you order');
});
t('email: one red button, Open Today, to the app', () => {
  eq((mail.html.match(/background:#ff3b4a/g) || []).length, 1);
  eq((mail.html.match(/>Open Today</g) || []).length, 1);
  ok(mail.html.includes('href="https://www.powalifta.com/coach.html"'), 'app link');
  ok(mail.text.includes('Open Today: https://www.powalifta.com/coach.html'), 'text link');
});
t('email: the numbers a coach decides on', () => {
  ok(mail.html.includes('Squat PR · e1RM'), 'the PR line'); ok(mail.html.includes('205 kg'), 'e1RM in kg');
  ok(mail.text.includes('Behind: Leo Park 0 of 3, Tom Kowalski 0 of 3, Tom Becker 1 of 4'), 'behind in the text');
  ok(mail.text.includes('2 payments overdue: $220 (plus other currencies)'), 'money');
  ok(mail.text.includes('Autumn Open, Sat 7 Nov (in 12 days): Arjun Mehta, Tom Becker'), 'the meet');
  ok(mail.preheader === '5 lifters need you this week, starting with Sarah Kim.', mail.preheader);
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
  ok(!m.html.includes('Wins') && !m.html.includes('Coming up') && !m.html.includes('Money'), 'empty sections shown');
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
