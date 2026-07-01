-- ============================================================
-- POWALIFTA — Email preferences (weekly digest opt-out + unsubscribe token)
--
-- One row per user holding their transactional-email choices. Backs
-- two features:
--   #19 Weekly progress email digest — `weekly_digest` gates whether the
--       scheduled `send-weekly-digest` edge function emails this athlete
--       their last-7-days recap.
--   #36 Email unsubscribe + preferences — `product_emails` gates the
--       marketing/announcement kind, and `unsub_token` powers a
--       one-click, unauthenticated unsubscribe link in every email footer
--       (resolved server-side by an `unsubscribe` edge function via the
--       service role — NOT via open RLS).
--
-- Defaults ON: a progress recap of your OWN training to your OWN account
-- is a service email, not cold marketing. The in-app toggle + the footer
-- link both make opting out one action.
--
-- RLS: a user sees/edits only THEIR OWN row. The digest + unsubscribe
-- functions read/write across users via the service role (bypasses RLS),
-- so the `unsub_token` is never exposed to other clients.
--
-- Run once in Supabase SQL Editor. Safe to re-run (idempotent).
-- ============================================================

CREATE TABLE IF NOT EXISTS email_preferences (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  weekly_digest  boolean NOT NULL DEFAULT true,
  product_emails boolean NOT NULL DEFAULT true,
  unsub_token    uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Token lookup path for the unsubscribe edge function (service role).
CREATE INDEX IF NOT EXISTS email_prefs_unsub_token_idx ON email_preferences(unsub_token);

ALTER TABLE email_preferences ENABLE ROW LEVEL SECURITY;

-- Read: only your own preferences.
DROP POLICY IF EXISTS "emailprefs_own_read" ON email_preferences;
CREATE POLICY "emailprefs_own_read" ON email_preferences
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Insert: you may only create the row for yourself. `unsub_token` is left
-- to its default so a client cannot pick a guessable/colliding token.
DROP POLICY IF EXISTS "emailprefs_own_insert" ON email_preferences;
CREATE POLICY "emailprefs_own_insert" ON email_preferences
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Update: toggle your own flags. `unsub_token` regeneration is not offered
-- to clients (kept stable so live email links keep working).
DROP POLICY IF EXISTS "emailprefs_own_update" ON email_preferences;
CREATE POLICY "emailprefs_own_update" ON email_preferences
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- No DELETE policy: rows are cleaned up by the auth.users ON DELETE CASCADE
-- when an account is erased (#33). Nothing else should remove them.

-- Keep updated_at fresh on any change.
CREATE OR REPLACE FUNCTION touch_email_preferences()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_email_preferences ON email_preferences;
CREATE TRIGGER trg_touch_email_preferences
  BEFORE UPDATE ON email_preferences
  FOR EACH ROW EXECUTE FUNCTION touch_email_preferences();

-- ============================================================
-- Optional backfill: give every existing profile a preferences row so the
-- digest job's opt-in read is a simple JOIN (missing row also = opted in,
-- but pre-seeding keeps the unsub_token ready for their first email).
-- ============================================================
INSERT INTO email_preferences (user_id)
SELECT id FROM profiles
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================
-- Verification after running:
--   SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid = 'public.email_preferences'::regclass;
--   SELECT count(*) FROM email_preferences;
-- ============================================================
