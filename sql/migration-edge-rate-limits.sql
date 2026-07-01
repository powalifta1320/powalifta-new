-- ============================================================
-- migration-edge-rate-limits.sql  (#26)
--
-- Server-side rate limiting / abuse guards for the public edge functions.
--
-- WHY. Some edge functions are reachable WITHOUT a user session:
--   - send-client-error  (Verify JWT OFF) → writes a row to client_errors.
--     A scripted loop could flood the table (and the admin Errors tab).
--   - send-welcome       (Verify JWT OFF) → sends a branded email via Resend.
--     A loop could email-bomb a victim and burn Resend quota + domain rep.
-- The JWT-ON senders (send-invite / send-program-assigned / send-push) are
-- already gated on a real coach↔athlete link, but a logged-in caller can still
-- hammer them; a per-user ceiling caps the blast radius.
--
-- The client-side guardrails in error-log.js (per-session cap + dedupe) only
-- protect honest browsers — they do nothing against a curl loop. This is the
-- server-side backstop, shared by every function via _shared/rate-limit.ts.
--
-- WHAT. A single fixed-window counter table + one atomic SECURITY DEFINER
-- increment function (rl_bump). Same "service-role only, no browser policy"
-- shape as ai_chat_usage and client_errors: RLS is ON with NO policies, so
-- only the edge functions (service role) can touch it.
--
-- Idempotent — safe to re-run. Run any time (order-independent). Until it's
-- applied, rl_bump() simply doesn't exist and the helper FAILS OPEN (the
-- functions behave exactly as they do today), so deploying the function code
-- before this migration never breaks anything.
-- ============================================================

-- Fixed-window counters. One row per (bucket, identity, window_start).
--   bucket        = logical limiter name, e.g. 'welcome-ip', 'client-error'
--   identity      = the thing being limited: an IP, a user id, or an email
--   window_start  = epoch-aligned start of the current fixed window
--   count         = requests seen in this window
create table if not exists public.edge_rate_limits (
  bucket        text        not null,
  identity      text        not null,
  window_start  timestamptz not null,
  count         integer     not null default 0,
  primary key (bucket, identity, window_start)
);

alter table public.edge_rate_limits enable row level security;
-- Intentionally NO policies: only the service role (edge functions) reads/writes.
-- Anon / athlete / coach get nothing. There is no PII here — only a bucket
-- name, an opaque identity string (IP / uuid / email), and a counter.

-- Helps the optional GC below and any window-range scans.
create index if not exists edge_rate_limits_window_idx
  on public.edge_rate_limits (window_start);

-- ------------------------------------------------------------
-- rl_bump: atomically increment the current window's counter and report
-- whether the caller is still under the limit. One round-trip, race-free
-- (the UPSERT's `count = count + 1 RETURNING count` is atomic under
-- concurrency — no read-then-write gap).
--
--   p_bucket       logical limiter name
--   p_identity     IP / user id / email being limited
--   p_window_secs  window length in seconds (e.g. 60, 3600, 86400)
--   p_limit        max requests allowed per window
--
-- Returns one row: allowed (still under the cap AFTER this hit), cur (count
-- in this window), limit_val (echoes p_limit), reset_at (when the window rolls
-- over). The caller decides what to do with `allowed = false` (send 429).
-- ------------------------------------------------------------
create or replace function public.rl_bump(
  p_bucket text,
  p_identity text,
  p_window_secs integer,
  p_limit integer
)
returns table (allowed boolean, cur integer, limit_val integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  w_start timestamptz;
  new_count integer;
begin
  -- Guard against a zero/negative window (would divide-by-zero); default 60s.
  if p_window_secs is null or p_window_secs <= 0 then
    p_window_secs := 60;
  end if;

  -- Epoch-aligned start of the current fixed window.
  w_start := to_timestamp(floor(extract(epoch from now()) / p_window_secs) * p_window_secs);

  insert into public.edge_rate_limits (bucket, identity, window_start, count)
    values (p_bucket, p_identity, w_start, 1)
  on conflict (bucket, identity, window_start)
    do update set count = public.edge_rate_limits.count + 1
  returning count into new_count;

  allowed   := new_count <= p_limit;
  cur       := new_count;
  limit_val := p_limit;
  reset_at  := w_start + make_interval(secs => p_window_secs);
  return next;
end;
$$;

-- Only the service role should ever call this (the edge functions do). Revoke
-- the default PUBLIC execute grant so anon/authenticated can't poke the meter.
revoke all on function public.rl_bump(text, text, integer, integer) from public;
revoke all on function public.rl_bump(text, text, integer, integer) from anon;
revoke all on function public.rl_bump(text, text, integer, integer) from authenticated;

-- ------------------------------------------------------------
-- Optional hygiene: drop counter rows whose window is long gone, so the table
-- doesn't grow forever. Safe to skip; safe to call from a cron. Keeps a day.
-- Schedule (if you use pg_cron):
--   select cron.schedule('rl-gc-hourly', '7 * * * *', $$ select public.rl_gc(); $$);
-- ------------------------------------------------------------
create or replace function public.rl_gc()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.edge_rate_limits
  where window_start < now() - interval '24 hours';
$$;

revoke all on function public.rl_gc() from public;
revoke all on function public.rl_gc() from anon;
revoke all on function public.rl_gc() from authenticated;
