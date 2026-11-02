-- cron-coach-report-hourly-2026-11-02.sql — POWALIFTA. The weekly report at each coach's own time: run the job hourly.
--
-- Each coach picks when their report comes (Sunday evening or Monday morning, the hour, their time zone:
-- sql/migration-coach-report-schedule-2026-11-02.sql). The 'powa-weekly-digest' cron job (sql/cron-weekly-digest.sql)
-- so far called send-weekly-digest on Mondays and Thursdays at 14:00 UTC; from now on it calls it every hour, and
-- the function's hour-aware plan (coach-report.js jobPlan) decides what each run does:
--   the lifters' digest          Mondays at 14:00 UTC, as before
--   the missed-sessions push     Thursdays at 14:00 UTC, as before
--   the coaches' weekly report   every hour, only for the coaches it is due for (their day and hour where they are,
--                                the week not sent yet); with nobody due a run reads two small things and stops.
--
-- !! RUN THIS ONLY AFTER deploying send-weekly-digest from the coach-report-v2 branch. The function before it picks
-- !! its jobs by the UTC weekday alone: called hourly, it would send the lifters' digest and every coach's report
-- !! every hour on Mondays. Order: the two migrations (rows 63 and 64), the deploy, then this file.
--
-- It changes only the schedule: the job's command (which holds the CRON_SECRET) is never read, selected or rewritten
-- here. Safe to run twice. With no job of that name it stops with an error and changes nothing (schedule the job with
-- sql/cron-weekly-digest.sql first); it ends by showing the schedule it set.
do $$
declare
  v_id bigint;
  v_schedule text;
begin
  select j.jobid into v_id from cron.job j where j.jobname = 'powa-weekly-digest';
  if v_id is null then
    raise exception 'No cron job named powa-weekly-digest: schedule it with sql/cron-weekly-digest.sql (it runs hourly). Nothing was changed.';
  end if;
  perform cron.alter_job(v_id, schedule := '0 * * * *');
  select j.schedule into v_schedule from cron.job j where j.jobid = v_id;
  if v_schedule is distinct from '0 * * * *' then
    raise exception 'powa-weekly-digest still runs at "%", not hourly.', v_schedule;
  end if;
  raise notice 'powa-weekly-digest now runs at "%" (every hour).', v_schedule;
end $$;
select jobname, schedule, active from cron.job where jobname = 'powa-weekly-digest';

-- Check (never select the command column: it holds the secret):
--   select jobname, schedule, active from cron.job where jobname = 'powa-weekly-digest';
--   → powa-weekly-digest | 0 * * * * | t
-- The last runs (each one a few milliseconds when nobody is due):
--   select status, return_message, start_time, end_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'powa-weekly-digest')
--   order by start_time desc limit 5;
-- Back to the old schedule: redeploy the old function first (the new one, run only at 14:00 UTC on Mondays and
-- Thursdays, would miss every coach whose day and hour fall elsewhere), then:
--   select cron.alter_job(jobid, schedule := '0 14 * * 1,4') from cron.job where jobname = 'powa-weekly-digest';
--
-- A dry run of one hour, from your terminal with the secret ("now" pretends the time; nothing is sent or written):
--   curl -X POST 'https://cxnotrikxvzncupswvio.functions.supabase.co/send-weekly-digest' \
--     -H 'Authorization: Bearer <CRON_SECRET>' -H 'Content-Type: application/json' \
--     -d '{"dryRun":true,"now":"2026-11-08T18:00:00Z"}'
