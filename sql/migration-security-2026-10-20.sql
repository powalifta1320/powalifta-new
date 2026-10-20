-- migration-security-2026-10-20.sql — POWALIFTA
-- From the 2026-10-20 ECC security pass. One transaction, idempotent; run AFTER
-- migration-rls-hardening-4.sql and migration-push-platform.sql.
--   1. marketplace program payloads: only the owner, an admin or a buyer can read them
--      (they were world-readable through the public "published" SELECT policy)
--   2. profiles.email can't be rewritten by the user (the billing webhooks and the mail
--      functions key on it)
--   3. claim_invite is rate-limited (6-character codes could be guessed)
--   4. a self-coached program can't be written under another coach's id, and a coached
--      athlete can't delete their coach's program
--   5. push endpoints must look like a push service (the server POSTs to them)
begin;

-- 1 -----------------------------------------------------------------------------------
revoke select (program_payload) on public.marketplace_programs from anon, authenticated;

create or replace function public.get_marketplace_payload(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payload jsonb;
  v_coach uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  select program_payload, coach_id into v_payload, v_coach
    from public.marketplace_programs where id = p_id;
  if not found then
    return null;
  end if;
  if v_coach = auth.uid() then
    return v_payload;
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and is_admin = true) then
    return v_payload;
  end if;
  if exists (select 1 from public.program_sales
              where marketplace_program_id = p_id
                and buyer_id = auth.uid()
                and payout_status <> 'cancelled') then
    return v_payload;
  end if;
  raise exception 'No purchase record found for this program';
end;
$$;
revoke all on function public.get_marketplace_payload(uuid) from public, anon;
grant execute on function public.get_marketplace_payload(uuid) to authenticated;

-- 2 -----------------------------------------------------------------------------------
create or replace function public.guard_profile_email()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if new.email is distinct from old.email then
    new.email := old.email;
  end if;
  return new;
end;
$$;
drop trigger if exists profiles_guard_email on public.profiles;
create trigger profiles_guard_email
  before update on public.profiles
  for each row execute function public.guard_profile_email();

-- 3 -----------------------------------------------------------------------------------
create or replace function public.claim_invite(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code  text := upper(trim(coalesce(invite_code, '')));
  v_coach uuid;
  v_ok    boolean;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if v_code = '' then
    raise exception 'Enter a code';
  end if;

  -- Ten tries an hour per account (fail-open before migration-edge-rate-limits).
  if to_regprocedure('public.rl_bump(text,text,integer,integer)') is not null then
    select r.allowed into v_ok from public.rl_bump('claim-invite', auth.uid()::text, 3600, 10) r;
    if v_ok is false then
      raise exception 'Too many tries. Wait a bit and try again' using errcode = 'check_violation';
    end if;
  end if;

  select coach_id into v_coach
    from public.invites
   where code = v_code
     and used = false
   for update;

  if not found then
    raise exception 'Invalid or already-used code';
  end if;
  if v_coach is null then
    raise exception 'This code is not linked to a coach';
  end if;
  if v_coach = auth.uid() then
    raise exception 'You can''t coach yourself';
  end if;

  -- Authorize the guarded coach_id write for THIS transaction only.
  perform set_config('powa.link_ok', '1', true);

  update public.profiles
     set coach_id = v_coach
   where id = auth.uid();

  update public.invites
     set used = true
   where code = v_code;

  return v_coach;
end;
$$;
revoke all on function public.claim_invite(text) from public, anon;
grant execute on function public.claim_invite(text) to authenticated;

-- 4 -----------------------------------------------------------------------------------
drop policy if exists "programs_athlete_self_all" on public.programs;
drop policy if exists "programs_athlete_read" on public.programs;
drop policy if exists "programs_athlete_update" on public.programs;
drop policy if exists "programs_athlete_insert" on public.programs;
drop policy if exists "programs_athlete_delete_own" on public.programs;
-- read + update (set logging writes into the program's weeks)
create policy "programs_athlete_read" on public.programs
  for select to authenticated using (athlete_id = auth.uid());
create policy "programs_athlete_update" on public.programs
  for update to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
-- a new program is self-coached, or under the coach the athlete actually has
create policy "programs_athlete_insert" on public.programs
  for insert to authenticated
  with check (athlete_id = auth.uid()
              and (coach_id is null or coach_id = auth.uid()
                   or coach_id = (select p.coach_id from public.profiles p where p.id = auth.uid())));
-- only a self-coached program can be deleted by the athlete
create policy "programs_athlete_delete_own" on public.programs
  for delete to authenticated
  using (athlete_id = auth.uid() and (coach_id is null or coach_id = auth.uid()));

-- 5 -----------------------------------------------------------------------------------
alter table public.push_subscriptions drop constraint if exists push_endpoint_shape;
alter table public.push_subscriptions add constraint push_endpoint_shape check (
     (coalesce(platform, 'web') = 'ios'     and endpoint ~ '^[0-9a-fA-F]{64,200}$')
  or (coalesce(platform, 'web') = 'android' and endpoint ~ '^[A-Za-z0-9_:.-]{20,500}$')
  or (coalesce(platform, 'web') = 'web'     and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.notify\.windows\.com|web\.push\.apple\.com)/')
) not valid;   -- existing rows stay; every new row must match

commit;

-- Verify:
--   select has_column_privilege('anon', 'public.marketplace_programs', 'program_payload', 'select');   -- false
--   select polname, polcmd from pg_policy where polrelid = 'public.programs'::regclass;
