-- migration-health-2026-10-22.sql — POWALIFTA (1.3, branch feat/apple-health)
-- Apple Health, the part that leaves the phone: a lifter may share last night's sleep and their
-- resting heart rate with their coach. Everything else from Apple Health stays on the phone
-- (weigh-ins become ordinary weigh-ins; workouts are written to Health, not read).
--
--   profiles.share_health_with_coach   the lifter's choice, off by default
--   health_daily                       one row per lifter per day: minutes asleep, resting HR
--
-- Who sees a row: the lifter, and their current coach while sharing is on. Nobody else.
-- Rows are written only while sharing is on. Turning sharing off deletes the lifter's rows, and
-- moving to another coach turns sharing off (the new coach is someone else: ask again).
--
-- Run any time (the app hides sharing until it exists). Idempotent; one transaction.
begin;

-- 1 -----------------------------------------------------------------------------------
alter table public.profiles add column if not exists share_health_with_coach boolean not null default false;

create table if not exists public.health_daily (
  athlete_id  uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  sleep_min   int check (sleep_min is null or sleep_min between 0 and 1440),
  rhr_bpm     numeric check (rhr_bpm is null or rhr_bpm between 20 and 250),
  updated_at  timestamptz not null default now(),
  primary key (athlete_id, day)
);
alter table public.health_daily enable row level security;

-- 2 -----------------------------------------------------------------------------------
drop policy if exists "health_daily_athlete_read" on public.health_daily;
create policy "health_daily_athlete_read" on public.health_daily
  for select to authenticated using (athlete_id = auth.uid());

drop policy if exists "health_daily_athlete_insert" on public.health_daily;
create policy "health_daily_athlete_insert" on public.health_daily
  for insert to authenticated
  with check (athlete_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.share_health_with_coach));

drop policy if exists "health_daily_athlete_update" on public.health_daily;
create policy "health_daily_athlete_update" on public.health_daily
  for update to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.share_health_with_coach));

drop policy if exists "health_daily_athlete_delete" on public.health_daily;
create policy "health_daily_athlete_delete" on public.health_daily
  for delete to authenticated using (athlete_id = auth.uid());

-- The current coach, only while the lifter shares.
drop policy if exists "health_daily_coach_read" on public.health_daily;
create policy "health_daily_coach_read" on public.health_daily
  for select to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = health_daily.athlete_id and p.coach_id = auth.uid() and p.share_health_with_coach));

grant select, insert, update, delete on public.health_daily to authenticated;

-- 3 -----------------------------------------------------------------------------------
create or replace function public.health_daily_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_health_daily_touch on public.health_daily;
create trigger trg_health_daily_touch before update on public.health_daily
  for each row execute function public.health_daily_touch();

-- A new coach: sharing goes off (the lifter chose to share with someone else).
create or replace function public.health_share_reset_on_coach_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.coach_id is distinct from old.coach_id then
    new.share_health_with_coach := false;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_health_share_reset on public.profiles;
create trigger trg_health_share_reset before update of coach_id on public.profiles
  for each row execute function public.health_share_reset_on_coach_change();

-- Sharing off: the rows go (whichever way it went off).
create or replace function public.health_share_off_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.share_health_with_coach and not new.share_health_with_coach then
    delete from public.health_daily where athlete_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_health_share_off on public.profiles;
create trigger trg_health_share_off after update on public.profiles
  for each row when (old.share_health_with_coach is distinct from new.share_health_with_coach)
  execute function public.health_share_off_cleanup();
revoke all on function public.health_share_off_cleanup() from public, anon, authenticated;

commit;

-- Verify (as a lifter in the app: You → Apple Health → share with your coach; the coach's
-- athlete page then shows Recovery):
--   select count(*) from public.health_daily;
