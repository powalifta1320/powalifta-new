-- ============================================================
-- migration-notification-prefs.sql  (#30)
--
-- Per-user PUSH notification category preferences. Extends the existing
-- `email_preferences` table (already RLS-locked to its owner, upserted
-- client-side via DB.updateEmailPrefs) with three push toggles instead of
-- standing up a whole new table — same owner, same policies, one round-trip.
--
-- Semantics: absence / NULL / true  = opted IN (send).  Only an explicit
-- FALSE mutes that category. send-push reads the RECIPIENT's row via the
-- service role and skips a delivery whose `category` is switched off; if these
-- columns don't exist yet it FAILS OPEN and sends, so deploying the function
-- before OR after this migration is safe.
--
-- Run AFTER migration-email-preferences.sql (whichever migration created
-- `email_preferences`). Idempotent — safe to re-run.
-- ============================================================

alter table public.email_preferences
  add column if not exists push_messages    boolean not null default true,
  add column if not exists push_form_checks boolean not null default true,
  add column if not exists push_program     boolean not null default true;

comment on column public.email_preferences.push_messages    is 'Push: new coach<->athlete messages (#30). false = muted.';
comment on column public.email_preferences.push_form_checks is 'Push: coach reply on a form-check (#30). false = muted.';
comment on column public.email_preferences.push_program     is 'Push: program assigned / updated (#30). false = muted.';

-- No new RLS: rows inherit email_preferences'' own-row policies (owner reads +
-- upserts their own row; send-push reads any row via service role, which
-- bypasses RLS). The push_* columns are non-secret preference flags.
