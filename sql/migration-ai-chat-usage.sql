-- migration-ai-chat-usage.sql
--
-- Backs the per-user daily message cap for the AI assistant. The `ai-chat`
-- edge function (service role) reads and increments a row per user per UTC
-- day; if count >= AI_DAILY_CAP it returns 429 instead of calling Anthropic.
--
-- This table is touched ONLY by the edge function via the service role.
-- RLS is enabled with no policies, so the public anon/auth keys cannot read
-- or write it at all — the meter can't be tampered with from the client.

create table if not exists public.ai_chat_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  day     date not null default (timezone('utc', now()))::date,
  count   integer not null default 0,
  primary key (user_id, day)
);

alter table public.ai_chat_usage enable row level security;

-- No policies on purpose: only the service role (edge function) may touch it.
-- (Service role bypasses RLS; anon/auth keys get zero access.)

-- Optional housekeeping: drop usage rows older than 30 days. Safe to run
-- manually or wire to a scheduled job; nothing depends on the history.
-- delete from public.ai_chat_usage where day < (current_date - 30);
