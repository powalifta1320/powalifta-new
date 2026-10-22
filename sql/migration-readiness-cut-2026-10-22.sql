-- migration-readiness-cut-2026-10-22.sql — POWALIFTA (brief 4.2 / 4.3, milestone M7)
-- Readiness rest and the cut tracker: the one Apple Health change.
--
--   health_daily.hrv_ms                   heart rate variability (SDNN, ms), next to sleep and
--                                         resting HR; shared under the existing
--                                         share_health_with_coach (migration-health-2026-10-22.sql)
--   profiles.share_nutrition_with_coach   the lifter's separate choice for food data, off by default
--   nutrition_daily                       one row per lifter per day: kcal and protein (g) from
--                                         Apple Health. A day with no food data has NO row (the app
--                                         says "not logged", never 0 kcal)
--   goals.kcal_target, protein_g_target   daily targets the lifter (or the cut card) sets
--   goals.cut_by                          the date to make weight by (the meet)
--   goals.target_class                    the class limit in kg (83 = the 83 kg class)
--
-- nutrition_daily follows health_daily exactly: the lifter reads and writes their own rows only
-- while sharing is on; their current coach reads them only while sharing is on; turning sharing
-- off deletes them; moving to a new coach turns sharing off.
--
-- Run after migration-health-2026-10-22.sql. The app copes until then (no HRV column: it shares
-- sleep and HR as before; no nutrition table: the sharing switch says "after a quick update";
-- no goal columns: the cut card keeps the targets on this device). Idempotent; one transaction.
begin;

-- 1. HRV -----------------------------------------------------------------------------------
alter table public.health_daily add column if not exists hrv_ms numeric;
alter table public.health_daily drop constraint if exists health_daily_hrv_range;
alter table public.health_daily add constraint health_daily_hrv_range check (hrv_ms is null or hrv_ms between 1 and 500);

-- 2. Nutrition, behind its own switch --------------------------------------------------------
alter table public.profiles add column if not exists share_nutrition_with_coach boolean not null default false;

create table if not exists public.nutrition_daily (
  athlete_id  uuid not null references public.profiles(id) on delete cascade,
  day         date not null,
  kcal        int check (kcal is null or kcal between 0 and 20000),
  protein_g   numeric check (protein_g is null or protein_g between 0 and 1000),
  updated_at  timestamptz not null default now(),
  primary key (athlete_id, day),
  check (kcal is not null or protein_g is not null)
);
alter table public.nutrition_daily enable row level security;

drop policy if exists "nutrition_daily_athlete_read" on public.nutrition_daily;
create policy "nutrition_daily_athlete_read" on public.nutrition_daily
  for select to authenticated using (athlete_id = auth.uid());

drop policy if exists "nutrition_daily_athlete_insert" on public.nutrition_daily;
create policy "nutrition_daily_athlete_insert" on public.nutrition_daily
  for insert to authenticated
  with check (athlete_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.share_nutrition_with_coach));

drop policy if exists "nutrition_daily_athlete_update" on public.nutrition_daily;
create policy "nutrition_daily_athlete_update" on public.nutrition_daily
  for update to authenticated
  using (athlete_id = auth.uid())
  with check (athlete_id = auth.uid()
              and exists (select 1 from public.profiles p where p.id = auth.uid() and p.share_nutrition_with_coach));

drop policy if exists "nutrition_daily_athlete_delete" on public.nutrition_daily;
create policy "nutrition_daily_athlete_delete" on public.nutrition_daily
  for delete to authenticated using (athlete_id = auth.uid());

drop policy if exists "nutrition_daily_coach_read" on public.nutrition_daily;
create policy "nutrition_daily_coach_read" on public.nutrition_daily
  for select to authenticated
  using (exists (select 1 from public.profiles p
                  where p.id = nutrition_daily.athlete_id and p.coach_id = auth.uid() and p.share_nutrition_with_coach));

grant select, insert, update, delete on public.nutrition_daily to authenticated;

create or replace function public.nutrition_daily_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists trg_nutrition_daily_touch on public.nutrition_daily;
create trigger trg_nutrition_daily_touch before update on public.nutrition_daily
  for each row execute function public.nutrition_daily_touch();

-- A new coach: food sharing goes off too (the lifter chose to share with someone else).
create or replace function public.nutrition_share_reset_on_coach_change() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.coach_id is distinct from old.coach_id then
    new.share_nutrition_with_coach := false;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_nutrition_share_reset on public.profiles;
create trigger trg_nutrition_share_reset before update of coach_id on public.profiles
  for each row execute function public.nutrition_share_reset_on_coach_change();

-- Sharing off (whichever way): the rows go.
create or replace function public.nutrition_share_off_cleanup() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.share_nutrition_with_coach and not new.share_nutrition_with_coach then
    delete from public.nutrition_daily where athlete_id = new.id;
  end if;
  return null;
end;
$$;
drop trigger if exists trg_nutrition_share_off on public.profiles;
create trigger trg_nutrition_share_off after update on public.profiles
  for each row when (old.share_nutrition_with_coach is distinct from new.share_nutrition_with_coach)
  execute function public.nutrition_share_off_cleanup();
revoke all on function public.nutrition_share_off_cleanup() from public, anon, authenticated;

-- 3. The cut: targets on goals -------------------------------------------------------------
alter table public.goals add column if not exists kcal_target int;
alter table public.goals add column if not exists protein_g_target numeric;
alter table public.goals add column if not exists cut_by date;
alter table public.goals add column if not exists target_class numeric;
alter table public.goals drop constraint if exists goals_cut_ranges;
alter table public.goals add constraint goals_cut_ranges check (
      (kcal_target is null or kcal_target between 800 and 10000)
  and (protein_g_target is null or protein_g_target between 20 and 600)
  and (target_class is null or target_class between 30 and 250)
);

commit;

-- Verify:
--   select column_name from information_schema.columns where table_name = 'health_daily' and column_name = 'hrv_ms';
--   select to_regclass('public.nutrition_daily');
--   select column_name from information_schema.columns where table_name = 'goals' and column_name in ('kcal_target','protein_g_target','cut_by','target_class');
