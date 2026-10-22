-- migration-pain-reports-2026-10-22.sql — POWALIFTA (brief 4.1 + M2: pain flags)
-- "Something hurt": a lifter tells their coach where, which side, how bad and when, from the set
-- card or Finish session, in three taps. The coach sees it on the roster and the athlete sheet and
-- resolves it with a note.
--
--   pain_reports   one row per report. Health data (GDPR Art. 9): only the lifter and their
--                  CURRENT coach read it; deleting the account deletes the rows (cascade).
--
-- Column guards by role (trigger, nothing raises): the lifter writes what hurt (body part, side,
-- severity, phase, lift, set, note); the coach writes only the resolution (resolved_at,
-- resolved_by, coach_note). coach_id is filled from the lifter's profile at insert, never sent.
--
-- Run any time (the app hides the feature until it exists). Idempotent; one transaction.
begin;

-- 1 -----------------------------------------------------------------------------------
create table if not exists public.pain_reports (
  id           uuid primary key default gen_random_uuid(),
  athlete_id   uuid not null references public.profiles(id) on delete cascade,
  coach_id     uuid references public.profiles(id) on delete set null,
  day          date not null default current_date,          -- the lifter's local training day
  body_part    text not null check (body_part in ('neck', 'shoulder', 'elbow', 'wrist', 'chest', 'upper_back',
                                                  'low_back', 'hip', 'knee', 'ankle', 'other')),
  side         text check (side is null or side in ('left', 'right', 'both')),
  severity     smallint not null check (severity between 0 and 10),
  phase        text check (phase is null or phase in ('warmup', 'top', 'after', 'other')),
  lift         text check (lift is null or char_length(lift) <= 40),
  set_ref      jsonb check (set_ref is null or (jsonb_typeof(set_ref) = 'object' and length(set_ref::text) <= 600)),
  note         text check (note is null or char_length(note) <= 500),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles(id) on delete set null,
  coach_note   text check (coach_note is null or char_length(coach_note) <= 1000)
);
create index if not exists pain_reports_athlete_day on public.pain_reports (athlete_id, day desc);
alter table public.pain_reports enable row level security;

-- 2 -----------------------------------------------------------------------------------
drop policy if exists "pain_reports_athlete_read" on public.pain_reports;
create policy "pain_reports_athlete_read" on public.pain_reports
  for select to authenticated using (athlete_id = auth.uid());
drop policy if exists "pain_reports_athlete_insert" on public.pain_reports;
create policy "pain_reports_athlete_insert" on public.pain_reports
  for insert to authenticated with check (athlete_id = auth.uid());
drop policy if exists "pain_reports_athlete_update" on public.pain_reports;
create policy "pain_reports_athlete_update" on public.pain_reports
  for update to authenticated using (athlete_id = auth.uid()) with check (athlete_id = auth.uid());
drop policy if exists "pain_reports_athlete_delete" on public.pain_reports;
create policy "pain_reports_athlete_delete" on public.pain_reports
  for delete to authenticated using (athlete_id = auth.uid());

-- The lifter's current coach only (a coach they left reads nothing, old reports included).
drop policy if exists "pain_reports_coach_read" on public.pain_reports;
create policy "pain_reports_coach_read" on public.pain_reports
  for select to authenticated
  using (exists (select 1 from public.profiles p where p.id = pain_reports.athlete_id and p.coach_id = auth.uid()));
drop policy if exists "pain_reports_coach_update" on public.pain_reports;
create policy "pain_reports_coach_update" on public.pain_reports
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = pain_reports.athlete_id and p.coach_id = auth.uid()))
  with check (exists (select 1 from public.profiles p where p.id = pain_reports.athlete_id and p.coach_id = auth.uid()));

revoke all on public.pain_reports from anon;
grant select, insert, update, delete on public.pain_reports to authenticated;

-- 3 -----------------------------------------------------------------------------------
create or replace function public.pain_reports_guard() returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  -- The service role and the SQL editor are not guarded.
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.coach_id    := (select p.coach_id from public.profiles p where p.id = new.athlete_id);
    new.created_at  := now();
    new.updated_at  := now();
    new.resolved_at := null;
    new.resolved_by := null;
    new.coach_note  := null;
    if new.day is null or new.day > current_date + 1 or new.day < current_date - 14 then new.day := current_date; end if;
    return new;
  end if;
  -- UPDATE: who the row is about and when it was made never change.
  new.id := old.id; new.athlete_id := old.athlete_id; new.coach_id := old.coach_id;
  new.created_at := old.created_at; new.day := old.day;
  new.updated_at := now();
  if auth.uid() = old.athlete_id then
    -- The lifter: what hurt, not the coach's resolution.
    new.resolved_at := old.resolved_at; new.resolved_by := old.resolved_by; new.coach_note := old.coach_note;
  else
    -- The coach: only the resolution.
    new.body_part := old.body_part; new.side := old.side; new.severity := old.severity; new.phase := old.phase;
    new.lift := old.lift; new.set_ref := old.set_ref; new.note := old.note;
    -- The server's clock says when: resolving stamps now(), an already-resolved row keeps its time.
    new.resolved_at := case when new.resolved_at is null then null
                            when old.resolved_at is not null then old.resolved_at
                            else now() end;
    new.resolved_by := case when new.resolved_at is null then null
                            when old.resolved_at is not null and old.resolved_by is not null then old.resolved_by
                            else auth.uid() end;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_pain_reports_guard on public.pain_reports;
create trigger trg_pain_reports_guard before insert or update on public.pain_reports
  for each row execute function public.pain_reports_guard();

-- 4 -----------------------------------------------------------------------------------
-- The coach's roster updates live (Realtime, when the project has it). RLS still decides.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables
                      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pain_reports') then
    execute 'alter publication supabase_realtime add table public.pain_reports';
  end if;
end;
$$;

commit;

-- Verify (as a lifter: Train → the current exercise → Something hurt; the coach's roster shows it):
--   select count(*) from public.pain_reports;
