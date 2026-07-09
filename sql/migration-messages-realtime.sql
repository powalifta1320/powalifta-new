-- ============================================================
-- POWALIFTA — Live message threads (Supabase Realtime)
--
-- Turns coach ↔ athlete messaging from load-on-open into live: the client
-- opens a `postgres_changes` channel (see DB.subscribeMessages in db.js) and
-- new messages land in the open thread + light unread badges without a reload.
--
-- Realtime only streams changes for tables explicitly added to the
-- `supabase_realtime` publication. This adds `messages`. RLS still applies on
-- top — a subscriber receives a row only if their SELECT policy
-- (`msg_member_read`) would let them read it — so the existing membership
-- model carries over unchanged; no new policy is needed.
--
-- INSERT events always carry the full new row, so the client-side filters
-- (`athlete_id=eq.…`, `coach_id=eq.…`) and the coachId/dedupe rechecks work
-- as written. We only subscribe to INSERTs today.
--
-- REPLICA IDENTITY FULL is set so that if we later stream UPDATEs (e.g. live
-- read-receipts off `read_at`) the old/new row and column filters resolve
-- correctly. Harmless for the insert-only path we ship now.
--
-- Run once in Supabase SQL Editor, AFTER migration-messages.sql.
-- Idempotent: re-running is a no-op.
-- ============================================================

ALTER TABLE messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
END $$;

-- ============================================================
-- Verification after running:
--   SELECT tablename FROM pg_publication_tables
--     WHERE pubname = 'supabase_realtime' AND schemaname = 'public';
--   -- `messages` should appear in the list.
-- ============================================================
