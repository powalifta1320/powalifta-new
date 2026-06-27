-- ============================================================
-- POWALIFTA — Coach ↔ athlete direct messaging
--
-- A lightweight two-way thread between a coach and one of their athletes.
-- Distinct from `session_notes` (coach feedback pinned to a training day)
-- and `checkins` (weekly athlete form) — this is free-form back-and-forth.
--
-- Each row records the (coach_id, athlete_id) RELATIONSHIP pair plus the
-- `sender_id` (whichever of the two actually wrote it). That makes RLS a
-- simple membership check: you can see a message iff you are one of the two
-- people on the thread.
--
-- A message may only be INSERTed into a thread that reflects a REAL, live
-- coach→athlete link — enforced via an EXISTS against `profiles` (the
-- athlete row must carry coach_id = the thread's coach). Disconnecting an
-- athlete (coach_id = null) therefore stops new messages but preserves
-- history for both sides.
--
-- `read_at` (null = unread) drives the unread badge.
--
-- Run once in Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body        text NOT NULL CHECK (length(btrim(body)) > 0),
  created_at  timestamptz NOT NULL DEFAULT now(),
  read_at     timestamptz
);

CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(coach_id, athlete_id, created_at);
CREATE INDEX IF NOT EXISTS messages_athlete_idx ON messages(athlete_id);
CREATE INDEX IF NOT EXISTS messages_coach_idx   ON messages(coach_id);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Read: you must be one of the two people on the thread.
DROP POLICY IF EXISTS "msg_member_read" ON messages;
CREATE POLICY "msg_member_read" ON messages
  FOR SELECT TO authenticated
  USING (auth.uid() = coach_id OR auth.uid() = athlete_id);

-- Insert: you may only post AS yourself, into a thread you belong to, and
-- only while the coach→athlete link is live.
DROP POLICY IF EXISTS "msg_member_insert" ON messages;
CREATE POLICY "msg_member_insert" ON messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND (auth.uid() = coach_id OR auth.uid() = athlete_id)
    AND EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = messages.athlete_id
        AND p.coach_id = messages.coach_id
    )
  );

-- Update: either party may update rows on their thread (used to stamp
-- read_at when the recipient opens the thread).
DROP POLICY IF EXISTS "msg_member_update" ON messages;
CREATE POLICY "msg_member_update" ON messages
  FOR UPDATE TO authenticated
  USING (auth.uid() = coach_id OR auth.uid() = athlete_id)
  WITH CHECK (auth.uid() = coach_id OR auth.uid() = athlete_id);

-- Delete: you can remove your OWN message; admins can remove any.
DROP POLICY IF EXISTS "msg_sender_delete" ON messages;
CREATE POLICY "msg_sender_delete" ON messages
  FOR DELETE TO authenticated
  USING (sender_id = auth.uid() OR is_admin());

-- ============================================================
-- Verification after running:
--   SELECT polname, polcmd FROM pg_policy
--     WHERE polrelid = 'public.messages'::regclass;
--
-- Unread per user (recipient = the one who is NOT the sender):
--   SELECT count(*) FROM messages
--     WHERE read_at IS NULL AND sender_id <> '<your-uid>'
--       AND ('<your-uid>' IN (coach_id, athlete_id));
-- ============================================================
