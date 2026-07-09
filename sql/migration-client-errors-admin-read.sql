-- ============================================================
-- migration-client-errors-admin-read.sql  (#25)
--
-- Lets the admin dashboard READ forwarded client errors.
--
-- `client_errors` (from migration-client-errors.sql) ships with RLS enabled
-- and NO policies, so only the service role (the send-client-error edge fn)
-- can insert and nobody can read from the browser. That means forwarded
-- errors were invisible unless you opened the Supabase SQL editor. This adds
-- a single admin-only SELECT policy so admin.html's Errors tab can list them.
--
-- Read-only for admins: no browser INSERT/UPDATE/DELETE policy is added, so
-- the only writer stays the service-role edge function. `is_admin()` is the
-- same SECURITY DEFINER gate every other migration uses (defined in the base
-- migrations); this file only depends on it, it does not redefine it.
--
-- Run AFTER migration-client-errors.sql. Idempotent — safe to re-run.
-- ============================================================

-- Belt-and-braces: the table may pre-date this file; make sure RLS is on.
alter table public.client_errors enable row level security;

drop policy if exists client_errors_admin_read on public.client_errors;
create policy client_errors_admin_read
  on public.client_errors
  for select
  using ( is_admin() );

-- Still NO browser insert/update/delete policy: writes remain service-role
-- only (send-client-error), reads remain admins only. Anon/athlete/coach get
-- nothing. The rows carry no PII beyond a UA string + the error text/stack the
-- app itself threw.
