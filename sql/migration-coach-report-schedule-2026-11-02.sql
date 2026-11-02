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
--
-- Who writes them: the row stays its owner's (emailprefs_own_read / _insert / _update: user_id = auth.uid(); row 55
-- merged them, the same rule) and the service role's (the job, the unsubscribe page). No new policy, no new grant:
-- a coach changes these on their own row and on no one else's; a signed-out visitor on none. The only trigger on the
-- table (touch_email_preferences) stamps updated_at and blocks nothing. Row 60's two-factor policy covers the row as
-- it covers the rest of it. Tested in PGlite (test/coach-report-schedule-sql.test.mjs).
--
-- Adding a NOT NULL column with a constant default is instant on Postgres 11+ (no table rewrite). Idempotent: run it
-- twice, same result. One transaction.
-- The app and the job cope before this runs: the app shows the row as "available soon" (db.js reads the row with *),
-- and send-weekly-digest, missing these columns, keeps today's schedule: every coach's report on Mondays at 14:00
-- UTC (its hourly runs do nothing else until then).
-- Rollback (if ever needed; run cron-weekly-digest's old schedule first, see sql/cron-coach-report-hourly-2026-11-02.sql):
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
alter table public.email_preferences add column if not exists report_sent_week date;

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
  'The Monday of the week last reported to this coach (send-weekly-digest): a week is never sent twice.';

commit;

-- Verify:
--   select column_name, data_type, column_default, is_nullable from information_schema.columns
--    where table_schema = 'public' and table_name = 'email_preferences' and column_name in ('report_day', 'report_hour', 'tz', 'report_sent_week');
--   select report_day, report_hour, tz, report_sent_week, count(*) from public.email_preferences group by 1, 2, 3, 4;
