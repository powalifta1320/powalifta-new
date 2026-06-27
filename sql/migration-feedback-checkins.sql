-- ===========================================================
-- POWALIFTA — Add coach feedback + weekly check-ins
-- Run this once in Supabase SQL Editor.
-- ===========================================================

-- 1) Add coach feedback columns to session_notes
ALTER TABLE session_notes
  ADD COLUMN IF NOT EXISTS coach_comment text,
  ADD COLUMN IF NOT EXISTS coach_comment_at timestamptz,
  ADD COLUMN IF NOT EXISTS coach_id uuid REFERENCES profiles(id);

-- 2) Allow the coach assigned to the athlete to UPDATE the comment fields
DROP POLICY IF EXISTS "session_notes_coach_update" ON session_notes;
CREATE POLICY "session_notes_coach_update" ON session_notes
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = session_notes.athlete_id
        AND p.coach_id = auth.uid()
    )
    OR is_admin()
  );

-- Also allow the coach to INSERT a note (in case the athlete hasn't created one yet,
-- the coach should still be able to leave feedback).
DROP POLICY IF EXISTS "session_notes_coach_insert" ON session_notes;
CREATE POLICY "session_notes_coach_insert" ON session_notes
  FOR INSERT WITH CHECK (
    -- athlete creating their own note (existing behavior)
    athlete_id = auth.uid()
    OR
    -- coach creating a note on behalf of their athlete
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = session_notes.athlete_id
        AND p.coach_id = auth.uid()
    )
    OR is_admin()
  );

-- Coach can also SELECT — they probably already have this via athlete relationship,
-- but ensure it explicitly.
DROP POLICY IF EXISTS "session_notes_coach_select" ON session_notes;
CREATE POLICY "session_notes_coach_select" ON session_notes
  FOR SELECT USING (
    athlete_id = auth.uid()
    OR
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = session_notes.athlete_id
        AND p.coach_id = auth.uid()
    )
    OR is_admin()
  );

-- ===========================================================
-- 3) Weekly check-ins
-- ===========================================================
CREATE TABLE IF NOT EXISTS checkins (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id  uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  week_start  date NOT NULL,
  sleep       int CHECK (sleep BETWEEN 1 AND 10),
  soreness    int CHECK (soreness BETWEEN 1 AND 10),
  stress      int CHECK (stress BETWEEN 1 AND 10),
  feel        int CHECK (feel BETWEEN 1 AND 10),
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, week_start)
);

ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "checkins_athlete_all" ON checkins;
CREATE POLICY "checkins_athlete_all" ON checkins
  FOR ALL USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

DROP POLICY IF EXISTS "checkins_coach_select" ON checkins;
CREATE POLICY "checkins_coach_select" ON checkins
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = checkins.athlete_id
        AND p.coach_id = auth.uid()
    )
    OR is_admin()
  );

-- Index for fast coach-side lookups
CREATE INDEX IF NOT EXISTS checkins_athlete_week_idx
  ON checkins (athlete_id, week_start DESC);

-- ===========================================================
-- Verification queries — uncomment to inspect after running
-- ===========================================================
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'session_notes' ORDER BY ordinal_position;
-- SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'checkins' ORDER BY ordinal_position;
-- SELECT polname FROM pg_policy WHERE polrelid IN ('session_notes'::regclass, 'checkins'::regclass);
