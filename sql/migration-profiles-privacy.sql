-- ============================================================
-- POWALIFTA — stop the public reading coach emails + billing ids (2026-10-17)
--
-- Found 2026-10-17: with only the public anon key (it ships in db.js, as
-- Supabase intends), anyone could read every COACH row of public.profiles,
-- every column: email, ls_customer_id, ls_subscription_id,
-- subscription_status, apple_original_transaction_id, referral codes. The
-- SELECT policy that allows it lives only in the live database, not in git.
--
-- What this does, all inside ONE transaction:
--   1. list_public_coaches(): the coach directory, safe columns only (id, name,
--      bio, photo, country, Instagram, joined) — plus the caller's own coach even
--      if that coach hides from the directory. db.js listCoaches() calls it.
--   2. The read access the app needs, stated explicitly: your own row, admins
--      (through its own SECURITY DEFINER check, so no recursion), a coach's
--      linked athletes.
--   3. Every other PERMISSIVE SELECT policy on profiles is dropped (whatever it
--      was called). FOR ALL and RESTRICTIVE policies are left alone.
--   4. It then PROVES the result: as anon, and as a signed-in stranger, it reads
--      profiles. If either can see a single row, it raises and the whole file
--      rolls back — nothing changes, and the message says which policies remain.
--
-- Reviewed with ECC's database-reviewer (2026-10-17). Idempotent: safe to run
-- again. Run AFTER migration-instagram.sql. The website already calls the new
-- function (and falls back while this hasn't run), so order with the deploy is
-- fine.
-- ============================================================

begin;

-- 1. The public coach directory.
create or replace function public.list_public_coaches()
returns table (id uuid, name text, bio text, avatar_url text, country_code text, instagram text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.bio, p.avatar_url, p.country_code, p.instagram, p.created_at
    from public.profiles p
   where p.user_type = 'coach'
     and (coalesce(p.directory_hidden, false) = false
          or p.id = (select me.coach_id from public.profiles me where me.id = (select auth.uid())))
   order by p.created_at
$$;
revoke all on function public.list_public_coaches() from public;
grant execute on function public.list_public_coaches() to anon, authenticated;

-- 2. Explicit reads. Admin check is its own DEFINER function (reads profiles as
--    the owner, so it can't recurse into these policies).
create or replace function public.powa_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = (select auth.uid())), false)
$$;
revoke all on function public.powa_is_admin() from public, anon;
grant execute on function public.powa_is_admin() to authenticated;

drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_read_admin on public.profiles;
create policy profiles_read_admin on public.profiles for select to authenticated
  using ((select public.powa_is_admin()));

drop policy if exists profiles_coach_reads_roster on public.profiles;
create policy profiles_coach_reads_roster on public.profiles for select to authenticated
  using (coach_id = (select auth.uid()));

-- An earlier draft of this file added these; they exposed the coach's whole row.
drop policy if exists profiles_athlete_reads_coach on public.profiles;
drop function if exists public.my_coach_id();

create index if not exists profiles_coach_id_idx on public.profiles (coach_id);

-- 3. Drop every other permissive SELECT policy on profiles.
do $$
declare r record;
begin
  for r in
    select policyname, qual from pg_policies
     where schemaname = 'public' and tablename = 'profiles'
       and permissive = 'PERMISSIVE' and cmd = 'SELECT'
       and policyname not in ('profiles_read_self', 'profiles_read_admin', 'profiles_coach_reads_roster')
  loop
    execute format('drop policy %I on public.profiles', r.policyname);
    raise notice 'Dropped SELECT policy on profiles: % (%)', r.policyname, r.qual;
  end loop;
end $$;

-- 4. Prove it. Nobody who isn't you, your coach-side roster or an admin reads a row.
do $$
declare n int; left_over text;
begin
  select string_agg(policyname || ' [' || cmd || '] ' || coalesce(qual, ''), '; ') into left_over
    from pg_policies where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL');

  set local role anon;
  begin select count(*) into n from public.profiles; exception when insufficient_privilege then n := 0; end;
  reset role;
  if n > 0 then raise exception 'anon can still read % profile rows. Policies left: %', n, left_over; end if;

  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin select count(*) into n from public.profiles; exception when insufficient_privilege then n := 0; end;
  reset role;
  if n > 0 then raise exception 'a signed-in stranger can still read % profile rows. Policies left: %', n, left_over; end if;

  raise notice 'OK: anon and strangers read 0 profile rows. Directory rows: %', (select count(*) from public.list_public_coaches());
end $$;

commit;

-- ---------- verification (optional, after it commits)
-- select policyname, permissive, roles, cmd, qual from pg_policies where tablename = 'profiles' order by cmd, policyname;
-- select count(*) from public.list_public_coaches();
