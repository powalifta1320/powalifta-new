// sql/migration-coach-report-schedule-2026-11-02.sql in PGlite: the four columns on email_preferences under its own
// policies (migration-email-preferences.sql: a user reads, inserts and updates their own row only; Supabase's default
// grants): it runs twice; every row gets Sunday 18:00 and no time zone; a coach changes them on their own row, never on
// another coach's, and a signed-out visitor on none; the checks keep a day, an hour and a zone-shaped name; the service
// role (the hourly job) marks the week sent; updated_at is still stamped; STATUS-check row 64 says false before and
// true after.
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
for (let i = 0; i < 2; i++) { try { await db.exec(FILE); ok(true, ''); } catch (e) { ok(false, 'run ' + (i + 1) + ': ' + e.message); } }
ok(await statusRow(64) === true, 'row 64 says true after it');

const as = async (who, q, p) => {
  const role = who === 'service' ? 'service_role' : who ? 'authenticated' : 'anon';
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${who && who !== 'service' ? who : ''}', false);`);
  try { const r = await db.query(q, p || []); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { err: e.message }; }
  finally { await db.exec('reset role'); }
};
const rowOf = async (id) => (await db.query('select report_day, report_hour, tz, report_sent_week::text as sent, updated_at from public.email_preferences where user_id = $1', [id])).rows[0];

// Defaults for every existing row.
const a0 = await rowOf(A);
ok(a0.report_day === 'sun' && a0.report_hour === 18 && a0.tz === null && a0.sent === null, 'defaults: Sunday 18:00, no zone, nothing sent: ' + JSON.stringify(a0));

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
const other = await as(A, `update public.email_preferences set report_day = 'mon', tz = 'Asia/Kolkata', report_sent_week = '2026-10-26' where user_id = $1`, [B]);
const b1 = await rowOf(B);
ok(other.n === 0 && b1.report_day === 'sun' && b1.tz === null && b1.sent === null, 'another coach\'s row: untouched (' + (other.err || other.n + ' rows') + ')');
const otherIns = await as(A, `insert into public.email_preferences (user_id, report_day) values ($1, 'mon')`, [C]);
ok(otherIns.err && /row-level security/i.test(otherIns.err), 'a row for someone else: refused (' + (otherIns.err || 'it went in') + ')');
const anonUp = await as(null, `update public.email_preferences set report_hour = 3`);
const anonRead = await as(null, `select user_id from public.email_preferences`);
ok(anonUp.n === 0 && anonRead.rows && anonRead.rows.length === 0, 'signed out: changes nothing, reads nothing');
ok((await rowOf(B)).report_hour === 18 && (await rowOf(A)).report_hour === 19, 'and nothing changed');
// A coach with no row yet makes their own (the first save).
const cIns = await as(C, `insert into public.email_preferences (user_id, report_day, report_hour, tz) values ($1, 'mon', 6, 'Australia/Sydney')`, [C]);
ok(!cIns.err && (await rowOf(C)).tz === 'Australia/Sydney', 'a coach\'s first save makes their row: ' + (cIns.err || 'ok'));

// The checks.
for (const [set, what] of [["report_day = 'tue'", 'a day'], ['report_hour = 24', 'an hour past 23'], ['report_hour = -1', 'a negative hour'],
  ["tz = 'Europe/London; drop table x'", 'a zone with odd characters'], ["tz = '" + 'A'.repeat(65) + "'", 'a zone over 64 characters'], ["tz = ''", 'an empty zone']]) {
  const r = await as(A, `update public.email_preferences set ${set} where user_id = $1`, [A]);
  ok(r.err && /check constraint/i.test(r.err), 'refused: ' + what + ' (' + (r.err || 'saved') + ')');
}
ok(!(await as(A, `update public.email_preferences set tz = null, report_hour = 0 where user_id = $1`, [A])).err, 'no zone (UTC) and midnight are fine');

// The hourly job (service role) marks the week sent, on anyone's row.
const svc = await as('service', `update public.email_preferences set report_sent_week = '2026-10-26' where user_id = $1`, [B]);
ok(svc.n === 1 && (await rowOf(B)).sent === '2026-10-26', 'the service role marks the week sent: ' + (svc.err || svc.n));
// Its own row is the coach's: they may clear the mark (they'd only get their own report again).
ok((await as(A, `update public.email_preferences set report_sent_week = null where user_id = $1`, [A])).n === 1, 'the owner may write their own mark');

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
