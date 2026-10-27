-- cron-coach-alerts-2026-10-28.sql — POWALIFTA. Coach alerts: run the weekly job on Thursdays too.
--
-- The 'powa-weekly-digest' cron job (sql/cron-weekly-digest.sql) calls send-weekly-digest every
-- Monday at 14:00 UTC. From the coach-alerts deploy on, that function picks its jobs by the UTC
-- weekday: Monday → the lifters' digest + the coaches' Monday report; Thursday → the missed-sessions
-- push to coaches. So the job now runs on Mondays AND Thursdays at 14:00 UTC.
--
-- Run it AFTER deploying send-weekly-digest with the coach jobs (a Thursday call to the old function
-- would send the lifters' digest a second time). Safe to run twice. It changes only the schedule:
-- the job's command (which holds the CRON_SECRET) is never read, selected or rewritten here.
select cron.alter_job(jobid, schedule := '0 14 * * 1,4')
from cron.job
where jobname = 'powa-weekly-digest';

-- Check (never select the command column: it holds the secret):
--   select jobname, schedule, active from cron.job where jobname = 'powa-weekly-digest';
--   → powa-weekly-digest | 0 14 * * 1,4 | t
-- After a Thursday, the run:
--   select status, return_message, start_time from cron.job_run_details
--   where jobid = (select jobid from cron.job where jobname = 'powa-weekly-digest')
--   order by start_time desc limit 3;
-- Back to Mondays only (the coach jobs then run Mondays only; the midweek push stops):
--   select cron.alter_job(jobid, schedule := '0 14 * * 1') from cron.job where jobname = 'powa-weekly-digest';
