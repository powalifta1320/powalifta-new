-- ============================================================
-- POWALIFTA — Self-coached athletes
-- Lets an athlete create + manage their own program (no coach required).
-- Run once in Supabase SQL Editor.
-- ============================================================

-- Self-coached athletes own their programs end-to-end (insert / update / delete / select).
-- Existing coach policies still cover the coach-controlled flow.
DROP POLICY IF EXISTS "programs_athlete_self_all" ON programs;
CREATE POLICY "programs_athlete_self_all" ON programs
  FOR ALL TO authenticated
  USING (athlete_id = auth.uid())
  WITH CHECK (athlete_id = auth.uid());

-- ============================================================
-- Verification queries — uncomment to inspect after running
-- ============================================================
-- SELECT polname, polcmd, qual::text AS using_, with_check::text AS check_
--   FROM pg_policy WHERE polrelid = 'programs'::regclass;
