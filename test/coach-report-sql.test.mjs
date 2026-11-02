// sql/migration-coach-report-v2-2026-11-02.sql in PGlite, against coach-report.js on the same data:
// it runs twice after rows 53 and 56 (the live order); coach_week_stats keeps every old answer and adds recent /
// prior exactly as the app's own windows (fromStore); program_planned_per_week skips drafts and otherwise answers
// as before; program_weeks_left = weeksLeft, program_effort_sets = effortSets on generated blocks and every awkward
// value; coach_week_effort and coach_threads_last answer per program and per thread, and the effort the report
// builds from them equals the app's; coach_week_effort works each block's sets out once (its plan); only service_role
// runs any of it; STATUS-check row 63 says false before and
// true after (rows 53 and 56 stay true).
// Needs PGlite (not a repo dependency): PGLITE=/path/to/@electric-sql/pglite/dist/index.js node test/coach-report-sql.test.mjs
// (or with @electric-sql/pglite resolvable from here). Without it, it says so and skips (exit 0).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite;
try { PGlite = (await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite')).PGlite; }
catch (e) { console.log('SKIP: PGlite not found (set PGLITE=/path/to/@electric-sql/pglite/dist/index.js). ' + e.message); process.exit(0); }
(0, eval)(fs.readFileSync(path.join(ROOT, 'coach-report.js'), 'utf8'));
const CR = globalThis.CoachReport;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : v && typeof v === 'object' ? Object.keys(v).sort().reduce((o, k) => (o[k] = sortKeys(v[k]), o), {}) : v;
const J = (v) => JSON.stringify(sortKeys(v));

// ---------------------------------------------------------------- a seeded random
let seed = 7;
const rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const hex = (n) => { let o = ''; for (let i = 0; i < n; i++) o += Math.floor(rnd() * 16).toString(16); return o; };
const uuid = () => hex(8) + '-' + hex(4) + '-4' + hex(3) + '-a' + hex(3) + '-' + hex(12);
const day = (base, n) => CR.addDays(base, n);

// ---------------------------------------------------------------- the database, as it is live (rows 53 and 56 in)
const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
  grant usage on schema public to anon, authenticated, service_role;
  create table public.profiles (id uuid primary key, name text, coach_id uuid);
  create table public.email_preferences (user_id uuid primary key, weekly_digest boolean not null default true);
  create table public.workout_logs (id uuid primary key, athlete_id uuid not null, lift text, date date, e1rm_comp numeric);
  create table public.programs (id uuid primary key, athlete_id uuid, coach_id uuid, name text, weeks jsonb, updated_at timestamptz default now());
  create table public.messages (id uuid primary key default gen_random_uuid(), coach_id uuid not null, athlete_id uuid not null, sender_id uuid not null,
    body text not null, created_at timestamptz not null default now(), read_at timestamptz);
`);
for (const f of ['migration-coach-alerts-2026-10-28.sql', 'migration-data-scale-2026-10-28.sql']) await db.exec(fs.readFileSync(path.join(ROOT, 'sql', f), 'utf8'));
const V2 = fs.readFileSync(path.join(ROOT, 'sql/migration-coach-report-v2-2026-11-02.sql'), 'utf8');
const STATUS = fs.readFileSync(path.join(ROOT, 'sql/STATUS-check.sql'), 'utf8');
const statusRow = async (n) => {
  const m = new RegExp('\\(' + n + ',\\s*\'[^\']*(?:\'\'[^\']*)*\',\\s*([\\s\\S]*?)\\)\\s*(?=,\\s*\\(\\d+,|\\n\\))').exec(STATUS);
  if (!m) return 'missing';
  return (await db.query('select (' + m[1] + ') as applied')).rows[0].applied;
};
ok(await statusRow(63) === false, 'row 63 says false before the migration');

// The old coach_week_stats on generated logs: 40 lifters over 120 days, some with no main lifts, odd values.
const COACH = uuid(), OTHER = uuid();
const athletes = Array.from({ length: 40 }, (_, i) => ({ id: uuid(), name: 'Lifter ' + i, coachId: i % 9 === 8 ? OTHER : COACH }));
const logs = [];
athletes.forEach((a, ai) => {
  const n = ai % 7 === 0 ? 0 : 20 + Math.floor(rnd() * 80);
  for (let k = 0; k < n; k++) {
    const lift = pick(['squat', 'bench', 'deadlift', 'Squat', 'row', 'ohp', 'deadlift']);
    logs.push({ id: uuid(), athleteId: a.id, lift, date: day('2026-07-01', Math.floor(rnd() * 125)), e1rmComp: rnd() < 0.05 ? 0 : Math.round((80 + rnd() * 200) * 4) / 4 });
  }
});
await db.query('insert into public.profiles (id, name, coach_id) select x.id, x.name, x.coach from jsonb_to_recordset($1::jsonb) as x(id uuid, name text, coach uuid)', [JSON.stringify(athletes.map(a => ({ id: a.id, name: a.name, coach: a.coachId })))]);
await db.query('insert into public.workout_logs (id, athlete_id, lift, date, e1rm_comp) select x.id, x.a, x.lift, x.d, x.e from jsonb_to_recordset($1::jsonb) as x(id uuid, a uuid, lift text, d date, e numeric)',
  [JSON.stringify(logs.map(l => ({ id: l.id, a: l.athleteId, lift: l.lift, d: l.date, e: l.e1rmComp })))]);
const WINDOWS = [['2026-10-19', '2026-10-25'], ['2026-10-26', '2026-11-01'], ['2026-09-07', '2026-09-13'], ['2026-07-06', '2026-07-12'], ['2026-10-29', '2026-10-29']];
const ids = athletes.map(a => a.id);
const stats = async (from, to) => (await db.query('select athlete_id, sessions, lifts from public.coach_week_stats($1::uuid[], $2::date, $3::date) order by athlete_id', [ids, from, to])).rows;
const before = {};
for (const [f, t] of WINDOWS) before[f + t] = await stats(f, t);

// ---------------------------------------------------------------- the migration, twice
for (let i = 0; i < 2; i++) {
  try { await db.exec(V2); ok(true, ''); } catch (e) { ok(false, 'v2 run ' + (i + 1) + ': ' + e.message); }
}
ok(await statusRow(63) === true, 'row 63 says true after it');
ok(await statusRow(53) === true && await statusRow(56) === true, 'rows 53 and 56 still say true');

// ---------------------------------------------------------------- 1. coach_week_stats: the old answers, plus recent / prior as the app's
let statRows = 0;
for (const [f, t] of WINDOWS) {
  const now = await stats(f, t);
  ok(now.length === ids.length, 'one row per lifter (' + f + ')');
  const old = before[f + t];
  ok(J(now.map(r => ({ a: r.athlete_id, s: r.sessions, l: Object.fromEntries(Object.entries(r.lifts).map(([k, v]) => [k, { during: v.during, before: v.before }])) })))
    === J(old.map(r => ({ a: r.athlete_id, s: r.sessions, l: r.lifts }))), 'the old keys answer as before (' + f + ' to ' + t + ')');
  // The app's own windows: fromStore on the same logs.
  const store = { athletes: athletes.map(a => Object.assign({}, a, { coachId: COACH })), workoutLogs: logs };
  const input = CR.fromStore(store, COACH, { from: f, to: t, today: CR.addDays(t, 1) });
  const app = {};
  input.momentum.forEach(m => { app[m.athleteId] = m.lifts; });
  now.forEach(r => {
    statRows++;
    const mine = app[r.athlete_id] || {};
    ['squat', 'bench', 'deadlift'].forEach(L => {
      const s = r.lifts[L], a = mine[L];
      const sr = s ? Number(s.recent) || 0 : 0, sp = s ? Number(s.prior) || 0 : 0;
      const ar = a ? a.recent : 0, ap = a ? a.prior : 0;
      if (sr !== ar || sp !== ap) ok(false, 'recent/prior for ' + r.athlete_id + ' ' + L + ' ' + f + ': SQL ' + sr + '/' + sp + ' vs app ' + ar + '/' + ap);
    });
    const sessionsApp = input.sessions[r.athlete_id];
    if (sessionsApp !== r.sessions) ok(false, 'sessions ' + r.athlete_id + ': ' + r.sessions + ' vs ' + sessionsApp);
  });
}
ok(statRows === WINDOWS.length * ids.length, 'compared ' + statRows + ' lifter-weeks with fromStore');
console.log('coach_week_stats: ' + statRows + ' lifter-weeks compared with fromStore (' + logs.length + ' logs)');

// ---------------------------------------------------------------- blocks: generated, with drafts and every awkward value
const truthy = [true, false, null, 0, 1, '', 'yes', 2.5, [], {}, 'false', undefined];
const rpes = [8, 8.5, 9, 9.5, 10, 7, 6.5, '8', '9.5', '', null, undefined, 'x', 0];
const dates = ['2026-10-19', '2026-10-21', '2026-10-25', '2026-10-26', '2026-10-18', '2026-10-23T18:04:11.000Z', '2026-10-2', '20261020', '', null, 0, 1729000000000, true, 'soon', '2026-10-22 09:00'];
function genSet(w) {
  const s = {};
  const set = (k, v) => { if (v !== undefined) s[k] = v; };
  set('weight', rnd() < 0.1 ? pick(['100', '', null, 'heavy']) : Math.round((60 + rnd() * 150) / 2.5) * 2.5);
  set('reps', 1 + Math.floor(rnd() * 8));
  set('rpe', rnd() < 0.15 ? pick(rpes) : pick([7, 7.5, 8, 8.5, 9]));
  if (rnd() < 0.15) set('rpeHi', pick([8, 8.5, 9, '9', '', null, 7]));
  const done = rnd() < 0.75 - w * 0.12;
  set('completed', rnd() < 0.08 ? pick(truthy) : done);
  if (rnd() < 0.06) set('skipped', pick(truthy));
  if (rnd() < 0.04) set('attempt', pick(truthy));
  if (rnd() < 0.05) set('rir', pick(truthy));
  if (done || rnd() < 0.1) {
    set('actualRpe', rnd() < 0.12 ? pick(rpes) : Math.round((7 + rnd() * 3) * 2) / 2);
    set('completedAt', rnd() < 0.2 ? pick(dates) : day('2026-10-12', Math.floor(rnd() * 20)));
  }
  return s;
}
function genBlock() {
  const weeks = [];
  const nW = Math.floor(rnd() * 6);
  for (let w = 0; w < nW; w++) {
    if (rnd() < 0.04) { weeks.push(pick([null, 'x', 5, [], {}])); continue; }
    const days = [];
    const nD = Math.floor(rnd() * 5);
    for (let d = 0; d < nD; d++) {
      if (rnd() < 0.04) { days.push(pick([null, 'Rest', [], { exercises: 'x' }])); continue; }
      const exs = [];
      const nE = Math.floor(rnd() * 4);
      for (let e = 0; e < nE; e++) {
        if (rnd() < 0.03) { exs.push(pick([null, {}, { sets: { a: 1 } }, 'squat'])); continue; }
        const sets = [];
        const nS = Math.floor(rnd() * 5);
        for (let k = 0; k < nS; k++) sets.push(rnd() < 0.03 ? pick([null, 0, 'x', [], true]) : genSet(w));
        const ex = { lift: pick(['squat', 'bench', 'deadlift', 'other', '', null, undefined]), sets };
        if (rnd() < 0.4) ex.variant = pick(['Competition', 'Paused', 'Close Grip', '', null]);
        if (rnd() < 0.3) ex.exerciseName = pick(['Row', 'RDL', '', null]);
        exs.push(ex);
      }
      days.push(rnd() < 0.05 ? { name: 'Rest' } : { name: 'D' + d, exercises: exs });
    }
    const wk = { number: w + 1, days };
    if (rnd() < 0.15) wk.draft = pick([true, true, 'true', 1, false, null]);
    weeks.push(wk);
  }
  return rnd() < 0.08 ? JSON.stringify(weeks) : weeks;
}
const blocks = [null, undefined, [], {}, 'nope', '[]', '{"broken', 5, true, [null], [[]], [{}], [{ days: null }], [{ days: [] }],
  [{ draft: true, days: [{ exercises: [{ sets: [{}] }] }] }], [{ draft: true, days: [{ exercises: [{ sets: [{}] }] }] }, { days: [{ exercises: [{ sets: [{ completed: true }] }] }] }],
  [{ days: [{ exercises: [{ sets: [{ completed: true }] }] }] }, { draft: true, days: [{ exercises: [{ sets: [{}] }] }] }],
  [{ days: [{ exercises: [null, { sets: [{}] }] }] }], [{ days: [{ exercises: [{ sets: { a: 1 } }, { sets: [{ completed: true }] }] }] }], [{ days: 'x' }], [{ days: [{ exercises: 'x' }] }]];
for (let k = 0; k < 600; k++) blocks.push(genBlock());
const sqlJson = (v) => v === undefined ? null : JSON.stringify(v);
const one = async (q, params) => (await db.query(q, params)).rows[0].v;

// ---------------------------------------------------------------- 2 and 3. planned per week (drafts skipped) and weeks left
let compared = 0, drafts = 0;
for (const weeks of blocks) {
  const p = await one('select public.program_planned_per_week($1::jsonb) as v', [sqlJson(weeks)]);
  const l = await one('select public.program_weeks_left($1::jsonb) as v', [sqlJson(weeks)]);
  const jp = CR.plannedPerWeek(weeks), jl = CR.weeksLeft(weeks);
  if (p !== jp) ok(false, 'planned: SQL ' + p + ' vs JS ' + jp + ' for ' + String(JSON.stringify(weeks)).slice(0, 200));
  if (l !== jl) ok(false, 'weeks left: SQL ' + l + ' vs JS ' + jl + ' for ' + String(JSON.stringify(weeks)).slice(0, 200));
  if (/"draft":true/.test(JSON.stringify(weeks) || '')) drafts++;
  compared++;
}
ok(compared === blocks.length && drafts > 20, 'planned per week and weeks left compared on ' + compared + ' blocks (' + drafts + ' with a draft week)');
console.log('planned per week and weeks left: ' + compared + ' blocks compared with coach-report.js (' + drafts + ' with a draft week)');
// Drafts: a published 4-week block with a fifth week in draft plans and ends as the 4 weeks do.
const wk = (done, draft) => Object.assign({ days: [1, 2, 3].map(() => ({ exercises: [{ lift: 'squat', sets: [{ weight: 100, reps: 5, rpe: 8, completed: done }] }] })) }, draft ? { draft: true } : {});
const four = [wk(true), wk(true), wk(true), wk(false)];
ok(await one('select public.program_weeks_left($1::jsonb) as v', [JSON.stringify(four.concat([wk(false, true)]))]) === 1 && CR.weeksLeft(four.concat([wk(false, true)])) === 1, 'a draft week after the last one: the block still ends this week');
ok(await one('select public.program_planned_per_week($1::jsonb) as v', [JSON.stringify([wk(true), wk(false, true), wk(true)])]) === 0, 'a draft week with sets to do plans nothing');
ok(await one('select public.program_weeks_left($1::jsonb) as v', [JSON.stringify([wk(false, true)])]) === null, 'only a draft: no weeks at all');

// ---------------------------------------------------------------- 4. effort sets (the JS picks the top sets from these)
const W1 = ['2026-10-19', '2026-10-25'], W2 = ['2026-10-12', '2026-10-31'];
let eCompared = 0, eSets = 0;
for (const weeks of blocks) {
  for (const [f, t] of [W1, W2]) {
    const s = await one('select public.program_effort_sets($1::jsonb, $2::date, $3::date) as v', [sqlJson(weeks), f, t]);
    const j = CR.effortSets(weeks, f, t);
    eCompared++; eSets += j.length;
    if (J(s) !== J(j)) ok(false, 'effort sets differ for ' + String(JSON.stringify(weeks)).slice(0, 160) + '\n  SQL ' + JSON.stringify(s).slice(0, 300) + '\n  JS  ' + JSON.stringify(j).slice(0, 300));
  }
}
ok(eCompared === blocks.length * 2 && eSets > 300, 'effort sets compared on ' + eCompared + ' block-weeks (' + eSets + ' sets)');
console.log('effort sets: ' + eCompared + ' block-weeks compared (' + eSets + ' logged RPE sets)');

// ---------------------------------------------------------------- coach_week_effort and the report's effort, app against server
const progRows = [];
const store = { athletes: athletes.map(a => Object.assign({}, a, { coachId: COACH })), programs: [], workoutLogs: [] };
athletes.forEach((a, i) => {
  if (i % 6 === 5) return;   // some lifters have no program
  // Real-looking blocks: a top set and back-offs per lift a day, felt against written.
  const weeks = [0, 1, 2, 3].map(w => ({ number: w + 1, days: ['squat', 'bench', 'deadlift'].map((lift, di) => ({ name: lift, exercises: [{ lift, variant: pick(['Competition', 'Competition', 'Paused']), sets: [
    { weight: 150 + w * 5, reps: 3, rpe: 8, actualRpe: w < 2 ? pick([7.5, 8, 8, 8.5, 9, 9.5]) : null, completed: w < 2, completedAt: w < 2 ? day('2026-10-12', w * 7 + di * 2) : null },
    { weight: 130 + w * 5, reps: 5, rpe: 7, rpeHi: pick([null, 7.5]), actualRpe: w < 2 ? pick([7, 7.5, 8]) : null, completed: w < 2, completedAt: w < 2 ? day('2026-10-12', w * 7 + di * 2) : null }
  ] }] })) }));
  const id = uuid();
  progRows.push({ id, athlete_id: a.id, coach_id: COACH, weeks });
  store.programs.push({ id, athleteId: a.id, coachId: COACH, weeks });
});
await db.query('insert into public.programs (id, athlete_id, coach_id, name, weeks) select x.id, x.athlete_id, x.coach_id, \'Block\', x.weeks from jsonb_to_recordset($1::jsonb) as x(id uuid, athlete_id uuid, coach_id uuid, weeks jsonb)', [JSON.stringify(progRows)]);
const as = async (role, q, params) => { await db.exec('set role ' + role); try { return (await db.query(q, params || [])).rows; } catch (e) { return { err: e.message }; } finally { await db.exec('reset role'); } };
await db.exec('grant select on public.programs, public.messages, public.workout_logs to service_role');
const effRows = await as('service_role', 'select athlete_id, program_id, sets from public.coach_week_effort($1::uuid[], $2::date, $3::date)', [ids, W1[0], W1[1]]);
ok(Array.isArray(effRows) && effRows.length > 10 && effRows.every(r => r.sets.length > 0), 'coach_week_effort as the service role: ' + (effRows.err || effRows.length + ' programs with sets'));
const sByProg = Object.fromEntries((Array.isArray(effRows) ? effRows : []).map(r => [r.program_id, r.sets]));
ok(progRows.every(p => J(sByProg[p.id] || []) === J(CR.effortSets(p.weeks, W1[0], W1[1]))), 'each program\'s sets = effortSets');
const Wk = { from: W1[0], to: W1[1], today: '2026-10-26' };
const appTeam = CR.teamWeek(CR.fromStore(store, COACH, Wk), Wk);
const srvTeam = CR.teamWeek(CR.fromRows({ athletes: athletes.map(a => ({ id: a.id, name: a.name })), programs: progRows.map(p => ({ id: p.id, athlete_id: p.athlete_id, coach_id: p.coach_id, weeks: p.weeks })), effort: effRows },
  { coachId: COACH, today: '2026-10-26' }), Wk);
console.log('the report\'s effort, app = server: ' + appTeam.effort.total + ' top sets, ' + appTeam.effort.hot.length + ' ran hot');
ok(appTeam.effort.total > 20 && J(appTeam.effort) === J(srvTeam.effort), 'the report\'s effort is the same from the app and the server (' + appTeam.effort.total + ' top sets, ' + appTeam.effort.hot.length + ' ran hot)');
// Each block's sets are worked out once: the plan of coach_week_effort's own query calls program_effort_sets once
// (offset 0 keeps the subquery; pulled up, the filter would call it a second time per program).
const effBody = (await db.query(`select prosrc from pg_proc where proname = 'coach_week_effort'`)).rows[0].prosrc;
const planOf = async (q) => (await db.query('explain (verbose, costs off) ' + q.replace(/p_athletes/g, '$1::uuid[]').replace(/p_from/g, '$2::date').replace(/p_to/g, '$3::date').replace(/;\s*$/, ''), [ids, W1[0], W1[1]])).rows.map(r => r['QUERY PLAN']).join('\n');
const calls = (plan) => (plan.match(/program_effort_sets\(/g) || []).length;
const effPlan = await planOf(effBody), pulledUp = await planOf(effBody.replace(/\n\s*offset 0[^\n]*/, ''));
ok(/offset 0/.test(effBody) && calls(effPlan) === 1, 'coach_week_effort: program_effort_sets once in its plan (' + calls(effPlan) + ')');
ok(calls(pulledUp) === 2, 'and the check sees the difference: twice without offset 0 (' + calls(pulledUp) + ')');

// ---------------------------------------------------------------- 5. coach_threads_last: the last message of each thread, never its words
const msgs = [];
athletes.slice(0, 25).forEach((a, i) => {
  const n = i % 5 === 4 ? 0 : 1 + Math.floor(rnd() * 6);
  for (let k = 0; k < n; k++) {
    const coach = k % 4 === 3 ? OTHER : COACH;
    msgs.push({ id: uuid(), coach_id: coach, athlete_id: a.id, sender_id: rnd() < 0.5 ? a.id : coach, body: 'my knee hurts ' + k, created_at: new Date(Date.parse('2026-10-20T08:00:00Z') + Math.floor(rnd() * 12 * 86400000)).toISOString() });
  }
});
await db.query('insert into public.messages (id, coach_id, athlete_id, sender_id, body, created_at) select x.id, x.coach_id, x.athlete_id, x.sender_id, x.body, x.created_at from jsonb_to_recordset($1::jsonb) as x(id uuid, coach_id uuid, athlete_id uuid, sender_id uuid, body text, created_at timestamptz)', [JSON.stringify(msgs)]);
const th = await as('service_role', 'select * from public.coach_threads_last($1::uuid[])', [ids]);
const want = {};
msgs.forEach(m => { const k = m.coach_id + '|' + m.athlete_id; if (!want[k] || m.created_at > want[k].created_at || (m.created_at === want[k].created_at && m.id > want[k].id)) want[k] = m; });
ok(Array.isArray(th) && th.length === Object.keys(want).length, 'one row per thread: ' + (th.err || th.length));
ok(Array.isArray(th) && th.every(r => { const w = want[r.coach_id + '|' + r.athlete_id]; return w && new Date(r.last_at).getTime() === Date.parse(w.created_at) && r.last_sender_id === w.sender_id; }), 'the last message\'s time and sender');
ok(Array.isArray(th) && th.every(r => Object.keys(r).sort().join() === 'athlete_id,coach_id,last_at,last_sender_id') && !JSON.stringify(th).includes('knee'), 'no words in the answer');

// ---------------------------------------------------------------- who may run them
const FNS = ['public.powa_js_truthy(jsonb)', 'public.coach_week_stats(uuid[], date, date)', 'public.program_planned_per_week(jsonb)', 'public.program_weeks_left(jsonb)',
  'public.programs_weeks_left(public.programs)', 'public.program_effort_sets(jsonb, date, date)', 'public.coach_week_effort(uuid[], date, date)', 'public.coach_threads_last(uuid[])'];
for (const fn of FNS) {
  const r = (await db.query(`select has_function_privilege('anon', '${fn}', 'execute') as a, has_function_privilege('authenticated', '${fn}', 'execute') as u, has_function_privilege('service_role', '${fn}', 'execute') as s`)).rows[0];
  ok(!r.a && !r.u && r.s, 'only service_role runs ' + fn + ': ' + JSON.stringify(r));
}
await db.exec('grant select on public.programs, public.messages to authenticated');
const denied = await as('authenticated', 'select * from public.coach_threads_last($1::uuid[])', [ids]);
ok(denied.err && /permission denied/.test(denied.err), 'a signed-in user can\'t read the threads: ' + (denied.err || 'it answered'));
const denied2 = await as('authenticated', 'select public.programs_weeks_left(p) from public.programs p', []);
ok(denied2.err && /permission denied/.test(denied2.err), 'nor the computed field');
const lean = await as('service_role', 'select athlete_id, public.programs_planned(p) as planned, public.programs_weeks_left(p) as weeks_left from public.programs p', []);
ok(Array.isArray(lean) && lean.length === progRows.length && lean.every(r => r.planned === 3 && r.weeks_left === 2), 'the service role reads planned and weeks left as columns: ' + JSON.stringify(lean[0] || lean));

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
