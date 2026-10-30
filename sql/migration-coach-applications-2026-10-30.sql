-- migration-coach-applications-2026-10-30.sql — POWALIFTA. STATUS-check.sql row 61.
-- Applications from a coach's public profile (coach-profile.html "Apply to train with Sam"): a lifter who isn't on
-- POWALIFTA yet sends their name, email, training age, best lifts, goals and a note; the coach reads it in Clients
-- as a lead, then accepts it (the app's own invite flow sends the invite link to that email) or declines it.
--
-- The shape (coach_applications):
--   coach_id        the coach applied to (a coach in the public directory, never a hidden one)
--   name, email     who applied (name 1 to 80 characters, email lower case, 3 to 254)
--   training_years  0 to 60, or null (0 = under a year)
--   squat_kg, bench_kg, deadlift_kg   their best lifts, each over 0 and at most 700, or null
--   goals           up to 280 characters; note: up to 1,000
--   status          new → accepted | declined (decided_at is the server's clock); invite_code: the code sent on Accept
--
-- Who:
--   anyone (anon too)  applies through public.apply_to_coach(...) only, a SECURITY DEFINER function with caps. Nobody
--                      inserts into the table directly: no insert policy and no INSERT privilege.
--   the coach          reads their own applications, decides them (status, decided_at, invite_code; nothing else
--                      changes) and can delete one (spam).
--   nobody else        reads anything: not another coach, not a lifter, not anon.
--
-- The caps (raised as errors with a message the page shows; the counts look at the last 24 hours):
--   - one waiting (new) application per email and coach: a second one says so instead
--   - 3 applications per email a day, across every coach
--   - 30 applications per coach a day
--   - the lengths above (trimmed first; control characters are taken out, a note keeps its line breaks)
--   Two applications at the same moment queue on one lock per coach and one per email, so a cap can't be raced.
--
-- Run any time (it needs public.profiles with user_type and directory_hidden). Until it runs, the profile's form says
-- applications aren't open yet and the coach's Clients shows none (db.js _isNotReady). Idempotent; one transaction.
-- When row 60 (two-factor) is in, this file gives the new table its powa_mfa_aal2 itself, so row 60 stays true; before
-- row 60, run migration-mfa-aal2-2026-10-28.sql after this file as usual.
--
-- Tested in PGlite (scratchpad/pgtest/coach-applications-test.mjs): runs twice; anon and lifters apply through the
-- function and never insert, select, update or delete the table; the coach reads only their own; another coach reads
-- and changes nothing; every cap holds (lengths, the waiting one, per email, per coach, a hidden coach, a non-coach);
-- quotes, semicolons and SQL in every field are stored as text; the guard keeps everything but the decision.
--
-- Undo (by hand, if ever): drop function public.apply_to_coach(uuid, text, text, integer, numeric, numeric, numeric, text, text);
--   drop table public.coach_applications; drop function public.coach_applications_guard();
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
  email text not null check (char_length(email) between 3 and 254 and email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
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

-- The coach's list (Clients: newest decisions aside, the waiting ones by when they came) and the caps' counts.
create index if not exists coach_applications_coach_idx on public.coach_applications (coach_id, created_at desc);
create index if not exists coach_applications_email_idx on public.coach_applications (email, created_at desc);

alter table public.coach_applications enable row level security;

-- Read: the coach applied to, only.
drop policy if exists "coach_applications_select" on public.coach_applications;
create policy "coach_applications_select" on public.coach_applications
  for select to authenticated
  using (coach_id = (select auth.uid()));

-- Decide: the coach applied to (the guard keeps everything but the decision).
drop policy if exists "coach_applications_update" on public.coach_applications;
create policy "coach_applications_update" on public.coach_applications
  for update to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

-- Delete: the coach applied to (spam).
drop policy if exists "coach_applications_delete" on public.coach_applications;
create policy "coach_applications_delete" on public.coach_applications
  for delete to authenticated
  using (coach_id = (select auth.uid()));

-- The guard: an update changes the decision only. The row stays who applied, to whom and when; decided_at is the
-- server's clock (cleared when a decision is taken back to new).
create or replace function public.coach_applications_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  new.id := old.id;
  new.coach_id := old.coach_id;
  new.name := old.name;
  new.email := old.email;
  new.training_years := old.training_years;
  new.squat_kg := old.squat_kg;
  new.bench_kg := old.bench_kg;
  new.deadlift_kg := old.deadlift_kg;
  new.goals := old.goals;
  new.note := old.note;
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

-- Apply: the only way in. SECURITY DEFINER (owner postgres) so it can insert past RLS; every value is a parameter,
-- never SQL text. Returns 'sent'; anything refused raises an error whose message the page shows as it is.
create or replace function public.apply_to_coach(
  p_coach uuid, p_name text, p_email text, p_training_years integer,
  p_squat numeric, p_bench numeric, p_deadlift numeric, p_goals text, p_note text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', ' ', 'g'));
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_goals text := nullif(btrim(regexp_replace(coalesce(p_goals, ''), '[[:cntrl:]]', ' ', 'g')), '');
  v_note text := nullif(btrim(regexp_replace(coalesce(p_note, ''), '[\x01-\x09\x0b-\x1f\x7f]', ' ', 'g')), '');
  v_lift numeric;
begin
  if p_coach is null or not exists (select 1 from public.profiles p
                                     where p.id = p_coach and p.user_type = 'coach' and coalesce(p.directory_hidden, false) = false) then
    raise exception 'This coach isn''t taking applications here.' using errcode = 'P0001';
  end if;
  v_name := regexp_replace(v_name, '\s+', ' ', 'g');
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception 'Your name is 1 to 80 characters.' using errcode = 'P0001';
  end if;
  if char_length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'That email doesn''t look right.' using errcode = 'P0001';
  end if;
  if p_training_years is not null and (p_training_years < 0 or p_training_years > 60) then
    raise exception 'Training age is 0 to 60 years.' using errcode = 'P0001';
  end if;
  foreach v_lift in array array[p_squat, p_bench, p_deadlift] loop
    if v_lift is not null and (v_lift <= 0 or v_lift > 700) then
      raise exception 'Best lifts are in kg, over 0 and at most 700.' using errcode = 'P0001';
    end if;
  end loop;
  if char_length(coalesce(v_goals, '')) > 280 then
    raise exception 'Goals are at most 280 characters.' using errcode = 'P0001';
  end if;
  if char_length(coalesce(v_note, '')) > 1000 then
    raise exception 'The note is at most 1,000 characters.' using errcode = 'P0001';
  end if;

  -- One at a time per coach and per email, so two at once can't both slip under a cap.
  perform pg_advisory_xact_lock(hashtextextended('coach_applications:coach:' || p_coach::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('coach_applications:email:' || v_email, 0));

  if exists (select 1 from public.coach_applications a where a.coach_id = p_coach and a.email = v_email and a.status = 'new') then
    raise exception 'You''ve already applied. They''ll answer by email.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.coach_applications a where a.email = v_email and a.created_at > now() - interval '24 hours') >= 3 then
    raise exception 'That''s 3 applications from this email today. Try again tomorrow.' using errcode = 'P0001';
  end if;
  if (select count(*) from public.coach_applications a where a.coach_id = p_coach and a.created_at > now() - interval '24 hours') >= 30 then
    raise exception 'This coach has had a lot of applications today. Try again tomorrow.' using errcode = 'P0001';
  end if;

  insert into public.coach_applications (coach_id, name, email, training_years, squat_kg, bench_kg, deadlift_kg, goals, note)
  values (p_coach, v_name, v_email, p_training_years, round(p_squat, 2), round(p_bench, 2), round(p_deadlift, 2), v_goals, v_note);
  return 'sent';
end $$;
revoke all on function public.apply_to_coach(uuid, text, text, integer, numeric, numeric, numeric, text, text) from public;
grant execute on function public.apply_to_coach(uuid, text, text, integer, numeric, numeric, numeric, text, text) to anon, authenticated;

-- Two-factor (row 60): when it's in, the new table gets its restrictive policy here, as that file would make it.
do $$
begin
  if to_regprocedure('public.powa_mfa_ok()') is not null then
    drop policy if exists powa_mfa_aal2 on public.coach_applications;
    create policy powa_mfa_aal2 on public.coach_applications as restrictive for all to authenticated
      using ((select public.powa_mfa_ok())) with check ((select public.powa_mfa_ok()));
  end if;
end $$;

commit;

-- Verify (read-only):
--   select policyname, cmd, permissive from pg_policies where tablename = 'coach_applications' order by 1;   -- 3 (+ powa_mfa_aal2 with row 60)
--   select has_table_privilege('anon', 'public.coach_applications', 'select');                               -- false
--   select has_function_privilege('anon', 'public.apply_to_coach(uuid, text, text, integer, numeric, numeric, numeric, text, text)', 'execute');   -- true
