-- migration-coach-alerts-2026-10-28.sql — POWALIFTA. Coach alerts and the Monday report.
--
-- 1. email_preferences.push_alerts: the coach's "PRs and missed sessions" switch (Settings ›
--    Notifications). It mutes the pushes with category 'alerts': a lifter's PR (sent by the lifter's
--    app through send-push), Thursday's missed-sessions push and the Monday summary push (both sent by
--    send-weekly-digest through _shared/push-deliver.ts). Absent / true = on; only false mutes, like
--    the other push_* columns. NOT NULL DEFAULT true is instant on Postgres 11+ (no table rewrite).
-- 2. public.coach_week_stats(athletes, from, to): one row per athlete id given, with
--      sessions  the distinct days they logged a set between from and to (inclusive),
--      lifts     per main lift { during: best e1rm_comp in the window, before: best before from },
--    for send-weekly-digest's Monday report and Thursday check, so the edge function never pages
--    through raw sets (PostgREST caps a read at 1000 rows). SECURITY DEFINER with an empty search_path;
--    only service_role may run it (the cron's edge function). Dates are compared as their
--    'YYYY-MM-DD' text, so a date, timestamp or text column all work and nothing can fail a cast.
--
-- Needs migration-email-preferences.sql (and migration-notification-prefs.sql for the other push
-- switches; not required). Idempotent: run it twice, same result. One transaction.
-- Rollback (if ever needed):
--   drop function if exists public.coach_week_stats(uuid[], date, date);
--   alter table public.email_preferences drop column if exists push_alerts;
-- The app copes before this runs: db.js drops push_alerts from a save and says the switch isn't on
-- yet; send-push fails open (sends) without the column; send-weekly-digest's coach jobs need
-- coach_week_stats and report "run the migration" without touching the lifters' digest.
-- STATUS-check.sql row 50.
begin;

do $$
begin
  if to_regclass('public.email_preferences') is null then
    raise exception 'Run migration-email-preferences.sql first: public.email_preferences is missing.';
  end if;
  if to_regclass('public.workout_logs') is null then
    raise exception 'public.workout_logs is missing: run this in the POWALIFTA project.';
  end if;
end $$;

-- 1 ---------------------------------------------------------------------------------------------
alter table public.email_preferences
  add column if not exists push_alerts boolean not null default true;
comment on column public.email_preferences.push_alerts is
  'Push: coach alerts, a lifter''s PR, Thursday''s missed sessions and the Monday summary (2026-10-28). false = muted.';
-- No new policy: the row keeps email_preferences' own-row RLS; send-push and the cron read it with
-- the service role.

-- 2 ---------------------------------------------------------------------------------------------
create or replace function public.coach_week_stats(p_athletes uuid[], p_from date, p_to date)
returns table (athlete_id uuid, sessions integer, lifts jsonb)
language sql
stable
security definer
set search_path = ''
as $$
  with ids as (
    select distinct a as athlete_id
    from unnest(coalesce(p_athletes, '{}'::uuid[])) as a
    where a is not null and p_from is not null and p_to is not null and p_from <= p_to
  ),
  logs as (
    select l.athlete_id, lower(l.lift::text) as lift, left(l.date::text, 10) as d, l.e1rm_comp::numeric as e
    from public.workout_logs l
    where l.athlete_id = any (p_athletes)
      and l.date is not null
      and left(l.date::text, 10) <= p_to::text
  ),
  per_athlete as (
    select logs.athlete_id, count(distinct logs.d) filter (where logs.d >= p_from::text) as n
    from logs
    group by logs.athlete_id
  ),
  per_lift as (
    select logs.athlete_id, logs.lift,
      max(logs.e) filter (where logs.d >= p_from::text) as during,
      max(logs.e) filter (where logs.d < p_from::text) as before
    from logs
    where logs.lift in ('squat', 'bench', 'deadlift') and logs.e > 0
    group by logs.athlete_id, logs.lift
  )
  select ids.athlete_id,
    coalesce(per_athlete.n, 0)::integer as sessions,
    coalesce((select jsonb_object_agg(pl.lift, jsonb_build_object('during', pl.during, 'before', pl.before))
              from per_lift pl where pl.athlete_id = ids.athlete_id), '{}'::jsonb) as lifts
  from ids
  left join per_athlete on per_athlete.athlete_id = ids.athlete_id;
$$;

comment on function public.coach_week_stats(uuid[], date, date) is
  'Monday report / Thursday check (send-weekly-digest): per athlete, distinct days logged in [from, to] and each main lift''s best e1rm_comp in and before the window. service_role only.';

-- Only the cron's edge function (service_role). New functions are executable by PUBLIC, and
-- Supabase grants anon / authenticated on everything in public: take all three away.
revoke all on function public.coach_week_stats(uuid[], date, date) from public, anon, authenticated;
grant execute on function public.coach_week_stats(uuid[], date, date) to service_role;

commit;

-- Verify:
--   select column_name, data_type, is_nullable, column_default from information_schema.columns
--     where table_schema = 'public' and table_name = 'email_preferences' and column_name = 'push_alerts';
--   select has_function_privilege('authenticated', 'public.coach_week_stats(uuid[], date, date)', 'execute');   -- false
--   select * from public.coach_week_stats(array[(select id from public.profiles where coach_id is not null limit 1)], current_date - 7, current_date - 1);
-- workout_logs reads by athlete_id: the app's own reads already rely on an index on it. If
--   select indexdef from pg_indexes where tablename = 'workout_logs';
-- shows none on athlete_id, add one in a separate run (not inside a transaction):
--   create index concurrently if not exists workout_logs_athlete_date_idx on public.workout_logs (athlete_id, date);
