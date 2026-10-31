-- migration-coach-applications-2026-10-30.sql — POWALIFTA. STATUS-check.sql row 61.
-- Applications from a coach's public profile (coach-profile.html "Apply to train with Sam"): a lifter who isn't on
-- POWALIFTA yet sends their name, email, training age, best lifts, bodyweight, next meet, goals and a note; the
-- coach reads it on Lifters (New lifters) once the applicant has confirmed their email, then accepts it (the app's own
-- invite flow sends the invite link to that email) or declines it.
--
-- The way in is the apply-to-coach edge function (supabase/functions/apply-to-coach, Verify JWT off), never the
-- browser: it limits each IP (10 a day), each email (3 a day, silently: the answer never tells anyone what that email
-- has done), everyone (300 an hour), drops a filled-in honeypot, then calls apply_to_coach here with the service role
-- and emails the applicant a link. Nothing reaches the coach until that link is opened (confirm_coach_application):
-- a stranger can't apply as someone else, and junk can't fill a coach's list or lock their door (night C review
-- B1, M1 to M4, m4, m5).
--
-- The shape (coach_applications):
--   coach_id        the coach applied to (a coach in the public directory, never a hidden one)
--   name, email     who applied (name 1 to 80 characters, email lower case, 3 to 254)
--   training_years  0 to 60, or null (0 = under a year)
--   squat_kg, bench_kg, deadlift_kg   their best lifts, each over 0 and at most 700, or null
--   bodyweight_kg   30 to 250, or null; next_meet: a date, or null
--   goals           up to 280 characters; note: up to 1,000
--   confirm_hash    sha256 (hex) of the token in the applicant's link; confirmed_at: when they opened it (null: the
--                   coach doesn't see the row)
--   status          new → accepted | declined (decided_at is the server's clock); invite_code: the code sent on Accept
--
-- Who:
--   the edge function  (service role) apply_to_coach, confirm_coach_application, coach_applications_open, and
--                      coach_applications_tidy; nobody else can call them (not anon, not a signed-in user).
--   the coach          reads their own CONFIRMED applications, decides them (status, decided_at, invite_code; nothing
--                      else changes) and can delete one (spam).
--   nobody else        reads or writes anything: not another coach, not a lifter, not anon. No insert policy at all.
--
-- The rules:
--   - every application has its own link: a stranger who reuses someone's email only sends that person an email (it
--     shows what would be sent, so they can tell it isn't theirs), and can't replace the link they're waiting for; the
--     one confirmed replaces every other from that email to that coach, waiting or unconfirmed, so the real person's
--     own words always reach the coach (never "sent" and dropped)
--   - the coach's list never refuses anyone: there is no cap per coach (junk never confirms, and expires)
--   - names, goals and notes lose control and format characters (a right-to-left override can't spoof a name); an
--     email with any is refused; lifts are rounded to 0.01 kg before they're checked (0.004 kg is "over 0" no more)
--   - kept for: an unconfirmed one 48 hours; a decision (accepted or declined) 90 days after it; a waiting one 180 days.
--     coach_applications_tidy() deletes the rest: on every apply, and daily at 03:23 UTC when pg_cron is on
--     (privacy.html "Applications to a coach" says the same).
--   Two applications at the same moment queue on one lock per coach and one per email.
--
-- Run it after deploying the apply-to-coach function (./deploy.sh): the profile shows its Apply form only once that
-- function answers that applications are open, which needs this file too (coach-profile.html, DB.applicationsOpen).
-- It needs public.profiles with user_type and directory_hidden. Idempotent; one transaction. When row 60
-- (two-factor) is in, this file gives the new table its powa_mfa_aal2 itself, so row 60 stays true; before row 60,
-- run migration-mfa-aal2-2026-10-28.sql after this file as usual.
--
-- Tested in PGlite (scratchpad/pgtest/coach-applications-test.mjs, night-c-fix-applications.mjs): runs twice; only the
-- service role calls the functions; the coach reads only their own confirmed ones; another coach, a lifter and anon
-- read and change nothing; a confirmed repeat replaces; junk never reaches the coach; the tidy keeps the windows;
-- quotes, semicolons and SQL in every field are stored as text; the guard keeps everything but the decision.
--
-- Undo (by hand, if ever): select cron.unschedule('powa-applications-tidy');   -- when pg_cron is on
--   drop function public.apply_to_coach(uuid, text, text, integer, numeric, numeric, numeric, numeric, date, text, text, text);
--   drop function public.confirm_coach_application(text); drop function public.coach_applications_open(uuid);
--   drop function public.coach_applications_tidy(); drop table public.coach_applications;
--   drop function public.coach_applications_guard();
begin;

do $$
begin
  if to_regclass('public.profiles') is null then
    raise exception 'migration-coach-applications: public.profiles is missing. Run this in the POWALIFTA project. Nothing was changed.';
  end if;
  if not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'directory_hidden') then
    raise exception 'migration-coach-applications: profiles.directory_hidden is missing: run migration-directory-hidden.sql first. Nothing was changed.';
  end if;
end $$;

create table if not exists public.coach_applications (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) between 3 and 254 and email = lower(email) and email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$'),
  training_years smallint check (training_years between 0 and 60),
  squat_kg numeric(6,2) check (squat_kg > 0 and squat_kg <= 700),
  bench_kg numeric(6,2) check (bench_kg > 0 and bench_kg <= 700),
  deadlift_kg numeric(6,2) check (deadlift_kg > 0 and deadlift_kg <= 700),
  goals text check (char_length(goals) <= 280),
  note text check (char_length(note) <= 1000),
  status text not null default 'new' check (status in ('new', 'accepted', 'declined')),
  invite_code text check (char_length(invite_code) <= 12),
  created_at timestamptz not null default now(),
  decided_at timestamptz);
-- The columns the first draft (night C) didn't have: added here so either draft ends the same.
alter table public.coach_applications add column if not exists bodyweight_kg numeric(5,2) check (bodyweight_kg between 30 and 250);
alter table public.coach_applications add column if not exists next_meet date;
alter table public.coach_applications add column if not exists confirm_hash text check (confirm_hash ~ '^[0-9a-f]{64}$');
alter table public.coach_applications add column if not exists confirmed_at timestamptz;

-- The coach's list (by when they came), the repeat and tidy look-ups, the link.
create index if not exists coach_applications_coach_idx on public.coach_applications (coach_id, created_at desc);
create index if not exists coach_applications_email_idx on public.coach_applications (email, created_at desc);
create unique index if not exists coach_applications_hash_idx on public.coach_applications (confirm_hash) where confirm_hash is not null;

alter table public.coach_applications enable row level security;

-- Read: the coach applied to, and only what the applicant confirmed.
drop policy if exists "coach_applications_select" on public.coach_applications;
create policy "coach_applications_select" on public.coach_applications
  for select to authenticated
  using (coach_id = (select auth.uid()) and confirmed_at is not null);

-- Decide: the coach applied to (the guard keeps everything but the decision).
drop policy if exists "coach_applications_update" on public.coach_applications;
create policy "coach_applications_update" on public.coach_applications
  for update to authenticated
  using (coach_id = (select auth.uid()) and confirmed_at is not null)
  with check (coach_id = (select auth.uid()) and confirmed_at is not null);

-- Delete: the coach applied to (spam).
drop policy if exists "coach_applications_delete" on public.coach_applications;
create policy "coach_applications_delete" on public.coach_applications
  for delete to authenticated
  using (coach_id = (select auth.uid()) and confirmed_at is not null);

-- The guard: a signed-in update (the coach's decision) changes the decision only. The row stays who applied, to whom,
-- when and whether it was confirmed; decided_at is the server's clock (cleared when a decision is taken back to new).
-- The functions below run as their owner and aren't guarded (they confirm a row; they never rewrite one).
create or replace function public.coach_applications_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then return new; end if;
  new.id := old.id;
  new.coach_id := old.coach_id;
  new.name := old.name;
  new.email := old.email;
  new.training_years := old.training_years;
  new.squat_kg := old.squat_kg;
  new.bench_kg := old.bench_kg;
  new.deadlift_kg := old.deadlift_kg;
  new.bodyweight_kg := old.bodyweight_kg;
  new.next_meet := old.next_meet;
  new.goals := old.goals;
  new.note := old.note;
  new.confirm_hash := old.confirm_hash;
  new.confirmed_at := old.confirmed_at;
  new.created_at := old.created_at;
  new.decided_at := case when new.status is distinct from old.status
                         then (case when new.status = 'new' then null else now() end)
                         else old.decided_at end;
  return new;
end $$;
drop trigger if exists trg_coach_applications_guard on public.coach_applications;
create trigger trg_coach_applications_guard before update on public.coach_applications
  for each row execute function public.coach_applications_guard();
revoke all on function public.coach_applications_guard() from public, anon, authenticated;

revoke all on public.coach_applications from anon, authenticated;
grant select, update, delete on public.coach_applications to authenticated;

-- The first draft's function (one signature shorter, granted to anon): gone, so only the edge function applies.
drop function if exists public.apply_to_coach(uuid, text, text, integer, numeric, numeric, numeric, text, text);

-- Text as it's kept: control and format characters (U+0000-U+001F, U+007F-U+009F, soft hyphen, the Arabic letter mark,
-- the Mongolian vowel separator, zero-width and direction marks and overrides, word joiners and invisible operators,
-- the BOM, interlinear annotations) become a space; keep_lines leaves line breaks in a note. Then trimmed. Pure.
create or replace function public.coach_applications_clean(p text, p_keep_lines boolean default false)
returns text language sql immutable set search_path = public as $$
  select btrim(regexp_replace(coalesce(p, ''),
    case when p_keep_lines then '[\u0001-\u0009\u000b-\u001f\u007f-\u009f­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]'
         else '[\u0001-\u001f\u007f-\u009f­؜᠎​-‏‪-‮⁠-⁤⁦-⁯﻿￹-￻]' end, ' ', 'g'))
$$;
revoke all on function public.coach_applications_clean(text, boolean) from public, anon, authenticated;

-- Tidy: what's past its time goes (an unconfirmed one after 48 hours, a decision 90 days after it, a waiting one after
-- 180 days). → how many were deleted.
create or replace function public.coach_applications_tidy()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  delete from public.coach_applications a
   where (a.confirmed_at is null and a.created_at < now() - interval '48 hours')
      or (a.status in ('accepted', 'declined') and coalesce(a.decided_at, a.created_at) < now() - interval '90 days')
      or (a.status = 'new' and a.created_at < now() - interval '180 days');
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.coach_applications_tidy() from public, anon, authenticated;
grant execute on function public.coach_applications_tidy() to service_role;

-- Open: does this coach take applications here (a coach in the public directory)? The edge function's gate for the
-- profile's form. → boolean
create or replace function public.coach_applications_open(p_coach uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = p_coach and p.user_type = 'coach' and coalesce(p.directory_hidden, false) = false)
$$;
revoke all on function public.coach_applications_open(uuid) from public, anon, authenticated;
grant execute on function public.coach_applications_open(uuid) to service_role;

-- Apply: stores the application unconfirmed, with the hash of the token the edge function emails. Every value is a
-- parameter, never SQL text. → { result: 'pending', id, coach_name (first name) }; anything refused raises P0001 with a
-- message the page shows as it is.
create or replace function public.apply_to_coach(
  p_coach uuid, p_name text, p_email text, p_training_years integer,
  p_squat numeric, p_bench numeric, p_deadlift numeric, p_bodyweight numeric, p_next_meet date,
  p_goals text, p_note text, p_confirm_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := regexp_replace(public.coach_applications_clean(p_name), '\s+', ' ', 'g');
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_goals text := nullif(regexp_replace(public.coach_applications_clean(p_goals), '\s+', ' ', 'g'), '');
  v_note text := nullif(public.coach_applications_clean(p_note, true), '');
  v_sq numeric := round(p_squat, 2);
  v_be numeric := round(p_bench, 2);
  v_de numeric := round(p_deadlift, 2);
  v_bw numeric := round(p_bodyweight, 2);
  v_lift numeric;
  v_coach text;
  v_id uuid;
begin
  if p_coach is null or not public.coach_applications_open(p_coach) then
    raise exception 'This coach isn''t taking applications here.' using errcode = 'P0001';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Your name is 1 to 80 characters.' using errcode = 'P0001';
  end if;
  if char_length(v_email) > 254 or v_email <> public.coach_applications_clean(v_email)
     or v_email !~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:]]+\.[^@[:space:][:cntrl:]]+$' then
    raise exception 'That email doesn''t look right.' using errcode = 'P0001';
  end if;
  if p_training_years is not null and (p_training_years < 0 or p_training_years > 60) then
    raise exception 'Training age is 0 to 60 years.' using errcode = 'P0001';
  end if;
  foreach v_lift in array array[v_sq, v_be, v_de] loop
    if v_lift is not null and (v_lift <= 0 or v_lift > 700) then
      raise exception 'Best lifts are in kg, over 0 and at most 700.' using errcode = 'P0001';
    end if;
  end loop;
  if v_bw is not null and (v_bw < 30 or v_bw > 250) then
    raise exception 'Bodyweight is 30 to 250 kg.' using errcode = 'P0001';
  end if;
  if p_next_meet is not null and (p_next_meet < current_date - 1 or p_next_meet > current_date + 730) then
    raise exception 'The next meet is a date in the next two years.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_goals, '')) > 280 then
    raise exception 'Goals are at most 280 characters.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'The note is at most 1,000 characters.' using errcode = 'P0001';
  end if;
  if p_confirm_hash is null or p_confirm_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'apply_to_coach: a confirm hash is 64 hex characters' using errcode = '22023';
  end if;

  -- One at a time per coach and per email.
  perform pg_advisory_xact_lock(hashtextextended('coach_applications:coach:' || p_coach::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('coach_applications:email:' || v_email, 0));

  perform public.coach_applications_tidy();

  insert into public.coach_applications (coach_id, name, email, training_years, squat_kg, bench_kg, deadlift_kg, bodyweight_kg, next_meet, goals, note, confirm_hash)
  values (p_coach, v_name, v_email, p_training_years, v_sq, v_be, v_de, v_bw, p_next_meet, v_goals, v_note, p_confirm_hash)
  returning id into v_id;
  select split_part(btrim(coalesce(p.name, '')), ' ', 1) into v_coach from public.profiles p where p.id = p_coach;
  return jsonb_build_object('result', 'pending', 'id', v_id, 'coach_name', coalesce(nullif(v_coach, ''), 'the coach'));
end $$;
revoke all on function public.apply_to_coach(uuid, text, text, integer, numeric, numeric, numeric, numeric, date, text, text, text) from public, anon, authenticated;
grant execute on function public.apply_to_coach(uuid, text, text, integer, numeric, numeric, numeric, numeric, date, text, text, text) to service_role;

-- Confirm: the applicant opened their link (the edge function hashes the token). Within 48 hours the application
-- reaches the coach, replacing every other from the same email to that coach (waiting, or still unconfirmed); a second
-- open says so.
-- → { result: 'confirmed' | 'already', id, coach_id, coach_name, name, training_years, squat_kg, bench_kg, deadlift_kg,
--     bodyweight_kg, next_meet, goals } | { result: 'unknown' } (no such link, or it expired)
create or replace function public.confirm_coach_application(p_hash text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  a public.coach_applications;
  v_coach text;
  v_result text := 'confirmed';
begin
  if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then return jsonb_build_object('result', 'unknown'); end if;
  select * into a from public.coach_applications x where x.confirm_hash = p_hash for update;
  if not found then return jsonb_build_object('result', 'unknown'); end if;
  if a.confirmed_at is not null then
    v_result := 'already';
  elsif a.created_at < now() - interval '48 hours' then
    return jsonb_build_object('result', 'unknown');
  else
    perform pg_advisory_xact_lock(hashtextextended('coach_applications:coach:' || a.coach_id::text, 0));
    update public.coach_applications set confirmed_at = now() where id = a.id;
    -- The one confirmed is the one the coach reads: the rest from this email to this coach go (a decided one stays).
    delete from public.coach_applications x where x.coach_id = a.coach_id and x.email = a.email and x.id <> a.id
       and x.status = 'new';
  end if;
  select split_part(btrim(coalesce(p.name, '')), ' ', 1) into v_coach from public.profiles p where p.id = a.coach_id;
  return jsonb_build_object('result', v_result, 'id', a.id, 'coach_id', a.coach_id, 'coach_name', coalesce(nullif(v_coach, ''), 'the coach'),
    'name', a.name, 'training_years', a.training_years, 'squat_kg', a.squat_kg, 'bench_kg', a.bench_kg, 'deadlift_kg', a.deadlift_kg,
    'bodyweight_kg', a.bodyweight_kg, 'next_meet', a.next_meet, 'goals', a.goals);
end $$;
revoke all on function public.confirm_coach_application(text) from public, anon, authenticated;
grant execute on function public.confirm_coach_application(text) to service_role;

-- Two-factor (row 60): when it's in, the new table gets its restrictive policy here, as that file would make it.
do $$
begin
  if to_regprocedure('public.powa_mfa_ok()') is not null then
    drop policy if exists powa_mfa_aal2 on public.coach_applications;
    create policy powa_mfa_aal2 on public.coach_applications as restrictive for all to authenticated
      using ((select public.powa_mfa_ok())) with check ((select public.powa_mfa_ok()));
  end if;
end $$;

-- The daily tidy, when pg_cron is on (it is for the weekly digest): replaced, never doubled, on a second run.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'powa-applications-tidy';
    perform cron.schedule('powa-applications-tidy', '23 3 * * *', 'select public.coach_applications_tidy()');
  end if;
end $$;

commit;

-- Verify (read-only):
--   select policyname, cmd, permissive from pg_policies where tablename = 'coach_applications' order by 1;   -- 3 (+ powa_mfa_aal2 with row 60)
--   select has_table_privilege('anon', 'public.coach_applications', 'select');                               -- false
--   select has_function_privilege('anon', 'public.apply_to_coach(uuid, text, text, integer, numeric, numeric, numeric, numeric, date, text, text, text)', 'execute');   -- false
--   select jobname, schedule from cron.job where jobname = 'powa-applications-tidy';                          -- 23 3 * * *
