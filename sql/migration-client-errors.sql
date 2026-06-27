-- POWALIFTA migration: client_errors table
-- Run in Supabase SQL editor.
-- Stores client-side error reports from error-log.js / send-client-error edge fn.

create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  ts timestamptz not null,
  url text,
  ua text,
  msg text,
  stack text,
  src text,
  line int,
  col int,
  received_at timestamptz default now()
);

create index if not exists client_errors_received_at_idx
  on public.client_errors (received_at desc);

create index if not exists client_errors_kind_idx
  on public.client_errors (kind);

alter table public.client_errors enable row level security;

-- No public read or write. The send-client-error edge function uses
-- service_role to insert; you query via the admin SQL editor.
