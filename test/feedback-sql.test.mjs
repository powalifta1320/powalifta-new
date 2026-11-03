// sql/migration-feedback-2026-11-03.sql in PGlite (STATUS-check row 65): the Feedback box's table, its policies and its
// guard, with Supabase's default grants (every new table in public granted to anon, authenticated and service_role:
// RLS and the file's own revoke are what limit them). It runs twice; row 65 says false before and true after; a user
// inserts and reads their own, never another's, and can't update or delete even their own; an admin reads, updates
// and deletes every row and the guard keeps the words; anon can't insert or read; the checks refuse a bad kind, an
// empty or blank body, 4,001 characters, a non-object or oversize context, an oversize note; the cap holds at 20 in 24
// hours for a user and for the service role (older rows don't count); an account's deletion takes its rows. Then with
// two-factor (the real migration-mfa-aal2-2026-10-28.sql, row 60) in either order: the table gets powa_mfa_aal2, an
// aal1 session of an account with a verified authenticator sends and reads nothing, aal2 works, row 60 stays true.
// Needs PGlite (not a repo dependency): PGLITE=/path/to/@electric-sql/pglite/dist/index.js node test/feedback-sql.test.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let PGlite;
try { PGlite = (await import(process.env.PGLITE ? pathToFileURL(process.env.PGLITE).href : '@electric-sql/pglite')).PGlite; }
catch (e) { console.log('SKIP: PGlite not found (set PGLITE=/path/to/@electric-sql/pglite/dist/index.js). ' + e.message); process.exit(0); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const FILE = fs.readFileSync(path.join(ROOT, 'sql/migration-feedback-2026-11-03.sql'), 'utf8');
const MFA = fs.readFileSync(path.join(ROOT, 'sql/migration-mfa-aal2-2026-10-28.sql'), 'utf8');
const STATUS = fs.readFileSync(path.join(ROOT, 'sql/STATUS-check.sql'), 'utf8');
const A = '0000000a-0000-4000-8000-000000000001', B = '0000000b-0000-4000-8000-000000000002', C = '0000000c-0000-4000-8000-000000000003',
  D = '0000000d-0000-4000-8000-000000000004', ADMIN = '000000ad-0000-4000-8000-000000000005';

// The live shape this file needs: the three API roles, auth.uid() / auth.jwt() reading the request's claims as
// PostgREST sets them, profiles and the is_admin() helper (SECURITY DEFINER, as live), Supabase's default grants.
async function world() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif((select auth.jwt()) ->> 'sub', '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    grant usage on schema public to anon, authenticated, service_role;
    alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
    alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
    create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, name text, user_type text, is_admin boolean not null default false);
    create table public.workout_logs (id uuid primary key);
    alter table public.profiles enable row level security;
    alter table public.workout_logs enable row level security;
    create function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
      select coalesce((select p.is_admin from public.profiles p where p.id = (select auth.uid())), false) $$;
    insert into auth.users values ('${A}', 'sarah@example.com'), ('${B}', 'tom@example.com'), ('${C}', 'nina@example.com'), ('${D}', 'dev@example.com'), ('${ADMIN}', 'owner@example.com');
    insert into public.profiles values ('${A}', 'Sarah Kim', 'athlete', false), ('${B}', 'Tom Baker', 'athlete', false), ('${C}', 'Nina Park', 'coach', false),
      ('${D}', 'Dev Rao', 'athlete', false), ('${ADMIN}', 'The Owner', 'coach', true);
  `);
  return db;
}
const statusRow = async (db, n) => {
  const m = new RegExp('\\(' + n + ',\\s*\'[^\']*(?:\'\'[^\']*)*\',\\s*([\\s\\S]*?)\\)\\s*(?=,\\s*\\(\\d+,|\\n\\))').exec(STATUS);
  if (!m) return 'missing';
  return (await db.query('select (' + m[1] + ') as applied')).rows[0].applied;
};
const run = async (db, sql) => { try { await db.exec(sql); return null; } catch (e) { return e.message; } };
// One request as PostgREST makes it: the role, the token's claims, the statement. who: a uid (aal1), { id, aal }, 'service' or null (anon).
const as = async (db, who, q, p) => {
  const id = who && who !== 'service' ? (who.id || who) : null;
  const role = who === 'service' ? 'service_role' : id ? 'authenticated' : 'anon';
  const claims = id ? JSON.stringify({ sub: id, role: 'authenticated', aal: who.aal || 'aal1' }) : who === 'service' ? JSON.stringify({ role: 'service_role' }) : '';
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
  await db.exec(`set role ${role}`);
  try { const r = await db.query(q, p || []); return { rows: r.rows, n: r.affectedRows }; }
  catch (e) { return { err: e.message }; }
  finally { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claims', '', false)`); }
};
const INS = `insert into public.feedback (kind, body, context) values ($1, $2, $3::jsonb) returning id, user_id, status, admin_note, handled_at, created_at`;
const send = (db, who, kind, body, ctx) => as(db, who, INS, [kind, body, JSON.stringify(ctx || {})]);
const rowOf = async (db, id) => (await db.query('select * from public.feedback where id = $1', [id])).rows[0];

// ---------------------------------------------------------------- 1. the file, twice
const db = await world();
ok(await statusRow(db, 65) === false, 'row 65 says false before the migration');
const r1 = await run(db, FILE), r2 = await run(db, FILE);
ok(!r1 && !r2, 'it runs twice: ' + (r1 || r2 || 'ok'));
ok(await statusRow(db, 65) === true, 'row 65 says true after it');
const pols = (await db.query(`select policyname, cmd, permissive, roles::text from pg_policies where tablename = 'feedback' order by 1`)).rows;
ok(JSON.stringify(pols.map(p => p.policyname + ':' + p.cmd + ':' + p.permissive + ':' + p.roles)) ===
  JSON.stringify(['feedback_delete:DELETE:PERMISSIVE:{authenticated}', 'feedback_insert:INSERT:PERMISSIVE:{authenticated}', 'feedback_select:SELECT:PERMISSIVE:{authenticated}', 'feedback_update:UPDATE:PERMISSIVE:{authenticated}']),
  'one policy per command, signed-in only, and no two-factor policy without row 60: ' + JSON.stringify(pols));
const quals = (await db.query(`select string_agg(coalesce(qual, '') || ' ' || coalesce(with_check, ''), ' | ') as q from pg_policies where tablename = 'feedback'`)).rows[0].q;
ok(!/auth\.uid\(\)\s*[=)]/.test(quals.replace(/SELECT auth\.uid\(\) AS uid/g, '')) && /SELECT auth\.uid\(\) AS uid/.test(quals) && /SELECT is_admin\(\) AS is_admin/.test(quals),
  'every check is wrapped in (select ...), as since row 55: ' + quals);
const priv = (await db.query(`select has_table_privilege('anon', 'public.feedback', 'insert') ai, has_table_privilege('anon', 'public.feedback', 'select') asl,
  has_table_privilege('authenticated', 'public.feedback', 'insert') ui, has_function_privilege('authenticated', 'public.feedback_guard()', 'execute') ug`)).rows[0];
ok(!priv.ai && !priv.asl && priv.ui && !priv.ug, 'anon has no privilege, signed-in users insert through RLS, nobody calls the guard: ' + JSON.stringify(priv));

// ---------------------------------------------------------------- 2. a user: their own, and only their own
const a1 = await send(db, A, 'problem', 'The Log set button did nothing on my second set.', { screen: 'Train', app: 'iphone' });
ok(a1.rows && a1.rows.length === 1 && a1.rows[0].user_id === A && a1.rows[0].status === 'new', 'a user sends a problem (user_id from the token): ' + (a1.err || JSON.stringify(a1.rows)));
const a2 = await send(db, A, 'idea', 'A plate calculator for the bar I actually use.');
ok(!a2.err, 'and an idea, with no details: ' + (a2.err || 'ok'));
const b1 = await send(db, B, 'idea', 'Dark mode on the website please');
ok(!b1.err, 'another user sends one: ' + (b1.err || 'ok'));
const aRead = await as(db, A, `select id, user_id, kind, body from public.feedback order by created_at`);
ok(aRead.rows && aRead.rows.length === 2 && aRead.rows.every(r => r.user_id === A), 'a user reads their own (2), never another\'s: ' + JSON.stringify(aRead.rows || aRead.err));
const forged = await as(db, A, `insert into public.feedback (user_id, kind, body) values ($1, 'idea', 'from Tom, honest')`, [B]);
ok(forged.err && /row-level security/i.test(forged.err), 'a row in someone else\'s name: refused (' + (forged.err || 'it went in') + ')');
const sneaky = await as(db, A, `insert into public.feedback (kind, body, status, admin_note, handled_at, created_at) values ('problem', 'it broke', 'done', 'fixed', now(), '2020-01-01') returning id`);
const sn = sneaky.rows ? await rowOf(db, sneaky.rows[0].id) : null;
ok(sn && sn.status === 'new' && sn.admin_note === null && sn.handled_at === null && sn.created_at > new Date(Date.now() - 60000),
  'a user can\'t close, annotate or backdate their own: it starts new, unhandled, now (' + (sneaky.err || JSON.stringify(sn && { s: sn.status, n: sn.admin_note, h: sn.handled_at, c: sn.created_at })) + ')');
const aUp = await as(db, A, `update public.feedback set body = 'changed', status = 'done' where user_id = $1`, [A]);
const aDel = await as(db, A, `delete from public.feedback where user_id = $1`, [A]);
const bTouch = await as(db, B, `update public.feedback set body = 'x' where user_id = $1`, [A]);
const bDel = await as(db, B, `delete from public.feedback`);
ok(aUp.n === 0 && aDel.n === 0 && bTouch.n === 0 && bDel.n === 0, 'a user can\'t update or delete their own, nor anyone else\'s (' + JSON.stringify([aUp, aDel, bTouch, bDel]) + ')');
ok((await rowOf(db, a1.rows[0].id)).body === 'The Log set button did nothing on my second set.', 'and nothing changed');
const bRead = await as(db, B, `select user_id from public.feedback`);
ok(bRead.rows && bRead.rows.length === 1 && bRead.rows[0].user_id === B, 'the other user reads only theirs');

// ---------------------------------------------------------------- 3. anon
const anonIns = await as(db, null, `insert into public.feedback (user_id, kind, body) values ($1, 'idea', 'hi')`, [A]);
const anonRead = await as(db, null, `select id from public.feedback`);
ok(anonIns.err && /permission denied/i.test(anonIns.err), 'anon can\'t insert (' + (anonIns.err || 'it went in') + ')');
ok(anonRead.err && /permission denied/i.test(anonRead.err), 'anon can\'t read (' + (anonRead.err || JSON.stringify(anonRead.rows)) + ')');

// ---------------------------------------------------------------- 4. an admin
const total = Number((await db.query('select count(*)::int as n from public.feedback')).rows[0].n);
const adRead = await as(db, ADMIN, `select id from public.feedback`);
ok(adRead.rows && adRead.rows.length === total && total === 4, 'an admin reads every row (' + total + ')');
const seen = await as(db, ADMIN, `update public.feedback set status = 'seen', admin_note = 'Looking into the button', body = 'rewritten', user_id = $2, kind = 'idea', context = '{}'::jsonb, created_at = '2020-01-01'
  where id = $1 returning id`, [a1.rows[0].id, B]);
const s1 = await rowOf(db, a1.rows[0].id);
ok(seen.n === 1 && s1.status === 'seen' && s1.admin_note === 'Looking into the button' && s1.handled_at instanceof Date,
  'an admin marks it seen with a note; handled_at is stamped (' + (seen.err || JSON.stringify({ st: s1.status, h: s1.handled_at })) + ')');
ok(s1.body === 'The Log set button did nothing on my second set.' && s1.user_id === A && s1.kind === 'problem' && s1.context.screen === 'Train' && s1.created_at > new Date('2026-01-01'),
  'the guard keeps who sent it, the kind, the words, the details and when');
const keepH = await as(db, ADMIN, `update public.feedback set admin_note = 'still on it', handled_at = '2020-01-01' where id = $1`, [a1.rows[0].id]);
const s2 = await rowOf(db, a1.rows[0].id);
ok(keepH.n === 1 && s2.admin_note === 'still on it' && +s2.handled_at === +s1.handled_at, 'a note alone leaves handled_at as it was (the server\'s clock)');
await as(db, ADMIN, `update public.feedback set status = 'done' where id = $1`, [a1.rows[0].id]);
ok((await rowOf(db, a1.rows[0].id)).status === 'done', 'an admin marks it done');
await as(db, ADMIN, `update public.feedback set status = 'new' where id = $1`, [a1.rows[0].id]);
ok((await rowOf(db, a1.rows[0].id)).handled_at === null, 'back to new: handled_at cleared');
const longNote = await as(db, ADMIN, `update public.feedback set admin_note = $2 where id = $1`, [a1.rows[0].id, 'n'.repeat(2001)]);
ok(longNote.err && /feedback_admin_note_check/.test(longNote.err), 'a note over 2,000 characters: refused (' + (longNote.err || 'saved') + ')');
const badStatus = await as(db, ADMIN, `update public.feedback set status = 'closed' where id = $1`, [a1.rows[0].id]);
ok(badStatus.err && /feedback_status_check/.test(badStatus.err), 'a status that isn\'t new, seen or done: refused');
const adDel = await as(db, ADMIN, `delete from public.feedback where id = $1`, [sneaky.rows[0].id]);
ok(adDel.n === 1 && !(await rowOf(db, sneaky.rows[0].id)), 'an admin deletes one');
const adForge = await as(db, ADMIN, `insert into public.feedback (user_id, kind, body) values ($1, 'idea', $2)`, [B, 'in Tom\'s name']);
ok(adForge.err && /row-level security/i.test(adForge.err), 'an admin can\'t write one in someone else\'s name either');

// ---------------------------------------------------------------- 5. the checks
for (const [kind, body, ctx, what, re] of [
  ['bug', 'x', {}, 'a kind that isn\'t idea or problem', /feedback_kind_check/],
  ['idea', '', {}, 'an empty body', /feedback_body_check/],
  ['idea', ' \n\t  \n', {}, 'a body of spaces and line breaks', /feedback_body_check/],
  ['problem', 'x'.repeat(4001), {}, '4,001 characters', /feedback_body_check/],
  ['problem', 'ok', [], 'a context that isn\'t an object', /feedback_context_check/],
  ['problem', 'ok', { msg: 'e'.repeat(8200) }, 'a context over 8 KB', /feedback_context_check/],
]) {
  const r = await as(db, D, INS, [kind, body, JSON.stringify(ctx)]);
  ok(r.err && re.test(r.err), 'refused: ' + what + ' (' + (r.err || 'it went in') + ')');
}
const nullCtx = await as(db, D, `insert into public.feedback (kind, body, context) values ('idea', 'x', null)`);
ok(nullCtx.err && /null value/i.test(nullCtx.err), 'refused: a null context');
const edge = await send(db, D, 'problem', 'é'.repeat(4000), { app: 'web', errors: [{ msg: 'x'.repeat(200) }] });
ok(!edge.err, '4,000 characters (counted as characters, not bytes) and a context under 8 KB: fine (' + (edge.err || 'ok') + ')');
const quoted = await send(db, D, 'idea', `'); drop table public.feedback; --  <script>alert(1)</script>`);
ok(!quoted.err && (await rowOf(db, quoted.rows[0].id)).body.startsWith("'); drop table"), 'quotes, semicolons and markup are stored as text');

// ---------------------------------------------------------------- 6. the cap: 20 in any 24 hours, every way in
await db.query(`insert into public.feedback (user_id, kind, body, created_at) select $1, 'idea', 'old ' || g, now() - interval '2 days' from generate_series(1, 25) g`, [C]);
let capErr = null, made = 0;
for (let i = 0; i < 21; i++) { const r = await send(db, C, 'idea', 'idea ' + i); if (r.err) { capErr = r.err; break; } made++; }
ok(made === 20 && capErr && /feedback_cap/.test(capErr), 'a user: 20 in 24 hours, the 21st refused with feedback_cap (older rows don\'t count): ' + made + ' / ' + capErr);
const svcFirst = await as(db, 'service', `insert into public.feedback (user_id, kind, body) values ($1, 'idea', 'via the function') returning id`, [C]);
ok(svcFirst.err && /feedback_cap/.test(svcFirst.err), 'the service role (the edge function) is capped too: ' + (svcFirst.err || 'it went in'));
let svcMade = 0, svcErr = null;
for (let i = 0; i < 21; i++) { const r = await as(db, 'service', `insert into public.feedback (user_id, kind, body) values ($1, 'problem', $2)`, [B, 'p' + i]); if (r.err) { svcErr = r.err; break; } svcMade++; }
ok(svcMade === 19 && /feedback_cap/.test(svcErr || ''), 'the service role for a user with 1 already: 19 more, then refused (' + svcMade + ' / ' + svcErr + ')');
const svcNoUser = await as(db, 'service', `insert into public.feedback (kind, body) values ('idea', 'who?')`);
ok(svcNoUser.err && /null value in column "user_id"/.test(svcNoUser.err), 'the service role must name the user (no token, no default): ' + (svcNoUser.err || 'it went in'));

// ---------------------------------------------------------------- 7. an account deleted takes its rows
const before = Number((await db.query('select count(*)::int n from public.feedback where user_id = $1', [B])).rows[0].n);
await db.query('delete from auth.users where id = $1', [B]);
const after = Number((await db.query('select count(*)::int n from public.feedback where user_id = $1', [B])).rows[0].n);
ok(before === 20 && after === 0, 'deleting an account deletes their feedback (' + before + ' → ' + after + ')');

// ---------------------------------------------------------------- 8. with two-factor (row 60), in either order
async function mfaWorld(order) {
  const w = await world();
  await w.exec(`
    create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid not null, status text not null);
    alter table auth.mfa_factors enable row level security;
    create schema storage;
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    insert into auth.mfa_factors (user_id, status) values ('${A}', 'verified'), ('${D}', 'unverified');
  `);
  const errs = [];
  for (const f of order) { const e = await run(w, f === 'mfa' ? MFA : FILE); if (e) errs.push(f + ': ' + e); }
  return { w, errs };
}
for (const order of [['mfa', 'feedback', 'feedback'], ['feedback', 'mfa']]) {
  const { w, errs } = await mfaWorld(order);
  const label = order.join(' then ');
  ok(!errs.length, label + ': runs (' + (errs.join(' | ') || 'ok') + ')');
  const p = (await w.query(`select permissive, cmd, roles::text, qual, with_check from pg_policies where tablename = 'feedback' and policyname = 'powa_mfa_aal2'`)).rows[0];
  ok(p && p.permissive === 'RESTRICTIVE' && p.cmd === 'ALL' && p.roles === '{authenticated}' && /powa_mfa_ok/.test(p.qual) && /powa_mfa_ok/.test(p.with_check),
    label + ': the table has powa_mfa_aal2 (restrictive, every command, signed-in): ' + JSON.stringify(p));
  ok(await statusRow(w, 60) === true && await statusRow(w, 65) === true, label + ': rows 60 and 65 both say true');
  const two = { id: A, aal: 'aal1' }, twoOk = { id: A, aal: 'aal2' };
  const i1 = await send(w, two, 'problem', 'with only my password');
  const r1 = await as(w, two, `select id from public.feedback`);
  ok(i1.err && /row-level security/i.test(i1.err) && r1.rows && r1.rows.length === 0, label + ': an account with an authenticator at aal1 sends nothing, reads nothing (' + (i1.err || 'sent') + ')');
  const i2 = await send(w, twoOk, 'problem', 'with my code');
  const r2 = await as(w, twoOk, `select id from public.feedback`);
  ok(!i2.err && r2.rows && r2.rows.length === 1, label + ': at aal2 it sends and reads its own (' + (i2.err || r2.rows.length) + ')');
  const i3 = await send(w, { id: D, aal: 'aal1' }, 'idea', 'no authenticator yet (an abandoned one)');
  ok(!i3.err, label + ': an account without a verified factor sends at aal1 as before (' + (i3.err || 'ok') + ')');
  const ad = await as(w, { id: ADMIN, aal: 'aal1' }, `select id from public.feedback`);
  ok(ad.rows && ad.rows.length === 2, label + ': the admin (no factor) reads both');
}

console.log(`\nRESULT: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
