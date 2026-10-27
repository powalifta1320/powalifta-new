-- migration-coach-settings-2026-10-28.sql — POWALIFTA
-- A coach's own settings, one row per coach: a small JSON object the app reads and writes by key.
-- First users: the progression rules (data.progression: "add 2.5 kg when the top set is RPE 8 or
-- less", read by next week's suggestions) and the roster capacity check. New settings are new keys
-- in data, never new columns.
--
-- Who sees a row: ONLY the coach it belongs to (coach_id = auth.uid() on every verb). Athletes,
-- other coaches and anon read nothing. Account deletion removes it (on delete cascade).
--
-- Run any time: until it runs, the app keeps a coach's settings on their own device
-- (localStorage 'powa-coach-settings-<coachId>') and moves them up on the first load after it.
-- Idempotent; one transaction. Undo (only if nothing reads it yet): drop table public.coach_settings;
begin;

create table if not exists public.coach_settings (
  coach_id    uuid primary key references public.profiles(id) on delete cascade,
  data        jsonb not null default '{}'::jsonb
              check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 16384),
  updated_at  timestamptz not null default now()
);

alter table public.coach_settings enable row level security;

-- One rule for every verb: the row is mine. (select auth.uid()) is evaluated once per statement.
drop policy if exists "coach_settings_select" on public.coach_settings;
create policy "coach_settings_select" on public.coach_settings
  for select to authenticated
  using (coach_id = (select auth.uid()));

drop policy if exists "coach_settings_insert" on public.coach_settings;
create policy "coach_settings_insert" on public.coach_settings
  for insert to authenticated
  with check (coach_id = (select auth.uid()));

drop policy if exists "coach_settings_update" on public.coach_settings;
create policy "coach_settings_update" on public.coach_settings
  for update to authenticated
  using (coach_id = (select auth.uid()))
  with check (coach_id = (select auth.uid()));

drop policy if exists "coach_settings_delete" on public.coach_settings;
create policy "coach_settings_delete" on public.coach_settings
  for delete to authenticated
  using (coach_id = (select auth.uid()));

-- A row can't move to another coach (an update or an upsert that names a new coach_id keeps the
-- old one), and its clock is the server's.
create or replace function public.coach_settings_guard()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.coach_id := old.coach_id;
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists trg_coach_settings_guard on public.coach_settings;
create trigger trg_coach_settings_guard before insert or update on public.coach_settings
  for each row execute function public.coach_settings_guard();

revoke all on public.coach_settings from anon;
grant select, insert, update, delete on public.coach_settings to authenticated;

commit;

-- Verify:
--   select count(*) from public.coach_settings;
--   select policyname from pg_policies where tablename = 'coach_settings';   -- 4 rows
