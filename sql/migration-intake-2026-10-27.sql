-- migration-intake-2026-10-27.sql — POWALIFTA
-- The intake: the short questionnaire a lifter fills in when they join a coach (best lifts,
-- bodyweight and class, training history, schedule, equipment, injuries, goals, next meet, contact),
-- one row per lifter, the answers as one JSON object the coach reads.
--
-- Who sees it: the lifter (reads, writes and updates their own) and their CURRENT coach (reads only,
-- public.is_current_coach_of). Nobody else: not a previous coach, not another lifter. Nobody deletes
-- a row; it goes with the lifter's account (on delete cascade). coach_id records the coach the lifter
-- had when they last saved it, and the server sets it from profiles: a client can't file its intake
-- under another coach. When that coach's account goes, coach_id becomes null.
--
-- Run any time after migration-security-2026-10-22.sql (it needs public.is_current_coach_of): until
-- it runs, a lifter's answers stay on their own device and the app says so. Idempotent; one
-- transaction.
begin;

do $$
begin
  if to_regprocedure('public.is_current_coach_of(uuid)') is null then
    raise exception 'Run migration-security-2026-10-22.sql first: it creates public.is_current_coach_of(uuid).';
  end if;
end $$;

create table if not exists public.intake (
  athlete_id    uuid primary key references public.profiles(id) on delete cascade,
  coach_id      uuid references public.profiles(id) on delete set null,
  -- One JSON object, 8 KB at most (the questionnaire's answers are a few hundred bytes).
  answers       jsonb not null default '{}'::jsonb
                check (pg_column_size(answers) <= 8192 and jsonb_typeof(answers) = 'object'),
  submitted_at  timestamptz,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);
create index if not exists intake_coach_idx on public.intake (coach_id);

alter table public.intake enable row level security;

-- Read: the lifter, and the coach they have today.
drop policy if exists "intake_select" on public.intake;
create policy "intake_select" on public.intake
  for select to authenticated
  using (athlete_id = (select auth.uid()) or public.is_current_coach_of(athlete_id));

-- Write: the lifter, their own row only. (No delete policy and no delete grant: nobody deletes.)
drop policy if exists "intake_insert" on public.intake;
create policy "intake_insert" on public.intake
  for insert to authenticated
  with check (athlete_id = (select auth.uid()));

drop policy if exists "intake_update" on public.intake;
create policy "intake_update" on public.intake
  for update to authenticated
  using (athlete_id = (select auth.uid()))
  with check (athlete_id = (select auth.uid()));

-- The row stays the lifter's, its clocks are the server's, and coach_id is what profiles says.
-- SECURITY DEFINER so the lookup doesn't depend on profiles' read policies; it reads one column of
-- the row's own lifter and nothing else.
create or replace function public.intake_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.athlete_id := old.athlete_id;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  -- A null written over a coach is the on-delete-set-null of that coach's account going: keep it.
  -- Anything else is replaced with the lifter's coach as profiles has it right now.
  if not (tg_op = 'UPDATE' and new.coach_id is null and old.coach_id is not null) then
    new.coach_id := (select p.coach_id from public.profiles p where p.id = new.athlete_id);
  end if;
  -- "Submitted" is never in the future.
  if new.submitted_at is not null and new.submitted_at > now() then
    new.submitted_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_intake_guard on public.intake;
create trigger trg_intake_guard before insert or update on public.intake
  for each row execute function public.intake_guard();
-- A trigger function only: nobody calls it through the API (triggers fire without EXECUTE).
revoke all on function public.intake_guard() from public, anon, authenticated;

revoke all on public.intake from anon, authenticated;
grant select, insert, update on public.intake to authenticated;

commit;

-- Verify:
--   select count(*) from public.intake;
--   select policyname, cmd from pg_policies where tablename = 'intake' order by 1;   -- 3 rows
--   select tgname from pg_trigger where tgname = 'trg_intake_guard';
