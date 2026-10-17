-- ============================================================
-- POWALIFTA — stop the public reading coach emails + billing ids (2026-10-17)
--
-- Found 2026-10-17: with only the public anon key (it ships in db.js, as
-- Supabase intends), anyone could read every COACH row of public.profiles,
-- every column: email, ls_customer_id, ls_subscription_id,
-- subscription_status, apple_original_transaction_id, referral codes.
-- The live database has a SELECT policy on profiles that admits coach rows to
-- everyone so the public coach directory works. It is not in git, so this file
-- finds it by what it does (a SELECT policy that mentions 'coach' and never
-- auth.uid()) and drops it.
--
-- The directory moves to list_public_coaches(): a SECURITY DEFINER function
-- that returns only the columns a public coach page shows (id, name, bio,
-- photo, country, Instagram, joined). db.js listCoaches() calls it and falls
-- back to the old query if this file hasn't run yet.
--
-- Row access that the app needs is re-stated explicitly (duplicates of
-- policies you may already have are harmless; policies OR together):
--   own row · admins · a coach reads their linked athletes · an athlete reads
--   their own coach.
--
-- Idempotent. Run AFTER migration-instagram.sql (the function returns the
-- instagram column). Check the NOTICE output: it names the policy it dropped.
-- ============================================================

-- 1. Who is my coach? (SECURITY DEFINER so a profiles policy can ask without
--    recursing into profiles' own policies.)
create or replace function public.my_coach_id()
returns uuid language sql stable security definer set search_path = public as $$
  select coach_id from public.profiles where id = (select auth.uid())
$$;
revoke all on function public.my_coach_id() from public, anon;
grant execute on function public.my_coach_id() to authenticated;

-- 2. The public coach directory, safe columns only.
create or replace function public.list_public_coaches()
returns table (id uuid, name text, bio text, avatar_url text, country_code text, instagram text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.name, p.bio, p.avatar_url, p.country_code, p.instagram, p.created_at
    from public.profiles p
   where p.user_type = 'coach'
     and coalesce(p.directory_hidden, false) = false
   order by p.created_at
$$;
revoke all on function public.list_public_coaches() from public;
grant execute on function public.list_public_coaches() to anon, authenticated;

-- 3. Explicit row access the app relies on.
drop policy if exists profiles_read_self on public.profiles;
create policy profiles_read_self on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists profiles_read_admin on public.profiles;
create policy profiles_read_admin on public.profiles for select to authenticated
  using ((select public.is_admin()));

drop policy if exists profiles_coach_reads_roster on public.profiles;
create policy profiles_coach_reads_roster on public.profiles for select to authenticated
  using (coach_id = (select auth.uid()));

drop policy if exists profiles_athlete_reads_coach on public.profiles;
create policy profiles_athlete_reads_coach on public.profiles for select to authenticated
  using (id = (select public.my_coach_id()));

-- 4. Drop the policy that made every coach row public.
do $$
declare r record;
begin
  for r in
    select policyname, qual from pg_policies
     where schemaname = 'public' and tablename = 'profiles' and cmd in ('SELECT', 'ALL')
  loop
    if r.qual is not null
       and r.qual ilike '%coach%'
       and r.qual not ilike '%auth.uid()%'
       and r.qual not ilike '%my_coach_id%' then
      execute format('drop policy %I on public.profiles', r.policyname);
      raise notice 'Dropped public policy on profiles: % (%)', r.policyname, r.qual;
    end if;
  end loop;
end $$;

-- ---------- verification (run after applying)
-- Every SELECT policy left on profiles (none should be readable by anon):
-- select policyname, roles, qual from pg_policies where tablename = 'profiles' and cmd in ('SELECT','ALL');
-- The directory still works for everyone:
-- select count(*) from public.list_public_coaches();
