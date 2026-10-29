-- migration-mfa-aal2-2026-10-28.sql — POWALIFTA. Two-factor, enforced by the database: an account that has a
-- verified authenticator must have entered its code (a session at aal2) before it can read or write anything.
-- Every other account is untouched. STATUS-check.sql row 60.
--
-- Why: until now two-factor lived only in the sign-in screens. The password step already stores a full
-- session (aal1) before the code is asked for, so a password alone opened every table through the API, Storage
-- and even the app (reload during the code prompt, or open /athlete.html). Settings promises "Logins need a
-- code from your authenticator app": from this file on, the database keeps that promise.
--
-- What it adds:
--   1. public.powa_mfa_ok(): true when the request's token says aal2, or the signed-in user has no verified
--      factor. SECURITY DEFINER on purpose: signed-in users have no privilege on auth.mfa_factors (checked live
--      28 Oct), so the inline subquery from Supabase's guide would fail every signed-in query with "permission
--      denied for table mfa_factors". Owner postgres (BYPASSRLS): auth.mfa_factors has RLS on and no policies.
--      It FAILS CLOSED: if its owner could only see the factors through RLS (a missing BYPASSRLS, or forced RLS),
--      row_security_active() says so and the answer is false, never "no factor, come in"; if it can't read the
--      table at all, or the table is gone, every signed-in request errors. An outage, never a leak.
--      EXECUTE: authenticated and service_role only.
--   2. powa_mfa_aal2: one RESTRICTIVE policy FOR ALL TO authenticated on every table in public (55 on 28 Oct)
--      and on storage.objects, USING and WITH CHECK ((select public.powa_mfa_ok())). Restrictive policies are
--      ANDed with the permissive ones, so no existing rule changes; anon, service_role, postgres and SECURITY
--      DEFINER code are untouched. The (select ...) makes it an InitPlan: worked out once per statement. The
--      Data API, Storage (uploads, downloads, new signed URLs; the public avatars bucket is served without RLS)
--      and Realtime (postgres_changes) all check RLS with the caller's token, so all three inherit it. The table list is read from the catalog when the file
--      runs, so a re-run covers tables added since (STATUS row 60 says false while one is missing).
--
-- What it does not cover (on purpose, this week; docs/two-factor.md):
--   - The 37 SECURITY DEFINER functions signed-in users can call (live 28 Oct, after row 59: claim_invite,
--     accept_coach_request, coach_release_lifter (take a lifter off the roster), get_marketplace_payload,
--     my_checkin_questions, challenge_board, the club functions, admin_set_plan...)
--     skip RLS, so an aal1 session of a 2FA account can still call them; the sharpest is claim_invite (a
--     lifter's password links them to another coach). PostgREST's db_pre_request hook closes all of them;
--     it is kept out of the pitch week (if it ever errors, every API request fails) and its tested SQL
--     waits in docs/two-factor.md: apply it before the first account turns two-factor on.
--   - Edge functions use the service role: they check the session themselves (supabase/functions/_shared/aal.ts).
--
-- Who it affects on day one: nobody. 28 Oct, read-only counts: 0 verified factors (1 abandoned unverified one),
-- 14 sessions, all aal1, 33 accounts. For an account without a verified factor powa_mfa_ok() is always true.
--
-- Before it commits, the file proves the check can see the factors: powa_mfa_ok() must say yes for a made-up
-- user with no factor at aal1. If it can't (owner can't bypass RLS, no SELECT), the file stops and nothing is
-- applied. lock_timeout 5 s: a busy table makes it stop rather than queue the app behind it; run it again.
--
-- Order: row 59 (migration-security-fixes-2026-10-28.sql) is live since 28 Oct; this is row 60, the next one,
-- after every other row; run it again after any migration that adds a public table. Idempotent: a re-run changes
-- only what is missing or not as written here. One transaction. Then the eight edge functions, named with the
-- project (./deploy.sh functions would ship the others too):
--   for fn in delete-account ls-portal apple-iap send-invite send-program-assigned send-push program-read ai-chat; do
--     npx --yes supabase functions deploy "$fn" --project-ref cxnotrikxvzncupswvio
--   done
-- The app's code step rides the next web push and iPhone build (until then, see docs/two-factor.md "Old builds").
-- If every signed-in page goes empty after a Supabase upgrade, run the undo block below first, then investigate.
--
-- Undo (copy and run; nothing else depends on these, unless the deferred pre-request hook in docs/two-factor.md
-- was applied: undo that first, it calls powa_mfa_ok()):
--   begin;
--   do $$ declare r record; begin
--     for r in select schemaname, tablename from pg_policies where policyname = 'powa_mfa_aal2' loop
--       execute format('drop policy if exists powa_mfa_aal2 on %I.%I', r.schemaname, r.tablename);
--     end loop;
--   end $$;
--   drop function if exists public.powa_mfa_ok();
--   commit;
-- (end of undo)
--
-- Tested in PGlite (scratchpad/pgtest/mfa-aal2-test.mjs): the live schema after row 55 (164 policies, identical
-- to live), storage.objects with its 10 live policies, auth.mfa_factors with the live grants (RLS on, no
-- policies, nothing for signed-in users). Users without a verified factor: all 4,920 probes x 10 actors, plus
-- Storage, identical before and after (tokens with aal1, aal2 and none); a second run changes nothing; the undo
-- gives the catalog back byte for byte. Users with a verified factor: at aal1 nothing is visible and every write
-- is refused, in every table and in Storage; at aal2 identical to before. The check fails closed with an owner
-- without BYPASSRLS, with forced RLS, without SELECT, and with the table gone; the file refuses to apply when
-- its check can't see the factors.
begin;
set local lock_timeout = '5s';

-- The right database: the tables this protects and the helpers the check calls.
do $$
begin
  if to_regclass('public.profiles') is null or to_regclass('public.workout_logs') is null then
    raise exception 'migration-mfa-aal2: public.profiles / public.workout_logs missing. Run this in the POWALIFTA project. Nothing was changed.';
  end if;
  if to_regclass('auth.mfa_factors') is null or to_regprocedure('auth.uid()') is null or to_regprocedure('auth.jwt()') is null then
    raise exception 'migration-mfa-aal2: auth.mfa_factors / auth.uid() / auth.jwt() missing. Nothing was changed.';
  end if;
  if to_regclass('storage.objects') is null then
    raise exception 'migration-mfa-aal2: storage.objects missing. Nothing was changed.';
  end if;
end $$;

-- 1. The check, in one place. ------------------------------------------------------------------------------
create or replace function public.powa_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'aal', '') = 'aal2'
      or (    not row_security_active('auth.mfa_factors'::regclass)   -- the owner sees every factor, not an RLS-filtered few
          and not exists (
                select 1
                  from auth.mfa_factors f
                 where f.user_id = (select auth.uid())
                   and f.status = 'verified'));
$$;
comment on function public.powa_mfa_ok() is
  'POWALIFTA two-factor: true when this request may touch user data (token at aal2, or the user has no verified factor). Fails closed. Owner must bypass RLS on auth.mfa_factors (postgres). migration-mfa-aal2-2026-10-28.sql';
alter function public.powa_mfa_ok() owner to postgres;
revoke all on function public.powa_mfa_ok() from public, anon;
grant execute on function public.powa_mfa_ok() to authenticated, service_role;

-- 2. Proof that the check sees the factors, then the policies: one block, so no policy goes in without a check
--    that works.
do $$
declare
  prev text := current_setting('request.jwt.claims', true);
  answer boolean;
  r record;
  made int := 0;
  kept int := 0;
  missing text;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal1')::text, true);
  answer := public.powa_mfa_ok();
  perform set_config('request.jwt.claims', coalesce(prev, ''), true);
  if answer is distinct from true then
    raise exception 'migration-mfa-aal2: powa_mfa_ok() said % for a user with no factor: its owner (%) cannot see auth.mfa_factors past RLS. It must be postgres (BYPASSRLS). Nothing was changed.',
      answer, (select pg_get_userbyid(proowner) from pg_proc where oid = 'public.powa_mfa_ok()'::regprocedure);
  end if;

  for r in
    select format('%I.%I', s.nspname, c.relname) as rel,
           exists (select 1 from pg_policy p
                    where p.polrelid = c.oid and p.polname = 'powa_mfa_aal2'
                      and not p.polpermissive and p.polcmd = '*'
                      and p.polroles = array['authenticated'::regrole::oid]
                      and pg_get_expr(p.polqual, p.polrelid) ~ '^\( SELECT (public\.)?powa_mfa_ok\(\) AS powa_mfa_ok\)$'
                      and pg_get_expr(p.polwithcheck, p.polrelid) ~ '^\( SELECT (public\.)?powa_mfa_ok\(\) AS powa_mfa_ok\)$') as in_place
      from pg_class c join pg_namespace s on s.oid = c.relnamespace
     where (s.nspname = 'public' and c.relkind in ('r', 'p')) or c.oid = 'storage.objects'::regclass
     order by s.nspname, c.relname
  loop
    if r.in_place then kept := kept + 1; continue; end if;
    execute format('drop policy if exists powa_mfa_aal2 on %s', r.rel);
    execute format('create policy powa_mfa_aal2 on %s as restrictive for all to authenticated '
                   'using ((select public.powa_mfa_ok())) with check ((select public.powa_mfa_ok()))', r.rel);
    made := made + 1;
  end loop;

  select string_agg(c.relname, ', ' order by c.relname) into missing
    from pg_class c join pg_namespace s on s.oid = c.relnamespace
   where s.nspname = 'public' and c.relkind in ('r', 'p')
     and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = 'powa_mfa_aal2');
  if missing is not null then
    raise exception 'migration-mfa-aal2: no powa_mfa_aal2 on %. Nothing was changed.', missing;
  end if;
  raise notice 'migration-mfa-aal2: powa_mfa_aal2 made on % tables, already in place on % (public + storage.objects)', made, kept;
end $$;

commit;

-- Verify (read-only; expected values on the right):
--   select count(*) from pg_policies where policyname = 'powa_mfa_aal2' and schemaname = 'public';      -- 55 (every public table)
--   select count(*) from pg_policies where policyname = 'powa_mfa_aal2' and schemaname = 'storage';     -- 1
--   select r.rolname, r.rolbypassrls, p.prosecdef from pg_proc p join pg_roles r on r.oid = p.proowner
--    where p.oid = 'public.powa_mfa_ok()'::regprocedure;                                              -- postgres | true | true
--   begin; set local role authenticated;
--     select set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'aal', 'aal1')::text, true);
--     select public.powa_mfa_ok();                         -- true
--     select count(*) >= 0 as ok from public.profiles;     -- true, and no "permission denied"
--   rollback;
--   Then from the website, signed in (no 2FA): Train and the coach desk load, a message arrives live, an avatar
--   uploads, a form-check video plays. Signed out: leaderboard, marketplace and a coach profile load.
