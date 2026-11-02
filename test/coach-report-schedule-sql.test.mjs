// sql/migration-coach-report-schedule-2026-11-02.sql in PGlite: the four columns on email_preferences under its own
// policies (migration-email-preferences.sql: a user reads, inserts and updates their own row only; Supabase's default
// grants): it runs twice; every row gets Sunday 18:00, no time zone and the cut-over week (the week the old Monday
// 14:00 UTC job last sent, from the time it runs; once, a second run changes nothing); a coach changes their schedule
// on their own row, never on another coach's, and a signed-out visitor on none; the checks keep a day, an hour and a
// zone-shaped name; report_sent_week is the job's: the guard keeps it as it was on any write from a signed-in user
// (the owner too) and the service role (the hourly job) claims a week once and releases it; updated_at is still
// stamped; STATUS-check row 64 says false before and true after (and false without the guard). Then the cron files
// against a stand-in cron schema: the hourly file fails loudly without the job and shows the schedule it set, and the
// older files never put a weekly schedule back over the hourly one.
// Needs PGlite (not a repo dependency): PGLITE=/path/to/@electric-sql/pglite/dist/index.js node test/coach-report-schedule-sql.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite;
try { PGlite = (await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite')).PGlite; }
catch (e) { console.log('SKIP: PGlite not found (set PGLITE=/path/to/@electric-sql/pglite/dist/index.js). ' + e.message); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const A = '0000000a-0000-4000-8000-000000000001', B = '0000000b-0000-4000-8000-000000000002', C = '0000000c-0000-4000-8000-000000000003';

const db = new PGlite();
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  create table public.profiles (id uuid primary key, name text, user_type text, coach_id uuid);
  insert into auth.users values ('${A}'), ('${B}'), ('${C}');
  insert into public.profiles values ('${A}', 'Sam Coach', 'coach', null), ('${B}', 'Dee Coach', 'coach', null), ('${C}', 'New Coach', 'coach', null);
`);
await db.exec(fs.readFileSync(path.join(ROOT, 'sql/migration-email-preferences.sql'), 'utf8'));
// Supabase grants every table in public to these roles; RLS is what limits them.
await db.exec(`grant select, insert, update, delete on public.email_preferences to anon, authenticated, service_role;
  delete from public.email_preferences where user_id = '${C}';`);   // C has no row yet (an account from before the sign-up trigger)

const STATUS = fs.readFileSync(path.join(ROOT, 'sql/STATUS-check.sql'), 'utf8');
const statusRow = async (n) => {
  const m = new RegExp('\\(' + n + ',\\s*\'[^\']*(?:\'\'[^\']*)*\',\\s*([\\s\\S]*?)\\)\\s*(?=,\\s*\\(\\d+,|\\n\\))').exec(STATUS);
  if (!m) return 'missing';
  return (await db.query('select (' + m[1] + ') as applied')).rows[0].applied;
};
ok(await statusRow(64) === false, 'row 64 says false before the migration');

const FILE = fs.readFileSync(path.join(ROOT, 'sql/migration-coach-report-schedule-2026-11-02.sql'), 'utf8');
// powa.cutover_now pretends the time the file runs (nothing in the app sets it): Monday 2 Nov, 20:00 UTC, after that
// day's 14:00 UTC run.
const runFile = async (when) => {
  const notices = [];
  if (when) await db.exec(`set powa.cutover_now = '${when}'`);
  try { await db.exec(FILE, { onNotice: (n) => notices.push(n.message) }); return { notices }; }
  catch (e) { return { err: e.message, notices }; }
  finally { if (when) await db.exec('reset powa.cutover_now'); }
};
const run1 = await runFile('2026-11-02T20:00:00Z'), run2 = await runFile('2026-11-09T20:00:00Z');
ok(!run1.err && !run2.err, 'it runs twice: ' + (run1.err || run2.err || 'ok'));
ok(run1.notices.some(m => /every row starts at 2026-10-26/.test(m)) && !run2.notices.some(m => /every row starts/.test(m)),
  'the first run says the cut-over week, the second says nothing: ' + JSON.stringify([run1.notices, run2.notices]));
ok(await statusRow(64) === true, 'row 64 says true after it');

const as = async (who, q, p) => {
  const role = who === 'service' ? 'service_role' : who ? 'authenticated' : 'anon';
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${who && who !== 'service' ? who : ''}', false);`);
  try { const r = await db.query(q, p || []); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { err: e.message }; }
  finally { await db.exec('reset role'); }
};
const rowOf = async (id) => (await db.query('select report_day, report_hour, tz, report_sent_week::text as sent, updated_at from public.email_preferences where user_id = $1', [id])).rows[0];

// Defaults for every existing row, and the cut-over: the week the old job sent that Monday at 14:00 UTC.
const a0 = await rowOf(A);
ok(a0.report_day === 'sun' && a0.report_hour === 18 && a0.tz === null && a0.sent === '2026-10-26',
  'defaults: Sunday 18:00, no zone, the week the Monday job last sent (the second run kept it): ' + JSON.stringify(a0));

// A coach changes their own schedule.
const own = await as(A, `update public.email_preferences set report_day = 'mon', report_hour = 7, tz = 'Europe/London' where user_id = $1`, [A]);
ok(own.n === 1, 'own row: updated (' + (own.err || own.n) + ')');
const a1 = await rowOf(A);
ok(a1.report_day === 'mon' && a1.report_hour === 7 && a1.tz === 'Europe/London' && a1.updated_at > a0.updated_at, 'own row: saved, updated_at stamped');
const read = await as(A, `select report_day, report_hour, tz from public.email_preferences`);
ok(read.rows && read.rows.length === 1 && read.rows[0].tz === 'Europe/London', 'a coach reads their own row only: ' + JSON.stringify(read.rows || read.err));
// The app's save is an upsert on user_id: the same through insert … on conflict.
const ups = await as(A, `insert into public.email_preferences (user_id, report_day, report_hour, tz) values ($1, 'sun', 19, 'America/New_York')
  on conflict (user_id) do update set report_day = excluded.report_day, report_hour = excluded.report_hour, tz = excluded.tz`, [A]);
ok(!ups.err && (await rowOf(A)).report_hour === 19, 'own row: the app\'s upsert saves: ' + (ups.err || 'ok'));

// Never someone else's.
const other = await as(A, `update public.email_preferences set report_day = 'mon', tz = 'Asia/Kolkata', report_sent_week = '2026-11-02' where user_id = $1`, [B]);
const b1 = await rowOf(B);
ok(other.n === 0 && b1.report_day === 'sun' && b1.tz === null && b1.sent === '2026-10-26', 'another coach\'s row: untouched (' + (other.err || other.n + ' rows') + ')');
const otherIns = await as(A, `insert into public.email_preferences (user_id, report_day) values ($1, 'mon')`, [C]);
ok(otherIns.err && /row-level security/i.test(otherIns.err), 'a row for someone else: refused (' + (otherIns.err || 'it went in') + ')');
const anonUp = await as(null, `update public.email_preferences set report_hour = 3`);
const anonRead = await as(null, `select user_id from public.email_preferences`);
ok(anonUp.n === 0 && anonRead.rows && anonRead.rows.length === 0, 'signed out: changes nothing, reads nothing');
ok((await rowOf(B)).report_hour === 18 && (await rowOf(A)).report_hour === 19, 'and nothing changed');
// A coach with no row yet makes their own (the first save); a week sent along is dropped (they get their first report).
const cIns = await as(C, `insert into public.email_preferences (user_id, report_day, report_hour, tz, report_sent_week) values ($1, 'mon', 6, 'Australia/Sydney', '2026-11-02')`, [C]);
const c0 = await rowOf(C);
ok(!cIns.err && c0.tz === 'Australia/Sydney' && c0.sent === null, 'a coach\'s first save makes their row, with no week sent: ' + (cIns.err || JSON.stringify(c0)));

// The checks.
for (const [set, what] of [["report_day = 'tue'", 'a day'], ['report_hour = 24', 'an hour past 23'], ['report_hour = -1', 'a negative hour'],
  ["tz = 'Europe/London; drop table x'", 'a zone with odd characters'], ["tz = '" + 'A'.repeat(65) + "'", 'a zone over 64 characters'], ["tz = ''", 'an empty zone']]) {
  const r = await as(A, `update public.email_preferences set ${set} where user_id = $1`, [A]);
  ok(r.err && /check constraint/i.test(r.err), 'refused: ' + what + ' (' + (r.err || 'saved') + ')');
}
ok(!(await as(A, `update public.email_preferences set tz = null, report_hour = 0 where user_id = $1`, [A])).err, 'no zone (UTC) and midnight are fine');

// report_sent_week is the job's. The owner can't clear it (to have a week sent again) or move it on (to skip one):
// the rest of their write saves, the week stays.
const clear = await as(A, `update public.email_preferences set report_sent_week = null, report_hour = 20 where user_id = $1`, [A]);
let a2 = await rowOf(A);
ok(clear.n === 1 && a2.report_hour === 20 && a2.sent === '2026-10-26', 'the owner clears their week: the hour saves, the week stays (' + (clear.err || JSON.stringify(a2)) + ')');
const upsWeek = await as(A, `insert into public.email_preferences (user_id, report_hour, report_sent_week) values ($1, 21, '2026-12-28')
  on conflict (user_id) do update set report_hour = excluded.report_hour, report_sent_week = excluded.report_sent_week`, [A]);
a2 = await rowOf(A);
ok(!upsWeek.err && a2.report_hour === 21 && a2.sent === '2026-10-26', 'an upsert with a week: the hour saves, the week stays (' + (upsWeek.err || JSON.stringify(a2)) + ')');
const g = (await db.query(`select has_function_privilege('authenticated', 'public.guard_email_prefs_report_week()', 'execute') as u,
  has_function_privilege('anon', 'public.guard_email_prefs_report_week()', 'execute') as a`)).rows[0];
ok(!g.u && !g.a, 'the guard itself: nobody signed in runs it (' + JSON.stringify(g) + ')');

// The hourly job (service role) writes it on anyone's row; the SQL editor too.
const svc = await as('service', `update public.email_preferences set report_sent_week = '2026-11-02' where user_id = $1`, [B]);
ok(svc.n === 1 && (await rowOf(B)).sent === '2026-11-02', 'the service role marks the week sent: ' + (svc.err || svc.n));
await db.query(`update public.email_preferences set report_sent_week = '2026-10-19' where user_id = $1`, [B]);
ok((await rowOf(B)).sent === '2026-10-19', 'the SQL editor writes it too');
// The job's claim (index.ts claimWeek: .or('report_sent_week.is.null,report_sent_week.neq.<week>')): the week goes in
// only where it isn't already, and the row comes back to the one run that wrote it.
const CLAIM = `update public.email_preferences set report_sent_week = $2::date where user_id = $1
  and (report_sent_week is null or report_sent_week <> $2::date) returning user_id`;
const k1 = await as('service', CLAIM, [B, '2026-11-02']), k2 = await as('service', CLAIM, [B, '2026-11-02']);
ok(k1.rows && k1.rows.length === 1 && k2.rows && k2.rows.length === 0, 'the claim: the first run wins the week, the next gets nothing back (' + JSON.stringify([k1, k2]) + ')');
const kNull = await as('service', CLAIM, [C, '2026-11-02']);
ok(kNull.rows && kNull.rows.length === 1, 'a row with no week yet is claimed too');
// The release (the email didn't go): the week before goes back, only while the claim is still there.
const REL = `update public.email_preferences set report_sent_week = $3::date where user_id = $1 and report_sent_week = $2::date`;
const rel = await as('service', REL, [B, '2026-11-02', '2026-10-19']);
ok(rel.n === 1 && (await rowOf(B)).sent === '2026-10-19', 'the release puts the week before back');
ok((await as('service', REL, [B, '2026-11-02', '2026-10-12'])).n === 0 && (await rowOf(B)).sent === '2026-10-19', 'a late release changes nothing');
// A signed-in user's claim gets nothing (their own row: the week stays).
const kUser = await as(A, CLAIM, [A, '2026-11-02']);
ok((await rowOf(A)).sent === '2026-10-26', 'the owner\'s own "claim" leaves the week as it was (' + (kUser.err || kUser.n + ' row') + ')');

// The cut-over, by the time the file runs (the column made afresh each time). The old job sent last week's report on
// Mondays at 14:00 UTC; the hourly job sends a 'sun' coach's week on Sunday and a 'mon' coach's last week on Monday,
// so each row starts at the week the old job last sent.
await db.query(`update public.email_preferences set report_sent_week = null where user_id = $1`, [C]);
const cutover = async (when) => {
  await db.exec('alter table public.email_preferences drop column report_sent_week');
  const r = await runFile(when);
  return { err: r.err, weeks: (await db.query(`select distinct report_sent_week::text as w from public.email_preferences`)).rows.map(x => x.w) };
};
for (const [when, week, why] of [
  ['2026-11-02T13:59:00Z', '2026-10-19', 'a Monday before 14:00 UTC: that day\'s run hasn\'t gone, the one before sent 19 Oct'],
  ['2026-11-02T14:00:00Z', '2026-10-26', 'a Monday from 14:00 UTC: that day\'s run sent 26 Oct'],
  ['2026-11-02T09:30:00-05:00', '2026-10-26', 'read in UTC: 09:30 in New York is 14:30 UTC'],
  ['2026-11-03T09:00:00Z', '2026-10-26', 'a Tuesday: Monday\'s run sent 26 Oct'],
  ['2026-11-08T23:30:00Z', '2026-10-26', 'a Sunday night: still the week Monday\'s run sent'],
  ['2026-11-09T00:30:00Z', '2026-10-26', 'the next Monday before 14:00 UTC: the run a week before sent 26 Oct'],
]) {
  const got = await cutover(when);
  ok(!got.err && got.weeks.length === 1 && got.weeks[0] === week, 'cut-over at ' + when + ' → ' + week + ' (' + why + '): ' + (got.err || JSON.stringify(got.weeks)));
}
// Once: run again later, every row keeps its week, and a row with none (a coach who signed up since) stays without one.
await db.query(`update public.email_preferences set report_sent_week = null where user_id = $1`, [C]);
const again = await runFile('2026-11-16T20:00:00Z');
const weeks = (await db.query(`select user_id, report_sent_week::text as w from public.email_preferences order by user_id`)).rows;
ok(!again.err && weeks.length === 3 && weeks.every(r => r.user_id === C ? r.w === null : r.w === '2026-10-26'), 'a later run changes no week: ' + (again.err || JSON.stringify(weeks)));
// Row 64 needs the guard.
await db.exec('drop trigger trg_guard_email_prefs_report_week on public.email_preferences');
ok(await statusRow(64) === false, 'row 64 says false without the guard');
ok(!(await runFile()).err && await statusRow(64) === true, 'and true once the file puts it back');

// ---------------------------------------------------------------- the cron files, against a stand-in for pg_cron
await db.exec(`
  create schema cron;
  create table cron.job (jobid bigserial primary key, jobname text unique, schedule text not null, command text not null, active boolean not null default true);
  create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as $$
    insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
    on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
  create function cron.unschedule(p_name text) returns boolean language sql as $$
    with d as (delete from cron.job where jobname = p_name returning 1) select count(*) > 0 from d $$;
  create function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null,
    username text default null, active boolean default null) returns void language sql as $$
    update cron.job j set schedule = coalesce(alter_job.schedule, j.schedule), command = coalesce(alter_job.command, j.command),
      active = coalesce(alter_job.active, j.active) where j.jobid = alter_job.job_id $$;
  create schema net;
  create function net.http_post(url text, headers jsonb, body jsonb) returns bigint language sql as $$ select 1::bigint $$;
`);
const CRON = {
  hourly: fs.readFileSync(path.join(ROOT, 'sql/cron-coach-report-hourly-2026-11-02.sql'), 'utf8'),
  alerts: fs.readFileSync(path.join(ROOT, 'sql/cron-coach-alerts-2026-10-28.sql'), 'utf8'),
  // pg_cron and pg_net are Supabase's; the stand-ins above take their place.
  digest: fs.readFileSync(path.join(ROOT, 'sql/cron-weekly-digest.sql'), 'utf8').replace(/^create extension if not exists pg_(cron|net);$/gm, ''),
};
const runCron = async (name) => {
  const notices = [];
  try { const res = await db.exec(CRON[name], { onNotice: (n) => notices.push(n.message) }); return { notices, last: res[res.length - 1].rows }; }
  catch (e) { return { err: e.message, notices }; }
};
const job = async () => (await db.query(`select schedule, command from cron.job where jobname = 'powa-weekly-digest'`)).rows;

const noJob = await runCron('hourly'), noJob2 = await runCron('alerts');
ok(noJob.err && /No cron job named powa-weekly-digest/.test(noJob.err) && (await job()).length === 0, 'the hourly file without the job: stops with an error (' + (noJob.err || 'it ran') + ')');
ok(noJob2.err && /No cron job named powa-weekly-digest/.test(noJob2.err), 'the Thursday file too (' + (noJob2.err || 'it ran') + ')');
// The job as it is live today: Mondays (and Thursdays) at 14:00 UTC, its command holding the secret.
await db.exec(`insert into cron.job (jobname, schedule, command) values ('powa-weekly-digest', '0 14 * * 1', 'select ''the secret''')`);
const thu = await runCron('alerts');
ok(!thu.err && (await job())[0].schedule === '0 14 * * 1,4', 'the Thursday file on a weekly job: Mondays and Thursdays (' + (thu.err || (await job())[0].schedule) + ')');
const hr = await runCron('hourly');
ok(!hr.err && (await job())[0].schedule === '0 * * * *' && (await job())[0].command === "select 'the secret'", 'the hourly file: every hour, the command as it was');
ok(hr.notices && hr.notices.some(m => m.includes('now runs at "0 * * * *"')) && hr.last && hr.last.length === 1 && hr.last[0].schedule === '0 * * * *' && !('command' in hr.last[0]),
  'and it shows the schedule it set, never the command: ' + JSON.stringify(hr.last || hr.err));
ok(!(await runCron('hourly')).err && (await job())[0].schedule === '0 * * * *', 'the hourly file twice: the same');
const thu2 = await runCron('alerts');
ok(!thu2.err && (await job())[0].schedule === '0 * * * *' && thu2.notices.some(m => /left as it is/.test(m)), 'the Thursday file after it: leaves the hourly schedule and says so');
const dig = await runCron('digest'), dig2 = await runCron('digest');
const jobs = await job();
ok(!dig.err && !dig2.err && jobs.length === 1 && jobs[0].schedule === '0 * * * *' && /send-weekly-digest/.test(jobs[0].command), 'the digest file (twice): one job, hourly (' + (dig.err || dig2.err || jobs.map(j => j.schedule)) + ')');
// If the schedule doesn't take, the hourly file says so.
await db.exec(`update cron.job set schedule = '0 14 * * 1,4';
  create or replace function cron.alter_job(job_id bigint, schedule text default null, command text default null, database text default null,
    username text default null, active boolean default null) returns void language sql as $$ select $$;`);
const stuck = await runCron('hourly');
ok(stuck.err && /still runs at "0 14 \* \* 1,4"/.test(stuck.err), 'a schedule that didn\'t take: an error, not a quiet pass (' + (stuck.err || 'it passed') + ')');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
