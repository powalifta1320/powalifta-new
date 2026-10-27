-- Weekly progress digest (#19) — schedule the Monday cron.
--
-- This is the LAST step to make send-weekly-digest actually fire. The function
-- is already deployed (Verify JWT OFF) and gates itself on a shared CRON_SECRET,
-- so nothing can invoke it without the secret.
--
-- THREE STEPS, IN ORDER:
--   1. Generate a secret in your terminal:   openssl rand -hex 32
--   2. Supabase → Edge Functions → Secrets → add  CRON_SECRET = <that value>
--   3. Paste the SAME value into <CRON_SECRET> below, then run this file in
--      Supabase → SQL Editor.  (The secret lives in two places: the function's
--      env and this cron job's Authorization header — they must match.)
--
-- Runs Mondays and Thursdays 14:00 UTC (2026-10-28, coach alerts: was Mondays only, moved by
-- sql/cron-coach-alerts-2026-10-28.sql). The function picks its jobs by the UTC weekday: Monday →
-- the lifters' digest + the coaches' Monday report; Thursday → the coaches' missed-sessions push.
-- Athletes with zero sessions in the last 7 days are skipped by the function, so no "you did
-- nothing" emails go out.

-- pg_cron + pg_net are what schedule the job and make the outbound HTTP call.
-- Idempotent — safe to re-run.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Re-scheduling under the same name first unschedules any prior copy, so this
-- whole file is safe to run more than once.
select cron.unschedule('powa-weekly-digest')
where exists (select 1 from cron.job where jobname = 'powa-weekly-digest');

select cron.schedule(
  'powa-weekly-digest',
  '0 14 * * 1,4',                            -- Mondays + Thursdays 14:00 UTC (the function picks the job by weekday)
  $$
    select net.http_post(
      url     := 'https://cxnotrikxvzncupswvio.functions.supabase.co/send-weekly-digest',
      headers := jsonb_build_object(
                   'Content-Type', 'application/json',
                   'Authorization', 'Bearer ' || '<CRON_SECRET>'
                 ),
      body    := '{}'::jsonb
    );
  $$
);

-- ── Handy afterwards ────────────────────────────────────────────────────────
-- Confirm it's scheduled:
--   select jobname, schedule, active from cron.job where jobname = 'powa-weekly-digest';
-- See recent runs:
--   select * from cron.job_run_details order by start_time desc limit 5;
-- Remove it:
--   select cron.unschedule('powa-weekly-digest');
--
-- DRY RUN (nothing sent, written or minted — returns what would go out). From your
-- terminal, with the same secret; "job" picks one ('digest' | 'coach-report' | 'midweek'),
-- "today" (YYYY-MM-DD) the day it pretends to be (else today, UTC):
--   curl -X POST 'https://cxnotrikxvzncupswvio.functions.supabase.co/send-weekly-digest' \
--     -H 'Authorization: Bearer <CRON_SECRET>' \
--     -H 'Content-Type: application/json' \
--     -d '{"dryRun":true,"job":"coach-report"}'
-- An empty body on a day that isn't Monday or Thursday does nothing (it answers jobs: []).
