-- migration-coach-report-schedule-2026-11-02.sql — POWALIFTA. Each coach picks when the weekly report comes.
-- STATUS-check.sql row 64.
--
-- The owner, 2 Nov (a poll): "Their pick, Sunday 6 pm default". A coach picks Sunday evening (that week, Monday to
-- the Sunday) or Monday morning (the week that ended the day before) and the hour, in their own time zone, in
-- Settings › Notifications. Four columns on their own email_preferences row:
--   report_day        'sun' | 'mon'                 default 'sun'
--   report_hour       0 to 23, their local hour     default 18
--   tz                an IANA time zone ('Europe/London'); null = UTC. The app saves the device's quietly when a
--                     coach opens it and the row has none or another one.
--   report_sent_week  the Monday of the week last reported: send-weekly-digest (now run hourly) sends a coach's
--                     report once their day and hour have come where they are, and never the same week twice.
-- The checks keep the values to what the job reads (a day, an hour, a zone-shaped name of at most 64 characters).
-- report_sent_week is the job's: a guard (guard_email_prefs_report_week) keeps it as it was on any write from a signed-in
-- user or anon, so nobody can clear it to have a week sent again; the service role (the job) and the SQL editor write it.
-- The cut-over, once, when this file adds the column: the old job sent every coach last week's report on Mondays at
-- 14:00 UTC and marked nothing, so every row starts with the week that run last sent (run on a Monday after 14:00 UTC:
-- last week; on a Monday before it: the week before; any other day: the week that Monday's run sent, last week). The
-- hourly job then never sends a week the old one already did. (powa.cutover_now, a test-only setting, pretends the
-- time; nothing in the app sets it.)
--
-- Who writes them: the row stays its owner's (emailprefs_own_read / _insert / _update: user_id = auth.uid(); row 55
-- merged them, the same rule) and the service role's (the job, the unsubscribe page). No new policy, no new grant:
-- a coach changes report_day, report_hour and tz on their own row and on no one else's; a signed-out visitor on none;
-- report_sent_week only the job. Row 60's two-factor policy covers the row as it covers the rest of it. Tested in
-- PGlite (test/coach-report-schedule-sql.test.mjs).
--
-- Adding a NOT NULL column with a constant default is instant on Postgres 11+ (no table rewrite). Idempotent: run it
-- twice, same result. One transaction.
-- The app and the job cope before this runs: the app shows the row as "available soon" (db.js reads the row with *),
-- and send-weekly-digest, missing these columns, keeps today's schedule: every coach's report on Mondays at 14:00
-- UTC (its hourly runs do nothing else until then).
-- Rollback (if ever needed; run cron-weekly-digest's old schedule first, see sql/cron-coach-report-hourly-2026-11-02.sql):
--   drop trigger if exists trg_guard_email_prefs_report_week on public.email_preferences;
--   drop function if exists public.guard_email_prefs_report_week();
--   alter table public.email_preferences drop column if exists report_sent_week, drop column if exists tz,
--     drop column if exists report_hour, drop column if exists report_day;
begin;

do $$
begin
  if to_regclass('public.email_preferences') is null then
    raise exception 'Run migration-email-preferences.sql first: public.email_preferences is missing. Nothing was changed.';
  end if;
end $$;

alter table public.email_preferences add column if not exists report_day text not null default 'sun';
alter table public.email_preferences add column if not exists report_hour smallint not null default 18;
alter table public.email_preferences add column if not exists tz text;

-- report_sent_week, and the cut-over mark the first time (a second run finds the column and changes nothing).
do $$
declare
  v_new boolean := not exists (select 1 from information_schema.columns
                                where table_schema = 'public' and table_name = 'email_preferences' and column_name = 'report_sent_week');
  v_now timestamp := coalesce(nullif(current_setting('powa.cutover_now', true), '')::timestamptz, now()) at time zone 'UTC';
  v_week date;
begin
  alter table public.email_preferences add column if not exists report_sent_week date;
  if v_new then
    -- The week the old job (Mondays, 14:00 UTC, last week) last sent: this week's Monday minus 7 days, or minus 14 on a
    -- Monday before 14:00 UTC (that day's run hasn't gone yet).
    v_week := date_trunc('week', v_now)::date - case when extract(isodow from v_now) = 1 and extract(hour from v_now) < 14 then 14 else 7 end;
    update public.email_preferences set report_sent_week = v_week where report_sent_week is null;
    raise notice 'report_sent_week: every row starts at % (the week the Monday 14:00 UTC job last sent)', v_week;
  end if;
end $$;

alter table public.email_preferences drop constraint if exists email_preferences_report_day_check;
alter table public.email_preferences add constraint email_preferences_report_day_check check (report_day in ('sun', 'mon'));
alter table public.email_preferences drop constraint if exists email_preferences_report_hour_check;
alter table public.email_preferences add constraint email_preferences_report_hour_check check (report_hour between 0 and 23);
alter table public.email_preferences drop constraint if exists email_preferences_tz_check;
alter table public.email_preferences add constraint email_preferences_tz_check
  check (tz is null or (char_length(tz) between 1 and 64 and tz ~ '^[A-Za-z0-9_+/-]+$'));

comment on column public.email_preferences.report_day is
  'The weekly report''s day (coaches): sun = Sunday evening, that week; mon = Monday morning, the week before. Default sun.';
comment on column public.email_preferences.report_hour is
  'The weekly report''s hour, 0 to 23, in tz. Default 18.';
comment on column public.email_preferences.tz is
  'The coach''s IANA time zone for the weekly report (the app saves the device''s). null = UTC.';
comment on column public.email_preferences.report_sent_week is
  'The Monday of the week last reported to this coach (send-weekly-digest): a week is never sent twice. Only the job writes it.';

-- The job's own: a signed-in user's or anon's write leaves report_sent_week as it was (a new row starts without one),
-- so no one can clear it to have a week sent again. The service role and the SQL editor pass. The same shape as the
-- other column guards (migration-billing-guard.sql, migration-coach-applications-2026-10-30.sql).
create or replace function public.guard_email_prefs_report_week()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('anon', 'authenticated') then return new; end if;
  if tg_op = 'INSERT' then
    new.report_sent_week := null;
  else
    new.report_sent_week := old.report_sent_week;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_email_prefs_report_week() from public, anon, authenticated;
drop trigger if exists trg_guard_email_prefs_report_week on public.email_preferences;
create trigger trg_guard_email_prefs_report_week
  before insert or update on public.email_preferences
  for each row execute function public.guard_email_prefs_report_week();

commit;

-- Verify:
--   select column_name, data_type, column_default, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'email_preferences' and column_name in ('report_day', 'report_hour', 'tz', 'report_sent_week');
--   select report_day, report_hour, tz, report_sent_week, count(*) from public.email_preferences group by 1, 2, 3, 4;
